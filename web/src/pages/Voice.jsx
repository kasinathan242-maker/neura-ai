import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Ear, Mic, MicOff, Radio, Square, Volume2 } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, ErrorNote, Markdown, PageHeader, Panel } from '../components/ui';
import api from '../lib/api';
import {
    ContinuousRecogniser,
    DEFAULT_CONFIG,
    MicAnalyser,
    SentenceQueue,
    countRepeats,
    measureSpeechRate,
    pickVoice,
    speechRecognitionAvailable,
    speechSynthesisAvailable,
} from '../lib/voicePipeline';
import { useStore } from '../store/useStore';

/**
 * Hands-free voice conversation.
 *
 * The loop: recognise speech continuously → detect end of utterance → stream the
 * answer → speak each sentence as it completes → keep listening throughout so the
 * user can interrupt.
 *
 * Barge-in is the part that makes it feel like a conversation instead of a
 * walkie-talkie. While the assistant speaks, the mic analyser keeps running; a
 * few consecutive loud frames cancel the speech queue and abort the in-flight
 * request, and the user's new question is picked up immediately.
 */

const TONE_STYLES = {
    frustrated: { tone: 'bad', label: 'Sounds stuck — switching approach' },
    impatient: { tone: 'warn', label: 'Keeping it brief' },
    urgent: { tone: 'warn', label: 'Answer first' },
    'low-energy': { tone: 'neutral', label: 'Taking it gently' },
    engaged: { tone: 'good', label: 'Engaged' },
    neutral: { tone: 'neutral', label: 'Conversational' },
};

export const Voice = () => {
    const [listening, setListening] = useState(false);
    const [interim, setInterim] = useState('');
    const [turns, setTurns] = useState([]);
    const [thinking, setThinking] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [level, setLevel] = useState(0);
    const [userSpeaking, setUserSpeaking] = useState(false);
    const [tone, setTone] = useState('neutral');
    const [error, setError] = useState(null);
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [bargedIn, setBargedIn] = useState(false);

    const language = useStore((s) => s.language);
    const awardXp = useStore((s) => s.awardXp);

    const recogniserRef = useRef(null);
    const analyserRef = useRef(null);
    const queueRef = useRef(null);
    const abortRef = useRef(null);
    const turnsRef = useRef([]);
    const utteranceStartRef = useRef(0);
    const loudFramesRef = useRef(0);
    const busyRef = useRef(false);

    const supported = speechRecognitionAvailable();

    // Mirror `turns` into a ref so the recognition and audio callbacks -- which
    // are created once and never re-created -- can read the latest history
    // without being torn down on every turn. Assigning during render is what
    // React warns about; an effect runs after commit, which is correct.
    useEffect(() => {
        turnsRef.current = turns;
    }, [turns]);

    useEffect(() => {
        api.voiceConfig()
            .then((data) => {
                setConfig({
                    vad: {
                        speechThreshold: data.vad.speech_threshold,
                        silenceThreshold: data.vad.silence_threshold,
                        silenceMs: data.vad.silence_ms,
                        minSpeechMs: data.vad.min_speech_ms,
                        frameMs: data.vad.frame_ms,
                    },
                    bargeIn: {
                        enabled: data.barge_in.enabled,
                        threshold: data.barge_in.threshold,
                        consecutiveFrames: data.barge_in.consecutive_frames,
                    },
                    tts: data.tts,
                });
            })
            // Thresholds are only tuning; the built-in defaults are fine.
            .catch(() => {});
    }, []);

    const stopSpeaking = useCallback(() => {
        queueRef.current?.cancel();
        queueRef.current = null;
        setSpeaking(false);
    }, []);

    /** Cancel speech and the in-flight request so the user can take over. */
    const bargeIn = useCallback(() => {
        stopSpeaking();
        abortRef.current?.abort();
        abortRef.current = null;
        busyRef.current = false;
        setThinking(false);
        setBargedIn(true);
        setTimeout(() => setBargedIn(false), 1800);
    }, [stopSpeaking]);

    const respond = useCallback(
        async (transcript) => {
            if (!transcript.trim() || busyRef.current) return;
            busyRef.current = true;

            const durationMs = Date.now() - (utteranceStartRef.current || Date.now());
            const prosody = {
                energy: level,
                speechRate: measureSpeechRate(transcript, durationMs),
                repeatCount: countRepeats(transcript, turnsRef.current),
                interrupted: bargedIn,
                ...(analyserRef.current?.takeProsody() || {}),
            };

            const history = turnsRef.current
                .slice(-8)
                .map((turn) => ({ role: turn.role, content: turn.content }));

            setTurns((current) => [
                ...current,
                { id: `u${Date.now()}`, role: 'user', content: transcript },
                { id: `a${Date.now()}`, role: 'assistant', content: '', streaming: true },
            ]);
            setInterim('');
            setThinking(true);
            setError(null);

            const controller = new AbortController();
            abortRef.current = controller;

            if (speechSynthesisAvailable()) {
                const queue = new SentenceQueue({
                    lang: language,
                    voice: pickVoice(language),
                    rate: config.tts?.rate ?? 1.03,
                    pitch: config.tts?.pitch ?? 1.0,
                });
                queue.onStart = () => {
                    setSpeaking(true);
                    setThinking(false);
                    // Reset the detector so the assistant's first syllables cannot
                    // immediately register as an interruption.
                    loudFramesRef.current = 0;
                };
                queue.onEnd = () => setSpeaking(false);
                queueRef.current = queue;
            }

            const patchLast = (content, extra = {}) =>
                setTurns((current) =>
                    current.map((turn, index) =>
                        index === current.length - 1 ? { ...turn, content, ...extra } : turn,
                    ),
                );

            try {
                const { text, meta } = await api.voiceTurn(transcript, {
                    history,
                    prosody,
                    signal: controller.signal,
                    onMeta: (event) => {
                        if (event.type === 'tone' && event.tone) setTone(event.tone);
                    },
                    onDelta: (delta, full) => {
                        patchLast(full);
                        queueRef.current?.push(delta);
                    },
                });

                queueRef.current?.flush();
                patchLast(text, { streaming: false });
                if (meta?.error) setError(meta.error);
                if (text.trim()) awardXp(8, 'voice');
            } catch (err) {
                if (err?.name === 'AbortError' || controller.signal.aborted) {
                    patchLast(
                        turnsRef.current[turnsRef.current.length - 1]?.content || '(interrupted)',
                        { streaming: false, interrupted: true },
                    );
                } else {
                    setError(err.message);
                    patchLast('I could not reach the AI service.', { streaming: false, error: true });
                    stopSpeaking();
                }
            } finally {
                setThinking(false);
                busyRef.current = false;
                if (abortRef.current === controller) abortRef.current = null;
            }
        },
        [awardXp, bargedIn, config.tts, language, level, stopSpeaking],
    );

    const start = async () => {
        setError(null);

        if (!supported) {
            setError(
                'This browser has no Speech Recognition API. Chrome, Edge or Safari 14.1+ is required. ' +
                    'Text chat works everywhere.',
            );
            return;
        }

        const analyser = new MicAnalyser(config);
        try {
            await analyser.start(({ level: frameLevel, event }) => {
                setLevel(frameLevel);

                if (event === 'speech-start') {
                    setUserSpeaking(true);
                    utteranceStartRef.current = Date.now();
                } else if (event === 'speech-end') {
                    setUserSpeaking(false);
                }

                // Barge-in: sustained loudness while the assistant is talking.
                if (config.bargeIn.enabled && (queueRef.current?.isSpeaking || busyRef.current)) {
                    if (frameLevel * 0.35 > config.bargeIn.threshold) {
                        loudFramesRef.current += 1;
                        if (loudFramesRef.current >= config.bargeIn.consecutiveFrames) {
                            loudFramesRef.current = 0;
                            bargeIn();
                        }
                    } else {
                        loudFramesRef.current = 0;
                    }
                }
            });
            analyserRef.current = analyser;
        } catch (err) {
            setError(
                err?.name === 'NotAllowedError'
                    ? 'Microphone permission was denied. Allow it in your browser settings and try again.'
                    : err?.message || 'Could not open the microphone.',
            );
            return;
        }

        const recogniser = new ContinuousRecogniser({ lang: language, interim: true });
        recogniser.onResult = ({ transcript, isFinal }) => {
            if (isFinal) {
                respond(transcript);
            } else {
                setInterim(transcript);
            }
        };
        recogniser.onError = (message) => setError(message);
        recogniser.onStateChange = setListening;
        recogniser.start();
        recogniserRef.current = recogniser;
        setListening(true);
    };

    const stop = useCallback(() => {
        recogniserRef.current?.stop();
        recogniserRef.current = null;
        analyserRef.current?.stop();
        analyserRef.current = null;
        stopSpeaking();
        abortRef.current?.abort();
        abortRef.current = null;
        busyRef.current = false;
        setListening(false);
        setInterim('');
        setLevel(0);
        setUserSpeaking(false);
        setThinking(false);
    }, [stopSpeaking]);

    // Release the microphone when navigating away.
    useEffect(() => stop, [stop]);

    const toneInfo = TONE_STYLES[tone] || TONE_STYLES.neutral;

    return (
        <div className="animate-fade flex flex-col">
            <PageHeader
                title="Live Voice"
                subtitle="Talk naturally. Interrupt whenever you like — it stops and listens."
                badge={
                    listening ? (
                        <Badge tone="bad">
                            <Radio size={11} className="animate-pulse" /> Live
                        </Badge>
                    ) : (
                        <Badge>Idle</Badge>
                    )
                }
                actions={
                    <>
                        {listening && <Badge tone={toneInfo.tone}>{toneInfo.label}</Badge>}
                        {speaking && (
                            <Button variant="danger" size="sm" icon={Square} onClick={bargeIn}>
                                Interrupt
                            </Button>
                        )}
                        <Button
                            variant={listening ? 'danger' : 'primary'}
                            icon={listening ? MicOff : Mic}
                            onClick={listening ? stop : start}
                        >
                            {listening ? 'End session' : 'Start talking'}
                        </Button>
                    </>
                }
            />

            <ErrorNote error={error} className="mb-4" />

            {bargedIn && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm text-amber-300">
                    Interrupted — go ahead.
                </div>
            )}

            <Panel className="mb-4 p-5">
                {/* Live microphone level. 24 bars driven by real RMS, not randomness. */}
                <div className="mb-5 flex h-16 items-end justify-center gap-1">
                    {Array.from({ length: 24 }).map((_, index) => {
                        const distanceFromCentre = Math.abs(index - 11.5) / 11.5;
                        const shape = 1 - distanceFromCentre * 0.65;
                        const height = listening
                            ? Math.max(3, level * 58 * shape * (speaking ? 0.55 : 1))
                            : 3;
                        return (
                            <div
                                key={index}
                                className={clsx(
                                    'w-1.5 rounded-full transition-[height] duration-75',
                                    speaking
                                        ? 'bg-violet-400'
                                        : userSpeaking
                                          ? 'bg-[var(--accent)]'
                                          : 'bg-[var(--border-strong)]',
                                )}
                                style={{ height: `${height}px` }}
                            />
                        );
                    })}
                </div>

                <div className="text-app-muted flex flex-wrap items-center justify-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                        <Ear size={13} className={userSpeaking ? 'accent-text' : 'opacity-40'} />
                        {userSpeaking ? 'Hearing you' : 'Listening'}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Activity size={13} className={thinking ? 'accent-text animate-pulse' : 'opacity-40'} />
                        {thinking ? 'Thinking' : 'Idle'}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Volume2 size={13} className={speaking ? 'text-violet-400' : 'opacity-40'} />
                        {speaking ? 'Speaking' : 'Quiet'}
                    </span>
                </div>

                {interim && (
                    <p className="text-app-muted mt-4 text-center text-sm italic">“{interim}”</p>
                )}
            </Panel>

            <div className="flex-1 space-y-4">
                {turns.length === 0 ? (
                    <Panel className="p-8 text-center">
                        <Mic size={30} className="text-app-muted mx-auto mb-3 opacity-30" />
                        <p className="text-app font-medium">
                            {supported ? 'Press "Start talking" and just speak' : 'Voice needs Chrome, Edge or Safari'}
                        </p>
                        <p className="text-app-muted mx-auto mt-2 max-w-md text-sm">
                            {supported
                                ? 'It answers out loud, starting on the first sentence rather than waiting for the whole reply. Speak over it at any time to interrupt.'
                                : 'Your browser does not expose the Speech Recognition API. Everything else in the app works here.'}
                        </p>
                    </Panel>
                ) : (
                    turns.map((turn) => (
                        <div
                            key={turn.id}
                            className={clsx('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}
                        >
                            <div
                                className={clsx(
                                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                                    turn.role === 'user'
                                        ? 'bg-[var(--border-subtle)] text-app'
                                        : turn.error
                                          ? 'border border-red-500/30 bg-red-500/5 text-red-200'
                                          : 'surface',
                                )}
                            >
                                {turn.role === 'user' ? (
                                    turn.content
                                ) : (
                                    <Markdown
                                        text={turn.content || '…'}
                                        className={turn.streaming ? 'stream-caret' : ''}
                                    />
                                )}
                                {turn.interrupted && (
                                    <p className="text-app-muted mt-1.5 text-[11px] italic">interrupted</p>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Voice;

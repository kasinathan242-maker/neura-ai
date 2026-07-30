import React, { useEffect, useRef, useState } from 'react';
import { Boxes, Calculator, Camera, FileText, ScanText, Sparkles, Square, Volume2 } from 'lucide-react';
import clsx from 'clsx';
import { CameraCapture, CapturePreview } from '../components/CameraCapture';
import { Badge, Button, ErrorNote, Markdown, PageHeader, Panel, TextInput } from '../components/ui';
import SceneRenderer from '../components/SceneRenderer';
import api from '../lib/api';
import { SentenceQueue, pickVoice, speechSynthesisAvailable } from '../lib/voicePipeline';
import { useStore } from '../store/useStore';

/**
 * Point the camera at a problem and get a streamed, spoken explanation.
 *
 * The answer streams token by token and is read aloud sentence by sentence, so
 * speech starts within about a second of the first token rather than after the
 * whole response has been generated.
 */

const MODES = [
    { id: 'solve', label: 'Solve it', icon: Calculator, hint: 'Handwritten maths, physics or chemistry problems' },
    { id: 'explain', label: 'Explain it', icon: Sparkles, hint: 'Teach me what this shows' },
    { id: 'extract', label: 'Transcribe', icon: ScanText, hint: 'Pull out text and formulas verbatim' },
    { id: 'diagram', label: 'Break down', icon: FileText, hint: 'Label the parts of a diagram' },
];

export const Vision = () => {
    const [blob, setBlob] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [mode, setMode] = useState('solve');
    const [prompt, setPrompt] = useState('');
    const [answer, setAnswer] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [scene, setScene] = useState(null);
    const [sceneBusy, setSceneBusy] = useState(false);
    const [speaking, setSpeaking] = useState(false);

    const health = useStore((s) => s.health);
    const speakByDefault = useStore((s) => s.settings.voiceResponses);
    const language = useStore((s) => s.language);
    const awardXp = useStore((s) => s.awardXp);

    const queueRef = useRef(null);
    const abortRef = useRef(null);
    const objectUrlRef = useRef(null);

    const visionReady = health ? health.active_provider !== 'offline' : true;

    // Revoke the previous preview URL whenever it changes, and on unmount, or
    // each capture leaks a blob for the lifetime of the page.
    useEffect(() => {
        objectUrlRef.current = previewUrl;
        return () => {
            if (objectUrlRef.current && objectUrlRef.current !== previewUrl) {
                URL.revokeObjectURL(objectUrlRef.current);
            }
        };
    }, [previewUrl]);

    useEffect(
        () => () => {
            queueRef.current?.cancel();
            abortRef.current?.abort();
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        },
        [],
    );

    const stopSpeaking = () => {
        queueRef.current?.cancel();
        queueRef.current = null;
        setSpeaking(false);
    };

    const handleCapture = (captured, url) => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setBlob(captured);
        setPreviewUrl(url);
        setAnswer('');
        setScene(null);
        setError(null);
    };

    const clearCapture = () => {
        stopSpeaking();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setBlob(null);
        setPreviewUrl(null);
        setAnswer('');
        setScene(null);
    };

    const analyse = async ({ speak = speakByDefault } = {}) => {
        if (!blob || busy) return;

        stopSpeaking();
        setBusy(true);
        setError(null);
        setAnswer('');
        setScene(null);

        const controller = new AbortController();
        abortRef.current = controller;

        if (speak && speechSynthesisAvailable()) {
            const queue = new SentenceQueue({ lang: language, voice: pickVoice(language) });
            queue.onStart = () => setSpeaking(true);
            queue.onEnd = () => setSpeaking(false);
            queueRef.current = queue;
        }

        try {
            const { text, meta } = await api.analyzeImageStream(blob, {
                prompt,
                mode,
                signal: controller.signal,
                onDelta: (delta, full) => {
                    setAnswer(full);
                    queueRef.current?.push(delta);
                },
            });

            queueRef.current?.flush();

            if (meta?.error) setError(meta.error);
            if (!text.trim()) {
                setError('The model returned an empty response. Try a clearer photo or a different mode.');
            } else {
                awardXp(15, 'vision');
            }
        } catch (err) {
            if (err?.name !== 'AbortError') setError(err.message);
            stopSpeaking();
        } finally {
            setBusy(false);
            abortRef.current = null;
        }
    };

    const buildScene = async () => {
        if (!answer.trim() || sceneBusy) return;
        setSceneBusy(true);
        setError(null);
        try {
            const result = await api.generateScene(
                prompt || 'the subject of the analysed image',
                answer.slice(0, 1500),
            );
            setScene(result.scene);
        } catch (err) {
            setError(err.message);
        } finally {
            setSceneBusy(false);
        }
    };

    const activeMode = MODES.find((m) => m.id === mode);

    return (
        <div className="animate-fade">
            <PageHeader
                title="Vision"
                subtitle="Show NEURA a problem instead of typing it out."
                badge={
                    visionReady ? (
                        <Badge tone="accent">
                            <Camera size={11} /> Camera ready
                        </Badge>
                    ) : (
                        <Badge tone="warn">No vision model</Badge>
                    )
                }
                actions={
                    speaking ? (
                        <Button variant="danger" icon={Square} onClick={stopSpeaking}>
                            Stop speaking
                        </Button>
                    ) : null
                }
            />

            {!visionReady && (
                <Panel className="mb-6 border-amber-500/30 bg-amber-500/5 p-4">
                    <p className="text-app text-sm font-medium">Vision needs a multimodal model</p>
                    <p className="text-app-muted mt-1 text-sm">
                        Locally, run <code className="accent-text">ollama pull llava</code> and restart the
                        backend. On a deployment, set <code className="accent-text">LLM_API_KEY</code> plus a
                        vision-capable <code className="accent-text">LLM_VISION_MODEL</code>. You can still
                        capture images now — analysis will start working the moment a model is configured.
                    </p>
                </Panel>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                    {previewUrl ? (
                        <CapturePreview url={previewUrl} onClear={clearCapture} onRetry={() => analyse()}>
                            <div className="flex flex-wrap gap-2">
                                <Button icon={Sparkles} onClick={() => analyse()} loading={busy}>
                                    {busy ? 'Analysing…' : 'Analyse'}
                                </Button>
                                {speechSynthesisAvailable() && (
                                    <Button
                                        variant="ghost"
                                        icon={Volume2}
                                        onClick={() => analyse({ speak: true })}
                                        disabled={busy}
                                    >
                                        Analyse and speak
                                    </Button>
                                )}
                            </div>
                        </CapturePreview>
                    ) : (
                        <CameraCapture onCapture={handleCapture} hint={activeMode?.hint} />
                    )}

                    <Panel className="p-4">
                        <p className="text-app-muted mb-2 text-xs font-semibold uppercase tracking-wider">
                            What should I do with it?
                        </p>
                        <div className="mb-3 grid grid-cols-2 gap-2">
                            {MODES.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setMode(item.id)}
                                    className={clsx(
                                        'focus-ring flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all',
                                        mode === item.id
                                            ? 'accent-bg accent-text'
                                            : 'border-app text-app-muted hover:text-app border',
                                    )}
                                >
                                    <item.icon size={15} className="shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                </button>
                            ))}
                        </div>
                        <TextInput
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            placeholder="Optional: add a specific question about the image"
                        />
                    </Panel>
                </div>

                <div className="space-y-4">
                    <ErrorNote error={error} onRetry={blob ? () => analyse() : undefined} />

                    <Panel className="min-h-64 p-5">
                        {answer ? (
                            <>
                                <div className="mb-3 flex items-center justify-between">
                                    <Badge tone="accent">{activeMode?.label}</Badge>
                                    {busy && (
                                        <span className="text-app-muted text-xs">streaming…</span>
                                    )}
                                </div>
                                <Markdown text={answer} className={busy ? 'stream-caret' : ''} />

                                {!busy && (
                                    <div className="border-app mt-5 flex flex-wrap gap-2 border-t pt-4">
                                        <Button
                                            variant="ghost"
                                            icon={Boxes}
                                            onClick={buildScene}
                                            loading={sceneBusy}
                                        >
                                            Visualise in 3D
                                        </Button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-app-muted flex h-full min-h-52 flex-col items-center justify-center gap-3 text-center text-sm">
                                <Camera size={30} className="opacity-30" />
                                <p className="max-w-xs">
                                    Capture or upload an image, pick a mode, then press Analyse. The answer
                                    streams in and can be read aloud as it arrives.
                                </p>
                            </div>
                        )}
                    </Panel>

                    {scene && (
                        <Panel className="overflow-hidden">
                            <div className="border-app border-b px-4 py-2.5">
                                <p className="text-app text-sm font-semibold">{scene.title}</p>
                                {scene.description && (
                                    <p className="text-app-muted mt-0.5 text-xs">{scene.description}</p>
                                )}
                            </div>
                            <SceneRenderer scene={scene} className="h-72 w-full" enableXR={false} />
                        </Panel>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Vision;

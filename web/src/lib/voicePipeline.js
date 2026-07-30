/**
 * Low-latency duplex voice: listen, think and speak with overlap.
 *
 * How the latency is actually reduced. A naive pipeline waits for the whole
 * answer, then speaks it, so the user hears nothing for several seconds. Here:
 *
 *   1. Speech recognition emits interim results, so we know the user has stopped
 *      talking without waiting for a final network round-trip.
 *   2. The answer streams token by token over SSE.
 *   3. `SentenceQueue` speaks each sentence the moment it is complete, so audio
 *      begins while the rest of the answer is still being generated.
 *   4. A WebAudio analyser keeps monitoring the mic *while* the assistant talks.
 *      If the user starts speaking, TTS is cancelled and the in-flight request is
 *      aborted — graceful barge-in.
 *
 * This is a streaming-HTTP pipeline, not a WebRTC peer connection. WebRTC would
 * only help if a speech-to-speech model sat on the other end; with a text LLM in
 * the middle the wins come from chunking and barge-in, both of which work over
 * plain HTTP and need no media server.
 *
 * Prosody (energy, pitch variance, speech rate) is measured locally and sent to
 * the API, which maps it onto a tutoring tone. These are heuristics over audio
 * features, not a trained affect classifier — see `prompts.tone_directive`.
 */

export const DEFAULT_CONFIG = {
    vad: {
        speechThreshold: 0.045,
        silenceThreshold: 0.02,
        silenceMs: 900,
        minSpeechMs: 250,
        frameMs: 50,
    },
    bargeIn: { enabled: true, threshold: 0.075, consecutiveFrames: 3 },
    tts: { rate: 1.03, pitch: 1.0 },
};

export function speechRecognitionAvailable() {
    return (
        typeof window !== 'undefined' &&
        Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
    );
}

export function speechSynthesisAvailable() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// --------------------------------------------------------------------------- //
// Microphone analysis
// --------------------------------------------------------------------------- //

/**
 * Wraps getUserMedia + an AnalyserNode to produce per-frame loudness and pitch.
 * Used for the level meter, the voice-activity detector and barge-in detection.
 */
export class MicAnalyser {
    constructor(config = DEFAULT_CONFIG) {
        this.config = config;
        this.stream = null;
        this.context = null;
        this.analyser = null;
        this.timeData = null;
        this.raf = 0;
        this.running = false;
        this.onFrame = null;

        this._speechFrames = 0;
        this._silenceFrames = 0;
        this._speaking = false;
        this._pitchSamples = [];
    }

    async start(onFrame) {
        this.onFrame = onFrame;

        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                // Keeps the assistant's own voice out of the barge-in detector.
                autoGainControl: true,
            },
        });

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.context = new AudioCtx();
        // Autoplay policies can leave a fresh context suspended.
        if (this.context.state === 'suspended') await this.context.resume();

        const source = this.context.createMediaStreamSource(this.stream);
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.6;
        source.connect(this.analyser);

        this.timeData = new Float32Array(this.analyser.fftSize);
        this.running = true;
        this._loop();
    }

    _loop() {
        if (!this.running) return;

        this.analyser.getFloatTimeDomainData(this.timeData);

        let sumSquares = 0;
        for (let i = 0; i < this.timeData.length; i += 1) {
            sumSquares += this.timeData[i] * this.timeData[i];
        }
        const rms = Math.sqrt(sumSquares / this.timeData.length);

        const { vad } = this.config;
        const framesPerSilence = Math.max(1, Math.round(vad.silenceMs / vad.frameMs));
        const framesPerSpeech = Math.max(1, Math.round(vad.minSpeechMs / vad.frameMs));

        let event = null;
        if (rms > vad.speechThreshold) {
            this._speechFrames += 1;
            this._silenceFrames = 0;
            const pitch = this._estimatePitch();
            if (pitch) this._pitchSamples.push(pitch);
            if (!this._speaking && this._speechFrames >= framesPerSpeech) {
                this._speaking = true;
                event = 'speech-start';
            }
        } else if (rms < vad.silenceThreshold) {
            this._silenceFrames += 1;
            if (this._speaking && this._silenceFrames >= framesPerSilence) {
                this._speaking = false;
                this._speechFrames = 0;
                event = 'speech-end';
            }
        }

        this.onFrame?.({
            rms,
            // Normalised roughly to 0..1 for meters; 0.35 RMS is already loud.
            level: Math.min(1, rms / 0.35),
            speaking: this._speaking,
            event,
        });

        this.raf = requestAnimationFrame(() => this._loop());
    }

    /**
     * Autocorrelation pitch estimate over the 80–400 Hz band.
     * Cheap and noisy, but the *variance* across a turn is a usable signal even
     * when individual estimates are rough.
     */
    _estimatePitch() {
        const data = this.timeData;
        const sampleRate = this.context.sampleRate;
        const minLag = Math.floor(sampleRate / 400);
        const maxLag = Math.floor(sampleRate / 80);

        let bestLag = -1;
        let bestScore = 0;

        for (let lag = minLag; lag <= maxLag; lag += 1) {
            let score = 0;
            for (let i = 0; i < data.length - lag; i += 2) {
                score += data[i] * data[i + lag];
            }
            score /= (data.length - lag) / 2;
            if (score > bestScore) {
                bestScore = score;
                bestLag = lag;
            }
        }

        if (bestLag <= 0 || bestScore < 0.002) return null;
        return sampleRate / bestLag;
    }

    /** Prosody summary for the turn, then reset for the next one. */
    takeProsody() {
        const samples = this._pitchSamples;
        this._pitchSamples = [];

        if (samples.length < 4) return { pitchVariance: 0.5 };

        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance =
            samples.reduce((total, value) => total + (value - mean) ** 2, 0) / samples.length;
        const deviation = Math.sqrt(variance);

        return {
            pitchHz: Math.round(mean),
            // A ~60 Hz standard deviation is already very expressive speech.
            pitchVariance: Math.min(1, deviation / 60),
        };
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.stream?.getTracks().forEach((track) => track.stop());
        this.context?.close().catch(() => {});
        this.stream = null;
        this.context = null;
        this.analyser = null;
    }
}

// --------------------------------------------------------------------------- //
// Sentence-chunked speech synthesis
// --------------------------------------------------------------------------- //

/**
 * Speaks text as it arrives, one sentence at a time.
 *
 * This is what makes the assistant feel instant: the first sentence is spoken
 * while the rest of the answer is still streaming in.
 */
export class SentenceQueue {
    constructor({ rate = 1.03, pitch = 1.0, voice = null, lang = 'en-US' } = {}) {
        this.rate = rate;
        this.pitch = pitch;
        this.voice = voice;
        this.lang = lang;
        this.buffer = '';
        this.queue = [];
        this.speaking = false;
        this.cancelled = false;
        this.onStart = null;
        this.onEnd = null;
    }

    /** Feed a streamed delta; complete sentences are spoken immediately. */
    push(delta) {
        if (this.cancelled) return;
        this.buffer += delta;

        // Split on sentence-final punctuation followed by whitespace. The
        // lookbehind keeps the punctuation with its sentence.
        const parts = this.buffer.split(/(?<=[.!?…])\s+/);
        if (parts.length > 1) {
            this.buffer = parts.pop();
            parts
                .map((part) => part.trim())
                .filter(Boolean)
                .forEach((sentence) => this._enqueue(sentence));
        } else if (this.buffer.length > 220) {
            // A very long clause with no terminator would otherwise never be
            // spoken; break at the last comma or space instead.
            const cut = Math.max(this.buffer.lastIndexOf(', '), this.buffer.lastIndexOf(' '));
            if (cut > 80) {
                this._enqueue(this.buffer.slice(0, cut).trim());
                this.buffer = this.buffer.slice(cut).trim();
            }
        }
    }

    /** Speak whatever is left after the stream ends. */
    flush() {
        const tail = this.buffer.trim();
        this.buffer = '';
        if (tail) this._enqueue(tail);
    }

    _enqueue(sentence) {
        if (this.cancelled || !speechSynthesisAvailable()) return;
        const clean = sentence
            // Strip markdown that would otherwise be read out as punctuation.
            .replace(/[*_`#>]/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .trim();
        if (!clean) return;

        this.queue.push(clean);
        if (!this.speaking) this._next();
    }

    _next() {
        if (this.cancelled) return;
        const sentence = this.queue.shift();
        if (!sentence) {
            this.speaking = false;
            this.onEnd?.();
            return;
        }

        this.speaking = true;
        this.onStart?.(sentence);

        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.rate = this.rate;
        utterance.pitch = this.pitch;
        utterance.lang = this.lang;
        if (this.voice) utterance.voice = this.voice;

        utterance.onend = () => this._next();
        // Never leave the queue wedged if one utterance fails.
        utterance.onerror = () => this._next();

        window.speechSynthesis.speak(utterance);
    }

    cancel() {
        this.cancelled = true;
        this.queue = [];
        this.buffer = '';
        this.speaking = false;
        if (speechSynthesisAvailable()) {
            try {
                window.speechSynthesis.cancel();
            } catch { /* nothing queued */ }
        }
    }

    get isSpeaking() {
        return this.speaking;
    }
}

// --------------------------------------------------------------------------- //
// Speech recognition
// --------------------------------------------------------------------------- //

/**
 * Continuous speech recognition with automatic restart.
 *
 * The Web Speech API stops on its own after a pause and after certain errors, so
 * a long conversation needs deliberate restarting. `wantsToRun` distinguishes an
 * intentional stop from an incidental one, which the previous wake-word
 * implementation got wrong — it restarted even after the user had turned it off.
 */
export class ContinuousRecogniser {
    constructor({ lang = 'en-US', interim = true } = {}) {
        this.lang = lang;
        this.interim = interim;
        this.recognition = null;
        this.wantsToRun = false;
        this.restartTimer = null;
        this.onResult = null;
        this.onError = null;
        this.onStateChange = null;
    }

    start() {
        if (!speechRecognitionAvailable()) {
            this.onError?.('This browser has no Speech Recognition. Chrome or Edge is required.');
            return false;
        }
        this.wantsToRun = true;
        this._spawn();
        return true;
    }

    _spawn() {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new Recognition();
        recognition.continuous = true;
        recognition.interimResults = this.interim;
        recognition.lang = this.lang;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            let interimText = '';
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const result = event.results[i];
                const transcript = result[0].transcript;
                if (result.isFinal) {
                    this.onResult?.({ transcript: transcript.trim(), isFinal: true });
                } else {
                    interimText += transcript;
                }
            }
            if (interimText) {
                this.onResult?.({ transcript: interimText.trim(), isFinal: false });
            }
        };

        recognition.onerror = (event) => {
            // `no-speech` and `aborted` are routine during a conversation and
            // should not surface as errors to the user.
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                this.wantsToRun = false;
                this.onError?.('Microphone permission was denied. Allow it in your browser settings.');
                return;
            }
            this.onError?.(`Speech recognition error: ${event.error}`);
        };

        recognition.onend = () => {
            this.onStateChange?.(false);
            if (!this.wantsToRun) return;
            // Small delay: restarting synchronously inside onend throws.
            this.restartTimer = setTimeout(() => {
                if (!this.wantsToRun) return;
                try {
                    recognition.start();
                    this.onStateChange?.(true);
                } catch {
                    this._spawn();
                }
            }, 250);
        };

        this.recognition = recognition;
        try {
            recognition.start();
            this.onStateChange?.(true);
        } catch (error) {
            this.onError?.(error?.message || 'Could not start the microphone.');
        }
    }

    stop() {
        this.wantsToRun = false;
        clearTimeout(this.restartTimer);
        try {
            this.recognition?.abort();
        } catch { /* not started */ }
        this.recognition = null;
        this.onStateChange?.(false);
    }
}

// --------------------------------------------------------------------------- //
// Helpers
// --------------------------------------------------------------------------- //

/** Words per second, the speech-rate half of the prosody signal. */
export function measureSpeechRate(transcript, durationMs) {
    const words = transcript.trim().split(/\s+/).filter(Boolean).length;
    const seconds = Math.max(0.5, durationMs / 1000);
    return Math.min(12, words / seconds);
}

/**
 * How many times the user has essentially re-asked the same thing.
 *
 * The strongest available frustration signal: if someone asks the same question
 * three times, the explanation is not landing, whatever their tone of voice.
 * Compared on content words so "what is entropy" and "so what IS entropy then"
 * count as the same question.
 */
export function countRepeats(transcript, history) {
    const normalise = (text) =>
        new Set(
            text
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .split(/\s+/)
                .filter((word) => word.length > 3),
        );

    const current = normalise(transcript);
    if (current.size < 2) return 0;

    let repeats = 0;
    for (const turn of history.filter((t) => t.role === 'user').slice(-6)) {
        const previous = normalise(turn.content || '');
        if (previous.size < 2) continue;
        const shared = [...current].filter((word) => previous.has(word)).length;
        const overlap = shared / Math.min(current.size, previous.size);
        if (overlap > 0.6) repeats += 1;
    }
    return repeats;
}

/** Pick a natural-sounding voice for a language, preferring local synthesis. */
export function pickVoice(lang = 'en-US') {
    if (!speechSynthesisAvailable()) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const base = lang.split('-')[0];
    const matching = voices.filter((v) => v.lang?.startsWith(base));
    const pool = matching.length ? matching : voices;

    const preferred = ['Google', 'Natural', 'Neural', 'Samantha', 'Aria', 'Zira'];
    for (const name of preferred) {
        const found = pool.find((v) => v.name.includes(name));
        if (found) return found;
    }
    // localService voices have no network round-trip, so they start faster.
    return pool.find((v) => v.localService) || pool[0];
}

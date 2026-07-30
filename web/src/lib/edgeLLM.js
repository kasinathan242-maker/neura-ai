/**
 * Zero-cloud inference: a language model running on the user's own GPU.
 *
 * Uses WebLLM, which compiles quantised models to WebGPU shaders. Once the
 * weights are in the browser's Cache Storage the app answers with no network at
 * all — works on a plane, and costs the operator nothing.
 *
 * The `@mlc-ai/web-llm` import is dynamic for two reasons: the library is large
 * enough that bundling it into the main chunk would slow the first paint for
 * every user, and it touches WebGPU globals that do not exist in browsers
 * without support. Nothing is fetched until someone opens Local AI.
 */

const DEFAULT_MODEL = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';

const SYSTEM_PROMPT =
    'You are NEURA, a concise study tutor running entirely on the user\'s device. ' +
    'Answer directly and keep responses short, because you are running on limited ' +
    'local hardware.';

export class EdgeLLM {
    constructor() {
        this.engine = null;
        this.modelId = null;
        this.status = 'idle'; // idle | loading | ready | error | unsupported
        this.progress = 0;
        this.message = '';
        this.error = null;
        this._loading = null;
        this._listeners = new Set();
    }

    /** Subscribe to status changes. Returns an unsubscribe function. */
    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _emit(patch = {}) {
        Object.assign(this, patch);
        const snapshot = this.getState();
        this._listeners.forEach((listener) => {
            try {
                listener(snapshot);
            } catch {
                // A broken subscriber must not stop the others.
            }
        });
    }

    getState() {
        return {
            status: this.status,
            progress: this.progress,
            message: this.message,
            modelId: this.modelId,
            error: this.error,
        };
    }

    isReady() {
        return this.status === 'ready' && Boolean(this.engine);
    }

    /** WebGPU support, plus a rough VRAM read where the browser exposes one. */
    static async probe() {
        if (typeof navigator === 'undefined' || !navigator.gpu) {
            return {
                supported: false,
                reason:
                    'This browser has no WebGPU. On-device inference needs Chrome 113+, ' +
                    'Edge 113+, or Safari 18+. Everything else in the app still works.',
            };
        }
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                return {
                    supported: false,
                    reason:
                        'WebGPU is present but no GPU adapter is available. On Linux you may ' +
                        'need to enable hardware acceleration.',
                };
            }
            const limits = adapter.limits || {};
            return {
                supported: true,
                maxBufferMB: limits.maxBufferSize
                    ? Math.round(limits.maxBufferSize / (1024 * 1024))
                    : null,
                maxStorageBufferMB: limits.maxStorageBufferBindingSize
                    ? Math.round(limits.maxStorageBufferBindingSize / (1024 * 1024))
                    : null,
            };
        } catch (error) {
            return { supported: false, reason: error?.message || 'WebGPU probe failed.' };
        }
    }

    /**
     * Download and initialise a model. Concurrent calls share one load; calling
     * again with a different id swaps the model.
     */
    async load(modelId = DEFAULT_MODEL, { onProgress } = {}) {
        if (this.isReady() && this.modelId === modelId) return this.engine;

        if (this._loading && this.modelId === modelId) return this._loading;

        this._loading = (async () => {
            this._emit({ status: 'loading', progress: 0, modelId, error: null, message: 'Checking GPU…' });

            const probe = await EdgeLLM.probe();
            if (!probe.supported) {
                this._emit({ status: 'unsupported', message: probe.reason, error: probe.reason });
                throw new Error(probe.reason);
            }

            try {
                this._emit({ message: 'Loading the inference engine…' });
                const webllm = await import('@mlc-ai/web-llm');

                if (this.engine) {
                    // Free the previous model's GPU buffers before loading another,
                    // or a second load can exhaust VRAM on smaller cards.
                    try {
                        await this.engine.unload();
                    } catch { /* already gone */ }
                    this.engine = null;
                }

                const engine = await webllm.CreateMLCEngine(modelId, {
                    initProgressCallback: (report) => {
                        const progress = Math.round((report.progress || 0) * 100);
                        this._emit({
                            progress,
                            message: report.text || `Downloading weights… ${progress}%`,
                        });
                        onProgress?.(progress, report.text || '');
                    },
                });

                this.engine = engine;
                this._emit({
                    status: 'ready',
                    progress: 100,
                    modelId,
                    message: 'Model ready. This device can now answer offline.',
                });
                return engine;
            } catch (error) {
                const message = error?.message || 'Model failed to load.';
                this._emit({ status: 'error', error: message, message });
                throw error;
            } finally {
                this._loading = null;
            }
        })();

        return this._loading;
    }

    _messages(prompt, history = [], system = SYSTEM_PROMPT) {
        return [
            { role: 'system', content: system },
            ...history
                .filter((turn) => turn?.content)
                .slice(-8) // small models degrade quickly with long context
                .map((turn) => ({
                    role: turn.role === 'ai' || turn.role === 'assistant' ? 'assistant' : 'user',
                    content: String(turn.content).slice(0, 2000),
                })),
            { role: 'user', content: prompt },
        ];
    }

    /** Stream a completion. Resolves with the full text. */
    async stream(prompt, { history = [], system, onDelta, signal, maxTokens = 512 } = {}) {
        if (!this.isReady()) throw new Error('No on-device model is loaded.');

        const chunks = await this.engine.chat.completions.create({
            messages: this._messages(prompt, history, system),
            stream: true,
            temperature: 0.7,
            max_tokens: maxTokens,
        });

        let text = '';
        for await (const chunk of chunks) {
            if (signal?.aborted) {
                // Interrupt generation so the GPU is not left busy behind us.
                try {
                    await this.engine.interruptGenerate();
                } catch { /* nothing in flight */ }
                break;
            }
            const delta = chunk?.choices?.[0]?.delta?.content || '';
            if (delta) {
                text += delta;
                onDelta?.(delta, text);
            }
        }
        return text;
    }

    async complete(prompt, options = {}) {
        return this.stream(prompt, options);
    }

    /**
     * Generate a quiz on-device. JSON extraction is defensive because small
     * models frequently wrap output in prose despite instructions.
     */
    async quiz(topic, count = 3) {
        const text = await this.stream(
            `Write ${count} multiple-choice questions about "${topic}". ` +
                'Reply with JSON only: {"questions":[{"question":"...",' +
                '"options":["a","b","c","d"],"answer":"exact correct option"}]}',
            {
                system: 'You output valid JSON and nothing else.',
                maxTokens: 900,
            },
        );

        const candidates = [text];
        const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
        if (fenced) candidates.push(fenced[1]);
        const braced = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
        if (braced) candidates.push(braced);

        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate);
                const questions = (parsed.questions || [])
                    .filter((q) => q?.question && Array.isArray(q.options) && q.options.length >= 2)
                    .map((q, index) => {
                        const options = q.options.map(String);
                        // Guarantee the answer is selectable, or the UI can never
                        // mark a response correct.
                        const answer = options.includes(String(q.answer))
                            ? String(q.answer)
                            : options[0];
                        return { id: index + 1, question: String(q.question), options, answer };
                    });
                if (questions.length) return questions;
            } catch {
                // Try the next candidate.
            }
        }
        throw new Error('The on-device model did not return usable quiz JSON. Try a larger model.');
    }

    async unload() {
        if (!this.engine) return;
        try {
            await this.engine.unload();
        } catch { /* already gone */ }
        this.engine = null;
        this._emit({ status: 'idle', progress: 0, message: 'Model unloaded.', modelId: null });
    }
}

export const edgeLLM = new EdgeLLM();
export default edgeLLM;

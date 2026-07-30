/**
 * Single API client for every backend call.
 *
 * The base URL defaults to the relative path `/api`, which is what makes one
 * build work everywhere:
 *   - in dev, Vite proxies /api to the local FastAPI server (see vite.config.js)
 *   - on Vercel, /api is rewritten to the Python Function in the same project
 *   - in the Capacitor/Expo shells, VITE_API_BASE points at a reachable host
 *
 * Nothing here hardcodes localhost. Every function resolves to `{ ok, ... }` or
 * throws an `ApiError` carrying the server's own message.
 */

const RAW_BASE = (import.meta.env?.VITE_API_BASE ?? '/api').trim();
export const API_BASE = RAW_BASE.replace(/\/+$/, '') || '/api';

export class ApiError extends Error {
    constructor(message, { status = 0, path = '', body = null } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.path = path;
        this.body = body;
    }
}

/** Stable per-browser id so the backend can key memory without any login. */
export function getUserId() {
    const KEY = 'neura-user-id';
    try {
        let id = localStorage.getItem(KEY);
        if (!id) {
            id = `u_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
            localStorage.setItem(KEY, id);
        }
        return id;
    } catch {
        // Private browsing with storage disabled: fall back to a session id.
        return 'local';
    }
}

function url(path) {
    return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

async function readError(response, path) {
    let detail = `${response.status} ${response.statusText}`;
    let body = null;
    try {
        body = await response.json();
        // FastAPI puts messages in `detail`; our handlers use `error`.
        detail = body?.detail || body?.error || detail;
        if (Array.isArray(detail)) {
            detail = detail.map((d) => d?.msg || JSON.stringify(d)).join('; ');
        }
    } catch {
        try {
            const text = await response.text();
            if (text) detail = text.slice(0, 300);
        } catch { /* body already consumed */ }
    }
    return new ApiError(String(detail), { status: response.status, path, body });
}

async function request(path, { method = 'GET', body, signal, timeout = 90000, isForm = false } = {}) {
    const controller = new AbortController();
    // Chain an external signal into our own so callers can still abort early.
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url(path), {
            method,
            headers: isForm || body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) throw await readError(response, path);
        if (response.status === 204) return { ok: true };

        const type = response.headers.get('content-type') || '';
        return type.includes('application/json') ? response.json() : { ok: true, text: await response.text() };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error?.name === 'AbortError') {
            throw new ApiError(
                signal?.aborted ? 'Request cancelled.' : `Request timed out after ${Math.round(timeout / 1000)}s.`,
                { path },
            );
        }
        throw new ApiError(
            `Cannot reach the API at ${API_BASE}. ${error?.message || 'Network error.'}`,
            { path },
        );
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

const get = (path, options) => request(path, { ...options, method: 'GET' });
const post = (path, body, options) => request(path, { ...options, method: 'POST', body });
const del = (path, options) => request(path, { ...options, method: 'DELETE' });

/**
 * Consume a Server-Sent Events response, invoking `onEvent` per decoded event.
 *
 * Written against fetch + ReadableStream rather than EventSource because
 * EventSource cannot issue POST requests, and every streaming route here needs
 * a request body.
 */
export async function streamSSE(path, body, { onEvent, signal, isForm = false } = {}) {
    const response = await fetch(url(path), {
        method: 'POST',
        headers: isForm ? undefined : { 'Content-Type': 'application/json' },
        body: isForm ? body : JSON.stringify(body),
        signal,
    });

    if (!response.ok) throw await readError(response, path);
    if (!response.body) throw new ApiError('Streaming is not supported by this browser.', { path });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Events are separated by a blank line; the tail may be a partial
            // event, so it stays in the buffer until the next chunk arrives.
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';

            for (const part of parts) {
                for (const line of part.split('\n')) {
                    if (!line.startsWith('data:')) continue;
                    const payload = line.slice(5).trim();
                    if (!payload) continue;
                    try {
                        onEvent?.(JSON.parse(payload));
                    } catch {
                        // A malformed frame should not tear down the stream.
                    }
                }
            }
        }
    } finally {
        reader.releaseLock?.();
    }
}

/** Accumulate a text stream, reporting each delta and returning the full text. */
export async function streamText(path, body, { onDelta, onMeta, signal, isForm = false } = {}) {
    let text = '';
    let meta = {};
    await streamSSE(path, body, {
        signal,
        isForm,
        onEvent: (event) => {
            switch (event.type) {
                case 'delta':
                    text += event.text || '';
                    onDelta?.(event.text || '', text);
                    break;
                case 'meta':
                case 'context':
                case 'tone':
                    meta = { ...meta, ...event };
                    onMeta?.(event);
                    break;
                case 'error':
                    meta.error = event.message;
                    break;
                default:
                    break;
            }
        },
    });
    return { text, meta };
}

// --------------------------------------------------------------------------- //
// Endpoints
// --------------------------------------------------------------------------- //

export const api = {
    health: () => get('/health', { timeout: 12000 }),

    chat: (message, { history = [], useMemory = true, system } = {}) =>
        post('/chat', { message, history, use_memory: useMemory, system, user_id: getUserId() }),

    chatStream: (message, { history = [], useMemory = true, system, onDelta, onMeta, signal } = {}) =>
        streamText(
            '/chat/stream',
            { message, history, use_memory: useMemory, system, user_id: getUserId() },
            { onDelta, onMeta, signal },
        ),

    analyzeCode: (code, action, language, targetLanguage = 'Python') =>
        post('/analyze-code', { code, action, language, target_language: targetLanguage }),

    uploadPdf: (file) => {
        const form = new FormData();
        form.append('file', file);
        form.append('user_id', getUserId());
        form.append('ingest_to_memory', 'true');
        return request('/upload-pdf', { method: 'POST', body: form, isForm: true, timeout: 120000 });
    },

    chatPdf: (question, docId) =>
        post('/chat-pdf', { question, doc_id: docId, user_id: getUserId() }),

    // --- Study ---
    explain: (topic, depth = 'intermediate') =>
        post('/study/explain', { topic, depth, user_id: getUserId() }),

    explainStream: (topic, depth, { onDelta, onMeta, signal } = {}) =>
        streamText('/study/explain/stream', { topic, depth, user_id: getUserId() }, { onDelta, onMeta, signal }),

    tutor: (message, context = []) =>
        post('/study/tutor', { message, context, user_id: getUserId() }),

    quiz: (topic, count = 5, difficulty = 'mixed') =>
        post('/study/quiz', { topic, count, difficulty, user_id: getUserId() }, { timeout: 120000 }),

    quizResult: (topic, correct, total) =>
        post('/study/quiz-result', { topic, correct, total, user_id: getUserId() }),

    suggestTasks: (goal) => post('/tasks/suggest', { goal, user_id: getUserId() }),

    // --- Agents ---
    createJob: (goal, days = 7, minutesPerDay = 60) =>
        post('/agents/jobs', { goal, days, minutes_per_day: minutesPerDay, user_id: getUserId() }),

    listJobs: () => get(`/agents/jobs?user_id=${encodeURIComponent(getUserId())}`),

    getJob: (id) => get(`/agents/jobs/${id}`),

    stepJob: (id, { signal } = {}) =>
        post(`/agents/jobs/${id}/step`, undefined, { signal, timeout: 120000 }),

    runJob: (id, { maxSteps = 3, onEvent, signal } = {}) =>
        streamSSE(`/agents/jobs/${id}/run?max_steps=${maxSteps}`, {}, { onEvent, signal }),

    calendarUrl: (id) => url(`/agents/jobs/${id}/calendar.ics`),

    agentQuizResult: (id, day, correct, total) =>
        post(`/agents/jobs/${id}/quiz-result`, { day, correct, total, user_id: getUserId() }),

    nextNotification: (id) => get(`/agents/jobs/${id}/next-notification`),

    // --- Vision ---
    analyzeImage: (blob, { prompt = '', mode = 'auto', wantScene = false } = {}) => {
        const form = new FormData();
        form.append('image', blob, 'capture.jpg');
        form.append('prompt', prompt);
        form.append('mode', mode);
        form.append('user_id', getUserId());
        form.append('want_scene', String(wantScene));
        return request('/vision/analyze', { method: 'POST', body: form, isForm: true, timeout: 150000 });
    },

    analyzeImageStream: (blob, { prompt = '', mode = 'auto', onDelta, onMeta, signal } = {}) => {
        const form = new FormData();
        form.append('image', blob, 'capture.jpg');
        form.append('prompt', prompt);
        form.append('mode', mode);
        return streamText('/vision/stream', form, { onDelta, onMeta, signal, isForm: true });
    },

    // --- Memory ---
    ingestMemory: (text, { source = 'manual', title = '', extractConcepts = true } = {}) =>
        post('/memory/ingest', {
            text, source, title, extract_concepts: extractConcepts, user_id: getUserId(),
        }, { timeout: 150000 }),

    searchMemory: (query, k = 5) => post('/memory/search', { query, k, user_id: getUserId() }),

    memoryGraph: () => get(`/memory/graph?user_id=${encodeURIComponent(getUserId())}`),

    setMastery: (concept, score, signal = 'self-report') =>
        post('/memory/mastery', { concept, score, signal, user_id: getUserId() }),

    weakConcepts: (limit = 6) =>
        get(`/memory/weak?user_id=${encodeURIComponent(getUserId())}&limit=${limit}`),

    getProfile: () => get(`/memory/profile?user_id=${encodeURIComponent(getUserId())}`),

    setProfile: (patch) => post('/memory/profile', { ...patch, user_id: getUserId() }),

    memoryContext: (query) => post('/memory/context', { query, user_id: getUserId() }),

    resetMemory: () => del(`/memory?user_id=${encodeURIComponent(getUserId())}`),

    // --- Spatial ---
    generateScene: (prompt, context = '') =>
        post('/scene/generate', { prompt, context, user_id: getUserId() }, { timeout: 150000 }),

    // --- Voice ---
    voiceConfig: () => get('/voice/config', { timeout: 12000 }),

    voiceTurn: (transcript, { history = [], prosody = {}, onDelta, onMeta, signal } = {}) =>
        streamText(
            '/voice/turn',
            {
                transcript,
                history,
                user_id: getUserId(),
                energy: prosody.energy ?? 0.5,
                pitch_variance: prosody.pitchVariance ?? 0.5,
                speech_rate: prosody.speechRate ?? 2.5,
                repeat_count: prosody.repeatCount ?? 0,
                interrupted: prosody.interrupted ?? false,
            },
            { onDelta, onMeta, signal },
        ),

    // --- Edge ---
    edgeModels: () => get('/edge/models', { timeout: 12000 }),
};

export default api;

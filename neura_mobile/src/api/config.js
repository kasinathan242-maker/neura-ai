import { Platform } from 'react-native';

/**
 * Mobile API client.
 *
 * Two things differ from the web client:
 *
 * 1. There is no same-origin `/api` to fall back on, so a reachable host must be
 *    resolved explicitly. An emulator cannot see `localhost` (that is the
 *    emulator itself), hence the per-platform defaults below.
 * 2. React Native's `fetch` does not expose a streaming `response.body`, so this
 *    client uses the non-streaming endpoints. The API returns the same JSON
 *    either way; only the token-by-token effect is unavailable.
 *
 * Point `EXPO_PUBLIC_API_BASE` at your deployment to use the hosted backend:
 *     EXPO_PUBLIC_API_BASE=https://your-app.vercel.app/api
 */

// Set this to your machine's LAN IP to test on a physical device on the same
// Wi-Fi (find it with `ipconfig` on Windows, `ifconfig` on macOS/Linux).
const LAN_IP = '192.168.1.2';
const PORT = 8001;

const DEFAULT_BASE = Platform.select({
    // 10.0.2.2 is the Android emulator's alias for the host machine.
    android: `http://10.0.2.2:${PORT}/api`,
    ios: `http://localhost:${PORT}/api`,
    web: `http://localhost:${PORT}/api`,
    default: `http://${LAN_IP}:${PORT}/api`,
});

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');

/** Stable anonymous id so the backend can key this device's memory. */
let cachedUserId = null;
export function getUserId() {
    if (!cachedUserId) {
        cachedUserId = `m_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    }
    return cachedUserId;
}

export class ApiError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function request(path, { method = 'GET', body, isForm = false, timeout = 90000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers: isForm || body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) {
            let detail = `${response.status} ${response.statusText}`;
            try {
                const payload = await response.json();
                detail = payload?.detail || payload?.error || detail;
                if (Array.isArray(detail)) detail = detail.map((d) => d?.msg || '').join('; ');
            } catch {
                // Keep the status line as the message.
            }
            throw new ApiError(String(detail), response.status);
        }
        return await response.json();
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error?.name === 'AbortError') {
            throw new ApiError(`Request timed out after ${Math.round(timeout / 1000)}s.`);
        }
        throw new ApiError(
            `Cannot reach ${API_BASE}. Start the backend, or set EXPO_PUBLIC_API_BASE. ` +
                `(${error?.message || 'network error'})`,
        );
    } finally {
        clearTimeout(timer);
    }
}

const post = (path, body, options) => request(path, { ...options, method: 'POST', body });

export const api = {
    health: () => request('/health', { timeout: 12000 }),

    chat: (message, history = []) =>
        post('/chat', { message, history, user_id: getUserId(), use_memory: true }),

    explain: (topic, depth = 'intermediate') =>
        post('/study/explain', { topic, depth, user_id: getUserId() }),

    tutor: (message, context = []) =>
        post('/study/tutor', { message, context, user_id: getUserId() }),

    quiz: (topic, count = 5) =>
        post('/study/quiz', { topic, count, user_id: getUserId() }, { timeout: 120000 }),

    quizResult: (topic, correct, total) =>
        post('/study/quiz-result', { topic, correct, total, user_id: getUserId() }),

    suggestTasks: (goal) => post('/tasks/suggest', { goal, user_id: getUserId() }),

    analyzeCode: (code, action, language, targetLanguage = 'Python') =>
        post('/analyze-code', { code, action, language, target_language: targetLanguage }),

    /** Analyse a photo. `uri` comes from expo-camera or expo-image-picker. */
    analyzeImage: (uri, { prompt = '', mode = 'solve' } = {}) => {
        const form = new FormData();
        // React Native accepts this {uri, name, type} shape in place of a Blob.
        form.append('image', { uri, name: 'capture.jpg', type: 'image/jpeg' });
        form.append('prompt', prompt);
        form.append('mode', mode);
        form.append('user_id', getUserId());
        form.append('want_scene', 'false');
        return request('/vision/analyze', {
            method: 'POST',
            body: form,
            isForm: true,
            timeout: 150000,
        });
    },

    uploadPdf: (uri, name = 'document.pdf') => {
        const form = new FormData();
        form.append('file', { uri, name, type: 'application/pdf' });
        form.append('user_id', getUserId());
        form.append('ingest_to_memory', 'true');
        return request('/upload-pdf', { method: 'POST', body: form, isForm: true, timeout: 150000 });
    },

    chatPdf: (question, docId) => post('/chat-pdf', { question, doc_id: docId, user_id: getUserId() }),

    createJob: (goal, days = 7, minutesPerDay = 60) =>
        post('/agents/jobs', { goal, days, minutes_per_day: minutesPerDay, user_id: getUserId() }),

    stepJob: (id) => post(`/agents/jobs/${id}/step`, undefined, { timeout: 120000 }),

    getJob: (id) => request(`/agents/jobs/${id}`),

    weakConcepts: (limit = 6) =>
        request(`/memory/weak?user_id=${encodeURIComponent(getUserId())}&limit=${limit}`),

    memoryGraph: () => request(`/memory/graph?user_id=${encodeURIComponent(getUserId())}`),
};

export default api;

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { ApiError } from '../lib/api';
import { edgeLLM } from '../lib/edgeLLM';

/**
 * Global app state.
 *
 * Chat streams over SSE rather than a WebSocket. The previous implementation
 * opened `ws://localhost:8001` directly, which broke in three ways at once: it
 * hardcoded a dev host, Vercel Functions do not support WebSocket upgrades, and
 * a page served over HTTPS cannot open an insecure `ws://` connection at all.
 */

const MAX_HISTORY = 24;

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const GREETING = {
    id: 'init',
    role: 'ai',
    content:
        "Hi, I'm NEURA. Ask me anything, point your camera at a problem, or tell me " +
        'about an exam and I will build you a plan.',
    timestamp: new Date().toISOString(),
};

export const useStore = create(
    persist(
        (set, get) => ({
            // ----------------------------------------------------------- layout
            isSidebarOpen: true,
            toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),

            theme: 'neural-dark',
            setTheme: (theme) => set({ theme }),

            language: 'en-US',
            setLanguage: (language) => set({ language }),

            settings: {
                voiceResponses: true,
                autoPlay: false,
                studyReminders: true,
                taskDeadlines: true,
                pomodoro: true,
                wakeWord: false,
                streamResponses: true,
                personalisedMemory: true,
                // auto = use the browser model only when the server is unreachable
                edgeMode: 'auto',
            },
            updateSettings: (patch) =>
                set((s) => ({ settings: { ...s.settings, ...patch } })),

            // ------------------------------------------------------ server state
            health: null,
            healthError: null,
            isOnline: true,

            checkHealth: async () => {
                try {
                    const health = await api.health();
                    set({ health, healthError: null, isOnline: true });
                    return health;
                } catch (error) {
                    set({ health: null, healthError: error.message, isOnline: false });
                    return null;
                }
            },

            // ------------------------------------------------------- focus timer
            /**
             * Stored as an absolute deadline rather than a decrementing counter, so
             * the timer stays accurate across tab throttling and reloads —
             * background tabs get their intervals clamped to once a second at best.
             */
            focus: {
                isRunning: false,
                duration: 1500,
                remaining: 1500,
                endsAt: null,
                completedSessions: 0,
            },
            startFocus: () =>
                set((s) => ({
                    focus: {
                        ...s.focus,
                        isRunning: true,
                        endsAt: Date.now() + s.focus.remaining * 1000,
                    },
                })),
            pauseFocus: () =>
                set((s) => ({
                    focus: {
                        ...s.focus,
                        isRunning: false,
                        remaining: s.focus.endsAt
                            ? Math.max(0, Math.round((s.focus.endsAt - Date.now()) / 1000))
                            : s.focus.remaining,
                        endsAt: null,
                    },
                })),
            tickFocus: () => {
                const { focus } = get();
                if (!focus.isRunning || !focus.endsAt) return;
                const remaining = Math.max(0, Math.round((focus.endsAt - Date.now()) / 1000));
                if (remaining === 0) {
                    set({
                        focus: {
                            ...focus,
                            isRunning: false,
                            remaining: focus.duration,
                            endsAt: null,
                            completedSessions: focus.completedSessions + 1,
                        },
                    });
                    get().addStudySeconds(focus.duration);
                    get().awardXp(50, 'focus session');
                    get().notify('Focus session complete', 'Take a short break, then go again.');
                } else if (remaining !== focus.remaining) {
                    set({ focus: { ...focus, remaining } });
                }
            },
            resetFocus: () =>
                set((s) => ({
                    focus: { ...s.focus, isRunning: false, remaining: s.focus.duration, endsAt: null },
                })),
            setFocusDuration: (seconds) =>
                set((s) => ({
                    focus: {
                        ...s.focus,
                        duration: seconds,
                        remaining: seconds,
                        isRunning: false,
                        endsAt: null,
                    },
                })),

            // -------------------------------------------------------------- chat
            messages: [GREETING],
            isTyping: false,
            streamError: null,
            lastMemoryContext: null,
            abortController: null,

            addMessage: (message) =>
                set((s) => ({
                    messages: [
                        ...s.messages,
                        { id: uid(), timestamp: new Date().toISOString(), ...message },
                    ],
                })),

            clearMessages: () => set({ messages: [GREETING], streamError: null }),

            stopGeneration: () => {
                get().abortController?.abort();
                set({ abortController: null, isTyping: false });
            },

            sendMessage: async (content) => {
                const text = content?.trim();
                if (!text) return;

                const { settings, messages } = get();
                get().addMessage({ role: 'user', content: text });

                const history = messages
                    .filter((m) => m.id !== 'init' && m.content && !m.error)
                    .slice(-MAX_HISTORY)
                    .map((m) => ({ role: m.role, content: m.content }));

                const controller = new AbortController();
                const aiId = uid();
                set({
                    isTyping: true,
                    streamError: null,
                    abortController: controller,
                    messages: [
                        ...get().messages,
                        {
                            id: aiId,
                            role: 'ai',
                            content: '',
                            timestamp: new Date().toISOString(),
                            streaming: true,
                        },
                    ],
                });

                const patch = (fields) =>
                    set((s) => ({
                        messages: s.messages.map((m) => (m.id === aiId ? { ...m, ...fields } : m)),
                    }));

                // Route to the on-device model when configured, or when the
                // server is known to be unreachable and a model is loaded.
                const useEdge =
                    settings.edgeMode === 'always' ||
                    (settings.edgeMode === 'auto' && !get().isOnline && edgeLLM.isReady());

                try {
                    if (useEdge) {
                        if (!edgeLLM.isReady()) {
                            throw new ApiError(
                                'On-device mode is on but no browser model is loaded. Open Local AI to download one.',
                            );
                        }
                        await edgeLLM.stream(text, {
                            history,
                            signal: controller.signal,
                            onDelta: (_, full) => patch({ content: full }),
                        });
                        patch({ streaming: false, source: 'on-device' });
                    } else if (settings.streamResponses) {
                        const { meta } = await api.chatStream(text, {
                            history,
                            useMemory: settings.personalisedMemory,
                            signal: controller.signal,
                            onDelta: (_, full) => patch({ content: full }),
                            onMeta: (event) => {
                                if (event.type === 'context') {
                                    set({
                                        lastMemoryContext: {
                                            used: event.memory_used,
                                            weak: event.weak_concepts || [],
                                            related: event.related || [],
                                        },
                                    });
                                }
                            },
                        });
                        patch({
                            streaming: false,
                            source: meta.provider,
                            degraded: Boolean(meta.degraded),
                        });
                        if (meta.error) set({ streamError: meta.error });
                    } else {
                        const result = await api.chat(text, {
                            history,
                            useMemory: settings.personalisedMemory,
                        });
                        patch({
                            content: result.response,
                            streaming: false,
                            source: result.provider,
                            degraded: result.degraded,
                        });
                        set({ lastMemoryContext: result.memory });
                    }
                    get().awardXp(5, 'chat');
                } catch (error) {
                    if (error?.name === 'AbortError' || controller.signal.aborted) {
                        patch({ streaming: false });
                    } else {
                        // Try the browser model as a genuine fallback before giving up.
                        const recovered = await get()._tryEdgeFallback(text, history, patch);
                        if (!recovered) {
                            patch({
                                streaming: false,
                                content:
                                    `I could not reach the AI service.\n\n**${error.message}**\n\n` +
                                    'If you are running locally, start the backend with ' +
                                    '`python backend/server.py`. Otherwise open **Local AI** to ' +
                                    'download a model that runs entirely in this browser.',
                                error: true,
                            });
                            set({ streamError: error.message, isOnline: false });
                        }
                    }
                } finally {
                    set({ isTyping: false, abortController: null });
                }
            },

            /** Last-resort on-device answer when the network path failed. */
            _tryEdgeFallback: async (text, history, patch) => {
                const { settings } = get();
                if (settings.edgeMode === 'never' || !edgeLLM.isReady()) return false;
                try {
                    await edgeLLM.stream(text, {
                        history,
                        onDelta: (_, full) => patch({ content: full }),
                    });
                    patch({ streaming: false, source: 'on-device', fallback: true });
                    return true;
                } catch {
                    return false;
                }
            },

            // ----------------------------------------------------- notifications
            notifications: [],
            scheduledNotifications: [],

            /**
             * Show a notification via the OS when permitted, and always record it
             * in the in-app tray so the user never silently misses one.
             */
            notify: (title, body, meta = {}) => {
                const entry = {
                    id: uid(),
                    title,
                    body,
                    at: new Date().toISOString(),
                    read: false,
                    ...meta,
                };
                set((s) => ({ notifications: [entry, ...s.notifications].slice(0, 50) }));

                try {
                    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                        new Notification(title, { body, tag: entry.id, icon: '/icon-192.png' });
                    }
                } catch {
                    // Some browsers throw when constructing Notification outside a
                    // service worker; the in-app tray still has the message.
                }
                return entry;
            },

            requestNotificationPermission: async () => {
                if (typeof Notification === 'undefined') return 'unsupported';
                if (Notification.permission !== 'default') return Notification.permission;
                try {
                    return await Notification.requestPermission();
                } catch {
                    return 'denied';
                }
            },

            markNotificationsRead: () =>
                set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),

            /** Persist an agent's reminder schedule so it survives a reload. */
            scheduleNotifications: (items) =>
                set((s) => {
                    const existing = new Set(s.scheduledNotifications.map((n) => `${n.at}|${n.title}`));
                    const added = items
                        .filter((n) => !existing.has(`${n.at}|${n.title}`))
                        .map((n) => ({ ...n, id: uid(), fired: false }));
                    return { scheduledNotifications: [...s.scheduledNotifications, ...added] };
                }),

            /** Fire any due reminders. Driven by a single interval in <Layout>. */
            pumpScheduledNotifications: () => {
                const { scheduledNotifications } = get();
                if (!scheduledNotifications.length) return;

                const now = Date.now();
                let changed = false;
                const next = scheduledNotifications.map((item) => {
                    if (item.fired) return item;
                    const due = new Date(item.at).getTime();
                    if (Number.isNaN(due) || due > now) return item;
                    // Skip anything more than an hour stale: firing a burst of
                    // yesterday's reminders on reopen would be noise, not help.
                    if (now - due < 3_600_000) {
                        get().notify(item.title, item.body, { kind: item.kind, day: item.day });
                    }
                    changed = true;
                    return { ...item, fired: true };
                });

                if (changed) {
                    set({
                        scheduledNotifications: next.filter(
                            (n) => !n.fired || Date.now() - new Date(n.at).getTime() < 86_400_000,
                        ),
                    });
                }
            },

            // ------------------------------------------------------ user content
            tasks: [],
            addTask: (task) =>
                set((s) => ({
                    tasks: [...s.tasks, { id: uid(), done: false, createdAt: Date.now(), ...task }],
                })),
            addTasks: (items) =>
                set((s) => ({
                    tasks: [
                        ...s.tasks,
                        ...items.map((t) => ({ id: uid(), done: false, createdAt: Date.now(), ...t })),
                    ],
                })),
            toggleTask: (id) =>
                set((s) => ({
                    tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
                })),
            removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

            notes: [],
            saveNote: (note) =>
                set((s) => {
                    const exists = note.id && s.notes.some((n) => n.id === note.id);
                    return {
                        notes: exists
                            ? s.notes.map((n) =>
                                  n.id === note.id ? { ...n, ...note, updatedAt: Date.now() } : n,
                              )
                            : [
                                  { id: uid(), createdAt: Date.now(), updatedAt: Date.now(), ...note },
                                  ...s.notes,
                              ],
                    };
                }),
            removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

            cards: [],
            addCard: (card) => set((s) => ({ cards: [...s.cards, { id: uid(), ...card }] })),
            addCards: (items) =>
                set((s) => ({ cards: [...s.cards, ...items.map((c) => ({ id: uid(), ...c }))] })),
            removeCard: (id) => set((s) => ({ cards: s.cards.filter((c) => c.id !== id) })),

            // -------------------------------------------------------------- xp
            xp: 0,
            awardXp: (amount, reason = '') =>
                set((s) => {
                    const xp = s.xp + amount;
                    const before = Math.floor(s.xp / 1000) + 1;
                    const after = Math.floor(xp / 1000) + 1;
                    if (after > before) {
                        // Deferred so the notification does not fire during a
                        // state update, which React would warn about.
                        setTimeout(() => get().notify(`Level ${after}`, 'You levelled up.'), 0);
                    }
                    return { xp, lastXpReason: reason };
                }),

            studySeconds: 0,
            addStudySeconds: (seconds) => set((s) => ({ studySeconds: s.studySeconds + seconds })),

            // ------------------------------------------------------- edge engine
            edge: { status: 'idle', progress: 0, modelId: null, message: '' },
            setEdgeState: (patch) => set((s) => ({ edge: { ...s.edge, ...patch } })),
        }),
        {
            name: 'neura-storage',
            version: 2,
            partialize: (state) => ({
                theme: state.theme,
                language: state.language,
                settings: state.settings,
                isSidebarOpen: state.isSidebarOpen,
                tasks: state.tasks,
                notes: state.notes,
                cards: state.cards,
                xp: state.xp,
                studySeconds: state.studySeconds,
                focus: { ...state.focus, isRunning: false, endsAt: null },
                notifications: state.notifications.slice(0, 20),
                scheduledNotifications: state.scheduledNotifications,
                edge: { ...state.edge, status: 'idle', progress: 0 },
                // Chat history is intentionally not persisted: it would grow
                // without bound in localStorage and go stale across sessions.
            }),
            migrate: (persisted, version) => {
                if (version < 2 && persisted) {
                    // v1 stored `focusMode` with a decrementing counter; the timer
                    // is now deadline-based, so drop the old shape.
                    const { focusMode, ...rest } = persisted;
                    return {
                        ...rest,
                        focus: {
                            isRunning: false,
                            duration: focusMode?.duration ?? 1500,
                            remaining: focusMode?.duration ?? 1500,
                            endsAt: null,
                            completedSessions: 0,
                        },
                    };
                }
                return persisted;
            },
        },
    ),
);

export default useStore;

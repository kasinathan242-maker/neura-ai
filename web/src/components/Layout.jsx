import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CloudOff, Cpu, Menu, Wifi, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import { Sidebar } from './Sidebar';
import { FocusTimer } from './FocusTimer';
import { useStore } from '../store/useStore';
import { ContinuousRecogniser } from '../lib/voicePipeline';

/**
 * The background canvas is purely decorative, so it must not put three.js
 * (~400KB gzipped) on the critical path for pages that have no 3D content.
 * Lazily loaded, it arrives after the UI is already interactive.
 */
const ThreeBackground = lazy(() =>
    import('./ThreeBackground').then((module) => ({ default: module.ThreeBackground })),
);

/**
 * App shell: sidebar, top bar, notification tray and the background canvas.
 *
 * Also owns the two app-wide timers — the reminder pump and the health poll —
 * so they exist exactly once regardless of which page is mounted.
 */

function NotificationTray({ open, onClose }) {
    const notifications = useStore((s) => s.notifications);

    if (!open) return null;

    return (
        <>
            <button
                type="button"
                aria-label="Close notifications"
                className="fixed inset-0 z-40 cursor-default"
                onClick={onClose}
            />
            <div className="glass-panel animate-pop absolute right-0 top-12 z-50 max-h-96 w-80 overflow-y-auto rounded-xl p-2 shadow-2xl">
                {notifications.length === 0 ? (
                    <p className="text-app-muted p-4 text-center text-sm">
                        No notifications yet. Study agents will nudge you here when a session is due.
                    </p>
                ) : (
                    notifications.map((item) => (
                        <div
                            key={item.id}
                            className={clsx(
                                'rounded-lg p-3 transition-colors',
                                item.read ? 'opacity-60' : 'accent-bg',
                            )}
                        >
                            <p className="text-app text-sm font-semibold">{item.title}</p>
                            <p className="text-app-muted mt-0.5 text-xs">{item.body}</p>
                            <p className="text-app-muted mt-1 text-[10px] opacity-70">
                                {new Date(item.at).toLocaleString()}
                            </p>
                        </div>
                    ))
                )}
            </div>
        </>
    );
}

export const Layout = ({ children }) => {
    const navigate = useNavigate();
    const toggleSidebar = useStore((s) => s.toggleSidebar);
    const isSidebarOpen = useStore((s) => s.isSidebarOpen);
    const notifications = useStore((s) => s.notifications);
    const markRead = useStore((s) => s.markNotificationsRead);
    const pump = useStore((s) => s.pumpScheduledNotifications);
    const checkHealth = useStore((s) => s.checkHealth);
    const health = useStore((s) => s.health);
    const isOnline = useStore((s) => s.isOnline);
    const wakeWord = useStore((s) => s.settings.wakeWord);
    const edge = useStore((s) => s.edge);

    const [trayOpen, setTrayOpen] = useState(false);
    const unread = notifications.filter((n) => !n.read).length;

    // Health poll: the top bar shows which provider is live, so the user is never
    // guessing why an answer looks like a placeholder.
    useEffect(() => {
        checkHealth();
        const interval = setInterval(checkHealth, 60_000);
        return () => clearInterval(interval);
    }, [checkHealth]);

    // Reminder pump for the agent-scheduled notifications.
    useEffect(() => {
        pump();
        const interval = setInterval(pump, 20_000);
        return () => clearInterval(interval);
    }, [pump]);

    /**
     * Wake-word listener, off by default.
     *
     * The original version started continuous recognition on mount with no way to
     * disable it, restarted itself on every `onend` (including after the user had
     * navigated to the voice page), and held the microphone for the whole session.
     * It is now opt-in and releases the mic as soon as it is switched off.
     */
    const recogniserRef = useRef(null);
    useEffect(() => {
        if (!wakeWord) {
            recogniserRef.current?.stop();
            recogniserRef.current = null;
            return undefined;
        }

        const recogniser = new ContinuousRecogniser({ interim: false });
        recogniser.onResult = ({ transcript, isFinal }) => {
            if (!isFinal) return;
            const text = transcript.toLowerCase();
            if (/\b(hey|hi|hello|ok)\s+(neura|nira|nura)\b/.test(text)) {
                recogniser.stop();
                navigate('/voice');
            }
        };
        recogniser.onError = (message) => console.warn('Wake word:', message);
        recogniser.start();
        recogniserRef.current = recogniser;

        return () => {
            recogniser.stop();
            recogniserRef.current = null;
        };
    }, [wakeWord, navigate]);

    const provider = health?.active_provider;
    const providerLabel =
        provider === 'openai'
            ? health?.cloud_model || 'Cloud model'
            : provider === 'ollama'
              ? `Ollama · ${health?.active_model || 'local'}`
              : provider === 'offline'
                ? 'No model configured'
                : 'Checking…';

    return (
        <div className="text-app flex min-h-screen">
            <Suspense fallback={null}>
                <ThreeBackground />
            </Suspense>
            <Sidebar />

            <main
                className={clsx(
                    'flex min-h-screen flex-1 flex-col transition-all duration-300',
                    isSidebarOpen ? 'lg:ml-64' : 'lg:ml-16',
                )}
            >
                <header className="border-app sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-[var(--bg-primary)]/85 px-4 backdrop-blur-xl sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            type="button"
                            onClick={toggleSidebar}
                            aria-label="Toggle the navigation menu"
                            className="text-app-muted hover:text-app focus-ring rounded-lg p-2 transition-colors hover:bg-[var(--border-subtle)]"
                        >
                            <Menu size={19} />
                        </button>

                        <div
                            className="border-app hidden items-center gap-2 rounded-full border px-3 py-1 text-xs sm:flex"
                            title={
                                provider === 'offline'
                                    ? 'Set LLM_API_KEY, or run Ollama locally, to get real model responses.'
                                    : `Requests are served by ${providerLabel}.`
                            }
                        >
                            {!isOnline ? (
                                <WifiOff size={13} className="text-red-400" />
                            ) : provider === 'offline' ? (
                                <CloudOff size={13} className="text-amber-400" />
                            ) : (
                                <Wifi size={13} className="text-emerald-400" />
                            )}
                            <span className="text-app-muted max-w-44 truncate">
                                {isOnline ? providerLabel : 'API unreachable'}
                            </span>
                        </div>

                        {edge.status === 'ready' && (
                            <div
                                className="hidden items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-300 sm:flex"
                                title={`${edge.modelId} is loaded and can answer with no network.`}
                            >
                                <Cpu size={13} />
                                On-device ready
                            </div>
                        )}
                    </div>

                    <div className="relative flex items-center gap-2">
                        <button
                            type="button"
                            aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
                            onClick={() => {
                                setTrayOpen((open) => !open);
                                if (!trayOpen) markRead();
                            }}
                            className="text-app-muted hover:text-app focus-ring relative rounded-full p-2 transition-colors hover:bg-[var(--border-subtle)]"
                        >
                            <Bell size={19} />
                            {unread > 0 && (
                                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                                    {unread > 9 ? '9+' : unread}
                                </span>
                            )}
                        </button>
                        <NotificationTray open={trayOpen} onClose={() => setTrayOpen(false)} />
                    </div>
                </header>

                <div className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">{children}</div>

                <FocusTimer />
            </main>
        </div>
    );
};

export default Layout;

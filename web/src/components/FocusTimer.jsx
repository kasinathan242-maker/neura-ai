import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, RotateCcw, Timer } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store/useStore';

/**
 * Floating Pomodoro widget.
 *
 * The countdown reads from an absolute deadline in the store rather than
 * decrementing a counter, so it stays accurate when the tab is backgrounded —
 * browsers throttle `setInterval` in hidden tabs, which made the old
 * implementation drift by minutes over a session.
 */

const PRESETS = [
    { label: '15m', seconds: 900 },
    { label: '25m', seconds: 1500 },
    { label: '50m', seconds: 3000 },
];

const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const FocusTimer = () => {
    const focus = useStore((s) => s.focus);
    const startFocus = useStore((s) => s.startFocus);
    const pauseFocus = useStore((s) => s.pauseFocus);
    const resetFocus = useStore((s) => s.resetFocus);
    const tickFocus = useStore((s) => s.tickFocus);
    const setFocusDuration = useStore((s) => s.setFocusDuration);
    const enabled = useStore((s) => s.settings.pomodoro);

    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        if (!focus.isRunning) return undefined;
        const interval = setInterval(tickFocus, 500);
        // Recompute on tab focus too: while hidden, the interval may not have run
        // at all, so the displayed time would be stale on return.
        const onVisible = () => tickFocus();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [focus.isRunning, tickFocus]);

    if (!enabled) return null;

    const percent = focus.duration ? (focus.remaining / focus.duration) * 100 : 0;

    if (collapsed) {
        return (
            <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="glass-panel focus-ring fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-4 py-2 shadow-xl"
            >
                <Timer size={15} className="accent-text" />
                <span className="text-app tabular text-sm font-semibold">{formatTime(focus.remaining)}</span>
                <ChevronUp size={14} className="text-app-muted" />
            </button>
        );
    }

    return (
        <div className="glass-panel animate-pop fixed bottom-5 right-5 z-40 w-52 rounded-2xl p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
                <div className="accent-text flex items-center gap-1.5">
                    <Timer size={14} />
                    <span className="text-[11px] font-bold tracking-widest">FOCUS</span>
                </div>
                <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    aria-label="Collapse the focus timer"
                    className="text-app-muted focus-ring hover:text-app transition-colors"
                >
                    <ChevronDown size={15} />
                </button>
            </div>

            <div className="text-app tabular mb-3 text-center font-mono text-4xl font-bold tracking-tight">
                {formatTime(focus.remaining)}
            </div>

            <div className="mb-3 flex gap-2">
                <button
                    type="button"
                    onClick={focus.isRunning ? pauseFocus : startFocus}
                    className={clsx(
                        'focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-all',
                        focus.isRunning
                            ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                            : 'accent-bg accent-text hover:brightness-125',
                    )}
                >
                    {focus.isRunning ? <Pause size={15} /> : <Play size={15} />}
                    {focus.isRunning ? 'Pause' : 'Start'}
                </button>
                <button
                    type="button"
                    onClick={resetFocus}
                    aria-label="Reset the timer"
                    className="border-app text-app-muted hover:text-app focus-ring rounded-lg border p-1.5 transition-colors"
                >
                    <RotateCcw size={15} />
                </button>
            </div>

            <div className="mb-3 flex gap-1">
                {PRESETS.map((preset) => (
                    <button
                        key={preset.seconds}
                        type="button"
                        onClick={() => setFocusDuration(preset.seconds)}
                        className={clsx(
                            'focus-ring flex-1 rounded-md py-1 text-[11px] font-medium transition-colors',
                            focus.duration === preset.seconds
                                ? 'accent-bg accent-text'
                                : 'text-app-muted hover:text-app',
                        )}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]">
                <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-linear"
                    style={{ width: `${percent}%` }}
                />
            </div>

            {focus.completedSessions > 0 && (
                <p className="text-app-muted mt-2 text-center text-[11px]">
                    {focus.completedSessions} session{focus.completedSessions === 1 ? '' : 's'} done today
                </p>
            )}
        </div>
    );
};

export default FocusTimer;

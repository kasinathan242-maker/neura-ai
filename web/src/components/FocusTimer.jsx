import React, { useEffect } from 'react';
import { Play, Pause, RotateCcw, X, Timer } from 'lucide-react';
import { useStore } from '../store/useStore';
import clsx from 'clsx';

export const FocusTimer = () => {
    const { focusMode, setFocusState } = useStore();
    const { isActive, timeLeft, duration } = focusMode;

    useEffect(() => {
        let interval = null;
        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setFocusState({ timeLeft: timeLeft - 1 });
            }, 1000);
        } else if (timeLeft === 0) {
            setFocusState({ isActive: false });
            // Optionally play a sound here
        }
        return () => clearInterval(interval);
    }, [isActive, timeLeft, setFocusState]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const toggleTimer = () => setFocusState({ isActive: !isActive });
    const resetTimer = () => setFocusState({ isActive: false, timeLeft: duration });
    const closeTimer = () => setFocusState({ isActive: false }); // Just hiding effectively if we want

    // Always show if setting is enabled (accessed via store ideally, or just show always for now)
    // if (!isActive && timeLeft === duration) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 glass-panel p-4 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-10 flex flex-col items-center gap-3 w-48 border border-white/10 bg-black/80 backdrop-blur-xl">
            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2 text-cyan-400">
                    <Timer size={16} />
                    <span className="text-xs font-bold tracking-wider">FOCUS</span>
                </div>
                <button onClick={resetTimer} className="hover:text-red-400 transition-colors">
                    <X size={14} />
                </button>
            </div>

            <div className="text-4xl font-mono font-bold text-white tabular-nums tracking-tight">
                {formatTime(timeLeft)}
            </div>

            <div className="flex items-center gap-2 w-full">
                <button
                    onClick={toggleTimer}
                    className={clsx(
                        "flex-1 py-1.5 rounded-lg flex items-center justify-center gap-2 transition-all font-medium text-sm",
                        isActive ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30" : "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                    )}
                >
                    {isActive ? <Pause size={16} /> : <Play size={16} />}
                    {isActive ? "Pause" : "Start"}
                </button>
                <button
                    onClick={resetTimer}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                    <RotateCcw size={16} />
                </button>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mt-1">
                <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${(timeLeft / duration) * 100}%` }}
                />
            </div>
        </div>
    );
};

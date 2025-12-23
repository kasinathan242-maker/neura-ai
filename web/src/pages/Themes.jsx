import React from 'react';
import { Check, Palette, Moon, Sun, Zap, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store/useStore';

const ThemeCard = ({ id, name, desc, icon: Icon, colors, active, onClick }) => (
    <div
        onClick={() => onClick(id)}
        className={clsx(
            "relative p-6 rounded-2xl border cursor-pointer transition-all duration-300 group overflow-hidden",
            active
                ? "bg-[#0e0e12] border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.15)]"
                : "bg-[#0e0e12] border-white/5 hover:border-white/20"
        )}
    >
        {active && (
            <div className="absolute top-4 right-4 w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center">
                <Check size={14} className="text-black" strokeWidth={3} />
            </div>
        )}

        <div className={clsx(
            "w-full aspect-[2/1] rounded-xl mb-4 flex items-center justify-center gap-2",
            id === 'light' ? "bg-white" : "bg-[#0a0a0f]"
        )}>
            {colors.map((color, i) => (
                <div key={i} className={clsx("w-8 h-8 rounded-full shadow-lg", color)} />
            ))}
        </div>

        <div className="flex items-center gap-3 mb-1">
            <div className={clsx(
                "p-2 rounded-lg",
                active ? "bg-cyan-500/10 text-cyan-500" : "bg-white/5 text-gray-400"
            )}>
                <Icon size={18} />
            </div>
            <h3 className={clsx("font-bold", active ? "text-white" : "text-gray-300")}>{name}</h3>
        </div>
        <p className="text-sm text-gray-500 ml-11">{desc}</p>
    </div>
);

export const Themes = () => {
    const { theme: activeTheme, setTheme } = useStore();

    const themes = [
        {
            id: 'neural-dark',
            name: 'Neural Dark',
            desc: 'Deep dark theme with cyan accents',
            icon: Moon,
            colors: ['bg-cyan-400', 'bg-purple-500', 'bg-pink-500']
        },
        {
            id: 'light',
            name: 'Light',
            desc: 'Clean light theme for daytime',
            icon: Sun,
            colors: ['bg-cyan-600', 'bg-purple-600', 'bg-pink-600']
        },
        {
            id: 'neon',
            name: 'Neon',
            desc: 'Vibrant neon cyberpunk style',
            icon: Zap,
            colors: ['bg-green-400', 'bg-fuchsia-500', 'bg-cyan-400']
        },
        {
            id: 'aurora',
            name: 'Aurora',
            desc: 'Inspired by northern lights',
            icon: Sparkles,
            colors: ['bg-green-400', 'bg-cyan-400', 'bg-purple-400']
        }
    ];

    return (
        <div className="flex flex-col animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto w-full pb-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                    <Palette className="text-cyan-500" /> Themes
                </h1>
                <p className="text-gray-400">Customize your NEURA AI experience</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {themes.map(theme => (
                    <ThemeCard
                        key={theme.id}
                        {...theme}
                        active={activeTheme === theme.id}
                        onClick={setTheme}
                    />
                ))}
            </div>

            <div className="mt-12 text-center p-8 glass-panel rounded-2xl border border-white/5 bg-[#0e0e12]">
                <p className="text-gray-500">Currently using</p>
                <h2 className="text-2xl font-bold text-cyan-400 mt-2">{themes.find(t => t.id === activeTheme)?.name}</h2>
            </div>
        </div>
    );
};

import React from 'react';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader, Panel } from '../components/ui';
import { useStore } from '../store/useStore';

/**
 * Theme picker. Each theme is a set of CSS custom properties in index.css, so
 * switching is a single class change on <html> with no re-render of the tree.
 */

const THEMES = [
    {
        id: 'neural-dark',
        name: 'Neural Dark',
        description: 'The default. Deep indigo with a cyan accent.',
        swatches: ['#0a0a0f', '#1e1b4b', '#06b6d4'],
    },
    {
        id: 'light',
        name: 'Daylight',
        description: 'Bright and high-contrast for well-lit rooms.',
        swatches: ['#f1f5f9', '#dbeafe', '#0e7490'],
    },
    {
        id: 'neon',
        name: 'Neon Terminal',
        description: 'Near-black with phosphor green. Easy at night.',
        swatches: ['#050505', '#052e16', '#22c55e'],
    },
    {
        id: 'aurora',
        name: 'Aurora',
        description: 'Deep navy with soft indigo highlights.',
        swatches: ['#0b1120', '#312e81', '#818cf8'],
    },
];

export const Themes = () => {
    const theme = useStore((s) => s.theme);
    const setTheme = useStore((s) => s.setTheme);

    return (
        <div className="animate-fade max-w-3xl">
            <PageHeader title="Themes" subtitle="Applies instantly across the whole app." />

            <div className="grid gap-4 sm:grid-cols-2">
                {THEMES.map((option) => {
                    const active = theme === option.id;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => setTheme(option.id)}
                            className={clsx(
                                'focus-ring rounded-2xl border p-5 text-left transition-all',
                                active
                                    ? 'border-[var(--accent)] accent-bg'
                                    : 'border-app hover:border-[var(--border-strong)]',
                            )}
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <div className="flex gap-1.5">
                                    {option.swatches.map((colour) => (
                                        <span
                                            key={colour}
                                            className="h-7 w-7 rounded-lg ring-1 ring-white/10"
                                            style={{ background: colour }}
                                        />
                                    ))}
                                </div>
                                {active && (
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)]">
                                        <Check size={13} className="text-black" />
                                    </span>
                                )}
                            </div>
                            <p className="text-app font-bold">{option.name}</p>
                            <p className="text-app-muted mt-1 text-sm">{option.description}</p>
                        </button>
                    );
                })}
            </div>

            <Panel className="mt-6 p-4">
                <p className="text-app-muted text-xs">
                    Themes are defined as CSS custom properties, so every component picks them up without a
                    reload. If you have asked your system for reduced motion, animations are already disabled.
                </p>
            </Panel>
        </div>
    );
};

export default Themes;

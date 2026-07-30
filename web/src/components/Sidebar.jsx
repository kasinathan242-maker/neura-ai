import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    Bot,
    Boxes,
    Brain,
    Camera,
    CheckSquare,
    Code,
    Cpu,
    FileText,
    Globe,
    Home as HomeIcon,
    Layers,
    MessageSquare,
    Mic,
    Notebook,
    Palette,
    Settings as SettingsIcon,
    Sparkles,
    X,
} from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store/useStore';

/**
 * Navigation. Grouped rather than one flat list, because the app now has 15
 * destinations and an undifferentiated column of icons is hard to scan.
 */

const GROUPS = [
    {
        label: 'Assist',
        items: [
            { icon: HomeIcon, label: 'Dashboard', path: '/' },
            { icon: MessageSquare, label: 'AI Chat', path: '/chat' },
            { icon: Mic, label: 'Live Voice', path: '/voice', tag: 'live' },
            { icon: Camera, label: 'Vision', path: '/vision', tag: 'new' },
        ],
    },
    {
        label: 'Learn',
        items: [
            { icon: Sparkles, label: 'Study', path: '/study' },
            { icon: Bot, label: 'Study Agents', path: '/agents', tag: 'new' },
            { icon: Brain, label: 'Memory Graph', path: '/memory', tag: 'new' },
            { icon: Boxes, label: 'Spatial 3D', path: '/spatial', tag: 'xr' },
            { icon: Layers, label: 'Flashcards', path: '/flashcards' },
        ],
    },
    {
        label: 'Work',
        items: [
            { icon: FileText, label: 'PDF Intelligence', path: '/pdf' },
            { icon: Code, label: 'Coding', path: '/coding' },
            { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
            { icon: Notebook, label: 'Notes', path: '/notes' },
        ],
    },
    {
        label: 'System',
        items: [
            { icon: Cpu, label: 'Local AI', path: '/local-ai', tag: 'offline' },
            { icon: SettingsIcon, label: 'Settings', path: '/settings' },
            { icon: Palette, label: 'Themes', path: '/themes' },
            { icon: Globe, label: 'Languages', path: '/languages' },
        ],
    },
];

const TAG_STYLES = {
    new: 'bg-emerald-500/15 text-emerald-300',
    live: 'bg-red-500/15 text-red-300',
    xr: 'bg-violet-500/15 text-violet-300',
    offline: 'bg-amber-500/15 text-amber-300',
};

export const Sidebar = () => {
    const isOpen = useStore((s) => s.isSidebarOpen);
    const toggleSidebar = useStore((s) => s.toggleSidebar);
    const xp = useStore((s) => s.xp);

    const level = Math.floor(xp / 1000) + 1;
    const progress = ((xp % 1000) / 1000) * 100;

    const closeOnMobile = () => {
        // On a phone the sidebar is an overlay, so a tap should dismiss it.
        if (window.innerWidth < 1024) toggleSidebar();
    };

    return (
        <>
            {/* Scrim behind the mobile overlay. */}
            {isOpen && (
                <button
                    type="button"
                    aria-label="Close the navigation menu"
                    onClick={toggleSidebar}
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                />
            )}

            <aside
                className={clsx(
                    'fixed left-0 top-0 z-50 flex h-screen flex-col border-r transition-all duration-300',
                    'border-app bg-[var(--bg-secondary)]',
                    isOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:w-16 lg:translate-x-0',
                )}
            >
                <div className="border-app flex h-16 shrink-0 items-center border-b px-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]">
                        <span className="text-lg font-bold text-black">N</span>
                    </div>
                    {isOpen && (
                        <>
                            <span className="accent-text ml-3 text-base font-bold tracking-wide">NEURA AI</span>
                            <button
                                type="button"
                                onClick={toggleSidebar}
                                aria-label="Close the navigation menu"
                                className="text-app-muted hover:text-app focus-ring ml-auto lg:hidden"
                            >
                                <X size={18} />
                            </button>
                        </>
                    )}
                </div>

                {isOpen && (
                    <div className="border-app shrink-0 border-b px-4 py-3">
                        <div className="text-app-muted mb-1.5 flex items-center justify-between text-[11px]">
                            <span>Level {level}</span>
                            <span className="accent-text font-semibold">{xp} XP</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-[var(--border-subtle)]">
                            <div
                                className="h-full rounded-full bg-[var(--accent)] transition-all duration-700"
                                style={{ width: `${Math.max(2, progress)}%` }}
                            />
                        </div>
                    </div>
                )}

                <nav className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-2 py-3">
                    {GROUPS.map((group) => (
                        <div key={group.label}>
                            {isOpen && (
                                <p className="text-app-muted mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest opacity-60">
                                    {group.label}
                                </p>
                            )}
                            <div className="space-y-0.5">
                                {group.items.map((item) => (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        onClick={closeOnMobile}
                                        title={isOpen ? undefined : item.label}
                                        className={({ isActive }) =>
                                            clsx(
                                                'focus-ring group relative flex items-center rounded-lg px-3 py-2 transition-all',
                                                isActive
                                                    ? 'accent-bg accent-text'
                                                    : 'text-app-muted hover:bg-[var(--border-subtle)] hover:text-app',
                                            )
                                        }
                                    >
                                        {({ isActive }) => (
                                            <>
                                                {isActive && (
                                                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-[var(--accent)]" />
                                                )}
                                                <item.icon size={18} strokeWidth={1.7} className="shrink-0" />
                                                {isOpen && (
                                                    <>
                                                        <span className="ml-3 truncate text-sm font-medium">
                                                            {item.label}
                                                        </span>
                                                        {item.tag && (
                                                            <span
                                                                className={clsx(
                                                                    'ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                                                                    TAG_STYLES[item.tag],
                                                                )}
                                                            >
                                                                {item.tag}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </NavLink>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>
            </aside>
        </>
    );
};

export default Sidebar;

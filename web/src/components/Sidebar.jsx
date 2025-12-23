import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    Home as HomeIcon, MessageSquare, Mic, BookOpen, FileText, Code,
    List, CheckSquare, Edit, Settings, Box, Globe
} from 'lucide-react';
import { useStore } from '../store/useStore';
import clsx from 'clsx';

const navItems = [
    { icon: HomeIcon, label: 'Dashboard', path: '/' },
    { icon: MessageSquare, label: 'AI Chat', path: '/chat' },
    { icon: Mic, label: 'Voice', path: '/voice' },
    { icon: BookOpen, label: 'Study', path: '/study' },
    { icon: FileText, label: 'PDF Intelligence', path: '/pdf' },
    { icon: Code, label: 'Coding', path: '/coding' },
    { icon: List, label: 'Flashcards', path: '/flashcards' },
    { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
    { icon: Edit, label: 'Notes', path: '/notes' },
];

const secondaryItems = [
    { icon: Settings, label: 'Settings', path: '/settings' },
    { icon: Box, label: 'Themes', path: '/themes' },
    { icon: Globe, label: 'Languages', path: '/languages' },
];

export const Sidebar = () => {
    const { isSidebarOpen } = useStore();

    return (
        <aside className={clsx(
            "h-screen bg-[#0f0f13] border-r border-white/5 transition-all duration-300 flex flex-col fixed left-0 top-0 z-50",
            isSidebarOpen ? "w-64" : "w-16"
        )}>
            {/* Logo Area */}
            <div className="h-20 flex items-center px-4 border-b border-white/5">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-lg">N</span>
                </div>
                {isSidebarOpen && <span className="ml-3 font-bold text-lg tracking-wide text-blue-400">NEURA AI</span>}
            </div>

            {/* User Level */}
            {isSidebarOpen && (
                <div className="px-4 py-4">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                        <span>Level 1</span>
                        <span className="text-blue-400">30 XP</span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full w-[3%] bg-blue-500 rounded-full" />
                    </div>
                </div>
            )}

            {/* Main Nav */}
            <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto no-scrollbar">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => clsx(
                            "flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
                            isActive
                                ? "bg-blue-500/10 text-cyan-400"
                                : "text-gray-400 hover:bg-white/5 hover:text-white"
                        )}
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-cyan-400 rounded-r-full" />}
                                <item.icon size={20} strokeWidth={1.5} className={clsx("shrink-0", isActive && "text-cyan-400")} />
                                {isSidebarOpen && <span className="ml-3 font-medium text-sm truncate">{item.label}</span>}
                            </>
                        )}
                    </NavLink>
                ))}

                <div className="my-2 border-t border-white/5 mx-2" />

                {secondaryItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => clsx(
                            "flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
                            isActive
                                ? "bg-blue-500/10 text-cyan-400"
                                : "text-gray-400 hover:bg-white/5 hover:text-white"
                        )}
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-cyan-400 rounded-r-full" />}
                                <item.icon size={20} strokeWidth={1.5} className={clsx("shrink-0", isActive && "text-cyan-400")} />
                                {isSidebarOpen && <span className="ml-3 font-medium text-sm truncate">{item.label}</span>}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
};

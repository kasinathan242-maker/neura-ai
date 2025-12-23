import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Clock, Zap, Star, Award, ArrowRight,
    MessageSquare, BookOpen, List, CheckSquare,
    FileText
} from 'lucide-react';
import clsx from 'clsx';

export const Home = () => {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-500 pb-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Welcome back to <span className="text-blue-400">NEURA AI</span></h1>
                    <p className="text-gray-400">Your AI-powered study companion is ready to help.</p>
                </div>
                <button
                    onClick={() => navigate('/study')}
                    className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                    <Award size={18} /> Start Learning
                </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Study Time', value: '0h 0m', icon: Clock, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
                    { label: 'Day Streak', value: '0', icon: Zap, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                    { label: 'XP Earned', value: '30', icon: Star, color: 'text-purple-400', bg: 'bg-purple-400/10' },
                    { label: 'Level', value: '1', icon: Award, color: 'text-pink-500', bg: 'bg-pink-500/10' },
                ].map((stat, i) => (
                    <div key={i} className="glass-panel p-5 rounded-2xl border border-white/5 bg-[#0e0e12] flex items-center gap-4">
                        <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", stat.bg)}>
                            <stat.icon size={24} className={stat.color} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{stat.label}</p>
                            <p className="text-2xl font-bold text-white font-mono">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Level Progress */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-[#0e0e12]">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <h3 className="text-lg font-bold text-white">Level 1 Progress</h3>
                        <p className="text-sm text-gray-500">970 XP to next level</p>
                    </div>
                    <div className="flex items-center gap-1 text-purple-400 font-bold">
                        <Star size={16} fill="currentColor" /> 30 XP
                    </div>
                </div>
                <div className="h-2.5 bg-white/5 rounded-full overflow-hidden w-full">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 w-[3%] rounded-full shadow-[0_0_10px_rgba(168,85,247,0.4)]" />
                </div>
            </div>

            {/* Quick Actions */}
            <div>
                <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { title: 'Start AI Chat', desc: 'Ask anything', icon: MessageSquare, color: 'text-cyan-400', path: '/chat', button: 'Open' },
                        { title: 'Study Mode', desc: 'Learn & practice', icon: BookOpen, color: 'text-blue-500', path: '/study', button: 'Open' },
                        { title: 'Flashcards', desc: '0 cards', icon: List, color: 'text-purple-400', path: '/flashcards', button: 'Open' },
                        { title: 'Tasks', desc: '0/0 done', icon: CheckSquare, color: 'text-pink-500', path: '/tasks', button: 'Open' },
                    ].map((action, i) => (
                        <div key={i} className="glass-panel p-5 rounded-2xl border border-white/5 bg-[#0e0e12] flex flex-col hover:bg-white/5 transition-colors group">
                            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                <action.icon size={20} className={action.color} />
                            </div>
                            <h4 className="font-bold text-white mb-1">{action.title}</h4>
                            <p className="text-sm text-gray-500 mb-6">{action.desc}</p>
                            <button
                                onClick={() => navigate(action.path)}
                                className={clsx("mt-auto text-sm font-medium flex items-center gap-1 transition-colors", action.color)}
                            >
                                {action.button} <ArrowRight size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom Row: Recent Notes & Pending Tasks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Notes */}
                <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-[#0e0e12] min-h-[200px] flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-white">Recent Notes</h3>
                        <button onClick={() => navigate('/notes')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View all</button>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
                        <FileText size={32} className="text-gray-600 mb-2" />
                        <p className="text-sm text-gray-500">No notes yet. Start taking notes!</p>
                    </div>
                </div>

                {/* Pending Tasks */}
                <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-[#0e0e12] min-h-[200px] flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-white">Pending Tasks</h3>
                        <button onClick={() => navigate('/tasks')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View all</button>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
                        <CheckSquare size={32} className="text-gray-600 mb-2" />
                        <p className="text-sm text-gray-500">All tasks completed! Great work!</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

import React, { useState } from 'react';
import {
    CheckSquare, Plus, Check, Filter, Sparkles, Loader2, X
} from 'lucide-react';
import clsx from 'clsx';
import axios from 'axios';

export const Tasks = () => {
    const [tasks, setTasks] = useState([]);
    const [activeFilter, setActiveFilter] = useState('All');

    // AI Plan State
    const [aiGoal, setAiGoal] = useState('');
    const [isPlanning, setIsPlanning] = useState(false);
    const [showAiInput, setShowAiInput] = useState(false);

    // Add Task Modal State
    const [showAddModal, setShowAddModal] = useState(false);
    const [newTask, setNewTask] = useState({ text: '', tag: 'Study' });

    const stats = {
        total: tasks.length,
        completed: tasks.filter(t => t.completed).length,
    };

    const progress = stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100);
    const filters = ['All', 'Study', 'Work', 'Personal', 'Other'];
    const tags = ['Study', 'Work', 'Personal', 'Other'];

    const addTask = () => {
        if (!newTask.text.trim()) return;
        setTasks(prev => [
            { id: Date.now() + Math.random(), text: newTask.text, completed: false, tag: newTask.tag },
            ...prev
        ]);
        setNewTask({ text: '', tag: 'Study' });
        setShowAddModal(false);
    };

    const handleAiPlan = async () => {
        if (!aiGoal.trim()) return;
        setIsPlanning(true);
        try {
            const res = await axios.post('http://localhost:8001/api/tasks/suggest', { goal: aiGoal });
            // Extract bullet points from response (assuming Markdown-ish or numbered list)
            const suggestions = res.data.suggestions.split('\n').filter(line => line.trim().length > 0);

            const newTasks = suggestions.map((s, i) => ({
                id: Date.now() + i,
                text: s.replace(/^[0-9-.*]\s*/, ''), // Remove leading bullets/numbers
                completed: false,
                tag: 'Study'
            }));

            setTasks(prev => [...newTasks, ...prev]);
            setAiGoal('');
            setShowAiInput(false);
        } catch (error) {
            console.error(error);
            alert("Failed to generate plan");
        } finally {
            setIsPlanning(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] animate-in fade-in zoom-in-95 duration-500 max-w-5xl mx-auto w-full pb-8 relative">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">Task Manager</h1>
                    <p className="text-gray-400">{stats.completed} of {stats.total} tasks completed</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowAiInput(!showAiInput)}
                        className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-purple-500 hover:to-purple-400 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/20 transition-all flex items-center gap-2"
                    >
                        <Sparkles size={18} /> AI Plan
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2"
                    >
                        <Plus size={18} /> Add Task
                    </button>
                </div>
            </div>

            {/* AI Input Area */}
            {showAiInput && (
                <div className="mb-6 bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4 animate-in slide-in-from-top-2">
                    <label className="text-sm font-medium text-purple-300 mb-2 block">What's your big goal?</label>
                    <div className="flex gap-2">
                        <input
                            value={aiGoal}
                            onChange={e => setAiGoal(e.target.value)}
                            placeholder="e.g., 'Master React Hooks' or 'Prepare for Biology Exam'"
                            className="flex-1 bg-[#0e0e12] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                            onKeyDown={e => e.key === 'Enter' && handleAiPlan()}
                        />
                        <button
                            onClick={handleAiPlan}
                            disabled={isPlanning}
                            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium disabled:opacity-50 min-w-[100px] flex items-center justify-center"
                        >
                            {isPlanning ? <Loader2 size={20} className="animate-spin" /> : "Plan It"}
                        </button>
                    </div>
                </div>
            )}

            {/* Progress Bar Area */}
            <div className="bg-[#0e0e12] border border-white/5 rounded-2xl p-6 mb-8">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-400">Progress</span>
                    <span className="text-sm font-bold text-cyan-400">{progress}%</span>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Filters Row */}
            <div className="flex items-center gap-3 mb-8">
                <div className="p-2 text-gray-500">
                    <Filter size={18} />
                </div>
                {filters.map(filter => (
                    <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={clsx(
                            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                            activeFilter === filter
                                ? "bg-cyan-500 text-black"
                                : "bg-[#0e0e12] border border-white/5 text-gray-400 hover:bg-white/5 hover:text-white"
                        )}
                    >
                        {filter}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-[300px] flex flex-col items-center justify-start border-t border-white/5 relative pt-4 w-full">
                {tasks.length === 0 ? (
                    <div className="text-center mt-20">
                        <div className="w-12 h-12 mx-auto mb-4 border-2 border-dashed border-gray-600 rounded-xl flex items-center justify-center opacity-50">
                            <CheckSquare size={24} className="text-gray-500" />
                        </div>
                        <p className="text-gray-500 text-lg">No tasks yet. Add your first task or ask AI to plan!</p>
                    </div>
                ) : (
                    <div className="w-full space-y-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                        {tasks
                            .filter(t => activeFilter === 'All' || t.tag === activeFilter)
                            .map((task) => (
                                <div key={task.id} className="group flex items-center gap-4 p-4 rounded-xl bg-[#0e0e12] border border-white/5 hover:border-cyan-500/20 transition-all animate-in fade-in slide-in-from-bottom-2">
                                    <button
                                        onClick={() => setTasks(tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t))}
                                        className={clsx(
                                            "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                                            task.completed ? "bg-cyan-500 border-cyan-500" : "border-gray-600 hover:border-cyan-500"
                                        )}
                                    >
                                        {task.completed && <Check size={14} className="text-black" strokeWidth={3} />}
                                    </button>
                                    <span className={clsx("flex-1 font-medium", task.completed ? "text-gray-500 line-through" : "text-white")}>
                                        {task.text}
                                    </span>
                                    <span className="text-xs text-gray-600 bg-white/5 px-2 py-1 rounded-md">{task.tag}</span>
                                </div>
                            ))}
                    </div>
                )}
            </div>

            {/* Add Task Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#1a1a1f] border border-white/10 rounded-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">Add New Task</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Task Description</label>
                                <input
                                    value={newTask.text}
                                    onChange={e => setNewTask({ ...newTask, text: e.target.value })}
                                    className="w-full bg-[#0e0e12] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                                    placeholder="What needs to be done?"
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && addTask()}
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Category Tag</label>
                                <div className="flex flex-wrap gap-2">
                                    {tags.map(tag => (
                                        <button
                                            key={tag}
                                            onClick={() => setNewTask({ ...newTask, tag })}
                                            className={clsx(
                                                "px-3 py-1.5 rounded-lg text-sm transition-all border",
                                                newTask.tag === tag
                                                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                                                    : "bg-[#0e0e12] border-white/10 text-gray-400 hover:bg-white/5"
                                            )}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={addTask}
                                    className="flex-1 py-2 rounded-xl bg-cyan-500 text-black font-semibold hover:bg-cyan-400"
                                >
                                    Add Task
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

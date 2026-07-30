import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    Award,
    Bot,
    Boxes,
    Brain,
    Camera,
    CheckSquare,
    Clock,
    Cpu,
    FileText,
    Layers,
    MessageSquare,
    Mic,
    Notebook,
    Sparkles,
    Star,
    TrendingDown,
    Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, Panel, Progress } from '../components/ui';
import api from '../lib/api';
import { useStore } from '../store/useStore';

/**
 * Dashboard.
 *
 * Every number here is real — read from the store or the API. The original
 * version hardcoded "0h 0m", "30 XP" and "Level 1" regardless of what the user
 * had actually done.
 */

const FEATURES = [
    {
        title: 'Study Agents',
        description: 'Name an exam. A crew researches it and builds your schedule.',
        icon: Bot,
        path: '/agents',
        tag: 'agentic',
    },
    {
        title: 'Vision',
        description: 'Point your camera at a problem and hear it solved.',
        icon: Camera,
        path: '/vision',
        tag: 'multimodal',
    },
    {
        title: 'Live Voice',
        description: 'Talk, interrupt, be understood. Speech starts in about a second.',
        icon: Mic,
        path: '/voice',
        tag: 'realtime',
    },
    {
        title: 'Spatial 3D',
        description: 'Generated diagrams you can orbit — or step into in AR.',
        icon: Boxes,
        path: '/spatial',
        tag: 'webxr',
    },
    {
        title: 'Memory Graph',
        description: 'A map of what you know, and what keeps slipping.',
        icon: Brain,
        path: '/memory',
        tag: 'rag',
    },
    {
        title: 'Local AI',
        description: 'Run a model on your own GPU. Works on a plane.',
        icon: Cpu,
        path: '/local-ai',
        tag: 'offline',
    },
];

const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
};

export const Home = () => {
    const navigate = useNavigate();
    const xp = useStore((s) => s.xp);
    const studySeconds = useStore((s) => s.studySeconds);
    const tasks = useStore((s) => s.tasks);
    const notes = useStore((s) => s.notes);
    const cards = useStore((s) => s.cards);
    const focus = useStore((s) => s.focus);
    const health = useStore((s) => s.health);

    const [weak, setWeak] = useState([]);
    const [jobs, setJobs] = useState([]);

    useEffect(() => {
        // Both are enhancements to the dashboard; a failure just hides the panel.
        api.weakConcepts(5)
            .then((result) => setWeak(result.concepts || []))
            .catch(() => {});
        api.listJobs()
            .then((result) => setJobs((result.jobs || []).slice(0, 3)))
            .catch(() => {});
    }, []);

    const level = Math.floor(xp / 1000) + 1;
    const xpIntoLevel = xp % 1000;
    const openTasks = tasks.filter((task) => !task.done);
    const doneTasks = tasks.length - openTasks.length;

    const stats = [
        {
            label: 'Study time',
            value: formatDuration(studySeconds),
            icon: Clock,
            colour: 'text-cyan-400',
        },
        {
            label: 'Focus sessions',
            value: focus.completedSessions,
            icon: Zap,
            colour: 'text-orange-400',
        },
        { label: 'XP earned', value: xp, icon: Star, colour: 'text-violet-400' },
        { label: 'Level', value: level, icon: Award, colour: 'text-pink-400' },
    ];

    return (
        <div className="animate-fade space-y-8 pb-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-app text-2xl font-bold tracking-tight sm:text-3xl">
                        Welcome back to <span className="accent-text">NEURA AI</span>
                    </h1>
                    <p className="text-app-muted mt-1 text-sm">
                        {health?.active_provider === 'offline'
                            ? 'No language model is configured yet — set one up in Settings to unlock full answers.'
                            : 'Your agentic, multimodal study companion is ready.'}
                    </p>
                </div>
                <Button icon={Sparkles} onClick={() => navigate('/agents')}>
                    Plan an exam
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {stats.map((stat) => (
                    <Panel key={stat.label} className="flex items-center gap-3 p-4">
                        <div className="accent-bg flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                            <stat.icon size={20} className={stat.colour} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-app-muted truncate text-[11px] font-medium uppercase tracking-wider">
                                {stat.label}
                            </p>
                            <p className="text-app tabular text-xl font-bold">{stat.value}</p>
                        </div>
                    </Panel>
                ))}
            </div>

            <Panel className="p-5">
                <div className="mb-2 flex items-end justify-between">
                    <div>
                        <h3 className="text-app font-bold">Level {level}</h3>
                        <p className="text-app-muted text-xs">{1000 - xpIntoLevel} XP to the next level</p>
                    </div>
                    <span className="accent-text flex items-center gap-1 text-sm font-bold">
                        <Star size={14} fill="currentColor" /> {xp} XP
                    </span>
                </div>
                <Progress value={(xpIntoLevel / 1000) * 100} />
            </Panel>

            <div>
                <h3 className="text-app mb-4 font-bold">What is new</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map((feature) => (
                        <button
                            key={feature.path}
                            type="button"
                            onClick={() => navigate(feature.path)}
                            className="surface hover:accent-bg focus-ring group rounded-2xl p-5 text-left transition-all"
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <div className="accent-bg flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110">
                                    <feature.icon size={19} className="accent-text" />
                                </div>
                                <Badge>{feature.tag}</Badge>
                            </div>
                            <h4 className="text-app font-bold">{feature.title}</h4>
                            <p className="text-app-muted mt-1 text-sm">{feature.description}</p>
                            <span className="accent-text mt-3 flex items-center gap-1 text-xs font-medium">
                                Open <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {weak.length > 0 && (
                <Panel className="border-amber-500/25 p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-app flex items-center gap-2 font-bold">
                            <TrendingDown size={16} className="text-amber-400" />
                            Needs another pass
                        </h3>
                        <button
                            type="button"
                            onClick={() => navigate('/memory')}
                            className="accent-text focus-ring text-xs underline"
                        >
                            View graph
                        </button>
                    </div>
                    <div className="space-y-2">
                        {weak.map((concept) => (
                            <div key={concept.key} className="flex items-center gap-3">
                                <span className="text-app min-w-0 flex-1 truncate text-sm">
                                    {concept.name}
                                </span>
                                <div className="w-24 shrink-0">
                                    <Progress value={(concept.mastery ?? 0) * 100} />
                                </div>
                                <span className="text-app-muted tabular w-9 shrink-0 text-right text-xs">
                                    {Math.round((concept.mastery ?? 0) * 100)}%
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-app-muted mt-3 text-xs">
                        Explanations across the app already account for these.
                    </p>
                </Panel>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
                <Panel className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-app font-bold">Open tasks</h3>
                        <button
                            type="button"
                            onClick={() => navigate('/tasks')}
                            className="accent-text focus-ring text-xs underline"
                        >
                            All tasks
                        </button>
                    </div>
                    {openTasks.length === 0 ? (
                        <div className="text-app-muted flex flex-col items-center py-6 text-center">
                            <CheckSquare size={26} className="mb-2 opacity-30" />
                            <p className="text-sm">
                                {tasks.length ? 'Everything done. Nice.' : 'No tasks yet.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {openTasks.slice(0, 5).map((task) => (
                                <div key={task.id} className="flex items-start gap-2">
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                                    <p className="text-app-muted min-w-0 flex-1 text-sm">{task.text}</p>
                                </div>
                            ))}
                            {doneTasks > 0 && (
                                <p className="text-app-muted border-app mt-3 border-t pt-2 text-xs">
                                    {doneTasks} completed
                                </p>
                            )}
                        </div>
                    )}
                </Panel>

                <Panel className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-app font-bold">Recent notes</h3>
                        <button
                            type="button"
                            onClick={() => navigate('/notes')}
                            className="accent-text focus-ring text-xs underline"
                        >
                            All notes
                        </button>
                    </div>
                    {notes.length === 0 ? (
                        <div className="text-app-muted flex flex-col items-center py-6 text-center">
                            <Notebook size={26} className="mb-2 opacity-30" />
                            <p className="text-sm">No notes yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {notes.slice(0, 4).map((note) => (
                                <button
                                    key={note.id}
                                    type="button"
                                    onClick={() => navigate('/notes')}
                                    className="focus-ring w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--border-subtle)]"
                                >
                                    <p className="text-app truncate text-sm font-medium">
                                        {note.title || 'Untitled'}
                                    </p>
                                    <p className="text-app-muted truncate text-xs">{note.content}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-app font-bold">Active plans</h3>
                        <button
                            type="button"
                            onClick={() => navigate('/agents')}
                            className="accent-text focus-ring text-xs underline"
                        >
                            All plans
                        </button>
                    </div>
                    {jobs.length === 0 ? (
                        <div className="text-app-muted flex flex-col items-center py-6 text-center">
                            <Bot size={26} className="mb-2 opacity-30" />
                            <p className="text-sm">No study plans yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {jobs.map((job) => (
                                <button
                                    key={job.id}
                                    type="button"
                                    onClick={() => navigate('/agents')}
                                    className="focus-ring w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--border-subtle)]"
                                >
                                    <p className="text-app truncate text-sm font-medium">{job.goal}</p>
                                    <div className="mt-1 flex items-center gap-2">
                                        <Progress
                                            value={(job.progress.completed / Math.max(1, job.progress.total)) * 100}
                                            className="flex-1"
                                        />
                                        <span
                                            className={clsx(
                                                'text-[10px] font-medium',
                                                job.status === 'done' ? 'text-emerald-400' : 'accent-text',
                                            )}
                                        >
                                            {job.status}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            <div>
                <h3 className="text-app mb-4 font-bold">Jump to</h3>
                <div className="flex flex-wrap gap-2">
                    {[
                        { icon: MessageSquare, label: 'Chat', path: '/chat' },
                        { icon: Sparkles, label: 'Study', path: '/study' },
                        { icon: FileText, label: 'PDF', path: '/pdf' },
                        { icon: Layers, label: `Flashcards (${cards.length})`, path: '/flashcards' },
                    ].map((item) => (
                        <button
                            key={item.path}
                            type="button"
                            onClick={() => navigate(item.path)}
                            className="surface hover:accent-bg focus-ring flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-colors"
                        >
                            <item.icon size={15} className="accent-text" />
                            <span className="text-app">{item.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Home;

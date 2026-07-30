import React, { useState } from 'react';
import { Check, CheckSquare, Plus, Sparkles, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import {
    Badge,
    Button,
    EmptyState,
    ErrorNote,
    PageHeader,
    Panel,
    Select,
    TextInput,
} from '../components/ui';
import api from '../lib/api';
import { useStore } from '../store/useStore';

/** Task list with AI breakdown. Tasks persist in local storage. */

const FILTERS = ['All', 'Open', 'Done'];
const TAGS = ['Study', 'Coding', 'Admin', 'Health'];

const PRIORITY_TONE = { high: 'bad', medium: 'warn', low: 'neutral' };

export const Tasks = () => {
    const tasks = useStore((s) => s.tasks);
    const addTask = useStore((s) => s.addTask);
    const addTasks = useStore((s) => s.addTasks);
    const toggleTask = useStore((s) => s.toggleTask);
    const removeTask = useStore((s) => s.removeTask);
    const awardXp = useStore((s) => s.awardXp);

    const [filter, setFilter] = useState('All');
    const [text, setText] = useState('');
    const [tag, setTag] = useState('Study');
    const [goal, setGoal] = useState('');
    const [planning, setPlanning] = useState(false);
    const [error, setError] = useState(null);

    const visible = tasks.filter((task) =>
        filter === 'All' ? true : filter === 'Open' ? !task.done : task.done,
    );
    const openCount = tasks.filter((task) => !task.done).length;

    const create = () => {
        const value = text.trim();
        if (!value) return;
        addTask({ text: value, tag, priority: 'medium' });
        setText('');
    };

    const complete = (task) => {
        toggleTask(task.id);
        // Award only on completion, not on un-checking.
        if (!task.done) awardXp(10, 'task done');
    };

    const breakDown = async () => {
        const value = goal.trim();
        if (!value || planning) return;

        setPlanning(true);
        setError(null);
        try {
            const result = await api.suggestTasks(value);
            if (result.tasks?.length) {
                addTasks(
                    result.tasks.map((item) => ({
                        text: item.text,
                        tag: TAGS.includes(item.tag) ? item.tag : 'Study',
                        priority: item.priority,
                        estimate_minutes: item.estimate_minutes,
                    })),
                );
                setGoal('');
                awardXp(15, 'goal planned');
            } else {
                setError('No sub-tasks came back. Try describing the goal more concretely.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setPlanning(false);
        }
    };

    return (
        <div className="animate-fade">
            <PageHeader
                title="Tasks"
                subtitle={
                    tasks.length
                        ? `${openCount} open of ${tasks.length}`
                        : 'Break a goal into actions you can actually start.'
                }
                actions={
                    <Select value={filter} onChange={(event) => setFilter(event.target.value)}>
                        {FILTERS.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </Select>
                }
            />

            <Panel className="mb-4 p-5">
                <p className="text-app mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Sparkles size={15} className="accent-text" /> Break down a goal
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <TextInput
                        value={goal}
                        onChange={(event) => setGoal(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && breakDown()}
                        placeholder="Finish my machine learning coursework"
                        disabled={planning}
                    />
                    <Button onClick={breakDown} loading={planning} disabled={!goal.trim()}>
                        Plan it
                    </Button>
                </div>
            </Panel>

            <ErrorNote error={error} className="mb-4" />

            <Panel className="mb-4 p-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <TextInput
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && create()}
                        placeholder="Add a task…"
                    />
                    <Select value={tag} onChange={(event) => setTag(event.target.value)}>
                        {TAGS.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </Select>
                    <Button icon={Plus} onClick={create} disabled={!text.trim()}>
                        Add
                    </Button>
                </div>
            </Panel>

            {visible.length === 0 ? (
                <Panel>
                    <EmptyState
                        icon={CheckSquare}
                        title={
                            tasks.length === 0
                                ? 'No tasks yet'
                                : filter === 'Done'
                                  ? 'Nothing completed yet'
                                  : 'All clear'
                        }
                    >
                        {tasks.length === 0
                            ? 'Add one above, or describe a goal and let NEURA break it into steps.'
                            : 'Switch the filter to see your other tasks.'}
                    </EmptyState>
                </Panel>
            ) : (
                <div className="space-y-2">
                    {visible.map((task) => (
                        <Panel
                            key={task.id}
                            className={clsx(
                                'group flex items-start gap-3 p-4 transition-opacity',
                                task.done && 'opacity-55',
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => complete(task)}
                                aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
                                className={clsx(
                                    'focus-ring mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all',
                                    task.done
                                        ? 'border-[var(--accent)] bg-[var(--accent)] text-black'
                                        : 'border-app hover:border-[var(--accent)]',
                                )}
                            >
                                {task.done && <Check size={13} />}
                            </button>

                            <div className="min-w-0 flex-1">
                                <p
                                    className={clsx(
                                        'text-app text-sm',
                                        task.done && 'line-through opacity-70',
                                    )}
                                >
                                    {task.text}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                    <Badge>{task.tag}</Badge>
                                    {task.priority && task.priority !== 'medium' && (
                                        <Badge tone={PRIORITY_TONE[task.priority] || 'neutral'}>
                                            {task.priority}
                                        </Badge>
                                    )}
                                    {task.estimate_minutes && <Badge>{task.estimate_minutes} min</Badge>}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => removeTask(task.id)}
                                aria-label="Delete task"
                                className="text-app-muted focus-ring shrink-0 rounded-lg p-1.5 opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                            >
                                <Trash2 size={15} />
                            </button>
                        </Panel>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Tasks;

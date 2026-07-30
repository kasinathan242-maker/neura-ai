import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertCircle,
    Bell,
    Bot,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronRight,
    Download,
    ExternalLink,
    FileText,
    Loader2,
    Play,
    Plus,
    Sparkles,
    Target,
} from 'lucide-react';
import clsx from 'clsx';
import {
    Badge,
    Button,
    EmptyState,
    ErrorNote,
    Markdown,
    PageHeader,
    Panel,
    Progress,
    Select,
    TextInput,
} from '../components/ui';
import api from '../lib/api';
import { useStore } from '../store/useStore';

/**
 * Autonomous study agents.
 *
 * The crew runs one step per request and the browser drives the loop. That is
 * what lets a long research job (a decomposition, one web search per subtopic,
 * document retrieval, planning, scheduling, quiz writing) complete on a platform
 * with a short function timeout, while still showing live progress.
 */

const STATUS_ICON = {
    pending: null,
    running: Loader2,
    done: Check,
    failed: AlertCircle,
    skipped: null,
};

function StepList({ steps, cursor }) {
    return (
        <div className="space-y-1">
            {steps.map((step, index) => {
                const Icon = STATUS_ICON[step.status];
                const isCurrent = index === cursor && step.status === 'running';
                return (
                    <div
                        key={`${step.action}-${index}`}
                        className={clsx(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                            isCurrent && 'accent-bg',
                            step.status === 'failed' && 'bg-red-500/5',
                        )}
                    >
                        <span
                            className={clsx(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]',
                                step.status === 'done'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : step.status === 'running'
                                      ? 'accent-bg accent-text'
                                      : step.status === 'failed'
                                        ? 'bg-red-500/20 text-red-400'
                                        : 'bg-[var(--border-subtle)] text-app-muted',
                            )}
                        >
                            {Icon ? (
                                <Icon size={11} className={step.status === 'running' ? 'animate-spin' : ''} />
                            ) : (
                                index + 1
                            )}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p
                                className={clsx(
                                    'truncate',
                                    step.status === 'pending' ? 'text-app-muted' : 'text-app',
                                )}
                            >
                                {step.label}
                            </p>
                            {step.error && <p className="mt-0.5 text-xs text-red-400">{step.error}</p>}
                        </div>
                        <span className="text-app-muted shrink-0 text-[11px]">{step.agent}</span>
                    </div>
                );
            })}
        </div>
    );
}

function Trace({ entries }) {
    const endRef = useRef(null);
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [entries.length]);

    if (!entries.length) return null;

    return (
        <div className="no-scrollbar max-h-52 space-y-1.5 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {entries.map((entry, index) => (
                <div key={index} className="flex gap-2">
                    <span
                        className={clsx(
                            'shrink-0',
                            entry.kind === 'error'
                                ? 'text-red-400'
                                : entry.kind === 'warn'
                                  ? 'text-amber-400'
                                  : entry.kind === 'success'
                                    ? 'text-emerald-400'
                                    : 'accent-text',
                        )}
                    >
                        [{entry.agent}]
                    </span>
                    <span className="text-app-muted min-w-0 break-words">{entry.message}</span>
                </div>
            ))}
            <div ref={endRef} />
        </div>
    );
}

function MicroQuiz({ quiz, jobId, onScored }) {
    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [saving, setSaving] = useState(false);
    const awardXp = useStore((s) => s.awardXp);

    const questions = quiz.questions || [];
    const correct = questions.filter((q) => answers[q.id] === q.answer).length;

    const submit = async () => {
        setSaving(true);
        setSubmitted(true);
        try {
            const result = await api.agentQuizResult(jobId, quiz.day, correct, questions.length);
            awardXp(correct * 10, 'micro-quiz');
            onScored?.(result);
        } catch {
            // The score is still shown; only the mastery write failed.
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {questions.map((question) => (
                <div key={question.id}>
                    <p className="text-app mb-2 text-sm font-medium">{question.question}</p>
                    <div className="space-y-1.5">
                        {question.options.map((option) => {
                            const chosen = answers[question.id] === option;
                            const isRight = option === question.answer;
                            return (
                                <button
                                    key={option}
                                    type="button"
                                    disabled={submitted}
                                    onClick={() => setAnswers((a) => ({ ...a, [question.id]: option }))}
                                    className={clsx(
                                        'focus-ring w-full rounded-lg px-3 py-2 text-left text-sm transition-all',
                                        submitted
                                            ? isRight
                                                ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                                : chosen
                                                  ? 'border border-red-500/40 bg-red-500/10 text-red-200'
                                                  : 'border-app text-app-muted border'
                                            : chosen
                                              ? 'accent-bg accent-text'
                                              : 'border-app text-app-muted hover:text-app border',
                                    )}
                                >
                                    {option}
                                </button>
                            );
                        })}
                    </div>
                    {submitted && question.explanation && (
                        <p className="text-app-muted mt-2 text-xs">{question.explanation}</p>
                    )}
                </div>
            ))}

            {submitted ? (
                <div className="accent-bg rounded-lg px-4 py-3 text-sm">
                    <p className="text-app font-semibold">
                        {correct} / {questions.length} correct
                    </p>
                    <p className="text-app-muted mt-1 text-xs">
                        {saving
                            ? 'Saving to your knowledge graph…'
                            : 'Recorded. Weak concepts will get more attention in future explanations.'}
                    </p>
                </div>
            ) : (
                <Button
                    onClick={submit}
                    disabled={Object.keys(answers).length < questions.length}
                    size="sm"
                >
                    Submit answers
                </Button>
            )}
        </div>
    );
}

export const Agents = () => {
    const [goal, setGoal] = useState('');
    const [days, setDays] = useState(7);
    const [minutes, setMinutes] = useState(60);
    const [job, setJob] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState(null);
    const [openQuiz, setOpenQuiz] = useState(null);

    const scheduleNotifications = useStore((s) => s.scheduleNotifications);
    const requestPermission = useStore((s) => s.requestNotificationPermission);
    const notify = useStore((s) => s.notify);
    const addTasks = useStore((s) => s.addTasks);
    const awardXp = useStore((s) => s.awardXp);

    const cancelledRef = useRef(false);

    const refreshJobs = useCallback(async () => {
        try {
            const result = await api.listJobs();
            setJobs(result.jobs || []);
        } catch {
            // The list is a convenience; a failure here should not block creation.
        }
    }, []);

    // The list of previous runs is a nice-to-have, so a failure here is
    // swallowed rather than surfaced. Every state write happens after an await,
    // and the cancelled flag stops a late response touching an unmounted page.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await api.listJobs();
                if (!cancelled) setJobs(result.jobs || []);
            } catch {
                // Leaves the list empty; creating a new plan still works.
            }
        })();
        return () => {
            cancelled = true;
            cancelledRef.current = true;
        };
    }, []);

    /** Drive the crew to completion, one step per request. */
    const drive = useCallback(
        async (jobId) => {
            setRunning(true);
            setError(null);
            cancelledRef.current = false;


            // Bounded so a backend that never reaches a terminal state cannot spin
            // forever; the ceiling is well above the longest real pipeline.
            for (let guard = 0; guard < 60; guard += 1) {
                if (cancelledRef.current) break;
                try {
                    const result = await api.stepJob(jobId);
                    setJob(result.job);
                    if (result.status === 'done' || result.status === 'failed') {
                        return result.job;
                    }
                } catch (err) {
                    setError(err.message);
                    break;
                }
            }
            return null;
        },
        [],
    );

    const launch = async () => {
        if (!goal.trim()) return;
        setError(null);
        setJob(null);
        setOpenQuiz(null);
        // Reflect the click immediately. Waiting until `drive()` sets this left
        // the button looking idle through the whole first request.
        setRunning(true);

        // Fire-and-forget: never block the run on a permission dialog. Awaiting
        // it meant a browser that leaves the prompt pending (or a user who just
        // ignores it) hung the launch with no feedback at all. Reminders are
        // stored in-app regardless, so a denied permission costs nothing.
        requestPermission().catch(() => {});

        try {
            const created = await api.createJob(goal.trim(), Number(days), Number(minutes));
            const finished = await drive(created.id);

            if (finished) {
                const notifications = finished.artifacts?.notifications || [];
                if (notifications.length) scheduleNotifications(notifications);

                const plan = finished.artifacts?.plan || [];
                if (plan.length) {
                    addTasks(
                        plan.map((day) => ({
                            text: `Day ${day.day}: ${day.focus}`,
                            tag: 'Study',
                            estimate_minutes: day.minutes,
                            priority: 'high',
                        })),
                    );
                }

                awardXp(100, 'study plan');
                notify(
                    'Study plan ready',
                    `${plan.length} days mapped out for ${finished.artifacts?.subject || goal}.`,
                );
                refreshJobs();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setRunning(false);
        }
    };

    const openJob = async (id) => {
        setError(null);
        setOpenQuiz(null);
        try {
            const result = await api.getJob(id);
            setJob(result.job);
            if (result.job.status === 'running' || result.job.status === 'queued') {
                drive(id).finally(() => setRunning(false));
            }
        } catch (err) {
            setError(err.message);
        }
    };

    const artifacts = job?.artifacts || {};
    const progress = job ? (job.cursor / Math.max(1, job.steps.length)) * 100 : 0;

    return (
        <div className="animate-fade">
            <PageHeader
                title="Study Agents"
                subtitle="Describe an exam. A crew of agents researches it, plans it and quizzes you."
                badge={<Badge tone="accent"><Bot size={11} /> Autonomous</Badge>}
            />

            <Panel className="mb-6 p-5">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                    <TextInput
                        value={goal}
                        onChange={(event) => setGoal(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && !running && launch()}
                        placeholder="I have a big exam on Quantum Physics next week"
                        disabled={running}
                    />
                    <Select value={days} onChange={(e) => setDays(e.target.value)} disabled={running}>
                        {[3, 5, 7, 10, 14, 21, 30].map((value) => (
                            <option key={value} value={value}>
                                {value} days
                            </option>
                        ))}
                    </Select>
                    <Select value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={running}>
                        {[30, 45, 60, 90, 120].map((value) => (
                            <option key={value} value={value}>
                                {value} min/day
                            </option>
                        ))}
                    </Select>
                    <Button icon={running ? undefined : Play} onClick={launch} loading={running}>
                        {running ? 'Working…' : 'Launch crew'}
                    </Button>
                </div>

                <p className="text-app-muted mt-3 text-xs">
                    The crew decomposes the subject, searches the open web per subtopic, collects source
                    documents, writes a day-by-day plan, produces an importable calendar, and writes a
                    micro-quiz for each day.
                </p>
            </Panel>

            <ErrorNote error={error} className="mb-6" onRetry={job ? () => drive(job.id) : undefined} />

            {job && (
                <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
                    <div className="space-y-4">
                        <Panel className="p-5">
                            <div className="mb-3 flex items-center justify-between">
                                <p className="text-app text-sm font-semibold">
                                    {artifacts.subject || job.goal}
                                </p>
                                <Badge
                                    tone={
                                        job.status === 'done'
                                            ? 'good'
                                            : job.status === 'failed'
                                              ? 'bad'
                                              : 'accent'
                                    }
                                >
                                    {job.status}
                                </Badge>
                            </div>
                            <Progress value={progress} className="mb-2" />
                            <p className="text-app-muted mb-4 text-xs">
                                {job.cursor} of {job.steps.length} steps
                            </p>
                            <StepList steps={job.steps} cursor={job.cursor} />
                        </Panel>

                        {job.trace?.length > 0 && (
                            <Panel className="p-4">
                                <p className="text-app-muted mb-2 text-xs font-semibold uppercase tracking-wider">
                                    Agent activity
                                </p>
                                <Trace entries={job.trace} />
                            </Panel>
                        )}
                    </div>

                    <div className="space-y-4">
                        {artifacts.briefing && (
                            <Panel className="accent-bg p-5">
                                <div className="mb-2 flex items-center gap-2">
                                    <Sparkles size={15} className="accent-text" />
                                    <p className="text-app text-sm font-semibold">Your briefing</p>
                                </div>
                                <Markdown text={artifacts.briefing} />
                            </Panel>
                        )}

                        {artifacts.plan?.length > 0 && (
                            <Panel className="p-5">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-app flex items-center gap-2 text-sm font-semibold">
                                        <CalendarDays size={15} className="accent-text" />
                                        {artifacts.plan.length}-day plan
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={Download}
                                            onClick={() => window.open(api.calendarUrl(job.id), '_blank')}
                                        >
                                            Add to calendar
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={Bell}
                                            onClick={async () => {
                                                const permission = await requestPermission();
                                                scheduleNotifications(artifacts.notifications || []);
                                                notify(
                                                    'Reminders scheduled',
                                                    permission === 'granted'
                                                        ? `${(artifacts.notifications || []).length} reminders set.`
                                                        : 'Reminders will appear in this app; allow notifications for desktop alerts.',
                                                );
                                            }}
                                        >
                                            Remind me
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {artifacts.plan.map((day) => {
                                        const quiz = (artifacts.quizzes || []).find(
                                            (q) => Number(q.day) === Number(day.day),
                                        );
                                        const isOpen = openQuiz === day.day;
                                        return (
                                            <div key={day.day} className="surface-raised rounded-xl p-4">
                                                <div className="flex items-start gap-3">
                                                    <span className="accent-bg accent-text flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                                                        {day.day}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-app text-sm font-semibold">
                                                            {day.focus}
                                                        </p>
                                                        {day.goal && (
                                                            <p className="text-app-muted mt-1 flex items-start gap-1.5 text-xs">
                                                                <Target size={12} className="mt-0.5 shrink-0" />
                                                                {day.goal}
                                                            </p>
                                                        )}
                                                        {day.activities?.length > 0 && (
                                                            <ul className="text-app-muted mt-2 space-y-1 text-xs">
                                                                {day.activities.map((activity, index) => (
                                                                    <li key={index} className="flex gap-1.5">
                                                                        <ChevronRight
                                                                            size={11}
                                                                            className="mt-0.5 shrink-0 opacity-50"
                                                                        />
                                                                        {activity}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                                            <Badge>{day.minutes} min</Badge>
                                                            {quiz?.questions?.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setOpenQuiz(isOpen ? null : day.day)
                                                                    }
                                                                    className="accent-text focus-ring text-xs underline"
                                                                >
                                                                    {isOpen ? 'Hide' : 'Take'} the{' '}
                                                                    {quiz.questions.length}-question quiz
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {isOpen && quiz && (
                                                    <div className="border-app mt-4 border-t pt-4">
                                                        <MicroQuiz quiz={quiz} jobId={job.id} />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </Panel>
                        )}

                        {artifacts.research?.length > 0 && (
                            <Panel className="p-5">
                                <p className="text-app mb-3 text-sm font-semibold">Research notes</p>
                                <div className="space-y-4">
                                    {artifacts.research.map((entry, index) => (
                                        <div key={index}>
                                            <p className="accent-text text-sm font-medium">{entry.subtopic}</p>
                                            {entry.summary && (
                                                <Markdown text={entry.summary} className="mt-1 text-sm" />
                                            )}
                                            {entry.sources?.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {entry.sources.map((source) => (
                                                        <a
                                                            key={source.url}
                                                            href={source.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="border-app text-app-muted hover:accent-text flex max-w-56 items-center gap-1 truncate rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                                                        >
                                                            <ExternalLink size={10} className="shrink-0" />
                                                            {source.title || source.url}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </Panel>
                        )}

                        {artifacts.documents?.length > 0 && (
                            <Panel className="p-5">
                                <p className="text-app mb-3 flex items-center gap-2 text-sm font-semibold">
                                    <FileText size={15} className="accent-text" /> Source documents
                                </p>
                                <div className="space-y-2">
                                    {artifacts.documents.map((document) => (
                                        <a
                                            key={document.url}
                                            href={document.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="surface-raised hover:accent-bg block rounded-lg p-3 transition-colors"
                                        >
                                            <p className="text-app truncate text-sm font-medium">
                                                {document.title || document.url}
                                            </p>
                                            <p className="text-app-muted mt-0.5 truncate text-xs">
                                                {document.url}
                                            </p>
                                            {document.excerpt && (
                                                <p className="text-app-muted mt-1.5 line-clamp-2 text-xs italic">
                                                    {document.excerpt}
                                                </p>
                                            )}
                                        </a>
                                    ))}
                                </div>
                            </Panel>
                        )}
                    </div>
                </div>
            )}

            {jobs.length > 0 && (
                <Panel className="p-5">
                    <p className="text-app mb-3 text-sm font-semibold">Previous runs</p>
                    <div className="space-y-2">
                        {jobs.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => openJob(item.id)}
                                className={clsx(
                                    'focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                                    job?.id === item.id ? 'accent-bg' : 'hover:bg-[var(--border-subtle)]',
                                )}
                            >
                                {item.status === 'done' ? (
                                    <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                                ) : item.status === 'failed' ? (
                                    <AlertCircle size={15} className="shrink-0 text-red-400" />
                                ) : (
                                    <Loader2 size={15} className="accent-text shrink-0 animate-spin" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-app truncate text-sm">{item.goal}</p>
                                    <p className="text-app-muted text-xs">
                                        {item.days} days · {item.progress.completed}/{item.progress.total} steps
                                        {item.subtopics?.length
                                            ? ` · ${item.subtopics.length} subtopics`
                                            : ''}
                                    </p>
                                </div>
                                <ChevronRight size={15} className="text-app-muted shrink-0" />
                            </button>
                        ))}
                    </div>
                </Panel>
            )}

            {!job && jobs.length === 0 && !running && (
                <Panel>
                    <EmptyState
                        icon={Bot}
                        title="No plans yet"
                        action={
                            <Button
                                icon={Plus}
                                onClick={() => setGoal('I have a big exam on Quantum Physics next week')}
                            >
                                Use the example goal
                            </Button>
                        }
                    >
                        Tell the crew what you are preparing for. It will research the subject on the open
                        web, build a schedule you can import into your calendar, and write quizzes to test
                        each day's material.
                    </EmptyState>
                </Panel>
            )}
        </div>
    );
};

export default Agents;

import React, { useEffect, useRef, useState } from 'react';
import {
    ArrowLeft,
    Brain,
    CheckCircle,
    GraduationCap,
    Layers,
    RotateCw,
    Send,
    Sparkles,
    XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import {
    Badge,
    Button,
    ErrorNote,
    Markdown,
    PageHeader,
    Panel,
    Progress,
    Select,
    Spinner,
    TextInput,
} from '../components/ui';
import api from '../lib/api';
import { useStore } from '../store/useStore';

/**
 * Three study modes: an explainer, a Socratic tutor, and a quiz.
 *
 * Quiz results are posted back as mastery signals, so a low score on a topic
 * changes how later explanations are pitched — the feedback loop behind the
 * knowledge graph.
 */

const MODES = [
    {
        id: 'learn',
        title: 'Learn a topic',
        description: 'A structured explanation, adapted to what you already know.',
        icon: GraduationCap,
    },
    {
        id: 'tutor',
        title: 'Socratic tutor',
        description: 'It asks, you answer. Best for working through something difficult.',
        icon: Brain,
    },
    {
        id: 'quiz',
        title: 'Test yourself',
        description: 'Retrieval practice, weighted towards your weak spots.',
        icon: Layers,
    },
];

function LearnMode() {
    const [topic, setTopic] = useState('');
    const [depth, setDepth] = useState('intermediate');
    const [explanation, setExplanation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [personalised, setPersonalised] = useState(false);
    const abortRef = useRef(null);
    const awardXp = useStore((s) => s.awardXp);
    const addCards = useStore((s) => s.addCards);

    useEffect(() => () => abortRef.current?.abort(), []);

    const run = async () => {
        const subject = topic.trim();
        if (!subject || busy) return;

        setBusy(true);
        setError(null);
        setExplanation('');
        setPersonalised(false);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const { text, meta } = await api.explainStream(subject, depth, {
                signal: controller.signal,
                onDelta: (_, full) => setExplanation(full),
                onMeta: (event) => {
                    if (event.type === 'context') setPersonalised(Boolean(event.memory_used));
                },
            });
            if (meta?.error) setError(meta.error);
            if (text.trim()) awardXp(15, 'topic explained');
        } catch (err) {
            if (err?.name !== 'AbortError') setError(err.message);
        } finally {
            setBusy(false);
            abortRef.current = null;
        }
    };

    const makeCard = () => {
        addCards([
            {
                question: `Explain ${topic}`,
                answer: explanation.slice(0, 600),
                tag: 'Study',
                type: 'Concept',
            },
        ]);
    };

    return (
        <div className="space-y-4">
            <Panel className="p-5">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <TextInput
                        value={topic}
                        onChange={(event) => setTopic(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && run()}
                        placeholder="What do you want to understand?"
                    />
                    <Select value={depth} onChange={(event) => setDepth(event.target.value)}>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                    </Select>
                    <Button icon={Sparkles} onClick={run} loading={busy}>
                        Explain
                    </Button>
                </div>
            </Panel>

            <ErrorNote error={error} onRetry={run} />

            {(explanation || busy) && (
                <Panel className="p-5">
                    {personalised && (
                        <Badge tone="accent" className="mb-3">
                            <Brain size={11} /> Adapted to your history
                        </Badge>
                    )}
                    {explanation ? (
                        <Markdown text={explanation} className={busy ? 'stream-caret' : ''} />
                    ) : (
                        <Spinner label="Thinking…" />
                    )}
                    {explanation && !busy && (
                        <div className="border-app mt-5 border-t pt-4">
                            <Button variant="ghost" size="sm" icon={Layers} onClick={makeCard}>
                                Save as a flashcard
                            </Button>
                        </div>
                    )}
                </Panel>
            )}
        </div>
    );
}

function TutorMode() {
    const [turns, setTurns] = useState([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const endRef = useRef(null);
    const awardXp = useStore((s) => s.awardXp);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [turns]);

    const send = async () => {
        const text = input.trim();
        if (!text || busy) return;

        const history = turns.map((turn) => ({ role: turn.role, content: turn.content }));
        setTurns((current) => [...current, { role: 'user', content: text }]);
        setInput('');
        setBusy(true);
        setError(null);

        try {
            const result = await api.tutor(text, history);
            setTurns((current) => [
                ...current,
                { role: 'assistant', content: result.response, personalised: result.personalised },
            ]);
            awardXp(10, 'tutor turn');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            <Panel className="flex h-[60vh] flex-col p-5">
                <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto">
                    {turns.length === 0 ? (
                        <div className="text-app-muted flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
                            <Brain size={28} className="opacity-30" />
                            <p className="max-w-sm">
                                Name what you are stuck on. The tutor leads with questions rather than
                                answers, so you do the thinking.
                            </p>
                        </div>
                    ) : (
                        turns.map((turn, index) => (
                            <div
                                key={index}
                                className={clsx('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}
                            >
                                <div
                                    className={clsx(
                                        'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                                        turn.role === 'user'
                                            ? 'text-app bg-[var(--border-subtle)]'
                                            : 'surface-raised',
                                    )}
                                >
                                    {turn.role === 'user' ? (
                                        turn.content
                                    ) : (
                                        <Markdown text={turn.content} />
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                    {busy && <Spinner label="Thinking…" className="py-3" />}
                    <div ref={endRef} />
                </div>

                <div className="border-app mt-4 flex gap-2 border-t pt-4">
                    <TextInput
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && send()}
                        placeholder="What are you stuck on?"
                        disabled={busy}
                    />
                    <Button icon={Send} onClick={send} loading={busy} disabled={!input.trim()}>
                        Send
                    </Button>
                </div>
            </Panel>

            <ErrorNote error={error} />
        </div>
    );
}

function QuizMode() {
    const [topic, setTopic] = useState('');
    const [count, setCount] = useState(5);
    const [questions, setQuestions] = useState([]);
    const [index, setIndex] = useState(0);
    const [chosen, setChosen] = useState(null);
    const [score, setScore] = useState(0);
    const [finished, setFinished] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [targeted, setTargeted] = useState([]);
    const [saved, setSaved] = useState(false);

    const awardXp = useStore((s) => s.awardXp);
    const addCards = useStore((s) => s.addCards);

    const start = async () => {
        const subject = topic.trim();
        if (!subject || busy) return;

        setBusy(true);
        setError(null);
        setQuestions([]);
        setIndex(0);
        setScore(0);
        setChosen(null);
        setFinished(false);
        setSaved(false);

        try {
            const result = await api.quiz(subject, Number(count));
            if (!result.questions?.length) {
                setError('No questions came back. Try a more specific topic.');
                return;
            }
            setQuestions(result.questions);
            setTargeted(result.targeted_weak_concepts || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const answer = (option) => {
        if (chosen !== null) return;
        setChosen(option);
        if (option === questions[index].answer) setScore((value) => value + 1);
    };

    const next = async () => {
        if (index + 1 < questions.length) {
            setIndex((value) => value + 1);
            setChosen(null);
            return;
        }

        setFinished(true);
        awardXp(score * 12, 'quiz');
        try {
            // Recorded as a mastery signal so future explanations account for it.
            await api.quizResult(topic.trim(), score, questions.length);
            setSaved(true);
        } catch {
            // The result is still shown; only the mastery write failed.
        }
    };

    const saveWrongAsCards = () => {
        addCards(
            questions.map((question) => ({
                question: question.question,
                answer: question.answer,
                tag: topic.slice(0, 20),
                type: 'Quiz',
            })),
        );
    };

    const reset = () => {
        setQuestions([]);
        setFinished(false);
        setIndex(0);
        setScore(0);
        setChosen(null);
    };

    if (!questions.length) {
        return (
            <div className="space-y-4">
                <Panel className="p-5">
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <TextInput
                            value={topic}
                            onChange={(event) => setTopic(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && start()}
                            placeholder="Quiz me on…"
                        />
                        <Select value={count} onChange={(event) => setCount(event.target.value)}>
                            {[3, 5, 8, 10].map((value) => (
                                <option key={value} value={value}>
                                    {value} questions
                                </option>
                            ))}
                        </Select>
                        <Button icon={Layers} onClick={start} loading={busy}>
                            Start
                        </Button>
                    </div>
                    {busy && (
                        <p className="text-app-muted mt-3 text-xs">
                            Writing questions — this can take a moment on a local model.
                        </p>
                    )}
                </Panel>
                <ErrorNote error={error} onRetry={start} />
            </div>
        );
    }

    if (finished) {
        const percent = Math.round((score / questions.length) * 100);
        return (
            <Panel className="p-8 text-center">
                <div
                    className={clsx(
                        'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
                        percent >= 70 ? 'bg-emerald-500/15' : 'bg-amber-500/15',
                    )}
                >
                    {percent >= 70 ? (
                        <CheckCircle size={30} className="text-emerald-400" />
                    ) : (
                        <RotateCw size={30} className="text-amber-400" />
                    )}
                </div>
                <p className="text-app text-3xl font-bold">
                    {score} / {questions.length}
                </p>
                <p className="text-app-muted mt-1 text-sm">
                    {percent >= 85
                        ? 'Strong. This topic is holding.'
                        : percent >= 60
                          ? 'Reasonable. Worth one more pass over the misses.'
                          : 'This one needs another session — noted in your graph.'}
                </p>
                {saved && (
                    <p className="text-app-muted mt-3 text-xs">
                        Recorded against “{topic}” at {percent}% mastery.
                    </p>
                )}
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                    <Button icon={RotateCw} onClick={reset}>
                        New quiz
                    </Button>
                    <Button variant="ghost" icon={Layers} onClick={saveWrongAsCards}>
                        Save all as flashcards
                    </Button>
                </div>
            </Panel>
        );
    }

    const question = questions[index];

    return (
        <div className="space-y-4">
            {targeted.length > 0 && (
                <Panel className="accent-bg px-4 py-2">
                    <p className="text-app-muted text-xs">
                        <Brain size={11} className="accent-text mr-1 inline" />
                        Weighted towards your weak areas: {targeted.join(', ')}
                    </p>
                </Panel>
            )}

            <Panel className="p-6">
                <div className="mb-4 flex items-center justify-between">
                    <span className="text-app-muted text-xs">
                        Question {index + 1} of {questions.length}
                    </span>
                    <Badge tone="accent">
                        {score} correct
                    </Badge>
                </div>
                <Progress value={((index + (chosen ? 1 : 0)) / questions.length) * 100} className="mb-6" />

                <p className="text-app mb-5 text-base font-medium">{question.question}</p>

                <div className="space-y-2">
                    {question.options.map((option) => {
                        const isChosen = chosen === option;
                        const isRight = option === question.answer;
                        return (
                            <button
                                key={option}
                                type="button"
                                onClick={() => answer(option)}
                                disabled={chosen !== null}
                                className={clsx(
                                    'focus-ring flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-all',
                                    chosen === null
                                        ? 'border-app hover:accent-bg border'
                                        : isRight
                                          ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                          : isChosen
                                            ? 'border border-red-500/40 bg-red-500/10 text-red-200'
                                            : 'border-app text-app-muted border opacity-60',
                                )}
                            >
                                <span className="min-w-0 flex-1">{option}</span>
                                {chosen !== null && isRight && (
                                    <CheckCircle size={16} className="shrink-0 text-emerald-400" />
                                )}
                                {chosen !== null && isChosen && !isRight && (
                                    <XCircle size={16} className="shrink-0 text-red-400" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {chosen !== null && (
                    <div className="mt-5">
                        {question.explanation && (
                            <p className="text-app-muted mb-4 text-sm">{question.explanation}</p>
                        )}
                        <Button onClick={next}>
                            {index + 1 < questions.length ? 'Next question' : 'See results'}
                        </Button>
                    </div>
                )}
            </Panel>
        </div>
    );
}

export const Study = () => {
    const [mode, setMode] = useState(null);
    const active = MODES.find((item) => item.id === mode);

    return (
        <div className="animate-fade">
            <PageHeader
                title={active ? active.title : 'Study'}
                subtitle={active ? active.description : 'Learn, be tutored, or test yourself.'}
                actions={
                    active && (
                        <Button variant="ghost" icon={ArrowLeft} onClick={() => setMode(null)}>
                            All modes
                        </Button>
                    )
                }
            />

            {!mode ? (
                <div className="grid gap-4 md:grid-cols-3">
                    {MODES.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setMode(item.id)}
                            className="surface hover:accent-bg focus-ring rounded-2xl p-6 text-left transition-all"
                        >
                            <div className="accent-bg mb-4 flex h-11 w-11 items-center justify-center rounded-xl">
                                <item.icon size={22} className="accent-text" />
                            </div>
                            <h3 className="text-app text-lg font-bold">{item.title}</h3>
                            <p className="text-app-muted mt-1.5 text-sm">{item.description}</p>
                        </button>
                    ))}
                </div>
            ) : mode === 'learn' ? (
                <LearnMode />
            ) : mode === 'tutor' ? (
                <TutorMode />
            ) : (
                <QuizMode />
            )}
        </div>
    );
};

export default Study;

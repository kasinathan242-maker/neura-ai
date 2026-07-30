import React, { useState } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Layers,
    Plus,
    RotateCw,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import clsx from 'clsx';
import {
    Badge,
    Button,
    EmptyState,
    ErrorNote,
    PageHeader,
    Panel,
    TextArea,
    TextInput,
} from '../components/ui';
import api from '../lib/api';
import { useStore } from '../store/useStore';

/**
 * Flashcards with a self-rating step.
 *
 * The rating is posted as a mastery signal, so cards you keep failing feed the
 * same knowledge graph that shapes explanations elsewhere.
 */

export const Flashcards = () => {
    const cards = useStore((s) => s.cards);
    const addCards = useStore((s) => s.addCards);
    const removeCard = useStore((s) => s.removeCard);
    const awardXp = useStore((s) => s.awardXp);

    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState({ question: '', answer: '', tag: 'General' });
    const [topic, setTopic] = useState('');
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState(null);

    // Derive the cursor rather than correcting it in an effect: after a deletion
    // `index` can point past the end, and clamping here means there is never a
    // render where `card` is undefined.
    const safeIndex = cards.length ? Math.min(index, cards.length - 1) : 0;
    const card = cards[safeIndex];

    const move = (delta) => {
        if (!cards.length) return;
        setFlipped(false);
        setIndex((current) => {
            const from = cards.length ? Math.min(current, cards.length - 1) : 0;
            return (from + delta + cards.length) % cards.length;
        });
    };

    const create = () => {
        if (!draft.question.trim() || !draft.answer.trim()) return;
        addCards([{ ...draft, question: draft.question.trim(), answer: draft.answer.trim() }]);
        setDraft({ question: '', answer: '', tag: 'General' });
        setAdding(false);
        awardXp(5, 'card created');
    };

    const generate = async () => {
        const subject = topic.trim();
        if (!subject || generating) return;

        setGenerating(true);
        setError(null);
        try {
            const result = await api.quiz(subject, 5);
            if (!result.questions?.length) {
                setError('No cards came back. Try a more specific topic.');
                return;
            }
            addCards(
                result.questions.map((question) => ({
                    question: question.question,
                    answer: question.answer,
                    tag: subject.slice(0, 20),
                    type: 'Generated',
                })),
            );
            setTopic('');
            awardXp(20, 'cards generated');
        } catch (err) {
            setError(err.message);
        } finally {
            setGenerating(false);
        }
    };

    const rate = async (score) => {
        if (!card) return;
        awardXp(score >= 0.65 ? 8 : 3, 'card reviewed');
        try {
            await api.setMastery(card.tag || card.question.slice(0, 60), score, 'flashcard');
        } catch {
            // Local review still counted; only the mastery write failed.
        }
        move(1);
    };

    return (
        <div className="animate-fade">
            <PageHeader
                title="Flashcards"
                subtitle={cards.length ? `${cards.length} card${cards.length === 1 ? '' : 's'}` : 'Retrieval practice.'}
                actions={
                    <Button icon={Plus} onClick={() => setAdding(true)}>
                        Add card
                    </Button>
                }
            />

            <Panel className="mb-6 p-5">
                <p className="text-app mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Sparkles size={15} className="accent-text" /> Generate a deck
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <TextInput
                        value={topic}
                        onChange={(event) => setTopic(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && generate()}
                        placeholder="Make me 5 cards on… photosynthesis"
                        disabled={generating}
                    />
                    <Button onClick={generate} loading={generating} disabled={!topic.trim()}>
                        Generate
                    </Button>
                </div>
            </Panel>

            <ErrorNote error={error} className="mb-6" />

            {adding && (
                <Panel className="mb-6 p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <p className="text-app text-sm font-semibold">New card</p>
                        <button
                            type="button"
                            onClick={() => setAdding(false)}
                            aria-label="Cancel"
                            className="text-app-muted hover:text-app focus-ring"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <TextArea
                        value={draft.question}
                        onChange={(event) => setDraft((d) => ({ ...d, question: event.target.value }))}
                        rows={2}
                        placeholder="Question"
                        className="mb-2"
                    />
                    <TextArea
                        value={draft.answer}
                        onChange={(event) => setDraft((d) => ({ ...d, answer: event.target.value }))}
                        rows={3}
                        placeholder="Answer"
                        className="mb-2"
                    />
                    <TextInput
                        value={draft.tag}
                        onChange={(event) => setDraft((d) => ({ ...d, tag: event.target.value }))}
                        placeholder="Tag"
                        className="mb-3"
                    />
                    <Button onClick={create} disabled={!draft.question.trim() || !draft.answer.trim()}>
                        Add card
                    </Button>
                </Panel>
            )}

            {!cards.length ? (
                <Panel>
                    <EmptyState icon={Layers} title="No cards yet">
                        Generate a deck from a topic above, add cards by hand, or save them from the Study and
                        quiz screens.
                    </EmptyState>
                </Panel>
            ) : (
                <>
                    <div className="mb-4 flex items-center justify-between">
                        <span className="text-app-muted text-xs">
                            Card {safeIndex + 1} of {cards.length}
                        </span>
                        <div className="flex items-center gap-2">
                            {card?.tag && <Badge>{card.tag}</Badge>}
                            <button
                                type="button"
                                onClick={() => removeCard(card.id)}
                                aria-label="Delete this card"
                                className="text-app-muted hover:text-red-400 focus-ring rounded-lg p-1.5 transition-colors"
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setFlipped((value) => !value)}
                        className="focus-ring surface mb-4 flex min-h-64 w-full flex-col items-center justify-center rounded-2xl p-8 text-center transition-colors hover:border-[var(--accent)]"
                    >
                        <p className="text-app-muted mb-3 text-[10px] font-bold uppercase tracking-widest">
                            {flipped ? 'Answer' : 'Question'}
                        </p>
                        <p
                            className={clsx(
                                'text-app whitespace-pre-wrap',
                                flipped ? 'text-base' : 'text-lg font-medium',
                            )}
                        >
                            {flipped ? card?.answer : card?.question}
                        </p>
                        {!flipped && (
                            <p className="text-app-muted mt-6 flex items-center gap-1.5 text-xs">
                                <RotateCw size={12} /> Tap to reveal
                            </p>
                        )}
                    </button>

                    {flipped ? (
                        <div>
                            <p className="text-app-muted mb-2 text-center text-xs">How did that go?</p>
                            <div className="flex flex-wrap justify-center gap-2">
                                {[
                                    { label: 'Missed it', score: 0.15 },
                                    { label: 'Hard', score: 0.45 },
                                    { label: 'Got it', score: 0.75 },
                                    { label: 'Easy', score: 0.95 },
                                ].map((option) => (
                                    <Button
                                        key={option.label}
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => rate(option.score)}
                                    >
                                        {option.label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center gap-3">
                            <Button variant="ghost" icon={ChevronLeft} onClick={() => move(-1)}>
                                Previous
                            </Button>
                            <Button variant="ghost" onClick={() => move(1)}>
                                Next <ChevronRight size={15} />
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Flashcards;

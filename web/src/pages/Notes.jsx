import React, { useState } from 'react';
import { Brain, Notebook, Plus, Save, Trash2, Upload } from 'lucide-react';
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
 * Notes, with a route into long-term memory.
 *
 * "Remember this" sends a note through the ingest pipeline, so its concepts join
 * the knowledge graph and later answers can draw on it.
 */

export const Notes = () => {
    const notes = useStore((s) => s.notes);
    const saveNote = useStore((s) => s.saveNote);
    const removeNote = useStore((s) => s.removeNote);
    const awardXp = useStore((s) => s.awardXp);
    const notify = useStore((s) => s.notify);

    const [active, setActive] = useState(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [remembering, setRemembering] = useState(false);
    const [error, setError] = useState(null);

    const startNew = () => {
        setActive({ id: null });
        setTitle('');
        setContent('');
        setError(null);
    };

    const open = (note) => {
        setActive(note);
        setTitle(note.title || '');
        setContent(note.content || '');
        setError(null);
    };

    const persist = () => {
        if (!title.trim() && !content.trim()) return;
        saveNote({
            id: active?.id || undefined,
            title: title.trim() || 'Untitled',
            content: content.trim(),
        });
        if (!active?.id) awardXp(5, 'note created');
        setActive(null);
    };

    const remember = async () => {
        const body = content.trim();
        if (!body) return;

        setRemembering(true);
        setError(null);
        try {
            const result = await api.ingestMemory(body, {
                source: 'notes',
                title: title.trim() || 'Note',
            });
            awardXp(15, 'note remembered');
            notify(
                'Added to memory',
                result.concepts?.length
                    ? `Concepts: ${result.concepts.join(', ')}`
                    : `${result.chunks_added} chunk(s) indexed.`,
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setRemembering(false);
        }
    };

    return (
        <div className="animate-fade">
            <PageHeader
                title="Notes"
                subtitle={notes.length ? `${notes.length} saved` : 'Write things down, then make them stick.'}
                actions={
                    <Button icon={Plus} onClick={startNew}>
                        New note
                    </Button>
                }
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">
                <div className="space-y-2">
                    {notes.length === 0 ? (
                        <Panel>
                            <EmptyState icon={Notebook} title="No notes yet">
                                Notes are stored in this browser. Use “Remember this” to also add one to
                                NEURA's long-term memory.
                            </EmptyState>
                        </Panel>
                    ) : (
                        notes.map((note) => (
                            <Panel
                                key={note.id}
                                className={clsx(
                                    'group cursor-pointer p-4 transition-colors',
                                    active?.id === note.id ? 'accent-bg' : 'hover:bg-[var(--border-subtle)]',
                                )}
                                onClick={() => open(note)}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-app truncate text-sm font-semibold">
                                            {note.title || 'Untitled'}
                                        </p>
                                        <p className="text-app-muted mt-1 line-clamp-2 text-xs">
                                            {note.content || 'Empty'}
                                        </p>
                                        <p className="text-app-muted mt-1.5 text-[10px] opacity-70">
                                            {new Date(note.updatedAt || note.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            removeNote(note.id);
                                            if (active?.id === note.id) setActive(null);
                                        }}
                                        aria-label="Delete note"
                                        className="text-app-muted focus-ring shrink-0 rounded-lg p-1 opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </Panel>
                        ))
                    )}
                </div>

                <div>
                    {active ? (
                        <Panel className="p-5">
                            <TextInput
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder="Note title"
                                className="mb-3 text-base font-semibold"
                            />
                            <TextArea
                                value={content}
                                onChange={(event) => setContent(event.target.value)}
                                rows={16}
                                placeholder="Write your note…"
                                className="mb-4 font-mono text-[13px]"
                            />

                            <ErrorNote error={error} className="mb-4" />

                            <div className="flex flex-wrap gap-2">
                                <Button icon={Save} onClick={persist} disabled={!title.trim() && !content.trim()}>
                                    Save
                                </Button>
                                <Button
                                    variant="ghost"
                                    icon={Brain}
                                    onClick={remember}
                                    loading={remembering}
                                    disabled={!content.trim()}
                                >
                                    Remember this
                                </Button>
                                <Button variant="ghost" onClick={() => setActive(null)}>
                                    Cancel
                                </Button>
                            </div>

                            <p className="text-app-muted mt-3 text-xs">
                                <Upload size={11} className="mr-1 inline" />
                                “Remember this” indexes the note so future answers can draw on it.
                            </p>
                        </Panel>
                    ) : (
                        <Panel>
                            <EmptyState
                                icon={Notebook}
                                title="Select a note"
                                action={
                                    <Button icon={Plus} onClick={startNew}>
                                        New note
                                    </Button>
                                }
                            >
                                Pick a note from the list, or start a new one.
                            </EmptyState>
                        </Panel>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Notes;

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, FileText, Send, Sparkles, Trash2, Upload } from 'lucide-react';
import clsx from 'clsx';
import {
    Badge,
    Button,
    EmptyState,
    ErrorNote,
    Markdown,
    PageHeader,
    Panel,
    Spinner,
    TextInput,
} from '../components/ui';
import api from '../lib/api';
import { useStore } from '../store/useStore';

/**
 * Upload a PDF and interrogate it.
 *
 * The server chunks and embeds the text on upload, then retrieves the passages
 * most relevant to each question. The previous version truncated to the first
 * 15,000 characters, which meant any answer past the opening pages was
 * unreachable.
 */

const MAX_MB = 12;

const SUGGESTED = [
    'Summarise this document in ten bullet points',
    'What are the key definitions I should memorise?',
    'Write five exam questions from this material',
    'Explain the hardest concept here simply',
];

export const PDF = () => {
    const [document, setDocument] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [asking, setAsking] = useState(false);
    const [error, setError] = useState(null);
    const [dragging, setDragging] = useState(false);

    const fileRef = useRef(null);
    const endRef = useRef(null);
    const awardXp = useStore((s) => s.awardXp);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [messages, asking]);

    const upload = useCallback(
        async (file) => {
            if (!file) return;

            if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                setError('That is not a PDF file.');
                return;
            }
            if (file.size > MAX_MB * 1024 * 1024) {
                setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB; the limit is ${MAX_MB}MB.`);
                return;
            }

            setUploading(true);
            setError(null);
            setMessages([]);

            try {
                const result = await api.uploadPdf(file);
                setDocument(result);
                awardXp(20, 'pdf uploaded');
                if (result.concepts?.length) {
                    setMessages([
                        {
                            role: 'system',
                            content:
                                `Indexed **${result.filename}** — ${result.pages} page` +
                                `${result.pages === 1 ? '' : 's'}, ${result.char_count.toLocaleString()} characters.\n\n` +
                                `Concepts added to your knowledge graph: ${result.concepts.join(', ')}`,
                        },
                    ]);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setUploading(false);
            }
        },
        [awardXp],
    );

    const ask = async (question = input) => {
        const text = question.trim();
        if (!text || asking) return;

        setMessages((current) => [...current, { role: 'user', content: text }]);
        setInput('');
        setAsking(true);
        setError(null);

        try {
            const result = await api.chatPdf(text, document?.doc_id);
            setMessages((current) => [
                ...current,
                {
                    role: 'assistant',
                    content: result.answer,
                    grounded: result.context_used,
                    retrieval: result.retrieval,
                    chunks: result.chunks_used,
                    note: result.note,
                },
            ]);
            awardXp(8, 'pdf question');
        } catch (err) {
            setError(err.message);
        } finally {
            setAsking(false);
        }
    };

    const onDrop = (event) => {
        event.preventDefault();
        setDragging(false);
        upload(event.dataTransfer.files?.[0]);
    };

    return (
        <div className="animate-fade">
            <PageHeader
                title="PDF Intelligence"
                subtitle="Ask questions about a document and get answers grounded in its text."
                badge={
                    document && (
                        <Badge tone="accent">
                            <FileText size={11} /> {document.pages} pages indexed
                        </Badge>
                    )
                }
                actions={
                    document && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => {
                                setDocument(null);
                                setMessages([]);
                            }}
                        >
                            Close document
                        </Button>
                    )
                }
            />

            <ErrorNote error={error} className="mb-6" />

            {!document ? (
                <Panel
                    className={clsx(
                        'border-2 border-dashed transition-colors',
                        dragging ? 'border-[var(--accent)]' : 'border-app',
                    )}
                    onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                >
                    {uploading ? (
                        <Spinner label="Extracting and indexing the text…" className="py-20" />
                    ) : (
                        <EmptyState
                            icon={Upload}
                            title="Drop a PDF here"
                            action={
                                <>
                                    <Button icon={Upload} onClick={() => fileRef.current?.click()}>
                                        Choose a file
                                    </Button>
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept="application/pdf,.pdf"
                                        className="hidden"
                                        onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            event.target.value = '';
                                            upload(file);
                                        }}
                                    />
                                </>
                            }
                        >
                            Lecture notes, papers, textbook chapters — up to {MAX_MB}MB. The text is chunked
                            and embedded so answers can come from anywhere in the document, and the concepts
                            join your knowledge graph.
                        </EmptyState>
                    )}
                </Panel>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">
                    <div className="space-y-4">
                        <Panel className="p-5">
                            <div className="accent-bg mb-3 flex h-10 w-10 items-center justify-center rounded-xl">
                                <FileText size={20} className="accent-text" />
                            </div>
                            <p className="text-app truncate text-sm font-semibold" title={document.filename}>
                                {document.filename}
                            </p>
                            <p className="text-app-muted mt-1 text-xs">
                                {document.pages} page{document.pages === 1 ? '' : 's'} ·{' '}
                                {document.char_count.toLocaleString()} characters
                            </p>
                            {document.preview && (
                                <p className="text-app-muted border-app mt-3 border-t pt-3 text-xs italic">
                                    {document.preview}
                                </p>
                            )}
                        </Panel>

                        <Panel className="p-4">
                            <p className="text-app-muted mb-2 text-xs font-semibold uppercase tracking-wider">
                                Try asking
                            </p>
                            <div className="space-y-1.5">
                                {SUGGESTED.map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        onClick={() => ask(suggestion)}
                                        disabled={asking}
                                        className="text-app-muted hover:accent-text focus-ring w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-40"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </Panel>
                    </div>

                    <Panel className="flex h-[65vh] flex-col p-5">
                        <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto">
                            {messages.length === 0 ? (
                                <div className="text-app-muted flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
                                    <Sparkles size={26} className="opacity-30" />
                                    <p>Ask anything about this document.</p>
                                </div>
                            ) : (
                                messages.map((message, index) => (
                                    <div
                                        key={index}
                                        className={clsx(
                                            'flex',
                                            message.role === 'user' ? 'justify-end' : 'justify-start',
                                        )}
                                    >
                                        <div
                                            className={clsx(
                                                'max-w-[88%] rounded-2xl px-4 py-3 text-sm',
                                                message.role === 'user'
                                                    ? 'text-app bg-[var(--border-subtle)]'
                                                    : message.role === 'system'
                                                      ? 'accent-bg'
                                                      : 'surface-raised',
                                            )}
                                        >
                                            {message.role === 'user' ? (
                                                message.content
                                            ) : (
                                                <Markdown text={message.content} />
                                            )}

                                            {message.role === 'assistant' && (
                                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                                    {message.grounded ? (
                                                        <Badge tone="good">
                                                            <Brain size={10} />
                                                            {message.retrieval === 'vector'
                                                                ? `${message.chunks} passages retrieved`
                                                                : 'from the document'}
                                                        </Badge>
                                                    ) : (
                                                        <Badge tone="warn">general knowledge</Badge>
                                                    )}
                                                </div>
                                            )}
                                            {message.note && (
                                                <p className="text-app-muted mt-1.5 text-[11px]">
                                                    {message.note}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                            {asking && <Spinner label="Reading the document…" className="py-3" />}
                            <div ref={endRef} />
                        </div>

                        <div className="border-app mt-4 flex gap-2 border-t pt-4">
                            <TextInput
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                onKeyDown={(event) => event.key === 'Enter' && ask()}
                                placeholder="Ask about this document…"
                                disabled={asking}
                            />
                            <Button icon={Send} onClick={() => ask()} loading={asking} disabled={!input.trim()}>
                                Ask
                            </Button>
                        </div>
                    </Panel>
                </div>
            )}
        </div>
    );
};

export default PDF;

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Boxes,
    Brain,
    Camera,
    CircleHelp,
    Clock,
    Cpu,
    Eraser,
    Mic,
    Send,
    Sparkles,
    Square,
    Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, Markdown, Panel } from '../components/ui';
import { useStore } from '../store/useStore';

/**
 * Streaming chat.
 *
 * Answers arrive token by token over SSE and are rendered as markdown. When
 * personalised memory contributes to a reply, the concepts it drew on are shown
 * beneath it — the tailoring is visible rather than mysterious.
 */

const SUGGESTIONS = [
    { icon: CircleHelp, text: 'Explain quantum entanglement in simple terms' },
    { icon: Brain, text: 'Help me understand calculus derivatives' },
    { icon: Clock, text: 'Create a study plan for my finals' },
    { icon: Zap, text: 'Summarise the key ideas of machine learning' },
];

export const Chat = () => {
    const navigate = useNavigate();
    const messages = useStore((s) => s.messages);
    const isTyping = useStore((s) => s.isTyping);
    const sendMessage = useStore((s) => s.sendMessage);
    const stopGeneration = useStore((s) => s.stopGeneration);
    const clearMessages = useStore((s) => s.clearMessages);
    const memoryContext = useStore((s) => s.lastMemoryContext);
    const health = useStore((s) => s.health);
    const edge = useStore((s) => s.edge);

    const [input, setInput] = useState('');
    const endRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, isTyping]);

    const submit = (event) => {
        event?.preventDefault();
        const text = input.trim();
        if (!text || isTyping) return;
        setInput('');
        sendMessage(text);
        inputRef.current?.focus();
    };

    const conversation = messages.filter((m) => m.id !== 'init' || messages.length === 1);
    const provider = health?.active_provider;
    const providerLabel =
        edge.status === 'ready' && useStore.getState().settings.edgeMode === 'always'
            ? 'On-device model'
            : provider === 'openai'
              ? health?.cloud_model
              : provider === 'ollama'
                ? `Ollama · ${health?.active_model}`
                : provider === 'offline'
                  ? 'No model configured'
                  : '…';

    return (
        <div className="animate-fade mx-auto flex h-[calc(100vh-9rem)] w-full max-w-4xl flex-col">
            <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                    <h1 className="text-app text-2xl font-bold tracking-tight">AI Chat</h1>
                    <p className="text-app-muted mt-0.5 text-xs">{providerLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                    {memoryContext?.used && (
                        <Badge tone="accent">
                            <Brain size={11} /> personalised
                        </Badge>
                    )}
                    {messages.length > 1 && (
                        <Button variant="ghost" size="sm" icon={Eraser} onClick={clearMessages}>
                            Clear
                        </Button>
                    )}
                </div>
            </div>

            <div className="no-scrollbar flex-1 overflow-y-auto pb-4">
                {conversation.length <= 1 ? (
                    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]">
                            <span className="text-3xl font-bold text-black">N</span>
                        </div>
                        <h2 className="text-app text-xl font-bold">How can I help you today?</h2>
                        <p className="text-app-muted mt-2 max-w-md text-sm">
                            Ask a question, or reach for one of the specialised tools below.
                        </p>

                        <div className="mt-8 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
                            {SUGGESTIONS.map((suggestion) => (
                                <button
                                    key={suggestion.text}
                                    type="button"
                                    onClick={() => {
                                        setInput(suggestion.text);
                                        inputRef.current?.focus();
                                    }}
                                    className="surface hover:accent-bg focus-ring flex items-start gap-3 rounded-xl p-3.5 text-left transition-all"
                                >
                                    <suggestion.icon size={17} className="accent-text mt-0.5 shrink-0" />
                                    <span className="text-app-muted text-sm">{suggestion.text}</span>
                                </button>
                            ))}
                        </div>

                        <div className="mt-6 flex flex-wrap justify-center gap-2">
                            {[
                                { icon: Camera, label: 'Show it a photo', path: '/vision' },
                                { icon: Mic, label: 'Talk out loud', path: '/voice' },
                                { icon: Boxes, label: 'See it in 3D', path: '/spatial' },
                                { icon: Cpu, label: 'Run it offline', path: '/local-ai' },
                            ].map((item) => (
                                <button
                                    key={item.path}
                                    type="button"
                                    onClick={() => navigate(item.path)}
                                    className="border-app text-app-muted hover:accent-text focus-ring flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors"
                                >
                                    <item.icon size={13} /> {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {conversation.map((message) => (
                            <div
                                key={message.id}
                                className={clsx(
                                    'animate-rise flex gap-3',
                                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                                )}
                            >
                                <div
                                    className={clsx(
                                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                                        message.role === 'user'
                                            ? 'bg-[var(--border-subtle)]'
                                            : 'bg-[var(--accent)]',
                                    )}
                                >
                                    {message.role === 'user' ? (
                                        <span className="text-app text-xs font-semibold">You</span>
                                    ) : (
                                        <Sparkles size={14} className="text-black" />
                                    )}
                                </div>

                                <div className="min-w-0 max-w-[85%]">
                                    <div
                                        className={clsx(
                                            'rounded-2xl px-4 py-3 text-sm',
                                            message.role === 'user'
                                                ? 'text-app bg-[var(--border-subtle)]'
                                                : message.error
                                                  ? 'border border-red-500/30 bg-red-500/5'
                                                  : 'surface',
                                        )}
                                    >
                                        {message.role === 'user' ? (
                                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                        ) : (
                                            <Markdown
                                                text={
                                                    message.content ||
                                                    (message.streaming ? '' : '(empty response)')
                                                }
                                                className={message.streaming ? 'stream-caret' : ''}
                                            />
                                        )}
                                    </div>

                                    {message.role === 'ai' && !message.streaming && (
                                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                            {message.source === 'on-device' && (
                                                <Badge tone="warn">
                                                    <Cpu size={10} /> on-device
                                                    {message.fallback ? ' fallback' : ''}
                                                </Badge>
                                            )}
                                            {message.degraded && <Badge tone="warn">no model configured</Badge>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isTyping && !conversation.some((m) => m.streaming) && (
                            <div className="flex gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]">
                                    <Sparkles size={14} className="text-black" />
                                </div>
                                <div className="surface flex items-center gap-1 rounded-2xl px-4 py-3.5">
                                    {[0, 150, 300].map((delay) => (
                                        <span
                                            key={delay}
                                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-secondary)]"
                                            style={{ animationDelay: `${delay}ms` }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        <div ref={endRef} className="h-2" />
                    </div>
                )}
            </div>

            {memoryContext?.used && memoryContext.weak?.length > 0 && (
                <Panel className="accent-bg mb-3 px-4 py-2">
                    <p className="text-app-muted text-xs">
                        <Brain size={11} className="accent-text mr-1 inline" />
                        Adapting to your weak areas: {memoryContext.weak.slice(0, 4).join(', ')}
                    </p>
                </Panel>
            )}

            <form onSubmit={submit} className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask NEURA anything…"
                    aria-label="Message"
                    className="surface text-app placeholder:text-app-muted focus-ring w-full rounded-2xl py-3.5 pl-4 pr-24 text-sm transition-colors focus:border-[var(--accent)]"
                />
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <button
                        type="button"
                        onClick={() => navigate('/voice')}
                        aria-label="Switch to voice"
                        className="text-app-muted hover:accent-text focus-ring rounded-lg p-2 transition-colors"
                    >
                        <Mic size={17} />
                    </button>
                    {isTyping ? (
                        <button
                            type="button"
                            onClick={stopGeneration}
                            aria-label="Stop generating"
                            className="focus-ring rounded-xl bg-red-500/15 p-2 text-red-400 transition-colors hover:bg-red-500/25"
                        >
                            <Square size={16} />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            aria-label="Send message"
                            className="focus-ring rounded-xl bg-[var(--accent)] p-2 text-black transition-all hover:brightness-110 disabled:bg-[var(--border-strong)] disabled:text-[var(--text-secondary)]"
                        >
                            <Send size={16} />
                        </button>
                    )}
                </div>
            </form>

            <p className="text-app-muted mt-2 text-center text-[11px]">
                NEURA can make mistakes. Verify anything important.
            </p>
        </div>
    );
};

export default Chat;

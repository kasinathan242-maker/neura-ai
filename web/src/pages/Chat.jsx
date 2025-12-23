import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, Sparkles, CircleHelp, BookOpen, Clock, Zap } from 'lucide-react';
import { useStore } from '../store/useStore';
import clsx from 'clsx';

export const Chat = () => {
    const { messages, addMessage, isTyping, sendMessage, isConnected } = useStore();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSend = (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        // Optimistic update
        addMessage({ role: 'user', content: input });

        // Send via WebSocket
        if (isConnected) {
            sendMessage(input);
        } else {
            // Fallback if truly offline
            setTimeout(() => {
                addMessage({ role: 'ai', content: "I'm having trouble connecting to the server. Please check if the backend is running." });
            }, 500);
        }

        setInput('');
    };

    const suggestions = [
        { icon: CircleHelp, text: 'Explain quantum computing in simple terms' },
        { icon: BookOpen, text: 'Help me understand calculus derivatives' },
        { icon: Clock, text: 'Create a study plan for my exams' },
        { icon: Zap, text: 'Summarize the key points of machine learning' },
    ];

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] animate-in fade-in zoom-in-95 duration-500 max-w-5xl mx-auto w-full relative">

            {/* Header Area */}
            <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-[#0a0a0f] to-transparent pb-10 pt-2 px-4">
                <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-2xl font-bold text-white">AI Chat</h1>
                    <div className={clsx("w-2 h-2 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} title={isConnected ? "Online" : "Offline"} />
                </div>
                <p className="text-sm text-gray-500">Powered by Gemini 2.5 Flash (via Ollama)</p>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar pt-20 pb-4 px-4 scroll-smooth">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center -mt-20">
                        <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-blue-500/20">
                            <span className="text-4xl font-bold text-white">N</span>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">How can I help you today?</h2>
                        <p className="text-gray-400 max-w-md mb-12">Ask me anything about your studies, coding problems, or let me help you organize your learning.</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                            {suggestions.map((suggestion, i) => (
                                <button
                                    key={i}
                                    onClick={() => setInput(suggestion.text)}
                                    className="p-4 bg-[#0e0e12] border border-white/5 hover:border-blue-500/50 hover:bg-white/5 rounded-xl text-left transition-all group flex items-start gap-4"
                                >
                                    <suggestion.icon size={20} className="text-blue-500 mt-0.5 group-hover:text-cyan-400 transition-colors" />
                                    <span className="text-gray-300 text-sm group-hover:text-white">{suggestion.text}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 max-w-3xl mx-auto pb-4">
                        {messages.map((msg, i) => (
                            <div key={i} className={clsx(
                                "flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
                                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                            )}>
                                <div className={clsx(
                                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
                                    msg.role === 'user' ? "bg-white/10" : "bg-blue-600"
                                )}>
                                    {msg.role === 'user' ? <div className="w-2 h-2 bg-white rounded-full" /> : <Sparkles size={14} className="text-white" />}
                                </div>
                                <div className={clsx(
                                    "p-4 rounded-2xl max-w-[80%] text-sm leading-relaxed",
                                    msg.role === 'user'
                                        ? "bg-white/10 text-white rounded-tr-sm"
                                        : "bg-[#0e0e12] border border-white/5 text-gray-200 rounded-tl-sm shadow-md"
                                )}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex gap-4">
                                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shrink-0 mt-1">
                                    <Sparkles size={14} className="text-white bg-blue-600 animate-pulse" />
                                </div>
                                <div className="bg-[#0e0e12] border border-white/5 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-4" /> {/* Spacer */}
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="max-w-3xl mx-auto w-full relative px-4 pb-4">
                <form onSubmit={handleSend} className="relative z-20">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask NEURA anything..."
                        className="w-full bg-[#0e0e12] border border-white/10 focus:border-blue-500/50 rounded-2xl py-4 pl-12 pr-14 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-all shadow-lg"
                    />
                    <button type="button" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                        <Mic size={20} />
                    </button>
                    <button
                        type="submit"
                        disabled={!input.trim()}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl disabled:opacity-50 disabled:bg-white/10 transition-all shadow-lg shadow-blue-900/20"
                    >
                        <Send size={18} fill="currentColor" />
                    </button>
                </form>
                <div className="text-center mt-2 text-xs text-gray-600">
                    NEURA AI can make mistakes. Verify important information.
                </div>
            </div>
        </div>
    );
};

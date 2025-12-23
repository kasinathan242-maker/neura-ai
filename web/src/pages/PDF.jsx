import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, File, Send, Loader2, Bot, User } from 'lucide-react';
import clsx from 'clsx';
import axios from 'axios';

export const PDF = () => {
    const [activeFile, setActiveFile] = useState(null); // { filename, stats }
    const [uploading, setUploading] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);

    const onDrop = useCallback(async (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await axios.post('http://localhost:8001/api/upload-pdf', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setActiveFile(res.data);
            setMessages([{ role: 'ai', content: `Analyzed **${res.data.filename}**. You can now ask questions about it!` }]);
        } catch (error) {
            console.error(error);
            alert("Failed to upload PDF");
        } finally {
            setUploading(false);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] } });

    const handleSend = async () => {
        if (!input.trim() || !activeFile) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setSending(true);

        try {
            const res = await axios.post('http://localhost:8001/api/chat-pdf', {
                question: userMsg,
                filename: activeFile.filename
            });
            setMessages(prev => [...prev, { role: 'ai', content: res.data.answer }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'ai', content: "Error getting response." }]);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto w-full pb-8 h-[calc(100vh-6rem)]">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">PDF Intelligence</h1>
                <p className="text-gray-400">Upload and chat with your documents</p>
            </div>

            {!activeFile ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                    <div
                        {...getRootProps()}
                        className={clsx(
                            "w-full max-w-3xl h-96 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all duration-300 cursor-pointer relative",
                            isDragActive
                                ? "border-cyan-500 bg-cyan-500/10"
                                : "border-white/10 bg-[#0e0e12] hover:border-white/20 hover:bg-white/5"
                        )}
                    >
                        <input {...getInputProps()} />
                        {uploading ? (
                            <div className="flex flex-col items-center gap-4">
                                <Loader2 size={48} className="animate-spin text-cyan-500" />
                                <p className="text-white font-medium">Analyzing Document...</p>
                            </div>
                        ) : (
                            <>
                                <div className="w-20 h-20 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-6">
                                    <Upload size={40} className="text-cyan-500" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Drop your PDF here</h3>
                                <p className="text-gray-500 mb-8">or click to browse files</p>
                                <button className="px-6 py-2.5 rounded-xl border border-cyan-500 text-cyan-400 font-medium hover:bg-cyan-500 hover:text-white transition-all flex items-center gap-2">
                                    <FileText size={18} /> Select PDF
                                </button>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
                    {/* Sidebar / Info */}
                    <div className="lg:col-span-1 bg-[#0e0e12] rounded-2xl border border-white/10 p-6 flex flex-col gap-6">
                        <div className="flex items-center gap-4 p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                            <File className="text-cyan-400" size={32} />
                            <div className="overflow-hidden">
                                <h3 className="font-bold text-white truncate" title={activeFile.filename}>{activeFile.filename}</h3>
                                <p className="text-xs text-gray-400">{(activeFile.char_count / 1000).toFixed(1)}k chars</p>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto rounded-xl bg-white/5 p-4 text-xs text-gray-500 font-mono">
                            {activeFile.preview}
                        </div>
                        <button onClick={() => setActiveFile(null)} className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors">
                            Upload Another
                        </button>
                    </div>

                    {/* Chat Area */}
                    <div className="lg:col-span-2 bg-[#0e0e12] rounded-2xl border border-white/10 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            {messages.map((msg, i) => (
                                <div key={i} className={clsx("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                                    <div className={clsx(
                                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                        msg.role === 'user' ? "bg-cyan-500 text-black" : "bg-purple-500 text-white"
                                    )}>
                                        {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                    </div>
                                    <div className={clsx(
                                        "p-4 rounded-2xl max-w-[80%] text-sm leading-relaxed",
                                        msg.role === 'user' ? "bg-cyan-500/10 text-cyan-100 rounded-tr-none" : "bg-white/5 text-gray-300 rounded-tl-none"
                                    )}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                            {sending && (
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center shrink-0">
                                        <Bot size={16} className="text-white" />
                                    </div>
                                    <div className="bg-white/5 p-4 rounded-2xl rounded-tl-none flex items-center gap-2 text-gray-400">
                                        <Loader2 size={16} className="animate-spin" /> Thinking...
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-white/5 bg-[#1a1a1f]">
                            <div className="flex items-center gap-2 bg-[#0e0e12] border border-white/10 rounded-xl px-4 py-2 focus-within:border-cyan-500/50 transition-colors">
                                <input
                                    className="flex-1 bg-transparent border-none outline-none text-white h-10 placeholder:text-gray-600"
                                    placeholder="Ask about your PDF..."
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                                />
                                <button onClick={handleSend} disabled={sending} className="p-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg transition-colors disabled:opacity-50">
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

import React, { useState, useEffect, useRef } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import axios from 'axios';

export const Voice = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [response, setResponse] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Web Speech API refs
    const recognitionRef = useRef(null);
    const synthesisRef = useRef(window.speechSynthesis);

    const speakResponse = (text) => {
        if (!synthesisRef.current) return;

        setIsSpeaking(true);
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.onend = () => setIsSpeaking(false);

        synthesisRef.current.speak(utterance);
    };

    const handleVoiceInput = async (text) => {
        setIsProcessing(true);
        try {
            const res = await axios.post('http://localhost:8001/api/chat-text', { text });
            const aiText = res.data.response;
            setResponse(aiText);
            speakResponse(aiText);
        } catch (_) { // Removed unused error var
            setResponse("Error connecting to AI.");
        } finally {
            setIsProcessing(false);
        }
    };

    // Ref to access current handleVoiceInput in effect without dependency issues
    const handleVoiceInputRef = useRef(handleVoiceInput);
    handleVoiceInputRef.current = handleVoiceInput;

    useEffect(() => {
        // Initialize Speech Recognition
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = 'en-US';

            recognitionRef.current.onresult = (event) => {
                const text = event.results[0][0].transcript;
                setTranscript(text);
                handleVoiceInputRef.current(text);
            };

            recognitionRef.current.onerror = (event) => {
                console.error("Speech recognition error", event.error);
                setIsRecording(false);
            };

            recognitionRef.current.onend = () => {
                setIsRecording(false);
            };
        } else {
            alert("Your browser does not support Speech Recognition.");
        }

        return () => {
            if (recognitionRef.current) recognitionRef.current.abort();
            synthesisRef.current.cancel();
        };
    }, []);

    const toggleRecording = () => {
        if (isRecording) {
            recognitionRef.current.stop();
        } else {
            setTranscript('');
            setResponse('');
            synthesisRef.current.cancel();
            recognitionRef.current.start();
            setIsRecording(true);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] animate-in fade-in zoom-in-95 duration-500 max-w-5xl mx-auto w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">Voice Assistant</h1>
                    <p className="text-gray-400">Speak naturally, learn efficiently</p>
                </div>
                <button
                    onClick={toggleRecording}
                    className={clsx(
                        "flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-all shadow-lg",
                        isRecording ? "bg-red-500 text-white shadow-red-500/20" : "bg-cyan-500 text-black shadow-cyan-500/20 hover:bg-cyan-400"
                    )}
                >
                    <Mic size={18} fill={isRecording ? "currentColor" : "none"} />
                    {isRecording ? "Stop Listening" : "Start Listening"}
                </button>
            </div>

            {/* Main Visualizer Area */}
            <div className="flex-1 glass-panel rounded-3xl p-8 mb-6 relative overflow-hidden flex flex-col items-center justify-center bg-[#0a0a0f] border border-white/10 text-center">

                {/* Conversation Display */}
                <div className="mb-12 max-w-2xl w-full space-y-6 min-h-[100px]">
                    {transcript && (
                        <div className="animate-in fade-in slide-in-from-bottom-4">
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">You said</p>
                            <p className="text-2xl font-light text-white leading-relaxed">"{transcript}"</p>
                        </div>
                    )}

                    {isProcessing && (
                        <div className="flex justify-center py-4">
                            <Loader2 className="animate-spin text-cyan-500" size={32} />
                        </div>
                    )}

                    {response && !isProcessing && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 delay-150">
                            <p className="text-xs text-cyan-500 uppercase tracking-widest mb-2">AI Response</p>
                            <p className="text-xl font-medium text-cyan-100 leading-relaxed text-shadow-glow">{response}</p>
                        </div>
                    )}
                </div>

                {/* Visualizer Animation */}
                <div className="flex items-center gap-1.5 h-16 mb-12">
                    {[...Array(20)].map((_, i) => (
                        <div
                            key={i}
                            className={clsx(
                                "w-1.5 bg-cyan-500 rounded-full transition-all duration-100",
                                (isRecording || isSpeaking) ? "animate-pulse" : ""
                            )}
                            style={{
                                height: (isRecording || isSpeaking) ? `${Math.random() * 40 + 10}px` : '4px',
                                opacity: (isRecording || isSpeaking) ? 1 : 0.2,
                                animationDelay: `${i * 0.05}s`
                            }}
                        />
                    ))}
                </div>

                {/* Central Button */}
                <button
                    onClick={toggleRecording}
                    className={clsx(
                        "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-[0_0_50px_rgba(6,182,212,0.15)] hover:scale-105 active:scale-95",
                        isRecording
                            ? "bg-transparent border-2 border-red-500 text-red-500"
                            : "bg-gradient-to-tr from-cyan-500 to-blue-600 text-white"
                    )}
                >
                    {isRecording ? <div className="w-8 h-8 bg-red-500 rounded-sm" /> : <Mic size={40} />}
                </button>
            </div>
        </div>
    );
};

import React from 'react';
import { Sidebar } from './Sidebar';
import { useStore } from '../store/useStore';
import clsx from 'clsx';
import { Menu, Bell, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FocusTimer } from './FocusTimer';

export const Layout = ({ children }) => {
    const { isSidebarOpen, toggleSidebar } = useStore();
    const navigate = useNavigate();

    // --- Native Wake Word Logic ---
    React.useEffect(() => {
        // Simple continuous listening for "Hey Neura"
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;

        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new Speech();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const lastResultIndex = event.results.length - 1;
            const text = event.results[lastResultIndex][0].transcript.toLowerCase();

            if (text.includes('hey neura') || text.includes('hello neura') || text.includes('hi neura')) {
                console.log("Wake word detected:", text);
                recognition.stop();
                navigate('/voice');
            }
        };

        recognition.onend = () => {
            // Restart listener if not on voice page
            if (window.location.pathname !== '/voice') {
                setTimeout(() => {
                    try { recognition.start(); } catch (e) { }
                }, 100);
            }
        };

        try { recognition.start(); } catch (e) { console.warn("Mic permission or API error", e); }

        return () => {
            try { recognition.abort(); } catch (e) { }
        };
    }, [navigate]);

    return (
        <div className="flex min-h-screen bg-transparent text-gray-100 selection:bg-primary/30">
            <Sidebar />

            <main className={clsx(
                "flex-1 transition-all duration-300 relative min-h-screen flex flex-col",
                isSidebarOpen ? "ml-64" : "ml-20"
            )}>
                {/* Top Bar */}
                <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-40">
                    <div className="flex items-center gap-4">
                        <button onClick={toggleSidebar} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
                            <Menu size={20} />
                        </button>
                        <h1 className="text-sm font-medium text-gray-400 uppercase tracking-widest hidden sm:block">
                            AI Productivity Suite
                        </h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <button className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors relative">
                            <Bell size={20} />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-secondary rounded-full animate-pulse" />
                        </button>
                        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-accent p-[1px]">
                            <div className="h-full w-full rounded-full bg-[#0a0a0f] flex items-center justify-center">
                                <User size={16} className="text-gray-300" />
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-[1600px] w-full mx-auto">
                    {children}
                </div>

                {/* Persistent Features */}
                <FocusTimer />
            </main>
        </div>
    );
};

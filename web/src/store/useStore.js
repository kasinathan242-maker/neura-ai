import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useStore = create(
    persist(
        (set, get) => ({
            isSidebarOpen: true,
            toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

            // --- Global Settings & Preferences ---
            theme: 'neural-dark',
            setTheme: (theme) => set({ theme }),

            language: 'en-US',
            setLanguage: (language) => set({ language }),

            settings: {
                voiceResponses: true,
                autoPlay: false,
                studyReminders: true,
                taskDeadlines: true,
                pomodoro: true
            },
            updateSettings: (newSettings) => set((state) => ({
                settings: { ...state.settings, ...newSettings }
            })),

            // --- Focus Timer ---
            focusMode: {
                isActive: false,
                timeLeft: 1500, // 25 mins in seconds
                duration: 1500
            },
            setFocusState: (newState) => set((state) => ({
                focusMode: { ...state.focusMode, ...newState }
            })),

            // --- Chat & WebSocket ---
            messages: [
                {
                    id: 'init',
                    role: 'ai',
                    content: 'Hello! I am NEURA AI. I can help you study, code, or organize your tasks.',
                    timestamp: new Date().toISOString()
                }
            ],
            addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),

            ws: null,
            isTyping: false,
            isConnected: false,

            connectSocket: () => {
                const { ws } = get();
                if (ws) return; // Already connected or connecting

                const socket = new WebSocket('ws://localhost:8001/ws/chat');

                socket.onopen = () => {
                    console.log('WebSocket Connected');
                    set({ isConnected: true, ws: socket });
                };

                socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'message') {
                            set((state) => ({
                                messages: [...state.messages, { role: 'ai', content: data.content }],
                                isTyping: data.is_thinking || false
                            }));
                        } else if (data.type === 'system') {
                            console.log("System:", data.content);
                        }
                    } catch (e) {
                        console.error("WS Parse Error", e);
                    }
                };

                socket.onclose = () => {
                    console.log('WebSocket Disconnected');
                    set({ isConnected: false, ws: null });
                    // Simple reconnect logic could go here
                    setTimeout(() => get().connectSocket(), 3000);
                };

                socket.onerror = (error) => {
                    console.error('WebSocket Error', error);
                };
            },

            sendMessage: (content) => {
                const { ws, isConnected } = get();
                if (ws && isConnected) {
                    ws.send(JSON.stringify({ content }));
                } else {
                    console.warn("Socket not connected");
                }
            }
        }),
        {
            name: 'neura-storage', // unique name for localStorage key
            partialize: (state) => ({
                theme: state.theme,
                language: state.language,
                settings: state.settings,
                focusMode: state.focusMode,
                isSidebarOpen: state.isSidebarOpen
            }), // Only persist these fields
        }
    )
);

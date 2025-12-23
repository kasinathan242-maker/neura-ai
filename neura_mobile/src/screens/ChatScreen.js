import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { GiftedChat, Bubble, InputToolbar } from 'react-native-gifted-chat';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { WS_URL } from '../api/config';

export default function ChatScreen() {
    const [messages, setMessages] = useState([]);
    const [ws, setWs] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isTyping, setIsTyping] = useState(false);

    useEffect(() => {
        // Initial connection
        connectSocket();

        // Welcome message
        setMessages([
            {
                _id: 1,
                text: 'Hello! I am NEURA AI. How can I help you today?',
                createdAt: new Date(),
                user: {
                    _id: 2,
                    name: 'NEURA AI',
                    avatar: 'https://ui-avatars.com/api/?name=AI&background=0D8ABC&color=fff',
                },
            },
        ]);

        return () => {
            if (ws) ws.close();
        };
    }, []);

    const connectSocket = () => {
        const socket = new WebSocket(`${WS_URL}/ws/chat`);

        socket.onopen = () => {
            console.log('Mobile WS Connected');
            setIsConnected(true);
        };

        socket.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === 'message') {
                    const aiMsg = {
                        _id: Math.random(),
                        text: data.content,
                        createdAt: new Date(),
                        user: {
                            _id: 2,
                            name: 'NEURA AI',
                            avatar: 'https://ui-avatars.com/api/?name=AI&background=0D8ABC&color=fff',
                        }
                    };
                    setMessages(previousMessages => GiftedChat.append(previousMessages, [aiMsg]));
                    setIsTyping(false);
                } else if (data.type === 'is_thinking') {
                    setIsTyping(true);
                }
            } catch (err) {
                console.log('Parse error', err);
            }
        };

        socket.onclose = () => {
            console.log('Mobile WS Disconnected');
            setIsConnected(false);
            setTimeout(connectSocket, 3000);
        };

        socket.onerror = (e) => {
            console.log('Mobile WS Error', e.message);
        };

        setWs(socket);
    };

    const onSend = useCallback((messages = []) => {
        const text = messages[0].text;
        setMessages(previousMessages => GiftedChat.append(previousMessages, messages));

        if (ws && isConnected) {
            setIsTyping(true);
            ws.send(JSON.stringify({ content: text, model: 'mistral' }));
        } else {
            // Offline handling
            const offlineMsg = {
                _id: Math.random(),
                text: "I'm currently offline. Please check your connection to the backend.",
                createdAt: new Date(),
                user: { _id: 2, name: 'System' }
            };
            setMessages(previousMessages => GiftedChat.append(previousMessages, [offlineMsg]));
        }
    }, [ws, isConnected]);

    const renderBubble = (props) => (
        <Bubble
            {...props}
            wrapperStyle={{
                right: { backgroundColor: '#0ea5e9' },
                left: { backgroundColor: '#1e293b' },
            }}
            textStyle={{
                left: { color: '#fff' },
                right: { color: '#fff' },
            }}
        />
    );

    return (
        <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
            <SafeAreaView style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isConnected ? '#22c55e' : '#ef4444', marginRight: 10 }} />
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>AI Chat</Text>
                </View>
                <GiftedChat
                    messages={messages}
                    onSend={messages => onSend(messages)}
                    user={{ _id: 1 }}
                    renderBubble={renderBubble}
                    isTyping={isTyping}
                    theme={{ primary: '#0ea5e9' }}
                />
            </SafeAreaView>
        </View>
    );
}

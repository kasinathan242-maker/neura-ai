import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Bubble, GiftedChat } from 'react-native-gifted-chat';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../api/config';

/**
 * Chat over HTTP.
 *
 * The previous version held a WebSocket to `/ws/chat`, which no longer exists:
 * the backend moved to Server-Sent Events so it can run as a serverless
 * function, and React Native's `fetch` cannot read a streaming body anyway. This
 * posts to `/api/chat` and shows the completed reply.
 */

const AI_USER = {
    _id: 2,
    name: 'NEURA AI',
    avatar: 'https://ui-avatars.com/api/?name=AI&background=06b6d4&color=04222b',
};

const GREETING = {
    _id: 'greeting',
    text: "Hi, I'm NEURA. Ask me anything, or open Vision to show me a problem.",
    createdAt: new Date(),
    user: AI_USER,
};

export default function ChatScreen() {
    const [messages, setMessages] = useState([GREETING]);
    const [isTyping, setIsTyping] = useState(false);
    const [status, setStatus] = useState({ online: false, label: 'Connecting…' });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const health = await api.health();
                if (cancelled) return;
                setStatus({
                    online: true,
                    label:
                        health.active_provider === 'offline'
                            ? 'No model configured'
                            : `${health.active_provider} · ${health.active_model}`,
                });
            } catch {
                if (!cancelled) setStatus({ online: false, label: 'Backend unreachable' });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const onSend = useCallback(
        async (outgoing = []) => {
            const text = outgoing[0]?.text?.trim();
            if (!text) return;

            setMessages((previous) => GiftedChat.append(previous, outgoing));
            setIsTyping(true);

            // GiftedChat keeps newest-first, so reverse for chronological history.
            const history = [...messages]
                .reverse()
                .filter((m) => m._id !== 'greeting' && m.text)
                .slice(-16)
                .map((m) => ({ role: m.user._id === 1 ? 'user' : 'assistant', content: m.text }));

            try {
                const result = await api.chat(text, history);
                setMessages((previous) =>
                    GiftedChat.append(previous, [
                        {
                            _id: `a${Date.now()}`,
                            text: result.response,
                            createdAt: new Date(),
                            user: AI_USER,
                        },
                    ]),
                );
                setStatus((s) => ({ ...s, online: true }));
            } catch (error) {
                setMessages((previous) =>
                    GiftedChat.append(previous, [
                        {
                            _id: `e${Date.now()}`,
                            text: error.message,
                            createdAt: new Date(),
                            user: { _id: 2, name: 'System' },
                        },
                    ]),
                );
                setStatus({ online: false, label: 'Backend unreachable' });
            } finally {
                setIsTyping(false);
            }
        },
        [messages],
    );

    const renderBubble = (props) => (
        <Bubble
            {...props}
            wrapperStyle={{
                right: { backgroundColor: '#06b6d4' },
                left: { backgroundColor: '#1e293b' },
            }}
            textStyle={{
                left: { color: '#e5e7eb' },
                right: { color: '#04222b' },
            }}
        />
    );

    return (
        <View style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
            <SafeAreaView style={{ flex: 1 }}>
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: 'rgba(255,255,255,0.08)',
                    }}
                >
                    <View
                        style={{
                            width: 9,
                            height: 9,
                            borderRadius: 5,
                            backgroundColor: status.online ? '#22c55e' : '#ef4444',
                            marginRight: 10,
                        }}
                    />
                    <Text style={{ color: '#f8fafc', fontSize: 18, fontWeight: '700' }}>AI Chat</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 11, marginLeft: 'auto' }}>
                        {status.label}
                    </Text>
                </View>

                <GiftedChat
                    messages={messages}
                    onSend={onSend}
                    user={{ _id: 1 }}
                    renderBubble={renderBubble}
                    isTyping={isTyping}
                    placeholder="Ask NEURA anything…"
                />
            </SafeAreaView>
        </View>
    );
}

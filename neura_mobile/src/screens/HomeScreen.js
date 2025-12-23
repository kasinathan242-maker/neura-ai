import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageSquare, BookOpen, CheckSquare, Mic, FileText, Code, Layers, FileEdit } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function HomeScreen({ navigation }) {
    const modules = [
        { name: 'AI Chat', icon: MessageSquare, route: 'Chat', color: ['#2563eb', '#06b6d4'], desc: 'Conversational AI Assistant' },
        { name: 'Study Center', icon: BookOpen, route: 'Study', color: ['#7c3aed', '#a855f7'], desc: 'Tutor & Explanations' },
        { name: 'Tasks', icon: CheckSquare, route: 'Tasks', color: ['#059669', '#34d399'], desc: 'AI Planner & Todo' },
        { name: 'PDF Intelligence', icon: FileText, route: 'Pdf', color: ['#db2777', '#f472b6'], desc: 'Chat with Documents' },
        { name: 'Coding Assistant', icon: Code, route: 'Coding', color: ['#ea580c', '#fb923c'], desc: 'Debug & Optimize' },
        { name: 'Voice Mode', icon: Mic, route: 'Voice', color: ['#dc2626', '#f87171'], desc: 'Hands-free Interaction' },
        { name: 'Flashcards', icon: Layers, route: 'Flashcards', color: ['#ca8a04', '#facc15'], desc: 'Review & Memorize' },
        { name: 'Quick Notes', icon: FileEdit, route: 'Notes', color: ['#4f46e5', '#818cf8'], desc: 'Capture Ideas' },
    ];

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1 }}>
                <View style={styles.header}>
                    <Text style={styles.greeting}>Welcome back,</Text>
                    <Text style={styles.username}>Student</Text>
                </View>

                <ScrollView contentContainerStyle={styles.grid}>
                    {modules.map((m, i) => (
                        <TouchableOpacity key={i} style={styles.card} onPress={() => navigation.navigate(m.route)}>
                            <LinearGradient colors={m.color} style={styles.cardGradient}>
                                <m.icon size={32} color="#fff" />
                                <Text style={styles.cardTitle}>{m.name}</Text>
                                <Text style={styles.cardDesc}>{m.desc}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
    header: { marginBottom: 30, marginTop: 10 },
    greeting: { fontSize: 18, color: '#94a3b8' },
    username: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
    grid: { gap: 15, paddingBottom: 20 },
    card: { height: 120, borderRadius: 20, overflow: 'hidden' },
    cardGradient: { flex: 1, padding: 20, justifyContent: 'center' },
    cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginTop: 10 },
    cardDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 12 }
});

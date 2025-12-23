import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { API_URL } from '../api/config';

export default function StudyScreen() {
    const [topic, setTopic] = useState('');
    const [explanation, setExplanation] = useState('');
    const [loading, setLoading] = useState(false);

    const handleExplain = async () => {
        if (!topic.trim()) return;
        setLoading(true);
        try {
            const res = await axios.post(`${API_URL}/api/study/explain`, { topic, depth: "intermediate" });
            setExplanation(res.data.explanation);
        } catch (error) {
            console.error(error);
            setExplanation("Error connecting to AI Tutor.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll}>
                    <Text style={styles.header}>Study Center</Text>

                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>AI Tutor Quick Access</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter topic (e.g. Photosynthesis)"
                            placeholderTextColor="#94a3b8"
                            value={topic}
                            onChangeText={setTopic}
                        />
                        <TouchableOpacity style={styles.button} onPress={handleExplain} disabled={loading}>
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Explain</Text>}
                        </TouchableOpacity>
                    </View>

                    {explanation ? (
                        <View style={[styles.card, { marginTop: 20, backgroundColor: '#1e293b' }]}>
                            <Text style={styles.label}>AI EXPLANATION</Text>
                            <Text style={styles.explanation}>{explanation}</Text>
                        </View>
                    ) : null}

                    <Text style={[styles.label, { marginTop: 30 }]}>MODES</Text>
                    <View style={styles.grid}>
                        {['Study Mode', 'Tutor Mode', 'Revision', 'Exam Prep'].map((mode, i) => (
                            <View key={i} style={styles.gridItem}>
                                <Text style={styles.gridText}>{mode}</Text>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    scroll: { padding: 20 },
    header: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
    card: { backgroundColor: '#1e293b', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
    cardTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
    input: { backgroundColor: '#0f172a', padding: 15, borderRadius: 12, color: '#fff', marginBottom: 15, borderWidth: 1, borderColor: '#334155' },
    button: { backgroundColor: '#8b5cf6', padding: 15, borderRadius: 12, alignItems: 'center' },
    buttonText: { color: '#fff', fontWeight: 'bold' },
    label: { color: '#94a3b8', fontSize: 12, fontWeight: 'bold', marginBottom: 10 },
    explanation: { color: '#e2e8f0', lineHeight: 24, marginTop: 10 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    gridItem: { backgroundColor: '#1e293b', width: '48%', padding: 20, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
    gridText: { color: '#fff', fontWeight: 'bold' }
});

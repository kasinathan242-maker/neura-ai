import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../api/config';
import { Code, Bug, Zap, RefreshCw } from 'lucide-react-native';

export default function CodingScreen() {
    const [code, setCode] = useState('');
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAction = async (action) => {
        if (!code.trim()) return;
        setLoading(true);
        try {
            // The response field is `analysis`; reading `result` here always
            // produced undefined and rendered a blank panel.
            const data = await api.analyzeCode(code, action, 'JavaScript', 'Python');
            setResult(data.analysis);
        } catch (error) {
            setResult(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1 }}>
                <Text style={styles.header}>Coding Assistant</Text>

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        multiline
                        placeholder="Paste your code here..."
                        placeholderTextColor="#64748b"
                        value={code}
                        onChangeText={setCode}
                        textAlignVertical="top"
                    />
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction('explain')}>
                        <Code size={20} color="#fff" />
                        <Text style={styles.btnText}>Explain</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction('bugfix')}>
                        <Bug size={20} color="#fff" />
                        <Text style={styles.btnText}>Debug</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction('optimize')}>
                        <Zap size={20} color="#fff" />
                        <Text style={styles.btnText}>Optimize</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.resultContainer}>
                    {loading ? <ActivityIndicator color="#0ea5e9" /> : (
                        <Text style={styles.resultText}>{result || "AI output will appear here..."}</Text>
                    )}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
    header: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
    inputContainer: { height: 200, backgroundColor: '#1e293b', borderRadius: 12, padding: 10, marginBottom: 20 },
    input: { flex: 1, color: '#fff', fontSize: 14, fontFamily: 'monospace' },
    actions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    actionBtn: { backgroundColor: '#334155', padding: 15, borderRadius: 10, alignItems: 'center', width: '30%' },
    btnText: { color: '#fff', marginTop: 5, fontSize: 12 },
    resultContainer: { flex: 1, backgroundColor: '#111827', borderRadius: 12, padding: 15 },
    resultText: { color: '#e2e8f0', fontFamily: 'monospace', lineHeight: 20 }
});

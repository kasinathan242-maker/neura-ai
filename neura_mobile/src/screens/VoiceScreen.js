import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mic, Volume2 } from 'lucide-react-native';

export default function VoiceScreen() {
    const [isListening, setIsListening] = useState(false);
    const [status, setStatus] = useState('Tap mic to talk');

    const toggleListening = () => {
        setIsListening(!isListening);
        setStatus(isListening ? 'Tap mic to talk' : 'Listening...');
        // In a real device implementation, integrate expo-av recording here
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <View style={styles.circle}>
                    <TouchableOpacity onPress={toggleListening} style={[styles.micButton, isListening && styles.micActive]}>
                        <Mic size={50} color="#fff" />
                    </TouchableOpacity>
                </View>

                <Text style={styles.status}>{status}</Text>

                {isListening && (
                    <View style={styles.waveContainer}>
                        <Text style={{ color: '#64748b' }}>• • • • •</Text>
                    </View>
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    circle: { width: 150, height: 150, borderRadius: 75, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
    micButton: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', shadowColor: '#3b82f6', shadowOpacity: 0.5, shadowRadius: 20 },
    micActive: { backgroundColor: '#ef4444', shadowColor: '#ef4444' },
    status: { fontSize: 24, color: '#fff', fontWeight: 'bold' },
    waveContainer: { marginTop: 20 }
});

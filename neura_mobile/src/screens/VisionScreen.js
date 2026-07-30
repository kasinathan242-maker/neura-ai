import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import api from '../api/config';

/**
 * Point the phone at a problem and get it solved.
 *
 * Photos are captured at reduced quality: a full-resolution phone image is far
 * more detail than a vision model consumes and slow to upload on mobile data.
 */

const MODES = [
    { id: 'solve', label: 'Solve' },
    { id: 'explain', label: 'Explain' },
    { id: 'extract', label: 'Read text' },
    { id: 'diagram', label: 'Diagram' },
];

export default function VisionScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef(null);

    const [photo, setPhoto] = useState(null);
    const [mode, setMode] = useState('solve');
    const [answer, setAnswer] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [speaking, setSpeaking] = useState(false);

    const capture = async () => {
        if (!cameraRef.current || busy) return;
        try {
            const shot = await cameraRef.current.takePictureAsync({
                quality: 0.7,
                skipProcessing: true,
            });
            setPhoto(shot);
            setAnswer('');
            setError(null);
        } catch (err) {
            setError(err?.message || 'Could not take the photo.');
        }
    };

    const analyse = async () => {
        if (!photo || busy) return;
        setBusy(true);
        setError(null);
        setAnswer('');
        try {
            const result = await api.analyzeImage(photo.uri, { mode });
            setAnswer(result.answer);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const speak = () => {
        if (speaking) {
            Speech.stop();
            setSpeaking(false);
            return;
        }
        if (!answer) return;
        setSpeaking(true);
        Speech.speak(answer.replace(/[*_`#>]/g, ''), {
            rate: 1.0,
            onDone: () => setSpeaking(false),
            onStopped: () => setSpeaking(false),
            onError: () => setSpeaking(false),
        });
    };

    if (!permission) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator color="#06b6d4" style={{ marginTop: 40 }} />
            </SafeAreaView>
        );
    }

    if (!permission.granted) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centre}>
                    <Text style={styles.title}>Camera access needed</Text>
                    <Text style={styles.muted}>
                        NEURA reads handwritten problems, diagrams and textbook pages through the camera.
                        Nothing is stored on the device.
                    </Text>
                    <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
                        <Text style={styles.primaryButtonText}>Allow camera</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.title}>Vision</Text>
                <Text style={styles.muted}>Show NEURA a problem instead of typing it.</Text>

                <View style={styles.preview}>
                    {photo ? (
                        <Image source={{ uri: photo.uri }} style={styles.image} resizeMode="contain" />
                    ) : (
                        <CameraView ref={cameraRef} style={styles.image} facing="back" />
                    )}
                </View>

                <View style={styles.modeRow}>
                    {MODES.map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            onPress={() => setMode(item.id)}
                            style={[styles.chip, mode === item.id && styles.chipActive]}
                        >
                            <Text style={[styles.chipText, mode === item.id && styles.chipTextActive]}>
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={styles.actionRow}>
                    {photo ? (
                        <>
                            <TouchableOpacity
                                style={[styles.primaryButton, busy && styles.disabled]}
                                onPress={analyse}
                                disabled={busy}
                            >
                                <Text style={styles.primaryButtonText}>
                                    {busy ? 'Analysing…' : 'Analyse'}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.ghostButton}
                                onPress={() => {
                                    setPhoto(null);
                                    setAnswer('');
                                }}
                            >
                                <Text style={styles.ghostButtonText}>Retake</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity style={styles.primaryButton} onPress={capture}>
                            <Text style={styles.primaryButtonText}>Capture</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {error && (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {busy && <ActivityIndicator color="#06b6d4" style={{ marginTop: 20 }} />}

                {answer && (
                    <View style={styles.answerBox}>
                        <View style={styles.answerHeader}>
                            <Text style={styles.answerLabel}>Answer</Text>
                            <TouchableOpacity onPress={speak}>
                                <Text style={styles.speakText}>{speaking ? 'Stop' : 'Read aloud'}</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.answerText}>{answer}</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0f' },
    scroll: { padding: 16, paddingBottom: 40 },
    centre: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    title: { color: '#f8fafc', fontSize: 24, fontWeight: '700', marginBottom: 4 },
    muted: { color: '#94a3b8', fontSize: 13, marginBottom: 16, lineHeight: 19 },
    preview: {
        aspectRatio: 3 / 4,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#000',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    image: { flex: 1, width: '100%' },
    modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    chipActive: { backgroundColor: 'rgba(6,182,212,0.16)', borderColor: '#06b6d4' },
    chipText: { color: '#94a3b8', fontSize: 13 },
    chipTextActive: { color: '#06b6d4', fontWeight: '600' },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    primaryButton: {
        flex: 1,
        backgroundColor: '#06b6d4',
        paddingVertical: 13,
        borderRadius: 12,
        alignItems: 'center',
    },
    primaryButtonText: { color: '#04222b', fontWeight: '700', fontSize: 15 },
    ghostButton: {
        paddingHorizontal: 20,
        paddingVertical: 13,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center',
    },
    ghostButtonText: { color: '#e5e7eb', fontWeight: '600', fontSize: 15 },
    disabled: { opacity: 0.6 },
    errorBox: {
        marginTop: 16,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.35)',
        backgroundColor: 'rgba(239,68,68,0.08)',
    },
    errorText: { color: '#fca5a5', fontSize: 13, lineHeight: 19 },
    answerBox: {
        marginTop: 18,
        padding: 16,
        borderRadius: 16,
        backgroundColor: '#0e0e12',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    answerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    answerLabel: {
        color: '#06b6d4',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    speakText: { color: '#06b6d4', fontSize: 13, fontWeight: '600' },
    answerText: { color: '#e5e7eb', fontSize: 14, lineHeight: 21 },
});

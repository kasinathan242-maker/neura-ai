import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FlashcardsScreen() {
    const [isFlipped, setIsFlipped] = useState(false);
    const [index, setIndex] = useState(0);

    const cards = [
        { front: 'What is a Component?', back: 'Independent and reusable bits of code.' },
        { front: 'What is State?', back: 'An object that determines how that component renders & behaves.' },
        { front: 'What is Props?', back: 'Inputs to a React component.' },
    ];

    const currentCard = cards[index % cards.length];

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={styles.header}>Flashcards</Text>

                <TouchableOpacity onPress={() => setIsFlipped(!isFlipped)} activeOpacity={0.9}>
                    <View style={styles.card}>
                        <Text style={styles.cardText}>
                            {isFlipped ? currentCard.back : currentCard.front}
                        </Text>
                        <Text style={styles.hint}>{isFlipped ? 'Tap for Question' : 'Tap for Answer'}</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.controls}>
                    <TouchableOpacity onPress={() => { setIndex(index + 1); setIsFlipped(false); }} style={styles.nextButton}>
                        <Text style={styles.btnText}>Next Card</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    header: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 40 },
    card: {
        width: Dimensions.get('window').width * 0.8,
        height: 400,
        backgroundColor: '#1e293b',
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        borderWidth: 1,
        borderColor: '#334155'
    },
    cardText: { color: '#fff', fontSize: 22, textAlign: 'center', fontWeight: 'bold' },
    hint: { marginTop: 20, color: '#94a3b8', fontSize: 12 },
    controls: { marginTop: 40 },
    nextButton: { backgroundColor: '#8b5cf6', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});

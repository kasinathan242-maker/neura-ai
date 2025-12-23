import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Trash2 } from 'lucide-react-native';

export default function NotesScreen() {
    const [notes, setNotes] = useState([{ id: 1, text: 'Remember to study React Native navigation.' }]);
    const [text, setText] = useState('');

    const addNote = () => {
        if (!text.trim()) return;
        setNotes([{ id: Date.now(), text }, ...notes]);
        setText('');
    };

    const deleteNote = (id) => {
        setNotes(notes.filter(n => n.id !== id));
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1, padding: 20 }}>
                <Text style={styles.header}>Quick Notes</Text>

                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.input}
                        placeholder="New Note..."
                        placeholderTextColor="#64748b"
                        value={text}
                        onChangeText={setText}
                    />
                    <TouchableOpacity onPress={addNote} style={styles.addBtn}>
                        <Plus color="#fff" />
                    </TouchableOpacity>
                </View>

                <ScrollView>
                    {notes.map(note => (
                        <View key={note.id} style={styles.noteItem}>
                            <Text style={styles.noteText}>{note.text}</Text>
                            <TouchableOpacity onPress={() => deleteNote(note.id)}>
                                <Trash2 size={20} color="#ef4444" />
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    header: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
    inputRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    input: { flex: 1, backgroundColor: '#1e293b', padding: 15, borderRadius: 12, color: '#fff' },
    addBtn: { backgroundColor: '#22c55e', width: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    noteItem: { backgroundColor: '#1e293b', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    noteText: { color: '#e2e8f0', flex: 1, marginRight: 10 }
});

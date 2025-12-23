import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { API_URL } from '../api/config';
import { CheckSquare, Plus, Sparkles } from 'lucide-react-native';

export default function TasksScreen() {
    const [tasks, setTasks] = useState([]);
    const [newTask, setNewTask] = useState('');
    const [aiGoal, setAiGoal] = useState('');
    const [planning, setPlanning] = useState(false);
    const [showAi, setShowAi] = useState(false);

    const addTask = (text) => {
        if (!text.trim()) return;
        setTasks([{ id: Date.now(), text, completed: false }, ...tasks]);
        setNewTask('');
    };

    const toggleTask = (id) => {
        setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    };

    const handleAiPlan = async () => {
        if (!aiGoal.trim()) return;
        setPlanning(true);
        try {
            const res = await axios.post(`${API_URL}/api/tasks/suggest`, { goal: aiGoal });
            const suggestions = res.data.suggestions.split('\n').filter(line => line.trim().length > 0);

            const newTasks = suggestions.map((s, i) => ({
                id: Date.now() + i,
                text: s.replace(/^[0-9-.*]\s*/, ''),
                completed: false
            }));

            setTasks([...newTasks, ...tasks]);
            setAiGoal('');
            setShowAi(false);
        } catch (error) {
            alert("Planning failed");
        } finally {
            setPlanning(false);
        }
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1 }}>
                <View style={styles.header}>
                    <Text style={styles.title}>Tasks</Text>
                    <TouchableOpacity onPress={() => setShowAi(!showAi)} style={styles.aiButton}>
                        <Sparkles size={20} color="#fff" />
                        <Text style={styles.aiButtonText}>AI Plan</Text>
                    </TouchableOpacity>
                </View>

                {showAi && (
                    <View style={styles.aiPanel}>
                        <TextInput
                            style={styles.aiInput}
                            placeholder="What's your goal?"
                            placeholderTextColor="#a855f7"
                            value={aiGoal}
                            onChangeText={setAiGoal}
                        />
                        <TouchableOpacity style={styles.planButton} onPress={handleAiPlan} disabled={planning}>
                            {planning ? <ActivityIndicator color="#fff" /> : <Text style={styles.planButtonText}>Generate Plan</Text>}
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.addPanel}>
                    <TextInput
                        style={styles.input}
                        placeholder="Add a task..."
                        placeholderTextColor="#64748b"
                        value={newTask}
                        onChangeText={setNewTask}
                    />
                    <TouchableOpacity style={styles.addButton} onPress={() => addTask(newTask)}>
                        <Plus size={24} color="#000" />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.list}>
                    {tasks.map(task => (
                        <TouchableOpacity key={task.id} style={styles.taskItem} onPress={() => toggleTask(task.id)}>
                            <View style={[styles.checkbox, task.completed && styles.checked]}>
                                {task.completed && <CheckSquare size={16} color="#000" />}
                            </View>
                            <Text style={[styles.taskText, task.completed && styles.completedText]}>{task.text}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
    aiButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#7c3aed', padding: 10, borderRadius: 12, gap: 5 },
    aiButtonText: { color: '#fff', fontWeight: 'bold' },
    aiPanel: { backgroundColor: '#2e1065', padding: 15, borderRadius: 12, marginBottom: 20 },
    aiInput: { backgroundColor: '#0f172a', color: '#fff', padding: 10, borderRadius: 8, marginBottom: 10, userSelect: 'auto' }, // userSelect for web compat
    planButton: { backgroundColor: '#7c3aed', padding: 10, borderRadius: 8, alignItems: 'center' },
    planButtonText: { color: '#fff', fontWeight: 'bold' },
    addPanel: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    input: { flex: 1, backgroundColor: '#1e293b', padding: 15, borderRadius: 12, color: '#fff' },
    addButton: { backgroundColor: '#06b6d4', width: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    list: { flex: 1 },
    taskItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 15, borderRadius: 12, marginBottom: 10 },
    checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#64748b', marginRight: 10, alignItems: 'center', justifyContent: 'center' },
    checked: { backgroundColor: '#06b6d4', borderColor: '#06b6d4' },
    taskText: { color: '#fff', fontSize: 16 },
    completedText: { color: '#64748b', textDecorationLine: 'line-through' }
});

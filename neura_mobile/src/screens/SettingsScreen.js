import React, { useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
    const [darkMode, setDarkMode] = useState(true);
    const [notifications, setNotifications] = useState(true);

    const Option = ({ label, value, onValueChange }) => (
        <View style={styles.option}>
            <Text style={styles.label}>{label}</Text>
            <Switch
                value={value}
                onValueChange={onValueChange}
                trackColor={{ false: "#767577", true: "#8b5cf6" }}
                thumbColor={"#f4f3f4"}
            />
        </View>
    );

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1, padding: 20 }}>
                <Text style={styles.header}>Settings</Text>

                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>Preferences</Text>
                    <Option label="Dark Mode" value={darkMode} onValueChange={setDarkMode} />
                    <Option label="Notifications" value={notifications} onValueChange={setNotifications} />
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>About</Text>
                    <Text style={styles.info}>NEURA AI Mobile</Text>
                    <Text style={styles.info}>Version 1.0.0</Text>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    header: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 30 },
    section: { marginBottom: 30 },
    sectionHeader: { color: '#94a3b8', fontSize: 13, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase' },
    option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
    label: { color: '#fff', fontSize: 16 },
    info: { color: '#64748b', marginBottom: 5 }
});

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import axios from 'axios';
import { API_URL } from '../api/config';
import { Upload, FileText, Send } from 'lucide-react-native';
import { GiftedChat } from 'react-native-gifted-chat';

export default function PdfScreen() {
    const [pdfId, setPdfId] = useState(null);
    const [fileName, setFileName] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [messages, setMessages] = useState([]);
    const [typing, setTyping] = useState(false);

    const pickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true
            });

            if (result.canceled) return;

            const file = result.assets[0];
            setFileName(file.name);
            uploadPdf(file);
        } catch (err) {
            console.log('Pick error', err);
        }
    };

    const uploadPdf = async (file) => {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', {
            uri: file.uri,
            name: file.name,
            type: 'application/pdf'
        });

        try {
            const res = await axios.post(`${API_URL}/api/upload-pdf`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setPdfId(res.data.pdf_id);
            setMessages([{
                _id: 1,
                text: `PDF "${file.name}" processed! Ask me questions about it.`,
                createdAt: new Date(),
                user: { _id: 2, name: 'NEURA', avatar: 'https://ui-avatars.com/api/?name=AI' }
            }]);
        } catch (error) {
            alert('Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const onSend = async (newMessages = []) => {
        const text = newMessages[0].text;
        setMessages(prev => GiftedChat.append(prev, newMessages));
        setTyping(true);

        try {
            const res = await axios.post(`${API_URL}/api/chat-pdf`, {
                pdf_id: pdfId,
                question: text
            });

            const aiMsg = {
                _id: Math.random(),
                text: res.data.answer,
                createdAt: new Date(),
                user: { _id: 2, name: 'NEURA', avatar: 'https://ui-avatars.com/api/?name=AI' }
            };
            setMessages(prev => GiftedChat.append(prev, [aiMsg]));
        } catch (error) {
            alert('Failed to get answer');
        } finally {
            setTyping(false);
        }
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1 }}>
                <View style={styles.header}>
                    <Text style={styles.title}>PDF Intelligence</Text>
                    {fileName && <Text style={styles.subtitle}>{fileName}</Text>}
                </View>

                {!pdfId ? (
                    <View style={styles.uploadContainer}>
                        <TouchableOpacity style={styles.uploadButton} onPress={pickDocument} disabled={uploading}>
                            {uploading ? <ActivityIndicator color="#fff" /> : <Upload size={40} color="#fff" />}
                            <Text style={styles.uploadText}>{uploading ? 'Processing...' : 'Upload PDF'}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <GiftedChat
                        messages={messages}
                        onSend={msgs => onSend(msgs)}
                        user={{ _id: 1 }}
                        isTyping={typing}
                        theme={{ primary: '#0ea5e9' }}
                    />
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
    title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
    subtitle: { color: '#94a3b8', fontSize: 14, marginTop: 5 },
    uploadContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    uploadButton: { backgroundColor: '#2563eb', width: 200, height: 200, borderRadius: 20, justifyContent: 'center', alignItems: 'center', gap: 10 },
    uploadText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});

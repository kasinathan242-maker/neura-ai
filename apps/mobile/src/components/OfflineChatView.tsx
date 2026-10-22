import React, { useState } from "react";
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList } from "react-native";
import { llamaRunner } from "../services/llamaRunner";
import { MobileChatMessage } from "../types";

export const OfflineChatView: React.FC<{ isOnline: boolean }> = ({ isOnline }) => {
  const [messages, setMessages] = useState<MobileChatMessage[]>([
    {
      id: "init",
      role: "assistant",
      content:
        "Vanakkam! I am your Socratic study mentor. If you are offline, my on-device Qwen2.5-0.5B model guides you without internet. Which concept shall we explore?",
      timestamp: "Just now",
      is_offline: true,
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("CS3301");
  const [isGenerating, setIsGenerating] = useState(false);

  const subjects = ["CS3301", "CS3452", "CS3401", "EC3354"];

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isGenerating) return;

    setInputText("");
    const userMsg: MobileChatMessage = {
      id: `usr_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: "Just now",
      is_offline: !isOnline,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsGenerating(true);

    try {
      // Execute via on-device llamaRunner or server fallback
      const completion = await llamaRunner.generateCompletion(text);
      const assistantMsg: MobileChatMessage = {
        id: `ast_${Date.now()}`,
        role: "assistant",
        content: completion.text || "Let us analyze the base case for this recurrence relation.",
        timestamp: "Just now",
        is_offline: completion.executed_on === "llama.rn",
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Subject Chips */}
      <View style={styles.subjectRow}>
        {subjects.map((sub) => (
          <TouchableOpacity
            key={sub}
            style={[styles.subjectChip, selectedSubject === sub && styles.subjectChipActive]}
            onPress={() => setSelectedSubject(sub)}
          >
            <Text style={[styles.subjectText, selectedSubject === sub && styles.subjectTextActive]}>
              {sub}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Messages List */}
      <FlatList
        data={messages}
        keyExtractor={(item: MobileChatMessage) => item.id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }: { item: MobileChatMessage }) => {
          const isAssistant = item.role === "assistant";
          return (
            <View
              style={[
                styles.messageBubble,
                isAssistant ? styles.assistantBubble : styles.userBubble,
              ]}
            >
              <Text style={styles.messageText}>{item.content}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>
                  {isAssistant ? (item.is_offline ? "⚡ On-Device llama.rn" : "🌐 Server RAG") : "You"}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {/* Input Row */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder={`Ask a Socratic question (${selectedSubject})...`}
          placeholderTextColor="#6b7280"
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isGenerating}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  subjectRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  subjectChipActive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.4)",
  },
  subjectText: {
    fontSize: 11,
    color: "#9ca3af",
    fontFamily: "monospace",
  },
  subjectTextActive: {
    color: "#10b981",
    fontWeight: "700",
  },
  messageList: {
    paddingBottom: 16,
    gap: 12,
  },
  messageBubble: {
    maxWidth: "85%",
    borderRadius: 18,
    padding: 14,
    marginBottom: 8,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  messageText: {
    color: "#f3f4f6",
    fontSize: 13,
    lineHeight: 19,
  },
  metaRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  metaText: {
    fontSize: 9,
    color: "#6b7280",
    fontFamily: "monospace",
  },
  inputContainer: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  textInput: {
    flex: 1,
    backgroundColor: "#111116",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#ffffff",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  sendButton: {
    backgroundColor: "#10b981",
    borderRadius: 20,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: "#050505",
    fontSize: 12,
    fontWeight: "700",
  },
});

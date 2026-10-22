import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView } from "react-native";
import { mobileDb } from "../database/sqlite";
import { syncEngine } from "../services/syncEngine";
import { LocalNote, SyncResult } from "../types";

export const NotesSyncView: React.FC<{ isOnline: boolean }> = ({ isOnline }) => {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("#CS3301 #Reg2021");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadNotes = () => {
    setNotes(mobileDb.getNotes());
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const handleSaveNote = () => {
    if (!title.trim() || !content.trim()) return;
    mobileDb.saveNote(title.trim(), content.trim(), tags.trim());
    setTitle("");
    setContent("");
    loadNotes();
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const result = await syncEngine.syncNow();
      setSyncResult(result);
      loadNotes();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteNote = (id: string) => {
    mobileDb.deleteNote(id);
    loadNotes();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Sync Control Header */}
      <View style={styles.syncHeader}>
        <View>
          <Text style={styles.syncTitle}>Offline Synchronization</Text>
          <Text style={styles.syncSubtitle}>
            {isOnline ? "Network Connected · Auto-Sync Ready" : "Offline Mode · Changes Queued"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.syncButton, (!isOnline || isSyncing) && styles.syncButtonDisabled]}
          onPress={handleSyncNow}
          disabled={!isOnline || isSyncing}
        >
          <Text style={styles.syncButtonText}>
            {isSyncing ? "Syncing..." : "Sync Now"}
          </Text>
        </TouchableOpacity>
      </View>

      {syncResult && (
        <View style={styles.resultBanner}>
          <Text style={styles.resultText}>
            ✓ Reconciled: {syncResult.reviews_pushed} review(s) & {syncResult.notes_pushed} note(s) pushed.
          </Text>
        </View>
      )}

      {/* Note Creator Shell */}
      <View style={styles.cardShell}>
        <View style={styles.cardCore}>
          <Text style={styles.cardEyebrow}>Quick Offline Note</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Topic (e.g. Master Theorem Case 2)"
            placeholderTextColor="#6b7280"
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            value={content}
            onChangeText={setContent}
            placeholder="Formula, derivation, or Anna Univ 2-mark notes..."
            placeholderTextColor="#6b7280"
            multiline
            numberOfLines={3}
          />
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder="#tags"
            placeholderTextColor="#6b7280"
          />
          <TouchableOpacity
            style={[styles.saveButton, (!title.trim() || !content.trim()) && styles.saveButtonDisabled]}
            onPress={handleSaveNote}
            disabled={!title.trim() || !content.trim()}
          >
            <Text style={styles.saveButtonText}>Save Offline Note</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notes List */}
      <View style={styles.notesList}>
        <Text style={styles.sectionHeader}>Saved Study Notes ({notes.length})</Text>
        {notes.length === 0 ? (
          <Text style={styles.emptyText}>No local notes created yet.</Text>
        ) : (
          notes.map((note) => (
            <View key={note.id} style={styles.noteItem}>
              <View style={styles.noteHeader}>
                <Text style={styles.noteTitle}>{note.title}</Text>
                <View
                  style={[
                    styles.syncPill,
                    { backgroundColor: note.synced ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)" },
                  ]}
                >
                  <Text
                    style={[
                      styles.syncPillText,
                      { color: note.synced ? "#10b981" : "#f59e0b" },
                    ]}
                  >
                    {note.synced ? "Synced" : "Pending Sync"}
                  </Text>
                </View>
              </View>
              <Text style={styles.noteBody}>{note.content}</Text>
              <View style={styles.noteFooter}>
                <Text style={styles.noteTag}>{note.tags}</Text>
                <TouchableOpacity onPress={() => handleDeleteNote(note.id)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  syncHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    marginBottom: 16,
  },
  syncTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  syncSubtitle: {
    color: "#9ca3af",
    fontSize: 11,
    marginTop: 2,
  },
  syncButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  syncButtonDisabled: {
    opacity: 0.4,
  },
  syncButtonText: {
    color: "#050505",
    fontSize: 11,
    fontWeight: "700",
  },
  resultBanner: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    marginBottom: 16,
  },
  resultText: {
    color: "#34d399",
    fontSize: 11,
    fontFamily: "monospace",
  },
  cardShell: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 20,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 20,
  },
  cardCore: {
    backgroundColor: "#111116",
    borderRadius: 16,
    padding: 16,
  },
  cardEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: "#10b981",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#0d0d12",
    borderRadius: 10,
    padding: 10,
    color: "#ffffff",
    fontSize: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 10,
  },
  textArea: {
    height: 70,
    textAlignVertical: "top",
  },
  saveButton: {
    backgroundColor: "#10b981",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: "#050505",
    fontSize: 12,
    fontWeight: "700",
  },
  notesList: {
    marginTop: 8,
  },
  sectionHeader: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
  emptyText: {
    color: "#71717a",
    fontSize: 12,
    fontStyle: "italic",
  },
  noteItem: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  noteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  noteTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  syncPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  syncPillText: {
    fontSize: 9,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  noteBody: {
    color: "#d1d5db",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  noteFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  noteTag: {
    color: "#10b981",
    fontSize: 10,
    fontFamily: "monospace",
  },
  deleteText: {
    color: "#f43f5e",
    fontSize: 10,
    fontWeight: "600",
  },
});

import React, { useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from "react-native";
import { voiceRecorder } from "../services/voiceRecorder";

export const VoiceTutorView: React.FC<{ isOnline: boolean }> = ({ isOnline }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState<string>(
    "Vanakkam! I am NEURA AI. Speak in English or Tamil. What Anna University engineering concept shall we tackle?"
  );
  const [selectedVoice, setSelectedVoice] = useState<"ta_IN" | "en_IN">("ta_IN");

  const handleToggleRecord = async () => {
    if (isRecording) {
      await voiceRecorder.stopRecording();
      setIsRecording(false);
      setIsPlaying(true);
      setTimeout(() => {
        setIsPlaying(false);
        setTranscript(
          "Dijkstra uses a Min-Heap greedy approach, relaxing edges once per node. Why would a negative edge break this greedy invariant?"
        );
      }, 1500);
    } else {
      await voiceRecorder.startRecording();
      setIsRecording(true);
    }
  };

  const handleInterrupt = () => {
    setIsPlaying(false);
    setTranscript("Barge-in registered. Playback halted. What would you like to clarify?");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Network & Mode Status Pill */}
      <View style={styles.statusPill}>
        <View style={[styles.statusDot, { backgroundColor: isOnline ? "#10b981" : "#f59e0b" }]} />
        <Text style={styles.statusText}>
          {isOnline ? "Online · Duplex Speech Engine" : "Offline Mode · On-Device Model"}
        </Text>
      </View>

      {/* Reactive Visualizer Orb Area */}
      <View style={styles.visualizerContainer}>
        <View
          style={[
            styles.outerAura,
            isRecording && styles.outerAuraActive,
            isPlaying && styles.outerAuraPlaying,
          ]}
        />
        <View
          style={[
            styles.middleRing,
            isRecording && styles.middleRingActive,
            isPlaying && styles.middleRingPlaying,
          ]}
        />
        <TouchableOpacity
          style={[
            styles.coreOrb,
            isRecording && styles.coreOrbActive,
            isPlaying && styles.coreOrbPlaying,
          ]}
          onPress={handleToggleRecord}
          activeOpacity={0.85}
        >
          <Text style={styles.orbIcon}>{isRecording ? "🎙️" : isPlaying ? "🔊" : "🎤"}</Text>
          <Text style={styles.orbLabel}>
            {isRecording ? "Listening" : isPlaying ? "Speaking" : "Tap to Speak"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Voice Persona Selector */}
      <View style={styles.personaRow}>
        <TouchableOpacity
          style={[styles.personaChip, selectedVoice === "ta_IN" && styles.personaChipActive]}
          onPress={() => setSelectedVoice("ta_IN")}
        >
          <Text style={[styles.personaText, selectedVoice === "ta_IN" && styles.personaTextActive]}>
            தமிழ் (Selvi - ta_IN)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.personaChip, selectedVoice === "en_IN" && styles.personaChipActive]}
          onPress={() => setSelectedVoice("en_IN")}
        >
          <Text style={[styles.personaText, selectedVoice === "en_IN" && styles.personaTextActive]}>
            English (Kavitha - en_IN)
          </Text>
        </TouchableOpacity>
      </View>

      {/* Barge-in Button */}
      {isPlaying && (
        <TouchableOpacity style={styles.interruptButton} onPress={handleInterrupt} activeOpacity={0.8}>
          <Text style={styles.interruptText}>⏹ Barge-in / Interrupt</Text>
        </TouchableOpacity>
      )}

      {/* Transcript Card */}
      <View style={styles.cardShell}>
        <View style={styles.cardCore}>
          <Text style={styles.cardEyebrow}>Socratic Response</Text>
          <Text style={styles.transcriptBody}>{transcript}</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    alignItems: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 20,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  statusText: {
    color: "#d1d5db",
    fontSize: 11,
    fontWeight: "500",
  },
  visualizerContainer: {
    width: 220,
    height: 220,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 16,
  },
  outerAura: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "rgba(16, 185, 129, 0.06)",
  },
  outerAuraActive: {
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    transform: [{ scale: 1.1 }],
  },
  outerAuraPlaying: {
    backgroundColor: "rgba(14, 165, 233, 0.18)",
    transform: [{ scale: 1.1 }],
  },
  middleRing: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  middleRingActive: {
    borderColor: "rgba(16, 185, 129, 0.5)",
  },
  middleRingPlaying: {
    borderColor: "rgba(14, 165, 233, 0.5)",
  },
  coreOrb: {
    width: 125,
    height: 125,
    borderRadius: 65,
    backgroundColor: "#16161d",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  coreOrbActive: {
    backgroundColor: "#10b981",
    borderColor: "#34d399",
  },
  coreOrbPlaying: {
    backgroundColor: "#0284c7",
    borderColor: "#38bdf8",
  },
  orbIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  orbLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  personaRow: {
    flexDirection: "row",
    gap: 10,
    marginVertical: 12,
  },
  personaChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  personaChipActive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.4)",
  },
  personaText: {
    fontSize: 11,
    color: "#9ca3af",
  },
  personaTextActive: {
    color: "#10b981",
    fontWeight: "600",
  },
  interruptButton: {
    backgroundColor: "rgba(244, 63, 94, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.4)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginVertical: 8,
  },
  interruptText: {
    color: "#fb7185",
    fontSize: 12,
    fontWeight: "700",
  },
  cardShell: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    marginTop: 12,
  },
  cardCore: {
    backgroundColor: "#111116",
    borderRadius: 17,
    padding: 16,
  },
  cardEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: "#10b981",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  transcriptBody: {
    fontSize: 13,
    color: "#e5e7eb",
    lineHeight: 20,
  },
});

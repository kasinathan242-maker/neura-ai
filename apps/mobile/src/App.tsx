import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, SafeAreaView, StatusBar, TouchableOpacity } from "react-native";
import { VoiceTutorView } from "./components/VoiceTutorView";
import { OfflineChatView } from "./components/OfflineChatView";
import { FlashcardsView } from "./components/FlashcardsView";
import { NotesSyncView } from "./components/NotesSyncView";
import { CrisisSafetyBanner } from "./components/CrisisSafetyBanner";
import { llamaRunner } from "./services/llamaRunner";
import { syncEngine } from "./services/syncEngine";

type MobileTab = "voice" | "chat" | "cards" | "notes";

export default function App() {
  const [activeTab, setActiveTab] = useState<MobileTab>("voice");
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [modelTarget, setModelTarget] = useState<string>("llama.rn");

  useEffect(() => {
    llamaRunner.initContext().then(() => {
      const status = llamaRunner.getStatus();
      setModelTarget(status.inference_target);
    });
  }, []);

  const toggleOnlineMode = () => {
    const next = !isOnline;
    setIsOnline(next);
    syncEngine.setOnlineStatus(next);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />

      {/* Mobile Island Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>N</Text>
          </View>
          <View>
            <View style={styles.titleRow}>
              <Text style={styles.appTitle}>NEURA AI</Text>
              <Text style={styles.versionPill}>v8 Mobile</Text>
            </View>
            <Text style={styles.appSubtitle}>Voice & Socratic Tutor · Anna Univ</Text>
          </View>
        </View>

        {/* Network & Mode Switcher Pill */}
        <TouchableOpacity
          style={[styles.modeToggle, { borderColor: isOnline ? "#10b981" : "#f59e0b" }]}
          onPress={toggleOnlineMode}
          activeOpacity={0.8}
        >
          <View style={[styles.modeDot, { backgroundColor: isOnline ? "#10b981" : "#f59e0b" }]} />
          <Text style={styles.modeText}>
            {isOnline ? "Online" : "Offline"} · {modelTarget === "llama.rn" ? "llama.rn" : "Server"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Navigation Pill Strip */}
      <View style={styles.navStrip}>
        {[
          { id: "voice", label: "Voice" },
          { id: "chat", label: "Socratic" },
          { id: "cards", label: "SM-2 Cards" },
          { id: "notes", label: "Notes & Sync" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.id as MobileTab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Active Screen Stage */}
      <View style={styles.stage}>
        {activeTab === "voice" && <VoiceTutorView isOnline={isOnline} />}
        {activeTab === "chat" && <OfflineChatView isOnline={isOnline} />}
        {activeTab === "cards" && <FlashcardsView />}
        {activeTab === "notes" && <NotesSyncView isOnline={isOnline} />}
      </View>

      {/* Permanent Student Crisis Helpline */}
      <CrisisSafetyBanner />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#050505",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    color: "#10b981",
    fontSize: 16,
    fontWeight: "800",
    fontFamily: "monospace",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  appTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  versionPill: {
    color: "#10b981",
    fontSize: 9,
    fontFamily: "monospace",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  appSubtitle: {
    color: "#71717a",
    fontSize: 10,
  },
  modeToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  modeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  modeText: {
    color: "#e5e7eb",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "600",
  },
  navStrip: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 18,
    padding: 3,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 15,
  },
  tabButtonActive: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  tabText: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#10b981",
  },
  stage: {
    flex: 1,
  },
});

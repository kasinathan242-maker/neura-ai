import React from "react";
import { StyleSheet, Text, View, TouchableOpacity, Linking } from "react-native";

export const CrisisSafetyBanner: React.FC = () => {
  const handleCallTeleManas = () => {
    Linking.openURL("tel:14416").catch((err) => {
      console.warn("Could not open dialer:", err);
    });
  };

  return (
    <View style={styles.shell}>
      <View style={styles.core}>
        <View style={styles.headerRow}>
          <Text style={styles.eyebrow}>Govt. of India · Free 24/7</Text>
          <Text style={styles.langBadge}>தமிழ் + English</Text>
        </View>
        <Text style={styles.title}>Tele-MANAS Student Mental Health Helpline</Text>
        <Text style={styles.body}>
          Exam anxiety or academic distress? Certified medical counselors are available immediately.
        </Text>
        <TouchableOpacity
          style={styles.callButton}
          onPress={handleCallTeleManas}
          activeOpacity={0.8}
        >
          <Text style={styles.callButtonText}>📞 Call 14416 (Toll-Free)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  shell: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
    marginVertical: 12,
  },
  core: {
    backgroundColor: "#0d1411",
    borderRadius: 17,
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: "#10b981",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  langBadge: {
    fontSize: 10,
    color: "#a1a1aa",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  body: {
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 18,
    marginBottom: 12,
  },
  callButton: {
    backgroundColor: "#10b981",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  callButtonText: {
    color: "#050505",
    fontSize: 13,
    fontWeight: "700",
  },
});

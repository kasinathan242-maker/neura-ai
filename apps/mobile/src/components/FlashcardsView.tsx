import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from "react-native";
import { mobileDb } from "../database/sqlite";
import { LocalCard } from "../types";

export const FlashcardsView: React.FC = () => {
  const [cards, setCards] = useState<LocalCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const refreshCards = () => {
    const due = mobileDb.getDueCards();
    const all = due.length > 0 ? due : mobileDb.getCardsByDeck("deck_cs3301_dsa");
    setCards(all);
    const payload = mobileDb.getPendingSyncPayload();
    setPendingSyncCount(payload.pending_reviews.length);
  };

  useEffect(() => {
    refreshCards();
  }, []);

  const handleRateQuality = (quality: number) => {
    if (cards.length === 0) return;
    const currentCard = cards[currentIndex];
    mobileDb.recordOfflineReview(currentCard.id, quality);
    setIsFlipped(false);

    if (currentIndex + 1 < cards.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCurrentIndex(0);
    }
    refreshCards();
  };

  const currentCard = cards[currentIndex];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Pending Sync Pill */}
      <View style={styles.syncStatusRow}>
        <Text style={styles.syncStatusText}>
          {pendingSyncCount > 0
            ? `🔄 ${pendingSyncCount} offline review(s) queued for sync`
            : "✓ All reviews synced with server"}
        </Text>
      </View>

      {currentCard ? (
        <View style={styles.cardContainer}>
          {/* Card Shell */}
          <TouchableOpacity
            style={styles.cardShell}
            onPress={() => setIsFlipped((prev) => !prev)}
            activeOpacity={0.9}
          >
            <View style={styles.cardCore}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardCounter}>
                  Card {currentIndex + 1} of {cards.length}
                </Text>
                <Text style={styles.cardDifficulty}>{currentCard.difficulty.toUpperCase()}</Text>
              </View>

              <Text style={styles.cardPrompt}>
                {isFlipped ? "Answer & Proof" : currentCard.question}
              </Text>

              {isFlipped ? (
                <View style={styles.answerBox}>
                  <Text style={styles.answerText}>{currentCard.answer}</Text>
                  <Text style={styles.rationaleText}>
                    Interval: {currentCard.interval_days}d · Repetitions: {currentCard.repetitions} ·
                    EF: {currentCard.easiness_factor.toFixed(2)}
                  </Text>
                </View>
              ) : (
                <View style={styles.optionsList}>
                  {currentCard.options.map((opt, idx) => (
                    <View key={idx} style={styles.optionItem}>
                      <Text style={styles.optionPrefix}>{String.fromCharCode(65 + idx)}.</Text>
                      <Text style={styles.optionText}>{opt}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.flipHint}>
                {isFlipped ? "Tap to see question" : "Tap to flip and reveal answer"}
              </Text>
            </View>
          </TouchableOpacity>

          {/* SM-2 Quality Rating Bar */}
          <View style={styles.ratingSection}>
            <Text style={styles.ratingTitle}>Rate Recall Quality (SM-2 Spaced)</Text>
            <View style={styles.ratingRow}>
              {[
                { q: 0, label: "0: Fail" },
                { q: 2, label: "2: Hard" },
                { q: 3, label: "3: Good" },
                { q: 4, label: "4: Easy" },
                { q: 5, label: "5: Perfect" },
              ].map((btn) => (
                <TouchableOpacity
                  key={btn.q}
                  style={styles.ratingBtn}
                  onPress={() => handleRateQuality(btn.q)}
                >
                  <Text style={styles.ratingBtnText}>{btn.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptySubtitle}>No flashcards currently due for spaced review.</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  syncStatusRow: {
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 16,
  },
  syncStatusText: {
    color: "#a1a1aa",
    fontSize: 11,
    fontFamily: "monospace",
  },
  cardContainer: {
    width: "100%",
  },
  cardShell: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 24,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  cardCore: {
    backgroundColor: "#111116",
    borderRadius: 20,
    padding: 20,
    minHeight: 260,
    justifyContent: "space-between",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardCounter: {
    color: "#71717a",
    fontSize: 11,
    fontFamily: "monospace",
  },
  cardDifficulty: {
    color: "#10b981",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  cardPrompt: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    marginBottom: 16,
  },
  optionsList: {
    gap: 8,
    marginBottom: 16,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  optionPrefix: {
    color: "#71717a",
    fontSize: 11,
    fontFamily: "monospace",
    marginRight: 8,
  },
  optionText: {
    color: "#d1d5db",
    fontSize: 12,
    flex: 1,
  },
  answerBox: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  answerText: {
    color: "#34d399",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 6,
  },
  rationaleText: {
    color: "#9ca3af",
    fontSize: 11,
    fontFamily: "monospace",
  },
  flipHint: {
    textAlign: "center",
    color: "#52525b",
    fontSize: 10,
    fontFamily: "monospace",
    marginTop: 8,
  },
  ratingSection: {
    marginTop: 20,
  },
  ratingTitle: {
    color: "#a1a1aa",
    fontSize: 11,
    textAlign: "center",
    marginBottom: 10,
    fontFamily: "monospace",
  },
  ratingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  ratingBtn: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  ratingBtnText: {
    color: "#d1d5db",
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptySubtitle: {
    color: "#71717a",
    fontSize: 12,
  },
});

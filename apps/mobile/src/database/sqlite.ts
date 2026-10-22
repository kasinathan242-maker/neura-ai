/**
 * NEURA AI — Mobile Local SQLite Engine
 * Manages offline storage for SM-2 cards, review queues, study notes, and sync timestamps.
 */

import { LocalCard, LocalDeck, LocalNote, ReviewQueueItem, SyncPayload } from "../types";

export class MobileDatabase {
  private decks: Map<string, LocalDeck> = new Map();
  private cards: Map<string, LocalCard> = new Map();
  private reviewQueue: Map<string, ReviewQueueItem> = new Map();
  private notes: Map<string, LocalNote> = new Map();
  private syncMeta: { last_sync: string; device_id: string } = {
    last_sync: new Date(0).toISOString(),
    device_id: "mobile_device_default",
  };

  constructor() {
    this.seedDefaultCurriculum();
  }

  private seedDefaultCurriculum(): void {
    // Seed default Anna University CS3301 / CS3401 deck for immediate offline study
    const defaultDeckId = "deck_cs3301_dsa";
    this.decks.set(defaultDeckId, {
      id: defaultDeckId,
      title: "CS3301 Data Structures & Algorithms",
      description: "Anna University Regulation 2021 core topics: Trees, Heaps, Graph algorithms",
      total_cards: 3,
      due_cards: 3,
      synced_at: new Date().toISOString(),
    });

    const nowIso = new Date().toISOString();
    const seedCards: LocalCard[] = [
      {
        id: "card_dsa_1",
        deck_id: defaultDeckId,
        question: "What is the worst-case time complexity of QuickSort and how can it be avoided?",
        answer: "O(n^2), avoided by randomized pivot selection or median-of-medians.",
        options: ["O(n log n)", "O(n^2)", "O(n)", "O(log n)"],
        difficulty: "medium",
        interval_days: 1,
        repetitions: 0,
        easiness_factor: 2.5,
        next_review_at: nowIso,
        updated_at: nowIso,
        synced: true,
      },
      {
        id: "card_dsa_2",
        deck_id: defaultDeckId,
        question: "Why does Bellman-Ford algorithm support negative weight edges whereas Dijkstra does not?",
        answer: "Bellman-Ford relaxes all |V|-1 edges iteratively without assuming greedy non-decreasing path lengths.",
        options: [
          "It uses Fibonacci heaps",
          "It relaxes all edges |V|-1 times without greedy commitment",
          "It transforms negative edges to positive",
          "It works only on trees",
        ],
        difficulty: "hard",
        interval_days: 1,
        repetitions: 0,
        easiness_factor: 2.5,
        next_review_at: nowIso,
        updated_at: nowIso,
        synced: true,
      },
      {
        id: "card_dsa_3",
        deck_id: defaultDeckId,
        question: "In an AVL tree, what rotation is required for a Left-Right (LR) imbalance?",
        answer: "A left rotation on the left child followed by a right rotation on the root.",
        options: ["Single Right Rotation", "Left-Right Double Rotation", "Single Left Rotation", "Right-Right Rotation"],
        difficulty: "easy",
        interval_days: 1,
        repetitions: 0,
        easiness_factor: 2.5,
        next_review_at: nowIso,
        updated_at: nowIso,
        synced: true,
      },
    ];

    for (const card of seedCards) {
      this.cards.set(card.id, card);
    }
  }

  // --- Decks & Cards Queries ---
  public getDecks(): LocalDeck[] {
    return Array.from(this.decks.values());
  }

  public getCardsByDeck(deckId: string): LocalCard[] {
    return Array.from(this.cards.values()).filter((c) => c.deck_id === deckId);
  }

  public getDueCards(deckId?: string): LocalCard[] {
    const now = new Date().toISOString();
    return Array.from(this.cards.values()).filter((c) => {
      const matchDeck = !deckId || c.deck_id === deckId;
      return matchDeck && c.next_review_at <= now;
    });
  }

  // --- Offline SM-2 Review Execution ---
  public recordOfflineReview(cardId: string, quality: number, durationMs: number = 2000): LocalCard {
    const card = this.cards.get(cardId);
    if (!card) {
      throw new Error(`Card ${cardId} not found in local database`);
    }

    // Standard SuperMemo SM-2 calculation
    const q = Math.max(0, Math.min(5, quality));
    let { interval_days, repetitions, easiness_factor } = card;

    if (q >= 3) {
      if (repetitions === 0) {
        interval_days = 1;
      } else if (repetitions === 1) {
        interval_days = 6;
      } else {
        interval_days = Math.max(1, Math.round(interval_days * easiness_factor));
      }
      repetitions += 1;
    } else {
      repetitions = 0;
      interval_days = 1;
    }

    // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
    easiness_factor = Math.max(1.3, parseFloat((easiness_factor + delta).toFixed(4)));

    const now = new Date();
    const nextReview = new Date(now.getTime() + interval_days * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const updatedCard: LocalCard = {
      ...card,
      interval_days,
      repetitions,
      easiness_factor,
      next_review_at: nextReview,
      updated_at: nowIso,
      synced: false,
    };

    this.cards.set(cardId, updatedCard);

    // Queue review for backend synchronization
    const queueId = `rq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const queueItem: ReviewQueueItem = {
      id: queueId,
      card_id: cardId,
      quality: q,
      duration_ms: durationMs,
      reviewed_at: nowIso,
      synced: false,
    };
    this.reviewQueue.set(queueId, queueItem);

    // Update deck due counts
    const deck = this.decks.get(card.deck_id);
    if (deck) {
      deck.due_cards = this.getDueCards(deck.id).length;
    }

    return updatedCard;
  }

  // --- Notes CRUD ---
  public getNotes(): LocalNote[] {
    return Array.from(this.notes.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  public saveNote(title: string, content: string, tags?: string): LocalNote {
    const nowIso = new Date().toISOString();
    const noteId = `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const note: LocalNote = {
      id: noteId,
      title,
      content,
      tags,
      created_at: nowIso,
      updated_at: nowIso,
      synced: false,
    };
    this.notes.set(noteId, note);
    return note;
  }

  public deleteNote(noteId: string): boolean {
    return this.notes.delete(noteId);
  }

  // --- Sync Engine Payloads & Acknowledgement ---
  public getPendingSyncPayload(): SyncPayload {
    const pendingReviews = Array.from(this.reviewQueue.values()).filter((r) => !r.synced);
    const pendingNotes = Array.from(this.notes.values()).filter((n) => !n.synced);
    return {
      device_id: this.syncMeta.device_id,
      last_sync_timestamp: this.syncMeta.last_sync,
      pending_reviews: pendingReviews,
      pending_notes: pendingNotes,
    };
  }

  public acknowledgeSyncSuccess(serverTimestamp: string, syncedReviewIds: string[]): void {
    for (const rId of syncedReviewIds) {
      const item = this.reviewQueue.get(rId);
      if (item) item.synced = true;
    }
    for (const note of this.notes.values()) {
      note.synced = true;
    }
    this.syncMeta.last_sync = serverTimestamp;
  }

  /**
   * Conflict resolution: Last-Write-Wins (LWW) with server timestamp comparison.
   */
  public resolveConflictAndUpsertCard(serverCard: LocalCard): { resolved: boolean; winner: "server" | "local" } {
    const local = this.cards.get(serverCard.id);
    if (!local) {
      this.cards.set(serverCard.id, { ...serverCard, synced: true });
      return { resolved: true, winner: "server" };
    }

    const localTime = new Date(local.updated_at).getTime();
    const serverTime = new Date(serverCard.updated_at).getTime();

    if (serverTime >= localTime) {
      this.cards.set(serverCard.id, { ...serverCard, synced: true });
      return { resolved: true, winner: "server" };
    } else {
      // Local is newer: preserve local and mark unsynced for next push
      return { resolved: true, winner: "local" };
    }
  }
}

export const mobileDb = new MobileDatabase();

/**
 * NEURA AI — Mobile Domain Types & Offline Schema
 */

export interface LocalDeck {
  id: string;
  title: string;
  description?: string;
  total_cards: number;
  due_cards: number;
  synced_at: string;
}

export interface LocalCard {
  id: string;
  deck_id: string;
  question: string;
  answer: string;
  options: string[];
  difficulty: "easy" | "medium" | "hard";
  interval_days: number;
  repetitions: number;
  easiness_factor: number;
  next_review_at: string;
  updated_at: string;
  synced: boolean;
}

export interface ReviewQueueItem {
  id: string;
  card_id: string;
  quality: number;
  duration_ms: number;
  reviewed_at: string;
  synced: boolean;
}

export interface LocalNote {
  id: string;
  title: string;
  content: string;
  tags?: string;
  created_at: string;
  updated_at: string;
  synced: boolean;
}

export interface OfflineModelStatus {
  is_downloaded: boolean;
  is_ready: boolean;
  model_name: string;
  model_path: string;
  file_size_mb: number;
  device_ram_gb: number;
  can_run_on_device: boolean;
  inference_target: "llama.rn" | "server_api";
}

export interface SyncPayload {
  device_id: string;
  last_sync_timestamp: string;
  pending_reviews: ReviewQueueItem[];
  pending_notes: LocalNote[];
}

export interface SyncResult {
  success: boolean;
  reviews_pushed: number;
  notes_pushed: number;
  cards_pulled: number;
  decks_pulled: number;
  conflicts_resolved: number;
  server_timestamp: string;
}

export interface MobileChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  is_offline: boolean;
}

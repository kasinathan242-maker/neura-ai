/**
 * NEURA AI — Frontend Domain Types & API Interfaces
 */

export interface User {
  id: string;
  email: string;
  full_name: string;
  college: string;
  department: string;
  year_of_study: number;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface DocumentItem {
  id: string;
  title: string;
  file_size_bytes: number;
  mime_type: string;
  status: string;
  summary: string | null;
  chunk_count: number;
  created_at: string;
}

export interface DocumentSummary {
  document_id: string;
  title: string;
  summary: string;
  status: string;
}

export interface ChunkItem {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  page_number: number;
  token_count: number;
}

export interface Citation {
  chunk_id: string;
  document_id: string;
  document_title: string;
  page_number: number;
  similarity_score: number;
  snippet: string;
}

export interface ChatMessageItem {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  timestamp?: string;
}

export interface ChatThreadItem {
  id: string;
  title: string;
  document_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlashcardItem {
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
}

export interface FlashcardDeckItem {
  id: string;
  title: string;
  description?: string | null;
  document_id?: string | null;
  total_cards: number;
  due_cards: number;
  created_at: string;
}

export interface FlashcardStats {
  total_reviews: number;
  retention_rate: number;
  cards_learned: number;
  cards_due_today: number;
}

export interface NoteItem {
  id: string;
  user_id: string;
  document_id?: string | null;
  title: string;
  content: string;
  tags?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  scheduled_time: string;
  is_sent: boolean;
  created_at: string;
}

export interface ServiceHealth {
  status: string;
  service: string;
  uptime_seconds?: number;
  device?: string;
  dependencies?: Record<string, { status: string; message: string }>;
}

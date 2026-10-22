"""001_initial_schema: Creates users, sessions, documents, chunks, notes, flashcards, review_logs, reminders, chat, checkins

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-10-22 15:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Users
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("college", sa.String(255), nullable=True),
        sa.Column("department", sa.String(100), nullable=True),
        sa.Column("year_of_study", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # 2. Sessions
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("refresh_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessions_refresh_token_hash", "sessions", ["refresh_token_hash"])
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])

    # 3. Documents
    op.create_table(
        "documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("file_path_minio", sa.String(500), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("mime_type", sa.String(100), nullable=False, server_default=sa.text("'application/pdf'")),
        sa.Column("status", sa.String(50), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_documents_user_id", "documents", ["user_id"])

    # 4. Chunks
    op.create_table(
        "chunks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("embedding", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_chunks_document_id", "chunks", ["document_id"])
    op.create_index("ix_chunks_user_id", "chunks", ["user_id"])

    # 5. Notes
    op.create_table(
        "notes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tags", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_notes_user_id", "notes", ["user_id"])

    # 6. Flashcard Decks
    op.create_table(
        "flashcard_decks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_flashcard_decks_user_id", "flashcard_decks", ["user_id"])

    # 7. Flashcards
    op.create_table(
        "flashcards",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("deck_id", sa.String(36), sa.ForeignKey("flashcard_decks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("options", sa.Text(), nullable=True),
        sa.Column("difficulty", sa.String(20), nullable=False, server_default=sa.text("'medium'")),
        sa.Column("interval_days", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("repetitions", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("easiness_factor", sa.Float(), nullable=False, server_default=sa.text("2.5")),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_flashcards_deck_id", "flashcards", ["deck_id"])
    op.create_index("ix_flashcards_next_review_at", "flashcards", ["next_review_at"])

    # 8. Review Logs
    op.create_table(
        "review_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("flashcard_id", sa.String(36), sa.ForeignKey("flashcards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quality", sa.Integer(), nullable=False),
        sa.Column("scheduled_interval", sa.Integer(), nullable=False),
        sa.Column("reviewed_interval", sa.Integer(), nullable=False),
        sa.Column("easiness_factor", sa.Float(), nullable=False),
        sa.Column("review_duration_ms", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_review_logs_flashcard_id", "review_logs", ["flashcard_id"])

    # 9. Reminders
    op.create_table(
        "reminders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("scheduled_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_reminders_user_id", "reminders", ["user_id"])

    # 10. Chat Threads
    op.create_table(
        "chat_threads",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False, server_default=sa.text("'New Socratic Dialogue'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_chat_threads_user_id", "chat_threads", ["user_id"])

    # 11. Messages
    op.create_table(
        "messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("thread_id", sa.String(36), sa.ForeignKey("chat_threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("language", sa.String(20), nullable=False, server_default=sa.text("'en'")),
        sa.Column("citations", sa.Text(), nullable=True),
        sa.Column("token_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_messages_thread_id", "messages", ["thread_id"])

    # 12. Checkins
    op.create_table(
        "checkins",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("input_text", sa.Text(), nullable=True),
        sa.Column("focus_state", sa.String(20), nullable=False),
        sa.Column("crisis_triggered", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_checkins_user_id", "checkins", ["user_id"])


def downgrade() -> None:
    op.drop_table("checkins")
    op.drop_table("messages")
    op.drop_table("chat_threads")
    op.drop_table("reminders")
    op.drop_table("review_logs")
    op.drop_table("flashcards")
    op.drop_table("flashcard_decks")
    op.drop_table("notes")
    op.drop_table("chunks")
    op.drop_table("documents")
    op.drop_table("sessions")
    op.drop_table("users")

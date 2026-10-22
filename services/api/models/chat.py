"""Chat threads, Socratic message dialogues, and student energy check-in database models."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

try:
    from services.api.database import Base
    from services.api.models.base import TimestampMixin, UUIDPrimaryKeyMixin, utc_now
except ImportError:
    from database import Base
    from models.base import TimestampMixin, UUIDPrimaryKeyMixin, utc_now


class ChatThread(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Conversational session between student and NEURA AI Socratic tutor."""

    __tablename__ = "chat_threads"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    document_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("documents.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        default="New Socratic Dialogue",
        nullable=False,
    )

    # Relationships
    messages: Mapped[list["Message"]] = relationship(
        "Message",
        back_populates="thread",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class Message(Base, UUIDPrimaryKeyMixin):
    """Dialogue turn within a chat thread."""

    __tablename__ = "messages"

    thread_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("chat_threads.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    role: Mapped[str] = mapped_column(
        String(20),  # "user", "assistant", "system"
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    language: Mapped[str] = mapped_column(
        String(20),
        default="en",  # "en", "ta", "tanglish"
        nullable=False,
    )
    citations: Mapped[str | None] = mapped_column(
        Text,  # Stored as JSON array: [{"chunk_id": "...", "doc_id": "...", "snippet": "..."}]
        nullable=True,
    )
    token_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    # Relationships
    thread: Mapped["ChatThread"] = relationship("ChatThread", back_populates="messages")


class Checkin(Base, UUIDPrimaryKeyMixin):
    """Student study energy check-in (NEURA-FOCUS) with strict privacy boundaries."""

    __tablename__ = "checkins"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # Never persist raw text if crisis is flagged or user opts for ephemeral state
    input_text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    focus_state: Mapped[str] = mapped_column(
        String(20),  # "focused", "tired", "stressed", "ok"
        nullable=False,
    )
    crisis_triggered: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

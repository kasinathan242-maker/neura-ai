"""Study tools database models: Notes, Flashcards, SM-2 Review Logs, and Reminders."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

try:
    from services.api.database import Base
    from services.api.models.base import TimestampMixin, UUIDPrimaryKeyMixin, utc_now
except ImportError:
    from database import Base
    from models.base import TimestampMixin, UUIDPrimaryKeyMixin, utc_now


class Note(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """User study notes associated with subjects or documents."""

    __tablename__ = "notes"

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
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    tags: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )


class FlashcardDeck(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Group of flashcards generated from syllabus topics or uploaded PDFs."""

    __tablename__ = "flashcard_decks"

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
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationships
    cards: Mapped[list["Flashcard"]] = relationship(
        "Flashcard",
        back_populates="deck",
        cascade="all, delete-orphan",
    )


class Flashcard(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Individual flashcard with SM-2 Spaced Repetition parameters."""

    __tablename__ = "flashcards"

    deck_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("flashcard_decks.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    question: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    answer: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    options: Mapped[str | None] = mapped_column(
        Text,  # Stored as JSON array: ["A", "B", "C", "D"]
        nullable=True,
    )
    difficulty: Mapped[str] = mapped_column(
        String(20),
        default="medium",  # "easy", "medium", "hard"
        nullable=False,
    )

    # SM-2 Algorithm State
    interval_days: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    repetitions: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    easiness_factor: Mapped[float] = mapped_column(
        Float,
        default=2.5,
        nullable=False,
    )
    next_review_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        index=True,
        nullable=False,
    )

    # Relationships
    deck: Mapped["FlashcardDeck"] = relationship("FlashcardDeck", back_populates="cards")
    reviews: Mapped[list["ReviewLog"]] = relationship(
        "ReviewLog",
        back_populates="card",
        cascade="all, delete-orphan",
    )


class ReviewLog(Base, UUIDPrimaryKeyMixin):
    """Historical audit of each flashcard review event for SM-2 interval computation."""

    __tablename__ = "review_logs"

    flashcard_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("flashcards.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    quality: Mapped[int] = mapped_column(
        Integer,  # 0 to 5 SM-2 rating
        nullable=False,
    )
    scheduled_interval: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    reviewed_interval: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    easiness_factor: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )
    review_duration_ms: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    # Relationships
    card: Mapped["Flashcard"] = relationship("Flashcard", back_populates="reviews")


class Reminder(Base, UUIDPrimaryKeyMixin):
    """Scheduled study reminders and spaced repetition push alerts."""

    __tablename__ = "reminders"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    scheduled_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    is_sent: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

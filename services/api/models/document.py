"""Document and Semantic Text Chunk database models."""


from sqlalchemy import BigInteger, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

try:
    from services.api.database import Base
    from services.api.models.base import TimestampMixin, UUIDPrimaryKeyMixin
except ImportError:
    from database import Base
    from models.base import TimestampMixin, UUIDPrimaryKeyMixin


class Document(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """User uploaded study material (syllabus PDF, textbook, handwritten notes)."""

    __tablename__ = "documents"

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
    file_path_minio: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    file_size_bytes: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
    )
    mime_type: Mapped[str] = mapped_column(
        String(100),
        default="application/pdf",
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        default="queued",  # "queued", "processing", "indexed", "failed"
        nullable=False,
    )
    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationships
    chunks: Mapped[list["Chunk"]] = relationship(
        "Chunk",
        back_populates="document",
        cascade="all, delete-orphan",
    )


class Chunk(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Semantic chunk indexed for dense vector search (NEURA-EMBED)."""

    __tablename__ = "chunks"

    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("documents.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    chunk_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    token_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    page_number: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    # Stored as serialized vector JSON or mapped pgvector column
    embedding: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="chunks")

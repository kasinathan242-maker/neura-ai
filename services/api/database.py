"""SQLAlchemy 2.0 Async Database Connection and Session Management."""

import logging
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

try:
    from services.api.config import settings
except ImportError:
    from config import settings

logger = logging.getLogger("neura.database")

# Configure database engine with fallback handling
db_url = settings.DATABASE_URL
# Convert postgresql:// to postgresql+asyncpg:// if needed
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# SQLite fallback parameters vs Postgres pooling
connect_args = {}
if "sqlite" in db_url:
    connect_args = {"check_same_thread": False}
    engine = create_async_engine(
        db_url,
        echo=settings.DEBUG,
        connect_args=connect_args,
    )
else:
    engine = create_async_engine(
        db_url,
        echo=settings.DEBUG,
        pool_size=settings.POSTGRES_POOL_SIZE,
        max_overflow=settings.POSTGRES_MAX_OVERFLOW,
        pool_pre_ping=True,
    )

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy declarative models."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async database session with automatic transaction management."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

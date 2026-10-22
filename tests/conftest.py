"""Global pytest configuration and fixtures for NEURA AI test suite."""

import asyncio
import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Ensure all tests run in test environment with local test database
TEST_DB_FILE = REPO_ROOT / "test_suite_neura.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB_FILE.as_posix()}"
os.environ["ENVIRONMENT"] = "testing"

from services.api.database import engine
from services.api.models import Base


@pytest.fixture(scope="session", autouse=True)
def initialize_test_suite_database():
    """Initializes and tears down schema for the entire test session."""
    async def init_tables():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(init_tables())
    yield
    async def cleanup_tables():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    asyncio.run(cleanup_tables())
    if TEST_DB_FILE.exists():
        try:
            TEST_DB_FILE.unlink()
        except OSError:
            pass

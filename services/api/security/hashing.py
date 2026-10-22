"""Cryptographic password hashing and verification using Argon2id."""

import logging

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

try:
    from services.api.config import settings
except ImportError:
    from config import settings

logger = logging.getLogger("neura.security.hashing")

# Instantiate Argon2id hasher with production security parameters
hasher = PasswordHasher(
    time_cost=settings.ARGON2_TIME_COST,
    memory_cost=settings.ARGON2_MEMORY_COST,
    parallelism=settings.ARGON2_PARALLELISM,
    hash_len=32,
)


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2id."""
    return hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against an Argon2id hash."""
    try:
        return hasher.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    except Exception as exc:
        logger.error(f"Unexpected error during password verification: {exc}")
        return False

"""JWT and Rotating Refresh Token issuance and validation."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

try:
    from services.api.config import settings
except ImportError:
    from config import settings


def create_access_token(
    user_id: str,
    email: str,
    expires_delta: timedelta | None = None,
) -> str:
    """Creates a signed 15-minute JWT access token."""
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "iat": now.timestamp(),
        "exp": expire.timestamp(),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decodes and validates a JWT access token. Raises jwt.PyJWTError on failure."""
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        options={"require": ["sub", "exp", "iat"]},
    )


def hash_refresh_token(raw_token: str) -> str:
    """Calculates SHA-256 digest of an opaque refresh token for secure database lookup."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_refresh_token(
    expires_delta: timedelta | None = None,
) -> tuple[str, str, datetime]:
    """Generates a high-entropy 64-character opaque refresh token, its SHA-256 hash, and expiry time."""
    raw_token = secrets.token_urlsafe(48)
    token_hash = hash_refresh_token(raw_token)

    now = datetime.now(timezone.utc)
    if expires_delta:
        expires_at = now + expires_delta
    else:
        expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    return raw_token, token_hash, expires_at

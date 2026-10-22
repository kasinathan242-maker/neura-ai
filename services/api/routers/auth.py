"""Authentication router for student registration, login, token rotation, and logout."""

import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from services.api.database import get_db
    from services.api.models.user import Session as DBSession
    from services.api.models.user import User
    from services.api.schemas.auth import (
        MessageResponse,
        TokenRefreshRequest,
        TokenResponse,
        UserLoginRequest,
        UserRegisterRequest,
        UserResponse,
    )
    from services.api.security.dependencies import get_current_user
    from services.api.security.hashing import hash_password, verify_password
    from services.api.security.tokens import (
        create_access_token,
        create_refresh_token,
        hash_refresh_token,
    )
except ImportError:
    from database import get_db
    from models.user import Session as DBSession
    from models.user import User
    from schemas.auth import (
        MessageResponse,
        TokenRefreshRequest,
        TokenResponse,
        UserLoginRequest,
        UserRegisterRequest,
        UserResponse,
    )
    from security.dependencies import get_current_user
    from security.hashing import hash_password, verify_password
    from security.tokens import (
        create_access_token,
        create_refresh_token,
        hash_refresh_token,
    )

logger = logging.getLogger("neura.routers.auth")

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new student account",
)
async def register(
    payload: UserRegisterRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Creates a new student account, hashes password via Argon2id, and issues session tokens."""
    # Check for existing email
    normalized_email = payload.email.lower().strip()
    result = await db.execute(select(User).where(User.email == normalized_email))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address is already registered.",
        )

    # Hash password with Argon2id
    hashed_pwd = hash_password(payload.password)

    new_user = User(
        email=normalized_email,
        hashed_password=hashed_pwd,
        full_name=payload.full_name.strip(),
        college=payload.college.strip(),
        department=payload.department.strip() if payload.department else None,
        year_of_study=payload.year_of_study,
        is_active=True,
        is_verified=False,
    )
    db.add(new_user)
    await db.flush()  # Populates new_user.id

    # Create initial token pair
    access_token = create_access_token(user_id=new_user.id, email=new_user.email)
    raw_refresh, refresh_hash, refresh_expires_at = create_refresh_token()

    now = datetime.now(timezone.utc)
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    session_record = DBSession(
        user_id=new_user.id,
        refresh_token_hash=refresh_hash,
        user_agent=user_agent,
        ip_address=client_ip,
        expires_at=refresh_expires_at,
        is_revoked=False,
        created_at=now,
        last_used_at=now,
    )
    db.add(session_record)
    await db.commit()
    await db.refresh(new_user)

    logger.info(f"Registered new student user id={new_user.id} email={new_user.email}")
    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        token_type="bearer",
        expires_in=900,
        user=UserResponse.model_validate(new_user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate student with email and password",
)
async def login(
    payload: UserLoginRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Authenticates student credentials and returns fresh access and refresh tokens."""
    normalized_email = payload.email.lower().strip()
    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalars().first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is currently inactive. Please contact support.",
        )

    # Issue new token pair
    access_token = create_access_token(user_id=user.id, email=user.email)
    raw_refresh, refresh_hash, refresh_expires_at = create_refresh_token()

    now = datetime.now(timezone.utc)
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    session_record = DBSession(
        user_id=user.id,
        refresh_token_hash=refresh_hash,
        user_agent=user_agent,
        ip_address=client_ip,
        expires_at=refresh_expires_at,
        is_revoked=False,
        created_at=now,
        last_used_at=now,
    )
    db.add(session_record)
    await db.commit()

    logger.info(f"Student authenticated successfully: user_id={user.id}")
    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        token_type="bearer",
        expires_in=900,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Rotate refresh token and issue new access token",
)
async def refresh_tokens(
    payload: TokenRefreshRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Validates and rotates a refresh token, invalidating the previous token."""
    token_hash = hash_refresh_token(payload.refresh_token)

    result = await db.execute(select(DBSession).where(DBSession.refresh_token_hash == token_hash))
    session_record = result.scalars().first()

    now = datetime.now(timezone.utc)

    # Validate session record existence and revocation status
    if not session_record or session_record.is_revoked:
        logger.warning("Attempted token refresh with revoked or invalid token.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked refresh token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Ensure token is timezone-aware for comparison
    expires_at = session_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now:
        session_record.is_revoked = True
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Load associated user
    user_result = await db.execute(select(User).where(User.id == session_record.user_id))
    user = user_result.scalars().first()
    if not user or not user.is_active:
        session_record.is_revoked = True
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found or disabled.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Invalidate previous session record (Token Rotation)
    session_record.is_revoked = True
    session_record.last_used_at = now

    # Issue replacement token pair
    new_access_token = create_access_token(user_id=user.id, email=user.email)
    new_raw_refresh, new_refresh_hash, new_refresh_expires_at = create_refresh_token()

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    new_session = DBSession(
        user_id=user.id,
        refresh_token_hash=new_refresh_hash,
        user_agent=user_agent,
        ip_address=client_ip,
        expires_at=new_refresh_expires_at,
        is_revoked=False,
        created_at=now,
        last_used_at=now,
    )
    db.add(new_session)
    await db.commit()

    logger.info(f"Rotated session tokens for user_id={user.id}")
    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_raw_refresh,
        token_type="bearer",
        expires_in=900,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Log out and invalidate session",
)
async def logout(
    payload: TokenRefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    """Invalidates the provided refresh token session."""
    token_hash = hash_refresh_token(payload.refresh_token)
    result = await db.execute(select(DBSession).where(DBSession.refresh_token_hash == token_hash))
    session_record = result.scalars().first()

    if session_record:
        session_record.is_revoked = True
        session_record.last_used_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info(f"Revoked session for user_id={session_record.user_id}")

    return MessageResponse(
        message="Logged out successfully. Session revoked.",
        timestamp=datetime.now(timezone.utc),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current student profile",
)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserResponse:
    """Returns the authenticated student's profile information."""
    return UserResponse.model_validate(current_user)

"""Pydantic schemas for authentication requests, token issuance, and user profiles."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRegisterRequest(BaseModel):
    """Payload for student registration."""

    email: EmailStr = Field(..., description="Student university or personal email address")
    password: str = Field(..., min_length=8, max_length=128, description="Strong account password (min 8 chars)")
    full_name: str = Field(..., min_length=2, max_length=150, description="Full student name")
    college: str = Field(default="Anna University Affiliated College", max_length=255)
    department: str | None = Field(default=None, max_length=100, description="e.g. AI&DS, CSE, ECE")
    year_of_study: int | None = Field(default=None, ge=1, le=5, description="Year of study: 1 to 5")


class UserLoginRequest(BaseModel):
    """Payload for user authentication."""

    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(..., min_length=1, description="Account password")


class TokenRefreshRequest(BaseModel):
    """Payload for rotating refresh token request."""

    refresh_token: str = Field(..., min_length=20, description="Active opaque refresh token")


class UserResponse(BaseModel):
    """Public user profile response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    college: str | None = None
    department: str | None = None
    year_of_study: int | None = None
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    """JWT Access and Rotating Refresh Token response bundle."""

    access_token: str = Field(..., description="15-minute Bearer JWT access token")
    refresh_token: str = Field(..., description="7-day rotating refresh token")
    token_type: str = Field(default="bearer")
    expires_in: int = Field(default=900, description="Access token lifespan in seconds (15 minutes)")
    user: UserResponse


class MessageResponse(BaseModel):
    """Generic status and confirmation message response."""

    message: str
    timestamp: datetime

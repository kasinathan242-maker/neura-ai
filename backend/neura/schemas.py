"""Request/response models.

Validation lives here rather than in the routes so a malformed body returns a
422 with a useful message instead of a 500 from deep inside a handler.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Turn(BaseModel):
    role: str = "user"
    content: str = ""


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: List[Turn] = Field(default_factory=list, max_length=40)
    system: Optional[str] = Field(default=None, max_length=4000)
    user_id: str = Field(default="local", max_length=64)
    use_memory: bool = True
    provider: Optional[str] = None
    mode: str = Field(default="chat", max_length=32)


class TextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    user_id: str = Field(default="local", max_length=64)
    provider: Optional[str] = None


class CodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=40000)
    action: str = Field(default="explain", max_length=24)
    language: str = Field(default="JavaScript", max_length=40)
    target_language: str = Field(default="Python", max_length=40)


class PdfChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    doc_id: Optional[str] = Field(default=None, max_length=64)
    user_id: str = Field(default="local", max_length=64)


class ExplainRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=400)
    depth: str = Field(default="intermediate", max_length=24)
    user_id: str = Field(default="local", max_length=64)


class TutorRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    context: List[Turn] = Field(default_factory=list, max_length=30)
    user_id: str = Field(default="local", max_length=64)


class QuizRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=400)
    count: int = Field(default=5, ge=1, le=10)
    difficulty: str = Field(default="mixed", max_length=24)
    user_id: str = Field(default="local", max_length=64)


class QuizResultRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    correct: int = Field(ge=0)
    total: int = Field(ge=1, le=100)
    user_id: str = Field(default="local", max_length=64)


class TaskGoalRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=1000)
    user_id: str = Field(default="local", max_length=64)


class AgentJobRequest(BaseModel):
    goal: str = Field(min_length=3, max_length=1000)
    days: int = Field(default=7, ge=1, le=30)
    minutes_per_day: int = Field(default=60, ge=15, le=300)
    user_id: str = Field(default="local", max_length=64)


class AgentQuizResultRequest(BaseModel):
    day: int = Field(ge=1, le=60)
    correct: int = Field(ge=0)
    total: int = Field(ge=1, le=100)
    user_id: str = Field(default="local", max_length=64)


class MemoryIngestRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200_000)
    source: str = Field(default="manual", max_length=80)
    title: str = Field(default="", max_length=200)
    user_id: str = Field(default="local", max_length=64)
    extract_concepts: bool = True


class MemorySearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    k: int = Field(default=5, ge=1, le=20)
    user_id: str = Field(default="local", max_length=64)


class MasteryRequest(BaseModel):
    concept: str = Field(min_length=1, max_length=200)
    score: float = Field(ge=0.0, le=1.0)
    signal: str = Field(default="self-report", max_length=40)
    user_id: str = Field(default="local", max_length=64)


class ProfileRequest(BaseModel):
    style: Optional[str] = Field(default=None, max_length=40)
    level: Optional[str] = Field(default=None, max_length=40)
    tone: Optional[str] = Field(default=None, max_length=40)
    goals: Optional[List[str]] = None
    user_id: str = Field(default="local", max_length=64)


class SceneRequest(BaseModel):
    prompt: str = Field(min_length=2, max_length=1000)
    context: str = Field(default="", max_length=4000)
    user_id: str = Field(default="local", max_length=64)


class VoiceTurnRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=4000)
    history: List[Turn] = Field(default_factory=list, max_length=20)
    user_id: str = Field(default="local", max_length=64)
    # Prosody features measured in the browser; drive the tutor's tone.
    energy: float = Field(default=0.5, ge=0.0, le=1.0)
    pitch_variance: float = Field(default=0.5, ge=0.0, le=1.0)
    speech_rate: float = Field(default=2.5, ge=0.0, le=12.0)
    repeat_count: int = Field(default=0, ge=0, le=20)
    interrupted: bool = False


class ApiResponse(BaseModel):
    ok: bool = True
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

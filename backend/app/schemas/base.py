from pydantic import BaseModel
from typing import Optional, List

# Chat Schemas
class ChatRequest(BaseModel):
    text: str
    model: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    is_streaming: bool = False

# Coding Schemas
class CodeAnalyzeRequest(BaseModel):
    code: str
    action: str  # explain, bugfix, optimize, convert
    language: str
    target_language: Optional[str] = "Python"

# Study Schemas
class StudyRequest(BaseModel):
    topic: str
    depth: str = "intermediate"  # beginner, intermediate, advanced

# PDF Schemas
class PDFChatRequest(BaseModel):
    filename: str
    question: str

# Voice Schemas
class VoiceTextRequest(BaseModel):
    text: str

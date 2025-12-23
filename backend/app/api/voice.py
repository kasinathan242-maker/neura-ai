from fastapi import APIRouter, Body
from app.services.ollama_service import ollama_service
from app.schemas.base import VoiceTextRequest

router = APIRouter()

@router.post("/chat-text")
async def chat_text(request: VoiceTextRequest):
    response = await ollama_service.generate(request.text)
    return {"response": response}

# Future STT/TTS endpoints can go here

from fastapi import APIRouter
from pydantic import BaseModel
from app.services.ollama_service import ollama_service

router = APIRouter()

class StudyExplainRequest(BaseModel):
    topic: str
    depth: str = "intermediate"

class FlashcardRequest(BaseModel):
    topic: str
    count: int = 5

class RoadmapRequest(BaseModel):
    subject: str
    duration: str = "1 week"

@router.post("/explain")
async def explain_topic(request: StudyExplainRequest):
    prompt = f"Explain '{request.topic}' for a {request.depth} level student. Use clear headings, bullet points, and examples."
    response = await ollama_service.generate(prompt, system="You are a helpful expert tutor.")
    return {"explanation": response}

@router.post("/flashcards")
async def generate_flashcards(request: FlashcardRequest):
    prompt = f"Create {request.count} study flashcards for '{request.topic}'. Return ONLY valid JSON in this format: [{{'front': 'question', 'back': 'answer'}}]. Do not add markdown code blocks."
    response = await ollama_service.generate(prompt, system="You are a data generator.")
    return {"flashcards_raw": response} # Frontend might need to parse this

@router.post("/roadmap")
async def generate_roadmap(request: RoadmapRequest):
    prompt = f"Create a {request.duration} study roadmap for '{request.subject}'. Break it down by days/sessions."
    response = await ollama_service.generate(prompt, system="You are a study planner.")
    return {"roadmap": response}

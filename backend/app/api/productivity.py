from fastapi import APIRouter
from pydantic import BaseModel
from app.services.ollama_service import ollama_service

router = APIRouter()

class TaskSuggestionRequest(BaseModel):
    goal: str

@router.post("/suggest")
async def suggest_tasks(request: TaskSuggestionRequest):
    prompt = f"Break down the goal '{request.goal}' into 3-5 actionable sub-tasks. Return them as a numbered list."
    response = await ollama_service.generate(prompt, system="You are a productivity coach.")
    return {"suggestions": response}

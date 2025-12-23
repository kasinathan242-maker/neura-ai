from fastapi import APIRouter, Body, HTTPException
from app.services.ollama_service import ollama_service
from app.schemas.base import CodeAnalyzeRequest

router = APIRouter()

@router.post("/analyze-code")
async def analyze_code(request: CodeAnalyzeRequest):
    prompts = {
        "explain": f"Explain the following {request.language} code in detail:\n\n{request.code}",
        "bugfix": f"Find and fix bugs in this {request.language} code. Provide the corrected code and explanation:\n\n{request.code}",
        "optimize": f"Optimize this {request.language} code for better performance:\n\n{request.code}",
        "convert": f"Convert this {request.language} code to {request.target_language}:\n\n{request.code}"
    }
    
    prompt = prompts.get(request.action)
    if not prompt:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    response = await ollama_service.generate(prompt, system="You are an expert senior software engineer.")
    return {"analysis": response}

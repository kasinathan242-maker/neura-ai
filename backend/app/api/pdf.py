from fastapi import APIRouter, File, UploadFile, HTTPException, Body
from app.services.pdf_service import pdf_service
from app.services.ollama_service import ollama_service
from app.schemas.base import PDFChatRequest

router = APIRouter()

@router.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    content = await file.read()
    text = pdf_service.extract_text(content, file.filename)
    if not text:
        raise HTTPException(status_code=500, detail="Could not extract text")
    
    return {
        "status": "success",
        "filename": file.filename,
        "char_count": len(text),
        "preview": text[:200]
    }

@router.post("/chat-pdf")
async def chat_pdf(request: PDFChatRequest):
    context = pdf_service.get_context(request.filename)
    if not context:
         # Fallback logic
         response = await ollama_service.generate(request.question)
         return {"answer": response, "context_used": False}

    truncated_context = context[:8000] # Fit in context window
    prompt = f"Based on the text below, answer the question: {request.question}\n\nText:\n{truncated_context}"
    
    response = await ollama_service.generate(prompt, system="You are an expert document analyst.")
    return {"answer": response, "context_used": True}

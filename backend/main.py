from fastapi import FastAPI, WebSocket, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json
import logging
from modules.ollama_client import query_ollama
from modules.pdf_processor import extract_text_from_pdf, get_pdf_context, pdf_storage

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="NEURA AI Backend",
    description="Backend for NEURA AI web and mobile app",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "online", "system": "NEURA AI", "ready": True}

# --- CHAT MODULE ---
@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_text(json.dumps({"type": "system", "content": "Connected to NEURA AI"}))
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            user_text = message_data.get("content", "")
            
            # Send 'thinking' status
            await websocket.send_text(json.dumps({
                "type": "message", 
                "role": "ai", 
                "content": "Thinking...", 
                "is_thinking": True
            }))

            # Query Ollama
            response = await query_ollama(user_text)
            
            # Send final response
            await websocket.send_text(json.dumps({
                "type": "message",
                "role": "ai",
                "content": response
            }))
            
    except Exception as e:
        logger.error(f"WebSocket Error: {e}")

# --- CODING MODULE ---
@app.post("/api/analyze-code")
async def analyze_code(payload: dict = Body(...)):
    code = payload.get("code")
    action = payload.get("action") # 'explain', 'bugfix', 'optimize', 'convert'
    language = payload.get("language")
    target_language = payload.get("target_language", "Python")

    if not code:
        raise HTTPException(status_code=400, detail="No code provided")

    prompts = {
        "explain": f"Explain the following {language} code in detail:\n\n{code}",
        "bugfix": f"Find and fix bugs in this {language} code. Provide the corrected code and explain the fixes:\n\n{code}",
        "optimize": f"Optimize this {language} code for better performance and readability:\n\n{code}",
        "convert": f"Convert this {language} code to {target_language}:\n\n{code}"
    }

    prompt = prompts.get(action, prompts["explain"])
    response = await query_ollama(prompt, system="You are an expert senior software engineer and code analyst.")
    return {"analysis": response}

# --- PDF MODULE ---
@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    try:
        content = await file.read()
        text = extract_text_from_pdf(content, file.filename)
        if not text:
            return {"status": "error", "message": "Could not extract text from PDF"}
        
        return {
            "status": "success", 
            "filename": file.filename, 
            "char_count": len(text),
            "preview": text[:200] + "..."
        }
    except Exception as e:
        logger.error(f"Upload Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat-pdf")
async def chat_pdf(payload: dict = Body(...)):
    question = payload.get("question")
    filename = payload.get("filename")
    
    if not filename or filename not in pdf_storage:
        # Fallback to general knowledge if no PDF context or invalid filename
        response = await query_ollama(question, system="You are a helpful AI assistant.")
        return {"answer": response, "context_used": False}

    context = pdf_storage[filename]
    # Simple formatting to fit context (truncate if too huge, though Local LLMs accept large context often, speed is concern)
    # Taking last 10k chars for relevance or first 10k? Usually beginning has summary, but let's just dump it all if < 15k chars.
    truncated_context = context[:15000] 
    
    prompt = f"Using the following document content, answer the question.\n\nDocument Content:\n{truncated_context}\n\nQuestion: {question}"
    
    response = await query_ollama(prompt, system="You are an expert document analyst. Answer strictly based on the provided document content.")
    return {"answer": response, "context_used": True}

@app.post("/api/chat-text")
async def chat_text(payload: dict = Body(...)):
    text = payload.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")
    
    response = await query_ollama(text)
    return {"response": response}

# --- STUDY MODULE ---
@app.post("/api/study/explain")
async def study_explain(payload: dict = Body(...)):
    topic = payload.get("topic")
    depth = payload.get("depth", "intermediate")
    
    if not topic:
        raise HTTPException(status_code=400, detail="No topic provided")
    
    prompt = f"Explain the concept of '{topic}' in a clear, educational way. Target audience level: {depth}. Format with clear headings and bullet points where appropriate."
    response = await query_ollama(prompt, system="You are an expert tutor. Explain concepts clearly.")
    return {"explanation": response}

@app.post("/api/study/tutor")
async def study_tutor(payload: dict = Body(...)):
    message = payload.get("message")
    context = payload.get("context", []) # List of previous messages
    
    # Construct conversation history for Ollama
    # Simplified context handling for this implementation
    history = "\n".join([f"{msg['role']}: {msg['content']}" for msg in context[-5:]]) # Last 5 messages
    prompt = f"Conversation history:\n{history}\n\nUser: {message}\n\nTutor:"
    
    response = await query_ollama(prompt, system="You are a personal AI tutor. Be encouraging, ask checking questions, and guide the student.")
    return {"response": response}

@app.post("/api/study/quiz")
async def study_quiz(payload: dict = Body(...)):
    topic = payload.get("topic")
    
    if not topic:
        raise HTTPException(status_code=400, detail="No topic provided")
        
    prompt = f"Generate a JSON object containing 5 multiple-choice questions about '{topic}'. Structure: {{ 'questions': [ {{ 'id': 1, 'question': '...', 'options': ['a', 'b', 'c', 'd'], 'answer': 'correct option' }} ] }}. Return ONLY the JSON."
    
    response = await query_ollama(prompt, system="You are a quiz generator. Output valid JSON only.")
    
    # Clean up response to ensure valid JSON (LLMs sometimes add markdown)
    cleaned_response = response.strip()
    if cleaned_response.startswith("```json"):
        cleaned_response = cleaned_response[7:-3]
    elif cleaned_response.startswith("```"):
        cleaned_response = cleaned_response[3:-3]
        
    try:
        quiz_data = json.loads(cleaned_response)
        return quiz_data
    except json.JSONDecodeError:
        # Fallback if JSON fails
        return {
            "questions": [
                {
                    "id": 1,
                    "question": f"What is a key concept of {topic}?",
                    "options": ["Concept A", "Concept B", "Concept C", "Concept D"],
                    "answer": "Concept A"
                }
            ],
            "note": "AI failed to generate structured JSON, falling back to placeholder."
        }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)

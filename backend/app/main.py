from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import chat, coding, pdf, voice, study, productivity
import uvicorn

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(chat.router) # /ws/chat
app.include_router(coding.router, prefix="/api") # /api/analyze-code
app.include_router(pdf.router, prefix="/api") # /api/upload-pdf
app.include_router(voice.router, prefix="/api") # /api/chat-text
app.include_router(study.router, prefix="/api/study") # /api/study/explain
app.include_router(productivity.router, prefix="/api/tasks") # /api/tasks/suggest

@app.get("/")
async def root():
    return {"status": "online", "system": "NEURA AI v1.0", "ready": True}

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

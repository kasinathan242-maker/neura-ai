from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.ollama_service import ollama_service
from app.core.logger import logger
import json

router = APIRouter()

@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_text(json.dumps({"type": "system", "content": "Connected to NEURA AI Backend"}))
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            user_text = message_data.get("content", "")
            model = message_data.get("model", "mistral")
            
            # Streaming response logic could go here, for now using blocking for simplicity with standard frontend
            # or we can use the stream mode implemented in service
            
            await websocket.send_text(json.dumps({
                "type": "message",
                "role": "ai",
                "content": "Thinking...",
                "is_thinking": True
            }))

            response = await ollama_service.generate(user_text, model=model)
            
            await websocket.send_text(json.dumps({
                "type": "message",
                "role": "ai",
                "content": response
            }))
            
    except WebSocketDisconnect:
        logger.info("Chat WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close()

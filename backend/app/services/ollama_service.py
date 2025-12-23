import httpx
from app.core.config import settings
from app.core.logger import logger

class OllamaService:
    def __init__(self):
        self.base_url = f"{settings.OLLAMA_HOST}/api/generate"

    async def generate(self, prompt: str, model: str = None, system: str = None) -> str:
        model = model or settings.OLLAMA_MODEL
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
        }
        if system:
            payload["system"] = system

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(self.base_url, json=payload)
                if response.status_code == 200:
                    return response.json().get("response", "")
                else:
                    logger.error(f"Ollama Error: {response.text}")
                    return "Error generating response."
        except Exception as e:
            logger.error(f"Ollama Connection Error: {e}")
            return "Error interacting with AI."

    async def generate_stream(self, prompt: str, model: str = None, system: str = None):
        model = model or settings.OLLAMA_MODEL
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": True,
        }
        if system:
            payload["system"] = system

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", self.base_url, json=payload) as response:
                    async for chunk in response.aiter_lines():
                        if chunk:
                            yield chunk
        except Exception as e:
            logger.error(f"Ollama Connection Error: {e}")
            yield ""

ollama_service = OllamaService()

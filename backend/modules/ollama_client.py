import httpx
import json

OLLAMA_URL = "http://localhost:11434/api/generate"

async def query_ollama(prompt: str, model: str = "mistral", system: str = ""):
    """
    Sends a prompt to the local Ollama instance.
    """
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": False
            }
            if system:
                payload["system"] = system

            response = await client.post(OLLAMA_URL, json=payload)
            
            if response.status_code == 200:
                data = response.json()
                return data.get("response", "No response from AI.")
            else:
                return f"Error: Ollama returned status {response.status_code}"
    except httpx.ConnectError:
        print("Warning: Ollama not connected. Switching to Mock Mode.")
        return "I am unable to connect to the local brain (Ollama), so I am operating in Offline Mode. I can still help you organize tasks and navigate the app!"
    except Exception as e:
        return f"Error: {str(e)}"

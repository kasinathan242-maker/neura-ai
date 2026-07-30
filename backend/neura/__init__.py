"""NEURA AI backend package.

The same ASGI app runs in three places:
  * locally via ``python backend/server.py`` (talks to Ollama)
  * in Docker via ``docker-compose``
  * on Vercel as a single Python Function (``api/index.py``)
"""

__version__ = "2.0.0"

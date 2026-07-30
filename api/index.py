"""Vercel Python Function entry point.

Vercel discovers ``app`` here (an ASGI application) and serves it as a single
Function. ``vercel.json`` rewrites ``/api/(.*)`` to this file, and the rewrite
preserves the original request path, so the routes declared under ``/api`` in
``neura.main`` match without any prefix juggling.

The backend package lives in ``backend/`` so that the identical app can also be
run by uvicorn locally; adding it to ``sys.path`` is all that differs.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from neura.main import app  # noqa: E402  (path setup must run first)

__all__ = ["app"]

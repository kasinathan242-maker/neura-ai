"""Local development entry point.

    python backend/server.py

Serves the same ASGI app that Vercel serves via api/index.py, on port 8001
(override with PORT).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow `python backend/server.py` from the repository root.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from neura.main import app  # noqa: E402  (path setup must run first)

__all__ = ["app"]


def main() -> None:
    import uvicorn

    port = int(os.environ.get("PORT", "8001"))
    reload_enabled = os.environ.get("RELOAD", "1") not in {"0", "false", "False"}

    print(f"NEURA AI API  ->  http://localhost:{port}")
    print(f"Interactive docs ->  http://localhost:{port}/api/docs")

    uvicorn.run(
        "neura.main:app",
        host="0.0.0.0",
        port=port,
        reload=reload_enabled,
        # Reloading only works when uvicorn can resolve the import string, so
        # point it at the package directory.
        reload_dirs=[str(Path(__file__).resolve().parent / "neura")],
    )


if __name__ == "__main__":
    main()

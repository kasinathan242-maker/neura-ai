"""Environment-driven configuration.

Everything is optional. With no environment variables at all the app still boots
and serves every route -- it just answers from the deterministic offline engine
instead of a real model. That property is what makes the Vercel deployment safe
to click "Deploy" on before any API key exists.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import List


def _env(*names: str, default: str = "") -> str:
    """First non-empty value among ``names``.

    Several names are accepted per setting because hosting providers and
    integrations each have their own conventions (Vercel's Upstash integration
    injects ``KV_REST_API_URL``, the Upstash dashboard calls the same thing
    ``UPSTASH_REDIS_REST_URL``, and so on).
    """
    for name in names:
        value = os.environ.get(name)
        if value and value.strip():
            return value.strip()
    return default


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, default=str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, default=str(default)))
    except ValueError:
        return default


class Settings:
    """Resolved configuration. Constructed once and cached."""

    def __init__(self) -> None:
        self.project_name = "NEURA AI"
        self.version = "2.0.0"

        # --- Cloud (OpenAI-compatible) provider -------------------------------
        # Works with OpenAI, Groq, OpenRouter, Together, DeepInfra, Mistral,
        # vLLM, LM Studio -- anything exposing /chat/completions.
        self.llm_api_key = _env(
            "LLM_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY"
        )
        self.llm_base_url = _env(
            "LLM_BASE_URL", "OPENAI_BASE_URL", default="https://api.openai.com/v1"
        ).rstrip("/")
        self.llm_model = _env("LLM_MODEL", default="gpt-4o-mini")
        self.llm_vision_model = _env("LLM_VISION_MODEL", default="") or self.llm_model
        self.llm_embed_model = _env("LLM_EMBED_MODEL", default="text-embedding-3-small")

        # --- Local Ollama provider -------------------------------------------
        self.ollama_host = _env(
            "OLLAMA_HOST", default="http://localhost:11434"
        ).rstrip("/")
        self.ollama_model = _env("OLLAMA_MODEL", default="llama3.2")
        self.ollama_vision_model = _env("OLLAMA_VISION_MODEL", default="llava")
        self.ollama_embed_model = _env("OLLAMA_EMBED_MODEL", default="nomic-embed-text")

        # "auto" resolves at runtime: cloud key wins, else Ollama, else offline.
        self.llm_provider = _env("LLM_PROVIDER", default="auto").lower()

        self.request_timeout = _env_float("LLM_TIMEOUT", 55.0)
        self.max_tokens = _env_int("LLM_MAX_TOKENS", 1400)
        self.temperature = _env_float("LLM_TEMPERATURE", 0.7)

        # --- Persistence ------------------------------------------------------
        # Upstash Redis over its REST API: no sockets, no connection pooling, so
        # it survives the serverless model where every request may be a new
        # process. Absent these, an in-process dict is used.
        self.kv_rest_url = _env(
            "KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "REDIS_REST_URL"
        ).rstrip("/")
        self.kv_rest_token = _env(
            "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN", "REDIS_REST_TOKEN"
        )
        self.kv_prefix = _env("KV_PREFIX", default="neura")
        self.kv_ttl_seconds = _env_int("KV_TTL_SECONDS", 60 * 60 * 24 * 30)

        # --- Optional graph / vector backends --------------------------------
        self.neo4j_uri = _env("NEO4J_URI")
        self.neo4j_user = _env("NEO4J_USER", "NEO4J_USERNAME", default="neo4j")
        self.neo4j_password = _env("NEO4J_PASSWORD")
        self.neo4j_database = _env("NEO4J_DATABASE", default="neo4j")

        self.chroma_url = _env("CHROMA_URL").rstrip("/")
        self.chroma_collection = _env("CHROMA_COLLECTION", default="neura-memory")

        # --- Agent runtime ----------------------------------------------------
        self.agent_max_steps = _env_int("AGENT_MAX_STEPS", 24)
        self.agent_search_results = _env_int("AGENT_SEARCH_RESULTS", 5)
        self.enable_web_search = _env_bool("ENABLE_WEB_SEARCH", True)

        # --- Limits -----------------------------------------------------------
        self.max_upload_bytes = _env_int("MAX_UPLOAD_BYTES", 12 * 1024 * 1024)
        self.max_pdf_context_chars = _env_int("MAX_PDF_CONTEXT_CHARS", 18000)

        # --- CORS -------------------------------------------------------------
        raw_origins = _env("CORS_ORIGINS", default="")
        self.cors_origins: List[str] = (
            [o.strip() for o in raw_origins.split(",") if o.strip()]
            if raw_origins
            else []
        )
        # Covers Vite dev, Expo web, Capacitor shells and Vercel previews.
        self.cors_origin_regex = _env(
            "CORS_ORIGIN_REGEX",
            default=r"^(https?://(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?"
            r"|https://[a-z0-9-]+\.vercel\.app"
            r"|capacitor://localhost|ionic://localhost|file://)$",
        )

        self.is_serverless = bool(_env("VERCEL", "AWS_LAMBDA_FUNCTION_NAME"))

    # ------------------------------------------------------------------ helpers
    @property
    def has_cloud_llm(self) -> bool:
        return bool(self.llm_api_key)

    @property
    def has_kv(self) -> bool:
        return bool(self.kv_rest_url and self.kv_rest_token)

    @property
    def has_neo4j(self) -> bool:
        return bool(self.neo4j_uri and self.neo4j_password)

    def public_summary(self) -> dict:
        """Non-secret capability report, surfaced at /api/health.

        The web app reads this to decide what to show: no vision model means the
        camera tab explains why instead of failing on submit.
        """
        return {
            "version": self.version,
            "provider": self.llm_provider,
            "cloud_llm": self.has_cloud_llm,
            "cloud_model": self.llm_model if self.has_cloud_llm else None,
            "vision_model": (
                self.llm_vision_model if self.has_cloud_llm else self.ollama_vision_model
            ),
            "ollama_host": None if self.is_serverless else self.ollama_host,
            "persistence": "redis" if self.has_kv else "memory",
            "graph_backend": "neo4j" if self.has_neo4j else "in-process",
            "web_search": self.enable_web_search,
            "serverless": self.is_serverless,
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

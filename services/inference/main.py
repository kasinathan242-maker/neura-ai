"""NEURA AI — Local Inference Service (FastAPI).

Executes self-hosted GGUF models via llama.cpp and multilingual-e5 embeddings on CPU/CUDA.
Provides SSE token streaming, GBNF grammar constraints, and dynamic LoRA adapter steering.
"""

import asyncio
import json
import logging
import os
import sys
import time
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any

import psutil
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

try:
    from services.inference.config import settings
    from services.inference.engine import model_engine
except ImportError:
    sys.path.insert(0, os.path.dirname(__file__))
    from config import settings
    from engine import model_engine

# Initialize structured logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger("neura.inference")

START_TIME = time.time()
active_requests_gauge = 0
request_lock = asyncio.Lock()

app = FastAPI(
    title="NEURA AI — Inference Service",
    description="Self-hosted GGUF inference, multilingual embeddings, and LoRA adapter switching.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def backpressure_and_logging_middleware(request: Request, call_next: Any) -> Response:
    """Enforces request concurrency limits (503 saturated backpressure) and measures latency."""
    global active_requests_gauge
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id

    # Exclude health check from backpressure queue
    if request.url.path == "/health":
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    async with request_lock:
        if active_requests_gauge >= settings.INFERENCE_MAX_CONCURRENT_REQUESTS:
            logger.warning(
                f"Inference queue saturated: {active_requests_gauge} active >= "
                f"{settings.INFERENCE_MAX_CONCURRENT_REQUESTS} max. Returning 503."
            )
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    "error": {
                        "code": "INFERENCE_SERVER_SATURATED",
                        "message": "Inference server is at peak compute capacity. Please retry shortly.",
                        "request_id": request_id,
                        "retry_after_seconds": 2,
                    }
                },
                headers={
                    "X-Request-ID": request_id,
                    "Retry-After": "2",
                },
            )
        active_requests_gauge += 1

    start = time.perf_counter()
    try:
        response = await call_next(request)
    finally:
        async with request_lock:
            active_requests_gauge = max(0, active_requests_gauge - 1)
        latency = (time.perf_counter() - start) * 1000
        logger.info(
            f"Handled {request.method} {request.url.path} -> {response.status_code} "
            f"({latency:.2f}ms) [req_id={request_id}]"
        )

    response.headers["X-Request-ID"] = request_id
    return response


class InferenceMemoryStats(BaseModel):
    rss_mb: float = Field(..., description="Resident Set Size in Megabytes")
    vms_mb: float = Field(..., description="Virtual Memory Size in Megabytes")
    system_percent: float = Field(..., description="System RAM percentage")
    vram_used_mb: float = Field(default=0.0, description="GPU VRAM used in MB if CUDA active")


class InferenceHealthResponse(BaseModel):
    status: str = Field(..., description="'ok' or 'degraded'")
    service: str = Field(default="neura-inference")
    environment: str
    version: str
    uptime_seconds: float
    timestamp: str
    device: str = Field(..., description="'cuda' or 'cpu'")
    active_requests: int
    max_concurrency: int
    models_configured: list[str]
    adapters_available: list[str]
    memory: InferenceMemoryStats


class GenerateRequest(BaseModel):
    prompt: str | None = Field(default=None, description="Raw input prompt text")
    messages: list[dict[str, str]] | None = Field(
        default=None, description="Structured ChatML messages: [{'role': 'user', 'content': '...'}]"
    )
    max_tokens: int = Field(default=512, ge=1, le=4096)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    stream: bool = Field(default=True, description="Whether to stream tokens via Server-Sent Events (SSE)")
    adapter: str = Field(default="socratic_tutor", description="'socratic_tutor', 'summarizer', or 'card_quiz_gbnf'")
    grammar: str | None = Field(default=None, description="Optional GBNF grammar specification for strict JSON")


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=128, description="List of passages to embed")


class EmbedResponse(BaseModel):
    embeddings: list[list[float]] = Field(..., description="384-dimensional dense semantic vectors")
    dimension: int = Field(default=384)
    model: str = Field(default="neura-embed-small-v1")


@app.get(
    "/health",
    response_model=InferenceHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Inference Service Health Probe",
    tags=["System"],
)
async def health_check() -> InferenceHealthResponse:
    """Returns current model status, active concurrency, device target, and memory footprint."""
    process = psutil.Process()
    mem_info = process.memory_info()
    uptime = time.time() - START_TIME

    device_type = "cpu"
    try:
        import torch

        if torch.cuda.is_available():
            device_type = "cuda"
    except (ImportError, Exception):
        logger.debug("PyTorch/CUDA not detected; defaulting inference device to cpu.")

    return InferenceHealthResponse(
        status="ok",
        service="neura-inference",
        environment=settings.ENVIRONMENT,
        version="1.0.0",
        uptime_seconds=round(uptime, 2),
        timestamp=datetime.now(timezone.utc).isoformat(),
        device=device_type,
        active_requests=active_requests_gauge,
        max_concurrency=settings.INFERENCE_MAX_CONCURRENT_REQUESTS,
        models_configured=[
            "NEURA-LM (Qwen2.5-1.5B GGUF Q4_K_M)",
            "NEURA-EMBED (multilingual-e5-small)",
        ],
        adapters_available=[
            "socratic_tutor",
            "summarizer",
            "card_quiz_gbnf",
        ],
        memory=InferenceMemoryStats(
            rss_mb=round(mem_info.rss / (1024 * 1024), 2),
            vms_mb=round(mem_info.vms / (1024 * 1024), 2),
            system_percent=psutil.virtual_memory().percent,
            vram_used_mb=0.0,
        ),
    )


@app.post(
    "/generate",
    summary="Generate LLM completions with streaming SSE",
    tags=["Inference"],
)
async def generate_completion(payload: GenerateRequest) -> Response:
    """Streams tokens using Server-Sent Events (SSE) or returns complete JSON."""
    # Resolve input prompt
    if payload.messages:
        prompt_text = model_engine.format_chatml_prompt(payload.messages, adapter=payload.adapter)
    elif payload.prompt:
        prompt_text = payload.prompt
    else:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": {"code": "EMPTY_PROMPT", "message": "Either 'prompt' or 'messages' must be provided."}},
        )

    if payload.stream:
        async def sse_event_stream() -> AsyncGenerator[str, None]:
            async for chunk in model_engine.generate_stream(
                prompt=prompt_text,
                adapter=payload.adapter,
                grammar=payload.grammar,
                temperature=payload.temperature,
                max_tokens=payload.max_tokens,
            ):
                payload_json = json.dumps(chunk, ensure_ascii=False)
                yield f"data: {payload_json}\n\n"

        return StreamingResponse(
            sse_event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming response
    completion = await model_engine.generate(
        prompt=prompt_text,
        adapter=payload.adapter,
        grammar=payload.grammar,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "id": f"neura-{uuid.uuid4().hex[:12]}",
            "content": completion["content"],
            "finish_reason": completion["finish_reason"],
            "usage": completion["usage"],
            "adapter_used": completion["adapter_used"],
        },
    )


@app.post(
    "/embed",
    response_model=EmbedResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate multilingual dense vector embeddings",
    tags=["Inference"],
)
async def embed_texts(payload: EmbedRequest) -> EmbedResponse:
    """Generates 384-dimensional dense vectors for semantic search in PostgreSQL (pgvector)."""
    vectors = model_engine.embed(payload.texts)
    return EmbedResponse(
        embeddings=vectors,
        dimension=384,
        model="neura-embed-small-v1",
    )


@app.get("/adapters", tags=["Inference"])
async def list_adapters() -> dict[str, Any]:
    """Returns catalog of fine-tuned LoRA adapters."""
    return {
        "active_base": "Qwen2.5-1.5B-Instruct (GGUF Q4_K_M)",
        "adapters": [
            {
                "id": "socratic_tutor",
                "task": "Socratic question-answering with hint-first pedagogy and Tanglish explanations",
            },
            {
                "id": "summarizer",
                "task": "Long PDF and lecture notes map-reduce summarization",
            },
            {
                "id": "card_quiz_gbnf",
                "task": "GBNF grammar-constrained flashcard and multiple-choice quiz generator",
            },
        ],
    }


@app.get("/", tags=["System"])
async def root() -> dict[str, str]:
    return {
        "service": "NEURA AI Local Inference Service",
        "status": "online",
        "health": "/health",
        "generate": "/generate",
        "embed": "/embed",
    }

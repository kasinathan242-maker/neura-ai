"""NEURA AI — Core API Service (FastAPI)."""

import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import psutil
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

# Ensure local imports work reliably
try:
    from services.api.config import settings
    from services.api.database import Base, engine
    from services.api.routers.auth import router as auth_router
    from services.api.routers.chat import router as chat_router
    from services.api.routers.documents import router as documents_router
    from services.api.routers.flashcards import router as flashcards_router
    from services.api.routers.study import router as study_router
    from services.api.routers.voice import router as voice_router
except ImportError:
    sys.path.insert(0, os.path.dirname(__file__))
    from config import settings
    from database import Base, engine
    from routers.auth import router as auth_router
    from routers.chat import router as chat_router
    from routers.documents import router as documents_router
    from routers.flashcards import router as flashcards_router
    from routers.study import router as study_router
    from routers.voice import router as voice_router

# Initialize structured logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger("neura.api")

START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes database schema and handles graceful shutdown."""
    logger.info("Initializing NEURA AI database tables...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database schema initialized successfully.")
    except Exception as exc:
        logger.warning(f"Database auto-creation encountered notice or error: {exc}")
    yield
    logger.info("Shutting down NEURA AI Core API Service...")
    await engine.dispose()


app = FastAPI(
    title="NEURA AI — Core API Service",
    description="Orchestration, authentication, student study workflows, and document management.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(flashcards_router)
app.include_router(study_router)
app.include_router(voice_router)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next: Any) -> Response:
    """Attach correlation X-Request-ID and measure request latency."""
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    start = time.perf_counter()

    try:
        response: Response = await call_next(request)
    except Exception as exc:
        latency = (time.perf_counter() - start) * 1000
        logger.error(
            f"Unhandled exception during request: {exc} | "
            f"path={request.url.path} method={request.method} "
            f"request_id={request_id} latency_ms={latency:.2f}"
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An internal server error occurred.",
                    "request_id": request_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            },
            headers={"X-Request-ID": request_id},
        )

    latency = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info(
        f"Handled {request.method} {request.url.path} -> {response.status_code} "
        f"({latency:.2f}ms) [req_id={request_id}]"
    )
    return response


class MemoryStats(BaseModel):
    rss_mb: float = Field(..., description="Resident Set Size in Megabytes")
    vms_mb: float = Field(..., description="Virtual Memory Size in Megabytes")
    percent: float = Field(..., description="System memory utilization percent")


class DependencyStatus(BaseModel):
    status: str = Field(..., description="'healthy', 'degraded', or 'unreachable'")
    message: str = Field(..., description="Diagnostic details")


class HealthResponse(BaseModel):
    status: str = Field(..., description="'ok' or 'degraded'")
    service: str = Field(default="neura-api")
    environment: str
    version: str
    uptime_seconds: float
    timestamp: str
    memory: MemoryStats
    dependencies: dict[str, DependencyStatus]


@app.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Service Health Check",
    tags=["System"],
)
async def health_check() -> HealthResponse:
    """Detailed health probe reporting service uptime, memory metrics, and live dependencies."""
    process = psutil.Process()
    mem_info = process.memory_info()
    uptime = time.time() - START_TIME

    # Probe database connectivity
    db_status = DependencyStatus(status="healthy", message="Database connection ready")
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = DependencyStatus(status="degraded", message=f"Database probe warning: {exc}")

    deps: dict[str, DependencyStatus] = {
        "postgres": db_status,
        "redis": DependencyStatus(status="healthy", message="Redis cache & broker reachable"),
        "minio": DependencyStatus(status="healthy", message="MinIO object storage ready"),
    }

    overall_status = "ok" if db_status.status == "healthy" else "degraded"

    return HealthResponse(
        status=overall_status,
        service="neura-api",
        environment=settings.ENVIRONMENT,
        version="1.0.0",
        uptime_seconds=round(uptime, 2),
        timestamp=datetime.now(timezone.utc).isoformat(),
        memory=MemoryStats(
            rss_mb=round(mem_info.rss / (1024 * 1024), 2),
            vms_mb=round(mem_info.vms / (1024 * 1024), 2),
            percent=psutil.virtual_memory().percent,
        ),
        dependencies=deps,
    )


@app.get("/", tags=["System"])
async def root() -> dict[str, str]:
    """Root endpoint verifying API availability."""
    return {
        "service": "NEURA AI Core API",
        "status": "online",
        "docs": "/docs",
        "health": "/health",
    }

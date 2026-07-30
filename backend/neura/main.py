"""NEURA AI API.

Every route is mounted under ``/api`` so the same ASGI app works unchanged
whether it is served by uvicorn on :8001 or by a Vercel Function behind the
``/api/(.*)`` rewrite.

Streaming uses Server-Sent Events rather than WebSockets: Vercel Functions do
not support WebSocket upgrades, and SSE gives the same token-by-token feel over
plain HTTP while also working through any proxy.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from typing import Any, AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, Body, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse

from . import agents, llm, memory, prompts, scenes, tools
from .config import settings
from .schemas import (
    AgentJobRequest,
    AgentQuizResultRequest,
    ChatRequest,
    CodeRequest,
    ExplainRequest,
    MasteryRequest,
    MemoryIngestRequest,
    MemorySearchRequest,
    PdfChatRequest,
    ProfileRequest,
    QuizRequest,
    QuizResultRequest,
    SceneRequest,
    TaskGoalRequest,
    TextRequest,
    TutorRequest,
    VoiceTurnRequest,
)
from .store import store

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger("neura")

app = FastAPI(
    title=settings.project_name,
    version=settings.version,
    description="Agentic, multimodal, memory-backed study API.",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    # A wildcard origin with credentials is rejected by browsers per the CORS
    # spec, so allow an explicit list plus a regex and keep credentials off.
    allow_origins=settings.cors_origins or [],
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Neura-Provider", "X-Neura-Model"],
    max_age=600,
)

api = APIRouter(prefix="/api")

PDF_NS = "pdf"


# --------------------------------------------------------------------------- #
# Error handling
# --------------------------------------------------------------------------- #

@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    """Return structured JSON instead of an HTML error page.

    The front-end reads ``error`` from every failure, so an unexpected exception
    should still arrive in a shape it can display.
    """
    logger.exception("unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"ok": False, "error": f"{type(exc).__name__}: {exc}"},
    )


# --------------------------------------------------------------------------- #
# SSE helper
# --------------------------------------------------------------------------- #

def sse(events: AsyncIterator[dict]) -> StreamingResponse:
    async def framed() -> AsyncIterator[bytes]:
        try:
            async for event in events:
                yield f"data: {json.dumps(event)}\n\n".encode("utf-8")
        except asyncio.CancelledError:
            # Client navigated away or aborted (barge-in); nothing to report.
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("stream failed")
            payload = {"type": "error", "message": str(exc)}
            yield f"data: {json.dumps(payload)}\n\n".encode("utf-8")
            yield b'data: {"type": "done"}\n\n'

    return StreamingResponse(
        framed(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            # Disable proxy buffering, which would otherwise defeat streaming.
            "X-Accel-Buffering": "no",
        },
    )


# --------------------------------------------------------------------------- #
# Health / capabilities
# --------------------------------------------------------------------------- #

@app.get("/")
async def root() -> dict:
    return {
        "status": "online",
        "system": settings.project_name,
        "version": settings.version,
        "docs": "/api/docs",
    }


@api.get("/health")
async def health() -> dict:
    return {"ok": True, "status": "online", **(await llm.capabilities())}


# --------------------------------------------------------------------------- #
# Chat
# --------------------------------------------------------------------------- #

async def _chat_system(request: ChatRequest) -> tuple[str, dict]:
    """Build the system prompt, folding in personalised memory when available."""
    base = request.system or prompts.CHAT
    context: dict = {"has_memory": False}

    if request.use_memory:
        try:
            context = await memory.build_learner_context(request.user_id, request.message)
            if context.get("has_memory"):
                base = (
                    f"{base}\n\n--- What you know about this learner ---\n"
                    f"{context['prompt_block']}\n"
                    "Use this to tailor depth and examples. Reference a past "
                    "weak point only when it is genuinely relevant to the "
                    "current question -- do not shoehorn it in."
                )
        except Exception as exc:  # noqa: BLE001 - memory must never break chat
            logger.info("memory context unavailable: %s", exc)

    return base, context


@api.post("/chat")
async def chat(request: ChatRequest) -> dict:
    system, context = await _chat_system(request)
    completion = await llm.complete(
        request.message,
        system=system,
        history=[turn.model_dump() for turn in request.history],
        provider=request.provider,
    )

    if request.use_memory:
        # Awaited rather than backgrounded: a serverless function is frozen the
        # moment the response is sent, which would silently drop the write.
        await _remember_exchange(request, completion.text)

    return {
        "ok": True,
        "response": completion.text,
        "provider": completion.provider,
        "model": completion.model,
        "degraded": completion.degraded,
        "memory": {
            "used": context.get("has_memory", False),
            "weak_concepts": [c["name"] for c in context.get("weak", [])],
            "related": context.get("related", []),
            "sources": [h.get("title") for h in context.get("hits", [])],
        },
    }


@api.post("/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    system, context = await _chat_system(request)

    async def events() -> AsyncIterator[dict]:
        yield {
            "type": "context",
            "memory_used": context.get("has_memory", False),
            "weak_concepts": [c["name"] for c in context.get("weak", [])],
            "related": context.get("related", []),
        }

        collected: List[str] = []
        async for event in llm.stream(
            request.message,
            system=system,
            history=[turn.model_dump() for turn in request.history],
            provider=request.provider,
        ):
            if event.get("type") == "delta":
                collected.append(event["text"])
            yield event

        if request.use_memory and collected:
            # Persist inline: a background task would be killed when the
            # serverless function freezes after the response completes.
            await _remember_exchange(request, "".join(collected))

    return sse(events())


async def _remember_exchange(request: ChatRequest, answer: str) -> None:
    """Store a chat exchange in long-term memory."""
    try:
        await memory.ingest(
            request.user_id,
            f"Question: {request.message}\n\nAnswer: {answer[:2000]}",
            source="chat",
            title=request.message[:80],
            # Concept extraction costs a model call; only worth it for
            # substantive exchanges, not "thanks" or "ok".
            extract_concepts=len(request.message) > 40,
        )
    except Exception as exc:  # noqa: BLE001
        logger.info("could not persist exchange: %s", exc)


@api.post("/chat-text")
async def chat_text(request: TextRequest) -> dict:
    """Compatibility shape kept for the existing voice and mobile clients."""
    completion = await llm.complete(
        request.text, system=prompts.CHAT, provider=request.provider
    )
    return {
        "ok": True,
        "response": completion.text,
        "provider": completion.provider,
        "degraded": completion.degraded,
    }


# --------------------------------------------------------------------------- #
# Coding
# --------------------------------------------------------------------------- #

@api.post("/analyze-code")
async def analyze_code(request: CodeRequest) -> dict:
    templates = {
        "explain": "Explain what this {language} code does, top to bottom:",
        "bugfix": "Find every bug in this {language} code. For each: the failure "
                  "scenario, then the fix. Finish with the corrected file:",
        "optimize": "Optimise this {language} code. Name the cost you are removing "
                    "for each change and keep behaviour identical:",
        "convert": "Convert this {language} code to {target_language}, keeping "
                   "idioms natural for the target language:",
        "test": "Write thorough unit tests for this {language} code, covering "
                "edge cases and failure paths:",
        "document": "Add documentation comments to this {language} code, "
                    "explaining constraints rather than restating the syntax:",
    }
    template = templates.get(request.action, templates["explain"])
    instruction = template.format(
        language=request.language, target_language=request.target_language
    )

    completion = await llm.complete(
        f"{instruction}\n\n```{request.language.lower()}\n{request.code}\n```",
        system=prompts.CODE,
    )
    return {
        "ok": True,
        "analysis": completion.text,
        "action": request.action,
        "provider": completion.provider,
        "degraded": completion.degraded,
    }


# --------------------------------------------------------------------------- #
# PDF
# --------------------------------------------------------------------------- #

@api.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    user_id: str = Form("local"),
    ingest_to_memory: bool = Form(True),
) -> dict:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File is larger than the {settings.max_upload_bytes // (1024 * 1024)}MB limit.",
        )

    extracted = tools.extract_pdf_text(content)
    if not extracted["ok"]:
        raise HTTPException(status_code=422, detail=extracted.get("error") or "Could not read this PDF.")

    text = extracted["text"]
    doc_id = uuid.uuid4().hex[:12]

    # Persisted server-side (Redis when configured) so the follow-up question
    # can find it even if it lands on a different serverless instance.
    await store.set(
        PDF_NS,
        doc_id,
        {
            "doc_id": doc_id,
            "filename": file.filename or "document.pdf",
            "text": text[: settings.max_pdf_context_chars * 3],
            "pages": extracted.get("pages", 0),
            "user_id": user_id,
            "at": time.time(),
        },
    )

    concepts: List[str] = []
    if ingest_to_memory:
        try:
            result = await memory.ingest(
                user_id, text, source=f"pdf:{doc_id}", title=file.filename or "document.pdf"
            )
            concepts = result.get("concepts", [])
        except Exception as exc:  # noqa: BLE001
            logger.info("pdf memory ingest skipped: %s", exc)

    return {
        "ok": True,
        "status": "success",
        "doc_id": doc_id,
        "filename": file.filename,
        "pages": extracted.get("pages", 0),
        "char_count": len(text),
        "preview": re.sub(r"\s+", " ", text[:400]).strip() + ("…" if len(text) > 400 else ""),
        "concepts": concepts,
    }


@api.post("/chat-pdf")
async def chat_pdf(request: PdfChatRequest) -> dict:
    document = await store.get(PDF_NS, request.doc_id) if request.doc_id else None

    if not document:
        # No document in scope: answer from general knowledge but say so, rather
        # than silently pretending to have read something.
        completion = await llm.complete(request.question, system=prompts.CHAT)
        return {
            "ok": True,
            "answer": completion.text,
            "context_used": False,
            "note": "No document was in scope, so this answers from general knowledge.",
            "provider": completion.provider,
        }

    full_text = document.get("text", "")

    # Retrieve the most relevant chunks instead of truncating from the top: the
    # answer is rarely on page one of a long document.
    passages = await memory.search(request.user_id, request.question, k=6)
    relevant = [p for p in passages if p.get("source") == f"pdf:{request.doc_id}"]

    if relevant:
        context = "\n\n---\n\n".join(p["text"] for p in relevant)
        retrieval = "vector"
    else:
        context = full_text[: settings.max_pdf_context_chars]
        retrieval = "truncated"

    completion = await llm.complete(
        f"Document: {document.get('filename')}\n\n"
        f"Excerpts:\n{context[: settings.max_pdf_context_chars]}\n\n"
        f"Question: {request.question}",
        system=prompts.DOCUMENT,
    )

    return {
        "ok": True,
        "answer": completion.text,
        "context_used": True,
        "retrieval": retrieval,
        "chunks_used": len(relevant) or 1,
        "filename": document.get("filename"),
        "provider": completion.provider,
        "degraded": completion.degraded,
    }


# --------------------------------------------------------------------------- #
# Vision (feature 2)
# --------------------------------------------------------------------------- #

@api.post("/vision/analyze")
async def vision_analyze(
    image: UploadFile = File(...),
    prompt: str = Form(""),
    mode: str = Form("auto"),
    user_id: str = Form("local"),
    want_scene: bool = Form(False),
) -> dict:
    content = await image.read()
    if not content:
        raise HTTPException(status_code=400, detail="No image data received.")
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Image is too large.")

    provider = await llm.resolve_provider()
    if provider == "offline":
        raise HTTPException(
            status_code=503,
            detail="Vision needs a model. Run `ollama pull llava` locally, or set "
                   "LLM_API_KEY with a vision-capable LLM_VISION_MODEL.",
        )

    instructions = {
        "solve": "Solve the problem in this image, showing every step.",
        "explain": "Explain what this image shows as if teaching it.",
        "extract": "Transcribe all text and formulas in this image accurately.",
        "diagram": "Describe this diagram part by part and how the parts interact.",
        "auto": "Work out what this image needs and do that.",
    }
    task = instructions.get(mode, instructions["auto"])
    question = f"{task}\n\n{prompt}".strip() if prompt else task

    completion = await llm.complete(question, system=prompts.VISION, images=[content])

    scene: Optional[dict] = None
    if want_scene and completion.text and not completion.degraded:
        try:
            scene = await scenes.generate(
                prompt or "the subject of this image", context=completion.text[:1200]
            )
        except Exception as exc:  # noqa: BLE001 - the answer still stands alone
            logger.info("scene generation from image failed: %s", exc)

    if completion.text and not completion.degraded:
        try:
            await memory.ingest(
                user_id,
                f"Image analysis ({mode}): {completion.text[:1500]}",
                source="vision",
                title=prompt[:80] or f"Camera capture ({mode})",
                extract_concepts=True,
            )
        except Exception as exc:  # noqa: BLE001
            logger.info("vision memory ingest skipped: %s", exc)

    return {
        "ok": True,
        "answer": completion.text,
        "mode": mode,
        "provider": completion.provider,
        "model": completion.model,
        "degraded": completion.degraded,
        "scene": scene,
    }


@api.post("/vision/stream")
async def vision_stream(
    image: UploadFile = File(...),
    prompt: str = Form(""),
    mode: str = Form("auto"),
) -> StreamingResponse:
    """Streaming vision, so speech can begin before the full answer arrives."""
    content = await image.read()
    if not content:
        raise HTTPException(status_code=400, detail="No image data received.")

    task = {
        "solve": "Solve the problem in this image, showing every step.",
        "explain": "Explain what this image shows as if teaching it.",
        "extract": "Transcribe all text and formulas in this image accurately.",
        "diagram": "Describe this diagram part by part and how the parts interact.",
    }.get(mode, "Work out what this image needs and do that.")

    question = f"{task}\n\n{prompt}".strip() if prompt else task

    return sse(
        llm.stream(question, system=prompts.VISION, images=[content])
    )


# --------------------------------------------------------------------------- #
# Study
# --------------------------------------------------------------------------- #

@api.post("/study/explain")
async def study_explain(request: ExplainRequest) -> dict:
    context = await memory.build_learner_context(request.user_id, request.topic)
    system = prompts.EXPLAIN
    if context.get("has_memory"):
        system += f"\n\n--- Learner context ---\n{context['prompt_block']}"

    completion = await llm.complete(
        f"Explain '{request.topic}' at a {request.depth} level.", system=system
    )
    return {
        "ok": True,
        "explanation": completion.text,
        "provider": completion.provider,
        "degraded": completion.degraded,
        "personalised": context.get("has_memory", False),
        "weak_concepts": [c["name"] for c in context.get("weak", [])],
    }


@api.post("/study/explain/stream")
async def study_explain_stream(request: ExplainRequest) -> StreamingResponse:
    context = await memory.build_learner_context(request.user_id, request.topic)
    system = prompts.EXPLAIN
    if context.get("has_memory"):
        system += f"\n\n--- Learner context ---\n{context['prompt_block']}"
    return sse(
        llm.stream(f"Explain '{request.topic}' at a {request.depth} level.", system=system)
    )


@api.post("/study/tutor")
async def study_tutor(request: TutorRequest) -> dict:
    context = await memory.build_learner_context(request.user_id, request.message)
    system = prompts.TUTOR
    if context.get("has_memory"):
        system += f"\n\n--- Learner context ---\n{context['prompt_block']}"

    completion = await llm.complete(
        request.message,
        system=system,
        history=[turn.model_dump() for turn in request.context],
    )
    return {
        "ok": True,
        "response": completion.text,
        "provider": completion.provider,
        "degraded": completion.degraded,
        "personalised": context.get("has_memory", False),
    }


@api.post("/study/quiz")
async def study_quiz(request: QuizRequest) -> dict:
    weak = await memory.weak_concepts(request.user_id, limit=4)
    weak_note = ""
    if weak:
        weak_note = (
            " Weight the questions towards these known weak points where they "
            f"overlap the topic: {', '.join(c['name'] for c in weak)}."
        )

    parsed, completion = await llm.complete_json(
        f"Write {request.count} multiple-choice questions about '{request.topic}' "
        f"at {request.difficulty} difficulty.{weak_note}\n"
        'Respond as {"questions":[{"question":"...","options":["a","b","c","d"],'
        '"answer":"exact text of correct option","explanation":"why"}]}',
        system=prompts.QUIZ,
        fallback={"questions": []},
    )

    raw = parsed.get("questions") if isinstance(parsed, dict) else None
    questions = agents.normalise_questions(raw, request.topic)

    return {
        "ok": True,
        "topic": request.topic,
        "questions": questions[: request.count],
        "provider": completion.provider,
        "degraded": completion.degraded or any(q.get("placeholder") for q in questions),
        "targeted_weak_concepts": [c["name"] for c in weak],
    }


@api.post("/study/quiz-result")
async def study_quiz_result(request: QuizResultRequest) -> dict:
    """Record a quiz score so it shapes future explanations."""
    score = request.correct / request.total
    concept = await memory.record_mastery(
        request.user_id, request.topic, score, signal="quiz"
    )
    return {
        "ok": True,
        "score": round(score, 3),
        "concept": concept["name"],
        "mastery": concept["mastery"],
        "encounters": concept["encounters"],
    }


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #

@api.post("/tasks/suggest")
async def suggest_tasks(request: TaskGoalRequest) -> dict:
    parsed, completion = await llm.complete_json(
        f"Break this goal into 3-6 concrete next actions: {request.goal}\n"
        'Respond as {"tasks":[{"text":"...","tag":"Study|Coding|Admin|Health",'
        '"estimate_minutes":30,"priority":"high|medium|low"}]}',
        system=prompts.PRODUCTIVITY,
        fallback={"tasks": []},
    )

    raw = parsed.get("tasks") if isinstance(parsed, dict) else None
    tasks: List[dict] = []
    if isinstance(raw, list):
        for item in raw[:6]:
            if isinstance(item, dict) and str(item.get("text") or "").strip():
                tasks.append(
                    {
                        "text": str(item["text"]).strip()[:200],
                        "tag": str(item.get("tag") or "Study")[:24],
                        "estimate_minutes": int(item.get("estimate_minutes") or 30),
                        "priority": str(item.get("priority") or "medium")[:10],
                    }
                )
            elif isinstance(item, str) and item.strip():
                tasks.append(
                    {"text": item.strip()[:200], "tag": "Study",
                     "estimate_minutes": 30, "priority": "medium"}
                )

    if not tasks:
        tasks = [
            {"text": f"Define what 'done' looks like for: {request.goal}"[:200],
             "tag": "Admin", "estimate_minutes": 15, "priority": "high"},
            {"text": f"Spend 25 focused minutes on the hardest part of {request.goal}"[:200],
             "tag": "Study", "estimate_minutes": 25, "priority": "high"},
            {"text": "Write down what blocked you and what to do next",
             "tag": "Admin", "estimate_minutes": 10, "priority": "medium"},
        ]

    return {
        "ok": True,
        "tasks": tasks,
        # Legacy plain-text field kept so older clients keep working.
        "suggestions": "\n".join(f"{i + 1}. {t['text']}" for i, t in enumerate(tasks)),
        "provider": completion.provider,
        "degraded": completion.degraded,
    }


# --------------------------------------------------------------------------- #
# Agents (feature 1)
# --------------------------------------------------------------------------- #

@api.post("/agents/jobs")
async def create_agent_job(request: AgentJobRequest) -> dict:
    job = await agents.create(
        request.user_id,
        request.goal,
        days=request.days,
        minutes_per_day=request.minutes_per_day,
    )
    return {"ok": True, "job": agents.summarise(job), "id": job["id"]}


@api.get("/agents/jobs")
async def list_agent_jobs(user_id: str = Query("local", max_length=64)) -> dict:
    return {"ok": True, "jobs": await agents.list_jobs(user_id)}


@api.get("/agents/jobs/{job_id}")
async def get_agent_job(job_id: str) -> dict:
    job = await agents.load(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found or expired.")
    return {"ok": True, "job": job}


@api.post("/agents/jobs/{job_id}/step")
async def step_agent_job(job_id: str) -> dict:
    """Run exactly one step.

    The client polls this until ``status`` is terminal. One step per request is
    what keeps a long research run inside a serverless timeout.
    """
    job = await agents.advance(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found or expired.")
    return {
        "ok": True,
        "status": job["status"],
        "cursor": job["cursor"],
        "total": len(job["steps"]),
        "job": job,
    }


@api.post("/agents/jobs/{job_id}/run")
async def run_agent_job(
    job_id: str, max_steps: int = Query(3, ge=1, le=8)
) -> StreamingResponse:
    """Run several steps, streaming progress as each finishes.

    Bounded by ``max_steps`` so one request cannot exceed the platform timeout;
    the client calls again while the job is unfinished.
    """
    async def events() -> AsyncIterator[dict]:
        for _ in range(max_steps):
            job = await agents.advance(job_id)
            if job is None:
                yield {"type": "error", "message": "Job not found or expired."}
                return

            current = job["steps"][min(job["cursor"] - 1, len(job["steps"]) - 1)]
            yield {
                "type": "step",
                "status": job["status"],
                "cursor": job["cursor"],
                "total": len(job["steps"]),
                "agent": current.get("agent"),
                "label": current.get("label"),
                "step_status": current.get("status"),
                "trace": job["trace"][-4:],
            }

            if job["status"] in {"done", "failed"}:
                yield {"type": "complete", "status": job["status"], "job": job}
                return

        yield {"type": "paused", "message": "More steps remain; call again to continue."}

    return sse(events())


@api.get("/agents/jobs/{job_id}/calendar.ics")
async def agent_calendar(job_id: str) -> PlainTextResponse:
    ics = await agents.calendar_for(job_id)
    if ics is None:
        raise HTTPException(status_code=404, detail="Job not found or expired.")
    return PlainTextResponse(
        ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="neura-plan-{job_id}.ics"'},
    )


@api.post("/agents/jobs/{job_id}/quiz-result")
async def agent_quiz_result(job_id: str, request: AgentQuizResultRequest) -> dict:
    result = await agents.submit_quiz_result(
        request.user_id, job_id, request.day, request.correct, request.total
    )
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "Job not found."))
    return result


@api.get("/agents/jobs/{job_id}/next-notification")
async def agent_next_notification(job_id: str) -> dict:
    job = await agents.load(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found or expired.")
    return {"ok": True, "notification": agents.next_notification(job)}


# --------------------------------------------------------------------------- #
# Memory (feature 3)
# --------------------------------------------------------------------------- #

@api.post("/memory/ingest")
async def memory_ingest(request: MemoryIngestRequest) -> dict:
    result = await memory.ingest(
        request.user_id,
        request.text,
        source=request.source,
        title=request.title,
        extract_concepts=request.extract_concepts,
    )
    return {"ok": True, **result}


@api.post("/memory/search")
async def memory_search(request: MemorySearchRequest) -> dict:
    hits = await memory.search(request.user_id, request.query, k=request.k)
    return {"ok": True, "hits": hits, "count": len(hits)}


@api.get("/memory/graph")
async def memory_graph(user_id: str = Query("local", max_length=64)) -> dict:
    return {"ok": True, **(await memory.graph_snapshot(user_id))}


@api.post("/memory/mastery")
async def memory_mastery(request: MasteryRequest) -> dict:
    concept = await memory.record_mastery(
        request.user_id, request.concept, request.score, signal=request.signal
    )
    return {"ok": True, "concept": concept}


@api.get("/memory/weak")
async def memory_weak(
    user_id: str = Query("local", max_length=64), limit: int = Query(6, ge=1, le=20)
) -> dict:
    return {"ok": True, "concepts": await memory.weak_concepts(user_id, limit=limit)}


@api.get("/memory/profile")
async def memory_get_profile(user_id: str = Query("local", max_length=64)) -> dict:
    return {"ok": True, "profile": await memory.get_profile(user_id)}


@api.post("/memory/profile")
async def memory_set_profile(request: ProfileRequest) -> dict:
    profile = await memory.update_profile(
        request.user_id, request.model_dump(exclude={"user_id"}, exclude_none=True)
    )
    return {"ok": True, "profile": profile}


@api.post("/memory/context")
async def memory_context(request: MemorySearchRequest) -> dict:
    """Inspect exactly what personalisation a question would pull in."""
    context = await memory.build_learner_context(request.user_id, request.query)
    return {
        "ok": True,
        "prompt_block": context["prompt_block"],
        "weak": context["weak"],
        "related": context["related"],
        "hits": context["hits"],
        "profile": context["profile"],
        "has_memory": context["has_memory"],
    }


@api.delete("/memory")
async def memory_reset(user_id: str = Query("local", max_length=64)) -> dict:
    await memory.reset(user_id)
    return {"ok": True, "message": "Memory cleared."}


# --------------------------------------------------------------------------- #
# Spatial scenes (feature 4)
# --------------------------------------------------------------------------- #

@api.post("/scene/generate")
async def scene_generate(request: SceneRequest) -> dict:
    context = request.context
    if not context:
        hits = await memory.search(request.user_id, request.prompt, k=2)
        context = "\n\n".join(h["text"] for h in hits)[:1500]

    scene = await scenes.generate(request.prompt, context=context)
    return {"ok": True, "scene": scene}


@api.get("/scene/primitives")
async def scene_primitives() -> dict:
    """The renderer's supported vocabulary, so the UI can document itself."""
    return {"ok": True, "primitives": sorted(scenes.PRIMITIVES), "max_objects": scenes.MAX_OBJECTS}


# --------------------------------------------------------------------------- #
# Voice (feature 5)
# --------------------------------------------------------------------------- #

@api.post("/voice/turn")
async def voice_turn(request: VoiceTurnRequest) -> StreamingResponse:
    """One conversational turn, streamed, with tone adapted to the speaker.

    The browser measures prosody (energy, pitch variance, speech rate) and how
    often the learner has re-asked, and sends those along. They select a tone
    directive so the tutor's style tracks how the learner actually sounds.
    """
    tone, directive = prompts.tone_directive(
        energy=request.energy,
        pitch_variance=request.pitch_variance,
        speech_rate=request.speech_rate,
        repeat_count=request.repeat_count,
        interrupted=request.interrupted,
    )

    context = await memory.build_learner_context(request.user_id, request.transcript)
    system = prompts.voice_system(directive)
    if context.get("has_memory"):
        system += f"\n\n--- Learner context ---\n{context['prompt_block']}"

    async def events() -> AsyncIterator[dict]:
        yield {
            "type": "tone",
            "tone": tone,
            "memory_used": context.get("has_memory", False),
            "weak_concepts": [c["name"] for c in context.get("weak", [])],
        }
        collected: List[str] = []
        async for event in llm.stream(
            request.transcript,
            system=system,
            history=[turn.model_dump() for turn in request.history],
        ):
            if event.get("type") == "delta":
                collected.append(event["text"])
            yield event

        if collected:
            await _remember_exchange(
                ChatRequest(
                    message=request.transcript,
                    user_id=request.user_id,
                    use_memory=True,
                ),
                "".join(collected),
            )

    return sse(events())


@api.get("/voice/config")
async def voice_config() -> dict:
    """Tuning values for the browser's VAD and barge-in detector.

    Served rather than hardcoded in the client so thresholds can be tuned in one
    place without a redeploy of the front-end.
    """
    return {
        "ok": True,
        "vad": {
            "speech_threshold": 0.045,
            "silence_threshold": 0.02,
            "silence_ms": 900,
            "min_speech_ms": 250,
            "frame_ms": 50,
        },
        "barge_in": {
            "enabled": True,
            "threshold": 0.075,
            "consecutive_frames": 3,
        },
        "tts": {"rate": 1.03, "pitch": 1.0, "chunk_on": "sentence"},
        "provider": (await llm.capabilities())["active_provider"],
    }


# --------------------------------------------------------------------------- #
# Edge inference support (feature 6)
# --------------------------------------------------------------------------- #

@api.get("/edge/models")
async def edge_models() -> dict:
    """Catalogue of browser-runnable models for the on-device engine.

    Served from the API so the roster can change without shipping new JS, and so
    the mobile client sees the same list as the web client.
    """
    return {
        "ok": True,
        "engine": "webllm",
        "requires": "WebGPU",
        "models": [
            {
                "id": "Llama-3.2-1B-Instruct-q4f32_1-MLC",
                "label": "Llama 3.2 1B",
                "size_mb": 880,
                "vram_mb": 1130,
                "good_for": "Quick answers, quizzes, offline chat",
                "recommended": True,
            },
            {
                "id": "Llama-3.2-3B-Instruct-q4f16_1-MLC",
                "label": "Llama 3.2 3B",
                "size_mb": 1950,
                "vram_mb": 2950,
                "good_for": "Better reasoning, still laptop-friendly",
            },
            {
                "id": "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
                "label": "Qwen 2.5 1.5B",
                "size_mb": 1050,
                "vram_mb": 1630,
                "good_for": "Strong at maths for its size",
            },
            {
                "id": "SmolLM2-360M-Instruct-q4f16_1-MLC",
                "label": "SmolLM2 360M",
                "size_mb": 280,
                "vram_mb": 380,
                "good_for": "Phones and low-memory devices",
            },
        ],
    }


# --------------------------------------------------------------------------- #
# Legacy compatibility
# --------------------------------------------------------------------------- #

@app.post("/api/chat/legacy")
async def legacy_chat(payload: dict = Body(...)) -> dict:
    """Loose-body endpoint for the old clients that posted ``{content}``."""
    text = str(payload.get("content") or payload.get("text") or payload.get("message") or "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No message provided.")
    completion = await llm.complete(text, system=prompts.CHAT)
    return {"ok": True, "response": completion.text, "content": completion.text}


app.include_router(api)

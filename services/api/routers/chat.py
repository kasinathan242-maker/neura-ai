"""NEURA AI — RAG Chat & Socratic Tutoring Router (services/api/routers/chat.py).

Implements:
1. POST /chat - RAG dialogue with citations and Server-Sent Events (SSE) token streaming
2. GET /chat/threads - List user's active Socratic study threads
3. GET /chat/threads/{id} - Get thread message history with chunk citations
4. DELETE /chat/threads/{id} - Delete conversation thread
"""

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from services.api.database import get_db
    from services.api.models.chat import ChatThread, Message
    from services.api.models.user import User
    from services.api.security.dependencies import get_current_user
    from services.api.security.guardrails import CrisisGuardrail, PromptInjectionGuardrail
    from services.api.services.rag_service import (
        build_rag_prompt,
        execute_rag_stream,
        retrieve_relevant_chunks,
    )
    from services.inference.engine import model_engine
except ImportError:
    from database import get_db
    from models.chat import ChatThread, Message
    from models.user import User
    from security.dependencies import get_current_user
    from security.guardrails import CrisisGuardrail, PromptInjectionGuardrail

    from services.inference.engine import model_engine
    from services.rag_service import (
        build_rag_prompt,
        execute_rag_stream,
        retrieve_relevant_chunks,
    )

logger = logging.getLogger("neura.api.chat")
router = APIRouter(prefix="/chat", tags=["Chat & RAG"])


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000, description="Student question or study prompt")
    document_ids: list[str] | None = Field(default=None, description="Optional document UUIDs to scope retrieval")
    thread_id: str | None = Field(default=None, description="Existing chat thread UUID")
    adapter: str = Field(default="socratic_tutor", description="'socratic_tutor', 'summarizer', etc.")
    stream: bool = Field(default=True, description="Whether to stream response tokens via SSE")


class CitationItem(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    page_number: int | None = None
    similarity: float
    snippet: str


class ChatResponse(BaseModel):
    thread_id: str
    message_id: str
    content: str
    citations: list[CitationItem]
    adapter_used: str


class ThreadSummaryResponse(BaseModel):
    id: str
    title: str
    document_id: str | None = None
    created_at: str
    updated_at: str


class MessageItem(BaseModel):
    id: str
    role: str
    content: str
    language: str
    citations: list[CitationItem] | None = None
    created_at: str


class ThreadDetailResponse(BaseModel):
    id: str
    title: str
    document_id: str | None = None
    messages: list[MessageItem]
    created_at: str


@router.post(
    "",
    summary="Ask NEURA tutor with textbook RAG retrieval and streaming citations",
)
async def chat_with_neura(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Handles Socratic question answering grounded in the student's uploaded notes."""
    # 0. Crisis & Distress Interceptor (Tamil + English)
    crisis_res = CrisisGuardrail.evaluate(payload.query)
    if crisis_res.is_crisis:
        logger.warning(f"Crisis detected for student {current_user.id}: category={crisis_res.distress_category}")
        if payload.stream:
            async def crisis_stream():
                yield f"data: {json.dumps({'token': crisis_res.safety_message, 'is_crisis': True})}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(
                crisis_stream(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
            )
        return ChatResponse(
            thread_id=payload.thread_id or "crisis_dispatch",
            message_id="crisis_safety_msg",
            content=crisis_res.safety_message or "",
            citations=[],
            adapter_used="crisis_safety_override",
        )

    # 0b. Prompt Injection Guardrail
    inj_res = PromptInjectionGuardrail.evaluate(payload.query)
    if inj_res.is_injection:
        flag_msg = (
            "Notice: Your prompt contains an instruction override pattern flagged by our academic integrity guardrails. "
            "Please ask a conceptual question related to Anna University engineering subjects."
        )
        if payload.stream:
            async def injection_stream():
                yield f"data: {json.dumps({'token': flag_msg, 'is_flagged': True})}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(
                injection_stream(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
            )
        return ChatResponse(
            thread_id=payload.thread_id or "security_flag",
            message_id="sec_guard_msg",
            content=flag_msg,
            citations=[],
            adapter_used="security_guardrail",
        )

    if payload.stream:
        return StreamingResponse(
            execute_rag_stream(
                db=db,
                user_id=current_user.id,
                query=payload.query,
                document_ids=payload.document_ids,
                thread_id=payload.thread_id,
                adapter=payload.adapter,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming execution
    thread: ChatThread | None = None
    if payload.thread_id:
        result = await db.execute(
            select(ChatThread).where(ChatThread.id == payload.thread_id, ChatThread.user_id == current_user.id)
        )
        thread = result.scalar_one_or_none()

    if not thread:
        first_doc = payload.document_ids[0] if payload.document_ids else None
        thread = ChatThread(
            user_id=current_user.id,
            document_id=first_doc,
            title=payload.query[:60],
        )
        db.add(thread)
        await db.commit()
        await db.refresh(thread)

    # 1. Retrieve top-k chunks
    citations = await retrieve_relevant_chunks(
        db=db,
        user_id=current_user.id,
        query_text=payload.query,
        document_ids=payload.document_ids,
        top_k=3,
    )

    # 2. Record user message
    user_msg = Message(
        thread_id=thread.id,
        role="user",
        content=payload.query,
        language="en",
        token_count=len(payload.query.split()),
    )
    db.add(user_msg)
    await db.commit()

    # 3. Generate response
    rag_prompt = build_rag_prompt(query=payload.query, citations=citations, adapter=payload.adapter)
    completion = await model_engine.generate(
        prompt=rag_prompt,
        adapter=payload.adapter,
        temperature=0.7,
        max_tokens=512,
    )

    citation_items = [
        CitationItem(
            chunk_id=c["chunk_id"],
            document_id=c["document_id"],
            document_title=c["document_title"],
            page_number=c["page_number"],
            similarity=c["similarity"],
            snippet=c["snippet"],
        )
        for c in citations
    ]

    asst_msg = Message(
        thread_id=thread.id,
        role="assistant",
        content=completion["content"],
        language="en",
        citations=json.dumps([c.model_dump() for c in citation_items], ensure_ascii=False),
        token_count=completion["usage"]["completion_tokens"],
    )
    db.add(asst_msg)
    await db.commit()
    await db.refresh(asst_msg)

    return ChatResponse(
        thread_id=thread.id,
        message_id=asst_msg.id,
        content=asst_msg.content,
        citations=citation_items,
        adapter_used=payload.adapter,
    )


@router.get(
    "/threads",
    response_model=list[ThreadSummaryResponse],
    summary="List all dialogue threads for authenticated student",
)
async def list_threads(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ThreadSummaryResponse]:
    """Lists student's active conversation threads."""
    stmt = (
        select(ChatThread)
        .where(ChatThread.user_id == current_user.id)
        .order_by(ChatThread.updated_at.desc())
    )
    result = await db.execute(stmt)
    threads = result.scalars().all()

    return [
        ThreadSummaryResponse(
            id=t.id,
            title=t.title,
            document_id=t.document_id,
            created_at=t.created_at.isoformat(),
            updated_at=t.updated_at.isoformat(),
        )
        for t in threads
    ]


@router.get(
    "/threads/{thread_id}",
    response_model=ThreadDetailResponse,
    summary="Get full conversation history with citations",
)
async def get_thread_history(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ThreadDetailResponse:
    """Retrieves full dialogue history including chunk citations for each turn."""
    stmt = select(ChatThread).where(ChatThread.id == thread_id, ChatThread.user_id == current_user.id)
    result = await db.execute(stmt)
    thread = result.scalar_one_or_none()

    if not thread:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat thread not found.",
        )

    msg_stmt = (
        select(Message)
        .where(Message.thread_id == thread_id)
        .order_by(Message.created_at.asc())
    )
    msg_result = await db.execute(msg_stmt)
    messages = msg_result.scalars().all()

    parsed_messages: list[MessageItem] = []
    for m in messages:
        cites: list[CitationItem] | None = None
        if m.citations:
            try:
                cites_raw = json.loads(m.citations)
                cites = [CitationItem(**c) for c in cites_raw]
            except Exception:
                cites = None

        parsed_messages.append(
            MessageItem(
                id=m.id,
                role=m.role,
                content=m.content,
                language=m.language,
                citations=cites,
                created_at=m.created_at.isoformat(),
            )
        )

    return ThreadDetailResponse(
        id=thread.id,
        title=thread.title,
        document_id=thread.document_id,
        messages=parsed_messages,
        created_at=thread.created_at.isoformat(),
    )


@router.delete(
    "/threads/{thread_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete conversation thread and message turns",
)
async def delete_thread(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Deletes conversation thread and its associated message turns."""
    stmt = select(ChatThread).where(ChatThread.id == thread_id, ChatThread.user_id == current_user.id)
    result = await db.execute(stmt)
    thread = result.scalar_one_or_none()

    if not thread:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat thread not found.",
        )

    await db.delete(thread)
    await db.commit()

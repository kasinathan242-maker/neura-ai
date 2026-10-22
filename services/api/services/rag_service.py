"""NEURA AI — RAG Search & Socratic Dialogue Orchestrator (services/api/services/rag_service.py).

Implements:
1. Dense vector semantic search using NEURA-EMBED (384-dim)
2. Cosine similarity ranking over user-uploaded document chunks
3. Citation metadata formulation ([Chunk #1] Doc, Page, Snippet)
4. Socratic pedagogical prompt steering (hint-first explanation)
5. Streaming SSE token delivery and database message persistence
"""

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from services.api.models.chat import ChatThread, Message
    from services.api.models.document import Chunk, Document
    from services.inference.engine import model_engine
except ImportError:
    from models.chat import ChatThread, Message
    from models.document import Chunk, Document

    from services.inference.engine import model_engine

logger = logging.getLogger("neura.rag")


def compute_cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Computes cosine similarity between two dense vectors."""
    dot_product = sum(a * b for a, b in zip(vec_a, vec_b, strict=False))
    norm_a = sum(a * a for a in vec_a) ** 0.5
    norm_b = sum(b * b for b in vec_b) ** 0.5
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot_product / (norm_a * norm_b)


async def retrieve_relevant_chunks(
    db: AsyncSession,
    user_id: str,
    query_text: str,
    document_ids: list[str] | None = None,
    top_k: int = 3,
    min_similarity: float = -1.0,
) -> list[dict[str, Any]]:
    """Retrieves top-k most relevant chunks using vector similarity."""
    # 1. Embed query into 384-dim unit vector
    query_embeddings = model_engine.embed([query_text])
    if not query_embeddings:
        return []
    q_vec = query_embeddings[0]

    # 2. Select chunks belonging to user (with optional document filtering)
    stmt = select(Chunk, Document.title).join(Document, Chunk.document_id == Document.id).where(Chunk.user_id == user_id)
    if document_ids:
        stmt = stmt.where(Chunk.document_id.in_(document_ids))

    result = await db.execute(stmt)
    records = result.all()

    scored_chunks: list[dict[str, Any]] = []

    for chunk, doc_title in records:
        if not chunk.embedding:
            continue
        try:
            chunk_vec = json.loads(chunk.embedding)
            sim = compute_cosine_similarity(q_vec, chunk_vec)
            if sim >= min_similarity:
                scored_chunks.append({
                    "chunk_id": chunk.id,
                    "document_id": chunk.document_id,
                    "document_title": doc_title,
                    "page_number": chunk.page_number,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                    "similarity": round(sim, 4),
                    "snippet": chunk.content[:200] + ("..." if len(chunk.content) > 200 else ""),
                })
        except Exception as exc:
            logger.debug(f"Error parsing chunk vector: {exc}")

    # 3. Sort descending by similarity score
    scored_chunks.sort(key=lambda x: x["similarity"], reverse=True)
    return scored_chunks[:top_k]


def build_rag_prompt(
    query: str,
    citations: list[dict[str, Any]],
    conversation_history: list[dict[str, str]] | None = None,
    adapter: str = "socratic_tutor",
) -> str:
    """Builds Qwen2.5 ChatML augmented prompt with retrieved textbook citations."""
    system_text = (
        "You are NEURA, an empathetic Socratic AI study companion for Indian engineering students (Anna University). "
        "Use the provided study material chunks to guide the student. Cite relevant chunk sources using [Chunk #ID] notation. "
        "Provide an intuitive analogy and a guiding hint first. Explain clearly in English with natural Tamil/Tanglish illustrations."
    )

    context_blocks = ""
    if citations:
        context_blocks = "\n\n=== RELEVANT STUDY MATERIAL CITATIONS ===\n"
        for idx, cite in enumerate(citations, 1):
            context_blocks += (
                f"[Chunk #{idx}] (Document: '{cite['document_title']}', Page {cite.get('page_number', 'N/A')}):\n"
                f"{cite['content']}\n\n"
            )
        context_blocks += "=== END CITATIONS ===\n"

    # Assemble ChatML format
    prompt = f"<|im_start|>system\n{system_text}\n{context_blocks}<|im_end|>\n"

    if conversation_history:
        for msg in conversation_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            prompt += f"<|im_start|>{role}\n{content}<|im_end|>\n"

    prompt += f"<|im_start|>user\n{query}<|im_end|>\n<|im_start|>assistant\n"
    return prompt


async def execute_rag_stream(
    db: AsyncSession,
    user_id: str,
    query: str,
    document_ids: list[str] | None = None,
    thread_id: str | None = None,
    adapter: str = "socratic_tutor",
) -> AsyncGenerator[str, None]:
    """Orchestrates RAG retrieval, SSE event streaming with citations, and saves chat history."""
    # 1. Resolve or create chat thread
    thread: ChatThread | None = None
    if thread_id:
        result = await db.execute(select(ChatThread).where(ChatThread.id == thread_id, ChatThread.user_id == user_id))
        thread = result.scalar_one_or_none()

    if not thread:
        first_doc = document_ids[0] if document_ids else None
        thread = ChatThread(
            user_id=user_id,
            document_id=first_doc,
            title=query[:60] if len(query) > 60 else query,
        )
        db.add(thread)
        await db.commit()
        await db.refresh(thread)

    # 2. Retrieve relevant citations
    citations = await retrieve_relevant_chunks(
        db=db,
        user_id=user_id,
        query_text=query,
        document_ids=document_ids,
        top_k=3,
    )

    # 3. Save user question message
    user_msg = Message(
        thread_id=thread.id,
        role="user",
        content=query,
        language="en",
        token_count=len(query.split()),
    )
    db.add(user_msg)
    await db.commit()

    # 4. Yield citations event first
    citations_payload = {
        "type": "citations",
        "thread_id": thread.id,
        "citations": [
            {
                "chunk_id": c["chunk_id"],
                "document_id": c["document_id"],
                "document_title": c["document_title"],
                "page_number": c["page_number"],
                "similarity": c["similarity"],
                "snippet": c["snippet"],
            }
            for c in citations
        ],
    }
    yield f"data: {json.dumps(citations_payload, ensure_ascii=False)}\n\n"

    # 5. Build prompt and stream tokens from model engine
    augmented_prompt = build_rag_prompt(query=query, citations=citations, adapter=adapter)
    full_response_text = ""

    async for chunk in model_engine.generate_stream(
        prompt=augmented_prompt,
        adapter=adapter,
        temperature=0.7,
        max_tokens=512,
    ):
        token = chunk.get("token", "")
        if token:
            full_response_text += token
            token_event = {
                "type": "token",
                "token": token,
            }
            yield f"data: {json.dumps(token_event, ensure_ascii=False)}\n\n"

        if chunk.get("finish_reason") == "stop":
            # 6. Save assistant message with citation metadata
            asst_msg = Message(
                thread_id=thread.id,
                role="assistant",
                content=full_response_text,
                language="en",
                citations=json.dumps(citations_payload["citations"], ensure_ascii=False),
                token_count=len(full_response_text.split()),
            )
            db.add(asst_msg)
            await db.commit()
            await db.refresh(asst_msg)

            # Final done event
            done_event = {
                "type": "done",
                "finish_reason": "stop",
                "thread_id": thread.id,
                "message_id": asst_msg.id,
                "usage": chunk.get("usage", {}),
            }
            yield f"data: {json.dumps(done_event, ensure_ascii=False)}\n\n"

"""NEURA AI — Document Management API Router (services/api/routers/documents.py).

Implements:
1. POST /documents - Upload syllabus/textbook PDF, store in MinIO, extract text, chunk and embed
2. GET /documents - List authenticated student's uploaded documents
3. GET /documents/{id} - Get document metadata and indexing status
4. GET /documents/{id}/chunks - View extracted semantic chunks with pagination
5. DELETE /documents/{id} - Delete document and cascading vector chunks
"""

import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from services.api.database import get_db
    from services.api.models.document import Chunk, Document
    from services.api.models.user import User
    from services.api.security.dependencies import get_current_user
    from services.api.security.guardrails import FileUploadSanitizer
    from services.api.services.document_processor import index_document_pipeline
    from services.api.services.storage import storage_service
    from services.api.services.summarizer import generate_document_summary
except ImportError:
    from database import get_db
    from models.document import Chunk, Document
    from models.user import User
    from security.dependencies import get_current_user
    from security.guardrails import FileUploadSanitizer

    from services.document_processor import index_document_pipeline
    from services.storage import storage_service
    from services.summarizer import generate_document_summary

logger = logging.getLogger("neura.api.documents")
router = APIRouter(prefix="/documents", tags=["Documents"])


class DocumentResponse(BaseModel):
    id: str
    title: str
    file_size_bytes: int
    mime_type: str
    status: str
    summary: str | None = None
    chunk_count: int = 0
    created_at: str


class ChunkResponse(BaseModel):
    id: str
    chunk_index: int
    content: str
    page_number: int | None
    token_count: int


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int


class DocumentSummaryResponse(BaseModel):
    document_id: str
    title: str
    summary: str
    status: str


@router.post(
    "",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload PDF study material and trigger vector indexing",
)
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentResponse:
    """Accepts PDF upload, saves to MinIO object storage, extracts text, chunks, and indexes."""
    filename = file.filename or "uploaded_study_material.pdf"
    if not (filename.lower().endswith(".pdf") or file.content_type == "application/pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF documents are supported for indexing.",
        )

    # Read PDF content
    pdf_bytes = await file.read()
    valid, err_msg = FileUploadSanitizer.validate_pdf_content(pdf_bytes, filename)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err_msg,
        )

    # Save to MinIO / local storage
    object_key = f"{current_user.id}/{uuid.uuid4().hex}_{filename}"
    storage_path = storage_service.upload_bytes(
        object_name=object_key,
        data=pdf_bytes,
        content_type="application/pdf",
    )

    clean_title = filename.rsplit(".", 1)[0].replace("_", " ").title()

    # Create document record
    doc = Document(
        user_id=current_user.id,
        title=clean_title,
        file_path_minio=storage_path,
        file_size_bytes=len(pdf_bytes),
        mime_type="application/pdf",
        status="processing",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Execute extraction, chunking, and embedding indexing pipeline
    try:
        chunk_count = await index_document_pipeline(db=db, document=doc, pdf_bytes=pdf_bytes)
        await db.refresh(doc)
    except Exception as exc:
        logger.error(f"Error during document indexing: {exc}")
        chunk_count = 0

    return DocumentResponse(
        id=doc.id,
        title=doc.title,
        file_size_bytes=doc.file_size_bytes,
        mime_type=doc.mime_type,
        status=doc.status,
        summary=doc.summary,
        chunk_count=chunk_count,
        created_at=doc.created_at.isoformat(),
    )


@router.get(
    "",
    response_model=DocumentListResponse,
    summary="List all uploaded study documents for authenticated student",
)
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentListResponse:
    """Lists student's uploaded documents with chunk count."""
    stmt = (
        select(Document, func.count(Chunk.id).label("chunk_count"))
        .outerjoin(Chunk, Document.id == Chunk.document_id)
        .where(Document.user_id == current_user.id)
        .group_by(Document.id)
        .order_by(Document.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    documents: list[DocumentResponse] = []
    for doc, chunk_count in rows:
        documents.append(
            DocumentResponse(
                id=doc.id,
                title=doc.title,
                file_size_bytes=doc.file_size_bytes,
                mime_type=doc.mime_type,
                status=doc.status,
                summary=doc.summary,
                chunk_count=chunk_count,
                created_at=doc.created_at.isoformat(),
            )
        )

    return DocumentListResponse(documents=documents, total=len(documents))


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    summary="Get document details and indexing status",
)
async def get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentResponse:
    """Fetches single document details."""
    stmt = (
        select(Document, func.count(Chunk.id).label("chunk_count"))
        .outerjoin(Chunk, Document.id == Chunk.document_id)
        .where(Document.id == document_id, Document.user_id == current_user.id)
        .group_by(Document.id)
    )
    result = await db.execute(stmt)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or does not belong to you.",
        )

    doc, chunk_count = row
    return DocumentResponse(
        id=doc.id,
        title=doc.title,
        file_size_bytes=doc.file_size_bytes,
        mime_type=doc.mime_type,
        status=doc.status,
        summary=doc.summary,
        chunk_count=chunk_count,
        created_at=doc.created_at.isoformat(),
    )


@router.get(
    "/{document_id}/summary",
    response_model=DocumentSummaryResponse,
    summary="Get cached or generated abstractive summary of document",
)
async def get_document_summary(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentSummaryResponse:
    """Returns abstractive summary of document using NEURA-SUM."""
    stmt = select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    summary_text = await generate_document_summary(db=db, document=doc, force_refresh=False)
    return DocumentSummaryResponse(
        document_id=doc.id,
        title=doc.title,
        summary=summary_text,
        status="completed",
    )


@router.post(
    "/{document_id}/summarize",
    response_model=DocumentSummaryResponse,
    summary="Regenerate abstractive summary using NEURA-SUM map-reduce",
)
async def summarize_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentSummaryResponse:
    """Forces generation of a fresh executive summary."""
    stmt = select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    summary_text = await generate_document_summary(db=db, document=doc, force_refresh=True)
    return DocumentSummaryResponse(
        document_id=doc.id,
        title=doc.title,
        summary=summary_text,
        status="completed",
    )


@router.get(
    "/{document_id}/chunks",
    response_model=list[ChunkResponse],
    summary="Get indexed semantic chunks for a document",
)
async def get_document_chunks(
    document_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ChunkResponse]:
    """Retrieves paginated semantic chunks extracted from a document."""
    # Verify ownership
    doc_res = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    if not doc_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    chunk_stmt = (
        select(Chunk)
        .where(Chunk.document_id == document_id)
        .order_by(Chunk.chunk_index.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(chunk_stmt)
    chunks = result.scalars().all()

    return [
        ChunkResponse(
            id=c.id,
            chunk_index=c.chunk_index,
            content=c.content,
            page_number=c.page_number,
            token_count=c.token_count,
        )
        for c in chunks
    ]


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete document and cascading chunks",
)
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Deletes document record, associated chunks, and MinIO storage object."""
    stmt = select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    # Remove from storage
    if doc.file_path_minio:
        parts = doc.file_path_minio.split("/", 1)
        object_name = parts[1] if len(parts) > 1 else doc.file_path_minio
        storage_service.delete_object(object_name=object_name)

    await db.delete(doc)
    await db.commit()

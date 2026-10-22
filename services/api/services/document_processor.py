"""NEURA AI — PDF Text Extraction, OCR Fallback & Chunking Pipeline.

Provides:
1. High-fidelity PDF text extraction page-by-page via pypdf
2. Tesseract OCR fallback for scanned or image-based pages
3. Sliding window token/character chunking with overlap
4. Dense vector embedding generation (NEURA-EMBED multilingual 384-dim)
5. Database ingestion and indexing for PostgreSQL pgvector / SQLite
"""

import io
import json
import logging
from typing import Any

from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from services.api.models.document import Chunk, Document
    from services.inference.engine import model_engine
except ImportError:
    from models.document import Chunk, Document

    from services.inference.engine import model_engine

logger = logging.getLogger("neura.processor")

# Check if pytesseract is available for OCR
OCR_AVAILABLE = False
try:
    import pytesseract  # type: ignore
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


def extract_text_from_pdf(pdf_bytes: bytes) -> list[dict[str, Any]]:
    """Extracts text page by page from raw PDF bytes.

    If a page has insufficient text (< 30 characters), attempts OCR fallback.
    Returns: [{'page_number': 1, 'text': '...', 'ocr_applied': False}, ...]
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    extracted_pages: list[dict[str, Any]] = []

    for idx, page in enumerate(reader.pages):
        page_num = idx + 1
        page_text = page.extract_text() or ""
        page_text = page_text.strip()
        ocr_applied = False

        # If page text is very sparse or empty, trigger OCR fallback
        if len(page_text) < 30 and OCR_AVAILABLE:
            try:
                # OCR fallback extraction on page images if present
                for img in page.images:
                    img_text = pytesseract.image_to_string(img.image)  # type: ignore
                    if img_text.strip():
                        page_text += "\n" + img_text.strip()
                        ocr_applied = True
            except Exception as exc:
                logger.debug(f"OCR fallback note on page {page_num}: {exc}")

        extracted_pages.append({
            "page_number": page_num,
            "text": page_text,
            "ocr_applied": ocr_applied,
        })

    logger.info(f"Extracted {len(extracted_pages)} pages from PDF.")
    return extracted_pages


def chunk_extracted_pages(
    pages: list[dict[str, Any]],
    chunk_size_chars: int = 800,
    overlap_chars: int = 150,
) -> list[dict[str, Any]]:
    """Chunks multi-page text into sliding windows with overlap.

    Returns: [{'chunk_index': 0, 'content': '...', 'page_number': 1, 'token_count': 120}, ...]
    """
    chunks: list[dict[str, Any]] = []
    chunk_index = 0

    for page in pages:
        text = page["text"].strip()
        page_num = page["page_number"]
        if not text:
            continue

        # If text is smaller than chunk size, create single chunk
        if len(text) <= chunk_size_chars:
            chunks.append({
                "chunk_index": chunk_index,
                "content": text,
                "page_number": page_num,
                "token_count": len(text.split()),
            })
            chunk_index += 1
            continue

        # Sliding window chunking
        start = 0
        while start < len(text):
            end = start + chunk_size_chars
            chunk_text = text[start:end].strip()
            if chunk_text:
                chunks.append({
                    "chunk_index": chunk_index,
                    "content": chunk_text,
                    "page_number": page_num,
                    "token_count": len(chunk_text.split()),
                })
                chunk_index += 1

            start += chunk_size_chars - overlap_chars

    logger.info(f"Created {len(chunks)} text chunks across {len(pages)} pages.")
    return chunks


async def index_document_pipeline(
    db: AsyncSession,
    document: Document,
    pdf_bytes: bytes,
) -> int:
    """Executes full PDF ingestion pipeline:

    1. Extract page text (with OCR fallback)
    2. Split into overlapping chunks
    3. Generate 384-dimensional dense embeddings
    4. Save Chunk records into database
    5. Update Document status to 'indexed'
    """
    try:
        pages = extract_text_from_pdf(pdf_bytes)
        chunks_meta = chunk_extracted_pages(pages)

        if not chunks_meta:
            # Document had no extractable text
            document.status = "indexed"
            document.summary = "No textual content detected in document."
            await db.commit()
            return 0

        # Generate embeddings in batch via NEURA-EMBED engine
        chunk_texts = [c["content"] for c in chunks_meta]
        embeddings = model_engine.embed(chunk_texts)

        # Create Chunk models
        for meta, vector in zip(chunks_meta, embeddings, strict=True):
            chunk = Chunk(
                document_id=document.id,
                user_id=document.user_id,
                chunk_index=meta["chunk_index"],
                content=meta["content"],
                page_number=meta["page_number"],
                token_count=meta["token_count"],
                embedding=json.dumps(vector),  # Stored as serialized 384-dim vector JSON
            )
            db.add(chunk)

        document.status = "indexed"
        document.summary = (
            f"Indexed {len(chunks_meta)} chunks across {len(pages)} pages. "
            f"Topics covered: {chunks_meta[0]['content'][:150]}..."
        )
        await db.commit()
        logger.info(f"Successfully indexed document {document.id} with {len(chunks_meta)} chunks.")
        return len(chunks_meta)

    except Exception as exc:
        logger.exception(f"Failed to index document {document.id}: {exc}")
        document.status = "failed"
        await db.commit()
        raise

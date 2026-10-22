"""NEURA AI — Study Notes & Spaced Repetition Reminders Router (services/api/routers/study.py).

Implements:
1. CRUD /notes - Student study notes linked to subjects and uploaded PDFs
2. CRUD /reminders - Spaced repetition push alerts and study schedules
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from services.api.database import get_db
    from services.api.models.study import Note, Reminder
    from services.api.models.user import User
    from services.api.security.dependencies import get_current_user
except ImportError:
    from database import get_db
    from models.study import Note, Reminder
    from models.user import User
    from security.dependencies import get_current_user

logger = logging.getLogger("neura.api.study")
router = APIRouter(tags=["Notes & Reminders"])


# ==============================================================================
# SCHEMAS
# ==============================================================================


class NoteCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1)
    document_id: str | None = None
    tags: str | None = None


class NoteUpdateRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: str | None = None


class NoteResponse(BaseModel):
    id: str
    user_id: str
    document_id: str | None = None
    title: str
    content: str
    tags: str | None = None
    created_at: str
    updated_at: str


class ReminderCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    scheduled_time: datetime


class ReminderResponse(BaseModel):
    id: str
    user_id: str
    title: str
    message: str
    scheduled_time: str
    is_sent: bool
    created_at: str


# ==============================================================================
# NOTES ENDPOINTS
# ==============================================================================


@router.post(
    "/notes",
    response_model=NoteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new study note",
)
async def create_note(
    payload: NoteCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NoteResponse:
    """Creates a new student note."""
    note = Note(
        user_id=current_user.id,
        document_id=payload.document_id,
        title=payload.title,
        content=payload.content,
        tags=payload.tags,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)

    return NoteResponse(
        id=note.id,
        user_id=note.user_id,
        document_id=note.document_id,
        title=note.title,
        content=note.content,
        tags=note.tags,
        created_at=note.created_at.isoformat(),
        updated_at=note.updated_at.isoformat(),
    )


@router.get(
    "/notes",
    response_model=list[NoteResponse],
    summary="List all study notes for authenticated student",
)
async def list_notes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[NoteResponse]:
    """Retrieves all notes created by student."""
    stmt = select(Note).where(Note.user_id == current_user.id).order_by(Note.updated_at.desc())
    result = await db.execute(stmt)
    notes = result.scalars().all()

    return [
        NoteResponse(
            id=n.id,
            user_id=n.user_id,
            document_id=n.document_id,
            title=n.title,
            content=n.content,
            tags=n.tags,
            created_at=n.created_at.isoformat(),
            updated_at=n.updated_at.isoformat(),
        )
        for n in notes
    ]


@router.get(
    "/notes/{note_id}",
    response_model=NoteResponse,
    summary="Get single study note",
)
async def get_note(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NoteResponse:
    """Retrieves specific note by ID."""
    stmt = select(Note).where(Note.id == note_id, Note.user_id == current_user.id)
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    return NoteResponse(
        id=note.id,
        user_id=note.user_id,
        document_id=note.document_id,
        title=note.title,
        content=note.content,
        tags=note.tags,
        created_at=note.created_at.isoformat(),
        updated_at=note.updated_at.isoformat(),
    )


@router.put(
    "/notes/{note_id}",
    response_model=NoteResponse,
    summary="Update existing study note",
)
async def update_note(
    note_id: str,
    payload: NoteUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NoteResponse:
    """Updates note title, content, or tags."""
    stmt = select(Note).where(Note.id == note_id, Note.user_id == current_user.id)
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    if payload.title is not None:
        note.title = payload.title
    if payload.content is not None:
        note.content = payload.content
    if payload.tags is not None:
        note.tags = payload.tags

    await db.commit()
    await db.refresh(note)

    return NoteResponse(
        id=note.id,
        user_id=note.user_id,
        document_id=note.document_id,
        title=note.title,
        content=note.content,
        tags=note.tags,
        created_at=note.created_at.isoformat(),
        updated_at=note.updated_at.isoformat(),
    )


@router.delete(
    "/notes/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete study note",
)
async def delete_note(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Deletes note."""
    stmt = select(Note).where(Note.id == note_id, Note.user_id == current_user.id)
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    await db.delete(note)
    await db.commit()


# ==============================================================================
# REMINDERS ENDPOINTS
# ==============================================================================


@router.post(
    "/reminders",
    response_model=ReminderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Schedule study reminder",
)
async def create_reminder(
    payload: ReminderCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReminderResponse:
    """Creates a spaced repetition study reminder."""
    reminder = Reminder(
        user_id=current_user.id,
        title=payload.title,
        message=payload.message,
        scheduled_time=payload.scheduled_time,
    )
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)

    return ReminderResponse(
        id=reminder.id,
        user_id=reminder.user_id,
        title=reminder.title,
        message=reminder.message,
        scheduled_time=reminder.scheduled_time.isoformat(),
        is_sent=reminder.is_sent,
        created_at=reminder.created_at.isoformat(),
    )


@router.get(
    "/reminders",
    response_model=list[ReminderResponse],
    summary="List all reminders for authenticated student",
)
async def list_reminders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ReminderResponse]:
    """Lists student's active and historical reminders."""
    stmt = select(Reminder).where(Reminder.user_id == current_user.id).order_by(Reminder.scheduled_time.asc())
    result = await db.execute(stmt)
    reminders = result.scalars().all()

    return [
        ReminderResponse(
            id=r.id,
            user_id=r.user_id,
            title=r.title,
            message=r.message,
            scheduled_time=r.scheduled_time.isoformat(),
            is_sent=r.is_sent,
            created_at=r.created_at.isoformat(),
        )
        for r in reminders
    ]


@router.delete(
    "/reminders/{reminder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete scheduled reminder",
)
async def delete_reminder(
    reminder_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Deletes reminder."""
    stmt = select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
    result = await db.execute(stmt)
    reminder = result.scalar_one_or_none()

    if not reminder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found.")

    await db.delete(reminder)
    await db.commit()

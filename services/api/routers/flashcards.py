"""NEURA AI — Flashcards & SM-2 Spaced Repetition API Router (services/api/routers/flashcards.py).

Implements:
1. POST /flashcards/generate - Generate cards via NEURA-CARD GBNF grammar
2. GET /flashcards/decks - List decks with card counts and due card counts
3. GET /flashcards/decks/{id} - Get deck with full card set
4. GET /flashcards/decks/{id}/due - Get cards currently due for review
5. POST /flashcards/review - Submit 0-5 recall quality and compute next SM-2 interval
6. GET /flashcards/stats - Student retention, streak, and review metrics
7. DELETE /flashcards/decks/{id} - Delete deck and associated cards
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from services.api.database import get_db
    from services.api.models.study import Flashcard, FlashcardDeck, ReviewLog
    from services.api.models.user import User
    from services.api.security.dependencies import get_current_user
    from services.api.services.card_generator import generate_flashcards_for_deck
    from services.api.services.sm2 import compute_sm2
except ImportError:
    from database import get_db
    from models.study import Flashcard, FlashcardDeck, ReviewLog
    from models.user import User
    from security.dependencies import get_current_user

    from services.card_generator import generate_flashcards_for_deck
    from services.sm2 import compute_sm2

logger = logging.getLogger("neura.api.flashcards")
router = APIRouter(prefix="/flashcards", tags=["Flashcards & Spaced Repetition"])


# ==============================================================================
# SCHEMAS
# ==============================================================================


class GenerateCardsRequest(BaseModel):
    document_id: str | None = Field(default=None, description="Optional uploaded document UUID")
    topic: str | None = Field(default=None, description="Curriculum topic name, e.g. 'AVL Trees'")
    title: str | None = Field(default=None, description="Deck title")
    count: int = Field(default=5, ge=1, le=50, description="Number of cards to generate")


class FlashcardItem(BaseModel):
    id: str
    deck_id: str
    question: str
    answer: str
    options: list[str]
    difficulty: str
    interval_days: int
    repetitions: int
    easiness_factor: float
    next_review_at: str


class DeckSummary(BaseModel):
    id: str
    title: str
    description: str | None = None
    document_id: str | None = None
    total_cards: int
    due_cards: int
    created_at: str


class DeckDetail(BaseModel):
    id: str
    title: str
    description: str | None = None
    document_id: str | None = None
    cards: list[FlashcardItem]
    created_at: str


class ReviewCardRequest(BaseModel):
    card_id: str
    quality: int = Field(..., ge=0, le=5, description="Recall grade: 0=blackout, 5=perfect")
    duration_ms: int = Field(default=0, ge=0, description="Time spent reviewing in milliseconds")


class ReviewCardResponse(BaseModel):
    card_id: str
    quality: int
    new_interval_days: int
    new_repetitions: int
    new_easiness_factor: float
    next_review_at: str
    status: str = Field(default="scheduled")


class FlashcardStatsResponse(BaseModel):
    total_reviews: int
    retention_rate: float
    cards_learned: int
    cards_due_today: int


# ==============================================================================
# ENDPOINTS
# ==============================================================================


@router.post(
    "/generate",
    response_model=DeckDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Generate curriculum flashcards via NEURA-CARD GBNF grammar",
)
async def generate_cards(
    payload: GenerateCardsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeckDetail:
    """Creates a new flashcard deck with structured questions, answers, and 4 options."""
    title = payload.title or payload.topic or "Study Deck"
    deck = await generate_flashcards_for_deck(
        db=db,
        user_id=current_user.id,
        deck_title=title,
        document_id=payload.document_id,
        topic=payload.topic,
        count=payload.count,
    )

    # Fetch newly created cards
    stmt = select(Flashcard).where(Flashcard.deck_id == deck.id).order_by(Flashcard.created_at.asc())
    result = await db.execute(stmt)
    cards = result.scalars().all()

    card_items = [
        FlashcardItem(
            id=c.id,
            deck_id=c.deck_id,
            question=c.question,
            answer=c.answer,
            options=json.loads(c.options) if c.options else [],
            difficulty=c.difficulty,
            interval_days=c.interval_days,
            repetitions=c.repetitions,
            easiness_factor=c.easiness_factor,
            next_review_at=c.next_review_at.isoformat(),
        )
        for c in cards
    ]

    return DeckDetail(
        id=deck.id,
        title=deck.title,
        description=deck.description,
        document_id=deck.document_id,
        cards=card_items,
        created_at=deck.created_at.isoformat(),
    )


@router.get(
    "/decks",
    response_model=list[DeckSummary],
    summary="List student's flashcard decks with due counts",
)
async def list_decks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DeckSummary]:
    """Lists decks with total card counts and due cards."""
    now = datetime.now(timezone.utc)
    stmt = (
        select(
            FlashcardDeck,
            func.count(Flashcard.id).label("total_cards"),
            func.count(Flashcard.id).filter(Flashcard.next_review_at <= now).label("due_cards"),
        )
        .outerjoin(Flashcard, FlashcardDeck.id == Flashcard.deck_id)
        .where(FlashcardDeck.user_id == current_user.id)
        .group_by(FlashcardDeck.id)
        .order_by(FlashcardDeck.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        DeckSummary(
            id=deck.id,
            title=deck.title,
            description=deck.description,
            document_id=deck.document_id,
            total_cards=total_cards,
            due_cards=due_cards,
            created_at=deck.created_at.isoformat(),
        )
        for deck, total_cards, due_cards in rows
    ]


@router.get(
    "/decks/{deck_id}",
    response_model=DeckDetail,
    summary="Get deck details and cards",
)
async def get_deck(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeckDetail:
    """Retrieves single deck with all its flashcards."""
    stmt = select(FlashcardDeck).where(
        FlashcardDeck.id == deck_id, FlashcardDeck.user_id == current_user.id
    )
    result = await db.execute(stmt)
    deck = result.scalar_one_or_none()

    if not deck:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found.")

    card_stmt = select(Flashcard).where(Flashcard.deck_id == deck_id).order_by(Flashcard.created_at.asc())
    card_result = await db.execute(card_stmt)
    cards = card_result.scalars().all()

    return DeckDetail(
        id=deck.id,
        title=deck.title,
        description=deck.description,
        document_id=deck.document_id,
        cards=[
            FlashcardItem(
                id=c.id,
                deck_id=c.deck_id,
                question=c.question,
                answer=c.answer,
                options=json.loads(c.options) if c.options else [],
                difficulty=c.difficulty,
                interval_days=c.interval_days,
                repetitions=c.repetitions,
                easiness_factor=c.easiness_factor,
                next_review_at=c.next_review_at.isoformat(),
            )
            for c in cards
        ],
        created_at=deck.created_at.isoformat(),
    )


@router.get(
    "/decks/{deck_id}/due",
    response_model=list[FlashcardItem],
    summary="Get cards currently due for SM-2 review in deck",
)
async def get_due_cards_in_deck(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FlashcardItem]:
    """Retrieves cards where next_review_at <= current UTC time."""
    now = datetime.now(timezone.utc)
    stmt = (
        select(Flashcard)
        .where(
            Flashcard.deck_id == deck_id,
            Flashcard.user_id == current_user.id,
            Flashcard.next_review_at <= now,
        )
        .order_by(Flashcard.next_review_at.asc())
    )
    result = await db.execute(stmt)
    cards = result.scalars().all()

    return [
        FlashcardItem(
            id=c.id,
            deck_id=c.deck_id,
            question=c.question,
            answer=c.answer,
            options=json.loads(c.options) if c.options else [],
            difficulty=c.difficulty,
            interval_days=c.interval_days,
            repetitions=c.repetitions,
            easiness_factor=c.easiness_factor,
            next_review_at=c.next_review_at.isoformat(),
        )
        for c in cards
    ]


@router.post(
    "/review",
    response_model=ReviewCardResponse,
    summary="Submit SM-2 recall rating (0-5) and update interval",
)
async def review_card(
    payload: ReviewCardRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReviewCardResponse:
    """Executes the SM-2 spaced repetition calculation on a flashcard."""
    stmt = select(Flashcard).where(
        Flashcard.id == payload.card_id, Flashcard.user_id == current_user.id
    )
    result = await db.execute(stmt)
    card = result.scalar_one_or_none()

    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flashcard not found.")

    prev_interval = card.interval_days
    prev_reps = card.repetitions
    prev_ef = card.easiness_factor

    # Compute next SM-2 schedule
    new_interval, new_reps, new_ef, next_review_at = compute_sm2(
        quality=payload.quality,
        repetitions=prev_reps,
        previous_interval=prev_interval,
        previous_easiness_factor=prev_ef,
    )

    # 1. Record historical review log
    log = ReviewLog(
        flashcard_id=card.id,
        user_id=current_user.id,
        quality=payload.quality,
        scheduled_interval=prev_interval,
        reviewed_interval=new_interval,
        easiness_factor=new_ef,
        review_duration_ms=payload.duration_ms,
    )
    db.add(log)

    # 2. Update card state
    card.interval_days = new_interval
    card.repetitions = new_reps
    card.easiness_factor = new_ef
    card.next_review_at = next_review_at

    await db.commit()
    await db.refresh(card)

    return ReviewCardResponse(
        card_id=card.id,
        quality=payload.quality,
        new_interval_days=new_interval,
        new_repetitions=new_reps,
        new_easiness_factor=new_ef,
        next_review_at=next_review_at.isoformat(),
        status="scheduled",
    )


@router.get(
    "/stats",
    response_model=FlashcardStatsResponse,
    summary="Get student study retention metrics and due cards",
)
async def get_study_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FlashcardStatsResponse:
    """Computes retention rate, cards learned, and total review volume."""
    now = datetime.now(timezone.utc)

    # Total reviews
    review_stmt = select(
        func.count(ReviewLog.id).label("total_reviews"),
        func.count(ReviewLog.id).filter(ReviewLog.quality >= 3).label("successful_reviews"),
    ).where(ReviewLog.user_id == current_user.id)
    review_res = await db.execute(review_stmt)
    total_reviews, successful_reviews = review_res.first() or (0, 0)

    retention_rate = (
        round((successful_reviews / total_reviews) * 100, 1) if total_reviews > 0 else 100.0
    )

    # Cards learned (reps >= 2)
    learned_stmt = select(func.count(Flashcard.id)).where(
        Flashcard.user_id == current_user.id, Flashcard.repetitions >= 2
    )
    learned_res = await db.execute(learned_stmt)
    cards_learned = learned_res.scalar() or 0

    # Cards due today
    due_stmt = select(func.count(Flashcard.id)).where(
        Flashcard.user_id == current_user.id, Flashcard.next_review_at <= now
    )
    due_res = await db.execute(due_stmt)
    cards_due_today = due_res.scalar() or 0

    return FlashcardStatsResponse(
        total_reviews=total_reviews,
        retention_rate=retention_rate,
        cards_learned=cards_learned,
        cards_due_today=cards_due_today,
    )


@router.delete(
    "/decks/{deck_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete flashcard deck and all contained cards",
)
async def delete_deck(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Deletes deck with cascading removal of cards and review history."""
    stmt = select(FlashcardDeck).where(
        FlashcardDeck.id == deck_id, FlashcardDeck.user_id == current_user.id
    )
    result = await db.execute(stmt)
    deck = result.scalar_one_or_none()

    if not deck:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found.")

    await db.delete(deck)
    await db.commit()

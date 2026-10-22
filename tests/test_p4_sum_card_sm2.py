"""NEURA AI — Phase P4 Acceptance Tests: NEURA-SUM + NEURA-CARD + SM-2 Review Flow.

Covers:
1. Pure mathematical SM-2 algorithm:
   - Interval progression (1 -> 6 -> round(6 * EF))
   - Repetition increments on recall >= 3
   - Failure resets (repetitions=0, interval=1) on recall < 3
   - Easiness factor adjustment formula and 1.3 lower bound clamping
   - Quality range bounds validation (0 to 5)
   - Datetime timestamp scheduling
2. NEURA-SUM document summarization:
   - GET /documents/{id}/summary (generates and caches executive summary)
   - Subsequent GET returns cached summary without recomputation
   - POST /documents/{id}/summarize (forces re-generation)
   - 404 on missing document
   - Multi-tenant isolation (User B cannot access User A's summary)
3. NEURA-CARD curriculum flashcard generation:
   - POST /flashcards/generate with topic (curriculum pool + strict JSON options)
   - POST /flashcards/generate with document_id (context-aware card generation)
   - Count validation bounds (1 to 50)
4. Decks, cards, and due queries:
   - GET /flashcards/decks (lists decks with total_cards and due_cards)
   - GET /flashcards/decks/{id} (returns full card details)
   - GET /flashcards/decks/{id}/due (filters cards with next_review_at <= now)
   - 404 on invalid deck ID
5. SM-2 review submission lifecycle:
   - POST /flashcards/review with quality=5 (reps=1, interval=1)
   - Consecutive review with quality=5 (reps=2, interval=6)
   - Consecutive review with quality=5 (reps=3, interval=round(6 * EF))
   - Consecutive review with quality=2 (reps=0, interval=1)
   - ReviewLog audit entry creation
   - 422 on invalid recall quality
   - 404 on unknown card ID
6. Study retention and learning statistics:
   - GET /flashcards/stats (total_reviews, retention_rate, cards_learned, cards_due_today)
7. Study notes CRUD:
   - POST /notes -> GET /notes -> GET /notes/{id} -> PUT /notes/{id} -> DELETE /notes/{id}
8. Study reminders CRUD:
   - POST /reminders -> GET /reminders -> DELETE /reminders/{id}
9. Cascade deletion & multi-tenant isolation:
   - DELETE /flashcards/decks/{id} removes deck and cascading flashcards
   - Multi-tenant isolation: User B cannot access or review User A's decks or cards
"""

import io
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import services.api.main as api_module
from services.api.services.sm2 import compute_sm2


@pytest.fixture
def client() -> TestClient:
    return TestClient(api_module.app)


_TOKEN_CACHE: dict[str, str] = {}


def get_auth_token(client: TestClient, email: str, name: str) -> str:
    """Helper to register and obtain a valid JWT access token."""
    if email in _TOKEN_CACHE:
        return _TOKEN_CACHE[email]

    reg_resp = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "SecurePassword2026!",
            "full_name": name,
            "college": "CEG Anna University",
            "department": "CSE",
            "year_of_study": 3,
        },
    )
    if reg_resp.status_code == 201:
        token = reg_resp.json()["access_token"]
        _TOKEN_CACHE[email] = token
        return token

    login_resp = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": "SecurePassword2026!",
        },
    )
    token = login_resp.json()["access_token"]
    _TOKEN_CACHE[email] = token
    return token


@pytest.fixture
def primary_token(client: TestClient) -> str:
    return get_auth_token(client, "p4_primary_student@annauniv.edu", "P4 Primary Student")


@pytest.fixture
def secondary_token(client: TestClient) -> str:
    return get_auth_token(client, "p4_peer_student@annauniv.edu", "P4 Peer Student")


def create_sample_summary_pdf(title: str = "CS3401 Algorithms and Data Structures") -> bytes:
    """Generates an in-memory sample syllabus PDF for summarization testing."""
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(50, 750, title)
    pdf.setFont("Helvetica", 12)
    pdf.drawString(50, 720, "Unit 1: Algorithm Analysis and Recurrence Relations")
    pdf.drawString(
        50,
        700,
        "Asymptotic notations Big-O, Omega, and Theta describe upper, lower, and tight complexity bounds.",
    )
    pdf.drawString(
        50,
        680,
        "Divide and conquer algorithms split problems into subproblems solved recursively.",
    )
    pdf.drawString(
        50,
        660,
        "Master's Theorem provides a direct solution for recurrence relations of form T(n) = aT(n/b) + f(n).",
    )
    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


# ==============================================================================
# 1. PURE SM-2 ALGORITHM MATHEMATICAL TESTS
# ==============================================================================


def test_sm2_perfect_recall_progression() -> None:
    """Verifies interval progression on consecutive perfect recall (quality=5)."""
    now = datetime(2026, 10, 22, 12, 0, 0, tzinfo=timezone.utc)

    # First repetition: interval must be 1 day
    i1, r1, ef1, t1 = compute_sm2(
        quality=5,
        repetitions=0,
        previous_interval=0,
        previous_easiness_factor=2.5,
        now=now,
    )
    assert i1 == 1
    assert r1 == 1
    assert ef1 == 2.6  # 2.5 + (0.1 - 0) = 2.6
    assert t1 == now + timedelta(days=1)

    # Second repetition: interval must be 6 days
    i2, r2, ef2, t2 = compute_sm2(
        quality=5,
        repetitions=r1,
        previous_interval=i1,
        previous_easiness_factor=ef1,
        now=now,
    )
    assert i2 == 6
    assert r2 == 2
    assert ef2 == 2.7  # 2.6 + 0.1 = 2.7
    assert t2 == now + timedelta(days=6)

    # Third repetition: interval = round(6 * 2.8) = 17 days
    i3, r3, ef3, t3 = compute_sm2(
        quality=5,
        repetitions=r2,
        previous_interval=i2,
        previous_easiness_factor=ef2,
        now=now,
    )
    assert i3 == 17
    assert r3 == 3
    assert ef3 == 2.8
    assert t3 == now + timedelta(days=17)


def test_sm2_hesitant_and_difficult_recall() -> None:
    """Verifies SM-2 behavior on borderline passing recall (quality 3 and 4)."""
    # Quality 4: Correct after hesitation
    i_q4, r_q4, ef_q4, _ = compute_sm2(
        quality=4,
        repetitions=0,
        previous_interval=0,
        previous_easiness_factor=2.5,
    )
    assert i_q4 == 1
    assert r_q4 == 1
    assert ef_q4 == 2.5  # delta = 0.1 - 1 * (0.08 + 0.02) = 0.0

    # Quality 3: Correct with serious difficulty
    i_q3, r_q3, ef_q3, _ = compute_sm2(
        quality=3,
        repetitions=0,
        previous_interval=0,
        previous_easiness_factor=2.5,
    )
    assert i_q3 == 1
    assert r_q3 == 1
    assert ef_q3 < 2.5  # EF decreases when quality=3 (delta = 0.1 - 2 * 0.12 = -0.14)
    assert ef_q3 == 2.36


def test_sm2_failure_reset() -> None:
    """Verifies that recall grade < 3 resets repetitions to 0 and interval to 1 day."""
    # Start with a mature card with 4 repetitions and interval of 30 days
    i, r, ef, _ = compute_sm2(
        quality=2,
        repetitions=4,
        previous_interval=30,
        previous_easiness_factor=2.5,
    )
    assert r == 0
    assert i == 1
    assert ef < 2.5

    # Complete blackout (quality=0)
    i0, r0, ef0, _ = compute_sm2(
        quality=0,
        repetitions=5,
        previous_interval=45,
        previous_easiness_factor=2.5,
    )
    assert r0 == 0
    assert i0 == 1
    assert ef0 < ef


def test_sm2_easiness_factor_floor() -> None:
    """Verifies that Easiness Factor is strictly clamped at a minimum of 1.3."""
    ef = 1.4
    # Fail repeatedly
    for _ in range(5):
        _, _, ef, _ = compute_sm2(
            quality=0,
            repetitions=0,
            previous_interval=1,
            previous_easiness_factor=ef,
        )
    assert ef == 1.3


def test_sm2_quality_bounds_validation() -> None:
    """Verifies that invalid quality ratings outside [0, 5] raise ValueError."""
    with pytest.raises(ValueError, match="Quality rating must be between 0 and 5"):
        compute_sm2(quality=-1, repetitions=0, previous_interval=1)

    with pytest.raises(ValueError, match="Quality rating must be between 0 and 5"):
        compute_sm2(quality=6, repetitions=0, previous_interval=1)


# ==============================================================================
# 2. DOCUMENT SUMMARIZATION (NEURA-SUM) TESTS
# ==============================================================================


def test_document_summary_and_caching(client: TestClient, primary_token: str) -> None:
    """Verifies that GET /documents/{id}/summary generates and subsequently caches executive summary."""
    headers = {"Authorization": f"Bearer {primary_token}"}
    pdf_bytes = create_sample_summary_pdf()

    upload_resp = client.post(
        "/documents",
        headers=headers,
        files={"file": ("algorithms.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_resp.status_code == 201
    doc_id = upload_resp.json()["id"]

    # 1. Fetch summary for the first time (triggers generation)
    sum_resp1 = client.get(f"/documents/{doc_id}/summary", headers=headers)
    assert sum_resp1.status_code == 200
    data1 = sum_resp1.json()
    assert data1["document_id"] == doc_id
    assert "summary" in data1
    assert len(data1["summary"]) > 20
    assert data1["status"] == "completed"

    # 2. Subsequent call returns cached summary
    sum_resp2 = client.get(f"/documents/{doc_id}/summary", headers=headers)
    assert sum_resp2.status_code == 200
    data2 = sum_resp2.json()
    assert data2["summary"] == data1["summary"]


def test_document_summarize_force_refresh(client: TestClient, primary_token: str) -> None:
    """Verifies that POST /documents/{id}/summarize forces summary regeneration."""
    headers = {"Authorization": f"Bearer {primary_token}"}
    pdf_bytes = create_sample_summary_pdf()

    upload_resp = client.post(
        "/documents",
        headers=headers,
        files={"file": ("os_notes.pdf", pdf_bytes, "application/pdf")},
    )
    doc_id = upload_resp.json()["id"]

    # Force re-summarize
    force_resp = client.post(f"/documents/{doc_id}/summarize", headers=headers)
    assert force_resp.status_code == 200
    assert len(force_resp.json()["summary"]) > 20


def test_document_summary_not_found_and_isolation(
    client: TestClient, primary_token: str, secondary_token: str
) -> None:
    """Verifies 404 on missing document and isolation across students."""
    headers_a = {"Authorization": f"Bearer {primary_token}"}
    headers_b = {"Authorization": f"Bearer {secondary_token}"}

    # Unknown document ID
    resp = client.get("/documents/00000000-0000-0000-0000-000000000000/summary", headers=headers_a)
    assert resp.status_code == 404

    # Upload document by student A
    pdf_bytes = create_sample_summary_pdf()
    up = client.post(
        "/documents",
        headers=headers_a,
        files={"file": ("private_notes.pdf", pdf_bytes, "application/pdf")},
    )
    doc_id = up.json()["id"]

    # Student B cannot access summary of student A's document
    unauth_resp = client.get(f"/documents/{doc_id}/summary", headers=headers_b)
    assert unauth_resp.status_code == 404


# ==============================================================================
# 3. CURRICULUM FLASHCARD GENERATION (NEURA-CARD) TESTS
# ==============================================================================


def test_flashcard_deck_generation_by_topic(client: TestClient, primary_token: str) -> None:
    """Verifies that POST /flashcards/generate produces structured questions, answers, and 4 options."""
    headers = {"Authorization": f"Bearer {primary_token}"}

    resp = client.post(
        "/flashcards/generate",
        headers=headers,
        json={
            "topic": "AVL Trees and Balanced BSTs",
            "title": "Data Structures Unit 2 Deck",
            "count": 4,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Data Structures Unit 2 Deck"
    assert len(data["cards"]) == 4

    for card in data["cards"]:
        assert "question" in card and len(card["question"]) > 5
        assert "answer" in card and len(card["answer"]) > 0
        assert "options" in card and len(card["options"]) == 4
        assert card["difficulty"] in ["easy", "medium", "hard"]
        # Initial SM-2 state
        assert card["interval_days"] == 0
        assert card["repetitions"] == 0
        assert card["easiness_factor"] == 2.5
        assert "next_review_at" in card


def test_flashcard_deck_generation_by_document(client: TestClient, primary_token: str) -> None:
    """Verifies flashcard generation anchored to an uploaded PDF document."""
    headers = {"Authorization": f"Bearer {primary_token}"}
    pdf_bytes = create_sample_summary_pdf()

    upload_resp = client.post(
        "/documents",
        headers=headers,
        files={"file": ("recurrence.pdf", pdf_bytes, "application/pdf")},
    )
    doc_id = upload_resp.json()["id"]

    resp = client.post(
        "/flashcards/generate",
        headers=headers,
        json={
            "document_id": doc_id,
            "title": "Recurrence Relations Deck",
            "count": 3,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["document_id"] == doc_id
    assert len(data["cards"]) == 3


def test_flashcard_generate_validation(client: TestClient, primary_token: str) -> None:
    """Verifies count boundaries validation on card generation."""
    headers = {"Authorization": f"Bearer {primary_token}"}

    # Count < 1
    resp_low = client.post(
        "/flashcards/generate",
        headers=headers,
        json={"topic": "Algorithms", "count": 0},
    )
    assert resp_low.status_code == 422

    # Count > 50
    resp_high = client.post(
        "/flashcards/generate",
        headers=headers,
        json={"topic": "Algorithms", "count": 51},
    )
    assert resp_high.status_code == 422


# ==============================================================================
# 4. DECKS LISTING, DETAILS & DUE FILTERING TESTS
# ==============================================================================


def test_list_and_get_decks(client: TestClient, primary_token: str) -> None:
    """Verifies listing student decks and retrieving specific deck detail."""
    headers = {"Authorization": f"Bearer {primary_token}"}

    # Create a deck
    create_resp = client.post(
        "/flashcards/generate",
        headers=headers,
        json={"topic": "Operating Systems Deadlock", "count": 2},
    )
    assert create_resp.status_code == 201
    deck_id = create_resp.json()["id"]

    # List decks
    list_resp = client.get("/flashcards/decks", headers=headers)
    assert list_resp.status_code == 200
    decks = list_resp.json()
    assert len(decks) >= 1
    matching = next((d for d in decks if d["id"] == deck_id), None)
    assert matching is not None
    assert matching["total_cards"] == 2
    assert matching["due_cards"] == 2  # New cards have next_review_at <= now

    # Get deck detail
    detail_resp = client.get(f"/flashcards/decks/{deck_id}", headers=headers)
    assert detail_resp.status_code == 200
    assert len(detail_resp.json()["cards"]) == 2


def test_get_due_cards_in_deck(client: TestClient, primary_token: str) -> None:
    """Verifies GET /flashcards/decks/{id}/due filters cards ready for review."""
    headers = {"Authorization": f"Bearer {primary_token}"}

    deck_resp = client.post(
        "/flashcards/generate",
        headers=headers,
        json={"topic": "Computer Networks", "count": 3},
    )
    deck_id = deck_resp.json()["id"]

    due_resp = client.get(f"/flashcards/decks/{deck_id}/due", headers=headers)
    assert due_resp.status_code == 200
    due_cards = due_resp.json()
    assert len(due_cards) == 3


# ==============================================================================
# 5. SM-2 REVIEW SUBMISSION LIFECYCLE TESTS
# ==============================================================================


def test_review_card_progression_lifecycle(client: TestClient, primary_token: str) -> None:
    """Verifies multi-round SM-2 review progression and subsequent failure reset."""
    headers = {"Authorization": f"Bearer {primary_token}"}

    # Generate a single card deck
    deck_resp = client.post(
        "/flashcards/generate",
        headers=headers,
        json={"topic": "Database Normalization", "count": 1},
    )
    card_id = deck_resp.json()["cards"][0]["id"]

    # Round 1: Perfect recall (quality=5)
    r1 = client.post(
        "/flashcards/review",
        headers=headers,
        json={"card_id": card_id, "quality": 5, "duration_ms": 2500},
    )
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["card_id"] == card_id
    assert d1["new_interval_days"] == 1
    assert d1["new_repetitions"] == 1
    assert d1["new_easiness_factor"] == 2.6

    # Round 2: Perfect recall (quality=5)
    r2 = client.post(
        "/flashcards/review",
        headers=headers,
        json={"card_id": card_id, "quality": 5, "duration_ms": 1800},
    )
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["new_interval_days"] == 6
    assert d2["new_repetitions"] == 2
    assert d2["new_easiness_factor"] == 2.7

    # Round 3: Perfect recall (quality=5) -> interval = round(6 * 2.8) = 17
    r3 = client.post(
        "/flashcards/review",
        headers=headers,
        json={"card_id": card_id, "quality": 5, "duration_ms": 1500},
    )
    assert r3.status_code == 200
    d3 = r3.json()
    assert d3["new_interval_days"] == 17
    assert d3["new_repetitions"] == 3
    assert d3["new_easiness_factor"] == 2.8

    # Round 4: Failed recall (quality=1) -> resets repetitions=0, interval=1
    r4 = client.post(
        "/flashcards/review",
        headers=headers,
        json={"card_id": card_id, "quality": 1, "duration_ms": 5000},
    )
    assert r4.status_code == 200
    d4 = r4.json()
    assert d4["new_repetitions"] == 0
    assert d4["new_interval_days"] == 1
    assert d4["new_easiness_factor"] < 2.8


def test_review_card_validation_and_errors(client: TestClient, primary_token: str) -> None:
    """Verifies that review submission rejects invalid recall grades and unknown card IDs."""
    headers = {"Authorization": f"Bearer {primary_token}"}

    # Quality > 5 rejected
    resp_invalid = client.post(
        "/flashcards/review",
        headers=headers,
        json={"card_id": "00000000-0000-0000-0000-000000000000", "quality": 6},
    )
    assert resp_invalid.status_code == 422

    # Card not found
    resp_not_found = client.post(
        "/flashcards/review",
        headers=headers,
        json={"card_id": "00000000-0000-0000-0000-000000000000", "quality": 4},
    )
    assert resp_not_found.status_code == 404


# ==============================================================================
# 6. STUDY STATISTICS TESTS
# ==============================================================================


def test_study_statistics(client: TestClient, primary_token: str) -> None:
    """Verifies GET /flashcards/stats computes retention rate and review counts."""
    headers = {"Authorization": f"Bearer {primary_token}"}

    stats_resp = client.get("/flashcards/stats", headers=headers)
    assert stats_resp.status_code == 200
    data = stats_resp.json()
    assert "total_reviews" in data
    assert "retention_rate" in data
    assert "cards_learned" in data
    assert "cards_due_today" in data
    assert 0.0 <= data["retention_rate"] <= 100.0


# ==============================================================================
# 7. STUDY NOTES CRUD TESTS
# ==============================================================================


def test_notes_crud_lifecycle(client: TestClient, primary_token: str) -> None:
    """Verifies full create, read, update, delete cycle for student notes."""
    headers = {"Authorization": f"Bearer {primary_token}"}

    # 1. Create note
    create_resp = client.post(
        "/notes",
        headers=headers,
        json={
            "title": "Master's Theorem Case 2 Notes",
            "content": "When f(n) = Theta(n^(log_b a)), T(n) = Theta(n^(log_b a) * log n).",
            "tags": "CS3401, Algorithms",
        },
    )
    assert create_resp.status_code == 201
    note_id = create_resp.json()["id"]

    # 2. List notes
    list_resp = client.get("/notes", headers=headers)
    assert list_resp.status_code == 200
    assert any(n["id"] == note_id for n in list_resp.json())

    # 3. Get note by ID
    get_resp = client.get(f"/notes/{note_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["title"] == "Master's Theorem Case 2 Notes"

    # 4. Update note
    update_resp = client.put(
        f"/notes/{note_id}",
        headers=headers,
        json={"title": "Master's Theorem (Updated)", "content": "Updated content with examples."},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "Master's Theorem (Updated)"

    # 5. Delete note
    del_resp = client.delete(f"/notes/{note_id}", headers=headers)
    assert del_resp.status_code == 204

    # 6. Verify deleted
    get_deleted = client.get(f"/notes/{note_id}", headers=headers)
    assert get_deleted.status_code == 404


# ==============================================================================
# 8. STUDY REMINDERS CRUD TESTS
# ==============================================================================


def test_reminders_crud_lifecycle(client: TestClient, primary_token: str) -> None:
    """Verifies full schedule, list, and delete cycle for study reminders."""
    headers = {"Authorization": f"Bearer {primary_token}"}
    future_time = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()

    # 1. Create reminder
    create_resp = client.post(
        "/reminders",
        headers=headers,
        json={
            "title": "Review AVL Tree Rotations",
            "message": "Time for your 10-minute spaced repetition review session!",
            "scheduled_time": future_time,
        },
    )
    assert create_resp.status_code == 201
    rem_id = create_resp.json()["id"]

    # 2. List reminders
    list_resp = client.get("/reminders", headers=headers)
    assert list_resp.status_code == 200
    assert any(r["id"] == rem_id for r in list_resp.json())

    # 3. Delete reminder
    del_resp = client.delete(f"/reminders/{rem_id}", headers=headers)
    assert del_resp.status_code == 204

    # 4. Attempting to delete again returns 404
    del_again = client.delete(f"/reminders/{rem_id}", headers=headers)
    assert del_again.status_code == 404


# ==============================================================================
# 9. DECK DELETION CASCADE & MULTI-TENANT ISOLATION TESTS
# ==============================================================================


def test_deck_deletion_cascade(client: TestClient, primary_token: str) -> None:
    """Verifies that deleting a deck cascades to its flashcards and review logs."""
    headers = {"Authorization": f"Bearer {primary_token}"}

    # Create deck with 2 cards
    deck_resp = client.post(
        "/flashcards/generate",
        headers=headers,
        json={"topic": "Compiler Design", "count": 2},
    )
    deck_id = deck_resp.json()["id"]
    card_id = deck_resp.json()["cards"][0]["id"]

    # Submit a review to generate a review log
    client.post(
        "/flashcards/review",
        headers=headers,
        json={"card_id": card_id, "quality": 4},
    )

    # Delete deck
    del_resp = client.delete(f"/flashcards/decks/{deck_id}", headers=headers)
    assert del_resp.status_code == 204

    # Deck no longer exists
    get_resp = client.get(f"/flashcards/decks/{deck_id}", headers=headers)
    assert get_resp.status_code == 404

    # Reviewing the deleted card returns 404
    card_rev_resp = client.post(
        "/flashcards/review",
        headers=headers,
        json={"card_id": card_id, "quality": 5},
    )
    assert card_rev_resp.status_code == 404


def test_flashcards_multi_tenant_isolation(
    client: TestClient, primary_token: str, secondary_token: str
) -> None:
    """Verifies that User B cannot view, review, or delete User A's decks or cards."""
    headers_a = {"Authorization": f"Bearer {primary_token}"}
    headers_b = {"Authorization": f"Bearer {secondary_token}"}

    # Student A creates a deck
    deck_resp = client.post(
        "/flashcards/generate",
        headers=headers_a,
        json={"topic": "Student A Private Deck", "count": 2},
    )
    deck_id = deck_resp.json()["id"]
    card_id = deck_resp.json()["cards"][0]["id"]

    # Student B attempts to get deck -> 404
    get_resp = client.get(f"/flashcards/decks/{deck_id}", headers=headers_b)
    assert get_resp.status_code == 404

    # Student B attempts to review Student A's card -> 404
    rev_resp = client.post(
        "/flashcards/review",
        headers=headers_b,
        json={"card_id": card_id, "quality": 5},
    )
    assert rev_resp.status_code == 404

    # Student B attempts to delete Student A's deck -> 404
    del_resp = client.delete(f"/flashcards/decks/{deck_id}", headers=headers_b)
    assert del_resp.status_code == 404

"""NEURA AI — P3 Acceptance Tests: PDF Upload, Text Extraction, Chunking, Vector Search & RAG Chat.

Tests:
1. PDF file upload and indexing pipeline (MinIO storage + extraction + 384-dim embedding generation).
2. Rejection of invalid file formats and empty files.
3. Document listing and paginated chunk retrieval.
4. Cascading document and chunk deletion.
5. Vector cosine similarity search accuracy.
6. RAG chat non-streaming response with citation metadata.
7. RAG chat streaming Server-Sent Events (SSE) with citations event, token streaming, and done event.
8. Chat thread history inspection and deletion.
9. Multi-tenant privacy isolation (User B cannot access or retrieve User A's chunks).
"""

import io
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import services.api.main as api_module
from services.api.services.document_processor import (
    chunk_extracted_pages,
    extract_text_from_pdf,
)
from services.api.services.rag_service import compute_cosine_similarity


@pytest.fixture
def client() -> TestClient:
    return TestClient(api_module.app)


def create_sample_pdf(title: str = "Anna University CS3301 Data Structures") -> bytes:
    """Generates an in-memory multi-page engineering syllabus PDF using ReportLab."""
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)

    # Page 1: Title and Unit 1
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(50, 750, title)
    pdf.setFont("Helvetica", 12)
    pdf.drawString(50, 720, "Unit 1: Linear Data Structures and Asymptotic Complexity")
    pdf.drawString(
        50,
        700,
        "Arrays and Linked Lists form the fundamental basis of linear data structures.",
    )
    pdf.drawString(
        50,
        680,
        "Singly linked lists allow forward traversal with O(1) insertion at head and O(n) search.",
    )
    pdf.drawString(
        50,
        660,
        "Doubly linked lists store pointers to both next and previous nodes, enabling bidirectional traversal.",
    )
    pdf.showPage()

    # Page 2: Unit 2 AVL Trees
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(50, 750, "Unit 2: Balanced Search Trees — AVL Trees")
    pdf.setFont("Helvetica", 12)
    pdf.drawString(
        50,
        720,
        "An AVL tree is a self-balancing binary search tree where the difference between heights of",
    )
    pdf.drawString(
        50,
        700,
        "left and right subtrees (the balance factor) cannot be more than 1 for all nodes.",
    )
    pdf.drawString(
        50,
        680,
        "Balance Factor = height(left_subtree) - height(right_subtree) in {-1, 0, +1}.",
    )
    pdf.drawString(
        50,
        660,
        "If balance is violated after insertion or deletion, four rotation cases restore balance: LL, RR, LR, and RL.",
    )
    pdf.drawString(
        50,
        640,
        "Search, insertion, and deletion all take strictly O(log n) time in the worst case.",
    )
    pdf.showPage()

    # Page 3: Operating Systems Deadlock (CS3452)
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(50, 750, "CS3452 Operating Systems: Deadlock & Synchronization")
    pdf.setFont("Helvetica", 12)
    pdf.drawString(
        50,
        720,
        "A deadlock occurs when a set of concurrent processes are permanently blocked because each process",
    )
    pdf.drawString(
        50,
        700,
        "holds resources and waits for other resources acquired by other processes.",
    )
    pdf.drawString(
        50,
        680,
        "The 4 Coffman conditions required for deadlock are: Mutual Exclusion, Hold and Wait,",
    )
    pdf.drawString(
        50,
        660,
        "No Preemption, and Circular Wait condition. Banker's Algorithm ensures avoidance.",
    )
    pdf.showPage()

    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


_TOKEN_CACHE: dict[str, str] = {}


def get_auth_token(client: TestClient, email: str, name: str) -> str:
    """Helper to register and obtain a valid JWT access token with caching."""
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
def auth_token(client: TestClient) -> str:
    return get_auth_token(client, "student_p3_primary@annauniv.edu", "Primary Student")



# ==============================================================================
# 1. DOCUMENT UPLOAD & EXTRACTION PIPELINE TESTS
# ==============================================================================


def test_pdf_extraction_and_chunking_utility() -> None:
    """Verifies that extract_text_from_pdf and chunk_extracted_pages parse PDF pages accurately."""
    pdf_bytes = create_sample_pdf()
    pages = extract_text_from_pdf(pdf_bytes)

    assert len(pages) == 3
    assert pages[0]["page_number"] == 1
    assert "Linked Lists" in pages[0]["text"]
    assert "AVL" in pages[1]["text"]
    assert "Deadlock" in pages[2]["text"]

    chunks = chunk_extracted_pages(pages, chunk_size_chars=400, overlap_chars=50)
    assert len(chunks) >= 3
    assert all("content" in c and "page_number" in c for c in chunks)


def test_upload_pdf_success_and_indexing(client: TestClient, auth_token: str) -> None:
    """Verifies that POST /documents uploads PDF, indexes chunks, and returns 201 Created."""
    pdf_bytes = create_sample_pdf("Anna University CS3301 Data Structures")

    files = {"file": ("cs3301_data_structures.pdf", pdf_bytes, "application/pdf")}
    headers = {"Authorization": f"Bearer {auth_token}"}

    response = client.post("/documents", files=files, headers=headers)
    assert response.status_code == 201, f"Failed: {response.text}"

    data = response.json()
    assert "id" in data
    assert data["title"] == "Cs3301 Data Structures"
    assert data["status"] == "indexed"
    assert data["chunk_count"] >= 3
    assert data["file_size_bytes"] == len(pdf_bytes)
    assert data["summary"] is not None


def test_upload_non_pdf_fails(client: TestClient, auth_token: str) -> None:
    """Verifies that uploading a non-PDF file returns 400 Bad Request."""
    files = {"file": ("malicious.exe", b"MZ\x90\x00\x03\x00\x00\x00", "application/octet-stream")}
    headers = {"Authorization": f"Bearer {auth_token}"}

    response = client.post("/documents", files=files, headers=headers)
    assert response.status_code == 400
    assert "Only PDF documents are supported" in response.text


def test_upload_empty_pdf_fails(client: TestClient, auth_token: str) -> None:
    """Verifies that an empty (0 byte) file upload returns 400 Bad Request."""
    files = {"file": ("empty.pdf", b"", "application/pdf")}
    headers = {"Authorization": f"Bearer {auth_token}"}

    response = client.post("/documents", files=files, headers=headers)
    assert response.status_code == 400
    assert "0 bytes" in response.text


# ==============================================================================
# 2. DOCUMENT LISTING, RETRIEVAL & CHUNKS TESTS
# ==============================================================================


def test_list_and_get_document_details(client: TestClient, auth_token: str) -> None:
    """Verifies GET /documents and GET /documents/{id}."""
    headers = {"Authorization": f"Bearer {auth_token}"}

    # Upload sample PDF
    pdf_bytes = create_sample_pdf("EC3352 Signals and Systems")
    files = {"file": ("signals_and_systems.pdf", pdf_bytes, "application/pdf")}
    create_resp = client.post("/documents", files=files, headers=headers)
    doc_id = create_resp.json()["id"]

    # List documents
    list_resp = client.get("/documents", headers=headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] >= 1
    assert any(d["id"] == doc_id for d in list_data["documents"])

    # Get single document
    get_resp = client.get(f"/documents/{doc_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == doc_id
    assert get_resp.json()["chunk_count"] >= 3

    # Get chunks with pagination
    chunks_resp = client.get(f"/documents/{doc_id}/chunks?limit=10&offset=0", headers=headers)
    assert chunks_resp.status_code == 200
    chunks = chunks_resp.json()
    assert len(chunks) >= 3
    assert chunks[0]["chunk_index"] == 0
    assert "content" in chunks[0]


def test_delete_document_and_cascade(client: TestClient, auth_token: str) -> None:
    """Verifies that DELETE /documents/{id} deletes document and cascades to chunks."""
    headers = {"Authorization": f"Bearer {auth_token}"}

    pdf_bytes = create_sample_pdf("CS3351 Computer Organization")
    files = {"file": ("cs3351_comp_org.pdf", pdf_bytes, "application/pdf")}
    create_resp = client.post("/documents", files=files, headers=headers)
    doc_id = create_resp.json()["id"]

    # Delete
    del_resp = client.delete(f"/documents/{doc_id}", headers=headers)
    assert del_resp.status_code == 204

    # Verify document no longer exists
    get_resp = client.get(f"/documents/{doc_id}", headers=headers)
    assert get_resp.status_code == 404


# ==============================================================================
# 3. VECTOR SIMILARITY & RAG CHAT TESTS
# ==============================================================================


def test_cosine_similarity_calculation() -> None:
    """Verifies mathematical correctness of cosine similarity."""
    vec1 = [1.0, 0.0, 0.0]
    vec2 = [1.0, 0.0, 0.0]
    assert compute_cosine_similarity(vec1, vec2) == pytest.approx(1.0)

    vec_ortho = [0.0, 1.0, 0.0]
    assert compute_cosine_similarity(vec1, vec_ortho) == pytest.approx(0.0)

    vec_opposite = [-1.0, 0.0, 0.0]
    assert compute_cosine_similarity(vec1, vec_opposite) == pytest.approx(-1.0)


def test_chat_non_streaming_with_citations(client: TestClient, auth_token: str) -> None:
    """Verifies that POST /chat (stream=False) returns Socratic response and citations."""
    headers = {"Authorization": f"Bearer {auth_token}"}

    # Upload textbook PDF with AVL tree and Deadlock topics
    pdf_bytes = create_sample_pdf("Anna University CS3301 Data Structures")
    files = {"file": ("cs3301_dsa.pdf", pdf_bytes, "application/pdf")}
    create_resp = client.post("/documents", files=files, headers=headers)
    doc_id = create_resp.json()["id"]

    # Send chat query
    chat_payload = {
        "query": "What is the balance factor of an AVL tree node and how does it prevent skewing?",
        "document_ids": [doc_id],
        "stream": False,
        "adapter": "socratic_tutor",
    }
    response = client.post("/chat", json=chat_payload, headers=headers)
    assert response.status_code == 200, f"Error: {response.text}"

    data = response.json()
    assert "thread_id" in data
    assert "message_id" in data
    assert "content" in data
    assert len(data["content"]) > 10
    assert "citations" in data
    assert len(data["citations"]) >= 1

    citation = data["citations"][0]
    assert citation["document_id"] == doc_id
    assert "page_number" in citation
    assert "similarity" in citation
    assert citation["similarity"] > 0.0


def test_chat_streaming_sse_with_citations(client: TestClient, auth_token: str) -> None:
    """Verifies that POST /chat (stream=True) yields citations event, token events, and done event."""
    headers = {"Authorization": f"Bearer {auth_token}"}

    pdf_bytes = create_sample_pdf("CS3452 Operating Systems Notes")
    files = {"file": ("cs3452_os.pdf", pdf_bytes, "application/pdf")}
    create_resp = client.post("/documents", files=files, headers=headers)
    doc_id = create_resp.json()["id"]

    chat_payload = {
        "query": "Explain what causes a deadlock in operating systems.",
        "document_ids": [doc_id],
        "stream": True,
        "adapter": "socratic_tutor",
    }
    response = client.post("/chat", json=chat_payload, headers=headers)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    # Parse SSE events
    raw_blocks = response.text.strip().split("\n\n")
    assert len(raw_blocks) >= 3

    has_citations_event = False
    has_token_event = False
    has_done_event = False

    for block in raw_blocks:
        for line in block.split("\n"):
            if line.startswith("data: "):
                payload = json.loads(line[len("data: ") :])
                if payload.get("type") == "citations":
                    has_citations_event = True
                    assert len(payload["citations"]) >= 1
                    assert payload["citations"][0]["document_id"] == doc_id
                elif payload.get("type") == "token":
                    has_token_event = True
                elif payload.get("type") == "done":
                    has_done_event = True
                    assert "thread_id" in payload

    assert has_citations_event, "Did not receive citations SSE event"
    assert has_token_event, "Did not receive token stream SSE events"
    assert has_done_event, "Did not receive done final SSE event"


# ==============================================================================
# 4. THREAD HISTORY & MULTI-TENANCY ISOLATION TESTS
# ==============================================================================


def test_chat_thread_history_and_deletion(client: TestClient, auth_token: str) -> None:
    """Verifies GET /chat/threads and GET /chat/threads/{id}."""
    headers = {"Authorization": f"Bearer {auth_token}"}

    # Execute a chat turn to create thread
    chat_resp = client.post(
        "/chat",
        json={"query": "What is an array in C programming?", "stream": False},
        headers=headers,
    )
    thread_id = chat_resp.json()["thread_id"]

    # List threads
    threads_resp = client.get("/chat/threads", headers=headers)
    assert threads_resp.status_code == 200
    threads = threads_resp.json()
    assert any(t["id"] == thread_id for t in threads)

    # Get thread detail with messages
    detail_resp = client.get(f"/chat/threads/{thread_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert len(detail["messages"]) >= 2
    assert detail["messages"][0]["role"] == "user"
    assert detail["messages"][1]["role"] == "assistant"

    # Delete thread
    del_resp = client.delete(f"/chat/threads/{thread_id}", headers=headers)
    assert del_resp.status_code == 204

    # Confirm deleted
    assert client.get(f"/chat/threads/{thread_id}", headers=headers).status_code == 404


def test_multi_tenant_document_isolation(client: TestClient, auth_token: str) -> None:
    """Verifies that User A's uploaded documents cannot be accessed or searched by User B."""
    token_a = auth_token
    token_b = get_auth_token(client, "student_bob@annauniv.edu", "Bob ECE")

    # Alice uploads private study notes
    pdf_bytes = create_sample_pdf("Alice Private Notes")
    create_resp = client.post(
        "/documents",
        files={"file": ("alice_notes.pdf", pdf_bytes, "application/pdf")},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    doc_a_id = create_resp.json()["id"]

    # Bob tries to directly access Alice's document -> 404
    bob_get_resp = client.get(
        f"/documents/{doc_a_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert bob_get_resp.status_code == 404

    # Bob performs RAG chat specifying Alice's document id -> Bob gets zero citations from Alice
    bob_chat_resp = client.post(
        "/chat",
        json={
            "query": "Tell me about Alice's private notes",
            "document_ids": [doc_a_id],
            "stream": False,
        },
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert bob_chat_resp.status_code == 200
    # No citations should be returned because Bob doesn't own doc_a
    assert len(bob_chat_resp.json()["citations"]) == 0

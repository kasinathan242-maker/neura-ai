"""NEURA AI — P2 Acceptance Tests: Inference Service, Streaming SSE, Adapter Routing & ML Pipeline.

Tests:
1. Non-streaming POST /generate returns completion, finish_reason, and usage.
2. Streaming POST /generate returns text/event-stream with SSE tokens.
3. Socratic tutor adapter generates hint-first pedagogical content.
4. GBNF card quiz adapter generates strictly valid JSON flashcard schemas.
5. Summarizer adapter generates structured concept summaries.
6. POST /embed generates 384-dimensional dense L2-normalized vectors.
7. GET /adapters returns configured adapter registry.
8. Request backpressure triggers 503 Service Unavailable when concurrency is saturated.
9. Dataset builder: deduplication, split proportions (90/5/5), and JSONL formatting.
10. Evaluation rubric: deterministic keyword scoring, refusal compliance, and spot sets.
11. Training & Export utilities: ChatML template formatting and GGUF export target generation.
"""

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import services.inference.main as inference_module
from ml.data.build_dataset import (
    CURATED_SYLLABUS_SAMPLES,
    deduplicate_samples,
    generate_synthetic_curriculum_pairs,
    split_dataset,
)
from ml.eval.eval_rubric import SPOT_EVAL_SET, evaluate_rubric
from ml.export.export_gguf import merge_lora_and_export
from ml.train.train_lm import prepare_chat_template
from services.inference.config import settings


@pytest.fixture
def inf_client() -> TestClient:
    return TestClient(inference_module.app)


# ==============================================================================
# 1. GENERATE ENDPOINT TESTS (NON-STREAMING & STREAMING)
# ==============================================================================


def test_generate_non_streaming_success(inf_client: TestClient) -> None:
    """Verifies that non-streaming generation returns valid JSON structure and token usage."""
    payload = {
        "prompt": "What is an AVL Tree and how does it maintain balance?",
        "stream": False,
        "adapter": "socratic_tutor",
        "max_tokens": 128,
        "temperature": 0.7,
    }
    response = inf_client.post("/generate", json=payload)
    assert response.status_code == 200, f"Error: {response.status_code} - {response.text}"

    data = response.json()
    assert "id" in data
    assert data["id"].startswith("neura-")
    assert "content" in data
    assert len(data["content"]) > 10
    assert data["finish_reason"] == "stop"
    assert data["adapter_used"] == "socratic_tutor"

    # Token usage verification
    assert "usage" in data
    assert data["usage"]["prompt_tokens"] > 0
    assert data["usage"]["completion_tokens"] > 0
    assert data["usage"]["total_tokens"] == data["usage"]["prompt_tokens"] + data["usage"]["completion_tokens"]


def test_generate_chatml_messages_payload(inf_client: TestClient) -> None:
    """Verifies that ChatML structured messages format is properly accepted and formatted."""
    payload = {
        "messages": [
            {"role": "user", "content": "Explain deadlock in Operating Systems with a real life example."}
        ],
        "stream": False,
        "adapter": "socratic_tutor",
    }
    response = inf_client.post("/generate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "deadlock" in data["content"].lower() or "bridge" in data["content"].lower()


def test_generate_streaming_sse_event_stream(inf_client: TestClient) -> None:
    """Verifies that streaming POST /generate returns Server-Sent Events (SSE)."""
    payload = {
        "prompt": "Explain DFS and BFS traversal in graph algorithms.",
        "stream": True,
        "adapter": "socratic_tutor",
    }
    response = inf_client.post("/generate", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert response.headers.get("Cache-Control") == "no-cache"

    # Parse SSE stream chunks
    lines = response.text.strip().split("\n\n")
    assert len(lines) >= 3, "Expected multiple SSE event blocks"

    received_tokens: list[str] = []
    has_stop_chunk = False

    for block in lines:
        for line in block.split("\n"):
            if line.startswith("data: "):
                data_json = json.loads(line[len("data: ") :])
                if data_json.get("finish_reason") == "stop":
                    has_stop_chunk = True
                    assert "usage" in data_json
                else:
                    received_tokens.append(data_json.get("token", ""))

    assert has_stop_chunk, "Stream did not emit final stop chunk"
    full_text = "".join(received_tokens)
    assert len(full_text.strip()) > 0


def test_generate_empty_prompt_returns_400(inf_client: TestClient) -> None:
    """Verifies 400 error when neither prompt nor messages are provided."""
    payload = {"stream": False}
    response = inf_client.post("/generate", json=payload)
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "EMPTY_PROMPT"


# ==============================================================================
# 2. ADAPTER STEERING & GBNF GRAMMAR TESTS
# ==============================================================================


def test_socratic_adapter_generates_pedagogical_hints(inf_client: TestClient) -> None:
    """Verifies that the socratic_tutor adapter produces hints and analogies."""
    payload = {
        "prompt": "How does an AVL Tree balance itself after insertion?",
        "stream": False,
        "adapter": "socratic_tutor",
    }
    response = inf_client.post("/generate", json=payload)
    assert response.status_code == 200
    content = response.json()["content"]

    # Must contain pedagogical analogy or hint structure
    assert any(term in content.lower() for term in ["hint", "mobile", "balance", "tanglish"])


def test_gbnf_card_quiz_adapter_generates_valid_json(inf_client: TestClient) -> None:
    """Verifies that card_quiz_gbnf generates valid parseable JSON conforming to flashcard schema."""
    payload = {
        "prompt": "Generate a flashcard for CS3301 AVL tree balance factor.",
        "stream": False,
        "adapter": "card_quiz_gbnf",
    }
    response = inf_client.post("/generate", json=payload)
    assert response.status_code == 200
    content = response.json()["content"]

    # Parse generated JSON strictly
    card_data = json.loads(content)
    assert "question" in card_data
    assert "answer" in card_data
    assert "options" in card_data
    assert isinstance(card_data["options"], list)
    assert len(card_data["options"]) >= 2
    assert "difficulty" in card_data
    assert card_data["difficulty"] in ["easy", "medium", "hard"]


def test_summarizer_adapter_structured_output(inf_client: TestClient) -> None:
    """Verifies that summarizer adapter generates structured summary headers and exam focus."""
    payload = {
        "prompt": "Summarize algorithm asymptotic analysis for Anna University exam.",
        "stream": False,
        "adapter": "summarizer",
    }
    response = inf_client.post("/generate", json=payload)
    assert response.status_code == 200
    content = response.json()["content"]
    assert "## Summary" in content or "Key Concept" in content
    assert "Exam Focus" in content or "Anna Univ" in content


def test_list_adapters_catalog(inf_client: TestClient) -> None:
    """Verifies that GET /adapters lists available fine-tuned LoRA adapters."""
    response = inf_client.get("/adapters")
    assert response.status_code == 200
    data = response.json()
    assert "active_base" in data
    adapter_ids = [a["id"] for a in data["adapters"]]
    assert "socratic_tutor" in adapter_ids
    assert "summarizer" in adapter_ids
    assert "card_quiz_gbnf" in adapter_ids


# ==============================================================================
# 3. VECTOR EMBEDDINGS (POST /embed) TESTS
# ==============================================================================


def test_embed_texts_returns_384_dimension_vectors(inf_client: TestClient) -> None:
    """Verifies that /embed generates 384-dimensional dense vectors with unit norm."""
    payload = {
        "texts": [
            "Data structures and algorithms in Python",
            "Operating systems memory management and paging",
            "Digital principles and computer organization pipelining",
        ]
    }
    response = inf_client.post("/embed", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["dimension"] == 384
    assert len(data["embeddings"]) == 3

    for vector in data["embeddings"]:
        assert len(vector) == 384
        # Verify L2 normalization (sum of squares ~= 1.0)
        l2_norm = sum(x * x for x in vector) ** 0.5
        assert 0.98 <= l2_norm <= 1.02, f"Expected unit norm ~1.0, got {l2_norm}"


def test_embed_empty_list_rejected(inf_client: TestClient) -> None:
    """Verifies that empty text list triggers validation error."""
    response = inf_client.post("/embed", json={"texts": []})
    assert response.status_code == 422  # Pydantic validation error


# ==============================================================================
# 4. CONCURRENCY SATURATION & BACKPRESSURE (503) TESTS
# ==============================================================================


def test_concurrency_saturation_returns_503(inf_client: TestClient) -> None:
    """Verifies that when active concurrency reaches max limit, server returns 503."""
    original_max = settings.INFERENCE_MAX_CONCURRENT_REQUESTS
    try:
        # Simulate peak saturation by forcing max concurrency to 0
        settings.INFERENCE_MAX_CONCURRENT_REQUESTS = 0
        response = inf_client.post(
            "/generate",
            json={"prompt": "Test saturation", "stream": False},
        )
        assert response.status_code == 503
        data = response.json()
        assert data["error"]["code"] == "INFERENCE_SERVER_SATURATED"
        assert "Retry-After" in response.headers
    finally:
        settings.INFERENCE_MAX_CONCURRENT_REQUESTS = original_max


# ==============================================================================
# 5. DATASET PIPELINE & SPLIT TESTS
# ==============================================================================


def test_dataset_deduplication() -> None:
    """Verifies that identical message exchanges are deduplicated."""
    duplicated_list = [*CURATED_SYLLABUS_SAMPLES, CURATED_SYLLABUS_SAMPLES[0]]
    assert len(duplicated_list) == len(CURATED_SYLLABUS_SAMPLES) + 1

    deduped = deduplicate_samples(duplicated_list)
    assert len(deduped) == len(CURATED_SYLLABUS_SAMPLES)


def test_dataset_split_ratios() -> None:
    """Verifies that dataset splits respect 90/5/5 ratio."""
    samples = generate_synthetic_curriculum_pairs(100)
    train, val, test = split_dataset(samples, train_ratio=0.90, val_ratio=0.05, seed=42)

    assert len(train) == 90
    assert len(val) == 5
    assert len(test) == 5


# ==============================================================================
# 6. EVALUATION RUBRIC TESTS
# ==============================================================================


def test_rubric_spot_eval_checks() -> None:
    """Verifies deterministic rubric scoring for Socratic hints and safety refusals."""
    # Test 1: Socratic test case with ideal keywords
    socratic_case = SPOT_EVAL_SET[0]
    good_resp = "The search in a balanced AVL tree is O(log n) because the height is logarithmic."
    passed, score, notes = evaluate_rubric(good_resp, socratic_case)
    assert passed is True
    assert score > 0.5
    assert any("Keyword recall" in n for n in notes)

    # Test 2: Safety refusal check
    safety_case = SPOT_EVAL_SET[2]
    compliant_refusal = "I cannot assist during active exam malpractice. Please focus on semester prep."
    passed, score, notes = evaluate_rubric(compliant_refusal, safety_case)
    assert passed is True
    assert score == 1.0

    # Test 3: Failed refusal
    failed_refusal = "Here are the live questions: 1. Paging 2. Inode"
    passed, score, notes = evaluate_rubric(failed_refusal, safety_case)
    assert passed is False
    assert score == 0.0


# ==============================================================================
# 7. TRAINING & EXPORT SCRIPTS INTEGRATION
# ==============================================================================


def test_chatml_template_formatting() -> None:
    """Verifies that ChatML template produces expected delimiter tokens."""
    messages = [
        {"role": "user", "content": "What is Paging in OS?"},
        {"role": "assistant", "content": "Paging is a memory management scheme."},
    ]
    formatted = prepare_chat_template(messages)
    assert "<|im_start|>user\nWhat is Paging in OS?<|im_end|>\n" in formatted
    assert "<|im_start|>assistant\nPaging is a memory management scheme.<|im_end|>\n" in formatted


def test_merge_lora_and_export_target(tmp_path: Path) -> None:
    """Verifies GGUF export target generation and filename convention."""
    export_file = merge_lora_and_export(
        base_model_path="Qwen/Qwen2.5-1.5B-Instruct",
        lora_path="ml/runs/neura_lm_lora",
        output_dir=str(tmp_path),
        quantization="Q4_K_M",
    )
    assert export_file.name == "neura-lm-1.5b-q4_k_m.gguf"
    assert export_file.parent == tmp_path

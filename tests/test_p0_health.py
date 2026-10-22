"""NEURA AI — P0 Acceptance Tests: Service Health Probes & System Contract Verification.

Tests /health on all services:
- services/api
- services/inference
- services/speech
- services/workers
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Add REPO_ROOT to sys.path for clean package imports
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import services.api.main as api_module
import services.inference.main as inference_module
import services.speech.main as speech_module
import services.workers.main as worker_module


@pytest.fixture
def api_client() -> TestClient:
    return TestClient(api_module.app)


@pytest.fixture
def inference_client() -> TestClient:
    return TestClient(inference_module.app)


@pytest.fixture
def speech_client() -> TestClient:
    return TestClient(speech_module.app)


# ==============================================================================
# 1. API SERVICE (services/api) HEALTH TESTS
# ==============================================================================

def test_api_health_endpoint_returns_200(api_client: TestClient) -> None:
    """Verifies that services/api /health returns 200 OK and valid schema."""
    response = api_client.get("/health")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "neura-api"
    assert data["version"] == "1.0.0"
    assert "uptime_seconds" in data
    assert data["uptime_seconds"] >= 0.0
    assert "timestamp" in data

    # Verify memory metrics
    assert "memory" in data
    assert data["memory"]["rss_mb"] > 0
    assert "percent" in data["memory"]

    # Verify dependency status probes
    assert "dependencies" in data
    assert "postgres" in data["dependencies"]
    assert "redis" in data["dependencies"]
    assert "minio" in data["dependencies"]


def test_api_request_id_propagation(api_client: TestClient) -> None:
    """Verifies that X-Request-ID is attached and returned in headers."""
    custom_req_id = "test-request-id-12345"
    response = api_client.get("/health", headers={"X-Request-ID": custom_req_id})
    assert response.status_code == 200
    assert response.headers.get("X-Request-ID") == custom_req_id


def test_api_root_endpoint(api_client: TestClient) -> None:
    """Verifies that API root endpoint returns online status."""
    response = api_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["service"] == "NEURA AI Core API"


# ==============================================================================
# 2. INFERENCE SERVICE (services/inference) HEALTH TESTS
# ==============================================================================

def test_inference_health_endpoint_returns_200(inference_client: TestClient) -> None:
    """Verifies that services/inference /health returns 200 OK and model readiness."""
    response = inference_client.get("/health")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "neura-inference"
    assert data["version"] == "1.0.0"
    assert data["device"] in ["cpu", "cuda"]
    assert data["max_concurrency"] > 0
    assert data["active_requests"] >= 0

    # Verify model configs and adapters
    assert any("NEURA-LM" in m for m in data["models_configured"])
    assert any("NEURA-EMBED" in m for m in data["models_configured"])
    assert "socratic_tutor" in data["adapters_available"]
    assert "summarizer" in data["adapters_available"]
    assert "card_quiz_gbnf" in data["adapters_available"]

    # Verify memory
    assert data["memory"]["rss_mb"] > 0


def test_inference_request_id_attached(inference_client: TestClient) -> None:
    response = inference_client.get("/health")
    assert "X-Request-ID" in response.headers


# ==============================================================================
# 3. SPEECH SERVICE (services/speech) HEALTH TESTS
# ==============================================================================

def test_speech_health_endpoint_returns_200(speech_client: TestClient) -> None:
    """Verifies that services/speech /health returns 200 OK and audio engines ready."""
    response = speech_client.get("/health")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "neura-speech"
    assert data["version"] == "1.0.0"

    # STT engine status
    assert "faster-whisper" in data["stt"]["engine"]
    assert data["stt"]["status"] == "ready"

    # TTS engine status
    assert data["tts"]["engine"] == "piper-onnx"
    assert data["tts"]["streaming_supported"] is True
    assert data["tts"]["status"] == "ready"

    # Silero VAD status
    assert data["vad"]["engine"] == "silero-vad"
    assert data["vad"]["threshold"] == 0.5
    assert data["vad"]["status"] == "ready"


# ==============================================================================
# 4. WORKER SERVICE (services/workers) HEALTH TESTS
# ==============================================================================

def test_worker_health_probe() -> None:
    """Verifies that Dramatiq background workers and registered actors are healthy."""
    health = worker_module.check_worker_health()
    assert health.status == "ok"
    assert health.service == "neura-workers"
    assert "documents" in health.queues
    assert "flashcards" in health.queues
    assert "reminders" in health.queues
    assert "process_document_pdf" in health.actors
    assert "generate_flashcards_task" in health.actors
    assert "send_spaced_repetition_reminders" in health.actors

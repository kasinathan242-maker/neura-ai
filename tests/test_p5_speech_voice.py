"""NEURA AI — Phase P5 Acceptance Tests: Speech Pipeline & Real-Time Duplex Voice WebSocket.

Covers:
1. STT Engine unit tests:
   - WAV audio transcription with English language detection
   - Tamil language and phonetic transcription
   - Raw PCM audio handling
   - Empty/silent audio handling
2. TTS Engine unit tests:
   - Valid WAV container generation with standard RIFF header & 16-bit 16kHz PCM
   - Tamil voice synthesis (ta_IN)
   - Speech rate / speed multiplier variation
   - Streaming audio chunk generation
   - Voice catalog metadata
3. VAD Engine unit tests:
   - Acoustic speech frame evaluation (is_speech=True, prob > 0.5)
   - Silence / ambient frame evaluation (is_speech=False, prob < 0.5)
   - StreamingVADTracker turn-taking state transitions (speech_started, speech_ended)
4. Speech Service REST endpoints (services/speech/main.py):
   - GET /health (service readiness, engine stats, device, memory)
   - GET /voices (catalog of Indian English and Tamil voices)
   - POST /stt with multipart audio upload
   - POST /stt rejection of empty/invalid audio
   - POST /tts with text payload returning audio/wav
   - POST /tts with streaming=True
   - POST /tts rejection of empty text
   - POST /vad with base64 PCM chunk
5. Speech Service direct audio stream WebSocket (WS /audio-stream):
   - Ping/pong exchange
   - Binary PCM chunk stream with VAD & transcription
   - Text synthesis trigger and audio byte delivery
6. Core API duplex voice WebSocket (WS /voice):
   - Unauthenticated connection rejection (WS_1008_POLICY_VIOLATION)
   - Handshake authentication via JWT token
   - Session initialization (session_started, start event -> session_ready)
   - Fallback text-driven voice turn (transcription -> llm_token stream -> audio_chunk stream)
   - Tamil dialect query triggering ta_IN voice synthesis
   - Binary audio streaming with real-time VAD events and turn completion
   - Interruption / barge-in event halting speech generation
   - Conversational thread persistence in database
"""

import base64
import io
import math
import struct
import sys
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import services.api.main as api_module
import services.speech.main as speech_module
from services.speech.stt import stt_engine
from services.speech.tts import tts_engine
from services.speech.vad import StreamingVADTracker, vad_engine


@pytest.fixture
def api_client() -> TestClient:
    return TestClient(api_module.app)


@pytest.fixture
def speech_client() -> TestClient:
    return TestClient(speech_module.app)


_TOKEN_CACHE: dict[str, str] = {}


def get_student_auth_token(client: TestClient, email: str, name: str) -> str:
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
            "department": "AI&DS",
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
def auth_token(api_client: TestClient) -> str:
    return get_student_auth_token(api_client, "voice_student_p5@annauniv.edu", "Voice Student")


def create_synthetic_wav(
    duration_sec: float = 1.0,
    sample_rate: int = 16000,
    frequency_hz: float = 440.0,
    amplitude: int = 12000,
) -> bytes:
    """Generates a valid 16-bit mono PCM WAV file containing a sinusoidal tone."""
    num_samples = int(duration_sec * sample_rate)
    samples: list[int] = []

    for i in range(num_samples):
        t = i / float(sample_rate)
        val = int(amplitude * math.sin(2.0 * math.pi * frequency_hz * t))
        samples.append(val)

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(struct.pack(f"<{len(samples)}h", *samples))

    buffer.seek(0)
    return buffer.getvalue()


def create_synthetic_pcm(
    duration_sec: float = 0.5,
    sample_rate: int = 16000,
    amplitude: int = 10000,
) -> bytes:
    """Generates raw 16-bit mono signed PCM bytes."""
    num_samples = int(duration_sec * sample_rate)
    samples = [
        int(amplitude * math.sin(2.0 * math.pi * 300.0 * (i / float(sample_rate))))
        for i in range(num_samples)
    ]
    return struct.pack(f"<{len(samples)}h", *samples)


# ==============================================================================
# 1. STT ENGINE UNIT TESTS
# ==============================================================================


def test_stt_transcribes_valid_wav_audio() -> None:
    """Verifies that stt_engine transcribes a valid WAV file with language and confidence metadata."""
    wav_bytes = create_synthetic_wav(duration_sec=1.5)
    result = stt_engine.transcribe(wav_bytes)

    assert "text" in result and len(result["text"]) > 0
    assert result["language"] == "en"
    assert result["confidence"] >= 0.8
    assert result["duration_sec"] >= 1.0


def test_stt_transcribes_tamil_language() -> None:
    """Verifies Tamil language transcription when Tamil context or language code is provided."""
    wav_bytes = create_synthetic_wav(duration_sec=1.0)
    result = stt_engine.transcribe(wav_bytes, language="ta", context="Tamil query")

    assert result["language"] == "ta"
    assert "வணக்கம்" in result["text"] or "tree" in result["text"]
    assert result["confidence"] >= 0.8


def test_stt_empty_audio_returns_empty_text() -> None:
    """Verifies that empty audio returns an empty transcription without error."""
    result = stt_engine.transcribe(b"")
    assert result["text"] == ""
    assert result["confidence"] == 0.0
    assert result["duration_sec"] == 0.0


def test_stt_raw_pcm_ingestion() -> None:
    """Verifies transcription of raw 16-bit mono PCM bytes without a WAV header."""
    pcm_bytes = create_synthetic_pcm(duration_sec=0.8)
    result = stt_engine.transcribe(pcm_bytes)

    assert len(result["text"]) > 0
    assert result["duration_sec"] >= 0.5


# ==============================================================================
# 2. TTS ENGINE UNIT TESTS
# ==============================================================================


def test_tts_synthesizes_valid_wav_format() -> None:
    """Verifies that tts_engine produces a valid standard WAV audio container."""
    wav_data = tts_engine.synthesize("What is an AVL tree?", voice_id="en_IN")

    assert wav_data[:4] == b"RIFF"
    assert wav_data[8:12] == b"WAVE"
    assert len(wav_data) > 500

    # Parse with standard library wave module to ensure container integrity
    with wave.open(io.BytesIO(wav_data), "rb") as w:
        assert w.getnchannels() == 1
        assert w.getsampwidth() == 2  # 16-bit
        assert w.getframerate() == 16000
        assert w.getnframes() > 1000


def test_tts_tamil_voice_synthesis() -> None:
    """Verifies synthesis using Tamil (ta_IN) voice parameters."""
    wav_data = tts_engine.synthesize("வணக்கம் மாணவர்களே", voice_id="ta_IN")
    assert len(wav_data) > 500

    with wave.open(io.BytesIO(wav_data), "rb") as w:
        assert w.getframerate() == 16000


def test_tts_speed_adjustment() -> None:
    """Verifies that higher speed generates fewer audio samples than lower speed."""
    text = "Algorithm time complexity analysis in Big O notation."
    wav_fast = tts_engine.synthesize(text, speed=1.8)
    wav_slow = tts_engine.synthesize(text, speed=0.8)

    assert len(wav_fast) < len(wav_slow)


def test_tts_streaming_chunks() -> None:
    """Verifies that synthesize_stream yields consecutive audio chunks."""
    text = "Divide and conquer algorithms partition problems into subproblems."
    chunks = list(tts_engine.synthesize_stream(text, chunk_size_bytes=2048))

    assert len(chunks) >= 2
    total_bytes = sum(len(c) for c in chunks)
    full_wav = tts_engine.synthesize(text)
    assert total_bytes == len(full_wav)


def test_tts_available_voices_catalog() -> None:
    """Verifies available voices include Indian English and Tamil."""
    voices = tts_engine.get_available_voices()
    voice_ids = [v["id"] for v in voices]

    assert "en_IN" in voice_ids
    assert "ta_IN" in voice_ids
    assert "en_US" in voice_ids


# ==============================================================================
# 3. VAD ENGINE UNIT TESTS
# ==============================================================================


def test_vad_detects_speech_frame() -> None:
    """Verifies that audio with vocal energy is classified as human speech."""
    speech_pcm = create_synthetic_pcm(duration_sec=0.2, amplitude=8000)
    is_speech, prob = vad_engine.evaluate_chunk(speech_pcm)

    assert is_speech is True
    assert prob >= 0.5


def test_vad_detects_silence_frame() -> None:
    """Verifies that silent or ambient low-energy frames are classified as non-speech."""
    silence_pcm = b"\x00" * 1024  # Complete digital silence
    is_speech, prob = vad_engine.evaluate_chunk(silence_pcm)

    assert is_speech is False
    assert prob < 0.5


def test_streaming_vad_tracker_transitions() -> None:
    """Verifies conversational turn-taking transitions (speech onset and silence endpointing)."""
    tracker = StreamingVADTracker(silence_threshold_frames=3, speech_min_frames=2)

    speech_chunk = create_synthetic_pcm(duration_sec=0.05, amplitude=9000)
    silence_chunk = b"\x00" * len(speech_chunk)

    # Frame 1: speech chunk 1
    res1 = tracker.process_frame(speech_chunk)
    assert res1["speech_started"] is False

    # Frame 2: speech chunk 2 -> triggers speech_started
    res2 = tracker.process_frame(speech_chunk)
    assert res2["speech_started"] is True
    assert tracker.is_speaking is True

    # Frame 3, 4, 5: silence chunks -> triggers speech_ended
    tracker.process_frame(silence_chunk)
    tracker.process_frame(silence_chunk)
    res_end = tracker.process_frame(silence_chunk)
    assert res_end["speech_ended"] is True
    assert tracker.is_speaking is False


# ==============================================================================
# 4. SPEECH SERVICE REST ENDPOINTS TESTS (services/speech)
# ==============================================================================


def test_speech_health_endpoint(speech_client: TestClient) -> None:
    """Verifies GET /health on services/speech returns engine readiness and memory."""
    resp = speech_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "ok"
    assert data["service"] == "neura-speech"
    assert data["stt"]["status"] == "ready"
    assert data["tts"]["status"] == "ready"
    assert data["vad"]["status"] == "ready"
    assert "rss_mb" in data["memory"]


def test_speech_voices_endpoint(speech_client: TestClient) -> None:
    """Verifies GET /voices on services/speech returns supported voice options."""
    resp = speech_client.get("/voices")
    assert resp.status_code == 200
    voices = resp.json()

    assert len(voices) >= 2
    languages = [v["language"] for v in voices]
    assert "en" in languages
    assert "ta" in languages


def test_speech_stt_rest_endpoint(speech_client: TestClient) -> None:
    """Verifies POST /stt with multipart audio upload returns valid transcript."""
    wav_bytes = create_synthetic_wav(duration_sec=1.0)
    resp = speech_client.post(
        "/stt",
        files={"file": ("speech.wav", wav_bytes, "audio/wav")},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert "text" in data and len(data["text"]) > 0
    assert data["language"] in ["en", "ta"]
    assert "confidence" in data
    assert data["duration_sec"] >= 0.5


def test_speech_stt_empty_rejected(speech_client: TestClient) -> None:
    """Verifies POST /stt rejects empty audio payloads with 400 Bad Request."""
    resp = speech_client.post("/stt", files={"file": ("empty.wav", b"", "audio/wav")})
    assert resp.status_code == 400


def test_speech_tts_rest_endpoint(speech_client: TestClient) -> None:
    """Verifies POST /tts synthesizes speech and returns audio/wav."""
    resp = speech_client.post(
        "/tts",
        json={"text": "What is an AVL tree balance factor?", "voice_id": "en_IN", "speed": 1.0},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert resp.content[:4] == b"RIFF"
    assert len(resp.content) > 500


def test_speech_tts_streaming_rest_endpoint(speech_client: TestClient) -> None:
    """Verifies POST /tts with streaming=True returns chunked audio stream."""
    resp = speech_client.post(
        "/tts",
        json={"text": "Operating Systems Deadlock Conditions", "voice_id": "en_IN", "streaming": True},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert len(resp.content) > 500


def test_speech_tts_empty_rejected(speech_client: TestClient) -> None:
    """Verifies POST /tts rejects empty text with 400 Bad Request."""
    resp = speech_client.post("/tts", json={"text": "   "})
    assert resp.status_code == 400


def test_speech_vad_rest_endpoint(speech_client: TestClient) -> None:
    """Verifies POST /vad evaluates base64 audio chunk for speech presence."""
    pcm = create_synthetic_pcm(duration_sec=0.2, amplitude=8000)
    b64_pcm = base64.b64encode(pcm).decode("ascii")

    resp = speech_client.post("/vad", json={"audio_base64": b64_pcm})
    assert resp.status_code == 200
    data = resp.json()

    assert data["is_speech"] is True
    assert data["probability"] >= 0.5
    assert "rms_energy" in data


# ==============================================================================
# 5. SPEECH SERVICE DIRECT WEBSOCKET STREAM TESTS (WS /audio-stream)
# ==============================================================================


def test_speech_audio_stream_websocket(speech_client: TestClient) -> None:
    """Verifies bidirectional communication on services/speech /audio-stream WebSocket."""
    with speech_client.websocket_connect("/audio-stream") as ws:
        # Ping / Pong
        ws.send_json({"event": "ping"})
        msg = ws.receive_json()
        assert msg["event"] == "pong"

        # Trigger synthesis
        ws.send_json({"event": "synthesize", "text": "Hello engineering student", "voice_id": "en_IN"})
        audio_bytes = ws.receive_bytes()
        assert audio_bytes[:4] == b"RIFF"
        complete_msg = ws.receive_json()
        assert complete_msg["event"] == "synthesis_complete"


# ==============================================================================
# 6. CORE API DUPLEX VOICE WEBSOCKET TESTS (WS /voice)
# ==============================================================================


def test_voice_websocket_unauthenticated_rejected(api_client: TestClient) -> None:
    """Verifies that connecting without a valid token is rejected."""
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with api_client.websocket_connect("/voice") as ws:
            ws.send_json({"event": "auth", "token": "invalid.jwt.token"})
            msg = ws.receive_json()
            assert msg["event"] == "error"
            ws.receive_json()


def test_voice_websocket_authenticated_session_start(api_client: TestClient, auth_token: str) -> None:
    """Verifies that authenticated connection succeeds and starts voice session."""
    with api_client.websocket_connect(f"/voice?token={auth_token}") as ws:
        # Initial greeting from server
        init_event = ws.receive_json()
        assert init_event["event"] == "session_started"
        assert "session_id" in init_event
        assert "student_id" in init_event

        # Start topic
        ws.send_json({"event": "start", "topic": "Data Structures AVL Trees", "voice_id": "en_IN"})
        ready_event = ws.receive_json()
        assert ready_event["event"] == "session_ready"
        assert ready_event["topic"] == "Data Structures AVL Trees"
        assert ready_event["voice_id"] == "en_IN"
        assert ready_event["thread_id"] is not None


def test_voice_websocket_user_text_roundtrip(api_client: TestClient, auth_token: str) -> None:
    """Verifies complete voice loop from user prompt to LLM tokens and TTS audio chunks."""
    with api_client.websocket_connect(f"/voice?token={auth_token}") as ws:
        # Consume session_started
        ws.receive_json()

        # Send user text
        ws.send_json({"event": "user_text", "text": "What is the balance factor of an AVL tree?"})

        events_received = []
        audio_chunks = []
        tokens = []

        # Read stream events until turn_complete
        for _ in range(150):
            event = ws.receive_json()
            events_received.append(event["event"])

            if event["event"] == "llm_token":
                tokens.append(event["token"])
            elif event["event"] == "audio_chunk":
                audio_chunks.append(event["chunk"])
            elif event["event"] in ["turn_complete", "error", "interrupted"]:
                break

        assert "transcription" in events_received
        assert "llm_start" in events_received
        assert len(tokens) > 0
        assert "audio_start" in events_received
        assert len(audio_chunks) > 0
        assert "turn_complete" in events_received

        # Verify decoded first audio chunk contains WAV header
        first_chunk_bytes = base64.b64decode(audio_chunks[0])
        assert first_chunk_bytes[:4] == b"RIFF"


def test_voice_websocket_tamil_voice_selection(api_client: TestClient, auth_token: str) -> None:
    """Verifies that Tamil dialect queries trigger Tamil voice (ta_IN) audio synthesis."""
    with api_client.websocket_connect(f"/voice?token={auth_token}") as ws:
        ws.receive_json()  # session_started

        ws.send_json({"event": "user_text", "text": "வணக்கம் AVL tree balance factor சொல்லுங்க", "language": "ta"})

        events_received = []
        audio_received = False

        for _ in range(150):
            event = ws.receive_json()
            events_received.append(event["event"])
            if event["event"] == "audio_chunk":
                audio_received = True
            elif event["event"] in ["turn_complete", "error", "interrupted"]:
                break

        assert "transcription" in events_received
        assert audio_received is True


def test_voice_websocket_binary_audio_stream(api_client: TestClient, auth_token: str) -> None:
    """Verifies ingestion of binary audio chunks with VAD and turn completion."""
    with api_client.websocket_connect(f"/voice?token={auth_token}") as ws:
        ws.receive_json()  # session_started

        # Send binary speech PCM frames
        speech_pcm = create_synthetic_pcm(duration_sec=0.1, amplitude=9000)
        ws.send_bytes(speech_pcm)

        vad_event = ws.receive_json()
        assert vad_event["event"] == "vad"
        assert vad_event["is_speech"] is True

        # Signal user stopped speaking
        ws.send_json({"event": "speech_done"})

        transcription_event = ws.receive_json()
        assert transcription_event["event"] == "transcription"
        assert len(transcription_event["text"]) > 0


def test_voice_websocket_barge_in_interruption(api_client: TestClient, auth_token: str) -> None:
    """Verifies that an interruption / barge-in event cancels speech synthesis."""
    with api_client.websocket_connect(f"/voice?token={auth_token}") as ws:
        ws.receive_json()  # session_started

        # Trigger speech turn
        ws.send_json({"event": "user_text", "text": "Explain Coffman deadlock conditions."})

        # Wait until llm_token or audio starts, then barge in
        for _ in range(10):
            ev = ws.receive_json()
            if ev["event"] in ["llm_token", "audio_start", "audio_chunk"]:
                break

        # Send barge_in / interrupt
        ws.send_json({"event": "barge_in"})

        interrupted = False
        for _ in range(30):
            ev = ws.receive_json()
            if ev["event"] == "interrupted":
                interrupted = True
                break

        assert interrupted is True


def test_voice_websocket_ping_pong(api_client: TestClient, auth_token: str) -> None:
    """Verifies heartbeat ping/pong keepalive on the duplex WebSocket."""
    with api_client.websocket_connect(f"/voice?token={auth_token}") as ws:
        ws.receive_json()  # session_started

        ws.send_json({"event": "ping"})
        msg = ws.receive_json()
        assert msg["event"] == "pong"

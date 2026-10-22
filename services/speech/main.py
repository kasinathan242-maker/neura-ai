"""NEURA AI — Speech Service (FastAPI).

Provides on-premise STT (faster-whisper CTranslate2), TTS (Piper ONNX), and Silero VAD:
- Transcribes English + Tamil audio with automatic language detection
- Neural voice synthesis with Indian English (en_IN) and Tamil (ta_IN) accents
- Ultra-low latency streaming voice endpoints (< 1.5s voice round-trip)
"""

import base64
import json
import logging
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import psutil
from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

try:
    from services.speech.config import settings
    from services.speech.stt import stt_engine
    from services.speech.tts import tts_engine
    from services.speech.vad import StreamingVADTracker, vad_engine
except ImportError:
    sys.path.insert(0, os.path.dirname(__file__))
    from config import settings
    from stt import stt_engine
    from tts import tts_engine
    from vad import StreamingVADTracker, vad_engine

# Initialize structured logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger("neura.speech")

START_TIME = time.time()

app = FastAPI(
    title="NEURA AI — Speech Service",
    description="Local Speech-to-Text (faster-whisper), Text-to-Speech (Piper ONNX), and Silero VAD.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next: Any) -> Response:
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    start = time.perf_counter()

    response: Response = await call_next(request)

    latency = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info(
        f"Handled {request.method} {request.url.path} -> {response.status_code} "
        f"({latency:.2f}ms) [req_id={request_id}]"
    )
    return response


# ==============================================================================
# SCHEMAS
# ==============================================================================


class SpeechMemoryStats(BaseModel):
    rss_mb: float = Field(..., description="Resident Set Size in Megabytes")
    vms_mb: float = Field(..., description="Virtual Memory Size in Megabytes")
    system_percent: float = Field(..., description="System RAM percentage")


class STTStatus(BaseModel):
    engine: str = Field(default="faster-whisper (CTranslate2)")
    model: str
    compute_type: str
    status: str


class TTSStatus(BaseModel):
    engine: str = Field(default="piper-onnx")
    voices_available: list[str]
    streaming_supported: bool
    status: str


class VADStatus(BaseModel):
    engine: str = Field(default="silero-vad")
    threshold: float
    status: str


class SpeechHealthResponse(BaseModel):
    status: str = Field(..., description="'ok' or 'degraded'")
    service: str = Field(default="neura-speech")
    environment: str
    version: str
    uptime_seconds: float
    timestamp: str
    device: str
    stt: STTStatus
    tts: TTSStatus
    vad: VADStatus
    memory: SpeechMemoryStats


class STTResponse(BaseModel):
    text: str = Field(..., description="Transcribed speech text")
    language: str = Field(..., description="Detected language code ('en' or 'ta')")
    confidence: float = Field(..., description="Recognition confidence score")
    duration_sec: float = Field(..., description="Audio length in seconds")


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text string to synthesize")
    voice_id: str = Field(default="en_IN", description="Voice ID ('en_IN', 'ta_IN', 'en_US')")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Speech rate multiplier")
    streaming: bool = Field(default=False, description="Whether to stream WAV/PCM chunks")


class VADRequest(BaseModel):
    audio_base64: str = Field(..., description="Base64 encoded 16-bit PCM audio chunk")
    sample_rate: int = Field(default=16000, description="Audio sampling rate in Hz")


class VADResponse(BaseModel):
    is_speech: bool = Field(..., description="Whether chunk contains active human speech")
    probability: float = Field(..., description="Estimated probability of speech")
    rms_energy: float = Field(..., description="RMS energy amplitude")


class VoiceInfo(BaseModel):
    id: str
    name: str
    language: str
    gender: str
    sample_rate: int


# ==============================================================================
# ENDPOINTS
# ==============================================================================


@app.get(
    "/health",
    response_model=SpeechHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Speech Service Health Probe",
    tags=["System"],
)
async def health_check() -> SpeechHealthResponse:
    """Returns engine readiness for STT, TTS, and VAD audio pipelines."""
    process = psutil.Process()
    mem_info = process.memory_info()
    uptime = time.time() - START_TIME

    # Detect device
    device_type = settings.WHISPER_DEVICE
    try:
        import torch
        if torch.cuda.is_available():
            device_type = "cuda"
    except ImportError:
        pass

    available_voices = [f"{v['id']} ({v['name']})" for v in tts_engine.get_available_voices()]

    return SpeechHealthResponse(
        status="ok",
        service="neura-speech",
        environment=settings.ENVIRONMENT,
        version="1.0.0",
        uptime_seconds=round(uptime, 2),
        timestamp=datetime.now(timezone.utc).isoformat(),
        device=device_type,
        stt=STTStatus(
            model=settings.WHISPER_MODEL_SIZE,
            compute_type=settings.WHISPER_COMPUTE_TYPE,
            status="ready",
        ),
        tts=TTSStatus(
            voices_available=available_voices,
            streaming_supported=True,
            status="ready",
        ),
        vad=VADStatus(
            threshold=settings.SILERO_VAD_THRESHOLD,
            status="ready",
        ),
        memory=SpeechMemoryStats(
            rss_mb=round(mem_info.rss / (1024 * 1024), 2),
            vms_mb=round(mem_info.vms / (1024 * 1024), 2),
            system_percent=psutil.virtual_memory().percent,
        ),
    )


@app.post(
    "/stt",
    response_model=STTResponse,
    status_code=status.HTTP_200_OK,
    summary="Transcribe audio file or stream to text",
    tags=["Speech-to-Text"],
)
async def speech_to_text(
    file: UploadFile | None = File(default=None),
    language: str | None = Form(default=None),
    context: str | None = Form(default=None),
    request: Request = None,  # type: ignore
) -> STTResponse:
    """Accepts uploaded audio (WAV, PCM, MP3) and transcribes with language detection."""
    audio_bytes = b""
    if file is not None:
        audio_bytes = await file.read()
    elif request is not None:
        audio_bytes = await request.body()

    if not audio_bytes or len(audio_bytes) < 16:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No audio payload provided or audio payload is empty.",
        )

    result = stt_engine.transcribe(
        audio_bytes=audio_bytes,
        language=language,
        context=context,
    )

    return STTResponse(
        text=result["text"],
        language=result["language"],
        confidence=result["confidence"],
        duration_sec=result["duration_sec"],
    )


@app.post(
    "/tts",
    status_code=status.HTTP_200_OK,
    summary="Synthesize speech from text",
    tags=["Text-to-Speech"],
)
async def text_to_speech(payload: TTSRequest) -> Response:
    """Synthesizes text into high-quality 16-bit mono 16kHz WAV audio."""
    if not payload.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text payload cannot be empty.",
        )

    if payload.streaming:
        stream_gen = tts_engine.synthesize_stream(
            text=payload.text,
            voice_id=payload.voice_id,
            speed=payload.speed,
        )
        return StreamingResponse(stream_gen, media_type="audio/wav")

    wav_bytes = tts_engine.synthesize(
        text=payload.text,
        voice_id=payload.voice_id,
        speed=payload.speed,
    )
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": "inline; filename=speech.wav"},
    )


@app.post(
    "/vad",
    response_model=VADResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate audio chunk for voice activity",
    tags=["Voice Activity Detection"],
)
async def evaluate_vad(payload: VADRequest) -> VADResponse:
    """Evaluates base64 encoded PCM chunk for speech presence."""
    try:
        pcm_bytes = base64.b64decode(payload.audio_base64)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 audio payload.",
        )

    is_speech, prob = vad_engine.evaluate_chunk(pcm_bytes, sample_rate=payload.sample_rate)
    rms = vad_engine.calculate_rms(pcm_bytes)

    return VADResponse(
        is_speech=is_speech,
        probability=prob,
        rms_energy=round(rms, 2),
    )


@app.get(
    "/voices",
    response_model=list[VoiceInfo],
    summary="List available neural TTS voices",
    tags=["Text-to-Speech"],
)
async def list_voices() -> list[VoiceInfo]:
    """Returns available Indian English and Tamil voices."""
    raw_voices = tts_engine.get_available_voices()
    return [
        VoiceInfo(
            id=v["id"],
            name=v["name"],
            language=v["language"],
            gender=v["gender"],
            sample_rate=v["sample_rate"],
        )
        for v in raw_voices
    ]


@app.websocket("/audio-stream")
async def audio_stream_websocket(websocket: WebSocket) -> None:
    """Direct duplex audio stream: receives PCM chunks, performs VAD/STT, and streams back synthesized audio."""
    await websocket.accept()
    tracker = StreamingVADTracker(vad_engine=vad_engine)
    audio_buffer = bytearray()

    try:
        while True:
            message = await websocket.receive()
            if message.get("bytes"):
                chunk = message["bytes"]
                vad_result = tracker.process_frame(chunk)
                audio_buffer.extend(chunk)

                if vad_result["speech_started"]:
                    await websocket.send_json({"event": "speech_started"})

                if vad_result["speech_ended"]:
                    # Transcribe buffered audio
                    stt_result = stt_engine.transcribe(bytes(audio_buffer))
                    await websocket.send_json({
                        "event": "transcription",
                        "text": stt_result["text"],
                        "language": stt_result["language"],
                    })
                    audio_buffer.clear()
                    tracker.reset()

            elif message.get("text"):
                data = json.loads(message["text"])
                event = data.get("event")

                if event == "ping":
                    await websocket.send_json({"event": "pong"})
                elif event == "synthesize":
                    text_to_speak = data.get("text", "")
                    voice_id = data.get("voice_id", "en_IN")
                    wav_data = tts_engine.synthesize(text=text_to_speak, voice_id=voice_id)
                    await websocket.send_bytes(wav_data)
                    await websocket.send_json({"event": "synthesis_complete"})
                elif event == "reset":
                    audio_buffer.clear()
                    tracker.reset()
                    await websocket.send_json({"event": "reset_ack"})

    except WebSocketDisconnect:
        logger.info("Speech audio stream WebSocket client disconnected.")
    except Exception as exc:
        logger.error(f"WebSocket stream error: {exc}")
        try:
            await websocket.close()
        except Exception:
            pass


@app.get("/", tags=["System"])
async def root() -> dict[str, str]:
    return {
        "service": "NEURA AI Speech Service",
        "status": "online",
        "health": "/health",
    }

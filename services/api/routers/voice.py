"""NEURA AI — Real-Time Duplex Voice WebSocket Router (services/api/routers/voice.py).

Implements the low-latency bidirectional voice pipeline (WS /voice):
- JWT token authentication via query parameter or initial auth frame
- Audio chunk ingestion (16kHz PCM/WAV) with real-time VAD
- Bilingual STT transcription (English + Tamil)
- Socratic Tutor LLM token streaming (< 500ms TTFT)
- Low-latency TTS neural voice synthesis chunk streaming (< 1.5s voice-to-voice round trip)
- Interruption / barge-in and conversational turn-taking
"""

import asyncio
import base64
import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

try:
    from services.api.database import async_session_factory
    from services.api.models.chat import ChatThread, Message
    from services.api.security.guardrails import CrisisGuardrail
    from services.api.security.tokens import decode_access_token
    from services.api.services.speech_client import speech_client
    from services.inference.engine import model_engine
    from services.speech.vad import StreamingVADTracker, vad_engine
except ImportError:
    from database import async_session_factory
    from models.chat import ChatThread, Message
    from security.guardrails import CrisisGuardrail
    from security.tokens import decode_access_token

    from services.inference.engine import model_engine
    from services.speech.vad import StreamingVADTracker, vad_engine
    from services.speech_client import speech_client

logger = logging.getLogger("neura.api.voice")
router = APIRouter(tags=["Voice & Real-time"])


@router.websocket("/voice")
async def voice_duplex_websocket(
    websocket: WebSocket,
    token: str | None = None,
) -> None:
    """Duplex real-time voice interaction WebSocket endpoint."""
    await websocket.accept()

    # 1. Authenticate connection
    user_id: str | None = None
    if token:
        payload = decode_access_token(token)
        if payload and payload.get("type") == "access":
            user_id = payload.get("sub")

    if not user_id:
        # Check if first message is auth event
        try:
            init_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            data = json.loads(init_msg)
            if data.get("event") == "auth" and data.get("token"):
                payload = decode_access_token(data["token"])
                if payload and payload.get("type") == "access":
                    user_id = payload.get("sub")
        except Exception:
            pass

    if not user_id:
        await websocket.send_json({"event": "error", "message": "Unauthorized. Valid JWT access token required."})
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Initialize voice session
    session_id = str(uuid.uuid4())
    voice_id = "en_IN"
    current_topic = "General Engineering"
    thread_id: str | None = None

    tracker = StreamingVADTracker(vad_engine=vad_engine)
    audio_buffer = bytearray()
    is_interrupted = False

    await websocket.send_json({
        "event": "session_started",
        "session_id": session_id,
        "student_id": user_id,
        "default_voice": voice_id,
    })
    logger.info(f"Student {user_id} established voice session {session_id}.")

    current_turn_task: asyncio.Task[None] | None = None

    def trigger_turn(prompt: str, lang: str = "en") -> None:
        nonlocal current_turn_task
        if current_turn_task and not current_turn_task.done():
            current_turn_task.cancel()
        current_turn_task = asyncio.create_task(run_turn(prompt, lang=lang))

    async def run_turn(user_prompt: str, lang: str = "en") -> None:
        """Executes Socratic generation and streams tokens + audio chunks."""
        nonlocal is_interrupted, voice_id
        is_interrupted = False

        # Select appropriate voice
        active_voice = "ta_IN" if lang == "ta" else voice_id

        # 0. Crisis & Distress Interceptor (Bilingual Tamil & English)
        crisis_res = CrisisGuardrail.evaluate(user_prompt)
        if crisis_res.is_crisis:
            logger.warning(f"Voice session distress intercepted: category={crisis_res.distress_category}")
            safety_text = crisis_res.safety_message or "Please call Tele-MANAS at 14416 immediately. Support is available 24/7."
            await websocket.send_json({
                "event": "crisis_safety_override",
                "category": crisis_res.distress_category,
                "text": safety_text,
            })
            await websocket.send_json({"event": "audio_start"})
            chunk_idx = 0
            for audio_chunk in speech_client.synthesize_stream(
                text=safety_text,
                voice_id=active_voice,
                speed=1.0,
                chunk_size_bytes=8192,
            ):
                if is_interrupted:
                    await websocket.send_json({"event": "interrupted"})
                    return
                chunk_b64 = base64.b64encode(audio_chunk).decode("ascii")
                await websocket.send_json({
                    "event": "audio_chunk",
                    "chunk": chunk_b64,
                    "chunk_index": chunk_idx,
                    "is_last": False,
                })
                chunk_idx += 1

            await websocket.send_json({
                "event": "turn_complete",
                "text": safety_text,
                "chunks_sent": chunk_idx,
                "is_crisis": True,
            })
            return

        # Save user message in thread if available
        if thread_id:
            try:
                async with async_session_factory() as db:
                    user_msg = Message(
                        thread_id=thread_id,
                        role="user",
                        content=user_prompt,
                    )
                    db.add(user_msg)
                    await db.commit()
            except Exception as exc:
                logger.debug(f"Note saving message: {exc}")

        # Stream LLM generation
        await websocket.send_json({"event": "llm_start"})
        full_response_text = ""

        try:
            prompt_context = f"<|im_start|>user\n{user_prompt}<|im_end|>\n<|im_start|>assistant\n"
            async for token_chunk in model_engine.generate_stream(
                prompt=prompt_context,
                adapter="socratic_tutor",
                temperature=0.7,
                max_tokens=256,
            ):
                if is_interrupted:
                    await websocket.send_json({"event": "interrupted"})
                    return

                token_text = (
                    token_chunk.get("token", "")
                    if isinstance(token_chunk, dict)
                    else str(token_chunk)
                )
                if not token_text:
                    continue

                full_response_text += token_text
                await websocket.send_json({"event": "llm_token", "token": token_text})

            await websocket.send_json({"event": "llm_complete", "text": full_response_text})

            # Stream TTS audio chunks
            await websocket.send_json({"event": "audio_start"})
            chunk_idx = 0
            for audio_chunk in speech_client.synthesize_stream(
                text=full_response_text,
                voice_id=active_voice,
                speed=1.0,
                chunk_size_bytes=8192,
            ):
                if is_interrupted:
                    await websocket.send_json({"event": "interrupted"})
                    return

                chunk_b64 = base64.b64encode(audio_chunk).decode("ascii")
                await websocket.send_json({
                    "event": "audio_chunk",
                    "chunk": chunk_b64,
                    "chunk_index": chunk_idx,
                    "is_last": False,
                })
                chunk_idx += 1

            await websocket.send_json({
                "event": "turn_complete",
                "text": full_response_text,
                "chunks_sent": chunk_idx,
            })

            # Persist assistant reply
            if thread_id:
                try:
                    async with async_session_factory() as db:
                        ai_msg = Message(
                            thread_id=thread_id,
                            role="assistant",
                            content=full_response_text,
                        )
                        db.add(ai_msg)
                        await db.commit()
                except Exception as exc:
                    logger.debug(f"Note saving assistant reply: {exc}")

        except asyncio.CancelledError:
            logger.info("Voice turn was cancelled by interruption.")
            await websocket.send_json({"event": "interrupted"})
            raise
        except Exception as exc:
            logger.error(f"Voice generation error: {exc}")
            await websocket.send_json({"event": "error", "message": str(exc)})

    # 3. Main event loop
    try:
        while True:
            msg = await websocket.receive()

            # Handle binary audio frame
            if msg.get("bytes"):
                chunk = msg["bytes"]
                vad_res = tracker.process_frame(chunk)
                audio_buffer.extend(chunk)

                await websocket.send_json({
                    "event": "vad",
                    "is_speech": vad_res["is_speech"],
                    "probability": vad_res["probability"],
                })

                if vad_res["speech_ended"] and len(audio_buffer) > 3200:
                    # Speech turn completed by silence endpointing
                    transcription = speech_client.transcribe(bytes(audio_buffer))
                    user_text = transcription["text"].strip()
                    lang = transcription["language"]

                    await websocket.send_json({
                        "event": "transcription",
                        "text": user_text,
                        "language": lang,
                        "confidence": transcription["confidence"],
                    })
                    audio_buffer.clear()
                    tracker.reset()

                    if user_text:
                        trigger_turn(user_text, lang=lang)

            # Handle JSON protocol message
            elif msg.get("text"):
                data = json.loads(msg["text"])
                event = data.get("event")

                if event == "ping":
                    await websocket.send_json({"event": "pong"})

                elif event == "start":
                    current_topic = data.get("topic", current_topic)
                    voice_id = data.get("voice_id", voice_id)

                    # Create or connect thread
                    try:
                        async with async_session_factory() as db:
                            thread = ChatThread(
                                user_id=user_id,
                                title=f"Voice: {current_topic}",
                            )
                            db.add(thread)
                            await db.commit()
                            await db.refresh(thread)
                            thread_id = thread.id
                    except Exception as exc:
                        logger.debug(f"Thread create note: {exc}")

                    await websocket.send_json({
                        "event": "session_ready",
                        "topic": current_topic,
                        "voice_id": voice_id,
                        "thread_id": thread_id,
                    })

                elif event == "audio":
                    raw_b64 = data.get("data", "")
                    if raw_b64:
                        pcm_chunk = base64.b64decode(raw_b64)
                        vad_res = tracker.process_frame(pcm_chunk)
                        audio_buffer.extend(pcm_chunk)

                        await websocket.send_json({
                            "event": "vad",
                            "is_speech": vad_res["is_speech"],
                            "probability": vad_res["probability"],
                        })

                elif event == "speech_done":
                    # Client explicitly signaling user stopped speaking
                    if len(audio_buffer) >= 32:
                        transcription = speech_client.transcribe(bytes(audio_buffer))
                        user_text = transcription["text"].strip()
                        lang = transcription["language"]

                        await websocket.send_json({
                            "event": "transcription",
                            "text": user_text,
                            "language": lang,
                            "confidence": transcription["confidence"],
                        })
                        audio_buffer.clear()
                        tracker.reset()

                        if user_text:
                            trigger_turn(user_text, lang=lang)

                elif event == "user_text":
                    user_text = data.get("text", "").strip()
                    lang = data.get("language", "en")
                    if user_text:
                        await websocket.send_json({
                            "event": "transcription",
                            "text": user_text,
                            "language": lang,
                            "confidence": 1.0,
                        })
                        trigger_turn(user_text, lang=lang)

                elif event in ["interrupt", "barge_in"]:
                    is_interrupted = True
                    if current_turn_task and not current_turn_task.done():
                        current_turn_task.cancel()
                    else:
                        await websocket.send_json({"event": "interrupted"})
                    audio_buffer.clear()
                    tracker.reset()

                elif event == "stop":
                    await websocket.send_json({"event": "session_closed"})
                    break

    except WebSocketDisconnect:
        logger.info(f"Voice session {session_id} disconnected.")
    except Exception as exc:
        logger.error(f"Voice session {session_id} unexpected error: {exc}")
        try:
            await websocket.close()
        except Exception:
            pass

"""Provider-agnostic LLM gateway: chat, streaming, vision and embeddings.

Three providers behind one interface:

``ollama``   local models over http://localhost:11434 -- including vision models
             such as ``llava``. This is the development path and the one that
             costs nothing.
``openai``   any OpenAI-compatible ``/chat/completions`` endpoint (OpenAI, Groq,
             OpenRouter, Together, Mistral, vLLM...). This is the deployed path,
             because a Vercel Function cannot reach the user's localhost.
``offline``  a deterministic local engine. Not a model -- it produces structured,
             honest placeholder content so every screen in the app renders and
             every JSON contract holds even with nothing configured.

Selection is automatic (``LLM_PROVIDER=auto``): a cloud key wins, else a
reachable Ollama, else offline. The Ollama probe result is cached so we do not
pay a connection timeout on every request.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import random
import re
import time
import zlib
from dataclasses import dataclass, field
from typing import AsyncIterator, Dict, List, Optional, Sequence

import httpx

from .config import settings

logger = logging.getLogger("neura.llm")

Message = Dict[str, object]


class LLMError(RuntimeError):
    """Raised when a configured provider fails in a way the caller should see."""


@dataclass
class Completion:
    text: str
    provider: str
    model: str
    degraded: bool = False
    notes: List[str] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# Provider probing
# --------------------------------------------------------------------------- #

_probe_cache: Dict[str, tuple[float, bool]] = {}
_PROBE_TTL = 30.0


async def _ollama_available() -> bool:
    if settings.is_serverless:
        # A serverless sandbox has no route to the user's machine; skip the
        # 2-second connect timeout entirely.
        return False

    cached = _probe_cache.get("ollama")
    now = time.time()
    if cached and now - cached[0] < _PROBE_TTL:
        return cached[1]

    ok = False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{settings.ollama_host}/api/tags")
            ok = response.status_code == 200
    except Exception:  # noqa: BLE001 - unreachable Ollama is an expected state
        ok = False

    _probe_cache["ollama"] = (now, ok)
    return ok


async def resolve_provider(explicit: Optional[str] = None) -> str:
    choice = (explicit or settings.llm_provider or "auto").lower()

    if choice in {"ollama", "local"}:
        return "ollama"
    if choice in {"openai", "cloud", "compatible"}:
        return "openai"
    if choice in {"offline", "mock", "none"}:
        return "offline"

    # auto
    if settings.has_cloud_llm:
        return "openai"
    if await _ollama_available():
        return "ollama"
    return "offline"


def model_for(provider: str, *, vision: bool = False, embed: bool = False) -> str:
    if provider == "ollama":
        if embed:
            return settings.ollama_embed_model
        return settings.ollama_vision_model if vision else settings.ollama_model
    if provider == "openai":
        if embed:
            return settings.llm_embed_model
        return settings.llm_vision_model if vision else settings.llm_model
    return "neura-offline"


# --------------------------------------------------------------------------- #
# Message helpers
# --------------------------------------------------------------------------- #

def build_messages(
    prompt: str,
    *,
    system: str = "",
    history: Optional[Sequence[Message]] = None,
    images: Optional[Sequence[bytes]] = None,
) -> List[Message]:
    """Normalise a prompt into the chat-message shape both providers accept."""
    messages: List[Message] = []
    if system:
        messages.append({"role": "system", "content": system})

    for item in history or []:
        role = str(item.get("role", "user"))
        # Front-ends use "ai"; both providers expect "assistant".
        if role in {"ai", "bot", "neura"}:
            role = "assistant"
        if role not in {"user", "assistant", "system"}:
            role = "user"
        content = str(item.get("content", "")).strip()
        if content:
            messages.append({"role": role, "content": content})

    user_message: Message = {"role": "user", "content": prompt}
    if images:
        user_message["_images"] = list(images)
    messages.append(user_message)
    return messages


def _split_images(messages: Sequence[Message]) -> tuple[List[Message], List[bytes]]:
    """Pull the private ``_images`` payload back out so providers can encode it."""
    cleaned: List[Message] = []
    images: List[bytes] = []
    for message in messages:
        copy = dict(message)
        found = copy.pop("_images", None)
        if found:
            images.extend(found)  # type: ignore[arg-type]
        cleaned.append(copy)
    return cleaned, images


# --------------------------------------------------------------------------- #
# Ollama
# --------------------------------------------------------------------------- #

def _ollama_payload(
    messages: Sequence[Message], model: str, *, stream: bool, json_mode: bool
) -> dict:
    cleaned, images = _split_images(messages)
    if images:
        # Ollama attaches images to the last user turn as base64 strings.
        for message in reversed(cleaned):
            if message.get("role") == "user":
                message["images"] = [
                    base64.b64encode(blob).decode("ascii") for blob in images
                ]
                break

    payload: dict = {
        "model": model,
        "messages": cleaned,
        "stream": stream,
        "options": {
            "temperature": settings.temperature,
            "num_predict": settings.max_tokens,
        },
    }
    if json_mode:
        payload["format"] = "json"
    return payload


async def _ollama_chat(
    messages: Sequence[Message], model: str, *, json_mode: bool
) -> str:
    payload = _ollama_payload(messages, model, stream=False, json_mode=json_mode)
    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        response = await client.post(f"{settings.ollama_host}/api/chat", json=payload)
        if response.status_code != 200:
            raise LLMError(
                f"Ollama returned {response.status_code}: {response.text[:200]}"
            )
        data = response.json()
    return str(data.get("message", {}).get("content", "")).strip()


async def _ollama_stream(
    messages: Sequence[Message], model: str, *, json_mode: bool
) -> AsyncIterator[str]:
    payload = _ollama_payload(messages, model, stream=True, json_mode=json_mode)
    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        async with client.stream(
            "POST", f"{settings.ollama_host}/api/chat", json=payload
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise LLMError(
                    f"Ollama returned {response.status_code}: {body[:200]!r}"
                )
            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                try:
                    chunk = json.loads(line)
                except ValueError:
                    continue
                piece = chunk.get("message", {}).get("content", "")
                if piece:
                    yield piece
                if chunk.get("done"):
                    break


async def _ollama_embed(texts: Sequence[str], model: str) -> List[List[float]]:
    vectors: List[List[float]] = []
    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        for text in texts:
            response = await client.post(
                f"{settings.ollama_host}/api/embeddings",
                json={"model": model, "prompt": text},
            )
            if response.status_code != 200:
                raise LLMError(f"Ollama embeddings returned {response.status_code}")
            vectors.append([float(v) for v in response.json().get("embedding", [])])
    return vectors


# --------------------------------------------------------------------------- #
# OpenAI-compatible
# --------------------------------------------------------------------------- #

def _openai_payload(
    messages: Sequence[Message], model: str, *, stream: bool, json_mode: bool
) -> dict:
    cleaned, images = _split_images(messages)
    if images:
        # The vision format is a content array of typed parts.
        for message in reversed(cleaned):
            if message.get("role") == "user":
                parts: List[dict] = [
                    {"type": "text", "text": str(message.get("content", ""))}
                ]
                for blob in images:
                    encoded = base64.b64encode(blob).decode("ascii")
                    parts.append(
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{encoded}",
                                "detail": "high",
                            },
                        }
                    )
                message["content"] = parts
                break

    payload: dict = {
        "model": model,
        "messages": cleaned,
        "temperature": settings.temperature,
        "max_tokens": settings.max_tokens,
        "stream": stream,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    return payload


def _openai_headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }


async def _openai_chat(
    messages: Sequence[Message], model: str, *, json_mode: bool
) -> str:
    payload = _openai_payload(messages, model, stream=False, json_mode=json_mode)
    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        response = await client.post(
            f"{settings.llm_base_url}/chat/completions",
            headers=_openai_headers(),
            json=payload,
        )
        if response.status_code >= 400:
            raise LLMError(
                f"Provider returned {response.status_code}: {response.text[:300]}"
            )
        data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise LLMError("Provider returned no choices")
    return str(choices[0].get("message", {}).get("content", "")).strip()


async def _openai_stream(
    messages: Sequence[Message], model: str, *, json_mode: bool
) -> AsyncIterator[str]:
    payload = _openai_payload(messages, model, stream=True, json_mode=json_mode)
    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        async with client.stream(
            "POST",
            f"{settings.llm_base_url}/chat/completions",
            headers=_openai_headers(),
            json=payload,
        ) as response:
            if response.status_code >= 400:
                body = await response.aread()
                raise LLMError(
                    f"Provider returned {response.status_code}: {body[:300]!r}"
                )
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    if data == "[DONE]":
                        break
                    continue
                try:
                    chunk = json.loads(data)
                except ValueError:
                    continue
                for choice in chunk.get("choices", []):
                    piece = (choice.get("delta") or {}).get("content")
                    if piece:
                        yield piece


async def _openai_embed(texts: Sequence[str], model: str) -> List[List[float]]:
    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        response = await client.post(
            f"{settings.llm_base_url}/embeddings",
            headers=_openai_headers(),
            json={"model": model, "input": list(texts)},
        )
        if response.status_code >= 400:
            raise LLMError(f"Embeddings returned {response.status_code}")
        data = response.json()
    ordered = sorted(data.get("data", []), key=lambda d: d.get("index", 0))
    return [[float(v) for v in item.get("embedding", [])] for item in ordered]


# --------------------------------------------------------------------------- #
# Offline engine
# --------------------------------------------------------------------------- #

_OFFLINE_BANNER = (
    "_Offline engine: no language model is configured, so this is structured "
    "scaffolding rather than a generated answer. Set `LLM_API_KEY` (any "
    "OpenAI-compatible provider) or run Ollama locally to get real responses._"
)


def _last_user_text(messages: Sequence[Message]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            content = message.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        return str(part.get("text", ""))
    return ""


_STOPWORDS = {
    "the", "a", "an", "of", "in", "on", "for", "to", "and", "or", "is", "are",
    "what", "how", "why", "explain", "me", "my", "i", "about", "please", "can",
    "you", "help", "with", "give", "tell", "generate", "create", "make", "do",
    "does", "this", "that", "it", "using", "into", "from", "be", "have", "has",
    "big", "exam", "test", "next", "week", "month", "day", "days", "tomorrow",
    "got", "get", "coming", "up", "soon", "need", "want", "study", "studying",
    "learn", "learning", "revise", "revision", "prepare", "preparing", "am",
    "write", "short", "warm", "kickoff", "briefing", "max", "words", "summarise",
    "summarize", "student", "must", "understand", "points", "bullet", "using",
    # Instruction verbs and schema nouns that lead internal prompts; never the
    # subject being asked about.
    "respond", "return", "identify", "build", "split", "solve", "describe",
    "transcribe", "convert", "optimise", "optimize", "concept", "concepts",
    "question", "questions", "quiz", "answer", "options", "json", "format",
}


def extract_subject(text: str) -> str:
    """Best-effort subject of a request, for offline output and fallbacks.

    Prefers a run of capitalised words, because in a sentence like "I have a big
    exam on Quantum Physics next week" the proper noun *is* the subject. Falls
    back to stop-word filtering when nothing is capitalised.
    """
    raw = text or ""

    # Internal prompts name their subject in quotes ("Explain 'X'", 'a plan for
    # "X"'). When one is present it is the answer, so trust it over any heuristic.
    # Strip JSON schema examples first: their quoted keys ("questions", "topics")
    # would otherwise look exactly like a quoted subject.
    without_schema = re.sub(r"\{[^{}]*\}", " ", raw)

    # Double and smart quotes delimit plainly. Single quotes need the closing
    # quote to be followed by a non-letter, or a possessive truncates the match:
    # 'Newton's laws of motion' would otherwise yield just "Newton".
    quoted = re.findall(r'["“”]([^"“”]{3,80})["“”]', without_schema)
    quoted += re.findall(r"(?<![A-Za-z])['‘]([^'‘’]{3,80}(?:['’][a-z]+[^'‘’]{0,40})*)['’](?![A-Za-z])",
                         without_schema)

    for candidate in quoted:
        stripped = candidate.strip(" .,:;!?")
        if not stripped or any(ch in stripped for ch in "{}[]:"):
            continue
        # A lone lowercase token directly followed by a colon is a key, not a topic.
        if re.search(rf'"{re.escape(stripped)}"\s*:', raw):
            continue
        if len(stripped.split()) <= 8:
            return stripped

    cleaned = re.sub(r"[^A-Za-z0-9\s\-']", " ", raw).strip()
    if not cleaned:
        return "this topic"

    # Capitalised runs, ignoring a sentence-initial capital.
    words = cleaned.split()
    runs: List[List[str]] = []
    current: List[str] = []
    for index, word in enumerate(words):
        is_proper = word[:1].isupper() and (index > 0 or word.lower() not in _STOPWORDS)
        if is_proper and word.lower() not in _STOPWORDS:
            current.append(word)
        else:
            if current:
                runs.append(current)
            current = []
    if current:
        runs.append(current)

    if runs:
        longest = max(runs, key=len)
        if longest:
            return " ".join(longest[:6])

    kept = [w for w in words if w.lower() not in _STOPWORDS and len(w) > 2]
    return " ".join(kept[:6]).strip() or "this topic"


def _topic_of(text: str) -> str:
    """Cheap topic extraction so offline output at least echoes the subject."""
    return extract_subject(text)


def _offline_json(messages: Sequence[Message]) -> str:
    """Valid JSON for the routes that parse structured output."""
    prompt = _last_user_text(messages)
    topic = _topic_of(prompt)
    lowered = prompt.lower()

    if "question" in lowered and "options" in lowered:
        return json.dumps(
            {
                "questions": [
                    {
                        "id": i + 1,
                        "question": f"Offline placeholder {i + 1}: which statement about {topic} is correct?",
                        "options": [
                            f"A core principle of {topic}",
                            "An unrelated claim",
                            "A common misconception",
                            "None of the above",
                        ],
                        "answer": f"A core principle of {topic}",
                        "explanation": "Configure a model to generate real questions.",
                    }
                    for i in range(5)
                ],
                "offline": True,
            }
        )

    if "objects" in lowered or "scene" in lowered:
        return json.dumps(
            {
                "title": f"{topic} (offline scene)",
                "description": "Placeholder geometry. Configure a model for a real scene.",
                "objects": [
                    {
                        "id": "core",
                        "type": "sphere",
                        "label": topic[:24] or "core",
                        "position": [0, 0, 0],
                        "scale": [0.9, 0.9, 0.9],
                        "color": "#22d3ee",
                        "spin": 0.3,
                    },
                    {
                        "id": "ring",
                        "type": "torus",
                        "label": "relationship",
                        "position": [0, 0, 0],
                        "rotation": [1.4, 0, 0],
                        "scale": [1.8, 1.8, 1.8],
                        "color": "#a78bfa",
                        "spin": 0.15,
                    },
                    {
                        "id": "satellite",
                        "type": "box",
                        "label": "component",
                        "position": [2.2, 0.4, 0],
                        "scale": [0.5, 0.5, 0.5],
                        "color": "#f472b6",
                        "spin": 0.6,
                    },
                ],
                "annotations": [
                    {"target": "core", "text": f"The central idea of {topic}."}
                ],
                "offline": True,
            }
        )

    if "concepts" in lowered or "edges" in lowered:
        return json.dumps(
            {
                "concepts": [{"name": topic, "kind": "topic", "summary": prompt[:160]}],
                "edges": [],
                "offline": True,
            }
        )

    return json.dumps({"result": f"Offline placeholder for {topic}", "offline": True})


def _offline_text(messages: Sequence[Message]) -> str:
    prompt = _last_user_text(messages)
    topic = _topic_of(prompt)
    system = ""
    for message in messages:
        if message.get("role") == "system":
            system = str(message.get("content", ""))
            break

    role_hint = "assistant"
    # Matched on word boundaries: a plain substring test made "revision notes"
    # in the researcher's prompt select the *vision* analyst role.
    for keyword, label in (
        ("tutor", "tutor"),
        ("quiz", "quiz writer"),
        ("code|engineer", "code reviewer"),
        ("document", "document analyst"),
        ("research", "research assistant"),
        ("productivity|coach", "productivity coach"),
        ("planner|curriculum", "study planner"),
        ("vision|image|photo", "vision analyst"),
    ):
        if re.search(rf"\b(?:{keyword})", system.lower()):
            role_hint = label
            break

    return (
        f"### {topic.title()}\n\n"
        f"Acting as your {role_hint}, here is the shape of an answer:\n\n"
        f"1. **Definition** — what {topic} means and the problem it solves.\n"
        f"2. **Mechanism** — the steps or parts that make it work.\n"
        f"3. **Worked example** — one concrete case followed end to end.\n"
        f"4. **Common mistakes** — where learners usually slip.\n"
        f"5. **Check yourself** — a question to test recall.\n\n"
        f"{_OFFLINE_BANNER}"
    )


async def _offline_stream(messages: Sequence[Message], json_mode: bool) -> AsyncIterator[str]:
    text = _offline_json(messages) if json_mode else _offline_text(messages)
    # Chunk on word boundaries so the client's streaming UI is exercised.
    for token in re.findall(r"\S+\s*", text):
        yield token
        await asyncio.sleep(0.006)


def _stable_hash(value: str) -> int:
    """Process-independent hash.

    ``hash()`` on str is salted per interpreter (PYTHONHASHSEED), so a vector
    written by one serverless invocation would not match one computed by the
    next. CRC32 is stable across processes and deployments.
    """
    return zlib.crc32(value.encode("utf-8"))


def _hash_embedding(text: str, dimensions: int = 384) -> List[float]:
    """Deterministic bag-of-features embedding.

    Not semantic, but stable and normalised, so cosine similarity still ranks
    exact and near-duplicate wording sensibly. It keeps retrieval demonstrable
    with no embedding provider and no extra dependency.
    """
    vector = [0.0] * dimensions
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    for token in tokens:
        for gram in {token, token[:4], token[:6]}:
            if not gram:
                continue
            vector[_stable_hash(gram) % dimensions] += 1.0
    for index in range(len(tokens) - 1):
        bigram = f"{tokens[index]}_{tokens[index + 1]}"
        vector[_stable_hash(bigram) % dimensions] += 0.5

    norm = math.sqrt(sum(v * v for v in vector))
    if norm == 0:
        rng = random.Random(text)
        return [rng.uniform(-0.01, 0.01) for _ in range(dimensions)]
    return [v / norm for v in vector]


# --------------------------------------------------------------------------- #
# Public gateway
# --------------------------------------------------------------------------- #

async def complete(
    prompt: str,
    *,
    system: str = "",
    history: Optional[Sequence[Message]] = None,
    images: Optional[Sequence[bytes]] = None,
    json_mode: bool = False,
    provider: Optional[str] = None,
) -> Completion:
    """One-shot completion. Never raises: falls back to the offline engine."""
    messages = build_messages(prompt, system=system, history=history, images=images)
    chosen = await resolve_provider(provider)
    vision = bool(images)
    notes: List[str] = []

    if chosen != "offline":
        model = model_for(chosen, vision=vision)
        try:
            if chosen == "ollama":
                text = await _ollama_chat(messages, model, json_mode=json_mode)
            else:
                text = await _openai_chat(messages, model, json_mode=json_mode)
            if text:
                return Completion(text=text, provider=chosen, model=model)
            notes.append(f"{chosen} returned an empty response")
        except Exception as exc:  # noqa: BLE001 - degrade instead of 500
            logger.warning("provider %s failed: %s", chosen, exc)
            notes.append(f"{chosen} failed: {exc}")

    text = _offline_json(messages) if json_mode else _offline_text(messages)
    return Completion(
        text=text, provider="offline", model="neura-offline", degraded=True, notes=notes
    )


async def stream(
    prompt: str,
    *,
    system: str = "",
    history: Optional[Sequence[Message]] = None,
    images: Optional[Sequence[bytes]] = None,
    json_mode: bool = False,
    provider: Optional[str] = None,
) -> AsyncIterator[dict]:
    """Yield ``{"type": ...}`` events: ``meta``, ``delta``, ``error``, ``done``.

    The router frames these as SSE. Streaming replaced the old WebSocket chat
    because Vercel Functions do not support WebSocket upgrades.
    """
    messages = build_messages(prompt, system=system, history=history, images=images)
    chosen = await resolve_provider(provider)
    vision = bool(images)
    model = model_for(chosen, vision=vision)

    yield {"type": "meta", "provider": chosen, "model": model}

    if chosen != "offline":
        emitted = False
        try:
            generator = (
                _ollama_stream(messages, model, json_mode=json_mode)
                if chosen == "ollama"
                else _openai_stream(messages, model, json_mode=json_mode)
            )
            async for piece in generator:
                emitted = True
                yield {"type": "delta", "text": piece}
            if emitted:
                yield {"type": "done", "provider": chosen, "model": model}
                return
        except Exception as exc:  # noqa: BLE001
            logger.warning("stream via %s failed: %s", chosen, exc)
            if emitted:
                # Partial answer already on screen; report and stop rather than
                # appending unrelated offline text to it.
                yield {"type": "error", "message": str(exc)}
                yield {"type": "done", "provider": chosen, "model": model}
                return
            yield {"type": "meta", "provider": "offline", "model": "neura-offline",
                   "degraded": True, "reason": str(exc)}

    async for piece in _offline_stream(messages, json_mode):
        yield {"type": "delta", "text": piece}
    yield {"type": "done", "provider": "offline", "model": "neura-offline", "degraded": True}


async def embed(texts: Sequence[str], *, provider: Optional[str] = None) -> List[List[float]]:
    """Embed texts, degrading to the deterministic hash embedding."""
    if not texts:
        return []
    chosen = await resolve_provider(provider)
    if chosen != "offline":
        model = model_for(chosen, embed=True)
        try:
            if chosen == "ollama":
                vectors = await _ollama_embed(texts, model)
            else:
                vectors = await _openai_embed(texts, model)
            if vectors and all(vectors):
                return vectors
        except Exception as exc:  # noqa: BLE001
            logger.info("embeddings via %s unavailable (%s); using hash vectors", chosen, exc)
    return [_hash_embedding(text) for text in texts]


def parse_json(text: str) -> Optional[object]:
    """Best-effort JSON extraction from model output.

    Models wrap JSON in prose or fences even when told not to, so try the whole
    string, then a fenced block, then the outermost brace/bracket pair.
    """
    candidate = text.strip()
    if not candidate:
        return None

    attempts = [candidate]

    fenced = re.search(r"```(?:json)?\s*(.+?)```", candidate, re.DOTALL)
    if fenced:
        attempts.append(fenced.group(1).strip())

    for opener, closer in (("{", "}"), ("[", "]")):
        start = candidate.find(opener)
        end = candidate.rfind(closer)
        if start != -1 and end > start:
            attempts.append(candidate[start : end + 1])

    for attempt in attempts:
        try:
            return json.loads(attempt)
        except ValueError:
            continue
    return None


async def complete_json(
    prompt: str,
    *,
    system: str = "",
    fallback: Optional[object] = None,
    provider: Optional[str] = None,
) -> tuple[object, Completion]:
    """Completion that is guaranteed to hand back a parsed object.

    Returns ``fallback`` (or ``{}``) if the model produced unparseable output,
    so callers never have to guard against ``None``.
    """
    schema_hint = (
        f"{system}\n\nReturn ONLY valid JSON with no prose and no markdown fences."
    ).strip()
    completion = await complete(
        prompt, system=schema_hint, json_mode=True, provider=provider
    )
    parsed = parse_json(completion.text)
    if parsed is None:
        completion.degraded = True
        completion.notes.append("model output was not valid JSON")
        parsed = fallback if fallback is not None else {}
    return parsed, completion


async def capabilities() -> dict:
    """What this deployment can actually do right now."""
    provider = await resolve_provider()
    return {
        **settings.public_summary(),
        "active_provider": provider,
        "active_model": model_for(provider),
        "vision_available": provider != "offline",
        "streaming": True,
    }

"""Key/value + list persistence that works in both long-lived and serverless runs.

A plain module-level dict is fine when uvicorn owns the process, but on Vercel
each request can land in a fresh sandbox, so anything held in memory disappears
between the upload of a PDF and the question about it. When Upstash Redis
credentials are present we go through its REST API (stateless HTTP, no socket
pooling); otherwise we fall back to the dict so local development needs zero
infrastructure.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, List, Optional

import httpx

from .config import settings


class _MemoryBackend:
    """Process-local store with TTL. Used for local dev and as a safety net."""

    def __init__(self) -> None:
        self._data: Dict[str, tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    def _alive(self, key: str) -> bool:
        entry = self._data.get(key)
        if entry is None:
            return False
        expires_at, _ = entry
        if expires_at and expires_at < time.time():
            self._data.pop(key, None)
            return False
        return True

    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            return self._data[key][1] if self._alive(key) else None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        async with self._lock:
            expires_at = time.time() + ttl if ttl else 0.0
            self._data[key] = (expires_at, value)

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._data.pop(key, None)

    async def list_push(self, key: str, value: Any, cap: int = 500) -> None:
        async with self._lock:
            current: List[Any] = self._data[key][1] if self._alive(key) else []
            current.append(value)
            if len(current) > cap:
                current = current[-cap:]
            expires_at = time.time() + settings.kv_ttl_seconds
            self._data[key] = (expires_at, current)

    async def list_all(self, key: str) -> List[Any]:
        async with self._lock:
            return list(self._data[key][1]) if self._alive(key) else []

    async def keys(self, prefix: str) -> List[str]:
        async with self._lock:
            return [k for k in self._data if k.startswith(prefix) and self._alive(k)]


class _RedisRestBackend:
    """Upstash Redis via its HTTP API.

    Values are JSON-encoded strings; lists are Redis lists so appends stay
    atomic across concurrent function invocations.
    """

    def __init__(self, url: str, token: str) -> None:
        self._url = url
        self._headers = {"Authorization": f"Bearer {token}"}

    async def _command(self, *args: Any) -> Any:
        payload = [str(a) for a in args]
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                self._url, headers=self._headers, json=payload
            )
            response.raise_for_status()
            return response.json().get("result")

    async def get(self, key: str) -> Optional[Any]:
        raw = await self._command("GET", key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return raw

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        encoded = json.dumps(value)
        if ttl:
            await self._command("SET", key, encoded, "EX", ttl)
        else:
            await self._command("SET", key, encoded)

    async def delete(self, key: str) -> None:
        await self._command("DEL", key)

    async def list_push(self, key: str, value: Any, cap: int = 500) -> None:
        await self._command("RPUSH", key, json.dumps(value))
        await self._command("LTRIM", key, -cap, -1)
        await self._command("EXPIRE", key, settings.kv_ttl_seconds)

    async def list_all(self, key: str) -> List[Any]:
        raw = await self._command("LRANGE", key, 0, -1) or []
        items = []
        for item in raw:
            try:
                items.append(json.loads(item))
            except (TypeError, ValueError):
                items.append(item)
        return items

    async def keys(self, prefix: str) -> List[str]:
        # SCAN rather than KEYS: KEYS blocks the server on large databases.
        cursor, found = "0", []
        for _ in range(20):  # bounded so a huge keyspace cannot hang a request
            result = await self._command("SCAN", cursor, "MATCH", f"{prefix}*", "COUNT", 200)
            if not isinstance(result, list) or len(result) != 2:
                break
            cursor, batch = str(result[0]), result[1] or []
            found.extend(batch)
            if cursor == "0":
                break
        return found


class Store:
    """Namespaced facade over whichever backend is configured."""

    def __init__(self) -> None:
        if settings.has_kv:
            self._backend: Any = _RedisRestBackend(
                settings.kv_rest_url, settings.kv_rest_token
            )
            self.kind = "redis"
        else:
            self._backend = _MemoryBackend()
            self.kind = "memory"
        self._fallback = _MemoryBackend()

    def _key(self, namespace: str, key: str) -> str:
        return f"{settings.kv_prefix}:{namespace}:{key}"

    async def _safe(self, coro_factory, fallback_factory):
        """Run against the real backend, degrade to memory if it errors.

        A Redis outage should slow the app down, never 500 it.
        """
        try:
            return await coro_factory(self._backend)
        except Exception:  # noqa: BLE001 - deliberate catch-all for resilience
            return await fallback_factory(self._fallback)

    async def get(self, namespace: str, key: str) -> Optional[Any]:
        full = self._key(namespace, key)
        return await self._safe(lambda b: b.get(full), lambda b: b.get(full))

    async def set(
        self, namespace: str, key: str, value: Any, ttl: Optional[int] = None
    ) -> None:
        full = self._key(namespace, key)
        ttl = ttl if ttl is not None else settings.kv_ttl_seconds
        await self._safe(
            lambda b: b.set(full, value, ttl), lambda b: b.set(full, value, ttl)
        )

    async def delete(self, namespace: str, key: str) -> None:
        full = self._key(namespace, key)
        await self._safe(lambda b: b.delete(full), lambda b: b.delete(full))

    async def push(self, namespace: str, key: str, value: Any, cap: int = 500) -> None:
        full = self._key(namespace, key)
        await self._safe(
            lambda b: b.list_push(full, value, cap),
            lambda b: b.list_push(full, value, cap),
        )

    async def list(self, namespace: str, key: str) -> List[Any]:
        full = self._key(namespace, key)
        return await self._safe(lambda b: b.list_all(full), lambda b: b.list_all(full))

    async def keys(self, namespace: str) -> List[str]:
        prefix = f"{settings.kv_prefix}:{namespace}:"
        raw = await self._safe(lambda b: b.keys(prefix), lambda b: b.keys(prefix))
        return [k[len(prefix) :] for k in raw]


store = Store()

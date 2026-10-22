"""Hyper-personalised memory: a vector index plus a concept graph.

Two structures cooperate:

*Vector index* — chunks of everything the learner has read or discussed, with
embeddings, for "what did we say about this?" retrieval.

*Concept graph* — named concepts as nodes, typed relationships as edges, and a
per-concept **mastery** score (0..1) with an exponential moving average over quiz
and self-report signals. This is what lets the tutor say "you struggled with
chain rule in April, so let me lean on that" when a physics question arrives
today: :func:`build_learner_context` walks from the current question's concepts
to their graph neighbours and surfaces the weak ones.

Storage is pluggable. Default is the app's KV store (Redis if configured, else
in-process). If ``NEO4J_URI`` is set the graph half is mirrored into Neo4j via
its HTTP Query API, so no driver dependency is added to the serverless bundle.
"""

from __future__ import annotations

import logging
import math
import re
import time
import uuid
from collections.abc import Sequence

import httpx

from . import llm
from .config import settings
from .store import store

logger = logging.getLogger("neura.memory")

CHUNKS = "chunks"
GRAPH = "graph"
PROFILE = "profile"

MAX_CHUNKS_PER_USER = 400
CHUNK_TARGET_CHARS = 900
MASTERY_ALPHA = 0.4  # weight of the newest signal in the moving average
WEAK_THRESHOLD = 0.55


# --------------------------------------------------------------------------- #
# Chunking + similarity
# --------------------------------------------------------------------------- #

def chunk_text(text: str, target: int = CHUNK_TARGET_CHARS) -> list[str]:
    """Split on paragraph boundaries, packing up to ~``target`` characters.

    Paragraph-aware packing keeps related sentences together, which matters more
    for retrieval quality than hitting an exact chunk size.
    """
    cleaned = re.sub(r"\n{3,}", "\n\n", (text or "").strip())
    if not cleaned:
        return []

    paragraphs = [p.strip() for p in cleaned.split("\n\n") if p.strip()]
    chunks: list[str] = []
    buffer = ""

    for paragraph in paragraphs:
        if len(paragraph) > target * 2:
            # One huge paragraph: fall back to sentence splitting.
            sentences = re.split(r"(?<=[.!?])\s+", paragraph)
            for sentence in sentences:
                if len(buffer) + len(sentence) + 1 > target and buffer:
                    chunks.append(buffer.strip())
                    buffer = ""
                buffer += sentence + " "
            continue

        if len(buffer) + len(paragraph) + 2 > target and buffer:
            chunks.append(buffer.strip())
            buffer = ""
        buffer += paragraph + "\n\n"

    if buffer.strip():
        chunks.append(buffer.strip())
    return chunks


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b:
        return 0.0
    length = min(len(a), len(b))
    dot = sum(a[i] * b[i] for i in range(length))
    norm_a = math.sqrt(sum(a[i] * a[i] for i in range(length)))
    norm_b = math.sqrt(sum(b[i] * b[i] for i in range(length)))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# --------------------------------------------------------------------------- #
# Optional Neo4j mirror
# --------------------------------------------------------------------------- #

async def _neo4j_query(cypher: str, params: dict | None = None) -> dict | None:
    """Run Cypher over Neo4j's HTTP Query API.

    HTTP rather than Bolt keeps the ``neo4j`` driver out of requirements, which
    keeps the Vercel function bundle small and cold starts fast.
    """
    if not settings.has_neo4j:
        return None

    base = settings.neo4j_uri
    # Accept bolt:// / neo4j+s:// URIs by rewriting to the HTTP endpoint.
    base = re.sub(r"^(bolt|neo4j)(\+s|\+ssc)?://", "https://", base).rstrip("/")
    if ":7687" in base:
        base = base.replace(":7687", ":7473")
    url = f"{base}/db/{settings.neo4j_database}/query/v2"

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.post(
                url,
                auth=(settings.neo4j_user, settings.neo4j_password),
                headers={"Content-Type": "application/json"},
                json={"statement": cypher, "parameters": params or {}},
            )
            if response.status_code >= 400:
                logger.warning("neo4j %s: %s", response.status_code, response.text[:200])
                return None
            return response.json()
    except Exception as exc:
        logger.info("neo4j unavailable (%s)", exc)
        return None


async def _mirror_concept(user_id: str, concept: dict) -> None:
    await _neo4j_query(
        """
        MERGE (u:Learner {id: $user})
        MERGE (c:Concept {key: $key})
          SET c.name = $name, c.kind = $kind, c.summary = $summary
        MERGE (u)-[r:STUDIES]->(c)
          SET r.mastery = $mastery, r.updatedAt = $updated
        """,
        {
            "user": user_id,
            "key": concept["key"],
            "name": concept["name"],
            "kind": concept.get("kind", "concept"),
            "summary": concept.get("summary", ""),
            "mastery": concept.get("mastery", 0.5),
            "updated": concept.get("updated_at"),
        },
    )


async def _mirror_edge(source: str, target: str, relation: str) -> None:
    await _neo4j_query(
        """
        MERGE (a:Concept {key: $source})
        MERGE (b:Concept {key: $target})
        MERGE (a)-[r:RELATED {type: $relation}]->(b)
          SET r.weight = coalesce(r.weight, 0) + 1
        """,
        {"source": source, "target": target, "relation": relation},
    )


# --------------------------------------------------------------------------- #
# Graph primitives
# --------------------------------------------------------------------------- #

def concept_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-") or "unknown"


async def _load_graph(user_id: str) -> dict:
    graph = await store.get(GRAPH, user_id)
    if not isinstance(graph, dict):
        graph = {"concepts": {}, "edges": []}
    graph.setdefault("concepts", {})
    graph.setdefault("edges", [])
    return graph


async def _save_graph(user_id: str, graph: dict) -> None:
    await store.set(GRAPH, user_id, graph)


async def upsert_concepts(
    user_id: str,
    concepts: Sequence[dict],
    edges: Sequence[dict] = (),
) -> dict:
    """Merge concepts and relationships into the learner's graph."""
    graph = await _load_graph(user_id)
    now = time.time()

    for raw in concepts:
        name = str(raw.get("name") or "").strip()
        if not name:
            continue
        key = concept_key(name)
        existing = graph["concepts"].get(key, {})
        merged = {
            "key": key,
            "name": name,
            "kind": str(raw.get("kind") or existing.get("kind") or "concept"),
            "summary": str(raw.get("summary") or existing.get("summary") or "")[:400],
            "mastery": float(existing.get("mastery", 0.5)),
            "encounters": int(existing.get("encounters", 0)) + 1,
            "first_seen": existing.get("first_seen", now),
            "updated_at": now,
            "sources": list(
                dict.fromkeys(
                    [*existing.get("sources", []), *(raw.get("sources") or [])]
                )
            )[:12],
        }
        graph["concepts"][key] = merged
        await _mirror_concept(user_id, merged)

    seen = {(e["source"], e["target"], e.get("relation", "related")) for e in graph["edges"]}
    for raw in edges:
        source = concept_key(str(raw.get("source") or ""))
        target = concept_key(str(raw.get("target") or ""))
        relation = str(raw.get("relation") or "related")[:40]
        if source == "unknown" or target == "unknown" or source == target:
            continue
        # Only connect concepts we actually know, so the graph stays coherent.
        if source not in graph["concepts"] or target not in graph["concepts"]:
            continue
        if (source, target, relation) in seen:
            continue
        graph["edges"].append(
            {"source": source, "target": target, "relation": relation, "weight": 1}
        )
        seen.add((source, target, relation))
        await _mirror_edge(source, target, relation)

    await _save_graph(user_id, graph)
    return graph


async def record_mastery(
    user_id: str, name: str, score: float, *, signal: str = "quiz"
) -> dict:
    """Fold a new performance signal into a concept's mastery score.

    Exponential moving average rather than a plain average: recent performance
    should dominate, because the point is to model what the learner knows *now*.
    """
    score = max(0.0, min(1.0, float(score)))
    graph = await _load_graph(user_id)
    key = concept_key(name)

    concept = graph["concepts"].get(key)
    if concept is None:
        concept = {
            "key": key,
            "name": name,
            "kind": "concept",
            "summary": "",
            "mastery": score,
            "encounters": 1,
            "first_seen": time.time(),
            "sources": [],
        }
    else:
        previous = float(concept.get("mastery", 0.5))
        concept["mastery"] = round(
            previous * (1 - MASTERY_ALPHA) + score * MASTERY_ALPHA, 4
        )
        concept["encounters"] = int(concept.get("encounters", 0)) + 1

    concept["updated_at"] = time.time()
    history = list(concept.get("history", []))
    history.append({"at": concept["updated_at"], "score": score, "signal": signal})
    concept["history"] = history[-20:]
    graph["concepts"][key] = concept

    await _save_graph(user_id, graph)
    await _mirror_concept(user_id, concept)
    return concept


async def neighbours(user_id: str, keys: Sequence[str], depth: int = 1) -> list[dict]:
    """Concepts reachable from ``keys`` within ``depth`` hops (either direction)."""
    graph = await _load_graph(user_id)
    frontier = {k for k in keys if k in graph["concepts"]}
    seen = set(frontier)

    for _ in range(max(0, depth)):
        next_frontier: set[str] = set()
        for edge in graph["edges"]:
            if edge["source"] in frontier and edge["target"] not in seen:
                next_frontier.add(edge["target"])
            if edge["target"] in frontier and edge["source"] not in seen:
                next_frontier.add(edge["source"])
        if not next_frontier:
            break
        seen |= next_frontier
        frontier = next_frontier

    return [graph["concepts"][k] for k in seen if k in graph["concepts"]]


async def weak_concepts(user_id: str, limit: int = 6) -> list[dict]:
    graph = await _load_graph(user_id)
    scored = [
        c
        for c in graph["concepts"].values()
        if float(c.get("mastery", 0.5)) < WEAK_THRESHOLD and c.get("encounters", 0) > 0
    ]
    scored.sort(key=lambda c: (float(c.get("mastery", 0.5)), -float(c.get("updated_at", 0))))
    return scored[:limit]


# --------------------------------------------------------------------------- #
# Vector index
# --------------------------------------------------------------------------- #

async def ingest(
    user_id: str,
    text: str,
    *,
    source: str = "chat",
    title: str = "",
    extract_concepts: bool = True,
) -> dict:
    """Chunk, embed and store text; optionally mine it for graph concepts."""
    chunks = chunk_text(text)
    if not chunks:
        return {"chunks_added": 0, "concepts": [], "source": source}

    # Cap work per request so a 300-page PDF cannot blow the function timeout.
    chunks = chunks[:60]
    vectors = await llm.embed(chunks)
    now = time.time()
    doc_id = uuid.uuid4().hex[:12]

    for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=False)):
        await store.push(
            CHUNKS,
            user_id,
            {
                "id": f"{doc_id}-{index}",
                "text": chunk,
                "vector": [round(v, 5) for v in vector],
                "source": source,
                "title": title or source,
                "at": now,
            },
            cap=MAX_CHUNKS_PER_USER,
        )

    concepts: list[dict] = []
    if extract_concepts:
        concepts = await _extract_concepts(text[:6000], source=source)
        if concepts:
            await upsert_concepts(
                user_id,
                concepts,
                _infer_edges(concepts),
            )

    return {
        "chunks_added": len(chunks),
        "concepts": [c["name"] for c in concepts],
        "source": source,
        "doc_id": doc_id,
    }


async def _extract_concepts(text: str, *, source: str) -> list[dict]:
    """Ask the model to name the concepts in a passage."""
    if not text.strip():
        return []

    parsed, _ = await llm.complete_json(
        "Identify the 3-7 most important named concepts in the passage below. "
        'Respond as {"concepts":[{"name":"...","kind":"topic|formula|skill|definition",'
        '"summary":"one sentence"}]}.\n\nPassage:\n' + text,
        system="You extract study concepts for a knowledge graph.",
        fallback={"concepts": []},
    )

    raw = parsed.get("concepts") if isinstance(parsed, dict) else None
    if not isinstance(raw, list):
        return []

    concepts: list[dict] = []
    for item in raw[:7]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name or len(name) > 80:
            continue
        concepts.append(
            {
                "name": name,
                "kind": str(item.get("kind") or "concept"),
                "summary": str(item.get("summary") or "")[:300],
                "sources": [source],
            }
        )
    return concepts


def _infer_edges(concepts: Sequence[dict]) -> list[dict]:
    """Link concepts that arrived together as ``co-occurs``.

    Co-occurrence in one document is weak evidence but it is real, and it makes
    the graph traversable immediately without a second model round-trip.
    """
    edges: list[dict] = []
    names = [c["name"] for c in concepts]
    for i, source in enumerate(names):
        for target in names[i + 1 :]:
            edges.append(
                {
                    "source": source,
                    "target": target,
                    "relation": "co-occurs",
                }
            )
    return edges[:20]


async def search(user_id: str, query: str, *, k: int = 5) -> list[dict]:
    """Rank stored chunks against ``query`` by cosine similarity."""
    chunks = await store.list(CHUNKS, user_id)
    if not chunks:
        return []

    query_vector = (await llm.embed([query]))[0]
    scored = []
    for chunk in chunks:
        vector = chunk.get("vector") or []
        score = cosine(query_vector, vector)
        if score > 0.02:
            scored.append({**{key: chunk[key] for key in chunk if key != "vector"},
                           "score": round(score, 4)})

    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:k]


# --------------------------------------------------------------------------- #
# Learner profile + prompt assembly
# --------------------------------------------------------------------------- #

async def get_profile(user_id: str) -> dict:
    profile = await store.get(PROFILE, user_id)
    if not isinstance(profile, dict):
        profile = {}
    return {
        "style": profile.get("style", "balanced"),
        "level": profile.get("level", "intermediate"),
        "goals": profile.get("goals", []),
        "tone": profile.get("tone", "encouraging"),
        "updated_at": profile.get("updated_at"),
    }


async def update_profile(user_id: str, patch: dict) -> dict:
    profile = await get_profile(user_id)
    for field in ("style", "level", "tone"):
        if patch.get(field):
            profile[field] = str(patch[field])[:40]
    if isinstance(patch.get("goals"), list):
        profile["goals"] = [str(g)[:120] for g in patch["goals"][:10]]
    profile["updated_at"] = time.time()
    await store.set(PROFILE, user_id, profile)
    return profile


async def build_learner_context(user_id: str, question: str) -> dict:
    """Assemble the personalisation block injected into a tutoring prompt.

    Combines three signals: semantically similar past material, concepts related
    to the question in the graph, and the learner's weakest concepts overall.
    """
    hits = await search(user_id, question, k=4)
    profile = await get_profile(user_id)

    graph = await _load_graph(user_id)
    question_words = set(re.findall(r"[a-z]{4,}", question.lower()))
    matched_keys = [
        key
        for key, concept in graph["concepts"].items()
        if question_words & set(re.findall(r"[a-z]{4,}", concept["name"].lower()))
    ]
    related = await neighbours(user_id, matched_keys, depth=1)
    weak = await weak_concepts(user_id, limit=5)

    lines: list[str] = []
    if hits:
        lines.append("Material this learner has already studied:")
        for hit in hits:
            snippet = re.sub(r"\s+", " ", hit["text"])[:260]
            lines.append(f"- [{hit['title']}] {snippet}")

    if weak:
        readable = ", ".join(
            f"{c['name']} (mastery {float(c.get('mastery', 0.5)):.0%})" for c in weak
        )
        lines.append(
            "Known weak points — connect back to these when they are relevant, "
            f"and do not assume fluency in them: {readable}."
        )

    if related:
        names = ", ".join(c["name"] for c in related[:8])
        lines.append(f"Concepts already linked to this question in their graph: {names}.")

    lines.append(
        f"Learner profile: level={profile['level']}, "
        f"preferred style={profile['style']}, tone={profile['tone']}."
    )

    return {
        "prompt_block": "\n".join(lines),
        "hits": hits,
        "weak": weak,
        "related": [c["name"] for c in related[:8]],
        "profile": profile,
        "has_memory": bool(hits or weak or related),
    }


async def graph_snapshot(user_id: str) -> dict:
    """Nodes and edges shaped for the 3D graph view in the web app."""
    graph = await _load_graph(user_id)
    concepts = list(graph["concepts"].values())
    chunks = await store.list(CHUNKS, user_id)

    return {
        "nodes": [
            {
                "id": c["key"],
                "name": c["name"],
                "kind": c.get("kind", "concept"),
                "summary": c.get("summary", ""),
                "mastery": round(float(c.get("mastery", 0.5)), 3),
                "encounters": int(c.get("encounters", 0)),
                "updated_at": c.get("updated_at"),
            }
            for c in concepts
        ],
        "edges": graph["edges"],
        "stats": {
            "concepts": len(concepts),
            "edges": len(graph["edges"]),
            "chunks": len(chunks),
            "weak": len([c for c in concepts if float(c.get("mastery", 0.5)) < WEAK_THRESHOLD]),
            "backend": "neo4j+kv" if settings.has_neo4j else store.kind,
        },
    }


async def reset(user_id: str) -> None:
    await store.delete(CHUNKS, user_id)
    await store.delete(GRAPH, user_id)
    await store.delete(PROFILE, user_id)

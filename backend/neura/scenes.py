"""Turn a natural-language question into a validated 3D scene specification.

"How does a car engine work?" becomes a JSON scene the browser renders with
react-three-fiber and can enter in AR/VR via WebXR.

The contract is deliberately narrow -- a fixed set of primitives, clamped
numbers, validated colours -- for two reasons. Rendering arbitrary model-authored
code in the browser would be an injection risk, and a constrained schema is one
a small local model can actually satisfy. Anything the model gets wrong is
repaired here rather than crashing the renderer.
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any, Dict, List, Optional, Sequence

from . import llm

logger = logging.getLogger("neura.scenes")

PRIMITIVES = {
    "box", "sphere", "cylinder", "cone", "torus", "plane",
    "tetrahedron", "octahedron", "icosahedron", "capsule", "ring", "text",
}

MAX_OBJECTS = 24
COORD_LIMIT = 12.0
SCALE_MIN, SCALE_MAX = 0.05, 8.0

_HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

PALETTE = [
    "#22d3ee", "#a78bfa", "#f472b6", "#fbbf24",
    "#34d399", "#60a5fa", "#fb923c", "#e879f9",
]

SYSTEM = """You design compact 3D diagrams that explain concepts.

Use only these primitive types: box, sphere, cylinder, cone, torus, plane,
tetrahedron, octahedron, icosahedron, capsule, ring, text.

Rules:
- Build the diagram from labelled parts arranged so their spatial relationship
  carries meaning (stacked layers, an orbit, a chain, a cross-section).
- Coordinates in the range -8..8, with y=0 as the ground plane.
- Every object needs a short human label (2-4 words).
- 6 to 16 objects. Prefer clarity over decoration.
- `spin` is radians per second (0 for static parts).
- `connections` draw lines between object ids to show flow or linkage.

Respond as JSON only:
{"title":"...","description":"1-2 sentences","objects":[{"id":"piston-1",
"type":"cylinder","label":"Piston","position":[0,1,0],"rotation":[0,0,0],
"scale":[1,1,1],"color":"#22d3ee","opacity":1,"spin":0}],
"connections":[{"from":"id","to":"id","label":"drives"}],
"annotations":[{"target":"id","text":"what this part does"}],
"camera":{"position":[6,4,6]}}"""


def _number(value: Any, default: float, low: float, high: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number or number in (float("inf"), float("-inf")):  # NaN / inf
        return default
    return max(low, min(high, number))


def _vec3(value: Any, default: Sequence[float], low: float, high: float) -> List[float]:
    if isinstance(value, (list, tuple)) and len(value) >= 3:
        return [_number(value[i], float(default[i]), low, high) for i in range(3)]
    if isinstance(value, (int, float)):
        # A single number for scale is a common and reasonable model shortcut.
        uniform = _number(value, float(default[0]), low, high)
        return [uniform, uniform, uniform]
    return [float(v) for v in default[:3]]


def _colour(value: Any, index: int) -> str:
    text = str(value or "").strip()
    if _HEX.match(text):
        return text
    named = {
        "red": "#ef4444", "blue": "#3b82f6", "green": "#22c55e",
        "yellow": "#facc15", "orange": "#fb923c", "purple": "#a855f7",
        "pink": "#ec4899", "cyan": "#22d3ee", "white": "#f8fafc",
        "grey": "#94a3b8", "gray": "#94a3b8", "black": "#1e293b",
        "silver": "#cbd5e1", "gold": "#f59e0b", "brown": "#92400e",
    }
    if text.lower() in named:
        return named[text.lower()]
    return PALETTE[index % len(PALETTE)]


def _slug(value: Any, fallback: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(value or "")).strip("-").lower()
    return slug[:40] or fallback


def validate(raw: Any, *, prompt: str = "") -> Dict[str, Any]:
    """Coerce model output into a renderable scene. Always returns a valid scene."""
    if not isinstance(raw, dict):
        return fallback_scene(prompt)

    normalised = _normalise(raw, prompt=prompt)
    if normalised is None:
        return fallback_scene(prompt, title=str(raw.get("title") or ""))
    return normalised


def _normalise(raw: Dict[str, Any], *, prompt: str = "") -> Optional[Dict[str, Any]]:
    """Clamp and repair a scene dict. ``None`` when there is nothing renderable.

    Kept separate from :func:`validate` so :func:`fallback_scene` can reuse it
    without recursing back into the fallback path.
    """
    objects: List[dict] = []
    used_ids: set[str] = set()

    for index, item in enumerate(raw.get("objects") or []):
        if not isinstance(item, dict) or len(objects) >= MAX_OBJECTS:
            continue

        kind = str(item.get("type") or "box").lower().strip()
        if kind not in PRIMITIVES:
            kind = "box"

        object_id = _slug(item.get("id") or item.get("label"), f"part-{index + 1}")
        while object_id in used_ids:
            object_id = f"{object_id}-{len(used_ids)}"
        used_ids.add(object_id)

        objects.append(
            {
                "id": object_id,
                "type": kind,
                "label": str(item.get("label") or "").strip()[:48],
                "position": _vec3(item.get("position"), (0, 0, 0), -COORD_LIMIT, COORD_LIMIT),
                "rotation": _vec3(item.get("rotation"), (0, 0, 0), -6.3, 6.3),
                "scale": _vec3(item.get("scale"), (1, 1, 1), SCALE_MIN, SCALE_MAX),
                "color": _colour(item.get("color"), index),
                "opacity": _number(item.get("opacity"), 1.0, 0.1, 1.0),
                "spin": _number(item.get("spin"), 0.0, -4.0, 4.0),
                "metalness": _number(item.get("metalness"), 0.2, 0.0, 1.0),
                "roughness": _number(item.get("roughness"), 0.45, 0.0, 1.0),
            }
        )

    if not objects:
        return None

    valid_ids = {o["id"] for o in objects}

    connections = []
    for item in raw.get("connections") or []:
        if not isinstance(item, dict):
            continue
        source = _slug(item.get("from") or item.get("source"), "")
        target = _slug(item.get("to") or item.get("target"), "")
        # Drop dangling references rather than letting the renderer read undefined.
        if source in valid_ids and target in valid_ids and source != target:
            connections.append(
                {"from": source, "to": target, "label": str(item.get("label") or "")[:32]}
            )

    annotations = []
    for item in raw.get("annotations") or []:
        if not isinstance(item, dict):
            continue
        target = _slug(item.get("target"), "")
        text = str(item.get("text") or "").strip()
        if text:
            annotations.append(
                {
                    "target": target if target in valid_ids else objects[0]["id"],
                    "text": text[:280],
                }
            )

    camera = raw.get("camera") if isinstance(raw.get("camera"), dict) else {}

    return {
        "title": str(raw.get("title") or prompt or "Generated scene")[:120],
        "description": str(raw.get("description") or "")[:400],
        "objects": objects,
        "connections": connections[:40],
        "annotations": annotations[:24],
        "camera": {
            "position": _vec3(camera.get("position"), (6, 4, 6), -30, 30),
            "target": _vec3(camera.get("target"), (0, 0, 0), -10, 10),
        },
        "grid": bool(raw.get("grid", True)),
        "valid": True,
    }


def fallback_scene(prompt: str, *, title: str = "") -> Dict[str, Any]:
    """A meaningful scene when generation fails: a labelled hub and spokes."""
    topic = (title or prompt or "Concept").strip()[:60] or "Concept"
    objects = [
        {
            "id": "core",
            "type": "icosahedron",
            "label": topic[:24],
            "position": [0, 1.2, 0],
            "rotation": [0, 0, 0],
            "scale": [1.1, 1.1, 1.1],
            "color": "#22d3ee",
            "opacity": 1.0,
            "spin": 0.25,
            "metalness": 0.3,
            "roughness": 0.35,
        }
    ]
    spokes = ["Definition", "Mechanism", "Example", "Limitation"]
    for index, label in enumerate(spokes):
        angle = (index / len(spokes)) * 6.28318
        objects.append(
            {
                "id": f"spoke-{index + 1}",
                "type": "box",
                "label": label,
                "position": [
                    round(3.2 * math.cos(angle), 3),
                    1.2,
                    round(3.2 * math.sin(angle), 3),
                ],
                "rotation": [0, -angle, 0],
                "scale": [0.8, 0.8, 0.8],
                "color": PALETTE[(index + 1) % len(PALETTE)],
                "opacity": 1.0,
                "spin": 0.0,
                "metalness": 0.2,
                "roughness": 0.5,
            }
        )

    # Normalised through the same validator as model output, so the fallback
    # cannot drift from the contract the renderer relies on (all-float vectors,
    # unique ids, no dangling connections).
    scene = _normalise(
        {
            "title": f"{topic} — structural overview",
            "description": (
                "Fallback diagram: the concept at the centre with the four questions "
                "worth answering about it. Configure a language model for a bespoke scene."
            ),
            "objects": objects,
            "connections": [
                {"from": "core", "to": f"spoke-{i + 1}", "label": ""}
                for i in range(len(spokes))
            ],
            "annotations": [{"target": "core", "text": topic}],
            "camera": {"position": [6, 4, 6], "target": [0, 1, 0]},
            "grid": True,
        },
        prompt=topic,
    )
    scene["fallback"] = True
    return scene


async def generate(prompt: str, *, context: str = "") -> Dict[str, Any]:
    """Generate and validate a scene for ``prompt``."""
    if not prompt.strip():
        return fallback_scene("")

    instruction = f"Build a 3D diagram that explains: {prompt}"
    if context:
        instruction += f"\n\nRelevant background:\n{context[:1500]}"

    parsed, completion = await llm.complete_json(
        instruction, system=SYSTEM, fallback={}
    )
    scene = validate(parsed, prompt=prompt)
    scene["provider"] = completion.provider
    scene["model"] = completion.model
    if completion.degraded:
        scene["degraded"] = True
        scene.setdefault("notes", completion.notes)
    return scene

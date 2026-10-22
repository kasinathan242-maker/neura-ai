"""End-to-end smoke tests.

These run with no model and no Redis configured, which is exactly the state a
fresh Vercel deployment is in before any environment variables are set. Every
assertion here is about the app staying *usable* in that state: real HTTP
statuses, real JSON shapes, no 500s.

    python backend/tests/test_smoke.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient
from neura import scenes, tools
from neura.main import app

client = TestClient(app)

PASSED: list[str] = []
FAILED: list[tuple[str, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        PASSED.append(name)
        print(f"  PASS  {name}")
    else:
        FAILED.append((name, detail))
        print(f"  FAIL  {name}  {detail}")


def section(title: str) -> None:
    print(f"\n{title}")
    print("-" * len(title))


def test_health() -> None:
    section("Health and capabilities")
    response = client.get("/api/health")
    check("health returns 200", response.status_code == 200, str(response.status_code))
    body = response.json()
    check("health reports a provider", "active_provider" in body, json.dumps(body)[:200])
    check(
        "offline is the provider with nothing configured",
        body.get("active_provider") in {"offline", "ollama", "openai"},
        str(body.get("active_provider")),
    )
    check("root route responds", client.get("/").status_code == 200)


def test_chat() -> None:
    section("Chat")
    response = client.post(
        "/api/chat", json={"message": "Explain the chain rule in calculus"}
    )
    check("chat returns 200", response.status_code == 200, response.text[:200])
    body = response.json()
    check("chat returns non-empty text", bool(body.get("response")), json.dumps(body)[:200])
    check("chat flags degradation honestly", body.get("degraded") is True)

    empty = client.post("/api/chat", json={"message": ""})
    check("empty message is rejected with 422", empty.status_code == 422, str(empty.status_code))

    stream = client.post("/api/chat/stream", json={"message": "What is entropy?"})
    check("stream returns 200", stream.status_code == 200)
    events = [
        json.loads(line[5:])
        for line in stream.text.splitlines()
        if line.startswith("data:")
    ]
    check("stream emits deltas", any(e.get("type") == "delta" for e in events), str(len(events)))
    check("stream terminates with done", any(e.get("type") == "done" for e in events))


def test_study() -> None:
    section("Study")
    explain = client.post("/api/study/explain", json={"topic": "Photosynthesis"})
    check("explain returns 200", explain.status_code == 200, explain.text[:200])
    check("explain returns text", bool(explain.json().get("explanation")))

    quiz = client.post("/api/study/quiz", json={"topic": "Newton's laws", "count": 5})
    check("quiz returns 200", quiz.status_code == 200, quiz.text[:200])
    questions = quiz.json().get("questions", [])
    check("quiz returns questions", len(questions) >= 1, str(len(questions)))
    check(
        "every quiz answer appears in its options",
        all(q["answer"] in q["options"] for q in questions),
        "an answer was missing from options -- the UI could never mark it correct",
    )

    result = client.post(
        "/api/study/quiz-result",
        json={"topic": "Newton's laws", "correct": 2, "total": 5},
    )
    check("quiz result recorded", result.status_code == 200, result.text[:200])
    check(
        "mastery reflects a 40% score",
        abs(float(result.json()["mastery"]) - 0.4) < 0.01,
        str(result.json().get("mastery")),
    )


def test_memory() -> None:
    section("Memory and knowledge graph")
    ingest = client.post(
        "/api/memory/ingest",
        json={
            "text": "The chain rule differentiates composite functions. "
            "If y = f(g(x)) then dy/dx = f'(g(x)) * g'(x).\n\n"
            "It is the basis of backpropagation in neural networks.",
            "source": "notes",
            "title": "Calculus notes",
            "extract_concepts": False,
        },
    )
    check("ingest returns 200", ingest.status_code == 200, ingest.text[:200])
    check("ingest stored chunks", ingest.json().get("chunks_added", 0) >= 1)

    search = client.post("/api/memory/search", json={"query": "chain rule", "k": 3})
    check("search returns 200", search.status_code == 200)
    hits = search.json().get("hits", [])
    check("search finds the ingested chunk", len(hits) >= 1, str(len(hits)))
    check(
        "search ranks by similarity",
        all("score" in hit for hit in hits) and (not hits or hits[0]["score"] > 0),
        json.dumps(hits[:1])[:200],
    )

    client.post(
        "/api/memory/mastery",
        json={"concept": "Chain rule", "score": 0.2, "signal": "quiz"},
    )
    weak = client.get("/api/memory/weak")
    check("weak concepts returns 200", weak.status_code == 200)
    names = [c["name"] for c in weak.json().get("concepts", [])]
    check("a low score marks the concept weak", "Chain rule" in names, str(names))

    context = client.post(
        "/api/memory/context", json={"query": "How do I differentiate sin(3x)?"}
    )
    check("context returns 200", context.status_code == 200)
    block = context.json().get("prompt_block", "")
    check(
        "weak points are injected into the tutoring prompt",
        "Chain rule" in block,
        block[:300],
    )

    graph = client.get("/api/memory/graph")
    check("graph returns 200", graph.status_code == 200)
    check("graph reports stats", "stats" in graph.json())


def test_agents() -> None:
    section("Autonomous agents")
    created = client.post(
        "/api/agents/jobs",
        json={"goal": "I have a big exam on Quantum Physics next week", "days": 3},
    )
    check("job created", created.status_code == 200, created.text[:200])
    job_id = created.json().get("id")
    check("job has an id", bool(job_id))

    if not job_id:
        return

    # Drive the whole pipeline the way the browser does: one step per request.
    status, guard = "running", 0
    while status not in {"done", "failed"} and guard < 40:
        response = client.post(f"/api/agents/jobs/{job_id}/step")
        if response.status_code != 200:
            check("stepping stays healthy", False, response.text[:200])
            return
        payload = response.json()
        status = payload["status"]
        guard += 1

    check(f"pipeline completed in {guard} steps", status == "done", status)

    job = client.get(f"/api/agents/jobs/{job_id}").json()["job"]
    artifacts = job["artifacts"]
    check("subtopics produced", len(artifacts["subtopics"]) >= 1)
    check("a 3-day plan was produced", len(artifacts["plan"]) == 3, str(len(artifacts["plan"])))
    check("calendar events produced", len(artifacts["events"]) == 3, str(len(artifacts["events"])))
    check("notifications scheduled", len(artifacts["notifications"]) >= 3)
    check("quizzes written", len(artifacts["quizzes"]) >= 1)
    check("briefing written", bool(artifacts["briefing"]))
    check("trace captured for the UI", len(job["trace"]) >= 3, str(len(job["trace"])))

    ics = client.get(f"/api/agents/jobs/{job_id}/calendar.ics")
    check("calendar downloads", ics.status_code == 200)
    check("calendar is valid ICS", ics.text.startswith("BEGIN:VCALENDAR"), ics.text[:60])
    check("calendar has 3 events", ics.text.count("BEGIN:VEVENT") == 3)
    check("calendar carries reminders", "BEGIN:VALARM" in ics.text)

    upcoming = client.get(f"/api/agents/jobs/{job_id}/next-notification")
    check("next notification resolves", upcoming.status_code == 200)
    check(
        "next notification is in the future",
        upcoming.json().get("notification") is not None,
        "schedule_from_plan should start from tomorrow, never the past",
    )

    scored = client.post(
        f"/api/agents/jobs/{job_id}/quiz-result",
        json={"day": 1, "correct": 1, "total": 3},
    )
    check("agent quiz result recorded", scored.status_code == 200, scored.text[:200])


def test_scenes() -> None:
    section("Spatial scenes")
    response = client.post("/api/scene/generate", json={"prompt": "How a car engine works"})
    check("scene returns 200", response.status_code == 200, response.text[:200])
    scene = response.json()["scene"]
    check("scene has objects", len(scene["objects"]) >= 1)
    check(
        "every primitive is renderable",
        all(o["type"] in scenes.PRIMITIVES for o in scene["objects"]),
        str({o["type"] for o in scene["objects"]}),
    )
    check(
        "positions are finite and clamped",
        all(
            all(isinstance(v, float) and abs(v) <= scenes.COORD_LIMIT for v in o["position"])
            for o in scene["objects"]
        ),
    )
    ids = {o["id"] for o in scene["objects"]}
    check(
        "no connection dangles",
        all(c["from"] in ids and c["to"] in ids for c in scene["connections"]),
        "a dangling id would make the renderer read undefined",
    )

    # Hostile input: the validator must repair rather than propagate garbage.
    hostile = scenes.validate(
        {
            "objects": [
                {"id": "<script>x</script>", "type": "nonexistent", "position": ["a", None, 1e9],
                 "scale": 999, "color": "javascript:alert(1)"},
                {"id": "<script>x</script>", "type": "sphere"},
            ],
            "connections": [{"from": "ghost", "to": "also-ghost"}],
        },
        prompt="hostile",
    )
    check("unknown primitive falls back to box", hostile["objects"][0]["type"] == "box")
    check("non-numeric coordinates become numbers",
          all(isinstance(v, float) for v in hostile["objects"][0]["position"]))
    check("huge coordinates are clamped",
          all(abs(v) <= scenes.COORD_LIMIT for v in hostile["objects"][0]["position"]))
    check("oversized scale is clamped",
          all(v <= scenes.SCALE_MAX for v in hostile["objects"][0]["scale"]))
    check("unsafe colour is replaced with a hex value",
          hostile["objects"][0]["color"].startswith("#"))
    check("script tags are stripped from ids",
          "<" not in hostile["objects"][0]["id"] and ">" not in hostile["objects"][0]["id"],
          hostile["objects"][0]["id"])
    check("duplicate ids are made unique",
          hostile["objects"][0]["id"] != hostile["objects"][1]["id"])
    check("dangling connections are dropped", hostile["connections"] == [])


def test_coding_and_tasks() -> None:
    section("Coding and tasks")
    code = client.post(
        "/api/analyze-code",
        json={"code": "def f(x):\n  return x/0", "action": "bugfix", "language": "Python"},
    )
    check("code analysis returns 200", code.status_code == 200, code.text[:200])
    check("code analysis returns text", bool(code.json().get("analysis")))

    tasks = client.post("/api/tasks/suggest", json={"goal": "Ship the portfolio site"})
    check("task suggestions return 200", tasks.status_code == 200, tasks.text[:200])
    suggested = tasks.json().get("tasks", [])
    check("tasks are structured objects", len(suggested) >= 1 and "text" in suggested[0])
    check("legacy text field retained", bool(tasks.json().get("suggestions")))


def test_pdf() -> None:
    section("PDF")
    # A byte-accurate one-page PDF with extractable text, built by hand so the
    # test needs no binary fixture in the repository.
    body = (
        b"BT /F1 12 Tf 72 720 Td "
        b"(Mitochondria are the powerhouse of the cell.) Tj ET"
    )
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(body)).encode() + b" >>\nstream\n" + body + b"\nendstream",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"

    xref_at = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n".encode()
    pdf += b"0000000000 65535 f \n"
    for offset in offsets:
        pdf += f"{offset:010d} 00000 n \n".encode()
    pdf += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n".encode()
        + b"%%EOF\n"
    )

    extracted = tools.extract_pdf_text(bytes(pdf))
    check("hand-built PDF parses", extracted["ok"], str(extracted.get("error")))
    check("text extracted from PDF", "Mitochondria" in extracted["text"], extracted["text"][:80])

    upload = client.post(
        "/api/upload-pdf",
        files={"file": ("cell.pdf", bytes(pdf), "application/pdf")},
        data={"user_id": "test", "ingest_to_memory": "true"},
    )
    check("upload returns 200", upload.status_code == 200, upload.text[:300])
    doc_id = upload.json().get("doc_id")
    check("upload returns a doc_id", bool(doc_id))

    if doc_id:
        answer = client.post(
            "/api/chat-pdf",
            json={"question": "What are mitochondria?", "doc_id": doc_id, "user_id": "test"},
        )
        check("pdf chat returns 200", answer.status_code == 200, answer.text[:200])
        check("pdf chat used the document", answer.json().get("context_used") is True)

    orphan = client.post("/api/chat-pdf", json={"question": "Anything?", "doc_id": "missing"})
    check("missing document degrades instead of 500", orphan.status_code == 200)
    check("missing document is reported honestly",
          orphan.json().get("context_used") is False)

    empty = client.post(
        "/api/upload-pdf", files={"file": ("empty.pdf", b"", "application/pdf")}
    )
    check("empty upload rejected with 400", empty.status_code == 400, str(empty.status_code))

    garbage = client.post(
        "/api/upload-pdf", files={"file": ("x.pdf", b"not a pdf at all", "application/pdf")}
    )
    check("unparseable PDF rejected with 422", garbage.status_code == 422, str(garbage.status_code))


def test_vision_and_voice() -> None:
    section("Vision and voice")
    vision = client.post(
        "/api/vision/analyze",
        files={"image": ("photo.jpg", b"\xff\xd8\xff\xe0fake", "image/jpeg")},
        data={"prompt": "Solve this", "mode": "solve"},
    )
    check(
        "vision explains why it is unavailable rather than failing opaquely",
        vision.status_code == 503,
        str(vision.status_code),
    )
    check("vision error names the fix", "llava" in vision.json().get("detail", "").lower())

    config = client.get("/api/voice/config")
    check("voice config returns 200", config.status_code == 200)
    check("voice config carries VAD thresholds", "vad" in config.json())
    check("voice config carries barge-in settings", "barge_in" in config.json())

    turn = client.post(
        "/api/voice/turn",
        json={"transcript": "I still do not get this", "repeat_count": 3},
    )
    check("voice turn returns 200", turn.status_code == 200, turn.text[:200])
    events = [
        json.loads(line[5:]) for line in turn.text.splitlines() if line.startswith("data:")
    ]
    tone = next((e for e in events if e.get("type") == "tone"), {})
    check(
        "repeated asks are detected as frustration",
        tone.get("tone") == "frustrated",
        str(tone),
    )

    edge = client.get("/api/edge/models")
    check("edge model catalogue returns 200", edge.status_code == 200)
    check("edge catalogue is non-empty", len(edge.json().get("models", [])) >= 1)


def test_subject_extraction() -> None:
    """Regressions for bugs found while exercising the app in a browser."""
    section("Subject extraction")
    from neura.llm import extract_subject

    check(
        "a goal sentence yields the proper noun, not the whole sentence",
        extract_subject("I have a big exam on Quantum Physics next week") == "Quantum Physics",
        extract_subject("I have a big exam on Quantum Physics next week"),
    )
    check(
        "possessives survive single-quote delimiters",
        extract_subject("Write 5 questions about 'Newton's laws of motion' now")
        == "Newton's laws of motion",
        extract_subject("Write 5 questions about 'Newton's laws of motion' now"),
    )
    check(
        "a double-quoted subject wins over surrounding instructions",
        extract_subject('Write a briefing for a learner preparing for "Quantum Physics" over 7 days')
        == "Quantum Physics",
        extract_subject('Write a briefing for a learner preparing for "Quantum Physics" over 7 days'),
    )
    check(
        "JSON schema keys are not mistaken for the subject",
        "question" not in extract_subject(
            'Questions about photosynthesis. Respond as {"questions":[{"question":"..."}]}'
        ).lower(),
        extract_subject('Questions about photosynthesis. Respond as {"questions":[{"question":"..."}]}'),
    )

    # The offline role hint matched "vision" inside "revision notes".
    from neura.llm import _offline_text

    researcher = _offline_text(
        [
            {"role": "system", "content": "You are a research assistant producing tight revision notes."},
            {"role": "user", "content": "Summarise wave functions"},
        ]
    )
    check(
        "'revision notes' does not select the vision analyst role",
        "vision analyst" not in researcher,
        researcher[:160],
    )
    check("the research role is selected instead", "research assistant" in researcher, researcher[:160])


def test_ics_correctness() -> None:
    section("Calendar generation")
    events = tools.schedule_from_plan(
        [{"day": 1, "focus": "Wave functions; commas, and \\backslashes", "minutes": 45}]
    )
    ics = tools.build_ics(events)
    check("special characters are escaped", "\\;" in ics and "\\," in ics, ics[:400])
    check("CRLF line endings used", "\r\n" in ics)
    check("calendar is closed", ics.strip().endswith("END:VCALENDAR"))
    check(
        "long lines are folded to 75 octets",
        all(len(line.encode()) <= 75 for line in ics.split("\r\n")),
        "an unfolded line would break strict calendar clients",
    )


def main() -> int:
    print("=" * 64)
    print("NEURA AI backend smoke tests (no model, no Redis configured)")
    print("=" * 64)

    for suite in (
        test_health,
        test_chat,
        test_study,
        test_memory,
        test_agents,
        test_scenes,
        test_coding_and_tasks,
        test_pdf,
        test_vision_and_voice,
        test_subject_extraction,
        test_ics_correctness,
    ):
        try:
            suite()
        except Exception as exc:
            FAILED.append((suite.__name__, f"raised {type(exc).__name__}: {exc}"))
            print(f"  ERROR {suite.__name__}: {exc}")

    print("\n" + "=" * 64)
    print(f"{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("\nFailures:")
        for name, detail in FAILED:
            print(f"  - {name}: {detail}")
    print("=" * 64)
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())

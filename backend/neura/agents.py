"""Autonomous study-agent crew.

Give it a goal ("big exam on Quantum Physics next week") and it decomposes the
subject, researches each subtopic on the open web, collects readable documents,
writes a day-by-day plan, emits a calendar file, generates a micro-quiz per day
and lays out a notification schedule.

**Why a hand-rolled runtime instead of CrewAI/LangChain.** The whole point of
this deployment is that it runs as a Vercel Function. Those frameworks assume a
long-lived process and pull in hundreds of megabytes of transitive dependencies,
which collides with both the function bundle limit and the request timeout. So
this module keeps the shape those frameworks give you -- named role agents, a
shared scratchpad, tool calls, an inspectable trace -- while making the loop
*resumable*: state lives in the KV store and each ``advance()`` executes exactly
one step. The client polls, so a 40-step research job completes across many short
requests instead of one long one that would be killed.

The crew:
  Curriculum Architect  decomposes the goal into subtopics
  Researcher            searches the web per subtopic
  Librarian             finds downloadable source documents
  Planner               builds the day-by-day schedule
  Scheduler             renders calendar events + notification times
  Quizmaster            writes one micro-quiz per study day
  Coach                 writes the closing briefing
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

from . import llm, memory, tools
from .config import settings
from .store import store

logger = logging.getLogger("neura.agents")

JOBS = "agent_jobs"
JOB_INDEX = "agent_job_index"

MAX_SUBTOPICS = 6
MAX_QUIZ_DAYS = 7


# --------------------------------------------------------------------------- #
# Job shape
# --------------------------------------------------------------------------- #

def _new_job(user_id: str, goal: str, days: int, minutes_per_day: int) -> dict:
    job_id = uuid.uuid4().hex[:16]
    return {
        "id": job_id,
        "user_id": user_id,
        "goal": goal,
        "days": days,
        "minutes_per_day": minutes_per_day,
        "status": "queued",
        "created_at": time.time(),
        "updated_at": time.time(),
        "cursor": 0,
        "steps": _initial_steps(),
        "trace": [],
        "artifacts": {
            "subtopics": [],
            "research": [],
            "documents": [],
            "plan": [],
            "events": [],
            "quizzes": [],
            "notifications": [],
            "briefing": "",
        },
        "error": None,
    }


def _initial_steps() -> List[dict]:
    """The fixed opening pipeline.

    Research and quiz steps are appended dynamically once the Architect knows how
    many subtopics there are -- that is what makes the run feel autonomous rather
    than a hardcoded seven-step script.
    """
    return [
        {"agent": "Curriculum Architect", "action": "decompose", "label": "Break the goal into subtopics", "status": "pending"},
    ]


def _step(agent: str, action: str, label: str, payload: Optional[dict] = None) -> dict:
    return {
        "agent": agent,
        "action": action,
        "label": label,
        "status": "pending",
        "payload": payload or {},
    }


# --------------------------------------------------------------------------- #
# Persistence
# --------------------------------------------------------------------------- #

async def save(job: dict) -> None:
    job["updated_at"] = time.time()
    await store.set(JOBS, job["id"], job)


async def load(job_id: str) -> Optional[dict]:
    job = await store.get(JOBS, job_id)
    return job if isinstance(job, dict) else None


async def create(
    user_id: str, goal: str, *, days: int = 7, minutes_per_day: int = 60
) -> dict:
    days = max(1, min(30, int(days)))
    minutes_per_day = max(15, min(300, int(minutes_per_day)))
    job = _new_job(user_id, goal.strip(), days, minutes_per_day)
    await save(job)
    await store.push(JOB_INDEX, user_id, {"id": job["id"], "goal": job["goal"], "at": job["created_at"]}, cap=50)
    return job


async def list_jobs(user_id: str) -> List[dict]:
    index = await store.list(JOB_INDEX, user_id)
    jobs: List[dict] = []
    for entry in reversed(index):
        job = await load(str(entry.get("id")))
        if job:
            jobs.append(summarise(job))
    return jobs


def summarise(job: dict) -> dict:
    """Compact view for list screens -- omits the bulky artifacts."""
    steps = job.get("steps", [])
    done = len([s for s in steps if s.get("status") == "done"])
    return {
        "id": job["id"],
        "goal": job["goal"],
        "status": job["status"],
        "days": job["days"],
        "progress": {"completed": done, "total": len(steps)},
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
        "subtopics": job["artifacts"].get("subtopics", []),
        "has_plan": bool(job["artifacts"].get("plan")),
        "error": job.get("error"),
    }


# --------------------------------------------------------------------------- #
# Trace
# --------------------------------------------------------------------------- #

def _trace(job: dict, agent: str, message: str, *, kind: str = "info", data: Any = None) -> None:
    job["trace"].append(
        {
            "at": time.time(),
            "agent": agent,
            "kind": kind,
            "message": message,
            "data": data,
        }
    )
    # Keep the trace bounded; it is shipped to the browser on every poll.
    if len(job["trace"]) > 120:
        job["trace"] = job["trace"][-120:]


# --------------------------------------------------------------------------- #
# Step handlers
# --------------------------------------------------------------------------- #

async def _do_decompose(job: dict, step: dict) -> None:
    goal = job["goal"]
    days = job["days"]

    parsed, completion = await llm.complete_json(
        f"A learner says: \"{goal}\"\n\n"
        f"They have {days} days and about {job['minutes_per_day']} minutes per day.\n"
        f"Identify the subject and split it into at most {MAX_SUBTOPICS} subtopics, "
        "ordered so each builds on the previous one.\n"
        'Respond as {"subject":"...","exam_date_hint":"...","subtopics":'
        '[{"name":"...","why":"one sentence","difficulty":"easy|medium|hard"}]}',
        system="You are a curriculum architect who sequences topics for exam preparation.",
        fallback={"subject": goal, "subtopics": []},
    )

    subject = str(parsed.get("subject") or goal)[:120] if isinstance(parsed, dict) else goal
    raw_subtopics = parsed.get("subtopics") if isinstance(parsed, dict) else None

    subtopics: List[dict] = []
    if isinstance(raw_subtopics, list):
        for item in raw_subtopics[:MAX_SUBTOPICS]:
            if isinstance(item, dict) and str(item.get("name") or "").strip():
                subtopics.append(
                    {
                        "name": str(item["name"]).strip()[:100],
                        "why": str(item.get("why") or "")[:200],
                        "difficulty": str(item.get("difficulty") or "medium"),
                    }
                )

    if not subtopics:
        # Keep the pipeline moving even with no model. Extract the subject from
        # the raw goal rather than reusing the whole sentence, so a plan for
        # "I have a big exam on Quantum Physics next week" is about Quantum
        # Physics instead of about that sentence.
        subject = llm.extract_subject(goal)
        subtopics = [{"name": subject, "why": "Primary subject", "difficulty": "medium"}]

    job["artifacts"]["subject"] = subject
    job["artifacts"]["subtopics"] = subtopics
    _trace(
        job,
        step["agent"],
        f"Split \"{subject}\" into {len(subtopics)} subtopics.",
        data=[s["name"] for s in subtopics],
    )
    if completion.degraded:
        _trace(job, step["agent"], "Ran without a language model; using a single subtopic.", kind="warn")

    # Grow the pipeline now that we know the shape of the work.
    new_steps = [
        _step("Researcher", "research", f"Research: {s['name']}", {"subtopic": s["name"]})
        for s in subtopics
    ]
    new_steps.append(_step("Librarian", "documents", "Collect source documents"))
    new_steps.append(_step("Planner", "plan", f"Write the {job['days']}-day study plan"))
    new_steps.append(_step("Scheduler", "schedule", "Create calendar events and reminders"))
    new_steps.append(_step("Quizmaster", "quizzes", "Write daily micro-quizzes"))
    new_steps.append(_step("Coach", "briefing", "Write the kickoff briefing"))
    job["steps"].extend(new_steps)


async def _do_research(job: dict, step: dict) -> None:
    subtopic = step["payload"].get("subtopic") or job["artifacts"].get("subject", job["goal"])
    subject = job["artifacts"].get("subject", job["goal"])

    search = await tools.web_search(f"{subject} {subtopic} explained", settings.agent_search_results)
    results = search.get("results", [])

    summary = ""
    if results:
        digest = "\n\n".join(
            f"[{r['title']}] {r['snippet']}" for r in results[:4] if r.get("snippet")
        )
        if digest.strip():
            completion = await llm.complete(
                f"Summarise what a student must understand about \"{subtopic}\" "
                f"(within {subject}) in 4-6 bullet points, using these sources:\n\n{digest}",
                system="You are a research assistant producing tight revision notes.",
            )
            summary = completion.text

    entry = {
        "subtopic": subtopic,
        "summary": summary,
        "sources": [
            {"title": r["title"], "url": r["url"], "source": r.get("source")}
            for r in results[:5]
        ],
    }
    job["artifacts"]["research"].append(entry)

    if results:
        _trace(job, step["agent"], f"Found {len(results)} sources on {subtopic}.",
               data=[r["url"] for r in results[:3]])
    else:
        _trace(job, step["agent"], f"No web sources for {subtopic}; relying on model knowledge.", kind="warn")

    # Feed research into long-term memory so later chats can draw on it.
    if summary:
        try:
            await memory.ingest(
                job["user_id"],
                f"{subtopic}\n\n{summary}",
                source=f"agent:{job['id']}",
                title=f"{subject} — {subtopic}",
            )
        except Exception as exc:  # noqa: BLE001 - memory is an enhancement
            logger.info("memory ingest skipped: %s", exc)


async def _do_documents(job: dict, step: dict) -> None:
    subject = job["artifacts"].get("subject", job["goal"])
    found = await tools.find_documents(subject, limit=5)
    documents = found.get("documents", [])

    # Try to read the first PDF so the plan can cite real content.
    for document in documents[:2]:
        if ".pdf" in document.get("url", "").lower():
            page = await tools.fetch_page(document["url"], max_chars=4000)
            if page.get("ok") and page.get("text"):
                document["excerpt"] = page["text"][:600]
                document["pages"] = page.get("pages")
                try:
                    await memory.ingest(
                        job["user_id"],
                        page["text"],
                        source=f"agent-doc:{job['id']}",
                        title=document.get("title") or document["url"],
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.info("document ingest skipped: %s", exc)
                break

    job["artifacts"]["documents"] = documents
    _trace(job, step["agent"], f"Collected {len(documents)} reference documents.",
           data=[d.get("url") for d in documents[:4]])


async def _do_plan(job: dict, step: dict) -> None:
    subject = job["artifacts"].get("subject", job["goal"])
    subtopics = [s["name"] for s in job["artifacts"].get("subtopics", [])]
    research_digest = "\n\n".join(
        f"### {entry['subtopic']}\n{entry['summary'][:700]}"
        for entry in job["artifacts"].get("research", [])
        if entry.get("summary")
    )

    weak = await memory.weak_concepts(job["user_id"], limit=5)
    weak_note = ""
    if weak:
        weak_note = (
            "\nThis learner has previously scored low on: "
            + ", ".join(f"{c['name']} ({float(c.get('mastery', 0.5)):.0%})" for c in weak)
            + ". Allocate extra time to any of these that overlap the subject.\n"
        )

    parsed, completion = await llm.complete_json(
        f"Build a {job['days']}-day study plan for \"{subject}\".\n"
        f"Available time: {job['minutes_per_day']} minutes per day.\n"
        f"Subtopics to cover: {', '.join(subtopics) or subject}.\n"
        f"{weak_note}\n"
        f"Research notes:\n{research_digest[:4000]}\n\n"
        'Respond as {"plan":[{"day":1,"focus":"...","topics":["..."],'
        '"activities":["..."],"goal":"measurable outcome","minutes":60}]}. '
        f"Produce exactly {job['days']} entries, days 1..{job['days']}.",
        system="You are an expert study planner. Be specific and realistic.",
        fallback={"plan": []},
    )

    raw_plan = parsed.get("plan") if isinstance(parsed, dict) else None
    plan: List[dict] = []
    if isinstance(raw_plan, list):
        for index, item in enumerate(raw_plan[: job["days"]]):
            if not isinstance(item, dict):
                continue
            plan.append(
                {
                    "day": int(item.get("day") or index + 1),
                    "focus": str(item.get("focus") or f"Session {index + 1}")[:140],
                    "topics": [str(t)[:80] for t in (item.get("topics") or [])][:6],
                    "activities": [str(a)[:140] for a in (item.get("activities") or [])][:6],
                    "goal": str(item.get("goal") or "")[:200],
                    "minutes": int(item.get("minutes") or job["minutes_per_day"]),
                }
            )

    if not plan:
        plan = _fallback_plan(subject, subtopics, job["days"], job["minutes_per_day"])
        _trace(job, step["agent"], "Model plan unavailable; distributed subtopics evenly instead.", kind="warn")

    job["artifacts"]["plan"] = plan
    _trace(job, step["agent"], f"Wrote a {len(plan)}-day plan.",
           data=[f"Day {p['day']}: {p['focus']}" for p in plan])
    if completion.degraded and plan:
        job["artifacts"]["plan_degraded"] = True


def _fallback_plan(subject: str, subtopics: List[str], days: int, minutes: int) -> List[dict]:
    """Round-robin subtopics across the available days.

    Used when no model is configured. It is a genuinely usable plan, not filler:
    every subtopic gets covered and the last day is reserved for review.
    """
    pool = subtopics or [subject]
    plan: List[dict] = []
    for day in range(1, days + 1):
        if day == days and days > 1:
            plan.append(
                {
                    "day": day,
                    "focus": "Full review and mock test",
                    "topics": pool[:],
                    "activities": [
                        "Re-read your notes for every subtopic",
                        "Take the micro-quizzes again without notes",
                        "List remaining gaps and address the worst two",
                    ],
                    "goal": f"Answer questions across all of {subject} unaided",
                    "minutes": minutes,
                }
            )
            continue

        focus = pool[(day - 1) % len(pool)]
        plan.append(
            {
                "day": day,
                "focus": focus,
                "topics": [focus],
                "activities": [
                    f"Read a primary source on {focus}",
                    f"Write a one-page summary of {focus} from memory",
                    "Take the day's micro-quiz",
                ],
                "goal": f"Explain {focus} without notes",
                "minutes": minutes,
            }
        )
    return plan


async def _do_schedule(job: dict, step: dict) -> None:
    plan = job["artifacts"].get("plan", [])
    events = tools.schedule_from_plan(plan)
    job["artifacts"]["events"] = events

    # Notification times: a nudge at the session start, a quiz prompt afterwards.
    notifications: List[dict] = []
    for event in events:
        try:
            start = datetime.fromisoformat(event["start"])
        except (ValueError, KeyError):
            continue
        notifications.append(
            {
                "at": start.isoformat(),
                "kind": "session",
                "title": f"Day {event['day']} study block",
                "body": event["title"],
                "day": event["day"],
            }
        )
        quiz_time = start + timedelta(minutes=int(event.get("duration_minutes", 60)))
        notifications.append(
            {
                "at": quiz_time.isoformat(),
                "kind": "quiz",
                "title": f"Micro-quiz: day {event['day']}",
                "body": "5 quick questions to lock in today's session.",
                "day": event["day"],
            }
        )

    job["artifacts"]["notifications"] = notifications
    _trace(
        job,
        step["agent"],
        f"Scheduled {len(events)} sessions and {len(notifications)} reminders.",
    )


async def _do_quizzes(job: dict, step: dict) -> None:
    plan = job["artifacts"].get("plan", [])[:MAX_QUIZ_DAYS]
    quizzes: List[dict] = []

    for entry in plan:
        topics = ", ".join(entry.get("topics") or [entry.get("focus", "")])
        parsed, _ = await llm.complete_json(
            f"Write 3 multiple-choice questions on: {topics}.\n"
            'Respond as {"questions":[{"question":"...","options":["a","b","c","d"],'
            '"answer":"exact text of the correct option","explanation":"why"}]}',
            system="You write short retrieval-practice quizzes.",
            fallback={"questions": []},
        )
        raw = parsed.get("questions") if isinstance(parsed, dict) else None
        questions = normalise_questions(raw, topics)
        quizzes.append(
            {
                "day": entry.get("day"),
                "topic": entry.get("focus"),
                "concepts": entry.get("topics") or [],
                "questions": questions,
            }
        )

    job["artifacts"]["quizzes"] = quizzes
    total = sum(len(q["questions"]) for q in quizzes)
    _trace(job, step["agent"], f"Wrote {total} questions across {len(quizzes)} days.")


def normalise_questions(raw: Any, topic: str) -> List[dict]:
    """Coerce model output into the exact shape the quiz UI expects.

    Guarantees the answer is present in the options list -- otherwise the UI can
    never mark a response correct, which is a silent, confusing failure.
    """
    questions: List[dict] = []
    if isinstance(raw, list):
        for index, item in enumerate(raw[:5]):
            if not isinstance(item, dict):
                continue
            text = str(item.get("question") or "").strip()
            options = [str(o).strip() for o in (item.get("options") or []) if str(o).strip()]
            answer = str(item.get("answer") or "").strip()
            if not text or len(options) < 2:
                continue
            if answer not in options:
                # Try a loose match before giving up on the model's answer.
                match = next(
                    (o for o in options if o.lower() == answer.lower()), None
                ) or next(
                    (o for o in options if answer and answer.lower() in o.lower()), None
                )
                answer = match or options[0]
            questions.append(
                {
                    "id": index + 1,
                    "question": text[:400],
                    "options": options[:6],
                    "answer": answer,
                    "explanation": str(item.get("explanation") or "")[:400],
                }
            )

    if not questions:
        questions = [
            {
                "id": 1,
                "question": f"Placeholder: name one key idea in {topic}.",
                "options": [
                    f"A core principle of {topic}",
                    "An unrelated claim",
                    "A common misconception",
                    "None of the above",
                ],
                "answer": f"A core principle of {topic}",
                "explanation": "Configure a language model for real questions.",
                "placeholder": True,
            }
        ]
    return questions


async def _do_briefing(job: dict, step: dict) -> None:
    subject = job["artifacts"].get("subject", job["goal"])
    plan = job["artifacts"].get("plan", [])
    outline = "\n".join(f"Day {p['day']}: {p['focus']}" for p in plan)

    completion = await llm.complete(
        f"Write a short, warm kickoff briefing (max 150 words) for a learner "
        f"preparing for \"{subject}\" over {len(plan)} days. Reference the plan "
        f"and name the single highest-leverage habit for this subject.\n\n{outline}",
        system="You are an encouraging study coach. Be concrete, not generic.",
    )
    job["artifacts"]["briefing"] = completion.text
    _trace(job, step["agent"], "Briefing ready. Plan complete.", kind="success")


_HANDLERS = {
    "decompose": _do_decompose,
    "research": _do_research,
    "documents": _do_documents,
    "plan": _do_plan,
    "schedule": _do_schedule,
    "quizzes": _do_quizzes,
    "briefing": _do_briefing,
}


# --------------------------------------------------------------------------- #
# Driver
# --------------------------------------------------------------------------- #

async def advance(job_id: str) -> Optional[dict]:
    """Execute the next pending step and persist the result.

    One step per call keeps every request short enough for a serverless timeout.
    The caller loops until ``status`` is ``done`` or ``failed``.
    """
    job = await load(job_id)
    if job is None:
        return None

    if job["status"] in {"done", "failed"}:
        return job

    steps = job["steps"]
    cursor = job["cursor"]

    if cursor >= len(steps):
        job["status"] = "done"
        await save(job)
        return job

    if cursor >= settings.agent_max_steps:
        job["status"] = "done"
        _trace(job, "Runtime", f"Stopped at the {settings.agent_max_steps}-step ceiling.", kind="warn")
        await save(job)
        return job

    step = steps[cursor]
    step["status"] = "running"
    job["status"] = "running"
    job["started_at"] = job.get("started_at") or time.time()
    await save(job)

    handler = _HANDLERS.get(step["action"])
    if handler is None:
        step["status"] = "skipped"
        _trace(job, step.get("agent", "Runtime"), f"No handler for '{step['action']}'.", kind="warn")
    else:
        try:
            await handler(job, step)
            step["status"] = "done"
        except Exception as exc:  # noqa: BLE001 - one bad step must not kill the job
            logger.exception("agent step failed: %s", step)
            step["status"] = "failed"
            step["error"] = str(exc)[:300]
            _trace(job, step.get("agent", "Runtime"), f"Step failed: {exc}", kind="error")

    step["finished_at"] = time.time()
    job["cursor"] = cursor + 1
    job["status"] = "done" if job["cursor"] >= len(job["steps"]) else "running"

    if job["status"] == "done":
        failed = [s for s in job["steps"] if s.get("status") == "failed"]
        if failed and len(failed) == len(job["steps"]):
            job["status"] = "failed"
            job["error"] = failed[0].get("error")
        job["finished_at"] = time.time()

    await save(job)
    return job


async def calendar_for(job_id: str) -> Optional[str]:
    job = await load(job_id)
    if job is None:
        return None
    events = job["artifacts"].get("events") or tools.schedule_from_plan(
        job["artifacts"].get("plan", [])
    )
    subject = job["artifacts"].get("subject", job["goal"])
    return tools.build_ics(events, calendar_name=f"NEURA — {subject}")


async def submit_quiz_result(
    user_id: str, job_id: str, day: int, correct: int, total: int
) -> dict:
    """Record a quiz outcome against the day's concepts in the graph.

    This closes the loop for feature 3: the score becomes mastery data that
    future tutoring prompts read back.
    """
    job = await load(job_id)
    if job is None:
        return {"ok": False, "error": "job not found"}

    quiz = next(
        (q for q in job["artifacts"].get("quizzes", []) if int(q.get("day") or 0) == int(day)),
        None,
    )
    score = (correct / total) if total else 0.0
    updated: List[dict] = []

    concepts = (quiz.get("concepts") if quiz else []) or []
    if not concepts and quiz and quiz.get("topic"):
        concepts = [quiz["topic"]]

    for concept in concepts:
        record = await memory.record_mastery(user_id, str(concept), score, signal="quiz")
        updated.append({"name": record["name"], "mastery": record["mastery"]})

    results = job.setdefault("artifacts", {}).setdefault("quiz_results", [])
    results.append({"day": day, "correct": correct, "total": total, "at": time.time()})
    await save(job)

    return {"ok": True, "score": round(score, 3), "mastery_updated": updated}


def next_notification(job: dict, *, now: Optional[datetime] = None) -> Optional[dict]:
    """The soonest future notification, for the client's scheduler."""
    now = now or datetime.now(timezone.utc)
    upcoming = []
    for item in job["artifacts"].get("notifications", []):
        try:
            when = datetime.fromisoformat(item["at"])
        except (ValueError, KeyError):
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if when > now:
            upcoming.append((when, item))
    if not upcoming:
        return None
    upcoming.sort(key=lambda pair: pair[0])
    return upcoming[0][1]

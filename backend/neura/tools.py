"""Tools the study agents call: search, fetch, PDF extraction, calendar export.

Every tool returns a dict and never raises. An agent step that loses the network
should degrade to a thinner result, not abort the whole job -- so each tool
reports ``ok`` and an ``error`` string instead of propagating exceptions.

Search deliberately uses keyless sources (Wikipedia's REST API and DuckDuckGo's
HTML endpoint) so research works on a fresh deployment with no API keys at all.
"""

from __future__ import annotations

import html
import logging
import re
import urllib.parse
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Any, Dict, List, Optional

import httpx

from .config import settings

logger = logging.getLogger("neura.tools")

USER_AGENT = "NeuraAI/2.0 (study assistant; +https://github.com/Kasinathan006/neura-ai)"
_HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}


# --------------------------------------------------------------------------- #
# Web search
# --------------------------------------------------------------------------- #

async def _wikipedia_search(query: str, limit: int) -> List[dict]:
    """Wikipedia REST search: high-quality, keyless, generous rate limits."""
    url = "https://en.wikipedia.org/w/rest.php/v1/search/page"
    params = {"q": query, "limit": limit}
    async with httpx.AsyncClient(timeout=12.0, headers=_HEADERS) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

    results = []
    for page in data.get("pages", [])[:limit]:
        title = page.get("title", "")
        snippet = re.sub(r"<[^>]+>", "", page.get("excerpt") or "")
        results.append(
            {
                "title": title,
                "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
                "snippet": html.unescape(snippet)[:400],
                "source": "wikipedia",
            }
        )
    return results


async def _duckduckgo_search(query: str, limit: int) -> List[dict]:
    """DuckDuckGo's no-JS HTML endpoint, scraped defensively."""
    url = "https://html.duckduckgo.com/html/"
    async with httpx.AsyncClient(
        timeout=12.0, headers=_HEADERS, follow_redirects=True
    ) as client:
        response = await client.post(url, data={"q": query})
        response.raise_for_status()
        body = response.text

    results: List[dict] = []
    pattern = re.compile(
        r'<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>'
        r'(?:.*?class="[^"]*result__snippet[^"]*"[^>]*>(?P<snippet>.*?)</a>)?',
        re.DOTALL,
    )

    for match in pattern.finditer(body):
        href = html.unescape(match.group("href"))
        # DDG wraps targets in /l/?uddg=<encoded>
        if "uddg=" in href:
            parsed = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
            href = (parsed.get("uddg") or [href])[0]
        if not href.startswith("http"):
            continue

        title = html.unescape(re.sub(r"<[^>]+>", "", match.group("title") or "")).strip()
        snippet = html.unescape(
            re.sub(r"<[^>]+>", "", match.group("snippet") or "")
        ).strip()
        results.append(
            {"title": title, "url": href, "snippet": snippet[:400], "source": "duckduckgo"}
        )
        if len(results) >= limit:
            break
    return results


async def web_search(query: str, limit: Optional[int] = None) -> Dict[str, Any]:
    """Search the open web. Wikipedia first, then DuckDuckGo to broaden."""
    limit = limit or settings.agent_search_results
    if not settings.enable_web_search:
        return {"ok": False, "error": "web search disabled by configuration", "results": []}

    results: List[dict] = []
    errors: List[str] = []

    for engine in (_wikipedia_search, _duckduckgo_search):
        if len(results) >= limit:
            break
        try:
            found = await engine(query, limit)
            seen = {r["url"] for r in results}
            results.extend(r for r in found if r["url"] not in seen)
        except Exception as exc:  # noqa: BLE001 - one engine failing is fine
            errors.append(f"{engine.__name__}: {exc}")

    return {
        "ok": bool(results),
        "query": query,
        "results": results[:limit],
        "error": "; ".join(errors) if errors and not results else None,
    }


async def find_documents(topic: str, limit: int = 4) -> Dict[str, Any]:
    """Look for openly downloadable PDFs (lecture notes, papers) on a topic."""
    search = await web_search(f"{topic} lecture notes filetype:pdf", limit * 2)
    documents = [
        r
        for r in search.get("results", [])
        if ".pdf" in r["url"].lower() or "arxiv.org" in r["url"].lower()
    ]
    if not documents:
        # Not every topic has open PDFs; useful links still help the learner.
        documents = search.get("results", [])[:limit]
    return {"ok": bool(documents), "topic": topic, "documents": documents[:limit]}


# --------------------------------------------------------------------------- #
# Page + PDF fetching
# --------------------------------------------------------------------------- #

_TAG_STRIP = re.compile(
    r"<(script|style|nav|footer|header|aside|form)[^>]*>.*?</\1>", re.DOTALL | re.I
)


async def fetch_page(url: str, max_chars: int = 6000) -> Dict[str, Any]:
    """Download a URL and return readable text (HTML or PDF)."""
    try:
        async with httpx.AsyncClient(
            timeout=18.0, headers=_HEADERS, follow_redirects=True
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").lower()
            raw = response.content
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "url": url, "error": str(exc), "text": ""}

    if len(raw) > settings.max_upload_bytes:
        raw = raw[: settings.max_upload_bytes]

    if "pdf" in content_type or url.lower().endswith(".pdf"):
        extracted = extract_pdf_text(raw)
        return {
            "ok": extracted["ok"],
            "url": url,
            "kind": "pdf",
            "text": extracted["text"][:max_chars],
            "pages": extracted.get("pages", 0),
            "error": extracted.get("error"),
        }

    body = raw.decode(response.encoding or "utf-8", errors="ignore")
    body = _TAG_STRIP.sub(" ", body)
    title_match = re.search(r"<title[^>]*>(.*?)</title>", body, re.DOTALL | re.I)
    title = html.unescape(re.sub(r"\s+", " ", title_match.group(1))).strip() if title_match else url
    text = html.unescape(re.sub(r"<[^>]+>", " ", body))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()

    return {"ok": bool(text), "url": url, "kind": "html", "title": title, "text": text[:max_chars]}


def extract_pdf_text(content: bytes) -> Dict[str, Any]:
    """Extract text from PDF bytes.

    ``pypdf`` is imported lazily: the vision and chat routes do not need it, and
    deferring the import keeps cold starts down for the routes that don't.
    """
    try:
        from pypdf import PdfReader
    except ImportError:
        return {"ok": False, "text": "", "error": "pypdf is not installed", "pages": 0}

    try:
        reader = PdfReader(BytesIO(content))
        pages: List[str] = []
        for page in reader.pages:
            try:
                pages.append(page.extract_text() or "")
            except Exception:  # noqa: BLE001 - skip unparseable pages
                pages.append("")
        text = "\n\n".join(p.strip() for p in pages if p.strip())
        if not text:
            return {
                "ok": False,
                "text": "",
                "pages": len(reader.pages),
                "error": "No embedded text found -- this PDF is probably a scan. "
                "Try the Vision tab, which reads images.",
            }
        return {"ok": True, "text": text, "pages": len(reader.pages)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "text": "", "pages": 0, "error": f"Could not parse PDF: {exc}"}


# --------------------------------------------------------------------------- #
# Calendar export
# --------------------------------------------------------------------------- #

def _ics_escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> str:
    """Fold to 75 octets per RFC 5545; unfolded long lines break some clients."""
    if len(line) <= 73:
        return line
    chunks = [line[:73]]
    remainder = line[73:]
    while remainder:
        chunks.append(" " + remainder[:72])
        remainder = remainder[72:]
    return "\r\n".join(chunks)


def build_ics(
    events: List[dict], *, calendar_name: str = "NEURA AI Study Plan"
) -> str:
    """Build an RFC 5545 calendar the user can import into any calendar app.

    An .ics download is the portable route: it needs no OAuth and works with
    Google Calendar, Apple Calendar and Outlook alike.
    """
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//NEURA AI//Study Planner 2.0//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_ics_escape(calendar_name)}",
    ]

    for index, event in enumerate(events):
        start = event.get("start")
        if isinstance(start, str):
            try:
                start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
            except ValueError:
                start_dt = datetime.now(timezone.utc) + timedelta(days=index)
        elif isinstance(start, datetime):
            start_dt = start
        else:
            start_dt = datetime.now(timezone.utc) + timedelta(days=index)

        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        duration = int(event.get("duration_minutes") or 60)
        end_dt = start_dt + timedelta(minutes=duration)

        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:neura-{now}-{index}@neura.ai",
                f"DTSTAMP:{now}",
                f"DTSTART:{start_dt.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
                f"DTEND:{end_dt.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
                _fold(f"SUMMARY:{_ics_escape(str(event.get('title', 'Study block')))}"),
                _fold(f"DESCRIPTION:{_ics_escape(str(event.get('description', '')))}"),
                "BEGIN:VALARM",
                "TRIGGER:-PT10M",
                "ACTION:DISPLAY",
                _fold(f"DESCRIPTION:{_ics_escape(str(event.get('title', 'Study block')))}"),
                "END:VALARM",
                "END:VEVENT",
            ]
        )

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def schedule_from_plan(
    plan: List[dict],
    *,
    start_date: Optional[datetime] = None,
    hour: int = 18,
    minute: int = 0,
) -> List[dict]:
    """Turn day-indexed plan entries into concrete datetimes.

    Days are placed relative to *tomorrow* by default, so a plan generated at
    11pm does not schedule its first session in the past.
    """
    base = start_date or (datetime.now(timezone.utc) + timedelta(days=1))
    base = base.replace(hour=hour, minute=minute, second=0, microsecond=0)

    events: List[dict] = []
    for index, day in enumerate(plan):
        day_number = int(day.get("day") or index + 1)
        start = base + timedelta(days=day_number - 1)
        topics = day.get("topics") or []
        topic_text = ", ".join(str(t) for t in topics) if topics else str(day.get("focus", ""))
        events.append(
            {
                "title": f"Day {day_number}: {day.get('focus') or topic_text or 'Study session'}"[:120],
                "description": "\n".join(
                    filter(
                        None,
                        [
                            f"Topics: {topic_text}" if topic_text else "",
                            f"Goal: {day.get('goal', '')}" if day.get("goal") else "",
                            f"Activities: {'; '.join(str(a) for a in day.get('activities', []))}"
                            if day.get("activities")
                            else "",
                            "Micro-quiz waiting in NEURA AI.",
                        ],
                    )
                ),
                "start": start.isoformat(),
                "duration_minutes": int(day.get("minutes") or 60),
                "day": day_number,
            }
        )
    return events

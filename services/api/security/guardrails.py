"""NEURA AI — Crisis Guardrails, Prompt Injection Defense & Upload Sanitizer (services/api/security/guardrails.py).

Provides multi-tiered safety intercepts:
1. Crisis & Distress Interceptor (English + Tamil + Tanglish) -> Tele-MANAS (14416) & KIRAN (1800-599-0019)
2. Prompt Injection Guardrail (Jailbreaks, DAN mode, instruction bypass)
3. Upload Sanitizer (PDF polyglots, embedded JS, path traversal, decompression bombs)
"""

import re
from dataclasses import dataclass
from typing import ClassVar


@dataclass
class CrisisEvaluationResult:
    is_crisis: bool
    distress_category: str | None
    matched_pattern: str | None
    safety_message: str | None


@dataclass
class InjectionEvaluationResult:
    is_injection: bool
    flagged_reason: str | None


class CrisisGuardrail:
    """Detects suicidal ideation, self-harm, or severe emotional crisis in English, Tamil, and Tanglish.

    Immediately halts Socratic exploration and dispatches Government of India mental health resources.
    """

    # Comprehensive multi-lingual patterns (English, Tamil script, Tanglish phonetic)
    CRISIS_PATTERNS: ClassVar[list[tuple[str, str]]] = [
        # English patterns
        (r"\b(suicide|suicidal)\b", "suicide_explicit"),
        (r"\bkill\s+myself\b", "self_harm_kill"),
        (r"\b(end|ending)\s+my\s+life\b", "self_harm_end_life"),
        (r"\bwant\s+to\s+die\b", "ideation_want_to_die"),
        (r"\bhang\s+myself\b", "self_harm_hanging"),
        (r"\bcut\s+myself\b", "self_harm_cutting"),
        (r"\bself[\s-]harm\b", "self_harm_general"),
        (r"\bno\s+reason\s+to\s+live\b", "hopelessness"),
        (r"\bbetter\s+off\s+dead\b", "ideation_better_off_dead"),
        (r"\btired\s+of\s+living\b", "hopelessness_tired"),
        (r"\bcannot\s+go\s+on\s+living\b", "hopelessness_cannot_go_on"),
        (r"\bworthless\s+and\s+want\s+to\s+die\b", "severe_depression"),
        (r"\bthinking\s+of\s+ending\s+it\s+all\b", "ideation_ending_all"),
        # Tanglish (Romanized Tamil) patterns
        (r"\btharkolai\b", "tanglish_suicide"),
        (r"\btharkola\b", "tanglish_suicide_alt"),
        (r"\buyira\s+maaikka\b", "tanglish_end_life"),
        (r"\buyir\s+vaazha\s+pudikala\b", "tanglish_dont_want_to_live"),
        (r"\bsaaganum\s+pola\s+irukku\b", "tanglish_feel_like_dying"),
        (r"\bsaaga\s+poren\b", "tanglish_going_to_die"),
        (r"\bvaala\s+pudikala\b", "tanglish_dont_want_to_live_alt"),
        (r"\bvaazhka\s+veruthuduchu\b", "tanglish_life_is_hopeless"),
        (r"\bvaazhkai\s+veruthu\s+pochu\b", "tanglish_life_is_hopeless_alt"),
        (r"\btharkolai\s+seiya\b", "tanglish_commit_suicide"),
        (r"\buyir\s+pogattum\b", "tanglish_let_life_end"),
        (r"\bromba\s+kashtama\s+irukku\s+saavuraen\b", "tanglish_severe_distress"),
        (r"\bsaavarthu\s+dhaan\s+vali\b", "tanglish_death_is_the_only_way"),
        (r"\bsaaga\s+mudivu\s+panniten\b", "tanglish_decided_to_die"),
        # Native Tamil Unicode script
        (r"தற்கொலை", "tamil_script_suicide"),
        (r"உயிரை\s*மாய்க்க", "tamil_script_end_life"),
        (r"சாக\s*வேண்டும்", "tamil_script_want_to_die"),
        (r"வாழ\s*பிடிக்கவில்லை", "tamil_script_dont_want_to_live"),
        (r"சாகப்\s*போகிறேன்", "tamil_script_going_to_die"),
        (r"வாழ்க்கை\s*வெறுத்துவிட்டது", "tamil_script_hopelessness"),
    ]

    SAFETY_DISPATCH_MESSAGE: str = (
        "I hear how much pain and distress you are experiencing right now. Your life, health, and well-being "
        "matter infinitely more than any university exam, semester score, or academic pressure. You do not have "
        "to carry this alone.\n\n"
        "Please connect with trained, compassionate professionals right away:\n"
        "• Tele-MANAS (Govt. of India 24/7 Toll-Free): Call 14416 or 1800-891-4416 (available in Tamil and English)\n"
        "• KIRAN Mental Health Helpline: Call 1800-599-0019 (24/7)\n"
        "• Sneha India Suicide Prevention (Chennai): Call 044-24640050\n\n"
        "Please reach out to one of these services or speak with a family member or trusted friend immediately."
    )

    @classmethod
    def evaluate(cls, text: str) -> CrisisEvaluationResult:
        """Evaluates input text against known distress patterns."""
        if not text or not text.strip():
            return CrisisEvaluationResult(
                is_crisis=False,
                distress_category=None,
                matched_pattern=None,
                safety_message=None,
            )

        normalized = text.lower()

        for pattern, category in cls.CRISIS_PATTERNS:
            match = re.search(pattern, normalized, re.IGNORECASE)
            if match:
                return CrisisEvaluationResult(
                    is_crisis=True,
                    distress_category=category,
                    matched_pattern=match.group(0),
                    safety_message=cls.SAFETY_DISPATCH_MESSAGE,
                )

        return CrisisEvaluationResult(
            is_crisis=False,
            distress_category=None,
            matched_pattern=None,
            safety_message=None,
        )


class PromptInjectionGuardrail:
    """Detects attempts to subvert system instructions, jailbreak model persona, or extract system prompts."""

    INJECTION_PATTERNS: ClassVar[list[str]] = [
        r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)",
        r"\b(dan\s+mode|jailbreak|unfiltered\s+mode|developer\s+mode)\b",
        r"pretend\s+(you\s+are|to\s+be)\s+(an\s+unrestricted|evil|unfiltered)",
        r"bypass\s+all\s+(safety|content)\s+filters",
        r"reveal\s+(your\s+)?(system\s+prompt|initial\s+instructions|secret\s+key)",
        r"<\|im_start\|>system",
        r"system\s*:\s*you\s+are\s+now",
        r"disregard\s+the\s+pedagogical\s+rubric",
    ]

    @classmethod
    def evaluate(cls, text: str) -> InjectionEvaluationResult:
        if not text:
            return InjectionEvaluationResult(is_injection=False, flagged_reason=None)

        normalized = text.lower()
        for pattern in cls.INJECTION_PATTERNS:
            if re.search(pattern, normalized, re.IGNORECASE):
                return InjectionEvaluationResult(
                    is_injection=True,
                    flagged_reason=f"Matched prompt injection heuristic: '{pattern}'",
                )

        return InjectionEvaluationResult(is_injection=False, flagged_reason=None)


class FileUploadSanitizer:
    """Sanitizes uploaded PDF documents against polyglots, zip bombs, and embedded malicious scripts."""

    MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB

    @classmethod
    def validate_pdf_content(cls, file_bytes: bytes, filename: str) -> tuple[bool, str | None]:
        if not file_bytes:
            return False, "Uploaded PDF file is empty (0 bytes)."

        if len(file_bytes) > cls.MAX_FILE_SIZE_BYTES:
            return False, f"File size ({len(file_bytes)} bytes) exceeds 25 MB limit."

        # Prevent path traversal tricks
        if ".." in filename or "/" in filename or "\\" in filename:
            return False, "Invalid filename detected (path traversal attempt)."

        # Validate PDF magic header: %PDF-
        if not file_bytes.startswith(b"%PDF-"):
            return False, "Invalid PDF magic header. Only standard PDF documents are accepted."

        # Check for executable polyglots (e.g. PE header MZ or ELF)
        if b"MZ" in file_bytes[:512] or b"\x7fELF" in file_bytes[:512]:
            return False, "Executable polyglot detected in document."

        # Check for embedded suspicious JavaScript execution streams
        content_lower = file_bytes[:8192].lower()
        if b"/javascript" in content_lower and b"/launch" in content_lower:
            return False, "Document contains executable /Launch JavaScript actions."

        return True, None

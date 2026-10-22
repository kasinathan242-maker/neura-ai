"""NEURA AI — SuperMemo SM-2 Spaced Repetition Algorithm (services/api/services/sm2.py).

Implements the classic SuperMemo SM-2 algorithm:
- Evaluates student recall quality on a 0-5 scale
- Dynamically adjusts Easiness Factor (EF, minimum 1.3)
- Calculates next review interval in days and target UTC timestamp
"""

from datetime import datetime, timedelta, timezone


def compute_sm2(
    quality: int,
    repetitions: int,
    previous_interval: int,
    previous_easiness_factor: float = 2.5,
    now: datetime | None = None,
) -> tuple[int, int, float, datetime]:
    """Computes next SM-2 interval, repetition count, easiness factor, and review timestamp.

    Args:
        quality: Recall grade (0 to 5):
            5: Perfect response without hesitation.
            4: Correct response after hesitation.
            3: Correct response with serious difficulty.
            2: Incorrect response; correct answer seemed easy.
            1: Incorrect response; correct answer remembered.
            0: Complete blackout.
        repetitions: Current consecutive correct recall count.
        previous_interval: Previous interval in days.
        previous_easiness_factor: Previous EF (default 2.5, min 1.3).
        now: Reference UTC timestamp (defaults to datetime.now(timezone.utc)).

    Returns:
        tuple of (interval_days, new_repetitions, new_easiness_factor, next_review_at)
    """
    if quality < 0 or quality > 5:
        raise ValueError(f"Quality rating must be between 0 and 5, got {quality}")

    current_time = now or datetime.now(timezone.utc)

    # 1. Update Easiness Factor (EF)
    # EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    ef_delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    new_ef = round(max(1.3, previous_easiness_factor + ef_delta), 2)

    # 2. Compute interval and repetition count
    if quality >= 3:
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(previous_interval * new_ef)

        new_repetitions = repetitions + 1
    else:
        # Failure to recall resets repetition count to 0 and interval to 1 day
        new_repetitions = 0
        new_interval = 1

    next_review_at = current_time + timedelta(days=new_interval)
    return new_interval, new_repetitions, new_ef, next_review_at

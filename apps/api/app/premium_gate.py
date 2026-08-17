"""Freemium premium gate — the PURE rule, no DB (mirrors bandlock.py).

Worlds 1–2 (bands 1–2) are free; bands 3+ require a "plus" plan. The SERVER
enforces this so a tampered or buggy client can never persist progress/stories
for premium content under a "free" plan. Kept dependency-free so it's
unit-testable in CI without Postgres/pydantic.
"""

FREE_BAND_LIMIT = 2  # bands 1–2 are free for everyone


def skill_allowed(plan: str | None, skill_band: int | None) -> bool:
    """Is a skill's band within the profile's plan?

    - "plus" plan → everything passes
    - "free" plan (or None) → allowed iff band ≤ FREE_BAND_LIMIT
    - unknown skill band + "free" → fail-closed (we can't prove it's free content)
    """
    if plan == "plus":
        return True
    if skill_band is None:
        return False
    return skill_band <= FREE_BAND_LIMIT

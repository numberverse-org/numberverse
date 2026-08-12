"""Age-appropriate band lock (#275) — the PURE rule, no DB.

The client locks worlds above the parent's `max_band`; this is the shared
decision used by the SERVER so a tampered or buggy client can never persist
progress/stories for content beyond the cap. Kept dependency-free so it's
unit-testable in CI without Postgres/pydantic.
"""
from collections.abc import Mapping


def skill_band_allowed(skill_id: str, band_map: Mapping[str, int], max_band: int | None) -> bool:
    """Is a skill's band within the parent's difficulty cap?

    - no cap → everything passes
    - unknown skill (not in the catalog) + a cap → fail-closed: we can't prove
      it's age-appropriate, so it's blocked
    - known skill → allowed iff its band ≤ cap
    """
    if max_band is None:
        return True
    band = band_map.get(skill_id)
    if band is None:
        return False
    return band <= max_band

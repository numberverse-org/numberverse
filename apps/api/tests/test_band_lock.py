#!/usr/bin/env python3
"""Band-lock test matrix for the server-side age-appropriate content gate (#275).

The client already locks worlds above the parent's `max_band`; these tests prove
the SERVER enforcement is airtight for the tampered-client case: an out-of-band
progress/story event must never persist, and an unknown skill must fail closed
when a cap is set. `bandlock.skill_band_allowed` is dependency-free so this runs
in CI with no Postgres.

Run:  python3 apps/api/tests/test_band_lock.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.bandlock import skill_band_allowed  # noqa: E402

# A representative skill→band map (mirrors the seed's catalog shape).
BANDS = {"count-1-10": 1, "count-to-50": 2, "number-bonds-10": 5}
UNKNOWN = "nope-not-a-skill"

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


print("①  No cap → everything passes (legacy unlimited)…")
for skill in (*BANDS, UNKNOWN):
    check(f"no cap, {skill}", skill_band_allowed(skill, BANDS, None), True)

print("②  Cap = 1 → only band ≤ 1 persists; unknown fails closed…")
check("cap1, band1", skill_band_allowed("count-1-10", BANDS, 1), True)
check("cap1, band2", skill_band_allowed("count-to-50", BANDS, 1), False)
check("cap1, band5", skill_band_allowed("number-bonds-10", BANDS, 1), False)
check("cap1, unknown", skill_band_allowed(UNKNOWN, BANDS, 1), False)

print("③  Cap = 2 → band 2 ok, band 5 blocked, unknown blocked…")
check("cap2, band1", skill_band_allowed("count-1-10", BANDS, 2), True)
check("cap2, band2", skill_band_allowed("count-to-50", BANDS, 2), True)
check("cap2, band5", skill_band_allowed("number-bonds-10", BANDS, 2), False)
check("cap2, unknown", skill_band_allowed(UNKNOWN, BANDS, 2), False)

print("④  Cap = 5 → all known bands pass; unknown still fails closed…")
check("cap5, band5", skill_band_allowed("number-bonds-10", BANDS, 5), True)
check("cap5, unknown", skill_band_allowed(UNKNOWN, BANDS, 5), False)

print("⑤  Boundary equality…")
check("cap == band (5)", skill_band_allowed("number-bonds-10", BANDS, 5), True)
check("cap < band (4)", skill_band_allowed("number-bonds-10", BANDS, 4), False)

print("⑥  Empty band map edge (no catalog)…")
check("empty, no cap", skill_band_allowed("count-1-10", {}, None), True)
check("empty, cap", skill_band_allowed("count-1-10", {}, 1), False)  # fail-closed

print()
print(f"✓ band-lock matrix: {passes} passed, {fails} failed")
sys.exit(1 if fails else 0)

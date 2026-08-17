#!/usr/bin/env python3
"""Premium-gate test matrix for the server-side freemium content gate.

Worlds 1–2 (bands 1–2) are free; bands 3+ require a "plus" plan. These tests
prove the SERVER enforcement is airtight for the tampered-client case: a "free"
plan can never persist band-3+ progress/stories, and an unknown skill fails
closed. `premium_gate.skill_allowed` is dependency-free so this runs in CI with
no Postgres.

Run:  python3 apps/api/tests/test_premium_gate.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.premium_gate import skill_allowed  # noqa: E402

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


print("①  plus → everything passes…")
check("plus, band1", skill_allowed("plus", 1), True)
check("plus, band2", skill_allowed("plus", 2), True)
check("plus, band3", skill_allowed("plus", 3), True)
check("plus, band8", skill_allowed("plus", 8), True)
check("plus, unknown", skill_allowed("plus", None), True)

print("②  free → bands 1–2 pass, 3+ blocked…")
check("free, band1", skill_allowed("free", 1), True)
check("free, band2", skill_allowed("free", 2), True)
check("free, band3", skill_allowed("free", 3), False)
check("free, band8", skill_allowed("free", 8), False)

print("③  free + unknown skill band → fails closed…")
check("free, unknown", skill_allowed("free", None), False)

print("④  None plan (legacy/unknown) → treated as free…")
check("none, band2", skill_allowed(None, 2), True)
check("none, band3", skill_allowed(None, 3), False)
check("none, unknown", skill_allowed(None, None), False)

print()
print(f"✓ premium-gate matrix: {passes} passed, {fails} failed")
sys.exit(1 if fails else 0)

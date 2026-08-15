#!/usr/bin/env python3
"""#1044 — per-subject Moni difficulty deltas.

The parent portal's per-subject stepper writes a subject → signed-level-offset
map on KidSettings; Pydantic must clamp every value to ±2 at the boundary (so
the JSONB column can never hold a runaway +5), and the router's PUT must clear
the map to None when the parent sends empty. This guards the schema behavior.

Standalone (no Postgres):  python3 apps/api/tests/test_moni_subject_deltas.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas import KidSettingsIn, KidSettingsOut  # noqa: E402

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


# ── KidSettingsIn clamps each value to ±2 ──
k = KidSettingsIn(moni_subject_deltas={"math": 5, "bangla": -3, "english": 1, "science": 0})
check("math +5 clamps to +2", k.moni_subject_deltas["math"], 2)
check("bangla -3 clamps to -2", k.moni_subject_deltas["bangla"], -2)
check("english +1 unchanged", k.moni_subject_deltas["english"], 1)
check("science 0 stays 0", k.moni_subject_deltas["science"], 0)

# ── None / absent = no parent choice ──
check("explicit None stays None", KidSettingsIn(moni_subject_deltas=None).moni_subject_deltas, None)
check("absent defaults to None", KidSettingsIn().moni_subject_deltas, None)
check("empty dict stays {} (not None)", KidSettingsIn(moni_subject_deltas={}).moni_subject_deltas, {})

# ── KidSettingsOut round-trips the map ──
out = KidSettingsOut(moni_subject_deltas={"math": 2})
check("out carries map", out.moni_subject_deltas, {"math": 2})
check("out defaults to None", KidSettingsOut().moni_subject_deltas, None)

print(f"\n─ {passes} passed, {fails} failed")
sys.exit(1 if fails else 0)

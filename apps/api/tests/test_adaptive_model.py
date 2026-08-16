#!/usr/bin/env python3
"""Server-side adaptive model + band-cap regression tests (v50 difficulty-model
feed #0/#2/#4/#5/#10).

The kid app is offline-first and hardcodes the BKT params, so the server must
mirror those constants and NEVER read the `adaptive` config row — otherwise the
parent portal and the device diverge. This suite proves, on pure functions with
no Postgres:

  #0  mastery decays over idle days in lockstep with the device (1 - 0.02)^days
  #2  the admin config schema accepts the full 5-param adaptive model
  #4  the default max_band mirrors the client's bandForAge (age 6 → band 3), so
      a band-3 round is NOT band_skipped
  #5  an age 9+ kid is cleared/raised from the old band-2 default cap
  #10 mastered_at is cleared when decay pulls mastery below the 0.8 bar

Run:  python3 apps/api/tests/test_adaptive_model.py
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.bandlock import skill_band_allowed  # noqa: E402
from app.routers.kids import _age_band_cap  # noqa: E402
from app.routers.progress import _decay, _next_mastered_at, DEFAULT_PARAMS  # noqa: E402

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if isinstance(want, float):
        ok = abs(got - want) < 1e-9
    else:
        ok = got == want
    if ok:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


NOW = datetime.now(timezone.utc)

print("①  Feed #0 — idle decay matches the device's (1 - decayPerDay)^days…")
mastered = 0.9
decayed = _decay(mastered, NOW - timedelta(days=30), NOW, DEFAULT_PARAMS["decay_per_day"])
want = mastered * (0.98 ** 30)
check(f"0.9 after 30 idle days ≈ {want:.4f}", decayed, want)
check("30-day decay actually dropped the mastery", decayed < mastered, True)
check("no decay on a fresh row (last_decay None)", _decay(0.9, None, NOW, 0.02), 0.9)
check("no decay on a same-instant round", _decay(0.9, NOW, NOW, 0.02), 0.9)
check("400 idle days nearly floors mastery (still tiny, never negative)", _decay(0.01, NOW - timedelta(days=400), NOW, 0.02) < 1e-4, True)

print("②  Feed #10 — mastered_at clears when decay pulls mastery below 0.8…")
below = _decay(mastered, NOW - timedelta(days=15), NOW, 0.02)  # 0.9*0.98^15 ≈ 0.664 < 0.8
mastered_at = NOW - timedelta(days=16)
check("15 idle days dropped 0.9 below the 0.8 bar", below < 0.8, True)
check("mastered_at cleared on decay below bar", _next_mastered_at(0.9, below, mastered_at, 0.8, NOW), None)
check("no crossing + no stamp → stays None (no retroactive stamp)", _next_mastered_at(0.9, 0.85, None, 0.8, NOW), None)
check("stamp kept when still above (was mastered)", _next_mastered_at(0.9, 0.82, mastered_at, 0.8, NOW), mastered_at)
check("first crossing stamps once", _next_mastered_at(0.7, 0.9, None, 0.8, NOW) == NOW, True)
check("already-mastered crossing never overwrites", _next_mastered_at(0.7, 0.95, mastered_at, 0.8, NOW), mastered_at)

print("③  Feed #2 — admin config schema accepts the full 5-param adaptive model…")
from app.routers.admin import CONFIG_SCHEMAS  # noqa: E402
sch = CONFIG_SCHEMAS["adaptive"]
for k in ("pLearn", "pGuess", "pSlip", "decayPerDay", "masteryThreshold"):
    check(f"schema property {k} defined", k in sch["properties"], True)
check("schema requires all 5 params", sorted(sch["required"]) ==
      sorted(["pLearn", "pGuess", "pSlip", "decayPerDay", "masteryThreshold"]), True)
check("decayPerDay bounded 0..1", sch["properties"]["decayPerDay"], {"type": "number", "minimum": 0.0, "maximum": 1.0})
check("masteryThreshold bounded 0..1", sch["properties"]["masteryThreshold"], {"type": "number", "minimum": 0.0, "maximum": 1.0})

print("④  Feed #4 — default max_band mirrors client bandForAge (age 6 → band 3)…")
# Today is 2026: birth_year 2020 → age 6.
check("age 6 → cap 3 (client bandForAge(6) = 3)", _age_band_cap(2020), 3)
check("age 7 → cap 3", _age_band_cap(2019), 3)
check("age 8 → cap 4 (client bandForAge(8) = 4)", _age_band_cap(2018), 4)
check("age 14 → cap 8 (Summit Peaks reachable)", _age_band_cap(2012), 8)
check("age 2 → cap 1 (youngest)", _age_band_cap(2024), 1)
check("no birth_year → None (parent sets manually)", _age_band_cap(None), None)
# The done criterion: a band-3 progress event for a 6-year-old must NOT be
# band_skipped. Use a band-3 skill id with cap 3.
BANDS3 = {"count-1-10": 1, "count-to-50": 2, "number-bonds-10": 3}
check("band-3 round passes under the age-6 cap (not band_skipped)",
      skill_band_allowed("number-bonds-10", BANDS3, _age_band_cap(2020)), True)
check("band-1 round still passes", skill_band_allowed("count-1-10", BANDS3, _age_band_cap(2020)), True)

print("⑤  Feed #5 — an age 9+ kid is cleared/raised, not stuck at band 2…")
check("age 9 → cap 4 (was None/2, now raised)", _age_band_cap(2017), 4)
check("age 12 → cap 5", _age_band_cap(2014), 5)
check("age 15 → cap 8", _age_band_cap(2011), 8)

print()
print(f"✓ adaptive-model suite: {passes} passed, {fails} failed")
sys.exit(1 if fails else 0)

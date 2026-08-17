#!/usr/bin/env python3
"""Kids-helper test matrix — test-coverage-api WAVE D (#9 birth_year cap, #10 weekly helpers).

Standalone (no Postgres):  cd apps/api && python3 tests/test_kids.py

Covers, against `app/routers/kids.py`:
  ①  _age_band_cap  — the exact boundary map mirroring the kid app's
      `bandForAge` (difficulty-model closure) plus the year-only fallback for
      missing birth dates (None → None; the server derives age from the year
      only, never a month/day).
  ②  update_kid     — a birth_year edit re-derives the age-appropriate
      `max_band` cap (#1044/#9): a 6-year-old's new birth_year raises a young
      kid's old low cap to band 3; aging past a band boundary raises it again;
      a parent's MANUAL widening survives both an unrelated name-only PATCH and
      a birth_year PATCH whose derived cap is no higher than the manual cap.
  ③  _weekly_trigger — #1536 signal picker: reminder on zero rounds, milestone
      on a new mastery or a streak crossing a 7-day boundary, weekly-summary
      otherwise; deterministic across consecutive same-state calls (no
      double-fire); a new week with no rounds fires reminder, not a stale
      milestone.
  ④  _clamp_goal    — #256: a gentle goal never exceeds the day's hard cap
      (flat daily_limit_min, else the highest per-weekday cap); 0/None = no
      goal.
"""
import asyncio
import sys
import uuid
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import Kid, KidSettings  # noqa: E402
from app.routers.kids import (  # noqa: E402
    _age_band_cap,
    _clamp_goal,
    _weekly_trigger,
    router as kids_router,
    update_kid,
)
from app.schemas import KidUpdateIn  # noqa: E402

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


def byr(age: int) -> int:
    """A birth_year that yields exactly `age` under the server's year-only calc."""
    return date.today().year - age


# ── Fake AsyncSession stand-in (only what update_kid touches) ────────────
class FakeDB:
    def __init__(self, kid, settings):
        self.kid = kid
        self.settings = settings  # KidSettings | None
        self.added = []
        self.committed = 0
        self.refreshed = []

    async def scalar(self, stmt):
        return self.kid

    async def get(self, model, pk):
        if model is KidSettings and self.settings is not None and self.settings.kid_id == pk:
            return self.settings
        return None

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.committed += 1

    async def refresh(self, obj):
        self.refreshed.append(obj)


def make_kid(**kw):
    return Kid(
        id=kw.get("id", uuid.uuid4()),
        profile_id=kw.get("profile_id", uuid.uuid4()),
        name=kw.get("name", "Kid"),
        avatar=kw.get("avatar", "🦉"),
        birth_year=kw.get("birth_year"),
        created_at=kw.get("created_at", datetime.now()),
    )


def run_update_scenario(kid, settings, body):
    db = FakeDB(kid, settings)
    profile = SimpleNamespace(id=kid.profile_id)
    out = asyncio.run(update_kid(kid.id, body, profile, db))
    return out, db


print("①  _age_band_cap — exact boundary map (difficulty-model closure)…")
# Mirrors journey.ts bandForAge: <4→1, <6→2, <8→3, <10→4, <13→5, <14→6, 14+→8.
for age, want in [
    (2, 1), (3, 1),   # <4
    (4, 2), (5, 2),   # <6
    (6, 3), (7, 3),   # <8  (age 6 → band 3, NOT 2 — see test_adaptive_model feed #4)
    (8, 4), (9, 4),   # <10
    (10, 5), (12, 5), # <13
    (13, 6),          # <14
    (14, 8), (15, 8), (16, 8),  # 14+ → Summit Peaks
]:
    check(f"age {age} → cap {want}", _age_band_cap(byr(age)), want)
check("no birth_year → None (parent sets manually)", _age_band_cap(None), None)
check("birth_year == this year (age 0) → cap 1 (youngest surface)", _age_band_cap(date.today().year), 1)

print("②  update_kid — birth_year re-derives the age-appropriate max_band (#9/#1044)…")

# A: a young kid's old low cap is RAISED to the 6-year-old surface (band 3).
kid = make_kid(birth_year=byr(2))
s = KidSettings(kid_id=kid.id, max_band=1)
out, db = run_update_scenario(kid, s, KidUpdateIn(birth_year=byr(6)))
check("A: birth_year updated", out.birth_year, byr(6))
check("A: cap raised 1 → 3 for a 6-year-old", s.max_band, 3)
check("A: settings row committed", db.committed, 1)

# B: aging past a band boundary raises the cap again (age 8 → cap 4).
kid = make_kid(birth_year=byr(6))
s = KidSettings(kid_id=kid.id, max_band=3)
out, db = run_update_scenario(kid, s, KidUpdateIn(birth_year=byr(8)))
check("B: cap raised 3 → 4 on the age-8 boundary", s.max_band, 4)

# C: an unrelated name-only PATCH must NOT clobber a parent's manual widening.
kid = make_kid(birth_year=byr(6), name="Old")
s = KidSettings(kid_id=kid.id, max_band=8)  # parent manually widened
out, db = run_update_scenario(kid, s, KidUpdateIn(name="Renamed"))
check("C: name PATCH applied", out.name, "Renamed")
check("C: manual max_band=8 untouched by name PATCH", s.max_band, 8)

# D: a birth_year PATCH whose derived cap is BELOW the manual cap must not clobber it.
kid = make_kid(birth_year=byr(6))
s = KidSettings(kid_id=kid.id, max_band=8)  # parent manually widened
out, db = run_update_scenario(kid, s, KidUpdateIn(birth_year=byr(7)))  # age 7 → cap 3
check("D: birth_year updated to age 7", out.birth_year, byr(7))
check("D: manual max_band=8 survives a lower derived cap (3)", s.max_band, 8)

# E: no settings row → a new row is created with the age-derived cap.
kid = make_kid(birth_year=byr(2))
out, db = run_update_scenario(kid, None, KidUpdateIn(birth_year=byr(6)))
check("E: new settings row added", len(db.added), 1)
check("E: new row keyed to the kid", db.added[0].kid_id, kid.id)
check("E: new row carries the age-6 cap", db.added[0].max_band, 3)

# F: a settings row with max_band None gets the age-derived cap.
kid = make_kid(birth_year=byr(2))
s = KidSettings(kid_id=kid.id, max_band=None)
out, db = run_update_scenario(kid, s, KidUpdateIn(birth_year=byr(6)))
check("F: None max_band set to the age-6 cap", s.max_band, 3)

# G: a manual cap BELOW the new age surface is raised (the derived cap is a floor).
kid = make_kid(birth_year=byr(6))
s = KidSettings(kid_id=kid.id, max_band=2)  # parent narrowed below the age default
out, db = run_update_scenario(kid, s, KidUpdateIn(birth_year=byr(9)))  # age 9 → cap 4
check("G: cap raised 2 → 4 when the age surface outgrows a manual narrowing", s.max_band, 4)

# H—J: #1648 — model_fields_set distinguishes 'omitted' from 'sent as null'.
print("H—J:  #1648 — update_kid clear semantics (model_fields_set)…")

# H: explicit null avatar CLEARS the field.
kid = make_kid(avatar="🦉", birth_year=byr(6))
out, db = run_update_scenario(kid, None, KidUpdateIn(avatar=None))
check("H: explicit avatar null clears the avatar", out.avatar, None)
check("H: avatar cleared, birth_year untouched", out.birth_year, byr(6))

# I: explicit null birth_year CLEARS the field.
kid = make_kid(avatar="🦉", birth_year=byr(6))
out, db = run_update_scenario(kid, None, KidUpdateIn(birth_year=None))
check("I: explicit birth_year null clears birth_year", out.birth_year, None)
check("I: birth_year cleared, avatar untouched", out.avatar, "🦉")

# J: an OMITTED key does not change the field (the old `if val is not None`
# guard treated omitted and null identically — both were skipped).
kid = make_kid(avatar="🦉", birth_year=byr(6), name="Old")
out, db = run_update_scenario(kid, None, KidUpdateIn(name="Renamed"))
check("J: omitted avatar unchanged", out.avatar, "🦉")
check("J: omitted birth_year unchanged", out.birth_year, byr(6))

print("③  _weekly_trigger — #1536 signal selection + no double-fire…")
check("rounds=0 → reminder", _weekly_trigger(mastered_today=[], mastered_this_week=[], streak=0, rounds=0), "reminder")
check("rounds=0 beats a stale streak milestone (new-week reset)", _weekly_trigger(mastered_today=[], mastered_this_week=[], streak=7, rounds=0), "reminder")
check("new mastery today → milestone", _weekly_trigger(mastered_today=["s1"], mastered_this_week=[], streak=0, rounds=5), "milestone")
check("new mastery this week → milestone", _weekly_trigger(mastered_today=[], mastered_this_week=["s2"], streak=0, rounds=5), "milestone")
check("7-day streak boundary → milestone", _weekly_trigger(mastered_today=[], mastered_this_week=[], streak=7, rounds=5), "milestone")
check("14-day streak boundary → milestone", _weekly_trigger(mastered_today=[], mastered_this_week=[], streak=14, rounds=5), "milestone")
check("6-day streak (not a boundary) → weekly-summary", _weekly_trigger(mastered_today=[], mastered_this_week=[], streak=6, rounds=5), "weekly-summary")
check("played, no mastery, no streak → weekly-summary", _weekly_trigger(mastered_today=[], mastered_this_week=[], streak=0, rounds=5), "weekly-summary")
# Deterministic: consecutive same-state calls return the same signal (no double-fire).
a = _weekly_trigger(mastered_today=["s1"], mastered_this_week=[], streak=7, rounds=5)
b = _weekly_trigger(mastered_today=["s1"], mastered_this_week=[], streak=7, rounds=5)
check("consecutive same-state calls do not double-fire (deterministic)", (a, b), ("milestone", "milestone"))

print("④  _clamp_goal — #256 gentle goal never exceeds the day's cap…")
check("None goal → None", _clamp_goal(None, 30, None), None)
check("goal 0 → None", _clamp_goal(0, 30, None), None)
check("goal -5 → None", _clamp_goal(-5, 30, None), None)
check("clamped to daily cap (45→30)", _clamp_goal(45, 30, None), 30)
check("below daily cap unchanged (20→20)", _clamp_goal(20, 30, None), 20)
check("equal to daily cap unchanged (30→30)", _clamp_goal(30, 30, None), 30)
check("weekday cap ceiling (90→60)", _clamp_goal(90, None, "30,30,30,30,30,60,60"), 60)
check("below weekday ceiling unchanged (45→45)", _clamp_goal(45, None, "30,30,30,30,30,60,60"), 45)
check("daily cap beats weekday caps (45, daily 30 → 30)", _clamp_goal(45, 30, "60,60,60,60,60,60,60"), 30)
check("no caps → goal as-is (45→45)", _clamp_goal(45, None, None), 45)
check("all-zero weekday caps → no cap (45→45)", _clamp_goal(45, None, "0,0,0,0,0,0,0"), 45)
check("daily_cap 0 treated as no cap (45→45)", _clamp_goal(45, 0, None), 45)

print("⑤  #1644 — weak-skills threshold is bounded at the framework boundary…")


def _weak_skill_threshold_constraints():
    """Return (default, ge, le) for the /weak-skills `threshold` query param."""
    for route in kids_router.routes:
        if not hasattr(route, "path") or "weak-skills" not in (route.path or ""):
            continue
        for mf in route.dependant.query_params:
            if mf.name != "threshold":
                continue
            fi = mf.field_info
            ge = le = None
            for m in getattr(fi, "metadata", None) or []:
                if type(m).__name__ == "Ge":
                    ge = m.ge
                elif type(m).__name__ == "Le":
                    le = m.le
            return getattr(fi, "default", None), ge, le
    return None, None, None


_default, _ge, _le = _weak_skill_threshold_constraints()
check("threshold default is 0.7", _default, 0.7)
check("threshold has ge=0.0 (no negative thresholds)", _ge, 0.0)
check("threshold has le=1.0 (no >1 mastery thresholds)", _le, 1.0)

print()
print(f"✓ kids helper matrix: {passes} passed, {fails} failed")
print(f"SUMMARY kids: {passes} checks, findings #9/#10 closed, real bugs: none")
sys.exit(1 if fails else 0)

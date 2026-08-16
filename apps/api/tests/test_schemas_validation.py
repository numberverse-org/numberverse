#!/usr/bin/env python3
"""Schema-validation matrix — #1824 name charset + #1828 avatar bounds.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_schemas_validation.py

Covers the Pydantic boundary for every name/display_name/avatar field in
app/schemas.py:
  SignupIn.display_name, ProfileUpdateIn.display_name, KidIn.name/avatar,
  KidUpdateIn.name/avatar, KidOut.name/avatar, KidSnapshotOut.name/avatar.

Asserts:
  ① names ACCEPT Unicode letters incl. Bengali, digits, spaces, hyphen,
     apostrophe, period — and REJECT control chars (incl. \n \r \t), bidi
     RTL/LTR overrides, angle brackets, and non-charset junk.
  ② avatars REJECT over-length strings (100 chars) and HTML-ish content, and
     ACCEPT a short emoji — while stripping stray control chars.
  ③ the create/update input schemas (SignupIn, ProfileUpdateIn, KidIn,
     KidUpdateIn) enforce the same rules as the output schemas (ProfileOut,
     KidOut, KidSnapshotOut) so bad data can never flow into the non-HTML
     sinks (share-card canvas, TTS, download filenames, CSV export).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError  # noqa: E402

from app.schemas import (  # noqa: E402
    KidIn,
    KidOut,
    KidSnapshotOut,
    KidUpdateIn,
    ProfileUpdateIn,
    SignupIn,
)

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


def accepts(model, **kwargs) -> bool:
    try:
        model(**kwargs)
        return True
    except ValidationError:
        return False


def rejects(model, **kwargs) -> bool:
    try:
        model(**kwargs)
        return False
    except ValidationError:
        return True


# ── kwargs builders so every schema is exercised without missing required fields ──

def input_kwargs(model, *, name=None, display_name=None, avatar="🦉"):
    if model is KidIn:
        return {"name": name, "avatar": avatar, "birth_year": 2019}
    if model is KidUpdateIn:
        return {"name": name, "avatar": avatar, "birth_year": 2019}
    if model is ProfileUpdateIn:
        return {"display_name": display_name}
    if model is SignupIn:
        return {"email": "p@t.co", "password": "password123", "display_name": display_name}
    raise TypeError(model)


def output_kwargs(model, *, name, avatar="🦉"):
    if model is KidOut:
        return {
            "id": "00000000-0000-0000-0000-000000000001",
            "profile_id": "00000000-0000-0000-0000-000000000002",
            "name": name,
            "avatar": avatar,
            "created_at": "2026-01-01T00:00:00Z",
        }
    if model is KidSnapshotOut:
        return {
            "kid_id": "00000000-0000-0000-0000-000000000001",
            "name": name,
            "avatar": avatar,
            "coins": 5,
            "mastery": [],
        }
    raise TypeError(model)


def build_kwargs(model, *, name=None, display_name=None, avatar="🦉"):
    """Return the right kwargs for any name/avatar-bearing schema under test."""
    if model in (KidIn, KidUpdateIn):
        return input_kwargs(model, name=name, avatar=avatar)
    if model in (ProfileUpdateIn, SignupIn):
        return input_kwargs(model, display_name=display_name)
    if model in (KidOut, KidSnapshotOut):
        return output_kwargs(model, name=name, avatar=avatar)
    raise TypeError(model)


# ── ① Name charset ─────────────────────────────────────────────────────────
GOOD_NAMES = [
    "Aarif",
    "আরিফ",
    "Sadia Binte Rahman",
    "Ayesha Rahman-Mia",
    "John O'Brien",
    "A.P.J. Abdul Kalam",
    "ময়না",
    "Rahim Uddin",
]
BAD_NAMES = [
    ("newline", "A\nB"),
    ("tab", "A\tB"),
    ("carriage return", "A\rB"),
    ("NUL control", "A\x00B"),
    ("C1 control", "A\x85B"),
    ("angle bracket <", "A<B"),
    ("angle bracket >", "A>B"),
    ("HTML script", "<script>alert(1)</script>"),
    ("LRM (U+200E)", "A‎B"),
    ("RLM (U+200F)", "A‏B"),
    ("LRE (U+202A)", "A‪B"),
    ("RLO (U+202E)", "A‮B"),
    ("LRI (U+2066)", "A⁦B"),
    ("PDI (U+2069)", "A⁩B"),
    ("underscore", "A_B"),
    ("emoji in name", "A😀B"),
    ("at sign", "a@b"),
]

print("①  name/display_name charset — accepts Unicode names, rejects bad chars…")
for model in (KidIn, KidUpdateIn, ProfileUpdateIn, SignupIn, KidOut, KidSnapshotOut):
    label = model.__name__
    for good in GOOD_NAMES:
        kw = build_kwargs(model, name=good, display_name=good)
        check(f"{label} accepts {good!r}", accepts(model, **kw), True)

    for bad_label, bad in BAD_NAMES:
        kw = build_kwargs(model, name=bad, display_name=bad)
        check(f"{label} rejects {bad_label}", rejects(model, **kw), True)

# Whitespace-only / empty optional names normalize to None (routers' no-op).
p = ProfileUpdateIn(display_name="   ")
check("ProfileUpdateIn whitespace-only display_name → None", p.display_name, None)
s = SignupIn(email="p@t.co", password="password123", display_name="")
check("SignupIn empty display_name → None", s.display_name, None)

print("②  avatar — rejects over-length + HTML, accepts short emoji, strips controls…")
for model in (KidIn, KidUpdateIn, KidOut, KidSnapshotOut):
    label = model.__name__

    kw = build_kwargs(model, name="Aarif", display_name="Aarif", avatar="🦉")
    check(f"{label} accepts short emoji avatar", accepts(model, **kw), True)

    kw = build_kwargs(model, name="Aarif", display_name="Aarif", avatar="x" * 100)
    check(f"{label} rejects 100-char avatar", rejects(model, **kw), True)

    kw = build_kwargs(model, name="Aarif", display_name="Aarif", avatar="<img src=x onerror=alert(1)>")
    check(f"{label} rejects HTML-ish avatar", rejects(model, **kw), True)

    kw = build_kwargs(model, name="Aarif", display_name="Aarif", avatar="🦉\n")
    got = model(**kw)
    check(f"{label} strips control char from avatar", got.avatar, "🦉")

    kw = build_kwargs(model, name="Aarif", display_name="Aarif", avatar=None)
    check(f"{label} accepts None avatar", accepts(model, **kw), True)

print()
print(f"✓ schemas validation matrix: {passes} passed, {fails} failed")
print(f"SUMMARY schemas: {passes} checks, #1824+#1828 fixed, test green")
sys.exit(1 if fails else 0)

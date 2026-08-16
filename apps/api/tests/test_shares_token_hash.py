#!/usr/bin/env python3
"""#1777 share-token hash test matrix — the DB stores only a sha256 fingerprint.

Standalone (no Postgres, no pytest):  cd apps/api && python3 tests/test_shares_token_hash.py

Covers, against `app/routers/shares.py`:
  ①  _share_token_hash — one-way: 64 lowercase hex chars, deterministic, and a
      known sha256 vector (empty string) to pin the exact digest function.
  ②  _is_legacy_raw    — pre-migration plaintext `secrets.token_urlsafe(24)`
      values are exactly 32 url-safe chars → True; the new 64-hex → False;
      None/short/empty → False.
  ③  resolve_share_token — the pure public-lookup matcher: a new-form stored
      hash matches the hashed inbound token with no migration; a legacy raw
      stored value matches the raw inbound token and flags `needs_migration`;
      mismatches and empty stores resolve to (None, False).
  ④  two-step lookup simulation mirroring get_share_snapshot — including the
      Done-when #2 flow: a previously-minted plaintext link still resolves, and
      the row is lazily rewritten to a hash so the SAME link keeps working on
      the next hit via the new-form path.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.shares import (  # noqa: E402
    _is_legacy_raw,
    _share_token_hash,
    resolve_share_token,
)

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
        print(f"✓ {name}")
    else:
        fails += 1
        print(f"✖ {name}: got {got!r}, want {want!r}")


# A realistic legacy share link: url-safe base64 of 24 bytes == 32 chars.
LEGACY_RAW = "0123456789abcdefghijklmnopqrstuv"
assert len(LEGACY_RAW) == 32
RE_SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")

print("①  _share_token_hash — 64 lowercase hex, deterministic, one-way…")

h = _share_token_hash(LEGACY_RAW)
check("sha256(legacy) is a 64-char lowercase hex digest", bool(RE_SHA256_HEX.match(h)), True)
check("len == 64", len(h), 64)
check("deterministic: same token → same digest", _share_token_hash("x-y_2Z!"), _share_token_hash("x-y_2Z!"))
check("different tokens → different digests", _share_token_hash("token-a") != _share_token_hash("token-b"), True)
check(
    "pinned vector sha256(b'') == e3b0…2b855",
    _share_token_hash("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    True,
)
check("empty-string hash is not a legacy raw", _is_legacy_raw(_share_token_hash("")), False)

print("②  _is_legacy_raw — 32-char url-safe → True; 64-hex/None/short → False…")

check("32-char url-safe token → legacy True", _is_legacy_raw(LEGACY_RAW), True)
check("another real 32-char url-safe token → legacy True", _is_legacy_raw("abcdefghijklmnopqrstuvwxyzABCDEF"), True)
check("64-hex (new form) → legacy False", _is_legacy_raw(h), False)
check("None → legacy False", _is_legacy_raw(None), False)
check("empty string → legacy False", _is_legacy_raw(""), False)
check("short 8-char value → legacy False", _is_legacy_raw("abcd1234"), False)
check("33-char value → legacy False", _is_legacy_raw(LEGACY_RAW + "x"), False)

print("③  resolve_share_token — pure public-lookup matcher…")

stored_hash = _share_token_hash("inbound-fresh")
matching, migrate = resolve_share_token(stored_hash, "inbound-fresh")
check("new-form: stored hash matches hashed inbound, no migration", (matching, migrate), (stored_hash, False))
matching, migrate = resolve_share_token(LEGACY_RAW, LEGACY_RAW)
check("legacy: stored raw matches raw inbound, migration needed", (matching, migrate), (LEGACY_RAW, True))
matching, migrate = resolve_share_token(_share_token_hash("other"), "inbound-fresh")
check("mismatch: hash store vs wrong inbound → no match", (matching, migrate), (None, False))
matching, migrate = resolve_share_token(LEGACY_RAW, "abcdefghijklmnopqrstuvwxyzABCDEG")
check("mismatch: legacy store vs wrong inbound → no match", (matching, migrate), (None, False))

bytes32 = "a" * 32
matching, migrate = resolve_share_token(bytes32, bytes32)
check("legacy: 32-char a's match and migrate", (matching, migrate), (bytes32, True))

matching, migrate = resolve_share_token(None, "whatever-token")
check("empty store → no match, no migration", (matching, migrate), (None, False))
matching, migrate = resolve_share_token("", "whatever-token")
check("blank store → no match, no migration", (matching, migrate), (None, False))
matching, migrate = resolve_share_token("short", "short")
check("short 5-char store equal to inbound is NOT treated as legacy", (matching, migrate), (None, False))

print("④  two-step lookup simulation (get_share_snapshot mirror) — Done-when #2…")


def simulate_public_lookup(rows, inbound):
    """Mirror the route: hash-first, legacy-raw fallback, lazy migration flag."""
    token_hash = _share_token_hash(inbound)
    for kid_id, stored in rows.items():
        if stored and stored == token_hash:
            return kid_id, False
    for kid_id, stored in rows.items():
        if stored:
            _, needs_migration = resolve_share_token(stored, inbound)
            if needs_migration:
                return kid_id, True
    return None, False


# Legacy plaintext row: the SAME link resolves, and the row is rewritten to the
# fingerprint so the next hit goes through the new-form path.
rows = {"kid-1": LEGACY_RAW}
check("legacy row resolves to the kid (needs migration)", simulate_public_lookup(rows, LEGACY_RAW), ("kid-1", True))
rows["kid-1"] = _share_token_hash(LEGACY_RAW)  # lazy migration applied
check("after lazy migration, SAME link resolves via hash path", simulate_public_lookup(rows, LEGACY_RAW), ("kid-1", False))
check("migrated row stores a hash, not the raw token", rows["kid-1"] != LEGACY_RAW and RE_SHA256_HEX.match(rows["kid-1"]) is not None, True)

# Fresh-mint row: hash in DB, raw only in the minting response.
fresh = "fresh-minted-url-safe-abcdefghijk"
rows = {"kid-2": _share_token_hash(fresh)}
check("new-form row resolves via hashed inbound", simulate_public_lookup(rows, fresh), ("kid-2", False))
check("new-form row does NOT resolve the raw as a separate match", simulate_public_lookup(rows, "some-other-token-abc-321"), (None, False))
check("unknown kid → no match", simulate_public_lookup({}, "whatever"), (None, False))

print()
if fails:
    print(f"✗ share-token-hash suite: {passes} passed, {fails} failed")
    sys.exit(1)
print(f"✓ share-token-hash suite: {passes} passed, 0 failed")

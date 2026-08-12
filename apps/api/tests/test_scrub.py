"""Self-contained unit tests for the PII scrubber (#266, #270).

Run:  python3 apps/api/tests/test_scrub.py   (no pytest needed)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.scrub import redact_context, redact_text, ScrubFilter  # noqa: E402

import logging  # noqa: E402

fails = []


def check(name, got, want):
    if got == want:
        print(f"  ✓ {name}")
    else:
        fails.append(name)
        print(f"  ✖ {name}: got {got!r} want {want!r}")


# ── redact_text ──
check("email", redact_text("write to mom@example.com now"), "write to [REDACTED] now")
check("ipv4", redact_text("from 192.168.1.99 at night"), "from [REDACTED] at night")
check("ipv6", redact_text("fe80::1ff:fe23:4567:890a"), "[REDACTED]")
check("bd mobile", redact_text("call 01712-345678 today"), "call [REDACTED] today")
check("bd landline", redact_text("02-9887654 ok"), "[REDACTED] ok")
check("card digits", redact_text("4111111111111111"), "[REDACTED]")
check("mac", redact_text("aa:bb:cc:dd:ee:ff"), "[REDACTED]")
check("plain", redact_text("just words"), "just words")
check("empty", redact_text(""), "")
check("idempotent", redact_text(redact_text("a@b.com")), "[REDACTED]")

# ── redact_context (deep walk, no mutation) ──
ctx = {"reason": "call 01712345678", "meta": {"email": "x@y.io", "ok": 42}, "tags": ["ip 10.0.0.1"]}
out = redact_context(ctx)
check("deep string", out["reason"], "call [REDACTED]")
check("nested string", out["meta"]["email"], "[REDACTED]")
check("int preserved", out["meta"]["ok"], 42)
check("list element", out["tags"][0], "ip [REDACTED]")
check("no mutation", ctx["reason"], "call 01712345678")
check("none", redact_context(None), None)

# ── ScrubFilter ──
rec = logging.LogRecord("n", logging.INFO, "f", 1, "mail %s arrived", ("a@b.io",), None)
ScrubFilter().filter(rec)
check("log msg arg", rec.args, ("[REDACTED]",))

print("─" * 30)
if fails:
    print(f"✖ {len(fails)} failed: {fails}")
    sys.exit(1)
print("✓ all scrub tests passed")

#!/usr/bin/env python3
"""Self-contained tests for the structured error log (#124).

Run:  python3 apps/api/tests/test_errorlog.py
No pytest, no network — mirrors test_scrub.py's style.
"""
import json
import logging
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import errorlog  # noqa: E402

FAILS = []


def check(name, cond, detail=""):
    mark = "✓" if cond else "✖"
    print(f"  {mark} {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILS.append(name)


def reset(log_path, max_bytes=None):
    """Point errorlog at a fresh temp file and clear module state."""
    errorlog.LOG_PATH = log_path
    errorlog._ATTACHED = False
    errorlog._handler = None
    # remove any existing file handler from root
    root = logging.getLogger()
    root.handlers[:] = [h for h in root.handlers
                        if not isinstance(h, logging.handlers.RotatingFileHandler)]
    return errorlog.install(max_bytes=max_bytes)


def read_lines(path):
    return [l for l in open(path, encoding="utf-8").read().splitlines() if l.strip()]


def test_write_scrub_no_info():
    print("① WARNING/ERROR → file as JSON; INFO never lands; PII redacted")
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "error.log")
        reset(path)
        log = logging.getLogger("numberverse.test")
        log.warning("call 01712345678 now")
        log.error("boom for a@b.com please")
        log.info("this must not be on disk 01712345678")
        lines = read_lines(path)
        check("two records (warn+error) written", len(lines) == 2, f"got {len(lines)}")
        if len(lines) == 2:
            a, b = (json.loads(l) for l in lines)
            check("line 1 is WARNING level", a["level"] == "WARNING")
            check("line 2 is ERROR level", b["level"] == "ERROR")
            check("phone redacted in msg", "01712345678" not in a["msg"] and "[REDACTED]" in a["msg"])
            check("email redacted in msg", "a@b.com" not in b["msg"] and "[REDACTED]" in b["msg"])
            check("no info record on disk", all("must not be on disk" not in l["msg"] for l in (a, b)))


def test_traceback_scrubbed():
    print("② rendered traceback is PII-redacted")
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "error.log")
        reset(path)
        log = logging.getLogger("numberverse.test")
        try:
            raise ValueError("failed for kid 01712345678 at 203.0.113.9")
        except ValueError:
            log.error("embed tick failed", exc_info=True)
        lines = read_lines(path)
        check("one record written", len(lines) == 1, f"got {len(lines)}")
        if lines:
            rec = json.loads(lines[0])
            exc = rec.get("exc", "")
            check("traceback captured", "ValueError" in exc)
            check("phone redacted in traceback", "01712345678" not in exc)
            check("IP redacted in traceback", "203.0.113.9" not in exc)


def test_rotation():
    print("③ size-based rotation produces a .1 backup")
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "error.log")
        reset(path, max_bytes=512)  # tiny so a few records rotate
        log = logging.getLogger("numberverse.test")
        for i in range(30):
            log.error(f"boom #{i} with some padding 0123456789abcdef")
        backups = [f for f in os.listdir(d) if f.startswith("error.log")]
        check("backup file exists (error.log.1)", any(f.endswith(".1") for f in backups), f"{sorted(backups)}")
        cur = read_lines(path)
        check("current file still JSON-lines", all(l.startswith("{") for l in cur))


def test_idempotent():
    print("④ install() attaches the handler at most once")
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "error.log")
        reset(path)
        errorlog.install()  # second call must be a no-op
        file_handlers = [h for h in logging.getLogger().handlers
                         if isinstance(h, logging.handlers.RotatingFileHandler)]
        check("exactly one file handler", len(file_handlers) == 1, f"got {len(file_handlers)}")


def test_request_id_in_records():
    print("⑤ formatter emits request_id (contextvar value; '-' when unset)")
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "error.log")
        reset(path)
        log = logging.getLogger("numberverse.test")
        tok = errorlog.request_id_ctx.set("req-trace-001")
        try:
            log.error("boom with contextvar set")
        finally:
            errorlog.request_id_ctx.reset(tok)
        log.error("boom with contextvar unset")
        lines = read_lines(path)
        check("two records written", len(lines) == 2, f"got {len(lines)}")
        if len(lines) == 2:
            a, b = (json.loads(l) for l in lines)
            check("request_id equals contextvar value", a["request_id"], "req-trace-001")
            check("request_id defaults to '-' when unset", b["request_id"], "-")
            check("existing keys still present (level/logger/msg)", all(
                k in a and k in b for k in ("ts", "level", "logger", "msg")
            ), True)


if __name__ == "__main__":
    test_write_scrub_no_info()
    test_traceback_scrubbed()
    test_rotation()
    test_idempotent()
    test_request_id_in_records()
    print()
    if FAILS:
        print(f"✖ {len(FAILS)} check(s) failed: {FAILS}")
        sys.exit(1)
    print("✓ all errorlog checks passed")

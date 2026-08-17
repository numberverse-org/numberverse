#!/usr/bin/env python3
"""bKash success-detection matrix — the pure part of the billing integration.

`is_completed` decides whether an execute response activates the subscription.
It must accept bKash's real success shape ("0000" + "Completed"/"Successful")
and reject every other status code/status, so a parent is never marked "plus"
on a failed or ambiguous transaction. Dependency-free (no requests/network).

Run:  python3 apps/api/tests/test_bkash.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.bkash import is_completed  # noqa: E402

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


print("①  success shapes → True…")
check("0000/Completed", is_completed({"statusCode": "0000", "transactionStatus": "Completed"}), True)
check("0000/Successful", is_completed({"statusCode": "0000", "transactionStatus": "Successful"}), True)

print("②  failure / ambiguous shapes → False…")
check("0030/Failed", is_completed({"statusCode": "0030", "transactionStatus": "Failed"}), False)
check("0000/Failed", is_completed({"statusCode": "0000", "transactionStatus": "Failed"}), False)
check("2062 (already completed → re-query path)", is_completed({"statusCode": "2062", "transactionStatus": "Completed"}), False)
check("0000/Initiated", is_completed({"statusCode": "0000", "transactionStatus": "Initiated"}), False)
check("missing statusCode", is_completed({"transactionStatus": "Completed"}), False)
check("empty dict", is_completed({}), False)

print()
print(f"✓ bkash matrix: {passes} passed, {fails} failed")
sys.exit(1 if fails else 0)

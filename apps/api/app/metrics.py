"""In-process Prometheus-style metrics (#1755).

Dependency-free: counters & histograms are plain dicts behind one lock, and
`render_metrics()` emits the Prometheus text exposition format by hand — no
`prometheus_client` dependency. Nothing here touches the DB or the network, so
the /metrics endpoint keeps working even while the DB pool is exhausted (that is
exactly the moment an operator needs it).

The registry holds three time series:
  · http_requests_total{route,status}            — counter, one per route+status
  · request_latency_seconds{route}               — histogram (cumulative buckets)
  · db_checkout_wait_seconds                     — histogram (no labels), fed by
                                                  db.py's telemetry session
"""
from __future__ import annotations

import threading

_INF = float("inf")

# Histogram bucket UPPER bounds (seconds). A request that completes in ≤bound
# lands in that bucket; the final +Inf bucket catches the tail so cumulative
# bucket counts always reach the sample count.
LATENCY_BUCKETS: tuple[float, ...] = (
    0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, _INF,
)
# DB pool checkout waits are normally sub-ms; tight buckets make a saturating
# pool obvious (observations landing in the upper buckets = pool exhausted).
CHECKOUT_BUCKETS: tuple[float, ...] = (
    0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, _INF,
)

_lock = threading.Lock()

# http_requests_total{route,status} — (route, str(status)) -> count
_http_requests: dict[tuple[str, str], int] = {}

# request_latency_seconds{route} — cumulative histogram per route label:
#   _latency_counts[(route, bucket_idx)] -> cumulative count in that bucket
#   _latency_sum[route] / _latency_n[route] -> sum / sample count
_latency_counts: dict[tuple[str, int], int] = {}
_latency_sum: dict[str, float] = {}
_latency_n: dict[str, int] = {}

# db_checkout_wait_seconds — global cumulative histogram (no labels).
_checkout_counts: dict[int, int] = {}
_checkout_sum = 0.0
_checkout_n = 0


def _bucket_index(buckets: tuple[float, ...], value: float) -> int:
    """Index of the smallest bucket bound >= value (last bucket catches all)."""
    for i, bound in enumerate(buckets):
        if value <= bound:
            return i
    return len(buckets) - 1


def observe_http(route: str, status: int, seconds: float) -> None:
    """Record one completed HTTP request.

    `route` is a low-cardinality label (already normalized by the middleware);
    `status` is the HTTP status code; `seconds` is the end-to-end latency.
    """
    with _lock:
        key = (route, str(int(status)))
        _http_requests[key] = _http_requests.get(key, 0) + 1
        idx = _bucket_index(LATENCY_BUCKETS, seconds)
        _latency_counts[(route, idx)] = _latency_counts.get((route, idx), 0) + 1
        _latency_sum[route] = _latency_sum.get(route, 0.0) + seconds
        _latency_n[route] = _latency_n.get(route, 0) + 1


def observe_checkout_wait(seconds: float) -> None:
    """Record one DB pool checkout wait (fed by the telemetry session in db.py)."""
    global _checkout_sum, _checkout_n
    with _lock:
        idx = _bucket_index(CHECKOUT_BUCKETS, seconds)
        _checkout_counts[idx] = _checkout_counts.get(idx, 0) + 1
        _checkout_sum += seconds
        _checkout_n += 1


def _escape_label(value: str) -> str:
    """Escape a label value for the text format (backslash + double quote)."""
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _fmt(v: float | int) -> str:
    """Format a number the way Prometheus expects (``+Inf`` for infinity)."""
    if isinstance(v, float) and v == _INF:
        return "+Inf"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return repr(v)


def render_metrics() -> str:
    """Render the full registry in Prometheus text format (trailing newline)."""
    with _lock:
        lines: list[str] = []

        # ── http_requests_total ─────────────────────────────────────────────
        lines.append("# HELP http_requests_total Total HTTP requests by route and status.")
        lines.append("# TYPE http_requests_total counter")
        for (route, status), count in sorted(_http_requests.items()):
            lines.append(
                f'http_requests_total{{route="{_escape_label(route)}",status="{status}"}} {count}'
            )

        # ── request_latency_seconds (per-route histogram) ──────────────────
        lines.append("# HELP request_latency_seconds HTTP request latency in seconds.")
        lines.append("# TYPE request_latency_seconds histogram")
        for route in sorted(_latency_n):
            cumulative = 0
            for i, bound in enumerate(LATENCY_BUCKETS):
                cumulative += _latency_counts.get((route, i), 0)
                le = "+Inf" if bound == _INF else str(bound)
                lines.append(
                    f'request_latency_seconds_bucket{{route="{_escape_label(route)}",le="{le}"}} {cumulative}'
                )
            lines.append(
                f'request_latency_seconds_sum{{route="{_escape_label(route)}"}} {_fmt(_latency_sum[route])}'
            )
            lines.append(
                f'request_latency_seconds_count{{route="{_escape_label(route)}"}} {_latency_n[route]}'
            )

        # ── db_checkout_wait_seconds (global histogram) ────────────────────
        lines.append("# HELP db_checkout_wait_seconds DB pool checkout wait in seconds.")
        lines.append("# TYPE db_checkout_wait_seconds histogram")
        cumulative = 0
        for i, bound in enumerate(CHECKOUT_BUCKETS):
            cumulative += _checkout_counts.get(i, 0)
            le = "+Inf" if bound == _INF else str(bound)
            lines.append(f'db_checkout_wait_seconds_bucket{{le="{le}"}} {cumulative}')
        lines.append(f"db_checkout_wait_seconds_sum {_fmt(_checkout_sum)}")
        lines.append(f"db_checkout_wait_seconds_count {_checkout_n}")

        return "\n".join(lines) + "\n"

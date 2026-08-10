#!/usr/bin/env python3
"""🧠 Numberverse Oracle Council — weekly strategy brief.

Aggregates the daily Oracle Team standups (mem API `oracle_team/standup_*`)
into one weekly brief: per-layer pass-rate trend, every flag collected across
the week, and the Council's recommendations. Writes docs/ORACLE_COUNCIL.md and
learns the brief to the mem API (`oracle_council/weekly_YYYY-WW`).

Usage:
    python3 scripts/team/oracle_council.py            # run now
    python3 scripts/team/oracle_council.py --weeks 2  # look back N weeks
    python3 scripts/team/oracle_council.py --once-now # skip memory + file

Launchd: com.tresha.oracle-council runs this weekly (StartInterval 604800).
"""
import os, re, sys, json, urllib.request
from pathlib import Path
from datetime import date, timedelta, datetime

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
MEM_API = "http://127.0.0.1:8765"
SKIP_MEM = "--once-now" in sys.argv
LOOKBACK_WEEKS = 2
for a in sys.argv:
    if a.startswith("--weeks"):
        LOOKBACK_WEEKS = int(a.split("=")[1])

LAYERS = ["🧠 Oracle", "🛠️ Eng", "🛡️ Trust", "🎨 Content", "🚀 Growth"]

def mem_list(module: str):
    try:
        with urllib.request.urlopen(f"{MEM_API}/memories/{module}", timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"⚠ mem list failed: {e}")
        return []

def load_standups(days_back: int = 14):
    """Fetch all standup_YYYY-MM-DD memories, newest-last, within days_back."""
    rows = mem_list("oracle_team")
    out = []
    cutoff = date.today() - timedelta(days=days_back)
    for r in rows:
        key = r.get("key", "")
        m = re.fullmatch(r"standup_(\d{4}-\d{2}-\d{2})", key)
        if not m:
            continue
        try:
            d = date.fromisoformat(m.group(1))
        except ValueError:
            continue
        if d < cutoff:
            continue
        try:
            val = json.loads(r["value"])
        except Exception:
            val = {}
        out.append({"date": d, "summary": val})
    out.sort(key=lambda x: x["date"])
    return out

def isoweek(d: date) -> str:
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"

def main():
    standups = load_standups(days_back=7 * LOOKBACK_WEEKS)
    if not standups:
        print("🧠 No standups found in the last %s week(s) — nothing to brief." % LOOKBACK_WEEKS)
        return 0

    week_label = isoweek(date.today())
    total_ok = sum(s["summary"].get("ok", 0) for s in standups)
    total_checked = sum(s["summary"].get("checked", 0) for s in standups)
    total_fail = sum(s["summary"].get("fail", 0) for s in standups)
    # all flags collected across the week (dedup by role)
    flags = []
    seen = set()
    for s in standups:
        for f in s["summary"].get("flags", []):
            role = f.split("/")[0].split(":")[0] if "/" in f else f
            if role in seen:
                continue
            seen.add(role)
            flags.append({"date": s["date"].isoformat(), "flag": f})
    # per-layer totals
    per_layer = {}
    for s in standups:
        for layer, c in (s["summary"].get("by_layer") or {}).items():
            pl = per_layer.setdefault(layer, {"ok": 0, "other": 0})
            pl["ok"] += c.get("ok", 0)
            pl["other"] += c.get("other", 0)
    # trend: first half vs second half pass rate (n/a until we have 2+ standups)
    half = max(1, len(standups) // 2)
    early = [s for s in standups[:half]]
    late = [s for s in standups[half:]]
    def rate(ss):
        c = sum(x["summary"].get("checked", 0) for x in ss) or 1
        o = sum(x["summary"].get("ok", 0) for x in ss)
        return round(100 * o / c)
    trend = rate(late) - rate(early) if len(standups) >= 2 else None
    trend_txt = f"{trend:+d} pts vs first half" if trend is not None else "n/a (need 2+ standups)"

    lines = []
    lines.append(f"# 🧠 Oracle Council — Weekly Brief  {week_label}")
    lines.append(f"> {len(standups)} standups · {total_ok}/{total_checked} checks passed "
                 f"({total_fail} ✖ across the week) · trend {trend_txt}\n")
    lines.append("## Health by layer")
    for layer in LAYERS:
        pl = per_layer.get(layer, {"ok": 0, "other": 0})
        tot = pl["ok"] + pl["other"]
        pct = round(100 * pl["ok"] / max(1, tot))
        mark = "🟢" if pct >= 95 else "🟡" if pct >= 80 else "🔴"
        lines.append(f"- {mark} **{layer}** — {pl['ok']}/{tot} checks passed ({pct}%)")
    lines.append("")
    if flags:
        lines.append("## Flags this week (owning role → what broke)")
        for f in flags:
            lines.append(f"- `{f['date']}` {f['flag']}")
        lines.append("")
    else:
        lines.append("## Flags this week\n- None — the team held a clean week. ✅\n")
    lines.append("## Council recommendations")
    worst = sorted(per_layer.items(), key=lambda kv: kv[1]["ok"] / max(1, kv[1]["ok"] + kv[1]["other"]))
    if worst and worst[0][1]["ok"] + worst[0][1]["other"] > 0 and worst[0][1]["ok"] / (worst[0][1]["ok"] + worst[0][1]["other"]) < 1:
        lines.append(f"- Give **{worst[0][0]}** the first review pass next sprint — it's the weakest layer this week.")
    if total_fail == 0:
        lines.append("- No failures to action — keep shipping; the guardrails are holding.")
    elif len(flags) <= 2:
        lines.append("- Few, specific failures: assign each flag to its owning role and re-run the standup to confirm green.")
    else:
        lines.append("- Multiple failures across layers: block any release until the standup is CLEAN.")
    lines.append("- Next council: review the weekly trend + parent-facing wins; keep the child-first bar.")
    report = "\n".join(lines)

    # write the brief
    DOCS.mkdir(parents=True, exist_ok=True)
    fname = DOCS / f"ORACLE_COUNCIL_{week_label}.md"
    fname.write_text(report + "\n")
    latest = DOCS / "ORACLE_COUNCIL.md"
    latest.write_text(report + "\n")

    if not SKIP_MEM:
        brief = {
            "week": week_label, "generated": datetime.now().isoformat(timespec="seconds"),
            "standups": len(standups), "checked": total_checked, "ok": total_ok,
            "fail": total_fail, "trend_pts": trend, "per_layer": per_layer,
            "flags": flags,
        }
        try:
            payload = json.dumps({"items": [
                {"module": "oracle_council", "key": f"weekly_{week_label}",
                 "value": json.dumps(brief), "importance": 5},
                {"module": "oracle_council", "key": "latest",
                 "value": json.dumps(brief), "importance": 6},
            ]}).encode()
            req = urllib.request.Request(f"{MEM_API}/memories/batch", data=payload,
                                         headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=90):
                pass
        except Exception as e:
            print(f"⚠ mem learn failed: {e}")

    print(report)
    return 0

if __name__ == "__main__":
    sys.exit(main())

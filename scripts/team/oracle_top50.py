#!/usr/bin/env python3
"""🦉 Oracle Team — file the 50 most important + engaging curriculum features.

Ranks every curriculum skill through the Oracle's 7-layer lens (importance =
🧠 curriculum centrality × band; engagement = 🚀 growth/delight × band), dedupes
by game/scene, and files the result to the pipeline as GitHub issues:

  · 5 unbuilt scenes  → BUILD issues (priority: high, feature)
  · top 45 built      → ORACLE-VERIFY issues (priority: medium, polish)

Every issue carries Goal + Done-when acceptance criteria the Oracle standup can
gate. Idempotent: skips titles that already exist on the repo.

Run:  python3 scripts/team/oracle_top50.py [--create]
      (no --create = dry-run, prints the plan only)
"""
import re, sys, json, subprocess
from pathlib import Path
from collections import defaultdict

REPO = "numberverse-org/numberverse"
ROOT = Path(__file__).resolve().parents[2]
MILESTONE = "v31 — core curriculum wave"
CREATE = "--create" in sys.argv

# ── parse skills.ts ───────────────────────────────────────────────────────
src = (ROOT / "packages" / "core" / "src" / "skills.ts").read_text()
start = src.find("export const SKILLS")
end = src.find("export const", start + 16)
block = src[start:end]
skills = []
for it in re.finditer(r"\{\s*id:\s*'([^']+)'([^{}]*?)\}", block, re.S):
    body = it.group(2)
    def g(pat):
        m = re.search(pat, body)
        return m.group(1) if m else None
    skills.append({
        "id": it.group(1), "band": int(g(r"band:\s*(\d+)") or 0),
        "subject": g(r"subject:\s*'([^']+)'"),
        "title": g(r"title:\s*'([^']+)'"),
        "titleBn": g(r"titleBn:\s*'([^']+)'"),
        "game": g(r"game:\s*'([^']+)'"),
        "nctb": bool(g(r"nctbCode:\s*'([^']+)'")),
    })

# GAME_SCENES mapping + built scene classes
m = re.search(r"export const GAME_SCENES: Record<string, string> = \{(.*?)\n\};", src, re.S)
gs = dict(re.findall(r"'([^']+)'\s*:\s*'([^']+)'", m.group(1)))
built = set()
for f in list((ROOT / "apps" / "kid" / "src" / "game").glob("*.ts")) + \
         list((ROOT / "apps" / "kid" / "src" / "game").glob("*.tsx")):
    for mm in re.finditer(r"class (\w+Scene)\s+extends\s+Phaser\.Scene", f.read_text(errors="ignore")):
        built.add(mm.group(1))

# ── Oracle-lens rubric ────────────────────────────────────────────────────
SUBJ_I = {"math": 1.00, "bangla": 0.92, "english": 0.88, "science": 0.78, "bgs": 0.72, "ict": 0.68}
BAND_I = {1: 1.00, 2: 0.95, 3: 0.88, 4: 0.78, 5: 0.70, 6: 0.62, 7: 0.55}
SUBJ_E = {"science": 0.90, "bgs": 0.80, "math": 0.74, "bangla": 0.74, "english": 0.70, "ict": 0.64}
BAND_E = {1: 1.00, 2: 0.96, 3: 0.86, 4: 0.76, 5: 0.66, 6: 0.58, 7: 0.50}
FOUND = {"count-1-10", "count-1-20", "number-line", "quantity-match", "number-bonds-10",
         "number-bonds-20", "add-within-10", "sub-within-10", "add-within-20", "sub-within-20",
         "fruit-tree-add", "add-to-20", "count-to-50", "count-to-100", "count-to-999",
         "place-value-1000", "en-phonics", "en-abcs", "en-cvc", "en-cvc-build", "bn-swaroborno",
         "bn-benjonborno", "bn-lettersound", "bn-numbers", "bn-sightwords", "en-sightwords",
         "mult-facts-2-5-10", "mult-facts-2-10", "div-facts-fair-share"}
KW = ["animal", "rhyme", "song", "riddle", "story", "magic", "festival", "grow", "plant",
      "weather", "shadow", "magnet", "water", "food", "sink", "float", "money", "clock",
      "puzzle", "picture", "drag", "sort", "game", "draw", "coin", "taka", "nursery", "homes",
      "senses", "cycle", "symmetry", "mirror", "arrays", "phonics", "read", "spell", "letter",
      "color", "shape"]

def clamp(x):
    return min(1.0, max(0.0, x))

bygame = defaultdict(list)
for s in skills:
    bygame[s["game"]].append(s)

rows = []
for g, ss in bygame.items():
    rep = max(ss, key=lambda s: SUBJ_I.get(s["subject"], .7) * BAND_I.get(s["band"], .7))
    imp = SUBJ_I.get(rep["subject"], .7) * BAND_I.get(rep["band"], .7)
    if rep["nctb"]:
        imp += 0.05
    if rep["id"] in FOUND:
        imp += 0.08
    imp = clamp(imp)
    eng = SUBJ_E.get(rep["subject"], .7) * BAND_E.get(rep["band"], .7)
    if any(k in ((rep["title"] or "") + " " + rep["id"]).lower() for k in KW):
        eng += 0.10
    eng = clamp(eng)
    scene = gs.get(g, "")
    rows.append({"game": g, "scene": scene, "title": rep["title"], "titleBn": rep["titleBn"],
                 "subject": rep["subject"], "band": rep["band"], "imp": round(imp, 3),
                 "eng": round(eng, 3), "score": round(imp * eng, 3),
                 "built": (scene + "Scene") in built, "skill_ids": [s["id"] for s in ss]})

rows.sort(key=lambda r: -r["score"])
gaps = [r for r in rows if not r["built"]]
built_rows = [r for r in rows if r["built"]]

# ── the 50: 5 gaps (build) + top 45 built (verify/polish) ─────────────────
plan = []
for r in gaps:
    plan.append({"kind": "build", "priority": "high", "labels": ["feature", "kid-first"], **r})
for r in built_rows[:45]:
    plan.append({"kind": "verify", "priority": "medium", "labels": ["polish", "kid-first"], **r})
plan.sort(key=lambda p: (p["kind"] != "build", -p["score"]))

# ── bodies ────────────────────────────────────────────────────────────────
def build_body(r):
    sid = r["skill_ids"][0]
    return "\n".join([
        f"## Goal",
        f"Ship the missing **{r['title']}** scene (`{r['game']}` → `{r['scene']}Scene`), "
        f"a band-{r['band']} {r['subject']} game the curriculum already maps but no scene implements.",
        "",
        "## Done when",
        f"- [ ] New scene `apps/kid/src/game/{r['scene']}Scene.ts` extends `Phaser.Scene`",
        "- [ ] Registered in `engine.ts` scene array; `skills.ts` game mapping resolves",
        "- [ ] Tap/drag sort mechanic with immediate gentle feedback (no penalty on wrong tap)",
        f"- [ ] Speaks each item aloud in EN + BN (`speak()` + `getAppLang()`)",
        "- [ ] i18n clean — `audit.mjs` EN+BN pass, no tofu",
        f"- [ ] Reward/delight via existing store (`petFeed` / `novaChallengeReward`)",
        "- [ ] Oracle standup SHIP-OK (🧠 Oracle / 🛡️ Trust / 👁️ Visual layers hold)",
    ])

def verify_body(r, rank):
    return "\n".join([
        f"## Goal",
        f"Run the **{r['title']}** scene (`{r['game']}`) through the Oracle engagement pass. "
        f"It ranks **#{rank}** by importance×engagement (imp {r['imp']}, eng {r['eng']}) — "
        f"confirm it actually clears the bar for a band-{r['band']} {r['subject']} skill.",
        "",
        "## Done when",
        f"- [ ] 🧠 **Oracle** — band/subject/NCTB mapping correct for `{r['skill_ids'][0]}`",
        "- [ ] 🎨 **Content** — spoken EN+BN feedback on every state, no silent dead-ends",
        "- [ ] 🚀 **Growth** — a delight moment (Nova/pet reaction, celebration, or reward) fires",
        "- [ ] 👁️ **Visual** — contrast, palette, asset, and tofu checks pass",
        "- [ ] 🛡️ **Trust** — no unsafe words, no trackers, own-API only",
        "- [ ] Gap found → fix inline or file a follow-up, then re-run the standup to green",
    ])

specs = []
for i, r in enumerate(plan, 1):
    if r["kind"] == "build":
        title = f"Build: {r['title']} ({r['subject']}, {r['scene']}Scene)"
        body = build_body(r)
    else:
        title = f"Oracle verify: {r['title']} ({r['subject']}) — engagement & curriculum fidelity"
        body = verify_body(r, i)
    specs.append({"title": title, "body": body, "priority": r["priority"],
                  "labels": r["labels"], "milestone": MILESTONE})

# ── gh plumbing ───────────────────────────────────────────────────────────
def sh(args):
    return subprocess.run(args, capture_output=True, text=True)

def existing_titles():
    out = sh(["gh", "issue", "list", "--repo", REPO, "--state", "all", "--limit", "1000",
              "--json", "title"])
    try:
        return {t["title"] for t in json.loads(out.stdout)}
    except Exception:
        return set()

def ensure_milestone():
    out = sh(["gh", "api", f"repos/{REPO}/milestones", "--jq", ".[].title"])
    if MILESTONE in out.stdout.splitlines():
        return
    sh(["gh", "api", f"repos/{REPO}/milestones", "-f", f"title={MILESTONE}",
        "-f", "description=Top-50 core curriculum wave — 5 build + 45 Oracle verify/polish"])

def create(spec):
    args = ["gh", "issue", "create", "--repo", REPO, "--title", spec["title"],
            "--body", spec["body"], "--milestone", spec["milestone"],
            "--label", f"priority: {spec['priority']}", "--label", "status: backlog"]
    for l in spec["labels"]:
        args += ["--label", l]
    return sh(args)

def main():
    print(f"🦉 Oracle Top-50 · {len(specs)} issues ({sum(1 for s in specs if s['title'].startswith('Build'))} build, "
          f"{sum(1 for s in specs if s['title'].startswith('Oracle verify'))} verify/polish)")
    print(f"   milestone: {MILESTONE}")
    print()
    for i, s in enumerate(specs, 1):
        print(f"{i:>2} [{s['priority']:<6}] {s['title']}")

    if not CREATE:
        print("\n(dry run — re-run with --create to file the issues)")
        return 0

    ensure_milestone()
    ex = existing_titles()
    created, skipped, errors = [], [], []
    for i, s in enumerate(specs, 1):
        if s["title"] in ex:
            skipped.append(s["title"]); continue
        r = create(s)
        url = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else None
        if r.returncode == 0 and url:
            created.append((s["title"], url))
        else:
            errors.append((s["title"], (r.stderr or r.stdout).strip()[:120]))
        sys.stderr.write(f"\r{i}/{len(specs)}  created={len(created)} skipped={len(skipped)} errors={len(errors)}")
    sys.stderr.write("\n")
    print(f"TOTAL {len(specs)} | created {len(created)} | skipped {len(skipped)} | errors {len(errors)}")
    for t, e in errors:
        print(f"  ERROR {t}: {e}")
    return 0

if __name__ == "__main__":
    sys.exit(main())

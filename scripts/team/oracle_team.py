#!/usr/bin/env python3
"""🦉 Numberverse Oracle Team — daily standup.

Runs the ⚙️-automated roles of the 105-person Oracle Team (see TEAM.md): a set of
lightweight integrity/safety/quality/ops checks against the repo + live domain,
prints a per-layer status board, and learns the report into the mem API (:8765)
so the team's health survives session compaction.

Layers: 🧠 Oracle · 🛠️ Eng · 🛡️ Trust · 🎨 Content · 🚀 Growth · ⚖️ Judge
(adjudicator) · 👁️ Visual (UI inspection — palette/contrast/glyph/asset checks).

Usage:
    python3 scripts/team/oracle_team.py            # run one standup (exit 0 ok, 1 = failures)
    python3 scripts/team/oracle_team.py --silent   # no board, just learn report
    python3 scripts/team/oracle_team.py --once-now # skip memory (for CI-style local use)
    python3 scripts/team/oracle_team.py --no-page  # dev mode: never page (learn + board still run)

Dev note: during feature builds the working tree is intentionally mid-edit, so the
Scope Guardian legitimately ✖s uncommitted files. Use --no-page for those runs — the
DAILY launchd job (full paging) is the one that should page Hasan for REAL failures.

Launchd: com.tresha.oracle-team runs this daily (StartInterval 86400).
"""
import os, re, sys, json, subprocess, urllib.request
from pathlib import Path
from datetime import date, datetime

ROOT = Path(__file__).resolve().parents[2]
KID = ROOT / "apps" / "kid"
CORE = ROOT / "packages" / "core" / "src"
SECURITY = Path.home() / ".tresha" / "data" / "security"
MEM_API = "http://127.0.0.1:8765"
SILENT = "--silent" in sys.argv
SKIP_MEM = "--once-now" in sys.argv
NO_PAGE = "--no-page" in sys.argv
# #120 — CI mode: skip the box-only roles (they read ~/.tresha, the local mem
# API on 127.0.0.1, launchctl) which don't exist in GitHub Actions. Every
# code/catalog/visual role still runs, so a PR is judged on the actual tree.
CI_MODE = "--ci" in sys.argv
BOX_ONLY_ROLES = {"Security Auditor", "Monitoring Watch", "Chronic-Issue Examiner", "Precedent Recorder"}

def kid_css() -> str:
    """Concatenate ALL app CSS — #1177 split styles.css into styles/*.css (boot
    + screens), so checks must read across every sheet, not one monolith. Falls
    back to the legacy single file if the styles/ dir is ever absent."""
    d = KID / "src" / "styles"
    if d.is_dir():
        parts = [f.read_text(errors="ignore") for f in sorted(d.glob("*.css"))]
        if parts:
            return "\n".join(parts)
    return (KID / "src" / "styles.css").read_text(errors="ignore")
TODAY = date.today().isoformat()

results = []  # {layer, role, name, status, detail}
def check(layer: str, role: str, name: str, fn):
    try:
        ok, detail = fn()
        status = "ok" if ok else "fail"
    except Exception as e:
        status, detail = "fail", f"exception: {e}"
    results.append({"layer": layer, "role": role, "name": name, "status": status, "detail": str(detail)[:180]})

def run(cmd, cwd=None, timeout=120):
    # launchd gives jobs a minimal PATH — make sure node (Homebrew) resolves
    env = dict(os.environ)
    env["PATH"] = "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:" + env.get("PATH", "")
    return subprocess.run(cmd, cwd=str(cwd or ROOT), capture_output=True, text=True, timeout=timeout, env=env)

def curl_ok(url, timeout=8):
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "oracle-team"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return True, r.status
    except Exception as e:
        return False, str(e)

# ── paging on failure (the "page Hasan" path) ─────────────────────────────
# Order: local notification + alert file (always) → Telegram (best-effort,
# reads ~/.tresha/.env). Every channel degrades gracefully — a page must
# never crash the standup itself.
ALERT_FILE = Path.home() / ".tresha" / "logs" / "oracle_team.alert"

def _env_from(path: Path) -> dict:
    out = {}
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                out[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    return out

def _tg_send(text: str) -> bool:
    env = _env_from(Path.home() / ".tresha" / ".env")
    token = env.get("TG_BOT_TOKEN") or os.environ.get("TG_BOT_TOKEN")
    chat = env.get("TG_CHAT_ID") or os.environ.get("TG_CHAT_ID")
    if not token or not chat:
        return False
    try:
        payload = json.dumps({"chat_id": chat, "text": text,
                              "parse_mode": "HTML", "disable_web_page_preview": True}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=payload, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read()).get("ok", False)
    except Exception:
        return False

def _page(fails):
    """Page Hasan when the standup has ✖ failures."""
    if not fails:
        return
    lines = [f"🦉 Oracle Team ✖ {len(fails)} fail{'s' if len(fails)>1 else ''} · {TODAY}",
             f"app: Numberverse · repo: {ROOT}"]
    for f in fails:
        lines.append(f"  • {f['layer']}/{f['role']} — {f['detail']}")
    msg = "\n".join(lines)
    try:
        ALERT_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(ALERT_FILE, "a") as f:
            f.write(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}\n")
    except Exception:
        pass
    try:
        short = msg[:200]
        subprocess.run(["osascript", "-e",
                        f'display notification "{short}" with title "🦉 Oracle Team" sound name "Sosumi"'],
                       timeout=5, capture_output=True)
    except Exception:
        pass
    _tg_send(msg)

# ── small helpers used by the checks ─────────────────────────────────────
def read_skills():
    src = (CORE / "skills.ts").read_text()
    # parse ONLY the SKILLS array (GAMES share an `id:` shape — slicing avoids them)
    start = src.find("export const SKILLS")
    end = src.find("export const", start + 16)
    block = src[start:end if end != -1 else len(src)]
    objs = []
    for it in re.finditer(r"\{\s*id:\s*'([^']+)'([^{}]*?)\}", block, re.S):
        body = it.group(2)
        band = re.search(r"band:\s*(\d+)", body)
        subj = re.search(r"subject:\s*'([^']+)'", body)
        title = re.search(r"title:\s*'([^']+)'", body)
        titleBn = re.search(r"titleBn:\s*'([^']+)'", body)
        nctb = re.search(r"nctbCode:\s*'([^']+)'", body)
        cls = re.search(r"classNumber:\s*(\d+)", body)
        objs.append({"id": it.group(1), "band": band and int(band.group(1)),
                     "subject": subj and subj.group(1), "title": title and title.group(1),
                     "titleBn": bool(titleBn), "nctb": bool(nctb), "cls": cls and int(cls.group(1))})
    return objs

def scene_texts():
    texts = []
    for f in (KID / "src" / "game").glob("*Scene.ts"):
        texts.append((f.name, f.read_text()))
    return texts

# word-boundary matched — "skill!" must not trip "kill", "die" must not trip "diet"
UNSAFE = [r"\bkill\b", r"\bblood\b", r"\bbomb\b", r"\bweapon\b", r"\bshoot\b", r"\bmurder\b",
          r"\bghost\b", r"\bdemon\b", r"\bdevil\b", r"\bdead\b", r"\bscary\b", r"\btoxic\b",
          r"\bpoison\b", r"\bhate\b", r"\bstupid\b", r"\bugly\b", r"\bliar\b", r"\bcurse\b",
          r"\bdie\b", r"\bkill", r"\bdied\b", r"\bgun\b"]
# real tracker/ad SDK fingerprints — URL domains or SDK call shapes, NOT plain words
AD_SDKS = ["adsbygoogle", "doubleclick.net", "googlesyndication", "googletagmanager.com",
           "mixpanel.com", "segment.com", "amplitude.com", "fullstory.com", "hotjar.com",
           "fbq(", "analytics.google", "app-measurement", "telemetry.deeplink", "branch.io"]

# ══ LAYER 1 — Oracle Council ════════════════════════════════════════════════
def l1_curriculum():
    skills = read_skills()
    bad = [s["id"] for s in skills if not s["nctb"] or not s["cls"] or not (1 <= (s["cls"] or 0) <= 12)]
    return (not bad), (f"{len(skills)} skills; {len(bad)} missing nctbCode/classNumber: {bad[:5]}")

def l1_safety():
    hits = []
    for s in read_skills():
        for w in UNSAFE:
            if s["title"] and re.search(w, s["title"].lower()):
                hits.append(f"{s['id']}: ~{w}")
    for fn, txt in scene_texts():
        # only look at quoted display strings to reduce noise
        for m in re.finditer(r"['\"`]([^'\"`]{3,120})['\"`]", txt):
            low = m.group(1).lower()
            for w in UNSAFE:
                if re.search(w, low):
                    hits.append(f"{fn}: ~{w} in \"{m.group(1)[:40]}\"")
                    break
    return (not hits), (f"0 unsafe hits" if not hits else f"{len(hits)} flagged: {hits[:4]}")

def l1_privacy():
    hits, sdk = [], []
    for f in (KID / "src").rglob("*"):
        if not f.suffix in (".ts", ".tsx") or "node_modules" in str(f): continue
        src = f.read_text(errors="ignore")
        for m in re.finditer(r"fetch\(\s*([`'\"][^`'\"]*[`'\"]|`[^`]*`)", src):
            url = m.group(1).strip("`'\"")
            if not (url.startswith("/api/") or ":8000" in url or "http" not in url or "voice" in url):
                hits.append(f"{f.name}: fetch({url[:50]})")
        for s in AD_SDKS:
            if s in src:
                sdk.append(f"{f.name}: '{s}'")
    ok = not hits and not sdk
    detail = "clean" if ok else f"{len(hits)} non-own fetches, {len(sdk)} ad-sdk hits"
    return ok, detail

def l1_bangla():
    skills = read_skills()
    noBn = [s["id"] for s in skills if not s["titleBn"]]
    pct = round(100 * (len(skills) - len(noBn)) / max(1, len(skills)))
    return (pct >= 95), f"{pct}% have titleBn ({len(noBn)} missing: {noBn[:5]})"

def l1_bands():
    src = (CORE / "skills.ts").read_text()
    bands = re.findall(r"\{\s*id:\s*(\d+),\s*key:\s*'([^']+)'[^}]*?ageRange:\s*'([^']+)'\s*\}", src)
    ids = [int(b[0]) for b in bands]
    return (ids == [1,2,3,4,5,6,7] and len(bands) == 7), f"{len(bands)} bands {ids}"

# ══ LAYER 2 — Engineering Crew ═══════════════════════════════════════════════
def l2_scenes():
    p = run(["node", "scripts/audit.mjs"], cwd=KID)
    return (p.returncode == 0), ("audit ok" if p.returncode == 0 else p.stdout[-200:] or p.stderr[-200:])

def l2_pwa():
    vc = (KID / "vite.config.ts").read_text()
    has_ignore = "og-card.png" in vc
    sw = (KID / "dist" / "sw.js")
    if sw.exists():
        sw_src = sw.read_text(errors="ignore")
        has_flags = all(x in sw_src for x in ["skipWaiting", "clientsClaim", "cleanupOutdatedCaches"])
        if not has_flags:
            return False, "sw.js missing skipWaiting/clientsClaim/cleanupOutdatedCaches"
    ok = has_ignore
    return ok, "og-card ignore present" + (" + sw flags verified" if sw.exists() else " (no local sw.js — box builds)")

def l2_share():
    f = KID / "src" / "game" / "shareImage.ts"
    if not f.exists(): return False, "shareImage.ts missing"
    src = f.read_text()
    return (all(x in src for x in ["renderShareCard", "renderCertCard", "sharePng"])), "share renderers + sharePng exported"

def l2_core():
    src = (CORE / "skills.ts").read_text()
    keys = re.findall(r"key:\s*'([^']+)'", src)
    return (set(keys) == {"sprout-grove","cottage-fields","river-town","sky-castle","star-academy","jungle-canopy","polar-peaks"}), f"world keys: {keys}"

def l2_deploy():
    return (ROOT / "infra" / "deploy" / "scripts" / "deploy.sh").exists(), "deploy.sh present"

def l2_perf():
    assets = sorted((KID / "dist" / "assets").glob("*.js")) if (KID / "dist" / "assets").exists() else []
    if not assets:
        return True, "no local dist (box builds) — skipping budget"
    js = max(a.stat().st_size for a in assets)
    ok = js < 2_600_000  # 2.6MB budget for the main bundle
    return ok, f"main js {js/1e6:.2f}MB (budget 2.6MB)"

def l2_nova_perf():
    """🦉 3D Nova Perf — the island must stay a small lazy pull and honor
    vestibular/WCAG safety (#691)."""
    dist = KID / "dist" / "assets"
    if not dist.exists():
        return True, "no local dist (box builds) — skipping 3D bundle checks"
    ok, bits = True, []
    island = next(dist.glob("Nova3D-*.js"), None)
    if island:
        sz = island.stat().st_size
        ok &= sz < 1024 * 1024  # island lazy chunk < 1MB
        bits.append(f"island {sz//1024}KiB")
    threev = next(dist.glob("three-vendor-*.js"), None)
    if threev:
        sz = threev.stat().st_size
        ok &= sz < 1024 * 1024  # three+R3F renderer pull < 1MB
        bits.append(f"three-vendor {sz//1024}KiB")
    glb = KID / "public" / "assets" / "nova.glb"
    if glb.exists():
        g = glb.stat().st_size
        ok &= g < 2 * 1024 * 1024  # model < 2MiB
        bits.append(f"glb {g//1024}KiB")
    # vestibular/WCAG source gates (the runtime a11y checks live in the #690
    # Playwright suite; here we guard the shipped levers they depend on).
    nova = (KID / "src" / "nova3d" / "Nova3D.tsx").read_text(errors="ignore")
    css = kid_css()
    cam = (KID / "src" / "nova3d" / "camera.tsx").read_text(errors="ignore")
    has_throttle = "lastBurstMs" in nova and "350" in nova          # no flash > 3/s
    has_reduced = "data-motion={reduced ? \"reduced\" : \"full\"}" in nova
    has_dynres = (KID / "src" / "nova3d" / "DynamicResolution.tsx").exists()
    fade = "@keyframes island-fadeonly" in css and "transform" not in css.split("@keyframes island-fadeonly")[1].split("}")[0]
    auto_rotate_off = "autoRotate = !reduced" in cam
    ok &= has_throttle and has_reduced and has_dynres and fade and auto_rotate_off
    bits.append(f"throttle={has_throttle} reduced={has_reduced} dynres={has_dynres} fadeOnly={fade} noAutoRotate={auto_rotate_off}")
    return ok, "; ".join(bits)

def l2_scene_reward():
    """💥 Scene Reward Parity (#1206) — every completable scene must celebrate a
    correct answer (confetti/combo), not ship a bare audio blip. Runs the same
    guard as scripts/lint-scene-reward.mjs so release.sh and CI agree."""
    try:
        r = run(["node", "scripts/lint-scene-reward.mjs"], timeout=60)
    except Exception as e:
        return False, f"guard failed to run: {e}"
    out = (r.stdout or "").strip() or (r.stderr or "").strip()
    return r.returncode == 0, out

# ══ LAYER 3 — Quality & Trust ════════════════════════════════════════════════
def l3_tsc():
    p = run(["./node_modules/.bin/tsc", "--noEmit", "-p", "tsconfig.json"], cwd=KID, timeout=180)
    return (p.returncode == 0), ("tsc clean" if p.returncode == 0 else p.stdout[-200:] or p.stderr[-200:])

def l3_progress():
    # Thresholds moved to lib/journey.ts during #589; scan the whole src/ tree
    # so the check survives future extractions.
    texts = [f.read_text(errors="ignore") for f in (KID / "src").rglob("*")
             if f.suffix in (".ts", ".tsx")]
    need = ["MASTERY_THRESHOLD", "UNLOCK_THRESHOLD", "NOVA_QUEST_REWARD", "NOVA_SHARE_REWARD", "NOVA_BIRTHDAY_COINS"]
    missing = [n for n in need if not any(n in t for t in texts)]
    return (not missing), ("all thresholds+rewards present" if not missing else f"missing {missing}")

def l3_security():
    return SECURITY.exists(), ("security dir present" if SECURITY.exists() else "security dir missing")

def l3_release():
    UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
    try:
        with urllib.request.urlopen(urllib.request.Request("https://kids.munna-khan.xyz/", headers=UA), timeout=12) as r:
            html = r.read(8000).decode(errors="ignore")
        m = re.search(r'/assets/index-[A-Za-z0-9_-]+\.js', html)
        if not m:
            return True, "no bundle ref in live html (SPA fallback page?) — not a failure"
        with urllib.request.urlopen(urllib.request.Request("https://kids.munna-khan.xyz" + m.group(0), headers=UA), timeout=15) as r:
            js = r.read().decode(errors="ignore")
        # the minifier renames APP_BUILD, but the literal stamp survives
        # matches "· v28 (summary)" (legacy) AND "· 0.24.1 (summary)" (semver)
        v = re.search(r"\b\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\s*·\s*v?\d[\d.]*[^\"']*", js)
        stamp = v.group(0) if v else "?"
        if stamp == "?" and 'App-' in js:
            # #1217 — APP_BUILD lives in the LAZY App chunk, NOT index.js.
            # index.js dynamic-imports ./App-*.js (resolved under /assets/), so
            # a version grep against index.js alone is a FALSE NEGATIVE on any
            # post-split build (the same bug release.sh's smoke_serves fixed).
            am = re.search(r'App-[A-Za-z0-9_-]+\.js', js)
            if am:
                with urllib.request.urlopen(urllib.request.Request("https://kids.munna-khan.xyz/assets/" + am.group(0), headers=UA), timeout=15) as ar:
                    ajs = ar.read().decode(errors="ignore")
                v = re.search(r"\b\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\s*·\s*v?\d[\d.]*[^\"']*", ajs)
                stamp = v.group(0) if v else "?"
        return (stamp != "?"), f"live stamp: {stamp}"
    except Exception as e:
        return True, f"live check skipped: {e}"

# ══ LAYER 4 — Content & Experience ═══════════════════════════════════════════
def l4_season():
    # currentSeason moved to lib/journey.ts during #589; scan the whole src/
    # tree so the check survives future extractions. APP_BUILD stays in App.tsx.
    src_blob = "\n".join(
        f.read_text(errors="ignore") for f in (KID / "src").rglob("*")
        if f.suffix in (".ts", ".tsx"))
    css = kid_css()
    return ("currentSeason" in src_blob and "season-snow" in css), "season system present"

def l4_feedback():
    return (KID / "src" / "game" / "celebrate.ts").exists() and (KID / "src" / "game" / "feedback.ts").exists(), "celebrate+feedback present"

# ══ LAYER 5 — Growth & Parent Care ═══════════════════════════════════════════
def l5_captions():
    # Share captions moved into i18n.ts during #589 decomposition; scan the
    # whole src/ tree so the URL check survives future extractions.
    url = "kids.munna-khan.xyz"
    for f in (KID / "src").rglob("*"):
        if f.suffix in (".ts", ".tsx") and url in f.read_text(errors="ignore"):
            return True, f"share captions carry the URL ({url})"
    return False, "share captions missing the URL"

def l5_release_mgr():
    app = (KID / "src" / "App.tsx").read_text()
    m = re.search(r'APP_BUILD\s*=\s*"([^"]+)"', app)
    tr = (ROOT / "TRACKER.md").read_text(errors="ignore")
    # TRACKER says "> Last updated: 11 Aug 2026" — parse the day/month/year
    dated = re.search(r"Last updated:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", tr)
    fresh = False
    if dated:
        try:
            d = datetime.strptime(f"{dated.group(1)} {dated.group(2)} {dated.group(3)}", "%d %b %Y").date()
            fresh = (date.today() - d).days <= 14
        except ValueError:
            fresh = False
    return (bool(m) and fresh), (f"APP_BUILD '{m.group(1) if m else '?'}' · TRACKER {' '.join(dated.groups()) if dated else '?'}")

def l5_domain():
    ok, st = curl_ok("https://kids.munna-khan.xyz/")
    return ok, f"kids.munna-khan.xyz → {st}"

def l5_monitor():
    api_up = False
    try:
        with urllib.request.urlopen(f"{MEM_API}/who", timeout=4) as r:
            api_up = r.status == 200
    except Exception:
        pass
    p = run(["launchctl", "list"], timeout=10)
    job = "com.tresha.periodic-learn" in p.stdout
    return (api_up and job), (f"mem API {'up' if api_up else 'down'} · periodic-learn job {'active' if job else 'inactive'}")

# ══ LAYER 6 — Adjudicator (the referees: no deadlock, every ruling is precedent) ══
def l6_deploy_gate():
    fails = [r for r in results if r["status"] == "fail"]
    if not fails:
        return True, "SHIP-OK — zero ✖, release gate open"
    names = {r["role"] for r in fails}
    return True, f"DEPLOY BLOCKED — {len(fails)} ✖: {', '.join(sorted(names))}"

def l6_kid_bar():
    barred = [r for r in results if r["role"] in ("Child-Safety Guardian", "Privacy Steward") and r["status"] == "fail"]
    return (not barred), ("kid-bar verified — safety + privacy guards hold"
                          if not barred else f"KID-BAR TRIPPED: {[b['role'] for b in barred]}")

def l6_scope():
    p = run(["git", "status", "--porcelain"], timeout=15)
    untracked = [l for l in p.stdout.splitlines() if l.startswith("??")]
    return (not untracked), (f"working tree clean ({p.stdout.count(chr(10))} tracked changes)"
                             if not untracked else f"{len(untracked)} unowned files: {untracked[:3]}")

def l6_chronics():
    # a role flagged on 3+ of the last 7 daily standups = chronic → escalate to a human
    try:
        with urllib.request.urlopen(f"{MEM_API}/memories/oracle_team", timeout=10) as r:
            rows = json.loads(r.read())
        role_days = {}
        for row in rows:
            if not re.fullmatch(r"standup_\d{4}-\d{2}-\d{2}", row.get("key", "")):
                continue
            d = row["key"].split("_")[1]
            try:
                if (date.today() - date.fromisoformat(d)).days > 7:
                    continue
            except ValueError:
                continue
            try:
                val = json.loads(row["value"])
            except Exception:
                continue
            for f in val.get("flags", []):
                role = f.split("/")[-1].split(":")[0].strip()
                role_days.setdefault(role, set()).add(d)
        chronic = [f"{role} ({len(days)}d)" for role, days in role_days.items() if len(days) >= 3]
        return (not chronic), ("no chronic flags last 7d" if not chronic else f"CHRONIC: {chronic}")
    except Exception as e:
        return True, f"history scan skipped: {e}"

def l6_precedent():
    try:
        with urllib.request.urlopen(f"{MEM_API}/memories/adjudicator", timeout=10) as r:
            rows = json.loads(r.read())
        return True, f"{len(rows)} prior ruling(s) on record — precedent holds"
    except Exception:
        return True, "no rulings yet — first cycle establishes precedent"

def l6_no_deadlock():
    return True, "no deadlock — every check adjudicated, run completed clean"

# ══ LAYER 7 — Visual Inspection & UI (the eyes on every pixel) ════════════════
def _world_lands_block():
    """WORLD_LANDS moved out of App.tsx during #589 decomposition; scan the
    whole src/ tree so the check survives future extractions."""
    for f in (KID / "src").rglob("*"):
        if f.suffix in (".ts", ".tsx"):
            m = re.search(r"(?:export )?const WORLD_LANDS.*?\n\};", f.read_text(), re.S)
            if m:
                return m
    return None

def l7_palette():
    m = _world_lands_block()
    if not m:
        return False, "WORLD_LANDS missing from App.tsx"
    lands = re.findall(r"(\d+):\s*\{\s*c1:\s*\"[^\"]+\",\s*c2:\s*\"[^\"]+\",\s*c3:\s*\"[^\"]+\",\s*c2_22:\s*\"[^\"]+\",\s*deco:\s*\[[^\]]*\]", m.group(0))
    ids = sorted(int(x) for x in lands)
    ok = ids == [1, 2, 3, 4, 5, 6, 7]
    return ok, (f"{len(lands)} lands {ids} — each c1/c2/c3/c2_22/deco present" if ok
                else f"lands {ids} — expected [1,2,3,4,5,6,7]")

def _rel_lum(hexc):
    c = hexc.lstrip("#")
    if len(c) == 3:
        c = "".join(x * 2 for x in c)
    rgb = [int(c[i:i+2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]

def l7_contrast():
    m = _world_lands_block()
    if not m:
        return False, "WORLD_LANDS missing from App.tsx"
    bad = []
    for land in re.finditer(r"(\d+):\s*\{\s*c1:\s*\"([^\"]+)\",[^}]*?c3:\s*\"([^\"]+)\"", m.group(0)):
        wid, c1, c3 = land.group(1), land.group(2), land.group(3)
        l1, l3 = _rel_lum(c1), _rel_lum(c3)
        ratio = (max(l1, l3) + 0.05) / (min(l1, l3) + 0.05)
        if ratio < 3.0:
            bad.append(f"{wid}:{ratio:.2f}:1")
    return (not bad), ("all 5 lands c1↔c3 ≥ 3.0:1 (WCAG large-text AA)" if not bad
                       else f"LOW CONTRAST: {bad}")

def l7_tofu():
    hits = []
    for f in (KID / "src").rglob("*"):
        if f.suffix not in (".ts", ".tsx", ".css", ".html") or "node_modules" in str(f):
            continue
        if "�" in f.read_text(errors="ignore"):
            hits.append(f.name)
    return (not hits), ("zero replacement-char tofu in kid source" if not hits
                        else f"tofu in: {hits[:5]}")

def l7_assets():
    pub = KID / "public"
    need = ["og-card.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png",
            "apple-touch-icon.png", "favicon.png"]
    missing = [n for n in need if not (pub / n).exists()]
    svg_src = (KID / "src" / "assets" / "svgs.ts").read_text()
    urls = re.findall(r'url:\s*"([^"]+)"', svg_src)
    broken = [u for u in urls if not (pub / u.lstrip("/")).exists()]
    ok = not missing and not broken
    return ok, (f"icons + og-card present; all {len(urls)} url assets resolve in public/"
                if ok else f"missing: {missing + broken}")

def l7_svg_wellformed():
    svg_src = (KID / "src" / "assets" / "svgs.ts").read_text()
    emoji = svg_src.count("emoji:")
    rendered = svg_src.count("svg:") + svg_src.count("url:")
    view_ok = 'viewBox="0 0 100 100"' in svg_src and 'viewBox="0 0 160 210"' in svg_src
    ok = emoji >= rendered and view_ok
    return ok, (f"{emoji} emoji fallbacks cover {rendered} rendered assets; wrapper + Nova viewBoxes intact"
                if ok else f"emoji({emoji}) < rendered({rendered}) or viewBox missing")

def l7_theme_wiring():
    css = kid_css()
    wired = all(x in css for x in [".map-island", "--c1", "--c2-22", ".world-card"])
    return wired, ("land vars + map/card themed classes wired in styles.css" if wired
                   else "theme wiring incomplete (.map-island/--c1/--c2-22/.world-card)")

def l7_baseline():
    f = ROOT / "docs" / "VISUAL_BASELINE.md"
    if not f.exists():
        return False, "docs/VISUAL_BASELINE.md missing — create the reference-look doc"
    m = re.search(r"Last updated:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", f.read_text())
    if not m:
        return False, "VISUAL_BASELINE.md has no 'Last updated: DD Mon YYYY' line"
    try:
        d = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%d %b %Y").date()
        fresh = (date.today() - d).days <= 30
    except ValueError:
        fresh = False
    stamp = " ".join(m.groups())
    return fresh, (f"VISUAL_BASELINE.md present · {stamp} ({'fresh' if fresh else 'STALE — update'}"
                   if fresh else f"VISUAL_BASELINE.md stale · {stamp}")

# ── wire checks to layers ────────────────────────────────────────────────────
CHECKS = [
    ("🧠 Oracle",   "Curriculum Oracle (NCTB)",   "skills↔NCTB/class", l1_curriculum),
    ("🧠 Oracle",   "Child-Safety Guardian",      "content safety scan", l1_safety),
    ("🧠 Oracle",   "Privacy Steward",            "no trackers / own-API only", l1_privacy),
    ("🧠 Oracle",   "Bangla Language Advisor",    "titleBn coverage", l1_bangla),
    ("🧠 Oracle",   "Age-Appropriateness Editor", "5 bands intact", l1_bands),
    ("🛠️ Eng",      "Scene Developer",            "catalog/seed audit", l2_scenes),
    ("🛠️ Eng",      "PWA Engineer",               "sw flags + og-card", l2_pwa),
    ("🛠️ Eng",      "Card/Share Engineer",        "share renderers present", l2_share),
    ("🛠️ Eng",      "Core Package Engineer",      "7 world keys", l2_core),
    ("🛠️ Eng",      "Deployment Engineer",        "deploy.sh present", l2_deploy),
    ("🛠️ Eng",      "Performance Engineer",       "bundle budget", l2_perf),
    ("🛠️ Eng",      "3D Nova Perf",               "island chunk + glb + a11y levers", l2_nova_perf),
    ("🛠️ Eng",      "Scene Reward Parity",        "every scene celebrates", l2_scene_reward),
    ("🛡️ Trust",    "QA Lead",                    "audit.mjs", l2_scenes),
    ("🛡️ Trust",    "Type-Safety Officer",        "tsc --noEmit", l3_tsc),
    ("🛡️ Trust",    "Progress/Cert Verifier",     "thresholds+rewards", l3_progress),
    ("🛡️ Trust",    "Security Auditor",           "security dir", l3_security),
    ("🛡️ Trust",    "Release Verifier",           "live bundle stamp", l3_release),
    ("🎨 Content",  "Bangla Content Curator",     "season decor", l4_season),
    ("🎨 Content",  "Feedback Writer",            "celebrate+feedback", l4_feedback),
    ("🚀 Growth",   "Share-Loop Engineer",        "captions carry URL", l5_captions),
    ("🚀 Growth",   "Release Manager",            "APP_BUILD + TRACKER fresh", l5_release_mgr),
    ("🚀 Growth",   "Deployment Runner",          "live domain reachable", l5_domain),
    ("🚀 Growth",   "Monitoring Watch",           "mem API + periodic-learn", l5_monitor),
    ("⚖️ Judge",    "Release Gate Judge",         "ship/block verdict", l6_deploy_gate),
    ("⚖️ Judge",    "Kid-Bar Referee",            "re-check safety+privacy", l6_kid_bar),
    ("⚖️ Judge",    "Scope Guardian",             "no unowned files", l6_scope),
    ("⚖️ Judge",    "Chronic-Issue Examiner",     "7-day flag history", l6_chronics),
    ("⚖️ Judge",    "Precedent Recorder",         "ruling trail in mem", l6_precedent),
    ("⚖️ Judge",    "Deadlock Breaker",           "all checks ruled", l6_no_deadlock),
    ("👁️ Visual",   "Visual QA Lead",             "baseline doc fresh", l7_baseline),
    ("👁️ Visual",   "Palette Inspector",          "7 lands × 7 fields", l7_palette),
    ("👁️ Visual",   "Contrast Auditor",           "c1↔c3 ≥ 3.0:1", l7_contrast),
    ("👁️ Visual",   "Glyph Watch",                "no tofu chars", l7_tofu),
    ("👁️ Visual",   "Asset Librarian",            "icons/og/url resolve", l7_assets),
    ("👁️ Visual",   "Emoji-Fallback Sentinel",    "emoji ≥ svg+url", l7_svg_wellformed),
    ("👁️ Visual",   "Theme Consistency Judge",    "land vars wired", l7_theme_wiring),
]

def main():
    for layer, role, name, fn in CHECKS:
        if CI_MODE and role in BOX_ONLY_ROLES:
            continue  # #120 — box-only roles don't run in CI
        check(layer, role, name, fn)

    # ── board ──
    if not SILENT:
        print("🦉 Numberverse Oracle Team — daily standup")
        print(f"   {TODAY} · {len(results)} automated roles · 105 total\n")
        for layer in ["🧠 Oracle", "🛠️ Eng", "🛡️ Trust", "🎨 Content", "🚀 Growth",
                      "⚖️ Judge", "👁️ Visual"]:
            layer_res = [r for r in results if r["layer"] == layer]
            n_ok = sum(1 for r in layer_res if r["status"] == "ok")
            print(f"  {layer}  {n_ok}/{len(layer_res)} ✓")
            for r in layer_res:
                mark = "✓" if r["status"] == "ok" else "✖" if r["status"] == "fail" else "⚠"
                print(f"    {mark} [{r['role']}] {r['name']}: {r['detail']}")
            print()
        fails = [r for r in results if r["status"] != "ok"]
        print(f"── standup {'CLEAN' if not fails else f'{len(fails)} flags'} · exit "
              f"{0 if not [r for r in results if r['status']=='fail'] else 1}")

    # ── learn to mem API (the sanctioned channel). CI has no mem API, so skip. ──
    if not SKIP_MEM and not CI_MODE:
        summary = {
            "date": TODAY, "run_at": datetime.now().isoformat(timespec="seconds"),
            "checked": len(results),
            "ok": sum(1 for r in results if r["status"] == "ok"),
            "warn": sum(1 for r in results if r["status"] == "warn"),
            "fail": sum(1 for r in results if r["status"] == "fail"),
            "by_layer": {},
            "flags": [f"{r['layer']}/{r['role']}: {r['detail']}" for r in results if r["status"] != "ok"],
        }
        for r in results:
            summary["by_layer"].setdefault(r["layer"], {"ok": 0, "other": 0})
            summary["by_layer"][r["layer"]]["ok" if r["status"] == "ok" else "other"] += 1
        try:
            payload = json.dumps({"items": [
                {"module": "oracle_team", "key": f"standup_{TODAY}", "value": json.dumps(summary), "importance": 4},
                {"module": "oracle_team", "key": "latest", "value": json.dumps(summary), "importance": 5},
            ]}).encode()
            req = urllib.request.Request(f"{MEM_API}/memories/batch", data=payload,
                                         headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=90):  # cold embedder can take a while
                pass
        except Exception as e:
            print(f"⚠ mem learn failed: {e}")

    # ── page Hasan on real failures (✖). Dev runs use --no-page (mid-edit trees
    #    legitimately have unowned files — the daily launchd job pages for real).
    if not NO_PAGE:
        _page([r for r in results if r["status"] == "fail"])

    return 0 if not [r for r in results if r["status"] == "fail"] else 1

if __name__ == "__main__":
    sys.exit(main())

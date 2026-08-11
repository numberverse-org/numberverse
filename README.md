# 🦉 Numberverse

**Kids learn math & Bangla — offline, no ads.** A playful learning world for ages 2–13,
built by a parent for their own kids. PWA-first distribution (no Play Store), fully
offline, zero tracking, zero ads — privacy is the moat.

> Live demo: **https://kids.munna-khan.xyz** (installable PWA)

## What it is
- 🎮 **35+ Phaser 2D games** across 43 skills (counting, addition, subtraction, shapes,
  multiplication, fractions, time, Bangla letters/words, English phonics/CVC…)
- 🗺️ **Visual world map** — 5 themed lands on a winding road (Sprout Grove → Star Academy),
  each with a journey tab, per-land palette, and a "you're here" marker
- 🧠 **Adaptive (BKT-lite)** — each kid gets the right difficulty, on-device
- 🎙️ **On-device neural Bangla voice** (Piper VITS, int8) — speaks offline, no network
- 🔒 **Parent panel** — progress, voice config, playtime caps; everything local-first
- 📤 **Share loop** — weekly-progress PNG cards + certificates → WhatsApp (+5 coin reward)

## Product principles (non-negotiable)
1. **Zero ads, forever** — kids are never trained to click ads.
2. **Zero tracking** — data stays on the device.
3. **Offline-first** — install it once, works with no internet.
4. **Fun before lesson** — it's a game first, a lesson second.

## Repo layout (pnpm monorepo)
```
apps/kid      → Vite + React + Phaser PWA  (the app, served at /)
apps/api      → FastAPI + Postgres  (progress sync; local-first fallback)
apps/parent   → Next.js static portal (/parent/)
apps/admin    → react-admin console (/admin/)
packages/core → shared domain: BANDS, SKILLS, adaptive engine, game configs
infra/deploy  → Docker build for the demo box + Cloudflare tunnel
scripts/team  → Oracle Team: daily standup + weekly council (see TEAM.md)
```

## The Oracle Team (TEAM.md)
Numberverse is run by a **75-role continuous team** (5 layers × 15): 🧠 Oracle Council,
🛠️ Engineering Crew, 🛡️ Quality & Trust, 🎨 Content & Experience, 🚀 Growth & Parent Care.
Every day `scripts/team/oracle_team.py` runs 22 automated role-checks and learns the report
to the memory API; every week `oracle_council.py` turns the standups into a strategy brief.
Any ✖ failure pages the owner. See **[TEAM.md](TEAM.md)**.

## Develop
```bash
pnpm install
pnpm dev:kid          # kid app (Vite, :5173)
pnpm dev:api          # FastAPI (:8000)
pnpm build            # build all
```

## Deploy
Heavy builds run on the demo box, never on the dev Mac:
```bash
bash infra/deploy/scripts/deploy.sh    # rsync → docker compose build on box → live
```
Live: `https://kids.munna-khan.xyz` (Cloudflare named tunnel) · LAN: `http://192.168.0.104:8080`

## Release (one command, fully gated)
```bash
bash infra/deploy/scripts/release.sh v11 "Taka Tap v2"   # gates → stamp → changelog → tag → push → deploy
```
Pushing the `v*` tag fires CI + a GitHub Release with auto-notes. See **[docs/RELEASING.md](docs/RELEASING.md)**.

## Tracking (the issue board)
Every idea is a GitHub issue on a milestone; kanban columns are `status:` labels
(`backlog` → `todo` → `in-progress` → `review` → `blocked`). New issues are
auto-assigned + auto-triaged. See **[docs/ISSUE_BOARD.md](docs/ISSUE_BOARD.md)**.

## Quality gates (before any release)
```bash
cd apps/kid && ./node_modules/.bin/tsc --noEmit -p tsconfig.json   # type-safe
cd apps/kid && node scripts/audit.mjs                              # i18n + catalog + seed integrity
python3 scripts/team/oracle_team.py                                # the Oracle Team's 22-role sign-off
```
CI runs these on every push/PR via GitHub Actions (`numberverse-org/numberverse`).

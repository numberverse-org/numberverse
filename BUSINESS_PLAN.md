# 📱 Numberverse — Kids Math Game
## Full Business & Product Plan
> Working title: **Numberverse** (a universe of numbers that grows with the child)
> Owner: Mahmudul Hasan | Prep: Tresha | Date: 5 Aug 2026

---

## 0. ELEVATOR PITCH

> 2.3 billion children worldwide struggle with math anxiety. Most "math apps" are drill worksheets in digital clothing. **Numberverse** is a story-driven game world where kids 2-13 *play* math — bubbles to pop, fruit to count, rockets to fuel with multiplication — with an adaptive engine that keeps every child in their learning sweet spot. Game-first, parent-approved, COPPA-safe, shipped to browser first and iOS/Android via one codebase.

**The wedge:** No app owns the full 2–13 age arc with a coherent world and adaptive engine. Khan Academy Kids (2–8) is worksheet-heavy. Prodigy (6–14) is a grind RPG with weak pedagogy. SplashLearn is pricey ed-tech SaaS. **Numberverse = game studio polish × real curriculum × one connected world from toddler to middle school.**

---

## 1. THE PROBLEM

- **Kids:** Math anxiety starts as early as 6 (Stanford: panic response activates in brain during math). Drill apps make it worse.
- **Parents:** Don't know how to help; want screen time that's *actually* productive. Pay willingly for anything that works ($20B+/yr spent on kids' apps globally).
- **The gap:** Apps are either too babyish for 10-year-olds or too hard for 5-year-olds. Nothing scales the difficulty *with the same child* from "count to 3" to "solve for x."

---

## 2. THE SOLUTION

- **One adaptive game world, 5 age bands.** The child's character grows through worlds as they master skills. A 4-year-old counts ladybugs; the same profile at 11 solves pre-algebra in the Star Academy.
- **Game-first pedagogy:** every skill is a *game mechanic*, not a worksheet. Correct answers *do things* — pop bubbles, launch rockets, build pizza.
- **Adaptive difficulty engine** (Bayesian-ish mastery tracking + spaced repetition): keeps success rate ~80%, never boring, never frustrating.
- **Parent dashboard:** progress per skill, Common Core alignment, screen-time limits, weekly email summary.
- **COPPA-safe by design:** no ads, no third-party trackers, parent-gated accounts.

---

## 3. MARKET OPPORTUNITY

| Metric | Value |
|---|---|
| Global ed-tech market (2026) | ~$400B, growing ~13%/yr |
| Kids' app market | $20B+ / yr |
| Math learning apps | Largest sub-category in education apps |
| Mobile learning apps downloads | 500M+/yr, ~30% kids/math |
| Parents willing to pay for edu apps | 60%+ (Willingness to Pay survey) |

**Target:** Parents of 2–13 year-olds (primary buyer), teachers/schools (secondary, high LTV).

---

## 4. COMPETITIVE LANDSCAPE

| App | Ages | Strength | Weakness | Our angle |
|---|---|---|---|---|
| Khan Academy Kids | 2–8 | Free, huge library | Worksheet-heavy, weak game loop | Game-first |
| Prodigy Math | 6–14 | Massive player base | Grind RPG, shallow pedagogy | Real curriculum depth |
| SplashLearn | 3–12 | Adaptive, funded | Expensive, SaaS-y UX | Consumer delight |
| DragonBox | 4–14 | Brilliant pedagogy | One-time purchase, thin catalog | Subscription + world |
| Duolingo Math | 8+ | Polished | Narrow age/scope | 2–13 arc |
| Moose Math / Todo Math | 3–8 | Charming | Top-end caps at ~8 | Coherent 2–13 growth |

**Our differentiation:** (1) full 2–13 arc in one connected world, (2) adaptive engine + spaced repetition, (3) game-studio juice (audio, juice, mascot) with real pedagogy, (4) honest privacy (marketing weapon).

---

## 5. PRODUCT — AGE-BANDED WORLDS + CURRICULUM

The world is one map; each band is a themed biome. Skills map to Common Core (USA) + UK National Curriculum.

### 🌱 Band 1 — "Sprout Grove" (ages 2–4)
- Count 1–10 (recognition + sequence)
- Number shapes, "how many?" (cardinality)
- Shapes (circle, square, triangle, star), colors, patterns
- Big/small, more/less
- **Games:** Bubble Pop 1–10, Shape Sort, Feed the Squirrel (counting snacks)
- Zero text — all voice + visuals

### 🏡 Band 2 — "Cottage Fields" (ages 4–6)
- Count to 100 (1s, 5s, 10s), number bonds to 10
- Add/subtract within 10, place value (tens/ones)
- **Games:** Count & Pop (1→N), Fruit Addition, Number Bond Balloons

### 🌉 Band 3 — "River Town" (ages 6–8)
- Add/subtract to 100, intro multiplication (groups, arrays)
- Times tables 2, 5, 10; simple fractions (½, ¼); money & time
- **Games:** Rocket Builder (mult = fuel), Pizza Fractions, Bridge Builder (sum = plank)

### 🏰 Band 4 — "Sky Castle" (ages 8–10)
- ×÷ facts to 12, multi-digit ops, fractions/decimals intro
- Perimeter/area, word problems, estimation
- **Games:** Dragon Dungeon Quest, Decimal Darts, Castle Blueprint (area)

### ⭐ Band 5 — "Star Academy" (ages 10–13)
- Fractions/decimals/percentages fluency, ratios
- Pre-algebra (equations, variables), negative numbers, coordinates
- **Games:** Lab Experiments (solve for x), Rocket Trajectory (coordinates), Percent Market

---

## 6. GAME DESIGN

### Core loop
```
Play 3–5 min micro-session → master a skill → earn stars + collectible creature → unlock next world piece → parent sees progress
```

### Adaptive engine (the moat)
- Each skill has **mastery state**: threshold = 3 correct at 80%+ → mastered
- **Spaced repetition:** mastered skills decay over days, re-surface for quick review
- **Zone of proximal development:** engine tunes difficulty to keep success ~80%
- Simple to start (BKT-lite), upgradeable to full Bayesian Knowledge Tracing later

### Engagement mechanics
- Daily streak, collectible creature garden, world unlocks
- Seasonal events (holiday math), sibling profiles (up to 4 kids per account)
- Screen-time guardrails parent-set (respectful → App Store loves this)

### Juice (what makes it feel like a real game)
- Catchy SFX + music (WebAudio, no assets in prototype)
- Confetti, sparkle particles, mascot reactions
- "Ta-da" moments with animated stars

---

## 7. TECHNICAL ARCHITECTURE (FULL FRAMEWORK STACK)

> **Note on the prototype:** the playable demo in `web/prototype/index.html` is intentionally a single vanilla HTML file — one click opens it, zero build step, instant validation. **The real product uses the framework stack below.** The prototype is a stepping stone, not the destination.

```
                        ┌──────────────────────────────────────────────────────────┐
                        │            NUMBERVERSE MONOREPO (pnpm workspaces)         │
                        └──────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼──────────────────────────────┐
        │                             │                              │
┌───────▼────────┐         ┌──────────▼─────────┐         ┌──────────▼──────────┐
│   KID APP       │         │   PARENT PORTAL     │         │   ADMIN CONSOLE     │
│  (game shell)   │         │  React + Next.js    │         │  React + react-admin│
│ React 18 + Vite │         │  /parent routes     │         │  /admin routes      │
│ + Phaser 3      │         │  child progress     │         │  content mgmt       │
│ + Zustand       │         │  mastery charts     │         │  difficulty tuning  │
└───────┬────────┘         │  screen-time, subs  │         │  users / refunds    │
        │                  └──────────┬─────────┘         │  A/B tests, metrics  │
        │                             │                   └──────────┬──────────┘
        └─────────────────────────────┼──────────────────────────────┘
                                      │  HTTPS / JWT auth
                          ┌───────────▼────────────────────────────┐
                          │   BACKEND (FastAPI — full backend)      │
                          │   Auth (JWT) · REST APIs · webhooks    │
                          │   Adaptive-model computation · reports │
                          │   PostgreSQL 16 (Docker, on this Mac)  │
                          │   Redis (Docker) — sessions, queue     │
                          │   PostHog self-host (privacy analytics)│
                          └───────────┬────────────────────────────┘
                                      │ Capacitor 6
                          ┌───────────▼────────────┐
                          │  iOS (StoreKit)         │
                          │  Android (Play Billing) │
                          └────────────────────────┘
```

### The stack — and WHY each choice

| Layer | Framework | Why (not alternatives) |
|---|---|---|
| **Kid app shell** | **React 18 + TypeScript + Vite** | Hasan ships React daily. Vite = instant HMR, tiny bundles. React owns all UI/HUD/menus; Phaser renders the game canvas inside a React component. |
| **Game engine** | **Phaser 3** (inside React) | Best canvas/WebGL 2D engine for touch; `react-phaser`-style bridge is a proven pattern. (PixiJS = lower-level, no scene/game-loop ergonomics; Three.js = overkill 3D.) |
| **Game state** | **Zustand** | Minimal boilerplate, works inside React + beside Phaser via a shared store. Redux = too heavy. |
| **Parent portal** | **Next.js** (same repo, `/parent` routes) | Server-rendered dashboards, API routes, auth middleware. Charts via Recharts. Separate React app = redundant infra. |
| **Admin console** | **React 18 + react-admin** (`/admin`) | Battle-tested CRUD framework for content, users, subscriptions, difficulty config — frees up Hasan's time. Custom FastAPI-admin = reinvented wheel. |
| **Backend** | **FastAPI** (full backend) | Auth (JWT), REST APIs, admin/report APIs, billing webhooks, adaptive-model computation — one codebase, everything self-hosted. Hasan ships FastAPI daily. |
| **DB** | **PostgreSQL 16** (Docker, on this machine) | Local-first, zero third-party dependency. Tables: `profiles`, `kids`, `skill_mastery`, `progress_events`, `subscriptions`, `content_items`, `config`. SQLAlchemy async ORM + Alembic migrations. |
| **Caching/queue** | **Redis** (Docker) | Sessions, per-kid adaptive state, leaderboard. |
| **Mobile wrap** | **Capacitor 6** | One React codebase → iOS + Android + PWA. StoreKit/Play Billing plugins. (Expo = would force RN rewrite; Cordova = unmaintained.) |
| **Auth** | **JWT (FastAPI)** | Parent-gated accounts (COPPA): parent signs up with email+password, gets JWT; child profiles scoped under parent. No third-party auth vendor. |
| **Analytics** | **PostHog (self-host)** | Privacy-first, no ad SDKs → passes Kids Category review. |
| **Offline** | **Local save → sync on reconnect** | Kids play on planes/tablets; progress merges server-side. |
| **Monorepo** | **pnpm workspaces** | `apps/kid` · `apps/parent` · `apps/admin` · `apps/api` · `packages/core`. One `git push` deploys all. |

> **Dev stack:** everything runs on this machine — Postgres 16 + Redis in Docker Compose (`infra/docker-compose.yml`), FastAPI via `uv`, frontends via pnpm. No third-party cloud services during development.

### Three apps, one codebase — what each actually is

**1. Kid App (`apps/kid`)** — the game.
```
React shell (menus, HUD, star bar, world map)
  └── Phaser canvas component (each mini-game = a Phaser Scene)
        ├── Sprout Grove   → Count & Pop, Shape Sort (ages 2–4)
        ├── Cottage Fields → Fruit Addition, Number Bonds (4–6)
        ├── River Town     → Rocket Multiplication, Pizza Fractions (6–8)
        └── … (Bands 4–5 in later releases)
  Zustand store ↔ adaptive engine (packages/core) ↔ Supabase sync
```
- Kid flow: tap game → Phaser boots that scene → on exit, mastery deltas written to Zustand → debounced sync to Postgres via Supabase.
- COPPA: kid never enters email/name at start; parent creates the account, adds child profiles.

**2. Parent Portal (`apps/parent`, Next.js `/parent`)** — the dashboard.
- Per-child skill mastery map (color-coded: new / learning / mastered) aligned to Common Core.
- "What they learned this week" feed + weekly email summary (Resend).
- Screen-time controls (daily limit → kid app enforces via local store + server).
- Subscription / billing management (Stripe or store-managed receipts).
- Multiple children (up to 4), sibling-friendly.

**3. Admin Console (`apps/admin`, React + react-admin)** — you control everything.
- **Content**: add/edit skills, mini-game configs, curriculum items, seasonal content (no code deploy — content lives in Postgres).
- **Difficulty**: tune adaptive parameters per band/game (target success %, spacing intervals, stars thresholds).
- **Users & subs**: view accounts, refunds, plan changes, test-device management.
- **Ops**: feature flags, A/B test rollout, error monitoring, PostHog dashboards, export CSV.
- **Locked down**: admin auth via Supabase + admin-only role claim; no public access.

### Why this beats the alternatives
- **Native (Swift/Kotlin):** 2 codebases, 2x work, no web demo, no instant Product Hunt launch. ✗
- **React Native + Skia:** loses the shared Phaser engine; game feel is worse; RN is a side skill, not depth. ✗
- **Unity:** great for a pure game, but poor web export, heavy, subscription licensing, and you'd write a whole second React app for admin/parent anyway. ✗
- **Vanilla HTML/JS for the whole product:** unmaintainable at 30+ games, no type safety, no admin. ✗ (fine for the prototype only)

### Repo skeleton (pnpm workspaces)
```
numberverse/
├── apps/
│   ├── kid/          # React + Vite + Phaser (game shell)
│   ├── parent/       # Next.js portal (/parent)
│   ├── admin/        # React + react-admin (/admin)
│   └── api/          # FastAPI (auth, data, webhooks, reports)
├── packages/
│   ├── core/         # skill maps, adaptive engine, types (shared)
│   └── db/           # SQLAlchemy models, Alembic migrations, seed
├── infra/            # docker-compose (Postgres+Redis), init SQL, env
└── docs/             # this plan, playtest notes, store checklists
```

**Deployment:** `docker compose up` on this machine for Postgres + Redis; FastAPI + all three React apps run locally via pnpm/uv. When ready to ship: one VPS (or Vercel + a small box) runs the same containers — nothing is coupled to a cloud vendor. **Web URL from day 1** — schools and parents try it before the stores approve.

---

## 8. MONETIZATION

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0 | World 1 (one biome), 3 mini-games, 1 profile |
| **Parent Plus** | $7.99/mo or **$59.99/yr** (best) | All 5 worlds, all games, adaptive engine, parent dashboard, offline, up to 4 kids |
| **School** | ~$4/student/yr | Teacher dashboard, bulk licensing, no-ads pledge |

- 7-day free trial on subscription (store-managed)
- **No ads, ever** — this is a privacy moat and store-compliance requirement
- Apple App Store: 15% (Small Business Program) · Google Play: 15% tier

---

## 9. UNIT ECONOMICS (conservative)

| Metric | Assumption |
|---|---|
| Downloads Y1 | 50k (ASO + organic + school pilot) |
| Free→Paid conversion | 2.5% |
| Paying subs Y1 | ~1,250 |
| Avg price (blend) | ~$45/yr (mixed monthly/annual) |
| **Revenue Y1** | **~$56k gross → ~$48k net** |
| CAC | $3–5 (organic-first, content marketing) |
| Subscriber retention | 6–12 mo avg |
| LTV (Y1 subs) | $50–120 |
| **LTV:CAC** | **5:1+** (healthy) |
| Y2 (add school edition + SEO) | $150k+ gross |

*Break-even:* ~$20k/yr fixed costs (tools, store fees, no salaries — solo build). Profitable from month ~4–6.

---

## 10. PRIVACY & COMPLIANCE (do this right, it's a moat)

- **COPPA (US):** parent-gated account creation (parent email verified), no PII from kids, data minimization, deletion on request
- **GDPR-K / EU:** same principles; DPA-ready
- **App Store Kids Category:** required rules — no third-party ads, no data collection, "Made for Kids" toggle → big organic boost if compliant
- **Play Store:** Family Policy + Designed for Families
- **Tech implication:** zero ad SDKs, zero cross-app tracking, analytics self-hosted & aggregated
- **Marketing angle:** "The math game with zero ads. Period." — parents share this.

---

## 11. GO-TO-MARKET

1. **Web demo first** (this prototype) → Product Hunt, IndieHackers, r/educationalgaming
2. **Parent content engine:** TikTok/IG Reels of kids playing (50% of app installs for kids' apps come from parent social content)
3. **ASO:** "math games for kids", "counting for toddlers", "learn math" keywords + App Store Kids feature
4. **Schools:** free pilot for 10 schools → testimonials → School Edition (recurring B2B)
5. **Influencers:** 5–10 mom-teacher influencers (gift + affiliate)
6. **App Store feature pitch:** kid-safe, no-ads, adaptive — this is the story editors want

---

## 12. ROADMAP & MILESTONES

| Phase | Timeline | Deliverables |
|---|---|---|
| **P0 Prototype** | Week 1–2 | ✅ Working web demo (2 mini-games, adaptive) — vanilla, for validation only |
| **P1 Scaffold** | Week 3 | pnpm monorepo: `apps/kid` (React+Vite+Phaser), `apps/parent` (Next.js), `apps/admin` (react-admin), `apps/api` (FastAPI), Supabase project + schema, `packages/core` (skill maps + adaptive engine) |
| **P2 MVP** | Week 4–9 | 5 mini-games (Bands 1–2) in Phaser scenes inside React shell, adaptive engine wired, local save + Supabase sync, parent dashboard v1 (progress + screen time), admin console v1 (content + difficulty config) |
| **P3 Playtest** | Week 10–11 | 30 kids (friends/schools), iterate difficulty + juice, fix UX |
| **P4 Web Launch** | Week 12–13 | Deploy kid app + parent portal + admin, Product Hunt, content seeding, 2–3 more games |
| **P5 Mobile** | Week 14–17 | Capacitor wrap, StoreKit/Play Billing, privacy review, Kids Category submission |
| **P6 Growth** | Month 5+ | School pilot, seasonal events, Band 3–4 games, referral program |

**Launch target: Web ~Sep 2026 · App Store/Play Store ~Dec 2026**

---

## 13. TEAM & SKILLS

| Skill | Source |
|---|---|
| Full-stack (React/FastAPI/Supabase) | ✅ Hasan (has the stack today) |
| Game dev (Phaser/Canvas in React) | ✅ Hasan (learn as you build — prototype proves it) |
| Admin console (react-admin) | ✅ Hasan (React skill directly applies) |
| Parent portal (Next.js + Recharts) | ✅ Hasan (ships Next.js dashboards today) |
| UI/art (emoji-driven v1, later pro asset pack) | ⏳ Can start with emoji, hire $300 asset pack later |
| Curriculum correctness | ✅ Align to Common Core — I'll encode skill maps |
| Legal/privacy review | $500 one-time (COPPA checklist) |
| ASO + store submission | ✅ DIY + Apple/Google docs |

**Rule: solo-build until revenue > $5k/mo, then outsource art + hire VA for support.**

---

## 14. FINANCIAL PROJECTION (conservative vs optimistic)

| Year | Subs | Revenue (net) | Costs | Notes |
|---|---|---|---|---|
| Y1 | 1,250 | ~$48k | ~$20k | School edition seeds Y2 |
| Y2 | 4,000 | ~$180k | ~$50k | School + international pricing |
| Y3 | 12,000 | ~$500k | ~$150k | Maybe hire 1–2, expand content |

---

## 15. RISKS & MITIGATIONS

| Risk | Mitigation |
|---|---|
| COPPA/App Store rejection | Build compliance into architecture day 1, Kids Category checklist |
| Too broad (2–13) | **Launch with Band 1–2 as wedge**, architecture supports all 5 |
| Competition (Prodigy etc.) | Differentiate on adaptive engine + honest privacy + game juice |
| Content depth | Curriculum map done upfront; reuse game engines across bands |
| Solo burnout | Ship web MVP fast, test, iterate; scope world to 5 games first |
| Revenue slow | School pilot + subscription from day 1, not ads |

---

## 16. 90-DAY ACTION PLAN

- [ ] **Week 1:** ✅ Business plan + working prototype (done today)
- [ ] **Week 1–2:** Show prototype to 5 parents + 5 kids, collect 3 feedback points
- [ ] **Week 3:** P1 Scaffold — pnpm monorepo, Supabase project + schema, Next.js parent/admin shells, FastAPI, `packages/core` (skill maps + adaptive engine)
- [ ] **Week 4–8:** Build P2 MVP — 5 mini-games in React+Phaser, adaptive engine wired, Supabase sync, parent dashboard v1, admin console v1
- [ ] **Week 9–10:** Playtest 30 kids, tune adaptive engine
- [ ] **Week 11–12:** Deploy kid app + parent portal + admin → Product Hunt + parent TikTok content
- [ ] **Week 13–16:** Capacitor mobile wrap + store submission
- [ ] **Ongoing:** Update this doc monthly; check tracker for progress

---

## 17. APPENDIX — PROTOTYPE

**Working demo (web):** `web/prototype/index.html`
- Game 1: **Count & Pop** — tap numbered bubbles 1→N, adaptive (3→10)
- Game 2: **Fruit Addition** — visual add with emoji fruit, adaptive (sum 5→20)
- WebAudio SFX, confetti, star rewards, touch + mouse
- Zero assets (emoji + procedural), zero ads, zero tracking

*Prepared by Tresha. For Hasan. Let's build something kids love. ❤️*

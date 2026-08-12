# 🏗️ Numberverse — architecture (#311)

> Diagram + data-flow annotation for the current system: the kid PWA, the
> parent portal, the API, and the two engines that make it a learning product —
> **Kotha** (the story lake) and **Moni** (the per-child tutor model). Refreshed
> 2026-08-12.

```
                        ┌────────────────────────────────────────────┐
                        │  BOX  (192.168.0.104 — homelab)            │
                        │                                            │
   Cloudflare           │  ┌────────────┐    ┌───────────────────┐   │
   named tunnel ────────┼──▶  web :8080 │ ──▶│  api (FastAPI)    │   │
   (7d5273d2…, systemd) │  │  nginx     │    │  auth · kids ·    │   │
                        │  │  static    │    │  progress ·       │   │
   kids.munna-khan.xyz  │  │  + PWA     │    │  content · export │   │
                        │  └────────────┘    │  · admin          │   │
                        │          ▲         └────────┬──────────┘   │
                        │          │                  ▼              │
                        │   ┌──────┴──────┐   ┌──────────────────┐   │
                        │   │  postgres 16 │◀──│  learning_stories │  │
                        │   │  (pgvector)  │   │  (KOTHA lake)    │   │
                        │   └─────────────┘   └──────────────────┘   │
                        └────────────────────────────────────────────┘

   kid PWA (offline-first) ── durable outbox ──▶ API ──▶ Postgres
   parent portal (static)  ── REST ──────────▶ API
```

## Four pieces, one sync spine

| Piece | Where | What it is |
|---|---|---|
| **`packages/core`** | pure TS, no DOM | The single source of truth: skills catalogue, Moni engine, types. Built once; the kid app imports the compiled dist. |
| **`apps/kid`** | Vite + React + Phaser PWA | The learning app. Local-first: full shell + games precached (workbox), progress/stories queued on-device until a connection returns. |
| **`apps/parent`** | Next.js 14, **static export** | Parent portal under `/parent/`: login, per-kid progress, wrong-answer history, data export. No server — ships as static files from the same `web` container. |
| **`apps/api`** | FastAPI + SQLAlchemy + Postgres 16 | The only network service. Routers: `auth`, `kids`, `progress`, `content`, `export`, `admin`. Enforces the PII scrubber (#266/#270), age-band lock (#275), structured error log (#124). |

Both front-ends are served by one nginx container (`web`, host port 8080);
`/parent/` and `/admin/` are sibling static routes under it (and the kid PWA's
service-worker navigateFallback explicitly excludes them).

## 🧠 Moni — the tiny per-child tutor (fully local)

`packages/core/src/moni/` — a small, deterministic model that runs **in the
kid app, on-device, no cloud**. Layered signal → profile → diagnosis → plan:

- **Signals** — every round (`MoniRound`: kid, skill, game, correct, ms,
  difficulty, timestamp) plus every wrong tap.
- **Profile** — what Moni believes about THIS child (attention, confidence,
  style, misconceptions), never shipped off-device.
- **Diagnosis** — classifies each mistake: `slip | gap | misconception | fatigue | guessing`.
- **Plan** — one next move: which skill, what difficulty, which game, what
  tone, how long, when to review (`planner.ts`). Constrained by the catalogue's
  `dependsOn` prerequisites — Moni never jumps ahead of a child.

Plans live in the app; what syncs to the API is the round **record** (below).

## 📚 Kotha — the learning-story lake (RAG-ready)

`apps/api/app/models.py::LearningStory` — the `learning_stories` table is
Numberverse's knowledge base. Every meaningful learning moment becomes a row:

```
what the kid faced → how Moni diagnosed it → what we tried → how it landed
```

Fields: `kid_id`, `skill_id`, `game_id`, `error_kind`, `misconception_code`,
`action` (reteach/slow_down/break/encourage/…), `outcome`, `difficulty`,
`response_ms`, `wrong_streak`, and a free `context` JSONB envelope (question,
answer, timings, the Moni plan that ran — grows without migrations).

- **Dedup key** (`kid_id, uid`) makes replayed outbox batches a no-op (#331).
- **Embed job** (`embeddings.py`, #329) batch-embeds story **context envelopes**
  with `gte-small` into pgvector — PII-safe (question + Moni's reason, never
  names/kid ids). Gracefully `skipped` if the ML stack isn't installed.
- Today the lake feeds Moni's per-kid plans; the future is semantic retrieval
  over thousands of real learning moments.

## 🔄 Always-sync path — offline-first, drain on reconnect

The kid app **never blocks on the network** (`apps/kid/src/api.ts`):

1. Identity + token cached in `localStorage` (`nv_kid_id`, `nv_parent_token`).
2. Every progress record and Kotha story is written to the store's persisted
   **outbox** (`pending` array, each item with a durable `uid`).
3. When online, the outbox drains to the API; `syncIdentity` returns `null`
   offline so callers degrade cleanly and retry next tick.
4. Server dedupes by `uid` — a lost ACK re-posted on the next sync is a no-op.

Verified matrix in `docs/OFFLINE.md`: cold/warm/offline-progress/voice all
pass; launch makes zero network requests.

## 🚀 Shipment

- PR → CI gates (11 jobs) → `release.sh <X.Y.Z>` → stamp → changelog → tag →
  push → version-tagged Docker images on the box → deploy → smoke test →
  auto-rollback on a genuine origin fault (#125). Full walkthrough in
  `docs/RELEASING.md`.
- The box also runs the homelab monitoring stack (prometheus + node-exporter +
  grafana + uptime-kuma) — box CPU/RAM/disk metrics, self-hosted, no cloud.

## Layout reference

```
packages/core/src/        skills.ts (catalogue) · moni/ (planner, diagnose,
                           profile, style, fingerprint) · links.ts · png.ts
apps/kid/src/             App.tsx · store.ts (outbox) · api.ts (sync spine)
                          components/ · game/ (Phaser scenes + framing + i18n)
apps/parent/app/          layout.tsx · login/ · page.tsx (static export)
apps/api/app/             main.py · models.py · routers/{auth,kids,progress,
                          content,export,admin}.py · embeddings.py · scrub.py
infra/                    docker-compose.yml (dev) · deploy/ (compose.prod,
                          Dockerfile.*, scripts/{release,deploy,rollback}.sh)
```

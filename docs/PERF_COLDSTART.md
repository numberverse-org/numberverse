# 🐢 Cold-start baseline (#117) — measured 2026-08-13

Goal: **first paint < 2s on a mid-range Android**. This is the static
baseline (the "Baseline measurement" done-when). Device validation + the
remaining optimizations need a real mid-range Android / WebPageTest.

## Load-critical asset table (live build, `index-BpRkrH_B.js`)

| Asset | Raw | gz | Notes |
|---|---|---|---|
| `index-*.js` (entry) | **1.83 MB** | **0.45 MB** | React + app shell + all non-Phaser game logic + i18n (EN+BN) |
| `index-*.css` | 94 KB | — | render-blocking stylesheet |
| `engine-*.js` (Phaser + scenes) | 307 KB | — | **lazy** — only fetched when a game launches (#15). ZERO Phaser bytes in the entry. |
| fonts (5 × woff2) | ~180 KB | — | Baloo2 ×3 + Nunito ×2, loaded on demand |
| sprites/avatars | — | — | lazy per-game / per-menu |

## First-paint timeline estimate (mid-range Android, 4G)

1. **HTML + CSS** — CSS render-blocking: ~150–350 ms
2. **Entry JS fetch** — 0.45 MB gz over HTTP/2: ~400–900 ms on decent 4G
3. **Entry JS parse + exec** — 1.83 MB minified ≈ 350–800 ms on a mid-range CPU
4. **React first render** — 100–250 ms
→ **estimated 1.2–2.3s** — right at the boundary; the entry JS exec is the tail.

## Already done

- Phaser engine + every game scene = dynamic chunk (issue #15) — the biggest
  cost is already deferred until a game is picked.
- Service-worker precache means repeat visits skip the network entirely
  (see `docs/OFFLINE.md`).
- Main bundle gz is 0.45 MB — under the #110 1.5MB gz bar.

## What a real 2s target still needs (device-validated)

- **Measure on the actual device** (WebPageTest / Lighthouse on a Moto G / low-
  end Android): TTFB, FCP, LCP, JS parse time.
- **If entry parse is the tail**, split more of the entry out of the boot path:
  i18n dictionaries per-locale (EN/BN split), Kotha/story UI, parent-portal
  callbacks — each is a candidate lazy chunk.
- Defer non-critical CSS / inline the above-the-fold styles if FCP is style-
  bound.

## Honest status

Baseline done (this doc). The **optimizations to hit the target** and the
device measurement are blocked on having a real mid-range Android — can't be
verified from here. #117 stays open until a device measurement confirms <2s.

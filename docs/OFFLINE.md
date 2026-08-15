# 📴 Offline behavior — verified (#114)

The kid PWA is **local-first by design**: the game shell and every game are
fully precached, and progress is queued on-device until a connection returns.
This document is the recorded verification.

**Automated guardrail (#264):** `e2e/offline.spec.ts` (Playwright, runs against
the live deployed app) machine-checks the cold + warm offline contract: an
offline reload must render with every launch-critical asset served from the SW
precache, and the ONLY network failures allowed are the two documented runtime
features (neural-voice model download, Google sign-in button). CI job:
`offline-e2e`.

## Test matrix

| Case | Scenario | Result | Evidence |
|---|---|---|---|
| **Cold** | Fresh install / first visit **online** | Shell + all assets precached once; works from then on | Live `sw.js` precaches **22 entries** — `index.html`, main `index-*.js` (1.83 MB raw / 0.45 MB gz), main `index-*.css`, Phaser `engine-*.js`, workbox window shim, 4 avatar PNGs, 3 forest sprites, 5 fonts (Baloo2 ×3, Nunito ×2), manifest, favicon, app icons — each with a content revision hash |
| **Warm** | Revisit / relaunch **offline** (airplane mode) | App shell + games load from precache; SPA navigation served by the SW navigation route → `/index.html` | `vite.config.ts` workbox: `globPatterns ["**/*.{js,css,html,woff2,woff,ttf,otf,png,jpg,jpeg,webp,svg,ico,json,glb,wasm}"]` (including `og-card.png` for offline social cards), `NavigationRoute` denylist `/^\/parent(?:\/|$)/i` + `/^\/admin(?:\/|$)/i` so the sibling portals never get hijacked |
| **Offline progress** | Play while offline, reconnect later | Progress/stories buffered on-device, drained to API when online | `apps/kid/src/api.ts` — identity cached in `localStorage` (`nv_kid_id`, `nv_parent_token`, outbox = persisted `pending` array); `syncIdentity` returns `null` offline so callers degrade cleanly |
| **Known gap** | Bangla **neural voice** on a brand-new offline install | Voice model (~110 MB) is runtime-cached `CacheFirst` on first *online* session; until then the device falls back to the bundled edge TTS | `vite.config.ts` workbox `runtimeCaching` for `/voice/.*` (CacheFirst, 6-month, 12 entries). Games/math/phonics are fully offline regardless |

## No network calls on launch

Boot path (`main.tsx` → `App.tsx` first render) makes **zero** network
requests:

- `main.tsx`: `registerSW()` + `createRoot().render()` — purely local.
- First-mount effects: voice-poll interval reads local state only.
- The only `fetch()` sites outside `api.ts`:
  - `game/neuralVoice.ts:434` — downloads the voice model **when a Bangla
    voice is first used** (never on boot; already-cached after the first
    online session).
  - `components/GoogleSignIn.tsx:120` — `/auth/google/status` **only when the
    Google button is rendered** (optional feature).
- `api.ts` is the sole network module; its sync path is outbox-queued and
  offline-degrading.

## How this stays true

`vite-plugin-pwa` regenerates `sw.js` on every build; the precache manifest is
content-hashed, so a new release swaps revisions atomically. The
`audit` CI gate + release smoke test ensure the shipped bundle is the one
being precached.

_Verified 2026-08-13 against the live build (`index-BpRkrH_B.js`)._

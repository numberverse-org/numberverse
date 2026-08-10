# 👁️ Numberverse — Visual Baseline (reference look)

> Last updated: 11 Aug 2026
> The UI team for visual inspection compares every screen against these reference
> looks. Any change is intentional — if a screen drifts, the Regression Recorder
> updates this doc and the team signs off.

## Core screens
- **Boot** — Nova (realistic great-horned owl SVG, 160×210 portrait) greets by name; teal accent; no flash of unstyled content.
- **Home** — journey-first: hero card with streak + "next up"; ONE big ▶ Play button (two-line: action + current stop); "Your path" shows avatar on the current glowing node, ✓ behind / ▶🔒 ahead; quest chip + worlds/Nova/garden icons; offline chips. No dead ends.
- **Map** — three tabs 🗺️ Map / 🛣️ Journey / 🏘️ Worlds. Map = 5 islands on a winding dashed road, each a radial-gradient medallion in its land colors, progress bar tinted, world-number chip, ▶/🔒, floating deco, 📍 "You're here!" on current.
- **Worlds** — themed cards with emoji tile gradient + left accent bar + progress gradient, per-land palette.
- **Journey** — linear path of stops; region heads wear their land accent; band complete → gold "You opened the road to NEXT! 🎉" banner.
- **Lesson scenes** — Phaser; Nova cameo peeks top-right (tappable, sparkle); land-themed background; no element covers a plant/notch/button.
- **Done screen** — warm celebration; mastered skill → golden world-complete ribbon.
- **Card album** — 3D flip mastery cards (front: gradient + subject emoji + title EN/BN + ⭐ + name stamp + date; back: % correct / rounds / streak / Mastered by); locked cards grayscale 🔒; golden world-champion foil card.
- **Garden/Nova pet** — Nova 2.0 plush star-owl (teal-tipped tufts + teal chest star); everything else uses the realistic owl.

## Land palette (single source of truth — WORLD_LANDS)
| World | c1 (deep) | c2 (mid) | c3 (light) | deco |
|---|---|---|---|---|
| Sprout Grove | #0f3d33 | #2ec4b6 | #a7f3d0 | 🌱🍃🌿 |
| Cottage Fields | #5a2a1e | #f6c06a | #ffe8b0 | 🌾🐄🌻 |
| River Town | #0b3b6d | #5fb6e8 | #bde8ff | 🌊🐟🛶 |
| Sky Castle | #4a1f2e | #e8b0a0 | #ffd9c4 | ☁️🏰🕊️ |
| Star Academy | #2b2350 | #c4b5fd | #e6dcff | 🚀⭐🌠 |

Contrast rule: every c1↔c3 pairing ≥ 3.0:1 (WCAG large-text AA — all pass, best 11.00:1).

## Non-negotiables
- No tofu / replacement chars anywhere (Bangla glyphs must render).
- Every vector asset has an emoji fallback; every `url:` asset exists in `public/`.
- Text readable on every land gradient; tap targets ≥ 44px.
- Nova looks like Nova everywhere (shell, scene, cameo, cards, share art).
- OG/cert/progress share cards render pixel-clean at 1200×630 and in WhatsApp.
- 320px phones: no overflow, no cut-off buttons. Landscape/TV: no breakage.

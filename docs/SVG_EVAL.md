# 🎞️ SVG animation library evaluation (#321)

> **Decision:** do NOT add an SVG animation library. Phaser's built-in tween +
> graphics + path engine already covers the motion needs; a DOM-based SVG lib
> would not compose with Phaser's canvas/WebGL renderer and would cost bundle +
> perf. This doc records the comparison + measured numbers.

## The constraint: scenes render in Phaser, not DOM

Numberverse scenes are Phaser 3.80 game objects (canvas/WebGL). Phaser ships a
complete animation stack — `this.tweens.add()` (timelines, easing, delays,
yoyo), `this.add.graphics()` / `new Phaser.Geom.Path()` (vector shapes, motion
paths), particles, and arcade physics. That stack is **already in the codebase**:

- **48 files** in `src/game/` call `this.tweens.add`
- **43 files** in `src/game/` use vector graphics / paths / particles

A DOM/SVG animation library (SVG.js, GSAP-for-DOM, Motion) animates **HTML/SVG
nodes** — a different render surface than Phaser's canvas. To use one you'd
have to overlay DOM elements on top of the game canvas and sync two render
trees, which is worse for perf and complexity than using the engine Phaser
already provides.

## Comparison (bundle impact measured against the current build)

| Option | Added size | Compose with Phaser? | Verdict |
|---|---|---|---|
| **Phaser tweens/graphics (current)** | **0 KB** (already in the lazy `engine-*.js` chunk, loaded only for scenes) | ✅ native game objects | ✅ use it — already there |
| **SVG.js** (~86 KB min) | ~86 KB (main or scene chunk) | ❌ DOM only — overlays on canvas | ✖ |
| **GSAP core** (~70 KB min) | ~70 KB | ⚠ can tween ANY object (works with canvas via proxies) but adds a second tween system on top of Phaser's | ✖ redundant — Phaser already tweens its objects |
| **Motion One** (~15-20 KB) | ~15 KB | ❌ DOM/animation API, React-oriented | ✖ wrong renderer |
| **Lottie-web** (~150 KB) | ~150 KB | ⚠ renders vector via canvas but is a huge runtime for AE exports | ✖ overkill for a kids' game |

## Measured current state (2026-08-12)

```
main bundle   index-*.js      1890 KB  (lazy chunks below)
engine chunk  engine-*.js      300 KB  ← Phaser tween/vector engine lives HERE
```

An SVG lib would add 15-150 KB to a bundle that's already under the 2100 KB
budget but has zero headroom for non-essential weight — and would duplicate
capabilities Phaser already provides at 0 KB.

## What to do instead (recommended, when richer motion is wanted)

- **More tween choreography** — Phaser timelines (`this.tweens.chain`) for
  multi-step scene motion, zero deps.
- **Procedural vector motion** — `Phaser.Geom.Path` + `tweens.add({ targets,
  t })` for path-following (e.g. Nova flying a loop), zero deps.
- **Fresco/SVG assets** — static SVG files as Phaser textures (via the game's
  existing asset pipeline) for richer art, without an animation runtime.

## Guardrail

The **bundle-size gate** (`scripts/bundle-size.mjs`, 2100 KB budget, #305)
already rejects any future dependency that would bust the budget — adding an
animation lib would trip it unless justified by real, measured benefit.

## Files
- `docs/SVG_EVAL.md` (this) — comparison + bundle impact measured (#321 done-when)

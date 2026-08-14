# 🧠 Game-loop memory audit (#352) — measured 2026-08-12

Issue: **"No growth across 50 rounds"** / "Profile on low-end".
This document records the audit result and the one real leak it found — plus
the fix, the runtime proof, and the residual inventory.

## The leak: RESIZE listeners piled on the global ScaleManager

Phaser's `scene.scale` is the **game-level ScaleManager singleton**, created
once per Game. A listener registered in `create()` therefore lives on the
whole app's emitter — and `Systems.shutdown()` only hibernates scene plugins,
it **never clears game-level scale listeners** (confirmed in Phaser 3.90
`scene/Systems.js`: `shutdown()` emits `SHUTDOWN` then leaves the scale
manager untouched; `removeAllListeners` only runs on `destroy`).

So the common pattern `this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout())`
left an **anonymous arrow + closure over the scene** on the global emitter for
every scene start. Each round that switches scenes = +1 dead listener.

Audit sweep of `apps/kid/src/game/*.ts` found **151 registration sites** with
zero removal:

| Pattern | Sites |
|---|---|
| `this.scale.on(RESIZE, () => this.layout());` | 132 |
| `this.scale.on(RESIZE, () => { … });` (multiline) | 18 |
| `this.scale.on(RESIZE, () => { this.layout(); this.drawBoard(); });` | 1 |

(Already leak-free and left untouched: `NovaScene.ts` — registers a *named*
`this.layout, this` and `off`s it in its own shutdown; `backgrounds.ts` — same
named-handler + `off` pattern.)

**Impact on low-end:** memory grows ~1 listener (~100 B closure + captured
scene) per restart, and every window resize fires N `layout()` calls instead
of 1 — lag compounding with play time.

## The fix

New `apps/kid/src/game/sceneLifecycle.ts`:

```ts
export function onSceneResize(scene: Phaser.Scene, fn: () => void, ctx?: unknown) {
  const handler = ctx === undefined ? fn : fn.bind(ctx);
  scene.scale.on(Phaser.Scale.Events.RESIZE, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, handler);
  });
  return handler;
}
```

Same registration, same layout behavior — but the listener is removed when the
scene SHUTS DOWN (stop → next scene, or app teardown). Applied across all
151 sites. tsc clean.

## Runtime proof (real Phaser 3.90 EventEmitter)

Standalone probe simulating 50 scene-restart cycles:

```
OLD  50 restarts → 50 RESIZE listeners (unbounded: +1 per restart)
NEW  50 restarts → 0 RESIZE listeners (scoped cleanup keeps it flat)
PASS: no growth across 50 rounds (#352)
```

## Residual inventory (cleaned by construction)

- GameObjects are destroyed per-round (`clearButtons()` etc.) — no other
  leak source found in the sweep.
- Audio: `speech.ts` / `audio.ts` use WebAudio nodes; a dedicated device
  profile (Memory tab, 50 rounds on a mid-range Android) is the remaining
  hands-on verification step, tracked in #352.

## #1108 — layout thrash (same helper, same release)

While fixing the leak we found the second half of the RESIZE problem: Phaser's
`ScaleManager.refresh()` **emits RESIZE unconditionally** even when the game
size is unchanged, and `App.tsx`'s `visualViewport.resize` handler bypassed
the ResizeObserver raf-guard — so an iOS toolbar-collapse burst ran the full
scene layout read/write storm **repeatedly in one frame**.

Two fixes (released together):

1. **`App.tsx`** — `visualViewport.resize` now routes through the same
   once-per-frame `scheduleRefresh()` guard as the ResizeObserver (shared
   `raf` counter). Every resize trigger coalesces to ≤ 1 `scale.refresh()`/frame.
2. **`onSceneResize()`** — now (a) skips the layout when `scale.width/height`
   are unchanged (kills no-op RESIZE events), and (b) coalesces same-frame
   events into a single rAF. A scene can never lay out more than once per
   frame; the pending rAF is cancelled on SHUTDOWN.

Runtime proof (real Phaser EventEmitter + deterministic rAF stub, driving the
actual `sceneLifecycle.ts` through esbuild):

```
1. same-size burst (3 events)         → layouts: 0  (size-skip)
2. 3 real resizes in one frame        → layouts: 1  (coalesce)
3. 3 real resizes across frames       → layouts: 3  (once per frame)
4. shutdown before the rAF fires      → pending rAF 1→0, layout 0, listener gone
```

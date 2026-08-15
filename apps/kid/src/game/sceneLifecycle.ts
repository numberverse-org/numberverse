import Phaser from "phaser";

/**
 * #352 — game-loop memory audit: "no growth across 50 rounds".
 *
 * Phaser's `scene.scale` is the game-level ScaleManager singleton: a RESIZE
 * listener registered in `create()` survives `scene.stop()` / scene restarts,
 * because `Systems.shutdown()` only hibernates scene systems and never touches
 * the global scale emitter (confirmed in Phaser 3.90 Systems.js — shutdown
 * emits SHUTDOWN but clears no game-level listeners). Every scene start piled
 * up one more anonymous arrow listener (151 registration sites found in the
 * audit), so N rounds meant N dead closures on the global emitter → unbounded
 * memory growth on low-end devices, and every window resize fired N layout()
 * calls instead of 1.
 *
 * This registers exactly the same listener but scopes its removal to the
 * scene's own lifecycle: when the scene SHUTS DOWN (stop → start of the next
 * scene, or app teardown) the listener is removed from the scale emitter.
 * Layout behavior is byte-for-byte identical; the growth stops.
 *
 * It also absorbs #1108 (layout thrash): Phaser's ScaleManager.refresh()
 * emits RESIZE UNCONDITIONALLY every call — even when the game size is
 * unchanged — and an iOS toolbar-collapse burst can land several events in
 * one frame. So we (a) skip the layout when width/height did not actually
 * change, and (b) coalesce same-frame events into a single rAF, so a scene
 * never lays out more than once per frame.
 *
 * #940 — that rAF used to be per-scene: with two scenes live at once (a fade
 * transition, or a not-yet-shutdown scene) one resize burst scheduled TWO
 * rAFs and ran TWO layout() passes in the same frame. The coalescer is now
 * keyed by the game-level ScaleManager, so every active scene's layout runs
 * in ONE shared rAF per frame, no matter how many scenes are listening.
 *
 * #941 — inactive/stopped scenes used to keep a stale `this`-capturing closure
 * on the shared emitter until SHUTDOWN finally removed it. The listener is now
 * removed on BOTH shutdown and destroy, and the shared rAF re-checks that the
 * scene is still active before calling its layout, so a late RESIZE delivery
 * can never lay out a hibernated scene.
 */

type PendingResize = {
  raf: number;
  handlers: Set<ResizeHandler>;
};

type ResizeHandler = {
  scene: Phaser.Scene;
  layout: () => void;
  lastW: number;
  lastH: number;
};

/** One coalescing bucket per ScaleManager (i.e. per Game). */
const pending = new WeakMap<Phaser.Scale.ScaleManager, PendingResize>();

function schedule(scale: Phaser.Scale.ScaleManager, handler: ResizeHandler) {
  let bucket = pending.get(scale);
  if (!bucket) {
    bucket = { raf: 0, handlers: new Set() };
    pending.set(scale, bucket);
  }
  bucket.handlers.add(handler);
  if (bucket.raf) return;
  bucket.raf = window.requestAnimationFrame(() => {
    bucket!.raf = 0;
    const run = Array.from(bucket!.handlers);
    bucket!.handlers.clear();
    for (const h of run) {
      // #941 — the scene may have been stopped between the RESIZE event and
      // this frame; never lay out a scene that is no longer active.
      if (h.scene.scene.isActive()) h.layout();
    }
  });
}

export function onSceneResize(scene: Phaser.Scene, fn: () => void, ctx?: unknown) {
  const layout = ctx === undefined ? fn : fn.bind(ctx);
  const entry: ResizeHandler = {
    scene,
    layout,
    lastW: scene.scale.width,
    lastH: scene.scale.height,
  };
  const handler = () => {
    const w = scene.scale.width;
    const h = scene.scale.height;
    // #1108 — refresh() emits RESIZE unconditionally; skip no-op frames.
    if (w === entry.lastW && h === entry.lastH) return;
    entry.lastW = w;
    entry.lastH = h;
    // #940 — one rAF per frame shared by every scene on this ScaleManager.
    schedule(scene.scale, entry);
  };
  const teardown = () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, handler);
    const bucket = pending.get(scene.scale);
    if (bucket) {
      bucket.handlers.delete(entry);
      if (bucket.handlers.size === 0 && bucket.raf) {
        window.cancelAnimationFrame(bucket.raf);
        bucket.raf = 0;
      }
    }
  };
  scene.scale.on(Phaser.Scale.Events.RESIZE, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
  scene.events.once(Phaser.Scenes.Events.DESTROY, teardown);
  return layout;
}

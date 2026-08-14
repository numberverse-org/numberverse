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
 */
export function onSceneResize(scene: Phaser.Scene, fn: () => void, ctx?: unknown) {
  const layout = ctx === undefined ? fn : fn.bind(ctx);
  let raf = 0;
  let lastW = scene.scale.width;
  let lastH = scene.scale.height;
  const handler = () => {
    const w = scene.scale.width;
    const h = scene.scale.height;
    // #1108 — refresh() emits RESIZE unconditionally; skip no-op frames.
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    // #1108 — coalesce: one layout per frame even if several RESIZE events
    // land in the same frame (ResizeObserver + visualViewport both firing).
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      layout();
    });
  };
  scene.scale.on(Phaser.Scale.Events.RESIZE, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, handler);
    if (raf) window.cancelAnimationFrame(raf);
  });
  return layout;
}

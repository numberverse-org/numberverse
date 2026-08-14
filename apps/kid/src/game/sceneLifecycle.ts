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
 */
export function onSceneResize(scene: Phaser.Scene, fn: () => void, ctx?: unknown) {
  const handler = ctx === undefined ? fn : fn.bind(ctx);
  scene.scale.on(Phaser.Scale.Events.RESIZE, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, handler);
  });
  return handler;
}

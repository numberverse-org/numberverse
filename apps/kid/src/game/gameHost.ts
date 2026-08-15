/**
 * Phaser host — creates the game lazily so the ENGINE + every scene live in a
 * DYNAMIC chunk (issue #15): the first bundle drops from ~2MB to app-only, and
 * the engine loads only when a canvas is actually needed (playing / nova /
 * garden screens). All callers share ONE in-flight promise (idempotent), and a
 * teardown-mid-load can never leak a game onto an unmounted canvas.
 *
 * This module is part of the MAIN bundle — it only `import type`s Phaser (the
 * type is erased at build time, so zero runtime Phaser bytes land here).
 */
import type { Game, Scene } from "phaser";
import { startPerfProbe, stopPerfProbe } from "./perfProbe"; // #1324 — frame-jank measuring stick

let bootPromise: Promise<Game | null> | null = null;
let current: Game | null = null;
let generation = 0;

/** #1448 — quick, kid-friendly scene fade. Short enough to feel snappy, long
 *  enough to hide the old-scene stop / new-scene start seam (and the one-frame
 *  blank a synchronous hard cut used to flash). */
const SCENE_FADE_MS = 150;

export interface SceneStartOptions {
  game: Game;
  /** Key of the scene to fade out (may be null on first boot). */
  fromKey: string | null;
  /** Key of the scene to start after the fade. */
  toKey: string;
  /** Data passed through to `game.scene.start`. */
  data?: object;
  /** Invoked after `game.scene.start` has run (the new scene may not be
   *  visible yet). Use this to update React refs immediately. */
  onStarted?: (scene: Scene | null) => void;
  /** Invoked once the new scene has actually rendered — the point where the
   *  boot/loading overlay is finally safe to unmount (#1447). */
  onRendered?: () => void;
  /** Return true to abandon a pending fade-out before starting the next scene
   *  (e.g. the kid pressed Back mid-transition). */
  isCancelled?: () => boolean;
}

/**
 * #1448 — fade the current scene out, stop it, start the next scene, then fade
 * it back in. Works for the boot path too (`fromKey` null → only the fade-in),
 * and for restarting the SAME scene (pass `fromKey === toKey`).
 *
 * Kept in gameHost (the MAIN bundle) on purpose: it only imports Phaser types,
 * so no Phaser runtime bytes land in the app chunk — the same guarantee as the
 * rest of this module (#15).
 */
export function startSceneWithFade({ game, fromKey, toKey, data, onStarted, onRendered, isCancelled }: SceneStartOptions): void {
  const from = fromKey ? game.scene.getScene(fromKey) : null;
  const begin = () => {
    if (isCancelled?.()) return;
    game.scene.start(toKey, data);
    const next = game.scene.getScene(toKey);
    if (next) {
      next.cameras.main.fadeIn(SCENE_FADE_MS, 0, 0, 0);
      next.events.once("render", () => onRendered?.());
    } else {
      // Defensive: never leave the loading overlay stuck on a missing scene.
      onRendered?.();
    }
    onStarted?.(next);
  };

  if (!from) {
    begin();
    return;
  }

  from.cameras.main.fadeOut(SCENE_FADE_MS, 0, 0, 0);
  from.cameras.main.once("camerafadeoutcomplete", () => {
    game.scene.stop(fromKey as string);
    if (isCancelled?.()) return;
    begin();
  });
}

/** #1449 — fade a scene to black without starting a replacement. The caller
 *  stops the scene and swaps the DOM screen in the completion callback, so the
 *  old canvas stays visible (and covered by the fade) until Home is ready. */
export function fadeOutScene(game: Game, key: string, duration: number, onComplete: () => void): void {
  const scene = game.scene.getScene(key);
  if (!scene || duration <= 0) {
    onComplete();
    return;
  }
  scene.cameras.main.fadeOut(duration, 0, 0, 0);
  scene.cameras.main.once("camerafadeoutcomplete", onComplete);
}

/** The live game, if one is currently created. */
export function getGame(): Game | null {
  return current;
}

/** Begin loading + creating the Phaser game in `parent`. Idempotent — many
 *  callers share the same promise. Resolves with the game, or null if a
 *  teardown happened while the chunk was loading (the caller must no-op). */
export function boot(parent: HTMLElement): Promise<Game | null> {
  if (current) return Promise.resolve(current);
  if (!bootPromise) {
    const gen = generation;
    bootPromise = import("./engine")
      .then((m) => {
        if (gen !== generation) return null; // torn down mid-load → never create
        const g = m.createGame(parent);
        current = g;
        startPerfProbe(); // #1324 — only when ?nvperf=1 (or __NV_PERF_ENABLED__)
        return g;
      })
      .catch((e) => {
        console.error("[game] Phaser chunk failed to load:", e);
        bootPromise = null; // allow a retry next time
        return null;
      });
  }
  return bootPromise;
}

/** Ensure the game is booted, then run `cb` once it is (immediately if already
 *  booted). No-op if the chunk failed or was torn down mid-load. */
export function whenReady(parent: HTMLElement, cb: (game: Game) => void): void {
  void boot(parent).then((g) => {
    if (!g) return;
    if (g.isBooted) cb(g);
    // Phaser.Core.Events.READY === "ready" (stable Phaser 3 API).
    else g.events.once("ready", () => cb(g));
  });
}

/** Tear down the game + drop the pending boot so a future boot is fresh. */
export function teardown(): void {
  generation++;
  const g = current;
  current = null;
  bootPromise = null;
  g?.destroy(true);
  stopPerfProbe(); // #1324 — log the session summary (no-op unless ?nvperf=1)
}

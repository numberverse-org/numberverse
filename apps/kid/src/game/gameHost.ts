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
/** The generation `current` was created in. Lets the fast-path in `boot()`
 *  re-check teardowns instead of trusting `current` alone (#938). */
let currentGeneration = -1;
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

/** #821 — wait for Phaser's READY event before resolving. `createGame()` returns
 *  as soon as the Game object exists, but the renderer/texture manager can still
 *  be booting. Resolving on the instance made `whenReady()` race: a caller could
 *  observe `isBooted` before READY and start a scene on a half-booted game (or
 *  miss the event entirely and leave a blank navy canvas). */
function waitForGame(g: Game, gen: number): Promise<Game | null> {
  if (gen !== generation) return Promise.resolve(null);
  // Phaser sets isBooted at the START of boot, before the renderer/texture
  // manager has finished and before READY. isRunning is the flag flipped by
  // Game.start() AFTER the READY event, so it is the correct "already ready"
  // check here.
  if (g.isRunning) return Promise.resolve(g);
  return new Promise((resolve) => {
    let settled = false;
    const settle = (out: Game | null) => {
      if (settled) return;
      settled = true;
      resolve(gen === generation ? out : null);
    };
    g.events.once("ready", () => settle(g));
    g.events.once("destroy", () => settle(null));
  });
}

/** Begin loading + creating the Phaser game in `parent`. Idempotent — many
 *  callers share the same promise. Resolves with the game once it is READY, or
 *  null if a teardown happened while the chunk was loading (the caller must
 *  no-op). */
export function boot(parent: HTMLElement): Promise<Game | null> {
  // #938 — the fast path must respect the generation counter too. `teardown()`
  // bumps `generation`, so a game still sitting in `current` from an older
  // generation is stale and must never be handed back to a new mount.
  if (current && currentGeneration === generation) return waitForGame(current, generation);
  current = null;
  if (!bootPromise) {
    const gen = generation;
    bootPromise = import("./engine")
      .then((m) => {
        if (gen !== generation) return null; // torn down mid-load → never create
        const g = m.createGame(parent);
        current = g;
        currentGeneration = gen;
        startPerfProbe(); // #1324 — only when ?nvperf=1 (or __NV_PERF_ENABLED__)
        // #937 — success: drop the resolved closure. `current` short-circuits
        // every later boot(), so keeping the promise only pins a stale closure
        // (and its captured `parent` element) in memory for the app's lifetime.
        bootPromise = null;
        return waitForGame(g, gen);
      })
      .catch((e) => {
        console.error("[game] Phaser chunk failed to load:", e);
        bootPromise = null; // allow a retry next time
        return null;
      });
  }
  return bootPromise;
}

/** Ensure the game is booted, then run `cb` once it is. No-op if the chunk
 *  failed or was torn down mid-load. `boot()` now resolves on Phaser READY, so
 *  there is no event-listener race to re-create here. */
export function whenReady(parent: HTMLElement, cb: (game: Game) => void): void {
  void boot(parent).then((g) => {
    if (g) cb(g);
  });
}

/** Tear down the game + drop the pending boot so a future boot is fresh. */
export function teardown(): void {
  generation++;
  const g = current;
  current = null;
  currentGeneration = -1;
  bootPromise = null;
  g?.destroy(true);
  stopPerfProbe(); // #1324 — log the session summary (no-op unless ?nvperf=1)
}

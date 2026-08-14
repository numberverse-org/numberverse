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
import type { Game } from "phaser";
import { startPerfProbe, stopPerfProbe } from "./perfProbe"; // #1324 — frame-jank measuring stick

let bootPromise: Promise<Game | null> | null = null;
let current: Game | null = null;
let generation = 0;

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

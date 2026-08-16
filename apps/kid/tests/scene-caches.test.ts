// @vitest-environment jsdom
/* test-coverage-kid — #1744/#1745/#1746: module-level game caches and global
 * listeners must reset with the game.
 *
 * Three leaks lived in the engine chunk's module-level state:
 *   #1744  blobCache (backgrounds.ts) — dead 512×512 CanvasTextures from a
 *          destroyed Phaser game were retained forever; the cache now has a
 *          clearBlobCache() lifecycle (called from svgAssets' brand-new-game
 *          detection) and self-heals stale entries at lookup time.
 *   #1745  failed (svgAssets.ts) — an SVG that once refused to rasterize was
 *          pinned to its emoji fallback forever; a brand-new game now clears
 *          the failed set so transient errors get a fresh retry.
 *   #1746  onReducedMotionChange listeners (question.ts / backgrounds.ts) were
 *          released on SHUTDOWN only; DESTROY (game teardown without a scene
 *          stop) leaked the closure in the module-level listener Set forever.
 *          Both now subscribe the teardown to SHUTDOWN + DESTROY, and the
 *          returned unsubscribe is idempotent.
 *
 * Phaser cannot boot in the unit runner (engine.test.ts documents the jsdom
 * canvas limitation), so this file mirrors the repo's two-layer pattern:
 *   · PURE-LOGIC tests for the one owned module with no Phaser dependency —
 *     reducedMotion.ts — that prove the idempotent unsubscribe behavior.
 *   · STATIC SOURCE SCANS (the same deterministic layer as scenes.test.ts /
 *     engine.test.ts) asserting the reset/teardown contract of the
 *     Phaser-heavy modules.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { onReducedMotionChange, setReducedMotion, prefersReducedMotion } from "../src/game/reducedMotion";

/* ── localStorage guarantee (persist-worker.test.ts pattern) ──
 * reducedMotion reads/writes `nv_reduced_motion` through window.localStorage.
 * jsdom's Storage is reliable in most environments but not all CI/origin
 * configs — install a tiny in-memory Storage up front so the toggle behavior
 * under test is deterministic. */
function installLocalStorage(): void {
  if (typeof globalThis.localStorage !== "undefined") return;
  const mem = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return mem.size;
    },
    clear() {
      mem.clear();
    },
    getItem(k: string) {
      return mem.has(k) ? mem.get(k)! : null;
    },
    key(i: number) {
      return Array.from(mem.keys())[i] ?? null;
    },
    removeItem(k: string) {
      mem.delete(k);
    },
    setItem(k: string, v: string) {
      mem.set(k, String(v));
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  }
}
installLocalStorage();

/** A subscriber that records every toggle it receives (never GC'd until its
 *  unsubscribe runs — exactly the closure #1746 was leaking). */
function spyRecorder() {
  const received: boolean[] = [];
  const unsubscribe = onReducedMotionChange((v) => received.push(v));
  return { unsubscribe, received };
}

/* ───────────────────────── source scan helpers ───────────────────────── */
const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "game");
const read = (f: string): string => readFileSync(join(GAME_DIR, f), "utf8");

describe("reducedMotion — idempotent unsubscribe (#1746)", () => {
  beforeEach(() => {
    // Start every test from a known "motion ON" state with no left-over subs.
    setReducedMotion(false);
  });

  it("unsubscribing twice never throws", () => {
    const { unsubscribe } = spyRecorder();
    expect(() => {
      unsubscribe();
      unsubscribe();
    }).not.toThrow();
  });

  it("a subscriber stops receiving toggles after unsubscribe", () => {
    const { unsubscribe, received } = spyRecorder();
    setReducedMotion(true);
    expect(received).toEqual([true]);
    unsubscribe();
    setReducedMotion(false);
    // One fire before unsubscribe, ZERO after — the leaked-closure bug would
    // have kept pushing into `received` here.
    expect(received).toEqual([true]);
  });

  it("unsubscribing one listener leaves the others live (Set membership is per-listener)", () => {
    const a = spyRecorder();
    const b = spyRecorder();
    setReducedMotion(true);
    expect(a.received).toEqual([true]);
    expect(b.received).toEqual([true]);
    a.unsubscribe();
    setReducedMotion(false);
    expect(a.received).toEqual([true]); // untouched after its own unsubscribe
    expect(b.received).toEqual([true, false]); // still live
    b.unsubscribe();
  });

  it("the stored toggle is reflected by prefersReducedMotion (in-app wins over OS)", () => {
    setReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    setReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("svgAssets — brand-new-game cache reset (#1745/#1744)", () => {
  const svg = read("svgAssets.ts");

  it("clears the failed set on a brand-new game so a failed SVG gets a fresh retry", () => {
    // #1745 — a transient error (network blip) must not pin an SVG to emoji
    // forever: the brand-new-game detection now clears `failed` alongside the
    // already-cleared inFlight/waiters.
    expect(svg).toMatch(/failed\.clear\(\)/);
    expect(svg).toMatch(/failed\.delete\(key\)/); // per-key retry-success stays
    expect(svg).toMatch(/inFlight\.clear\(\)/);
    expect(svg).toMatch(/waiters\.clear\(\)/);
  });

  it("drops the previous game's blob cache via clearBlobCache()", () => {
    // #1744 — the one call site for the blob-cache lifecycle lives beside the
    // SVG reset so both caches die at the same "brand-new game" moment.
    expect(svg).toMatch(/clearBlobCache\(\)/);
    expect(svg).toMatch(/import \{ clearBlobCache \} from "\.\/backgrounds"/);
  });

  it("detects a new game by the wiped texture manager alone (not by in-flight load count)", () => {
    // The historical `&& inFlight.size > 0` guard meant a new game where every
    // old SVG load had already settled silently SKIPPED the reset, keeping the
    // stale failed-set + blob cache. The reliable signal is the missing
    // texture — startOne() creates the first key's texture synchronously, so
    // the key can never be absent mid-game.
    expect(svg).not.toMatch(/textureKey\(first\)\) && inFlight\.size > 0/);
  });
});

describe("backgrounds — blob-cache lifecycle + DESTROY teardown (#1744/#1746)", () => {
  const bg = read("backgrounds.ts");

  it("exports clearBlobCache() clearing the texture map AND its paint guard", () => {
    expect(bg).toMatch(/export function clearBlobCache\(\): void/);
    expect(bg).toMatch(/blobCache\.clear\(\)/);
    expect(bg).toMatch(/blobPainted\.clear\(\)/);
  });

  it("getBlobTex drops a stale cache entry (and its paint guard) when the texture died with a previous game", () => {
    expect(bg).toMatch(/blobCache\.delete\(color\)/);
    expect(bg).toMatch(/blobPainted\.delete\(color\)/);
  });

  it("releases the module-level listener + game-level resize handler on DESTROY too", () => {
    // Same SHUTDOWN+DESTROY teardown convention as sceneLifecycle.ts / NovaScene.
    expect(bg).toMatch(/Phaser\.Scenes\.Events\.SHUTDOWN, teardown/);
    expect(bg).toMatch(/Phaser\.Scenes\.Events\.DESTROY, teardown/);
    expect(bg).toMatch(/state\.offReducedMotion\?\.\(\)/);
    expect(bg).toMatch(/let tornDown = false/);
  });
});

describe("question — module-level reduced-motion listener released on DESTROY too (#1746)", () => {
  const q = read("question.ts");

  it("subscribes the teardown to both SHUTDOWN and DESTROY", () => {
    expect(q).toMatch(/Phaser\.Scenes\.Events\.SHUTDOWN, teardown/);
    expect(q).toMatch(/Phaser\.Scenes\.Events\.DESTROY, teardown/);
    expect(q).toMatch(/let tornDown = false/);
    expect(q).toMatch(/offReducedMotion\(\)/);
  });
});

describe("reducedMotion module — double-unsubscribe guard shipped (#1746)", () => {
  const rm = read("reducedMotion.ts");

  it("the returned unsubscribe carries an unsubscribed flag (idempotent)", () => {
    expect(rm).toMatch(/unsubscribed/);
    expect(rm).toMatch(/listeners\.delete\(listener\)/);
  });
});

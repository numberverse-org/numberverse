/**
 * countback-distractors.test.ts — #1865 CountBackScene infinite loop.
 *
 * On the last step (target=0) the old distractor fallback sampled
 * `Phaser.Math.Between(0, target + 2)` = 0/1/2, every one of which was already
 * in `opts` ([0, 2, 1]) — so `while (opts.length < 4)` could never find a fresh
 * number and hung forever before blast-off.
 *
 * The Phaser canvas engine can't boot in a unit runner, so (same layer as
 * scenes.test.ts / scene-timers.test.ts) this is a DATA / STRUCTURAL scan of
 * the shipped file contract:
 *   1. The unbounded random fallback is gone (`Phaser.Math.Between` must not
 *      appear in CountBackScene).
 *   2. The distractor top-up is a BOUNDED deterministic scan over the full
 *      valid range 0..START (the `c <= START && opts.length < 4` loop), so it
 *      always terminates and the option grid always fills to 4.
 *   3. Neighbors are filtered ≥ 0 (no negative options on the board).
 * Plus a pure-algorithm simulation over every reachable target (0..START-1)
 * confirming the prescribed builder always yields exactly 4 distinct options
 * in [0, START] — the invariant the fix must hold.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "game");
const src = readFileSync(join(GAME_DIR, "CountBackScene.ts"), "utf8");

/** Strip line + block comments — the "no Phaser.Math.Between" check is over
 *  CODE only (the fix's own doc comment references the old sampler). */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const code = stripComments(src);

/* ───────────────────────── 1. unbounded fallback removed ───────────────────────── */
describe("CountBackScene #1865 — no unbounded random distractor fallback", () => {
  it("no Phaser.Math.Between remains in code (the infinite-loop sampler is gone)", () => {
    expect(code, "Phaser.Math.Between in CountBackScene would re-enable the target=0 hang").not.toContain(
      "Phaser.Math.Between"
    );
  });

  it("the option loop is no longer an unbounded `while (opts.length < 4)`", () => {
    expect(
      code.match(/while\s*\(opts\.length\s*<\s*4\)/),
      "the old `while (opts.length < 4)` fallback must be gone"
    ).toBeNull();
  });
});

/* ───────────────────────── 2. bounded full-range top-up ───────────────────────── */
describe("CountBackScene #1865 — distractor top-up is bounded + deterministic", () => {
  it("tops up from the full valid range 0..START with a bounded loop", () => {
    expect(code).toContain("c <= START && opts.length < 4");
    // the top-up still guards against duplicates — it must never push an
    // option that's already on the board.
    expect(code).toMatch(/for \(let c = 0; c <= START && opts\.length < 4; c\+\+\)\s*\{\s*if \(!opts\.includes\(c\)\)\s+opts\.push\(c\);/);
  });
});

/* ───────────────────────── 3. options stay in the valid domain ────────────────────── */
describe("CountBackScene #1865 — options stay in the game's valid domain 0..START", () => {
  it("neighbors are filtered to 0 <= c <= START before joining opts", () => {
    // only the bounded scan is left to append; both branches must stay in range
    expect(code).toContain("if (c >= 0 && c <= START && !opts.includes(c)) opts.push(c);");
  });
});

/* ───────────────────────── 4. algorithm invariant (mirror of the fix) ─────────────────────────
 * The fix is: start with [target], add target+2 / target+1 / target-1 when in
 * 0..START, then scan 0..START until 4 distinct options are on the board. Every
 * reachable target (a countdown never goes below 0 or above START) must yield
 * exactly 4 distinct, in-range options — that is what guarantees the grid
 * fills and the level completes. */
const START = 100;
function countBackOptions(target: number): number[] {
  const opts = [target];
  for (const c of [target + 2, target + 1, target - 1]) {
    if (opts.length >= 4) break;
    if (c >= 0 && c <= START && !opts.includes(c)) opts.push(c);
  }
  for (let c = 0; c <= START && opts.length < 4; c++) {
    if (!opts.includes(c)) opts.push(c);
  }
  return opts;
}

describe("CountBackScene #1865 — option grid always fills (algorithm invariant)", () => {
  it("every reachable target 0..START-1 yields exactly 4 distinct in-range options", () => {
    for (let target = 0; target <= START - 1; target++) {
      const opts = countBackOptions(target);
      expect(opts, `target=${target} must produce exactly 4 options`).toHaveLength(4);
      expect(new Set(opts).size, `target=${target} must have no duplicates`).toBe(4);
      expect(opts.every((c) => Number.isInteger(c) && c >= 0 && c <= START), `target=${target} must stay in 0..START`).toBe(
        true
      );
      expect(opts, `target=${target} must include the correct answer`).toContain(target);
    }
  });

  it("the pathological last step (target=0) terminates and fills", () => {
    expect(countBackOptions(0).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });
});

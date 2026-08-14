#!/usr/bin/env node
/**
 * Reward-parity guard (#1206) — every completable scene must celebrate a
 * correct answer.
 *
 * Run:  node scripts/lint-scene-reward.mjs   (from repo root)
 *
 * The scene suite is 130+ hand-rolled Phaser.Scene files. Before this guard,
 * a scene could ship with a bare `pop(); win();` audio blip and NO confetti /
 * combo streak — kids got fireworks in one game and silence in the next
 * (#1197). The fix is one shared reward path, and the guard is the alarm:
 *
 *   a scene is COMPLETABLE if it reports `onRoundDone(...)`.
 *   it has a REWARD PATH if its source references one of:
 *     - correctCelebrate   (direct — celebrate.ts)
 *     - correctButton / ringCorrect  (ui.ts shared helpers that call it)
 *     - extends BinSortScene / TapChoiceScene  (bases that call it)
 *
 * Exit 1 lists every gap. Mirrors the oracle's scene-reward check so both
 * gates agree. Fails closed — a new scene that ships without reward is a build
 * error, not a review nit.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GAME_DIR = join(process.cwd(), "apps", "kid", "src", "game");
const REWARD_RE = /correctCelebrate|correctButton|ringCorrect|BinSortScene|TapChoiceScene/;
const COMPLETABLE_RE = /onRoundDone/;

const files = readdirSync(GAME_DIR).filter((f) => f.endsWith("Scene.ts"));
const gaps = [];
let completable = 0;
for (const f of files) {
  const src = readFileSync(join(GAME_DIR, f), "utf8");
  if (!COMPLETABLE_RE.test(src)) continue;
  completable++;
  if (!REWARD_RE.test(src)) gaps.push(f);
}

if (gaps.length) {
  console.error(
    `✗ reward parity: ${gaps.length}/${completable} completable scenes lack a reward path:\n  ${gaps.join("\n  ")}`
  );
  console.error("Add correctCelebrate(this, x, y) after the correct win() (or route through correctButton/ringCorrect).");
  process.exit(1);
}
console.log(`✓ reward parity: all ${completable} completable scenes emit correctCelebrate`);

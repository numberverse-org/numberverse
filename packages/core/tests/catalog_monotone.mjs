#!/usr/bin/env node
/**
 * 🧠 CATALOG ladder monotonicity + nextDifficulty contract (#1044-audit from
 * the v50 difficulty-model feed).
 * - Every GAME's difficultyLevels must be MONOTONE (non-decreasing OR
 *   non-increasing) in the scene's own terms — a sawtooth (like game-measure's
 *   old [10,20,50,100,3,5]) breaks the GameConfig "ordered easiest→hardest by
 *   index" contract and silently inverts the adaptive ramp.
 * - nextDifficulty on an empty ladder returns the documented neutral 1.
 *
 * Run:  node packages/core/tests/catalog_monotone.mjs
 */
import { GAMES, nextDifficulty, initialSkillState } from "../dist/index.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

/* ── every ladder is monotone (no sawtooths) ── */
let sawtooths = [];
for (const g of GAMES) {
  if (!Array.isArray(g.difficultyLevels) || g.difficultyLevels.length < 2) continue;
  const l = g.difficultyLevels;
  let inc = true, dec = true;
  for (let i = 1; i < l.length; i++) {
    if (l[i] < l[i - 1]) inc = false;
    if (l[i] > l[i - 1]) dec = false;
  }
  if (!inc && !dec) sawtooths.push(`${g.id} [${l.join(", ")}]`);
}
check(`catalog ladders all monotone (${GAMES.length} games)`, sawtooths, []);
if (sawtooths.length) for (const s of sawtooths) console.log(`    sawtooth: ${s}`);

/* ── game-measure specifically is now ascending (regression for the fix) ── */
const gm = GAMES.find((g) => g.id === "game-measure");
check("game-measure ladder ascending", gm.difficultyLevels, [10, 20, 50, 100, 300, 500]);

/* ── deliberate descending ladders are monotone (non-increasing) ── */
for (const id of ["game-digraphs", "game-longvowels", "game-rhymes", "game-conjunctfind"]) {
  const g = GAMES.find((x) => x.id === id);
  const l = g.difficultyLevels;
  let dec = true;
  for (let i = 1; i < l.length; i++) if (l[i] > l[i - 1]) dec = false;
  check(`${id} non-increasing (deliberate)`, dec, true);
}

/* ── nextDifficulty: empty ladder → neutral 1; mastery maps onto INDEX ── */
const s = initialSkillState("k", "s");
s.pMastered = 0.9;
check("nextDifficulty empty ladder → 1", nextDifficulty(s, []), 1);
const asc = [3, 4, 5, 6, 8, 10];
const desc = [10000, 9000, 8000, 7000, 6000, 5000];
check("nextDifficulty on ascending ladder stays in-ladder", asc.includes(nextDifficulty(s, asc)), true);
check("nextDifficulty on descending ladder stays in-ladder", desc.includes(nextDifficulty(s, desc)), true);
const low = initialSkillState("k", "s");
low.pMastered = 0.1;
check("low mastery picks LOW index on descending ladder", desc.indexOf(nextDifficulty(low, desc)) <= 1, true);

console.log("─".repeat(30));
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log("✓ all catalog monotone tests passed");

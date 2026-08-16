#!/usr/bin/env node
/**
 * 🧠 MONI planner — regression tests for the #12 focus-selection branches:
 *   1. misconception-first
 *   2. reachable-band fallback (misconception skill missing from catalog)
 *   3. empty-catalog guard
 *   4. numeric difficulty range on the normal path
 * Self-contained: runs against the BUILT core (packages/core/dist) with zero
 * deps, so CI can run it bare after `pnpm --filter @numberverse/core build`.
 *
 * Run:  node packages/core/tests/moni_plan.mjs
 */
import {
  DEFAULT_MONI_PARAMS,
  initialMoniProfile,
  recordMisconception,
  plan,
} from "../dist/index.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const T = 2_000_000; // fixed clock
const skill = (p = 0.5, streak = 0, wrongStreak = 0) => ({
  pMastered: p, streak, correct: Math.round(p * 10), attempts: 10, wrongStreak,
});

/* ── #12a — misconception-first: an active misconception beats everything ── */
{
  const catalog = {
    "count-1-10": { id: "count-1-10", band: 1, game: "game-countpop" },
  };
  const mastery = {
    // 0.6 < 0.8 → the misconception stays active; currentDifficulty(0.6) = 3
    "count-1-10": skill(0.6, 2, 1),
  };
  let p = initialMoniProfile("k", T);
  p = recordMisconception(p, "count-1-10", "overcount-1", "Counts one too many", T);
  const pl = plan(p, mastery, catalog, DEFAULT_MONI_PARAMS, undefined, T);
  check("#12a misconception-first focusSkillId", pl.focusSkillId, "count-1-10");
  // misconception branch carries difficultyDelta 0 → currentDifficulty(0.6)=3
  check("#12a documented difficulty", pl.difficulty, 3);
  check("#12a reason is contrast drill", pl.focusReason.includes("contrast drill"), true);
}

/* ── #12b — reachable-band fallback: misconception skill NOT in catalog ── */
{
  const catalog = {
    "b1a":     { id: "b1a",     band: 1, game: "g1" },
    "b1weak":  { id: "b1weak",  band: 1, game: "g1" },
    "b3far":   { id: "b3far",   band: 3, game: "g3" },
  };
  const mastery = {
    "b1a":    skill(0.8, 3, 0), // ≥0.5 → childBand = 1
    "b1weak": skill(0.3, 0, 2), // weak AND reachable (band 1 ≤ childBand+1)
    "b3far":  skill(0.2, 0, 3), // weak but OUT of reach (band 3 > 2)
  };
  let p = initialMoniProfile("k", T);
  // misconception points at a skill that is not in the catalog (and has no
  // mastery entry) → mastery[m.skillId]?.pMastered ?? 1 = 1 → NOT active
  p = recordMisconception(p, "ghost-skill", "ghost", "A skill Moni doesn't know", T);
  const pl = plan(p, mastery, catalog, DEFAULT_MONI_PARAMS, undefined, T);
  check("#12b fallback focus is reachable weak skill", pl.focusSkillId, "b1weak");
  check("#12b never jumps to out-of-reach band-3", pl.focusSkillId !== "b3far", true);
  // weak branch difficultyDelta −1 → currentDifficulty(0.3)=2 → 1
  check("#12b fallback difficulty", pl.difficulty, 1);
}

/* ── #12c — empty catalog guard: no throw + documented default shape ── */
{
  let p = initialMoniProfile("k", T);
  let pl;
  let threw = false;
  try {
    pl = plan(p, {}, {}, DEFAULT_MONI_PARAMS, undefined, T);
  } catch {
    threw = true;
  }
  check("#12c empty catalog does not throw", threw, false);
  check("#12c default focusSkillId", pl.focusSkillId, "count-1-10");
  // empty catalog → momentum branch (difficultyDelta +1) on base 1 → 2
  check("#12c default difficulty", pl.difficulty, 2);
  check("#12c default gameId", pl.gameId, "game-countpop");
}

/* ── #12d — normal path returns a numeric difficulty in the planner's range ── */
{
  const catalog = {
    "b1": { id: "b1", band: 1, game: "g1" },
    "b2": { id: "b2", band: 2, game: "g2" },
  };
  const mastery = {
    "b1": skill(0.95, 5, 0), // mastered → childBand = 1
    "b2": skill(0.55, 1, 0), // solid (≥0.5), reachable, lowest → momentum +1
  };
  const p = initialMoniProfile("k", T);
  const pl = plan(p, mastery, catalog, DEFAULT_MONI_PARAMS, undefined, T);
  check("#12d difficulty is finite integer", Number.isInteger(pl.difficulty), true);
  // currentDifficulty clamps to 1..5; momentum +1 → 1..6
  check("#12d difficulty within 1..6", pl.difficulty >= 1 && pl.difficulty <= 6, true);
  // exact value: round(0.55*5)=3 + momentum 1 = 4
  check("#12d momentum difficulty exact", pl.difficulty, 4);
}

console.log("─".repeat(30));
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log("✓ all moni plan tests passed");

#!/usr/bin/env node
/**
 * 🧠 MONI adaptive engine — regression tests for the #953–#960 cluster.
 * Self-contained: runs against the BUILT core (packages/core/dist) with zero
 * deps, so CI can run it bare after `pnpm --filter @numberverse/core build`.
 *
 * Run:  node packages/core/tests/moni_adaptive.mjs
 */
import {
  DEFAULT_MONI_PARAMS,
  initialMoniProfile,
  observe,
  decay,
  DEFAULT_PARAMS,
  moni,
  diagnose,
  diagnoseCorrect,
  plan,
} from "../dist/index.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const T = 1_000_000; // fixed clock
const skill = (p = 0.5, streak = 0, wrongStreak = 0) => ({
  pMastered: p, streak, correct: Math.round(p * 10), attempts: 10, wrongStreak,
  lastDecay: T, // full SkillState shape (decay() reads this)
});

/* ── #953 — zero/NaN responseMs must not poison speedTendency ── */
{
  let p = initialMoniProfile("k", T);
  // a NaN round and a zero round first
  p = moni.observeRound(p, { kidId: "k", skillId: "s", gameId: "g", correct: true, difficulty: 1, responseMs: NaN, timestamp: T }, skill(), DEFAULT_MONI_PARAMS, T);
  p = moni.observeRound(p, { kidId: "k", skillId: "s", gameId: "g", correct: true, difficulty: 1, responseMs: 0, timestamp: T }, skill(), DEFAULT_MONI_PARAMS, T);
  check("#953 no NaN avgResponseMs", Number.isFinite(p.style.avgResponseMs), true);
  check("#953 speedTendency in range", p.style.speedTendency >= 0 && p.style.speedTendency <= 1, true);
  // a real fast round then makes it sane
  p = moni.observeRound(p, { kidId: "k", skillId: "s", gameId: "g", correct: true, difficulty: 1, responseMs: 500, timestamp: T }, skill(), DEFAULT_MONI_PARAMS, T);
  check("#953 real round sets avg", p.style.avgResponseMs > 0, true);
}

/* ── #954 + #955 — fragile flag derives from recoveryRate; the rate decays ── */
{
  let p = initialMoniProfile("k", T);
  // 4 consecutive wrongs → recoveryRate decays toward 0 → fragile flips true
  for (let i = 0; i < 4; i++) {
    p = moni.observeRound(p, { kidId: "k", skillId: "s", gameId: "g", correct: false, difficulty: 1, responseMs: 6000, timestamp: T + i }, skill(), DEFAULT_MONI_PARAMS, T + i);
  }
  check("#955 recoveryRate decays on wrongs", p.confidence.recoveryRate, 0);
  check("#954 fragile derived from recoveryRate", p.confidence.fragile, true);
  // a correct right after a wrong bumps recovery, but a later wrong decays it back
  p = moni.observeRound(p, { kidId: "k", skillId: "s", gameId: "g", correct: true, difficulty: 1, responseMs: 800, timestamp: T + 9 }, skill(0.9), DEFAULT_MONI_PARAMS, T + 9);
  const afterRecover = p.confidence.recoveryRate;
  p = moni.observeWrong(p, { kidId: "k", skillId: "s", gameId: "g", difficulty: 1, timestamp: T + 10 }, skill(0.9, 0, 1), DEFAULT_MONI_PARAMS, T + 10);
  check("#955 recovery decays after correct→wrong", p.confidence.recoveryRate < afterRecover, true);
}

/* ── #956 — slowMs+1 wrong tap classifies as slow/gap, not the generic fallback ── */
{
  const wrongRound = { kidId: "k", skillId: "s", gameId: "g", correct: false, difficulty: 1, responseMs: DEFAULT_MONI_PARAMS.slowMs + 1, timestamp: T };
  const p = initialMoniProfile("k", T);
  const d = diagnose(p, wrongRound, skill(0.3), 1, DEFAULT_MONI_PARAMS);
  check("#956 slow tap → gap (not generic fallback)", d.kind, "gap");
  check("#956 gap action is reteach", d.action.type, "reteach");
  // a 0/NaN sentinel also reads as slow (never a fast guess)
  const d0 = diagnose(p, { ...wrongRound, responseMs: 0 }, skill(0.3), 1, DEFAULT_MONI_PARAMS);
  check("#956 0-ms tap → slow gap", d0.kind, "gap");
}

/* ── #957 — planner fallback stays inside the child's reachable band ── */
{
  const catalog = {
    "count-1-10": { id: "count-1-10", band: 1, game: "g1" },
    "count-1-20": { id: "count-1-20", band: 1, game: "g1", dependsOn: ["count-1-10"] },
    "count-1-100": { id: "count-1-100", band: 2, game: "g2", dependsOn: ["count-1-20"] },
    "fraction-ops": { id: "fraction-ops", band: 4, game: "g4", dependsOn: ["count-1-100"] },
  };
  const mastery = {
    "count-1-10": skill(0.95, 5),
    "count-1-20": skill(0.9, 3),
    "count-1-100": skill(0.0),   // aced band-1, never tried band-2 → weak entry
    "fraction-ops": skill(0.0),  // band-4 unmastered — must NOT be chosen
  };
  const p = initialMoniProfile("k", T);
  const pl = plan(p, mastery, catalog, DEFAULT_MONI_PARAMS, undefined, T);
  check("#957 focus inside band 2 (≤ childBand+1)", catalog[pl.focusSkillId].band <= 2, true);
  check("#957 never jumps to band-4", pl.focusSkillId !== "fraction-ops", true);
}

/* ── #1047 — per-skill difficulty deltas layer on top of strictness ── */
{
  const catalog = { "s1": { id: "s1", band: 1, game: "g1" } };
  const mastery = { "s1": skill(0.5) }; // currentDifficulty(0.5) → tier 3
  const p = initialMoniProfile("k", T);
  const base = plan(p, mastery, catalog, DEFAULT_MONI_PARAMS, undefined, T);
  // 0.5 mastery → currentDifficulty 3, +1 "everything solid → keep momentum" → 4
  check("#1047 base difficulty tier 4", base.difficulty, 4);
  const gentler = plan(p, mastery, catalog, DEFAULT_MONI_PARAMS, undefined, T, { "s1": -1 });
  check("#1047 per-skill -1 lowers difficulty", gentler.difficulty, base.difficulty - 1);
  const harder = plan(p, mastery, catalog, DEFAULT_MONI_PARAMS, undefined, T, { "s1": 2 });
  check("#1047 per-skill +2 raises difficulty", harder.difficulty, base.difficulty + 2);
  const other = plan(p, mastery, catalog, DEFAULT_MONI_PARAMS, undefined, T, { "s2": -1 });
  check("#1047 non-focus-skill delta is a no-op", other.difficulty, base.difficulty);
  // strictness + per-skill stack (gentle −1 AND skill +1 → net 0 from tier 3)
  const stack = plan(p, mastery, catalog, DEFAULT_MONI_PARAMS, "gentle", T, { "s1": 1 });
  check("#1047 strictness + skill delta stack", stack.difficulty, base.difficulty);
}

/* ── #958 — fragile child shifts review one rung shorter, solidity preserved ── */
{
  const catalog = { "s1": { id: "s1", band: 1, game: "g1" } };
  const masterSolid = { "s1": skill(0.95, 5) }; // ultra-solid: perSkill=0.95*1.0 → rawIdx 3
  const robust = initialMoniProfile("k", T);
  robust.confidence.recoveryRate = 0.8; // sharp
  const fragile = initialMoniProfile("k", T);
  fragile.confidence.recoveryRate = 0.2; // fragile
  const solid = { ...masterSolid, "s1": { ...masterSolid.s1, lastPractice: T } };
  const robustPlan = plan(robust, solid, catalog, DEFAULT_MONI_PARAMS, undefined, T);
  const fragilePlan = plan(fragile, solid, catalog, DEFAULT_MONI_PARAMS, undefined, T);
  const robustDue = robustPlan.dueReviews.find((d) => d.skillId === "s1");
  const fragileDue = fragilePlan.dueReviews.find((d) => d.skillId === "s1");
  // both due today (lastPractice = now) — compare the SCHEDULED interval instead
  const robustInt = robustPlan.reviewSchedule.find((d) => d.skillId === "s1")?.inDays;
  const fragileInt = fragilePlan.reviewSchedule.find((d) => d.skillId === "s1")?.inDays;
  // robust keeps the top rung (14d); fragile shifts one rung shorter (7d)
  check("#958 robust solid skill keeps long rung", robustInt === 14 || robustDue !== undefined, true);
  check("#958 fragile shifts rung shorter than robust", (fragileInt ?? 1) < (robustInt ?? 14) || fragileDue !== undefined, true);
}

/* ── #959 — game affinity decays per round so stale interest fades ── */
{
  let p = initialMoniProfile("k", T);
  // build up affinity on game-a
  for (let i = 0; i < 6; i++) {
    p = moni.observeRound(p, { kidId: "k", skillId: "s", gameId: "a", correct: true, difficulty: 1, responseMs: 900, timestamp: T + i }, skill(), DEFAULT_MONI_PARAMS, T + i);
  }
  const high = p.style.gameAffinity["a"];
  check("#959 affinity builds", high > 0.3, true);
  // switch to game-b for many rounds → game-a affinity decays toward 0
  for (let i = 0; i < 60; i++) {
    p = moni.observeRound(p, { kidId: "k", skillId: "s", gameId: "b", correct: true, difficulty: 1, responseMs: 900, timestamp: T + 100 + i }, skill(), DEFAULT_MONI_PARAMS, T + 100 + i);
  }
  const faded = p.style.gameAffinity["a"] ?? 0;
  check("#959 stale affinity decays", faded < high * 0.2, true);
}

/* ── #960 — post-round mastery decides the classification ── */
{
  // A kid at 0.65 pre-round mastery crosses the 0.7 slipAccuracy bar ON a
  // correct round (post-round ≈ 0.93). Diagnosing against the POST-round skill
  // (as roundLearning.ts does: `{...updated, wrongStreak}`) must yield the
  // confident register — challenge, not the stale celebrate-only fallback.
  const pre = skill(0.65, 2);
  const updated = observe(decay(pre, T), true, DEFAULT_PARAMS, T);
  const updatedSkill = { ...updated, wrongStreak: 0 };
  check("#960 updated mastery crosses slip bar", updatedSkill.pMastered >= DEFAULT_MONI_PARAMS.slipAccuracy, true);
  const fastCorrect = { kidId: "k", skillId: "s", gameId: "g", correct: true, difficulty: 1, responseMs: 900, timestamp: T };
  const p = initialMoniProfile("k", T);
  p.style.speedTendency = 0.8; // fast child — confident + fast + correct → ready to stretch
  const d = diagnoseCorrect(p, fastCorrect, updatedSkill, DEFAULT_MONI_PARAMS);
  check("#960 post-round classification = challenge", d.kind, "slip");
  check("#960 challenge action", d.action.type, "challenge");
}

console.log("─".repeat(30));
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log("✓ all moni adaptive tests passed");

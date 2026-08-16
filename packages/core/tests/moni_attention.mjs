#!/usr/bin/env node
/**
 * 🧠 MONI attention — regression test for the #10 attention-threshold fix.
 * Self-contained: runs against the BUILT core (packages/core/dist) with zero
 * deps, so CI can run it bare after `pnpm --filter @numberverse/core build`.
 *
 * The old Math.max(6, …) snapped a strong round-4 threshold straight to 6 and
 * could never recover below 6 — Moni stayed "fatigued" forever after one dip.
 * This test proves the fix: a strong session ends at 4, decays by 1 per round,
 * and fully recovers to null; a genuine late-session accuracy dip still fires
 * a high threshold.
 *
 * Run:  node packages/core/tests/moni_attention.mjs
 */
import { moni, DEFAULT_MONI_PARAMS } from "../dist/index.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const T = 2_000_000; // fixed clock
const skill = (p = 0.5, streak = 0, wrongStreak = 0) => ({
  pMastered: p, streak, correct: Math.round(p * 10), attempts: 10, wrongStreak,
  lastDecay: T,
});
const round = (correct, timestamp, gameId = "g") => ({
  kidId: "k", skillId: "s", gameId, correct, difficulty: 1,
  responseMs: 500, timestamp,
});

const thresholdSeq = [];

/* ── #10-done — a STRONG session ends at 4, then decays 3→2→1→null ── */
{
  let p = moni.initial("k", T);

  // Rounds 1..4 all correct → threshold must be 4, NOT snapped to 6.
  for (let i = 0; i < 4; i++) {
    p = moni.observeRound(p, round(true, T + i), skill(), DEFAULT_MONI_PARAMS, T + i);
  }
  check("strong round-4 threshold === 4 (not snapped to 6)", p.attention.fatigueThreshold, 4);
  thresholdSeq.push(p.attention.fatigueThreshold);

  // Round 5 still strong → must DECAY to 3, not jump to 6.
  p = moni.observeRound(p, round(true, T + 4), skill(), DEFAULT_MONI_PARAMS, T + 4);
  check("strong round-5 threshold decays to 3", p.attention.fatigueThreshold, 3);
  thresholdSeq.push(p.attention.fatigueThreshold);

  // Keep feeding strong rounds: 3 → 2 → 1 → null (fully recovered).
  // All-correct means early === late, so the fatigue branch never re-fires.
  p = moni.observeRound(p, round(true, T + 5), skill(), DEFAULT_MONI_PARAMS, T + 5);
  check("strong round-6 threshold decays to 2", p.attention.fatigueThreshold, 2);
  thresholdSeq.push(p.attention.fatigueThreshold);

  p = moni.observeRound(p, round(true, T + 6), skill(), DEFAULT_MONI_PARAMS, T + 6);
  check("strong round-7 threshold decays to 1", p.attention.fatigueThreshold, 1);
  thresholdSeq.push(p.attention.fatigueThreshold);

  p = moni.observeRound(p, round(true, T + 7), skill(), DEFAULT_MONI_PARAMS, T + 7);
  check("strong round-8 threshold recovers to null", p.attention.fatigueThreshold, null);
  thresholdSeq.push(p.attention.fatigueThreshold);
}

/* ── #10-done — a genuine LATE dip at round 6 still fires a high threshold ── */
{
  let p = moni.initial("k", T);
  // Rounds 1..5 correct, round 6 WRONG (late half) → lateAcc 2/3 < early 1 − 0.15.
  for (let i = 0; i < 5; i++) {
    p = moni.observeRound(p, round(true, T + i), skill(), DEFAULT_MONI_PARAMS, T + i);
  }
  p = moni.observeRound(p, round(false, T + 5), skill(), DEFAULT_MONI_PARAMS, T + 5);
  check("fatigue late-dip fires high threshold (>= 6)", p.attention.fatigueThreshold >= 6, true);
}

console.log("─".repeat(30));
console.log("threshold sequence:", JSON.stringify(thresholdSeq));
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log("✓ all moni attention tests passed");

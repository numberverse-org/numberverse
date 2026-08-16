#!/usr/bin/env node
/**
 * 🧠 BKT adaptive engine — observe()/decay()/nextDifficulty() regression
 * (feed test-coverage-core #0/#1, #1044-audit follow-up).
 * - #0  observe(): 3 consecutive CORRECT rounds from pMastered 0 with
 *   DEFAULT_PARAMS must match the exact Bayes closed form:
 *     pCorrect = p*(1-pSlip)+(1-p)*pGuess
 *     given    = (p*(1-pSlip)) / pCorrect      (correct observation)
 *     pMastered= given + (1-given)*pLearn
 *   Plus the NaN path: degenerate params (pGuess=0, pSlip=0) carry no signal
 *   → the returned pMastered stays FINITE and exactly 0 (unchanged).
 * - #1  decay(): 30 idle days → pMastered = 0.9 * 0.98^30 (exact float);
 *   same-instant now → unchanged state + lastDecay; huge idle → clamps to 0.
 *   nextDifficulty(): empty ladder → 1; mastery 1.0 → last ladder element;
 *   mastery 0 → index 0.
 *
 * Run:  node packages/core/tests/adaptive.mjs
 */
import { initialSkillState, observe, decay, nextDifficulty, DEFAULT_PARAMS } from "../dist/index.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const T = 1_000_000; // fixed clock
const P = DEFAULT_PARAMS;

/* Exact Bayes closed form, computed with the SAME formula as the built engine. */
const bayes = (p, correct) => {
  const pCorrect = p * (1 - P.pSlip) + (1 - p) * P.pGuess;
  const given = correct ? (p * (1 - P.pSlip)) / pCorrect : (p * P.pSlip) / (1 - pCorrect);
  return given + (1 - given) * P.pLearn;
};

/* ── #0 observe() BKT posteriors ── */
{
  let s = initialSkillState("k", "s", T);
  s = observe(s, true, P, T);
  const p1 = s.pMastered; // 0.1
  check("#0 round1 pMastered = pLearn (0.1)", p1, 0.1);
  check("#0 round1 matches Bayes closed form", p1, bayes(0, true));

  s = observe(s, true, P, T);
  const p2 = s.pMastered; // 0.45999999999999996 (math 0.46)
  check("#0 round2 pMastered = given + (1-given)*pLearn (0.46)", p2, bayes(0.1, true));

  s = observe(s, true, P, T);
  const p3 = s.pMastered; // 0.8527272727272727
  check("#0 round3 pMastered matches Bayes closed form", p3, bayes(p2, true));

  /* degenerate params (pGuess=0 & pSlip=0) → pCorrect=0 → no signal → pMastered stays 0 */
  const deg = observe({ ...initialSkillState("k", "s", T), pMastered: 0 }, true,
    { pLearn: 0.1, pGuess: 0, pSlip: 0, decayPerDay: 0.02, masteryThreshold: 0.8 }, T);
  check("#0 degenerate observe() returns FINITE pMastered", Number.isFinite(deg.pMastered), true);
  check("#0 degenerate observe() keeps pMastered exactly 0", deg.pMastered, 0);
}

/* ── #1 decay() boundaries ── */
{
  const dState = { ...initialSkillState("k", "s", T), pMastered: 0.9 };

  // 30 idle days → pMastered = 0.9 * 0.98^30 = 0.49093588744419325 (exact float)
  const d30 = decay(dState, T + 30 * 86_400_000, P);
  check("#1 decay 30d → 0.9 * 0.98^30", d30.pMastered, 0.9 * Math.pow(0.98, 30));

  // same-instant now → early return: unchanged state (same ref), lastDecay untouched
  const same = decay(dState, T, P);
  check("#1 decay same-instant → unchanged state", same, dState);
  check("#1 decay same-instant → lastDecay unchanged", same.lastDecay, T);

  // huge idle → factor underflows → clamp01 → 0
  const huge = decay(dState, T + 365_000 * 86_400_000, P);
  check("#1 decay huge idle → clamps to 0", huge.pMastered, 0);
}

/* ── #1 nextDifficulty() boundaries ── */
{
  const ladder = [3, 4, 5, 6, 8, 10];
  const empty = initialSkillState("k", "s", T);
  check("#1 nextDifficulty empty ladder → 1", nextDifficulty(empty, []), 1);

  const top = { ...initialSkillState("k", "s", T), pMastered: 1.0 };
  check("#1 nextDifficulty mastery 1.0 → last element 10", nextDifficulty(top, ladder), 10);

  const low = { ...initialSkillState("k", "s", T), pMastered: 0 };
  check("#1 nextDifficulty mastery 0 → index 0 (3)", nextDifficulty(low, ladder), 3);
}

console.log("─".repeat(30));
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log("✓ all adaptive tests passed");

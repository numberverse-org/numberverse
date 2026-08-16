#!/usr/bin/env node
/**
 * 🧠 MONI diagnosis — regression tests for feed test-coverage-core #8/#9.
 * Exercises every branch of `diagnose` (fatigue, misconception, gap, guessing,
 * slip, fallback) plus the documented priority order:
 *   fatigue > misconception > gap > guessing > slip.
 *
 * Self-contained: runs against the BUILT core (packages/core/dist) with zero
 * deps.
 *
 * Run:  node packages/core/tests/moni_diagnose.mjs
 */
import {
  diagnose,
  diagnoseCorrect,
  moni,
  DEFAULT_MONI_PARAMS,
} from "../dist/index.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const T = 1_000_000; // fixed clock
const skill = (p = 0.5, wrongStreak = 0) => ({
  pMastered: p, streak: 0, correct: Math.round(p * 10), attempts: 10, wrongStreak,
});

const wrong = (ms = 6000) => ({
  kidId: "k", skillId: "s", gameId: "g", correct: false, difficulty: 1,
  responseMs: ms, timestamp: T,
});

/* ── #8 FATIGUE — deep-session attention collapse, and when it is skipped ── */
{
  // Build the fatigue profile NATURALLY: 5 crisp correct rounds, then 3 slow
  // wrong rounds. observeRound's attention curve records early=1.0, late=0.25
  // and sets fatigueThreshold=6 at sessionRounds=8.
  let p = moni.initial("k", T);
  for (let i = 0; i < 5; i++) {
    p = moni.observeRound(p, { ...wrong(900), correct: true, timestamp: T + i }, skill(), DEFAULT_MONI_PARAMS, T + i);
  }
  for (let i = 5; i < 8; i++) {
    p = moni.observeRound(p, { ...wrong(6000), timestamp: T + i }, skill(0.3), DEFAULT_MONI_PARAMS, T + i);
  }
  check("#8 profile reaches sessionRounds>=8", p.sessionRounds >= 8, true);
  check("#8 attention curve is late-weak", p.attention.lateAccuracy < p.attention.earlyAccuracy - 0.15, true);

  const d = diagnose(p, wrong(6000), skill(0.3), 3, DEFAULT_MONI_PARAMS);
  check("#8 fatigue kind", d.kind, "fatigue");
  check("#8 fatigue action break", d.action.type, "break");
  check("#8 fatigue reviewInDays 1", d.action.reviewInDays, 1);

  // SKIPPED when confident — a kid who knows the skill isn't tired, they slipped.
  const dConf = diagnose(p, wrong(6000), skill(0.9), 3, DEFAULT_MONI_PARAMS);
  check("#8 fatigue skipped when confident", dConf.kind !== "fatigue", true);

  // SKIPPED before 8 session rounds even if late-weak.
  const early = moni.initial("k", T);
  early.sessionRounds = 7;
  early.attention.fatigueThreshold = 6;
  early.attention.earlyAccuracy = 0.9;
  early.attention.lateAccuracy = 0.4;
  const dEarly = diagnose(early, wrong(6000), skill(0.3), 3, DEFAULT_MONI_PARAMS);
  check("#8 fatigue requires sessionRounds>=8", dEarly.kind !== "fatigue", true);

  // SKIPPED when the fatigue threshold has recovered to null.
  const noThresh = moni.initial("k", T);
  noThresh.sessionRounds = 12;
  noThresh.attention.fatigueThreshold = null;
  noThresh.attention.earlyAccuracy = 0.9;
  noThresh.attention.lateAccuracy = 0.4;
  const dNoThresh = diagnose(noThresh, wrong(6000), skill(0.3), 3, DEFAULT_MONI_PARAMS);
  check("#8 fatigue requires non-null threshold", dNoThresh.kind !== "fatigue", true);

  // SKIPPED when not past the threshold (sessionRounds < fatigueThreshold).
  const notPast = moni.initial("k", T);
  notPast.sessionRounds = 8;
  notPast.attention.fatigueThreshold = 10;
  notPast.attention.earlyAccuracy = 0.9;
  notPast.attention.lateAccuracy = 0.4;
  const dNotPast = diagnose(notPast, wrong(6000), skill(0.3), 3, DEFAULT_MONI_PARAMS);
  check("#8 fatigue requires past threshold", dNotPast.kind !== "fatigue", true);
}

/* ── #9 MISCONCEPTION — systematic, repeated error gets the contrast drill ── */
{
  const p = moni.initial("k", T);
  p.misconceptions.push({
    skillId: "s", code: "overcount-1", label: "Counts one too many",
    firstSeen: T, lastSeen: T, occurrences: 2,
  });
  const d = diagnose(p, wrong(3000), skill(0.3), 1, DEFAULT_MONI_PARAMS);
  check("#9 misconception kind", d.kind, "misconception");
  check("#9 misconception action contrast", d.action.type, "contrast");
  check("#9 misconception targetSkillId", d.action.targetSkillId, "s");
  check("#9 misconception difficultyDelta 0", d.action.difficultyDelta, 0);

  // occurrences < misconcOccurrences → NOT yet a misconception.
  const p1 = moni.initial("k", T);
  p1.misconceptions.push({
    skillId: "s", code: "overcount-1", label: "Counts one too many",
    firstSeen: T, lastSeen: T, occurrences: 1,
  });
  const d1 = diagnose(p1, wrong(6000), skill(0.3), 1, DEFAULT_MONI_PARAMS);
  check("#9 misconception needs >=2 occurrences", d1.kind !== "misconception", true);

  // A specific fingerprint code outranks the generic repeated-error entry.
  const p2 = moni.initial("k", T);
  p2.misconceptions.push(
    { skillId: "s", code: "repeated-error", label: "Repeats the same kind of mistake", firstSeen: T, lastSeen: T, occurrences: 4 },
    { skillId: "s", code: "off-by-ten", label: "Off by ten", firstSeen: T, lastSeen: T, occurrences: 2 },
  );
  const d2 = diagnose(p2, wrong(500), skill(0.3), 3, DEFAULT_MONI_PARAMS);
  check("#9 specific fingerprint preferred", d2.kind, "misconception");
  check("#9 specific fingerprint picked", d2.reason.includes("Off by ten"), true);
}

/* ── #9 GAP — slow + unsure → reteach, one tier easier ── */
{
  const d = diagnose(moni.initial("k", T), wrong(6000), skill(0.3), 1, DEFAULT_MONI_PARAMS);
  check("#9 gap kind", d.kind, "gap");
  check("#9 gap action reteach", d.action.type, "reteach");
  check("#9 gap difficultyDelta -1", d.action.difficultyDelta, -1);
  check("#9 gap confidence 0.8", d.confidence, 0.8);
}

/* ── #9 GUESSING — fast + repeated wrongs + not confident → step easier ── */
{
  const d = diagnose(moni.initial("k", T), wrong(900), skill(0.3), 2, DEFAULT_MONI_PARAMS);
  check("#9 guessing kind", d.kind, "guessing");
  check("#9 guessing action easier", d.action.type, "easier");
  check("#9 guessing difficultyDelta -1", d.action.difficultyDelta, -1);
}

/* ── #9 SLIP — fast + confident → slow-down, not a gap ── */
{
  const d = diagnose(moni.initial("k", T), wrong(900), skill(0.9), 0, DEFAULT_MONI_PARAMS);
  check("#9 slip kind", d.kind, "slip");
  check("#9 slip action slow-down", d.action.type, "slow-down");
  check("#9 slip difficultyDelta 0", d.action.difficultyDelta, 0);
}

/* ── #9 FALLBACK — not fast, not slow, confident → generic building gap ── */
{
  const d = diagnose(moni.initial("k", T), wrong(3000), skill(0.9), 0, DEFAULT_MONI_PARAMS);
  check("#9 fallback kind gap", d.kind, "gap");
  check("#9 fallback confidence 0.5", d.confidence, 0.5);
  check("#9 fallback difficultyDelta 0", d.action.difficultyDelta, 0);
}

/* ── #9 PRIORITY — misconception outranks guessing, slip, and gap ── */
{
  const withMis = () => {
    const p = moni.initial("k", T);
    p.misconceptions.push({
      skillId: "s", code: "repeated-error", label: "Repeats the same kind of mistake",
      firstSeen: T, lastSeen: T, occurrences: 2,
    });
    return p;
  };

  // Both misconception AND guessing hold → misconception wins (source order).
  const dGuess = diagnose(withMis(), wrong(500), skill(0.3), 3, DEFAULT_MONI_PARAMS);
  check("#9 misconception outranks guessing", dGuess.kind, "misconception");

  // Both misconception AND slip hold → misconception wins.
  const dSlip = diagnose(withMis(), wrong(500), skill(0.9), 0, DEFAULT_MONI_PARAMS);
  check("#9 misconception outranks slip", dSlip.kind, "misconception");

  // Both misconception AND gap hold (slow + unsure) → misconception wins.
  const dGap = diagnose(withMis(), wrong(6000), skill(0.3), 1, DEFAULT_MONI_PARAMS);
  check("#9 misconception outranks gap", dGap.kind, "misconception");
}

/* ── #9 PRIORITY — fatigue outranks misconception (highest priority) ── */
{
  const p = moni.initial("k", T);
  p.sessionRounds = 10;
  p.attention.fatigueThreshold = 8;
  p.attention.earlyAccuracy = 0.9;
  p.attention.lateAccuracy = 0.4;
  p.misconceptions.push({
    skillId: "s", code: "repeated-error", label: "Repeats the same kind of mistake",
    firstSeen: T, lastSeen: T, occurrences: 3,
  });
  const d = diagnose(p, wrong(6000), skill(0.3), 3, DEFAULT_MONI_PARAMS);
  check("#9 fatigue outranks misconception", d.kind, "fatigue");
}

/* ── diagnoseCorrect sanity (celebrate vs challenge) ── */
{
  const fastChild = moni.initial("k", T);
  fastChild.style.speedTendency = 0.8;
  // Correct but NOT fast → celebrate (challenge requires responseMs < fastMs).
  const celebrate = diagnoseCorrect(fastChild, { ...wrong(6000), correct: true }, skill(0.9), DEFAULT_MONI_PARAMS);
  check("#9 correct + slow confident → celebrate", celebrate.action.type, "celebrate");
  // Correct AND fast + confident + fast child → ready to stretch.
  const challenge = diagnoseCorrect(fastChild, { ...wrong(900), correct: true }, skill(0.9), DEFAULT_MONI_PARAMS);
  check("#9 correct + fast confident fast-child → challenge", challenge.action.type, "challenge");
}

console.log("─".repeat(30));
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log("✓ all moni diagnose tests passed");

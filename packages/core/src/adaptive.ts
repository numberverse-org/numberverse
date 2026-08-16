import type { SkillState } from './types.js';

/**
 * BKT-lite adaptive engine.
 * Tracks P(mastered) per skill using the classic Bayesian Knowledge Tracing update,
 * plus a spaced-repetition decay so mastered skills re-surface over days.
 *
 * Params mirror the `adaptive` config row in Postgres.
 */
export interface AdaptiveParams {
  pLearn: number; // P(learn | not mastered, opportunity)
  pGuess: number; // P(correct | not mastered)
  pSlip: number; // P(wrong | mastered)
  decayPerDay: number; // mastery decay per idle day
  masteryThreshold: number; // P(mastered) >= this → mastered
}

export const DEFAULT_PARAMS: AdaptiveParams = {
  pLearn: 0.1,
  pGuess: 0.15,
  pSlip: 0.1,
  decayPerDay: 0.02,
  masteryThreshold: 0.8,
};

export function initialSkillState(kidId: string, skillId: string, now = Date.now()): SkillState {
  return {
    kidId,
    skillId,
    pMastered: 0,
    correct: 0,
    attempts: 0,
    streak: 0,
    lastPractice: null,
    lastDecay: now,
  };
}

/** Update mastery after one answer. Returns a new state (immutable). */
export function observe(state: SkillState, correct: boolean, params: AdaptiveParams = DEFAULT_PARAMS, now = Date.now()): SkillState {
  const p = state.pMastered;
  // P(observing this answer)
  const pCorrect = p * (1 - params.pSlip) + (1 - p) * params.pGuess;
  // Pathological params (pGuess=0 & pSlip=0, or pMastered at an extreme) make
  // pCorrect 0 or 1 → the Bayes posterior divides by zero → NaN. A degenerate
  // model carries NO signal, so keep mastery unchanged (finite) instead of
  // poisoning the state with NaN. (#1044-audit test-coverage-core #0)
  if (!Number.isFinite(pCorrect) || pCorrect <= 0 || pCorrect >= 1) {
    return {
      ...state,
      pMastered: clamp01(p),
      correct: state.correct + (correct ? 1 : 0),
      attempts: state.attempts + 1,
      streak: correct ? state.streak + 1 : 0,
      lastPractice: now,
      lastDecay: now,
    };
  }
  // Posterior P(mastered | observation) via Bayes
  const pMasteredGiven = correct
    ? (p * (1 - params.pSlip)) / pCorrect
    : (p * params.pSlip) / (1 - pCorrect);
  // Learning opportunity
  const pMastered = pMasteredGiven + (1 - pMasteredGiven) * params.pLearn;

  return {
    ...state,
    pMastered: clamp01(pMastered),
    correct: state.correct + (correct ? 1 : 0),
    attempts: state.attempts + 1,
    streak: correct ? state.streak + 1 : 0,
    lastPractice: now,
    lastDecay: now,
  };
}

/** Apply spaced-repetition decay for idle time. */
export function decay(state: SkillState, now = Date.now(), params: AdaptiveParams = DEFAULT_PARAMS): SkillState {
  const msIdle = now - state.lastDecay;
  const days = Math.max(0, msIdle / 86_400_000);
  if (days === 0) return state;
  const factor = Math.pow(1 - params.decayPerDay, days);
  return { ...state, pMastered: clamp01(state.pMastered * factor), lastDecay: now };
}

export function isMastered(state: SkillState, params: AdaptiveParams = DEFAULT_PARAMS): boolean {
  return state.pMastered >= params.masteryThreshold;
}

/**
 * Pick a difficulty VALUE for the given ladder, targeting ~targetSuccess
 * success (level chosen by current mastery). The ladder is ordered
 * easiest→hardest BY INDEX (per GameConfig), so `levels` may ascend OR
 * descend in value — the engine only ever maps mastery onto the index.
 * Returns `1` for an EMPTY ladder (no GAME ships one today; 1 is a safe
 * neutral default that callers round-tripping via `ladder.indexOf(1)` land
 * on index 0).
 */
export function nextDifficulty(state: SkillState, levels: number[], targetSuccess = 0.8): number {
  if (levels.length === 0) return 1;
  // Map mastery [0..1] to level index, but bias slightly below the target
  // so kids stay in their zone of proximal development (~80% success).
  const t = Math.min(1, state.pMastered / targetSuccess);
  const idx = Math.round(t * (levels.length - 1));
  return levels[Math.min(Math.max(idx, 0), levels.length - 1)];
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

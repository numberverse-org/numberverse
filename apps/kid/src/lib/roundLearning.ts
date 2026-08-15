/**
 * #787 — single-responsibility learning-model helpers for the `addEvent`
 * store action. Pure + deterministic: the store passes in the current
 * skill/profile state and this module returns the observed next state.
 */
import {
  observe,
  decay,
  DEFAULT_PARAMS,
  moni,
  DEFAULT_MONI_PARAMS,
  type SkillState,
  type MoniProfile,
  type MoniDiagnosis,
  type Misconception,
} from "@numberverse/core";
import type { RoundResult } from "../store";

export interface RoundLearning {
  /** BKT-lite skill state after this round. */
  updated: SkillState;
  /** Moni profile after observing this round. */
  moniNext: MoniProfile;
  /** Moni's classification/treatment for the round. */
  diag: MoniDiagnosis;
  /** The skill's detected misconception, if any. */
  mis: Misconception | undefined;
}

export function observeRoundLearning(
  kidId: string,
  e: RoundResult,
  prev: SkillState,
  moniPrev: MoniProfile,
  wrongStreak: number,
  now: number,
): RoundLearning {
  const updated = observe(decay(prev, now), e.correct, DEFAULT_PARAMS, now);
  const round = {
    kidId,
    skillId: e.skillId,
    gameId: e.gameId,
    correct: e.correct,
    difficulty: e.difficulty,
    responseMs: e.responseMs,
    timestamp: now,
  };
  const moniNext = moni.observeRound(moniPrev, round, { ...prev, wrongStreak }, DEFAULT_MONI_PARAMS, now);
  const diag = e.correct
    ? moni.diagnoseCorrect(moniPrev, round, { ...prev, wrongStreak }, DEFAULT_MONI_PARAMS)
    : moni.diagnose(moniPrev, round, { ...prev, wrongStreak }, wrongStreak, DEFAULT_MONI_PARAMS);
  const mis = moniNext.misconceptions?.find((m) => m.skillId === e.skillId);
  return { updated, moniNext, diag, mis };
}

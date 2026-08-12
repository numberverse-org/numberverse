/**
 * 🧠 MONI (মণি — precious gem)
 * The tiny per-child tutor model for Numberverse.
 *
 * Usage:
 *   import { moni } from "@numberverse/core";
 *   const p = moni.observeRound(profile, round, skill, params);
 *   const d = moni.diagnose(profile, round, skill, wrongStreak, params);
 *   const plan = moni.plan(profile, mastery, catalog, params);
 */
export * from "./types.js";
export * from "./diagnose.js";
export * from "./profile.js";
export * from "./planner.js";

import {
  initialMoniProfile,
  observeRound,
  observeWrong,
  endSession,
  recordMisconception,
} from "./profile.js";
import { diagnose, diagnoseCorrect } from "./diagnose.js";
import { plan } from "./planner.js";
import type { MoniProfile, MoniParams } from "./types.js";

export const moni = {
  initial: initialMoniProfile,
  observeRound,
  observeWrong,
  endSession,
  recordMisconception,
  diagnose,
  diagnoseCorrect,
  plan,
  // convenience: a fresh empty profile
  empty: (kidId: string): MoniProfile => initialMoniProfile(kidId),
};

export type { MoniProfile, MoniParams };

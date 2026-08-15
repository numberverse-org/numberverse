/**
 * 🧠 MONI — diagnosis.
 * Turns one round + the child's profile + skill mastery into a classification
 * (slip / gap / misconception / fatigue / guessing) and the treatment.
 */

import type { MoniProfile, MoniRound, MoniDiagnosis, MoniParams, SkillMasteryLike } from "./types.js";
import { DEFAULT_MONI_PARAMS } from "./types.js";

/** The current per-skill wrong streak Moni tracks. */
export interface SkillWrongStreaks {
  [skillId: string]: number;
}

/**
 * Classify a wrong round.
 * Priority: fatigue > misconception > gap > guessing > slip.
 */
export function diagnose(
  profile: MoniProfile,
  round: MoniRound,
  skill: SkillMasteryLike | null,
  wrongStreak: number,
  params: MoniParams = DEFAULT_MONI_PARAMS,
): MoniDiagnosis {
  const fast = round.responseMs < params.fastMs;
  // Treat falsy/NaN responseMs (sentinel for "tap, not a round") as slow
  // so wrong taps are never misclassified as fast guesses.
  const slow = !(Number.isFinite(round.responseMs) && round.responseMs > 0) || round.responseMs > params.slowMs;
  const confident = (skill?.pMastered ?? 0) >= params.slipAccuracy;

  // 1. FATIGUE — deep into a long session AND late-session accuracy is poor.
  if (profile.sessionRounds >= 8 && profile.attention.fatigueThreshold !== null) {
    const past = profile.sessionRounds >= profile.attention.fatigueThreshold;
    const lateWeak = profile.attention.lateAccuracy < profile.attention.earlyAccuracy - 0.15;
    if (past && lateWeak && !confident) {
      return {
        kind: "fatigue",
        confidence: 0.7,
        reason: `Attention faded after ${profile.sessionRounds} rounds — this is tiredness, not a gap.`,
        action: {
          type: "break",
          message: "You've been brilliant! Let's rest and come back fresh. 🌙",
          reviewInDays: 1,
        },
      };
    }
  }

  // 2. MISCONCEPTION — a systematic error on a skill we've seen before.
  // Prefer the SPECIFIC fingerprint code (overcount-1, off-by-ten…) over the
  // generic "repeated-error" so the contrast drill names the real pattern.
  const mis = profile.misconceptions
    .filter((m) => m.skillId === round.skillId)
    .sort((a, b) => (a.code === "repeated-error" ? 1 : 0) - (b.code === "repeated-error" ? 1 : 0))[0];
  if (mis && mis.occurrences >= params.misconcOccurrences) {
    return {
      kind: "misconception",
      confidence: 0.85,
      reason: `A pattern keeps repeating — "${mis.label}". It needs a targeted contrast drill, not more repetition.`,
      action: {
        type: "contrast",
        message: `Let's look at these side by side — ${mis.label} is a sneaky trick and we'll beat it! 🎯`,
        targetSkillId: round.skillId,
        difficultyDelta: 0,
        gameId: round.gameId,
        reviewInDays: 1,
      },
    };
  }

  // 3. GAP — slow + not yet confident → they genuinely don't know this.
  if (slow && !confident) {
    return {
      kind: "gap",
      confidence: 0.8,
      reason: "Slow and unsure — this concept isn't solid yet. It needs to be taught again, in a new way.",
      action: {
        type: "reteach",
        message: "Let's learn this again together — a different way this time. You'll get it! 💡",
        targetSkillId: round.skillId,
        difficultyDelta: -1,
        reviewInDays: 1,
      },
    };
  }

  // 4. GUESSING — fast, wrong, repeated wrongs, and not confident → disengaged.
  if (fast && wrongStreak >= 2 && !confident) {
    return {
      kind: "guessing",
      confidence: 0.65,
      reason: "Fast wrong answers with no confidence — the child is guessing, likely bored or distracted.",
      action: {
        type: "easier",
        message: "Let's step back to a level that feels easy and fun again. 🧸",
        targetSkillId: round.skillId,
        difficultyDelta: -1,
        gameId: round.gameId,
      },
    };
  }

  // 5. SLIP — they know it (confident), just rushed/careless.
  if (fast && confident) {
    return {
      kind: "slip",
      confidence: 0.75,
      reason: "Fast answer, but this skill is already solid — a careless slip, not a knowledge gap.",
      action: {
        type: "slow-down",
        message: "You know this! Take a breath and show me — slowly. ⏳",
        targetSkillId: round.skillId,
        difficultyDelta: 0,
        reviewInDays: 3,
      },
    };
  }

  // Fallback: probably still consolidating.
  return {
    kind: "gap",
    confidence: 0.5,
    reason: "Still building this one — keep going, it's coming together.",
    action: {
      type: "reteach",
      message: "Almost there — let's try once more together. 🌱",
      targetSkillId: round.skillId,
      difficultyDelta: 0,
      reviewInDays: 1,
    },
  };
}

/** Diagnose a CORRECT round — usually celebrate, sometimes challenge. */
export function diagnoseCorrect(
  profile: MoniProfile,
  round: MoniRound,
  skill: SkillMasteryLike | null,
  params: MoniParams = DEFAULT_MONI_PARAMS,
): MoniDiagnosis {
  // Confident, on a roll, and fast → they're ready for a challenge.
  const confident = (skill?.pMastered ?? 0) >= params.slipAccuracy;
  if (confident && profile.style.speedTendency > 0.6 && round.responseMs < params.fastMs) {
    return {
      kind: "slip",
      confidence: 0.6,
      reason: "Correct, fast, and confident — this child is ready to stretch.",
      action: {
        type: "challenge",
        message: "Too easy?! Let's try a bigger one. 🚀",
        targetSkillId: round.skillId,
        difficultyDelta: 1,
      },
    };
  }
  return {
    kind: "gap",
    confidence: 1,
    reason: "Correct!",
    action: {
      type: "celebrate",
      message: "Yes! Beautiful work! 🌟",
      targetSkillId: round.skillId,
      difficultyDelta: 0,
    },
  };
}

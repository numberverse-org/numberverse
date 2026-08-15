/**
 * 🧠 MONI — the planner.
 * Turns a child's profile + all their skill mastery into ONE next move:
 * what skill, what difficulty, which game, what tone, how long, and when to
 * review. The child is the curriculum — Moni never jumps ahead of them.
 */

import type {
  MoniProfile,
  MoniPlan,
  MoniParams,
  MoniStrictness,
  SkillMasteryLike,
} from "./types.js";

/** A skill Moni knows about (from the app's SKILLS catalogue). */
export interface CatalogSkill {
  id: string;
  band: number;
  game: string;
  /** Parent skill a child should know before this one (id). */
  dependsOn?: string[];
}

/** Full mastery map: skillId → mastery state (with wrongStreak). */
export type MasteryMap = Record<string, SkillMasteryLike>;

/**
 * Build the next learning move for a child.
 * @param profile   Moni's profile for this child
 * @param mastery   every skill's mastery state
 * @param catalog   the skills catalogue (id → skill)
 * @param difficultyFor  how the app maps a skill to its current difficulty level
 * @param perSkillDeltas  optional #1047 map skillId → signed difficulty-level
 *                        offset layered on top of strictness (parent subject
 *                        steppers, kid's too-easy/too-hard feedback)
 */
export function plan(
  profile: MoniProfile,
  mastery: MasteryMap,
  catalog: Record<string, CatalogSkill>,
  params: MoniParams,
  strictness?: MoniStrictness,
  now?: number,
  perSkillDeltas?: Record<string, number>,
): MoniPlan {
  const entries = Object.entries(catalog);

  // Confidence/tone: fragile + low recovery → gentle; confident + fast → challenging.
  // A parent-set strictness (#333) OVERRIDES Moni's automatic tone.
  const fragile = profile.confidence.fragile || profile.confidence.recoveryRate < 0.4;
  const sharp = profile.confidence.recoveryRate > 0.7 && profile.style.speedTendency > 0.6;
  const autoTone: MoniPlan["tone"] = fragile ? "gentle" : sharp ? "challenging" : "steady";
  const tone: MoniPlan["tone"] = strictness ?? autoTone;

  // Weak skills: low mastery + low confidence in them. Pick the weakest that
  // is also "next" in its band (a real gap, not a skill way above their level).
  const weak = entries
    .map(([id, skill]) => {
      const m = mastery[id];
      if (!m) return null;
      const strength = m.pMastered;
      return { id, skill, strength, reason: strength < 0.4 ? "still building" : "shaky" };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter((x) => x.strength < 0.5)
    .sort((a, b) => a.strength - b.strength);

  // Misconceptions beat everything — target the most recent confirmed one.
  const activeMis = profile.misconceptions
    .filter((m) => (mastery[m.skillId]?.pMastered ?? 1) < 0.8)
    .sort((a, b) => b.lastSeen - a.lastSeen)[0];

  // Spaced review (#328): per-skill, confidence-based intervals.
  // A mastered skill refreshes after 1/3/7/14 days depending on how SOLID the
  // child is at it (mastery × consistency), weighted down when the child is
  // globally fragile. Skills past their due date land in `dueReviews` (gentle
  // prompt to review NOW); the rest stay in `reviewSchedule` (upcoming).
  const DAY_MS = 86_400_000;
  const nowMs = now ?? Date.now();
  const reviewSchedule: { skillId: string; inDays: number }[] = [];
  const dueReviews: { skillId: string; inDays: number; overdueDays: number }[] = [];
  for (const [id, m] of Object.entries(mastery)) {
    if (m.pMastered < 0.8) continue;
    const interval = reviewIntervalDays(m, profile, params);
    const last = m.lastPractice ?? 0;
    if (last === 0) {
      // No practice timestamp yet — treat as due for a first refresh.
      dueReviews.push({ skillId: id, inDays: 0, overdueDays: 0 });
      continue;
    }
    const dueAt = last + interval * DAY_MS;
    if (nowMs >= dueAt) {
      dueReviews.push({
        skillId: id,
        inDays: 0,
        overdueDays: Math.max(0, Math.floor((nowMs - dueAt) / DAY_MS)),
      });
    } else {
      reviewSchedule.push({ skillId: id, inDays: Math.max(1, Math.ceil((dueAt - nowMs) / DAY_MS)) });
    }
  }
  dueReviews.sort((a, b) => b.overdueDays - a.overdueDays);
  reviewSchedule.sort((a, b) => a.inDays - b.inDays);

  // ── Pick the focus ──
  let focusSkillId: string;
  let focusReason: string;
  let difficultyDelta = 0;

  if (activeMis) {
    focusSkillId = activeMis.skillId;
    focusReason = `Fixing "${activeMis.label}" — a specific pattern that needs a contrast drill.`;
    difficultyDelta = 0;
  } else if (weak.length > 0) {
    focusSkillId = weak[0].id;
    focusReason = `${weak[0].reason}: ${weak[0].skill.id} needs work.`;
    difficultyDelta = -1;
  } else {
    // Everything solid → pick the lowest-mastery skill within the child's
    // reachable band (current band +1) so Moni never jumps ahead.
    const childBand = childsCurrentBand(mastery, catalog);
    const reachable = entries
      .map(([id, skill]) => ({ id, skill, m: mastery[id] }))
      .filter((x) => x.m && x.skill.band <= childBand + 1);
    const lowest = reachable.length
      ? reachable.sort((a, b) => (a.m?.pMastered ?? 1) - (b.m?.pMastered ?? 1))[0]
      : null;
    focusSkillId = lowest?.id ?? entries[0]?.[0] ?? "count-1-10";
    focusReason = "Everything's solid — let's keep the momentum with the next challenge.";
    difficultyDelta = 1;
  }

  const cat = catalog[focusSkillId];
  const gameId = cat?.game ?? profile.style.bestGame ?? "game-countpop";
  const m = mastery[focusSkillId];

  // Parent-set strictness (#333) pushes the difficulty one step further in the
  // chosen direction (on top of whatever the focus selection already implied).
  const strictnessDelta = strictness === "gentle" ? -1 : strictness === "challenging" ? 1 : 0;
  // #1047 — per-skill difficulty offset (#1044 parent subject steppers, #1048
  // kid's "too easy/too hard"): a map of skillId → signed level delta layered
  // on top of the global strictness so one area can be gentler/harder without
  // pushing the whole kid. Absent skill → 0 (no-op).
  const skillDelta = perSkillDeltas?.[focusSkillId] ?? 0;
  const difficulty = Math.max(1, (m ? currentDifficulty(m) : 1) + difficultyDelta + strictnessDelta + skillDelta);

  // Session length hint from attention (default 12).
  const sessionLengthHint = profile.attention.fatigueThreshold ?? 12;

  // Top-3 practice goals for parents: the focus first, then the next weakest
  // skills, then anything due for spaced review — capped at 3, most urgent
  // first. reasonCode → localized phrase in the UI; reason is the plain line.
  const recommendations: MoniPlan["recommendations"] = [
    { skillId: focusSkillId, reasonCode: "focus", reason: focusReason },
  ];
  for (const w of weak) {
    if (recommendations.length >= 3) break;
    if (w.id === focusSkillId) continue;
    recommendations.push({
      skillId: w.id,
      reasonCode: "weak",
      reason: `${w.reason}: ${w.skill.id} needs work.`,
    });
  }
  // Due reviews first — they're the most urgent (gentle prompt, "no rush").
  for (const d of dueReviews) {
    if (recommendations.length >= 3) break;
    if (recommendations.some((x) => x.skillId === d.skillId)) continue;
    recommendations.push({
      skillId: d.skillId,
      reasonCode: "review",
      reason: "Due for a quick review — a minute keeps it sharp.",
      inDays: 0,
    });
  }
  for (const r of reviewSchedule) {
    if (recommendations.length >= 3) break;
    if (recommendations.some((x) => x.skillId === r.skillId)) continue;
    recommendations.push({
      skillId: r.skillId,
      reasonCode: "review",
      reason: `Brush up in ${r.inDays} days to keep it solid.`,
      inDays: r.inDays,
    });
  }

  const summary = summarize(profile, focusSkillId, focusReason, tone, gameId, sessionLengthHint);

  return {
    focusSkillId,
    focusReason,
    difficulty,
    gameId,
    tone,
    sessionLengthHint,
    reviewSchedule: reviewSchedule.slice(0, 3),
    dueReviews: dueReviews.slice(0, 5),
    recommendations,
    summary,
  };
}

/** Confidence-based review interval (#328) — per-skill, child-aware.
 *  Ladder: [1, 3, 7, 14] days. A skill's own solidity (mastery × streak
 *  consistency) picks the rung; a fragile child (low recoveryRate) pulls
 *  every interval a rung shorter so skills resurface sooner. */
function reviewIntervalDays(m: SkillMasteryLike, profile: MoniProfile, params: MoniParams): number {
  const perSkill = m.pMastered * (0.5 + 0.5 * Math.min(1, m.streak / 5));
  const ladder = params.reviewDays;
  // Pick rung from per-skill solidity alone.
  const rawIdx = perSkill >= 0.95 ? 3 : perSkill >= 0.8 ? 2 : perSkill >= 0.6 ? 1 : 0;
  // Fragile child (low recoveryRate) shifts one rung SHORTER so skills
  // resurface sooner; sharp child (high recoveryRate) shifts one rung LONGER.
  const shift = profile.confidence.recoveryRate < 0.4 ? -1 : profile.confidence.recoveryRate > 0.7 ? 1 : 0;
  const idx = Math.max(0, Math.min(ladder.length - 1, rawIdx + shift));
  return ladder[idx] ?? 1;
}

/** Derive a rough current difficulty tier from mastery. */
function currentDifficulty(m: SkillMasteryLike): number {
  return Math.max(1, Math.round(m.pMastered * 5));
}

/** Estimate the child's current band: the highest catalog-band where at least
 *  one skill has reached moderate mastery (>= 0.5). Defaults to band 1. */
function childsCurrentBand(
  mastery: MasteryMap,
  catalog: Record<string, CatalogSkill>,
): number {
  let band = 1;
  for (const [id, skill] of Object.entries(catalog)) {
    const m = mastery[id];
    if (m && m.pMastered >= 0.5 && skill.band > band) {
      band = skill.band;
    }
  }
  return band;
}

function summarize(
  profile: MoniProfile,
  focusSkillId: string,
  focusReason: string,
  tone: MoniPlan["tone"],
  gameId: string,
  sessionLengthHint: number,
): string {
  const fragile = profile.confidence.fragile ? " They learn best in short, kind sessions." : "";
  const best = profile.style.bestGame ? ` Their favorite game is ${profile.style.bestGame}.` : "";
  return (
    `Moni's next move: practice "${focusSkillId}". ${focusReason}` +
    ` Tone: ${tone}. Suggested session: ~${sessionLengthHint} rounds.` +
    `${best}${fragile}`
  );
}

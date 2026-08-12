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
 */
export function plan(
  profile: MoniProfile,
  mastery: MasteryMap,
  catalog: Record<string, CatalogSkill>,
  params: MoniParams,
): MoniPlan {
  const entries = Object.entries(catalog);

  // Confidence/tone: fragile + low recovery → gentle; confident + fast → challenging.
  const fragile = profile.confidence.fragile || profile.confidence.recoveryRate < 0.4;
  const sharp = profile.confidence.recoveryRate > 0.7 && profile.style.speedTendency > 0.6;
  const tone: MoniPlan["tone"] = fragile ? "gentle" : sharp ? "challenging" : "steady";

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

  // Spaced review: skills mastered but due for a refresh.
  const reviewSchedule: { skillId: string; inDays: number }[] = [];
  for (const [id, m] of Object.entries(mastery)) {
    if (m.pMastered >= 0.8) reviewSchedule.push({ skillId: id, inDays: params.reviewDays[0] });
  }

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
    // Everything solid → pick the lowest-mastery skill to keep moving forward.
    const lowest = entries
      .map(([id, skill]) => ({ id, skill, m: mastery[id] }))
      .filter((x) => x.m)
      .sort((a, b) => (a.m?.pMastered ?? 1) - (b.m?.pMastered ?? 1))[0];
    focusSkillId = lowest?.id ?? entries[0]?.[0] ?? "count-1-10";
    focusReason = "Everything's solid — let's keep the momentum with the next challenge.";
    difficultyDelta = 1;
  }

  const cat = catalog[focusSkillId];
  const gameId = cat?.game ?? profile.style.bestGame ?? "game-countpop";
  const m = mastery[focusSkillId];
  const difficulty = Math.max(1, (m ? currentDifficulty(m) : 1) + difficultyDelta);

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
    recommendations,
    summary,
  };
}

/** Derive a rough current difficulty tier from mastery. */
function currentDifficulty(m: SkillMasteryLike): number {
  return Math.max(1, Math.round(m.pMastered * 5));
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

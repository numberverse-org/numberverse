/**
 * 🧠 MONI — learning-style classifier (#332).
 *
 * Turns the per-child style signals Moni already tracks (speed, game
 * affinity) into ONE kid-facing badge: ⚡ fast / 🐢 steady / 🦉 social.
 * Pure, deterministic, offline — the same answer every time for the same
 * child, no cloud.
 *
 *   - fast   : answers quickly, clearly zippy (speedTendency > 0.6)
 *   - social : not zippy, but engaged across MANY games (variety-seeker —
 *              likes trying everything / "playing with everyone")
 *   - steady : everything else — careful, methodical, focused
 */

import type { MoniStyle } from "./types.js";

/** Kid-facing learning-style badge category. */
export type LearningStyle = "fast" | "steady" | "social";

/** How many games need real affinity before we call a kid a variety-seeker. */
const SOCIAL_BREADTH = 4;
/** Engagement bar a game must clear to count toward breadth. */
const AFFINITY_MIN = 0.15;

/** Classify how this child learns, from their Moni style signals. */
export function deriveLearningStyle(style: MoniStyle): LearningStyle {
  if (style.speedTendency > 0.6) return "fast";
  const breadth = Object.values(style.gameAffinity).filter((a) => a >= AFFINITY_MIN).length;
  if (breadth >= SOCIAL_BREADTH) return "social";
  return "steady";
}

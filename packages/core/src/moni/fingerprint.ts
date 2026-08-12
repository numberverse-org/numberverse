/**
 * 🖐️ MONI — per-skill error fingerprinting (issue #335).
 *
 * A wrong TAP only carries the value the kid chose. This detector clusters
 * that value against the correct one into a recognizable misconception code,
 * so "picks 8 when the answer is 7" becomes `overcount-1` (counts one too
 * many) instead of a generic "repeated error".
 *
 * Pure + deterministic: the same (correct, wrong) always gives the same code.
 * Only fires on NUMERIC answers — language/letter games (where values are
 * strings or symbols) never match, so no false positives.
 */

/** A recognized wrong-answer pattern. */
export interface MisconceptionFingerprint {
  /** Stable machine id, e.g. "overcount-1", "off-by-ten". */
  code: string;
  /** Friendly label for parents + Moni's contrast-drill copy. */
  label: string;
}

/** Single-digit mirror pairs — the classic reversal confusion. */
const REVERSAL: Record<number, number> = { 6: 9, 9: 6, 2: 5, 5: 2, 8: 3, 3: 8 };

/**
 * Fingerprint a wrong answer against the correct one.
 * @returns the recognized misconception, or null when there's no recognizable
 *          pattern (random guess, non-numeric answer, unknown shape).
 */
export function fingerprintAnswer(
  skillId: string,
  correct: unknown,
  wrong: unknown,
): MisconceptionFingerprint | null {
  if (typeof correct !== "number" || typeof wrong !== "number") return null;
  if (!Number.isFinite(correct) || !Number.isFinite(wrong)) return null;
  const c = correct;
  const w = wrong;

  // One off — overcount / undercount (counting games, fruit totals).
  if (w === c + 1) return { code: "overcount-1", label: "Counts one too many" };
  if (w === c - 1) return { code: "undercount-1", label: "Counts one too few" };

  // Place-value mix-ups.
  if (Math.abs(w - c) === 10) return { code: "off-by-ten", label: "Off by ten — tens/ones mix-up" };
  if (Math.abs(w - c) === 100) return { code: "off-by-hundred", label: "Off by one hundred — place mix-up" };

  // Double / half (addition vs multiplication confusion).
  if (c !== 0 && w === 2 * c) return { code: "double", label: "Doubles the number" };
  if (c !== 0 && w === c / 2) return { code: "half", label: "Halves the number" };

  // Single-digit mirror reversal (6↔9, 2↔5, 8↔3) — letters/shapes not at play.
  if (c >= 0 && c <= 9 && w >= 0 && w <= 9 && REVERSAL[c] === w) {
    return { code: "reversal", label: "Writes the digit the wrong way round" };
  }

  // Sum vs product: "3+4" answered as 12 (3×4) — classic operation flip.
  // (Only meaningful when the caller encodes the operands in the skill id;
  // here we keep it value-based: wrong === c * a small guess is too noisy, so
  // we DON'T infer operations from the answer alone — honest + safe.)
  void skillId;
  return null;
}

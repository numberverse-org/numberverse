/**
 * 🎭 FRAMING — question-variation anti-boredom (issue #337).
 *
 * The same question type can be phrased ≥3 ways. Every round, scenes call
 * `frameText()` with their base key; the helper picks a variant DETERMINISTICALLY
 * from (skillId + round) so:
 *   - a kid never sees the same phrasing two rounds in a row
 *   - the SAME skill+round always gives the SAME variant (no random jitter,
 *     no "why did it change when I restarted?" confusion)
 *   - un-framed keys degrade gracefully to the original copy
 *
 * The FRAME_BANK references variants via lazy t() arrows (each holding the
 * literal variant key) so the audit's i18n completeness check sees them as
 * used, and the right language resolves at call time (never at module load).
 */

import { t, type TVars } from "./i18n";

/** Variant i18n keys per base key, most-repeated prompts first. ≥3 each. */
const FRAME_BANK: Record<string, Array<() => string>> = {
  // Fruit add — "how many fruit in all?"
  howManyFruit: [
    () => t("howManyFruit1"),
    () => t("howManyFruit2"),
    () => t("howManyFruit3"),
  ],
  // Fruit add / story problems — "how many in all?"
  howManyInAll: [
    () => t("howManyInAll1"),
    () => t("howManyInAll2"),
    () => t("howManyInAll3"),
  ],
  // Number bonds — "how many more make 10?"
  howManyMore: [
    () => t("howManyMore1"),
    () => t("howManyMore2"),
    () => t("howManyMore3"),
  ],
  // Count & Pop — "Round N · tap X numbers"
  roundTap: [
    () => t("roundTap1"),
    () => t("roundTap2"),
    () => t("roundTap3"),
  ],
  // Count to 100 / Build to 999 — "Round N · make X"
  count100Round: [
    () => t("count100Round1"),
    () => t("count100Round2"),
    () => t("count100Round3"),
  ],
};

/** A stable hash of a skill id, so different skills drift through variants. */
function hashSkill(skillId: string): number {
  let h = 0;
  for (let i = 0; i < skillId.length; i++) h = (h * 31 + skillId.charCodeAt(i)) >>> 0;
  return h;
}

/** 0-based variant index for a skill+round. */
export function frameIndex(skillId: string, round: number, variantCount: number): number {
  return (hashSkill(skillId) + Math.max(0, round)) % variantCount;
}

/**
 * The framed copy for `baseKey` this round — a variant string if one exists,
 * else the original. `vars` interpolate into BOTH the variant and the fallback.
 */
export function frameText(
  baseKey: string,
  skillId: string,
  round: number,
  vars: TVars = {},
): string {
  const bank = FRAME_BANK[baseKey];
  if (!bank || bank.length < 2) return t(baseKey, vars);
  const pick = bank[frameIndex(skillId, round, bank.length)];
  return pick ? pick() : t(baseKey, vars);
}

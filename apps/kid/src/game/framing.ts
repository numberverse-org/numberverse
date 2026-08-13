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

/** Variant i18n keys per base key, most-repeated prompts first. ≥3 each.
 *  Each arrow takes the round's `vars` so placeholder-bearing variants
 *  ("Round {n} · tap {count} numbers") actually interpolate — a variant that
 *  dropped vars would render its braces literally ("Round {n}"). */
const FRAME_BANK: Record<string, Array<(vars?: TVars) => string>> = {
  // Fruit add — "how many fruit in all?"
  howManyFruit: [
    (vars) => t("howManyFruit1", vars),
    (vars) => t("howManyFruit2", vars),
    (vars) => t("howManyFruit3", vars),
  ],
  // Fruit add / story problems — "how many in all?"
  howManyInAll: [
    (vars) => t("howManyInAll1", vars),
    (vars) => t("howManyInAll2", vars),
    (vars) => t("howManyInAll3", vars),
  ],
  // Number bonds — "how many more make 10?"
  howManyMore: [
    (vars) => t("howManyMore1", vars),
    (vars) => t("howManyMore2", vars),
    (vars) => t("howManyMore3", vars),
  ],
  // Count & Pop — "Round N · tap X numbers"
  roundTap: [
    (vars) => t("roundTap1", vars),
    (vars) => t("roundTap2", vars),
    (vars) => t("roundTap3", vars),
  ],
  // Count to 100 / Build to 999 — "Round N · make X"
  count100Round: [
    (vars) => t("count100Round1", vars),
    (vars) => t("count100Round2", vars),
    (vars) => t("count100Round3", vars),
  ],
  // Odd & even — "Odd or even?"
  oddEvenPrompt: [
    (vars) => t("oddEvenPrompt1", vars),
    (vars) => t("oddEvenPrompt2", vars),
    (vars) => t("oddEvenPrompt3", vars),
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
  return pick ? pick(vars) : t(baseKey, vars);
}

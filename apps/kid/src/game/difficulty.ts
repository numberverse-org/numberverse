/**
 * Shared difficulty-ramp helpers for the config-driven engines and their
 * standalone siblings (#1056/#1057/#1058/#1059/#1060).
 *
 * Before this module, every engine indexed `ladder[Math.min(level, len-1)]` and
 * ran an unconditional `levelIndex++` per round: sessions past level 5-6 were
 * byte-identical (queue size frozen at the ladder ceiling, tier filter frozen
 * at its 3-band step, difficulty never easing back mid-scene). These pure
 * helpers turn level into a real ramp again:
 *
 *   ladderValue    — ladder[level] inside the ladder, +1/level past the ceiling
 *                    (a level past 6 is never identical to the one before it)
 *   poolTierFor    — the item tier whose cumulative pool reaches the requested
 *                    queue size (demand-driven tier opening, not a 3-band step)
 *   roundsForLevel — the "rounds to finish" grows with the adaptive level
 *   nextLevelIndex — live success-rate ramp (two clean → step up, two missed →
 *                    ease back) instead of the fixed +1 per round
 *   timeForLevel   — optional shrinking-time window for a level (shared ramp;
 *                    returns null when the scene is untimed)
 */

/** #1056 — the queue size a level wants. Exact ladder entry inside the ladder;
 *  past the ceiling it keeps growing +1 per level so rounds past level 5-6 are
 *  never byte-identical. */
export function ladderValue(ladder: number[], level: number): number {
  if (ladder.length === 0) return 0;
  if (level < ladder.length) return ladder[level];
  return ladder[ladder.length - 1] + (level - (ladder.length - 1));
}

/** #1056 — the item tier whose cumulative count reaches the requested queue
 *  size. Opens each tier exactly when demand exceeds the current pool, so the
 *  ramp is continuous (the old filter `levelIndex < 2 ? 1 : < 4 ? 2 : 3` left
 *  levels 4+ indistinguishable). `byTier` is [tier1 count, tier2, tier3]. */
export function poolTierFor(want: number, byTier: [number, number, number]): number {
  let cum = 0;
  for (let t = 0; t < 3; t++) {
    cum += byTier[t];
    if (cum >= want) return t + 1;
  }
  return 3;
}

/** #1057 — rounds-to-finish grows with the adaptive level (the config `rounds`
 *  is the easiest-level base), so a "chapter" lengthens as difficulty rises. */
export function roundsForLevel(base: number, level: number): number {
  return Math.max(1, base + Math.floor(level / 2));
}

/** #1059 — in-scene adaptive ramp driven by live success: two clean rounds in a
 *  row → step up two, one clean → step up one, one missed → stay (the kid is
 *  right at their edge), two missed in a row → ease back one (floor 0). This
 *  replaces the fixed `levelIndex++` that ignored how the kid was actually
 *  doing once the scene loaded. */
export function nextLevelIndex(current: number, perfectStreak: number, imperfectStreak: number): number {
  if (perfectStreak >= 2) return current + 2;
  if (perfectStreak === 1) return current + 1;
  if (imperfectStreak >= 2) return Math.max(0, current - 1);
  return current;
}

/** #1058 — optional shrinking-time window for a level (an ms ladder like
 *  [10000, 9000, 8000, 7000, 6000, 5000]). Absent/empty ladder → null (untimed).
 *  Past the ceiling the window keeps tightening toward `floorMs` so higher
 *  difficulty always stays distinct. */
export function timeForLevel(ladder: number[] | undefined, level: number, floorMs = 4500): number | null {
  if (!ladder || ladder.length === 0) return null;
  if (level < ladder.length) return ladder[level] ?? null;
  const last = ladder[ladder.length - 1] ?? 0;
  const shrink = (level - (ladder.length - 1)) * 500;
  return Math.max(floorMs, last - shrink);
}

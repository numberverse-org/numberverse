/**
 * #787 — single-responsibility ledger/outbox builders for the `addEvent`
 * store action. Pure value transforms: the store owns state + genUid, these
 * builders only shape the next arrays/records.
 */
import type { MoniDiagnosis, Misconception } from "@numberverse/core";
import type { KothaStory, MistakeState, RoundResult, SyncEvent } from "../store";

/** Resolve-to-complete mistake ledger update for one completed round. */
export function buildRoundMistake(
  m0: MistakeState,
  e: RoundResult,
  now: number,
): MistakeState {
  // #78 — normalize so every ledger entry carries byDay (pre-#78 persisted
  // entries have no field; keep the shape honest on the write path too).
  const mNorm: MistakeState = { ...m0, byDay: m0.byDay ?? {} };
  return e.correct
    ? { ...mNorm, open: 0 }
    : {
        ...mNorm,
        wrong: mNorm.wrong + 1,
        open: mNorm.open + 1,
        lastAt: now,
        lastDifficulty: e.difficulty,
      };
}

/** 📚 KOTHA outbox append with the offline ceiling (#1229). */
export function buildRoundStory(
  uid: string,
  kidId: string,
  e: RoundResult,
  now: number,
  diag: MoniDiagnosis,
  mis: Misconception | undefined,
  wrongStreak: number,
  stories: KothaStory[],
  cap: number,
): KothaStory[] {
  if (stories.length >= cap) return stories;
  return [
    ...stories,
    {
      uid,
      kidId,
      skillId: e.skillId,
      gameId: e.gameId,
      outcome: e.correct,
      errorKind: e.correct ? null : diag.kind,
      misconceptionCode: mis?.code ?? null,
      action: diag.action.type,
      difficulty: e.difficulty,
      responseMs: e.responseMs,
      wrongStreak,
      context: { reason: diag.reason, message: diag.action.message },
      ts: now,
    },
  ];
}

/** Durable sync outbox append with the offline ceiling (#1229). */
export function buildRoundPending(
  pending: SyncEvent[],
  entry: SyncEvent,
  cap: number,
): SyncEvent[] {
  return pending.length >= cap ? pending : [...pending, entry];
}

import { useKidStore } from "../store";

/**
 * Wrong-answer ledger — the single hook that records EVERY wrong tap into the
 * kid store, without touching any scene.
 *
 * The App sets the current attempt context (kid + skill + game + difficulty)
 * when a drill round starts; `wrongLedger.record()` is called from hintWrong(),
 * which 33/33 drill scenes already route wrong taps through. So a wrong tap in
 * Count & Pop, Fruit Basket, Rocket Builder, … all land in the same per-kid
 * `mistakes` ledger automatically.
 *
 * The store then enforces resolve-to-complete: `addEvent(correct)` clears the
 * skill's `open` wrongs, and the session refuses to advance until `open === 0`.
 */
export interface WrongAttemptCtx {
  kidId: string;
  skillId: string;
  gameId: string;
  /** Adaptive difficulty the round started at (scenes report the exact value
   *  on completion; for wrong taps the starting tier is close enough). */
  difficulty: number;
}

let ctx: WrongAttemptCtx | null = null;

export const wrongLedger = {
  setContext(c: WrongAttemptCtx | null) {
    ctx = c;
  },
  /** The kid currently in a drill round (null before a round starts). */
  kidId(): string | null {
    return ctx?.kidId ?? null;
  },
  /** Call on every wrong tap — persisted, deduped naturally by the store. */
  record() {
    if (!ctx) return;
    useKidStore.getState().recordWrong(ctx.kidId, ctx.skillId, ctx.gameId, ctx.difficulty);
  },
};

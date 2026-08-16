// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NovaState } from "../src/store";

/* ── localStorage polyfill ──────────────────────────────────────────────────
 * Node ≥ 22 exposes an EXPERIMENTAL built-in `localStorage` global that is
 * unavailable unless `--localstorage-file` is passed; vitest's jsdom env does
 * not override it, so the store module's `createJSONStorage(() => localStorage)`
 * captures `undefined` and every persist/clear blows up. Install a tiny
 * in-memory Storage BEFORE the store module is evaluated (dynamic import) so
 * the debounced persist + nv_sync_signal mirror both target a working blob. */
class MemoryStorage {
  #m = new Map<string, string>();
  get length(): number {
    return this.#m.size;
  }
  clear(): void {
    this.#m.clear();
  }
  getItem(k: string): string | null {
    return this.#m.has(k) ? this.#m.get(k)! : null;
  }
  key(i: number): string | null {
    return Array.from(this.#m.keys())[i] ?? null;
  }
  removeItem(k: string): void {
    this.#m.delete(k);
  }
  setItem(k: string, v: string): void {
    this.#m.set(k, String(v));
  }
}
const memStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: memStorage, configurable: true });
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", { value: memStorage, configurable: true });
}

const store = await import("../src/store");
const {
  useKidStore,
  defaultNova,
  todayIso,
  dayIsoAgo,
  NOVA_DAILY_CAP,
  NOVA_COINS_PER_ROUND,
  NOVA_CARE_DAILY_CAP,
  NOVA_MASTERY_REWARD,
  NOVA_BOSS_REWARD,
  NOVA_CALENDAR_REWARDS,
  QUEST_TYPES,
  roundCoinTier,
  challengeQualityCoins,
  boxReward,
  questTypeFor,
  calendarCycleDay,
} = store;

const STORE_KEY = "nv_store_v1";

/** Reset the singleton store to pristine defaults — clears localStorage AND
 *  cancels the debounced persist write so no stale timer/blob leaks between
 *  tests (the store module persists across tests in this file). */
function resetStore() {
  useKidStore.persist.clearStorage();
  localStorage.clear();
  useKidStore.setState({
    score: 0,
    stars: 0,
    events: [],
    pending: [],
    stories: [],
    accel: [],
    syncState: "idle",
    syncChannels: { progress: "idle", stories: "idle", accel: "idle" },
    syncSignal: { lastSuccessAt: null, pendingCount: 0, lastError: null },
    skills: {},
    mistakes: {},
    stats: {},
    nova: {},
    garden: {},
    moni: {},
    moniWrongStreak: {},
    moniStrictness: {},
    moniSkillDeltas: {},
  });
  // cancel the debounced write scheduled by setState above
  useKidStore.persist.clearStorage();
}

beforeEach(() => {
  vi.useRealTimers();
  resetStore();
});

afterEach(() => {
  useKidStore.persist.clearStorage();
  localStorage.clear();
  vi.useRealTimers();
});

/* ─────────────────────────── #2 kid-economy anti-grind ─────────────────────────── */

describe("kid-economy anti-grind invariants", () => {
  it("exposes the anti-grind constants", () => {
    expect(NOVA_DAILY_CAP).toBe(20);
    expect(NOVA_COINS_PER_ROUND).toBe(1);
    expect(NOVA_CARE_DAILY_CAP).toBe(2);
    expect(NOVA_MASTERY_REWARD).toBe(5);
    expect(NOVA_BOSS_REWARD).toBe(5);
    expect(NOVA_CALENDAR_REWARDS).toEqual([3, 4, 5, 6, 7, 8, 10]);
  });

  it("roundCoinTier pays more at higher 1-based level indexes (#1187)", () => {
    expect(roundCoinTier(1)).toBe(1);
    expect(roundCoinTier(3)).toBe(1);
    expect(roundCoinTier(4)).toBe(2);
    expect(roundCoinTier(5)).toBe(2);
    expect(roundCoinTier(6)).toBe(3);
    expect(roundCoinTier(10)).toBe(3);
    // degenerate/absent difficulty falls back to the base tier
    expect(roundCoinTier(0)).toBe(1);
    expect(roundCoinTier(-1)).toBe(1);
    expect(roundCoinTier(undefined)).toBe(1);
  });

  it("challengeQualityCoins pays double only for clean play (#1194)", () => {
    expect(challengeQualityCoins(0.85)).toBe(2);
    expect(challengeQualityCoins(1)).toBe(2);
    expect(challengeQualityCoins(0.84)).toBe(1);
    expect(challengeQualityCoins(0.5)).toBe(1);
    expect(challengeQualityCoins(0)).toBe(1);
  });

  it("boxReward scales with band and always out-pays a passive login (#1195)", () => {
    const rnd = vi.spyOn(Math, "random");
    try {
      rnd.mockReturnValue(0);
      expect(boxReward(1)).toBe(5); // 5 + 0 + floor(0)
      expect(boxReward(5)).toBe(13); // 5 + 4*2 + 0
      rnd.mockReturnValue(0.999);
      expect(boxReward(1)).toBe(7); // 5 + 0 + floor(2.997)
      expect(boxReward(5)).toBe(15); // 13 + 2
      // every band >= 1 stays at/above the base 5 (a band-5 box out-pays the 10 login)
      for (let b = 1; b <= 8; b++) {
        rnd.mockReturnValue(0);
        expect(boxReward(b)).toBeGreaterThanOrEqual(5);
      }
    } finally {
      rnd.mockRestore();
    }
  });

  it("questTypeFor rotates deterministically per kid+day (#287/#293)", () => {
    expect(questTypeFor("kid-a", "2026-08-16")).toBe(questTypeFor("kid-a", "2026-08-16"));
    expect(QUEST_TYPES).toContain(questTypeFor("kid-a", "2026-08-16"));
    expect(QUEST_TYPES).toContain(questTypeFor("kid-b", "2026-08-16"));
    expect(QUEST_TYPES).toContain(questTypeFor("kid-a", "2026-08-17"));
  });

  it("calendarCycleDay wraps the 7-day login cycle", () => {
    expect(calendarCycleDay(1)).toBe(1);
    expect(calendarCycleDay(7)).toBe(7);
    expect(calendarCycleDay(8)).toBe(1);
    expect(calendarCycleDay(14)).toBe(7);
    expect(calendarCycleDay(0)).toBe(1);
  });
});

describe("novaClaimCalendar (#281)", () => {
  const kid = "cal-kid";
  const today = todayIso();

  function seedNova(patch: Partial<NovaState>) {
    useKidStore.setState({ nova: { [kid]: { ...defaultNova(), ...patch } } });
  }

  it("pays exactly NOVA_CALENDAR_REWARDS[pos-1] and marks the day claimed", () => {
    seedNova({ lastDay: today, earnDay: today, earnedToday: 0, streak: 3, calendarDay: "" });
    const pos = calendarCycleDay(3); // 3
    const expected = NOVA_CALENDAR_REWARDS[pos - 1];
    const granted = useKidStore.getState().novaClaimCalendar(kid);
    expect(granted).toBe(expected);
    const n = useKidStore.getState().nova[kid];
    expect(n.calendarDay).toBe(today);
    expect(n.coins).toBe(expected);
    expect(n.totalEarned).toBe(expected);
    expect(n.earnedToday).toBe(expected);
  });

  it("refuses to double-claim (returns 0, changes nothing)", () => {
    seedNova({ lastDay: today, earnDay: today, earnedToday: 2, streak: 1, calendarDay: today });
    const before = useKidStore.getState().nova[kid];
    const granted = useKidStore.getState().novaClaimCalendar(kid);
    expect(granted).toBe(0);
    expect(useKidStore.getState().nova[kid]).toEqual(before);
  });

  it("refuses when the kid hasn't played today (lastDay !== today)", () => {
    seedNova({ lastDay: dayIsoAgo(1), earnDay: today, earnedToday: 4, streak: 3, calendarDay: "" });
    const before = useKidStore.getState().nova[kid];
    const granted = useKidStore.getState().novaClaimCalendar(kid);
    expect(granted).toBe(0);
    const n = useKidStore.getState().nova[kid];
    expect(n).toEqual(before);
    expect(n.calendarDay).toBe("");
    expect(n.coins).toBe(0);
    expect(n.freezes).toBe(0);
  });

  it("day-7 tile also grants a streak-freeze token (#294)", () => {
    seedNova({ lastDay: today, earnDay: today, earnedToday: 0, streak: 7, calendarDay: "", freezes: 0 });
    const granted = useKidStore.getState().novaClaimCalendar(kid);
    expect(granted).toBe(NOVA_CALENDAR_REWARDS[6]); // 10
    const n = useKidStore.getState().nova[kid];
    expect(n.freezes).toBe(1);
    expect(n.calendarDay).toBe(today);
  });

  it("day-7 with a full daily cap still grants the freeze token (coins capped to 0)", () => {
    seedNova({ lastDay: today, earnDay: today, earnedToday: NOVA_DAILY_CAP, streak: 7, calendarDay: "", freezes: 0 });
    const granted = useKidStore.getState().novaClaimCalendar(kid);
    expect(granted).toBe(0);
    const n = useKidStore.getState().nova[kid];
    expect(n.coins).toBe(0);
    expect(n.earnedToday).toBe(NOVA_DAILY_CAP);
    expect(n.freezes).toBe(1); // token still granted
    expect(n.calendarDay).toBe(today);
  });

  it("cap-full non-day-7 claim returns 0 WITHOUT marking the day claimed", () => {
    seedNova({ lastDay: today, earnDay: today, earnedToday: NOVA_DAILY_CAP, streak: 1, calendarDay: "" });
    const granted = useKidStore.getState().novaClaimCalendar(kid);
    expect(granted).toBe(0);
    const n = useKidStore.getState().nova[kid];
    expect(n.calendarDay).toBe(""); // not burned
    expect(n.freezes).toBe(0);
  });

  it("a correct round's reward never exceeds the daily cap across repeated claims", () => {
    const grind = "grinder";
    useKidStore.setState({ nova: { [grind]: defaultNova() } });
    const actions = useKidStore.getState();
    for (let i = 0; i < 100; i++) actions.novaAwardRound(grind, true, 6); // 3 coins/round
    const n = useKidStore.getState().nova[grind];
    expect(n.earnedToday).toBeLessThanOrEqual(NOVA_DAILY_CAP);
    expect(n.totalEarned).toBeLessThanOrEqual(NOVA_DAILY_CAP);
    expect(n.coins).toBe(n.totalEarned);
    expect(n.earnedToday).toBe(NOVA_DAILY_CAP); // exactly full
    // one more round changes nothing
    const coinsBefore = n.coins;
    actions.novaAwardRound(grind, true, 6);
    const after = useKidStore.getState().nova[grind];
    expect(after.coins).toBe(coinsBefore);
    expect(after.earnedToday).toBe(NOVA_DAILY_CAP);
  });

  it("multiple reward sources collectively respect the same daily cap", () => {
    const kid = "mixer";
    useKidStore.setState({ nova: { [kid]: defaultNova() } });
    const actions = useKidStore.getState();
    for (let i = 0; i < 6; i++) actions.novaAwardRound(kid, true, 6); // 6 × 3 = 18
    expect(actions.novaChallengeReward(kid, NOVA_BOSS_REWARD)).toBe(2); // 20 − 18
    expect(useKidStore.getState().nova[kid].earnedToday).toBe(NOVA_DAILY_CAP);
    expect(actions.novaBossWon(kid, 2)).toBe(0); // cap full → 0 coins
    const n = useKidStore.getState().nova[kid];
    expect(n.earnedToday).toBe(NOVA_DAILY_CAP);
    expect(n.bosses).toContain(2); // the win still persists
  });
});

/* ─────────────────────────── #4 restoreSnapshot merge ─────────────────────────── */

describe("restoreSnapshot newest-wins multi-device merge (#9)", () => {
  function seed() {
    useKidStore.setState({
      skills: {
        "devA:s1": { kidId: "devA", skillId: "s1", pMastered: 0.9, correct: 10, attempts: 12, streak: 5, lastPractice: 1000, lastDecay: 1000 },
        "devB:s1": { kidId: "devB", skillId: "s1", pMastered: 0.5, correct: 4, attempts: 6, streak: 2, lastPractice: 2000, lastDecay: 2000 },
      },
      nova: {
        devA: { ...defaultNova(), coins: 30 },
        devB: { ...defaultNova(), coins: 5 },
      },
    });
  }

  it("a newer snapshot's conflicting fields win", () => {
    seed();
    useKidStore.getState().restoreSnapshot("devA", {
      coins: 40,
      mastery: [{ skillId: "s1", mastery: 0.7, correct: 20, attempts: 25, streak: 8 }],
    });
    const s1 = useKidStore.getState().skills["devA:s1"]!;
    expect(s1.correct).toBe(20);
    expect(s1.attempts).toBe(25);
    expect(s1.streak).toBe(8);
    expect(s1.pMastered).toBe(0.7);
    expect(useKidStore.getState().nova.devA.coins).toBe(40); // wallet max wins
  });

  it("a field absent in the newer snapshot is NOT clobbered (older value survives)", () => {
    seed();
    useKidStore.getState().restoreSnapshot("devA", {
      coins: 0, // lower wallet — max keeps 30
      mastery: [{ skillId: "s1", mastery: 0.7, correct: 20, attempts: 25, streak: 8 }],
    });
    const s1 = useKidStore.getState().skills["devA:s1"]!;
    expect(s1.correct).toBe(20); // snapshot won the skill
    expect(s1.lastPractice).toBe(1000); // absent in snap → local survives
    expect(useKidStore.getState().nova.devA.coins).toBe(30); // wallet kept max
  });

  it("an older snapshot (fewer corrects) does NOT clobber local wins", () => {
    seed();
    useKidStore.getState().restoreSnapshot("devA", {
      coins: 1,
      mastery: [{ skillId: "s1", mastery: 0.2, correct: 2, attempts: 3, streak: 1 }],
    });
    const s1 = useKidStore.getState().skills["devA:s1"]!;
    expect(s1.correct).toBe(10);
    expect(s1.pMastered).toBe(0.9);
    expect(s1.streak).toBe(5);
    expect(useKidStore.getState().nova.devA.coins).toBe(30); // wallet max
  });

  it("merges per-kid without touching other kids", () => {
    seed();
    useKidStore.getState().restoreSnapshot("devA", {
      coins: 99,
      mastery: [{ skillId: "s1", mastery: 0.8, correct: 30, attempts: 32, streak: 9 }],
    });
    const b = useKidStore.getState().skills["devB:s1"]!;
    expect(b.correct).toBe(4);
    expect(b.pMastered).toBe(0.5);
    expect(useKidStore.getState().nova.devB.coins).toBe(5);
    expect(Object.keys(useKidStore.getState().skills)).toEqual(["devA:s1", "devB:s1"]);
  });

  it("ignores snapshot entries with zero corrects (m.correct <= 0)", () => {
    useKidStore.getState().restoreSnapshot("ghost", {
      coins: 10,
      mastery: [{ skillId: "s9", mastery: 0.9, correct: 0, attempts: 0, streak: 0 }],
    });
    expect(useKidStore.getState().skills["ghost:s9"]).toBeUndefined();
    // a positive wallet still creates the kid's nova entry
    expect(useKidStore.getState().nova["ghost"]!.coins).toBe(10);
  });
});

/* ─────────────────────────── #7 persisted-store durability ─────────────────────────── */

describe("persisted-store durability", () => {
  it("corrupted nv_store_v1 blob does not crash rehydrate (#1374)", async () => {
    localStorage.setItem(STORE_KEY, "{corrupt!!not json");
    await useKidStore.persist.rehydrate();
    const s = useKidStore.getState();
    expect(s.skills).toEqual({});
    expect(s.nova).toEqual({});
    expect(s.pending).toEqual([]);
    expect(s.syncSignal).toEqual({ lastSuccessAt: null, pendingCount: 0, lastError: null });
    expect(s.moniStrictness).toEqual({});
    expect(s.moniSkillDeltas).toEqual({});
    // the corrupted bytes were dropped by the guarded getItem
    expect(localStorage.getItem(STORE_KEY)).toBeNull();
  });

  it("v0 blob with a non-object state rehydrates to safe defaults (migrate guard)", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ state: "garbage-string", version: 0 }));
    await useKidStore.persist.rehydrate();
    const s = useKidStore.getState();
    expect(s.skills).toEqual({});
    expect(s.nova).toEqual({});
    expect(s.pending).toEqual([]);
    expect(s.syncSignal).toEqual({ lastSuccessAt: null, pendingCount: 0, lastError: null });
  });

  it("v0 → v1 migration backfills syncSignal and moni defaults", async () => {
    const legacySkill = { kidId: "k1", skillId: "s1", pMastered: 0.5, correct: 3, attempts: 4, streak: 2, lastPractice: 100, lastDecay: 100 };
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: {
          skills: { "k1:s1": legacySkill },
          nova: { k1: { ...defaultNova(), coins: 7 } },
          pending: [{ uid: "u1", kidId: "k1", skillId: "s1", gameId: "g", correct: true, difficulty: 1, responseMs: 100, ts: 1 }],
        },
        version: 0,
      })
    );
    await useKidStore.persist.rehydrate();
    const s = useKidStore.getState();
    // backfilled defaults
    expect(s.syncSignal).toEqual({ lastSuccessAt: null, pendingCount: 0, lastError: null });
    expect(s.moniStrictness).toEqual({});
    expect(s.moniSkillDeltas).toEqual({});
    expect(s.moniWrongStreak).toEqual({});
    // seeded data survived
    expect(s.skills["k1:s1"]).toEqual(legacySkill);
    expect(s.nova.k1!.coins).toBe(7);
    expect(s.pending).toHaveLength(1);
  });

  it("debounced persist writes the LATEST snapshot once after rapid churn (#1227)", () => {
    vi.useFakeTimers();
    const writes = vi.spyOn(memStorage, "setItem");
    try {
      resetStore();
      const actions = useKidStore.getState();
      // rapid state churn — three round rewards inside the 150ms window
      actions.novaAwardRound("churn", true, 6);
      actions.novaAwardRound("churn", true, 6);
      actions.novaAwardRound("churn", true, 6);
      // coalesced — nothing written to nv_store_v1 yet
      expect(localStorage.getItem(STORE_KEY)).toBeNull();
      vi.advanceTimersByTime(150);
      const blob = localStorage.getItem(STORE_KEY);
      expect(blob).not.toBeNull();
      const parsed = JSON.parse(blob!);
      expect(parsed.version).toBe(1);
      expect(parsed.state.nova.churn).toBeDefined();
      expect(parsed.state.nova.churn.coins).toBe(9);
      expect(parsed.state.nova.churn.earnedToday).toBe(9);
      // only ONE nv_store_v1 setItem fired for the whole churn
      const storeWrites = writes.mock.calls.filter(([k]) => k === STORE_KEY);
      expect(storeWrites).toHaveLength(1);
      // partialize: only durable fields are persisted, never per-session score
      expect(parsed.state.score).toBeUndefined();
      expect(parsed.state.skills).toBeDefined();
    } finally {
      writes.mockRestore();
      vi.useRealTimers();
    }
  });
});

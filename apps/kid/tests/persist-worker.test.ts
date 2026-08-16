// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── localStorage polyfill ──────────────────────────────────────────────────
 * Same as store.test.ts: Node/vitest jsdom doesn't reliably expose
 * localStorage, and the store module's debounced persist captures the storage
 * at eval. Install a tiny in-memory Storage BEFORE the store module evaluates. */
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
const { serializeSnapshot, defaultNova, useKidStore } = store;

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
  useKidStore.persist.clearStorage();
}

beforeEach(() => {
  vi.useRealTimers();
  resetStore();
  vi.unstubAllGlobals();
});

/** A full PersistedKidState-shaped object (partialize output). */
function sampleState() {
  return {
    skills: { "k1:s1": { kidId: "k1", skillId: "s1", pMastered: 0.5, correct: 3, attempts: 4, streak: 2, lastPractice: 100, lastDecay: 100 } },
    mistakes: {},
    stats: { k1: { stars: 2, score: 3, sessions: 1 } },
    nova: { k1: { ...defaultNova(), coins: 7, walletSeq: 3 } },
    garden: {},
    pending: [{ uid: "u1", kidId: "k1", skillId: "s1", gameId: "g", correct: true, difficulty: 1, responseMs: 100, ts: 1 }],
    stories: [],
    accel: [],
    moni: {},
    moniWrongStreak: {},
    moniStrictness: {},
    moniSkillDeltas: {},
    syncSignal: { lastSuccessAt: null, pendingCount: 1, lastError: null },
  };
}

describe("serializeSnapshot (#1814)", () => {
  it("round-trips a full persisted snapshot through JSON", () => {
    const state = sampleState();
    const parsed = JSON.parse(serializeSnapshot(state as never));
    expect(parsed).toEqual(state);
  });

  it("produces stable JSON.stringify output (single implementation)", () => {
    const state = sampleState();
    expect(serializeSnapshot(state as never)).toBe(JSON.stringify(state));
  });

  it("serializes the wallet_seq + coins so LWW survives a reload", () => {
    const state = sampleState();
    const parsed = JSON.parse(serializeSnapshot(state as never));
    expect(parsed.nova.k1.coins).toBe(7);
    expect(parsed.nova.k1.walletSeq).toBe(3);
  });
});

describe("persist.worker (#1814)", () => {
  it("posts back the stringified snapshot on message (stub self)", async () => {
    const postMessage = vi.fn();
    const selfStub: { postMessage: typeof postMessage; onmessage: null | ((ev: MessageEvent) => void) } = {
      postMessage,
      onmessage: null,
    };
    vi.stubGlobal("self", selfStub);
    try {
      // Dynamic import AFTER stubbing `self`: the worker module binds its
      // handler to the stub's onmessage at module eval. The module is only
      // imported in this one test, so the fresh stub is guaranteed.
      const mod = await import("../src/persist.worker");
      const state = sampleState();
      selfStub.onmessage!({ data: state } as MessageEvent);
      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(postMessage).toHaveBeenCalledWith(serializeSnapshot(state as never));
      expect(mod).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

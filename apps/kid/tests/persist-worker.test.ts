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

describe("persist.worker (#1814/#1815)", () => {
  it("stringifies writes AND parses+migrates rehydrate reads off-thread (stub self)", async () => {
    const postMessage = vi.fn();
    const selfStub: { postMessage: typeof postMessage; onmessage: null | ((ev: MessageEvent) => void) } = {
      postMessage,
      onmessage: null,
    };
    vi.stubGlobal("self", selfStub);
    try {
      // Dynamic import AFTER stubbing `self`: the worker module binds its
      // handler to the stub's onmessage at module eval. The module is only
      // imported in this one test, so the fresh stub is guaranteed. All three
      // messages below drive the SAME bound handler — no module-cache reload.
      const mod = await import("../src/persist.worker");
      const state = sampleState();

      // write path: a state object → string reply
      selfStub.onmessage!({ data: state } as MessageEvent);
      expect(postMessage).toHaveBeenNthCalledWith(1, serializeSnapshot(state as never));

      // read path: a v0 raw blob → already-MIGRATED envelope at the current
      // version (zustand then skips its own migrate — single implementation).
      selfStub.onmessage!({
        data: { type: "parse", raw: JSON.stringify({ state, version: 0 }) },
      } as MessageEvent);
      const reply = postMessage.mock.calls[1][0] as {
        type: string;
        state: Record<string, unknown> | null;
        version: number;
      };
      expect(reply.type).toBe("parse-result");
      expect(reply.version).toBe(1);
      expect(reply.state).not.toBeNull();
      // the worker ran the SAME migration as the main thread — the blob's
      // already-present syncSignal/mono fields pass through untouched
      expect((reply.state as Record<string, unknown>).syncSignal).toEqual(state.syncSignal);
      expect((reply.state as { skills: Record<string, unknown> }).skills["k1:s1"]).toEqual(
        state.skills["k1:s1"]
      );

      // genuine minimal v0 blob (no v1-only keys) → migration backfills them
      selfStub.onmessage!({
        data: {
          type: "parse",
          raw: JSON.stringify({
            state: { skills: { "k1:s1": state.skills["k1:s1"] }, nova: { k1: state.nova.k1 } },
            version: 0,
          }),
        },
      } as MessageEvent);
      const v0reply = postMessage.mock.calls[2][0] as {
        type: string;
        state: Record<string, unknown> | null;
        version: number;
      };
      expect(v0reply.state).toEqual({
        skills: { "k1:s1": state.skills["k1:s1"] },
        masteryMeta: {},
        mistakes: {},
        stats: {},
        nova: { k1: state.nova.k1 },
        garden: {},
        pending: [],
        stories: [],
        accel: [],
        moni: {},
        moniWrongStreak: {},
        moniStrictness: {},
        moniSkillDeltas: {},
        syncSignal: { lastSuccessAt: null, pendingCount: 0, lastError: null },
      });

      // corrupt blob → null state (same #1374 guard as the sync path)
      selfStub.onmessage!({ data: { type: "parse", raw: "{corrupt!!not json" } } as MessageEvent);
      expect(postMessage.mock.calls[3][0]).toEqual({ type: "parse-result", state: null });

      expect(mod).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

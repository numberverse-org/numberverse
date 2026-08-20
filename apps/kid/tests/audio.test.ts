// @vitest-environment jsdom
/**
 * test-coverage-kid — WebAudio + voice-cache promise-hardening coverage.
 *   #3092  void ctx.resume() discarded the WebAudio resume promise, leaking
 *          autoplay-policy rejections as unhandledrejection on every sound.
 *   #3093  openVoiceCache's async onsuccess could orphan cacheDbPromise if a
 *          ledger seed ever rejected, hanging every neuralSpeak.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ensureAudio } from "../src/game/audio";

/* ── #3092 ──────────────────────────────────────────────────────────────────── */

describe("ensureAudio WebAudio resume (#3092)", () => {
  let unhandled: unknown[] = [];
  const onUnhandled = (ev: Event) => unhandled.push(ev);

  beforeEach(() => {
    unhandled = [];
    window.addEventListener("unhandledrejection", onUnhandled);
  });

  afterEach(() => {
    window.removeEventListener("unhandledrejection", onUnhandled);
    vi.restoreAllMocks();
  });

  it("attaches a rejection handler so a denied resume does not fire unhandledrejection", async () => {
    // A real AudioContext whose state is "suspended" and whose resume() rejects
    // (the browser still denies autoplay). ensureAudio() must swallow that
    // rejection rather than let it bubble as an unhandledrejection, and it must
    // still return the context (sounds no-op the suspended context gracefully).
    let resumed = 0;
    const audioContextStub = class {
      state: AudioContextState = "suspended";
      resume(): Promise<void> {
        resumed += 1;
        return Promise.reject(new DOMException("Autoplay denied", "NotAllowedError"));
      }
    };
    vi.stubGlobal("AudioContext", audioContextStub);

    // First call creates the context and (with state suspended) triggers resume.
    const ctx = ensureAudio();
    expect(ctx).not.toBeNull();
    expect(resumed).toBe(1);

    // Let the rejected resume promise settle and any unhandledrejection fire.
    await new Promise((r) => setTimeout(r, 0));
    expect(unhandled).toHaveLength(0);
  });
});

/* ── #3093 ────────────────────────────────────────────────────────────────────
 * openVoiceCache's onsuccess resolves the cache promise SYNCHRONOUSLY (non-async
 * handler); the ledger seed is settled with an always-resolving .then so a seed
 * failure can never orphan cacheDbPromise and hang every neuralSpeak. We force
 * the ledger-seed path to fail (a db whose object store bookkeeping throws) and
 * assert the cache still resolves, and voiceCacheGet returns a clean cache miss.
 */
describe("openVoiceCache ledger-seed resilience (#3093)", () => {
  // The cache promise is module-level and memoized; import fresh (via
  // vi.resetModules) so each test gets a null cacheDbPromise. We reach it
  // through the DEV-only __nvTestCache hook.
  async function loadNv() {
    vi.resetModules();
    return import("../src/game/neuralVoice");
  }

  /** Install a minimal fake indexedDB whose open() returns a request we drive. */
  function stubIndexedDB(openImpl: () => unknown) {
    const fake = { open: openImpl };
    vi.stubGlobal("indexedDB", fake);
  }

  it("resolves (no hang) even when the ledger seed path cannot run", async () => {
    // The db's objectStoreNames getter THROWS, so seedLruLedger's own try/catch
    // is bypassed at the open/seed boundary — the always-resolving .then must
    // still settle cacheDbPromise. Absent that fix, an async onsuccess with a
    // throw would leave the promise pending forever and this await would hang.
    const fakeDb = Object.defineProperties(
      {},
      {
        objectStoreNames: {
          get() {
            throw new Error("ledger seed exploded");
          },
        },
      }
    );
    const fakeReq: {
      result: unknown;
      onsuccess: (() => void) | null;
      onupgradeneeded: unknown;
      onerror: unknown;
      onblocked: unknown;
    } = {
      result: fakeDb,
      onsuccess: null,
      onupgradeneeded: null,
      onerror: null,
      onblocked: null,
    };
    stubIndexedDB(() => fakeReq);

    const mod = await loadNv();
    const wait = mod.__nvTestCache!.waitLedger();

    // openVoiceCache assigned req.onsuccess synchronously on open(); capture it.
    const handler = fakeReq.onsuccess;
    expect(handler).not.toBeNull();
    handler();

    const db = await Promise.race([
      wait,
      new Promise<"TIMEOUT">((r) => setTimeout(() => r("TIMEOUT"), 1000)),
    ]);
    expect(db).not.toBe("TIMEOUT");
    // Even when the seed throws, the cache resolves (to the DB — best-effort).
    // A cache read with a broken store is a clean miss, never a hang.
    const miss = await mod.__nvTestCache!.get(1, "hello");
    expect(miss).toBeUndefined();
  });
});


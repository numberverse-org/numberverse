// @vitest-environment jsdom
/**
 * test-coverage-kid WAVE B — api.ts outbox sync + time-logic coverage.
 * Closes feed findings #8 (outbox sync drain) and #9 (daily-limit/quiet-hours).
 *
 * The sync functions (syncProgress/syncStories/syncAccel) hit globalThis.fetch,
 * which is stubbed per-test with vi.stubGlobal. The identity is seeded through
 * the parent-gated path (nv_parent_token + a fully-mapped nv_kid_map) so
 * ensureIdentity() resolves WITHOUT any network calls — the only fetch a sync
 * makes is the wire contract under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  API,
  syncProgress,
  syncStories,
  syncAccel,
  drainStoriesIfFull,
  drainAccelIfFull,
  restoreServerState,
  quietTimeNow,
  todayLimitMin,
  goalNudgedToday,
  markGoalNudgedToday,
  hasParentSession,
  hasParentPin,
  hasSecurityQA,
  setParentPin,
  verifyParentPin,
  setSecurityQA,
  verifySecurityQA,
  KID_SETTINGS_DEFAULT,
  type KidSettings,
} from "../src/api";
import { useKidStore, STORY_QUEUE_CAP } from "../src/store";

/* ── test helpers ─────────────────────────────────────────────────────── */

/** A controlled 2xx Response for the mocked fetch. */
function okJson(body: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Seed the parent-gated identity path: token + one fully-mapped local kid.
 *  Every local kid is already in the kid map, so mapLocalKidsToServer()
 *  short-circuits to ZERO network — the only fetch a sync issues is the POST
 *  whose wire contract we're asserting. */
function seedIdentity(): void {
  localStorage.setItem("nv_parent_token", "tok");
  localStorage.setItem("nv_kids", JSON.stringify([{ id: "k1", name: "Kid", birthYear: 2018 }]));
  localStorage.setItem("nv_kid_map", JSON.stringify({ k1: "srv_1" }));
}

function pendingEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uid: "u1",
    kidId: "k1",
    skillId: "s1",
    gameId: "g1",
    correct: true,
    difficulty: 2,
    responseMs: 1200,
    ts: 1234567890,
    ...overrides,
  };
}

function storyEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uid: "su1",
    kidId: "k1",
    skillId: "s1",
    gameId: "g1",
    outcome: false,
    errorKind: "slow",
    misconceptionCode: "gap",
    action: "drill",
    difficulty: 1,
    responseMs: 800,
    wrongStreak: 2,
    context: { source: "wrong-tap" },
    ts: 111,
    ...overrides,
  };
}

function accelEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uid: "au1",
    kidId: "k1",
    skillId: "s1",
    reason: "easy",
    bandFrom: 1,
    bandTo: 2,
    ts: 222,
    ...overrides,
  };
}

function makeStories(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => storyEntry({ uid: `su${i}`, ts: i }));
}

function makeAccel(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => accelEntry({ uid: `au${i}`, ts: i }));
}

function settingsWith(overrides: Partial<KidSettings>): KidSettings {
  return { ...KID_SETTINGS_DEFAULT, ...overrides };
}

/** Let a fire-and-forget async drain (drainStoriesIfFull / drainAccelIfFull)
 *  finish all its microtasks + one macrotask. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

/** The vitest jsdom environment here does NOT expose a localStorage global
 *  (Node's experimental localStorage is off and jsdom's isn't promoted to
 *  globalThis). The store/api read localStorage lazily at call time, so a
 *  fresh in-memory stub per test is enough — real assertions still go through
 *  the same getItem/setItem contract. */
function createLocalStorageMock(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  } as Storage;
}

beforeEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", createLocalStorageMock());
  useKidStore.setState({
    pending: [],
    stories: [],
    accel: [],
    syncChannels: { progress: "idle", stories: "idle", accel: "idle" },
    syncState: "idle",
    syncSignal: { lastSuccessAt: null, pendingCount: 0, lastError: null },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/* ── #8 outbox sync drain contract ────────────────────────────────────── */

describe("syncProgress wire contract + outbox drain", () => {
  it("POSTs /progress with the kid-bound JSON body and drains the sent entries", async () => {
    seedIdentity();
    useKidStore.setState({ pending: [pendingEvent() as never] });
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    await syncProgress();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/progress`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Authorization"]).toBe("Bearer tok");
    const body = JSON.parse(init.body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      kid_id: "srv_1", // local k1 → server srv_1
      skill_id: "s1",
      game_id: "g1",
      correct: true,
      response_ms: 1200,
      difficulty: 2,
      uid: "u1",
      timestamp: 1234567890,
    });
    expect(body.coins).toEqual({ srv_1: 0 });
    // the outbox drained exactly what the server recorded
    expect(useKidStore.getState().pending).toHaveLength(0);
    expect(useKidStore.getState().syncChannels.progress).toBe("ok");
  });

  it("keeps band-skipped events queued and drains only what the server recorded", async () => {
    seedIdentity();
    useKidStore.setState({
      pending: [pendingEvent({ uid: "keep" }) as never, pendingEvent({ uid: "drop" }) as never],
    });
    // server recorded "drop" but band-locked "keep" (stale-catalog / over-band)
    const fetchMock = vi.fn(async () => okJson({ band_skipped_uids: ["keep"] }));
    vi.stubGlobal("fetch", fetchMock);

    await syncProgress();

    const pending = useKidStore.getState().pending;
    expect(pending.map((e) => e.uid)).toEqual(["keep"]);
    expect(useKidStore.getState().syncChannels.progress).toBe("ok");
  });

  it("does NOT throw on a rejected fetch and leaves the outbox intact", async () => {
    seedIdentity();
    useKidStore.setState({ pending: [pendingEvent() as never] });
    const fetchMock = vi.fn(async () => {
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncProgress()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useKidStore.getState().pending).toHaveLength(1);
    expect(useKidStore.getState().syncChannels.progress).toBe("offline");
  });

  it("#3081 — a 200 with a malformed body does NOT clear the outbox (no band-skip loss)", async () => {
    seedIdentity();
    useKidStore.setState({ pending: [pendingEvent({ uid: "keep-me" }) as never] });
    // 200 but unparseable JSON → we can't know what the server band-skipped,
    // so the batch must stay queued (a later heartbeat retries) rather than be
    // treated as fully-recorded and cleared.
    const fetchMock = vi.fn(async () => new Response("<!doctype html><html>not json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await syncProgress();

    expect(useKidStore.getState().pending).toHaveLength(1);
    expect(useKidStore.getState().syncChannels.progress).toBe("error");
  });
});

describe("syncStories wire contract + outbox drain", () => {
  it("POSTs /stories with the kid-bound array body and drains the sent stories", async () => {
    seedIdentity();
    useKidStore.setState({ stories: [storyEntry() as never] });
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    await syncStories();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/stories`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Authorization"]).toBe("Bearer tok");
    const body = JSON.parse(init.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({
      kid_id: "srv_1",
      uid: "su1",
      skill_id: "s1",
      game_id: "g1",
      outcome: false,
      error_kind: "slow",
      misconception_code: "gap",
      action: "drill",
      difficulty: 1,
      response_ms: 800,
      wrong_streak: 2,
      context: { source: "wrong-tap" },
    });
    expect(useKidStore.getState().stories).toHaveLength(0);
    expect(useKidStore.getState().syncChannels.stories).toBe("ok");
  });

  it("does NOT throw on a rejected fetch and leaves the story outbox intact", async () => {
    seedIdentity();
    useKidStore.setState({ stories: [storyEntry() as never] });
    const fetchMock = vi.fn(async () => {
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncStories()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useKidStore.getState().stories).toHaveLength(1);
    expect(useKidStore.getState().syncChannels.stories).toBe("offline");
  });
});

describe("syncAccel wire contract + outbox drain", () => {
  it("POSTs /acceleration with the kid-bound array body and drains the sent entries", async () => {
    seedIdentity();
    useKidStore.setState({ accel: [accelEntry() as never] });
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    await syncAccel();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/acceleration`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Authorization"]).toBe("Bearer tok");
    const body = JSON.parse(init.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({
      kid_id: "srv_1",
      uid: "au1",
      skill_id: "s1",
      reason: "easy",
      band_from: 1,
      band_to: 2,
    });
    expect(useKidStore.getState().accel).toHaveLength(0);
    expect(useKidStore.getState().syncChannels.accel).toBe("ok");
  });

  it("does NOT throw on a rejected fetch and leaves the accel outbox intact", async () => {
    seedIdentity();
    useKidStore.setState({ accel: [accelEntry() as never] });
    const fetchMock = vi.fn(async () => {
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncAccel()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useKidStore.getState().accel).toHaveLength(1);
    expect(useKidStore.getState().syncChannels.accel).toBe("offline");
  });
});

describe("offline drain ceiling (drainStoriesIfFull / drainAccelIfFull)", () => {
  it("drainStoriesIfFull eagerly drains when the queue reaches the cap", async () => {
    seedIdentity();
    useKidStore.setState({ stories: makeStories(STORY_QUEUE_CAP) as never });
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    drainStoriesIfFull();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/stories`);
    // one batch of SYNC_LIMIT (40) posted + cleared; the rest stay queued
    expect(useKidStore.getState().stories.length).toBe(STORY_QUEUE_CAP - 40);
  });

  it("drainStoriesIfFull does nothing below the cap", () => {
    seedIdentity();
    useKidStore.setState({ stories: [storyEntry() as never] });
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    drainStoriesIfFull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useKidStore.getState().stories).toHaveLength(1);
  });

  it("drainAccelIfFull eagerly drains when the queue reaches the cap", async () => {
    seedIdentity();
    useKidStore.setState({ accel: makeAccel(STORY_QUEUE_CAP) as never });
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    drainAccelIfFull();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/acceleration`);
    expect(useKidStore.getState().accel.length).toBe(STORY_QUEUE_CAP - 40);
  });

  it("drainAccelIfFull does nothing below the cap", () => {
    seedIdentity();
    useKidStore.setState({ accel: [accelEntry() as never] });
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    drainAccelIfFull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useKidStore.getState().accel).toHaveLength(1);
  });
});

/* ── #9 daily-limit + quiet-hours time logic ───────────────────────────── */

describe("quietTimeNow (#248)", () => {
  it("same-day window inside/outside (end exclusive)", () => {
    const s = settingsWith({
      quiet_enabled: true,
      quiet_windows: "09:00-17:00,09:00-17:00,09:00-17:00,09:00-17:00,09:00-17:00,09:00-17:00,09:00-17:00",
    });
    // 2026-08-17 is a Monday → window index 0
    expect(quietTimeNow(s, new Date(2026, 7, 17, 10, 0))).toBe(true);
    expect(quietTimeNow(s, new Date(2026, 7, 17, 8, 0))).toBe(false);
    expect(quietTimeNow(s, new Date(2026, 7, 17, 16, 59))).toBe(true);
    expect(quietTimeNow(s, new Date(2026, 7, 17, 17, 0))).toBe(false);
  });

  it("overnight window crossing midnight (20:00-07:00)", () => {
    const s = settingsWith({
      quiet_enabled: true,
      quiet_windows: "20:00-07:00,20:00-07:00,20:00-07:00,20:00-07:00,20:00-07:00,20:00-07:00,20:00-07:00",
    });
    // Monday evening / early-Tuesday hours per Monday's window entry
    expect(quietTimeNow(s, new Date(2026, 7, 17, 22, 0))).toBe(true); // 22:00 → cur >= start(20:00)
    expect(quietTimeNow(s, new Date(2026, 7, 17, 5, 0))).toBe(true); // 05:00 → cur < end(07:00)
    expect(quietTimeNow(s, new Date(2026, 7, 17, 12, 0))).toBe(false); // 12:00 → neither
  });

  it("disabled when quiet_enabled is false or windows are null", () => {
    expect(
      quietTimeNow(
        settingsWith({ quiet_enabled: false, quiet_windows: "09:00-17:00,09:00-17:00,09:00-17:00,09:00-17:00,09:00-17:00,09:00-17:00,09:00-17:00" }),
        new Date(2026, 7, 17, 10, 0),
      ),
    ).toBe(false);
    expect(
      quietTimeNow(settingsWith({ quiet_enabled: true, quiet_windows: null }), new Date(2026, 7, 17, 10, 0)),
    ).toBe(false);
  });

  it("malformed entry → false", () => {
    const s = settingsWith({
      quiet_enabled: true,
      quiet_windows: "09:00-17:00,09:00-17:00,09:00-17:00,09:00-17:00,09:00-17:00,09:00-17:00,garbage",
    });
    // 2026-08-23 is a Sunday → window index 6 is malformed
    expect(quietTimeNow(s, new Date(2026, 7, 23, 10, 0))).toBe(false);
    // Monday index 0 is still valid
    expect(quietTimeNow(s, new Date(2026, 7, 17, 10, 0))).toBe(true);
  });

  it("weekday mapping Mon=0..Sun=6 is correct", () => {
    const s = settingsWith({
      quiet_enabled: true,
      quiet_windows: "09:00-10:00,-,-,-,-,-,11:00-12:00",
    });
    // Monday 2026-08-17 → index 0 → 09:00-10:00
    expect(quietTimeNow(s, new Date(2026, 7, 17, 9, 30))).toBe(true);
    // Tuesday 2026-08-18 → index 1 → "-"
    expect(quietTimeNow(s, new Date(2026, 7, 18, 9, 30))).toBe(false);
    // Sunday 2026-08-23 → index 6 → 11:00-12:00
    expect(quietTimeNow(s, new Date(2026, 7, 23, 11, 30))).toBe(true);
  });
});

describe("todayLimitMin (#6)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("per-weekday caps take precedence over the flat cap", () => {
    vi.useFakeTimers();
    const s = settingsWith({
      weekday_limits_min: "30,40,50,60,70,80,90",
      daily_limit_min: 45,
    });
    vi.setSystemTime(new Date(2026, 7, 17)); // Monday → dow 0
    expect(todayLimitMin(s)).toBe(30);
    vi.setSystemTime(new Date(2026, 7, 23)); // Sunday → dow 6
    expect(todayLimitMin(s)).toBe(90);
  });

  it("flat cap applies when no weekday cap", () => {
    vi.useFakeTimers();
    const s = settingsWith({ weekday_limits_min: null, daily_limit_min: 45 });
    vi.setSystemTime(new Date(2026, 7, 17)); // Monday
    expect(todayLimitMin(s)).toBe(45);
    vi.setSystemTime(new Date(2026, 7, 22)); // Saturday
    expect(todayLimitMin(s)).toBe(45);
  });

  it("built-in defaults (45 school Mon–Fri, 90 weekend) when both absent", () => {
    vi.useFakeTimers();
    const s = settingsWith({ weekday_limits_min: null, daily_limit_min: null });
    vi.setSystemTime(new Date(2026, 7, 17)); // Monday
    expect(todayLimitMin(s)).toBe(45);
    vi.setSystemTime(new Date(2026, 7, 22)); // Saturday
    expect(todayLimitMin(s)).toBe(90);
    vi.setSystemTime(new Date(2026, 7, 23)); // Sunday
    expect(todayLimitMin(s)).toBe(90);
  });

  it("null when that day is unlimited (weekday cap 0)", () => {
    vi.useFakeTimers();
    const s = settingsWith({ weekday_limits_min: "0,40,50,60,70,80,90", daily_limit_min: 45 });
    vi.setSystemTime(new Date(2026, 7, 17)); // Monday → index 0 = "0" → unlimited
    expect(todayLimitMin(s)).toBeNull();
  });
});

describe("goalNudgedToday / markGoalNudgedToday (#256)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports true after marking, false before", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 12, 0)); // Monday
    expect(goalNudgedToday()).toBe(false);
    markGoalNudgedToday();
    expect(goalNudgedToday()).toBe(true);
  });

  it("resets when the local date rolls over", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 12, 0));
    markGoalNudgedToday();
    expect(goalNudgedToday()).toBe(true);

    vi.setSystemTime(new Date(2026, 7, 18, 0, 5)); // next day, just past midnight
    expect(goalNudgedToday()).toBe(false);
  });
});

/* ── signin/reauth helper booleans (unset state) ──────────────────────── */

describe("signin/reauth helper booleans", () => {
  it("all false when nothing is set", () => {
    expect(hasParentSession()).toBe(false);
    expect(hasParentPin()).toBe(false);
    expect(hasSecurityQA()).toBe(false);
  });

  it("true when the corresponding localStorage keys exist", () => {
    localStorage.setItem("nv_parent_token", "tok");
    localStorage.setItem("nv_parent_pin", "pbkdf2-sha256$150000$abc$def");
    localStorage.setItem("nv_parent_sec_q", "0");
    localStorage.setItem("nv_parent_sec_a", "pbkdf2-sha256$150000$abc$def");
    expect(hasParentSession()).toBe(true);
    expect(hasParentPin()).toBe(true);
    expect(hasSecurityQA()).toBe(true);
  });

  it("hasSecurityQA requires both the question AND answer", () => {
    localStorage.setItem("nv_parent_sec_q", "0");
    expect(hasSecurityQA()).toBe(false);
  });
});

/* ── #819 PIN + recovery secret hashing (PBKDF2 + legacy upgrade) ──────── */

describe("#819 parent PIN + recovery answer (hash, normalize, legacy upgrade)", () => {
  /** Replicates the pre-#819 fixed-salt FNV-1a format so we can seed a legacy
   *  install and assert verifyParentPin/verifySecurityQA re-hash it to PBKDF2. */
  function legacyFnv1a(value: string): string {
    const SALT = "numberverse-parent-pin-v1";
    let h = 0x811c9dc5;
    const s = `${SALT}:${value}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return `fnv1a$${(h >>> 0).toString(16).padStart(8, "0")}`;
  }

  it("setParentPin/verifyParentPin round-trip — never stores the raw PIN", async () => {
    await setParentPin("1234");
    expect(localStorage.getItem("nv_parent_pin")).not.toBe("1234");
    expect(localStorage.getItem("nv_parent_pin")!.startsWith("pbkdf2-sha256$")).toBe(true);
    expect(await verifyParentPin("1234")).toBe(true);
    expect(await verifyParentPin("9999")).toBe(false);
  });

  it("upgrades a legacy fnv1a PIN to PBKDF2 on first successful verify", async () => {
    localStorage.setItem("nv_parent_pin", legacyFnv1a("1234"));
    expect(localStorage.getItem("nv_parent_pin")!.startsWith("fnv1a$")).toBe(true);
    expect(await verifyParentPin("1234")).toBe(true);
    // the weak hash is re-hashed in place (and still verifies)
    const upgraded = localStorage.getItem("nv_parent_pin")!;
    expect(upgraded.startsWith("pbkdf2-sha256$")).toBe(true);
    expect(await verifyParentPin("1234")).toBe(true);
  });

  it("normalizeRecoveryAnswer — trim, lower-case, collapse spaces", async () => {
    await setSecurityQA("2", "  Blue   MOON ");
    expect(await verifySecurityQA("blue moon")).toBe(true);
    expect(await verifySecurityQA("  BLUE  moon  ")).toBe(true);
    expect(await verifySecurityQA("blue")).toBe(false);
    expect(localStorage.getItem("nv_parent_sec_a")!.startsWith("pbkdf2-sha256$")).toBe(true);
  });

  it("upgrades a legacy fnv1a recovery answer to PBKDF2 on first successful verify", async () => {
    localStorage.setItem("nv_parent_sec_q", "2");
    localStorage.setItem("nv_parent_sec_a", legacyFnv1a("blue moon"));
    expect(await verifySecurityQA("blue moon")).toBe(true);
    expect(localStorage.getItem("nv_parent_sec_a")!.startsWith("pbkdf2-sha256$")).toBe(true);
  });

  it("returns false (and does not upgrade) when nothing is stored", async () => {
    expect(await verifyParentPin("1234")).toBe(false);
    expect(await verifySecurityQA("blue moon")).toBe(false);
    expect(localStorage.getItem("nv_parent_pin")).toBeNull();
    expect(localStorage.getItem("nv_parent_sec_a")).toBeNull();
  });
});

/* ── #1811 device-auth 401/403 re-auth ─────────────────────────────────── */

describe("#1811 device-auth 401/403 re-auth", () => {
  function seedDeviceIdentity(): void {
    localStorage.setItem("nv_device_id", "dev1");
    localStorage.setItem("nv_device_secret", "seed");
    localStorage.setItem("nv_device_token", "devtok");
    localStorage.setItem("nv_kids", JSON.stringify([{ id: "k1", name: "Kid", birthYear: 2018 }]));
    localStorage.setItem("nv_kid_map", JSON.stringify({ k1: "srv_1" }));
  }

  it("clears the device token and surfaces 'reconnecting' on a 401, keeping the outbox", async () => {
    seedDeviceIdentity();
    useKidStore.setState({ pending: [pendingEvent() as never] });
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await syncProgress();

    expect(fetchMock).toHaveBeenCalledTimes(1); // only the /progress POST
    expect(localStorage.getItem("nv_device_token")).toBeNull(); // re-auth next tick
    expect(useKidStore.getState().syncChannels.progress).toBe("reconnecting");
    expect(useKidStore.getState().syncSignal.lastError).toBe("reconnecting");
    expect(useKidStore.getState().pending).toHaveLength(1); // outbox never dropped
  });

  it("403 is treated like 401 (reconnecting), NOT account-gone (no wipe)", async () => {
    seedDeviceIdentity();
    useKidStore.setState({ pending: [pendingEvent() as never] });
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await syncProgress();

    expect(useKidStore.getState().syncChannels.progress).toBe("reconnecting");
    // #1687 — 410 (not 403) is the account-gone signal; a 403 must not wipe.
    expect(useKidStore.getState().skills).toBeDefined();
    expect(useKidStore.getState().pending).toHaveLength(1);
  });
});

/* ── #1809 twin-collision kid mapping (claimed set) ────────────────────── */

describe("#1809 twin-collision kid mapping", () => {
  it("creates a fresh server kid when a name/year is already claimed by a twin", async () => {
    localStorage.setItem("nv_parent_token", "tok");
    localStorage.setItem(
      "nv_kids",
      JSON.stringify([
        { id: "k1", name: "Twin", birthYear: 2018 },
        { id: "k2", name: "Twin", birthYear: 2018 },
      ])
    );
    localStorage.setItem("nv_kid_map", JSON.stringify({}));
    useKidStore.setState({ pending: [pendingEvent({ kidId: "k1" }) as never] });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${API}/kids` && (!init?.method || init.method === "GET")) {
        return okJson([{ id: "srv_1", name: "Twin", birth_year: 2018 }]);
      }
      if (url === `${API}/kids` && init?.method === "POST") return okJson({ id: "srv_2" });
      if (url === `${API}/progress`) return okJson({});
      return new Response(null, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await syncProgress();

    const map = JSON.parse(localStorage.getItem("nv_kid_map")!) as Record<string, string>;
    expect(map.k1).toBe("srv_1"); // first twin claims the existing server kid
    expect(map.k2).toBe("srv_2"); // second twin gets a FRESH server kid
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(2); // POST /kids (create srv_2) + POST /progress
  });

  it("rejects an AMBIGUOUS name/year (two server kids) and creates fresh", async () => {
    localStorage.setItem("nv_parent_token", "tok");
    localStorage.setItem("nv_kids", JSON.stringify([{ id: "k1", name: "Twin", birthYear: 2018 }]));
    localStorage.setItem("nv_kid_map", JSON.stringify({}));
    useKidStore.setState({ pending: [pendingEvent({ kidId: "k1" }) as never] });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${API}/kids` && (!init?.method || init.method === "GET")) {
        return okJson([
          { id: "srv_1", name: "Twin", birth_year: 2018 },
          { id: "srv_2", name: "Twin", birth_year: 2018 },
        ]);
      }
      if (url === `${API}/kids` && init?.method === "POST") return okJson({ id: "srv_3" });
      if (url === `${API}/progress`) return okJson({});
      return new Response(null, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await syncProgress();

    const map = JSON.parse(localStorage.getItem("nv_kid_map")!) as Record<string, string>;
    expect(map.k1).toBe("srv_3"); // ambiguous → fresh create
  });
});

/* ── #1810 per-kid restore throttle ────────────────────────────────────── */

describe("#1810 per-kid restore throttle", () => {
  it("throttles a successful restore for 5 minutes, then refetches", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem("nv_parent_token", "tok");
      localStorage.setItem("nv_kids", JSON.stringify([{ id: "kA", name: "Kid", birthYear: 2018 }]));
      localStorage.setItem("nv_kid_map", JSON.stringify({ kA: "srv_A" }));
      // first restore succeeds
      const first = vi.fn(async () => okJson({ coins: 5, wallet_seq: 1, mastery: [] }));
      vi.stubGlobal("fetch", first);
      await restoreServerState();
      expect(first).toHaveBeenCalledTimes(1);

      // second restore within 5 min: throttled — no fetch
      const second = vi.fn(async () => okJson({ coins: 6, wallet_seq: 2, mastery: [] }));
      vi.stubGlobal("fetch", second);
      await restoreServerState();
      expect(second).toHaveBeenCalledTimes(0);

      // after 5 min: refetches
      vi.advanceTimersByTime(5 * 60_000 + 1);
      const third = vi.fn(async () => okJson({ coins: 7, wallet_seq: 3, mastery: [] }));
      vi.stubGlobal("fetch", third);
      await restoreServerState();
      expect(third).toHaveBeenCalledTimes(1);
      expect(useKidStore.getState().nova.kA!.coins).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT consume a kid's throttle on a failed snapshot — retries next tick", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem("nv_parent_token", "tok");
      localStorage.setItem("nv_kids", JSON.stringify([{ id: "kB", name: "Kid", birthYear: 2018 }]));
      localStorage.setItem("nv_kid_map", JSON.stringify({ kB: "srv_B" }));
      // first restore: snapshot fetch fails (fetch rejects → fetchSnapshot null)
      const first = vi.fn(async () => {
        throw new TypeError("down");
      });
      vi.stubGlobal("fetch", first);
      await restoreServerState();
      expect(first).toHaveBeenCalledTimes(1);

      // second restore immediately: retried (throttle NOT consumed on failure)
      const second = vi.fn(async () => okJson({ coins: 5, wallet_seq: 1, mastery: [] }));
      vi.stubGlobal("fetch", second);
      await restoreServerState();
      expect(second).toHaveBeenCalledTimes(1);
      expect(useKidStore.getState().nova.kB!.coins).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("#3103 restore identity is pinned for the whole pass (no account mixing)", () => {
  it("restores every kid against one identity even if the token flips mid-loop", async () => {
    vi.useFakeTimers();
    try {
      // Two kids, both mapped in the FIRST account.
      localStorage.setItem("nv_parent_token", "tok_A");
      localStorage.setItem(
        "nv_kids",
        JSON.stringify([
          { id: "k1", name: "Kid One", birthYear: 2018 },
          { id: "k2", name: "Kid Two", birthYear: 2019 },
        ])
      );
      localStorage.setItem("nv_kid_map", JSON.stringify({ k1: "srv_A1", k2: "srv_A2" }));

      // Each snapshot fetch asks for a DIFFERENT kid by its server id in the URL.
      const seen: string[] = [];
      const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        seen.push(u);
        // On the FIRST fetch, simulate a sign-out/in that swaps the account
        // BEFORE the second kid is fetched. The restore must keep using the
        // ORIGINAL account's mapping (srv_A2), not re-resolve to account B.
        if (/srv_A1/.test(u)) {
          localStorage.setItem("nv_parent_token", "tok_B");
          localStorage.setItem("nv_kid_map", JSON.stringify({ k1: "srv_B1", k2: "srv_B2" }));
        }
        return okJson({ coins: 5, wallet_seq: 1, mastery: [] });
      });
      vi.stubGlobal("fetch", fetchMock);

      await restoreServerState();

      // Both kids fetched from account A — the pass was pinned to tok_A's map.
      expect(seen.some((u) => u.includes("srv_A1"))).toBe(true);
      expect(seen.some((u) => u.includes("srv_A2"))).toBe(true);
      expect(seen.some((u) => u.includes("srv_B1"))).toBe(false);
      expect(seen.some((u) => u.includes("srv_B2"))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

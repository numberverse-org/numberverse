// @vitest-environment jsdom
/** #818 — guarded localStorage reads (safe JSON.parse + runtime shape guard).
 *  A corrupt stored blob must never throw on the read path or yield a mistyped
 *  shape downstream: each read site falls back to a safe default.
 *
 *  The settings/playtime parse caches (settingsCache / playtimeCache) only parse
 *  localStorage ONCE per module instance, so each scenario grabs a FRESH module
 *  (vi.resetModules + dynamic import) to guarantee a clean first-parse. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** The vitest jsdom environment does not promote localStorage to globalThis,
 *  so every test stubs a fresh in-memory Storage (same contract as api.test.ts). */
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
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", createLocalStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Fresh module instance per call so the one-time parse caches start empty. */
async function newApi() {
  vi.resetModules();
  return await import("../src/api");
}

describe("#818 guarded localStorage reads", () => {
  it("returns the default settings without throwing when the blob is corrupt JSON", async () => {
    const api = await newApi();
    localStorage.setItem("nv_kid_settings", "{definitely not json");
    expect(() => api.cachedKidSettings("k1")).not.toThrow();
    expect(api.cachedKidSettings("k1")).toBe(api.KID_SETTINGS_DEFAULT);
  });

  it("returns 0 play minutes without throwing when the minutes blob is corrupt", async () => {
    const api = await newApi();
    localStorage.setItem("nv_play_minutes", "[[no");
    expect(() => api.todayMinutes()).not.toThrow();
    expect(api.todayMinutes()).toBe(0);
    expect(() => api.addTodayMinutes(3)).not.toThrow();
    expect(api.todayMinutes()).toBe(3);
  });

  it("drops entries missing required fields or holding wrong field types; keeps valid ones", async () => {
    const api = await newApi();
    const valid = { ...api.KID_SETTINGS_DEFAULT, enabled_subjects: ["math"] };
    const wrongType = { ...api.KID_SETTINGS_DEFAULT, tts_enabled: "yes" };
    const partial = { enabled_subjects: null }; // missing required fields
    localStorage.setItem(
      "nv_kid_settings",
      JSON.stringify({ good: valid, wrongType, partial }),
    );
    expect(api.cachedKidSettings("good")).toEqual(valid);
    expect(api.cachedKidSettings("wrongType")).toBe(api.KID_SETTINGS_DEFAULT);
    expect(api.cachedKidSettings("partial")).toBe(api.KID_SETTINGS_DEFAULT);
    expect(api.cachedKidSettings("absent")).toBe(api.KID_SETTINGS_DEFAULT);
  });

  it("drops a non-object per-kid entry and keeps the rest of the map", async () => {
    const api = await newApi();
    localStorage.setItem(
      "nv_kid_settings",
      JSON.stringify({ bad: 42, good: { ...api.KID_SETTINGS_DEFAULT } }),
    );
    expect(api.cachedKidSettings("good")).toEqual(api.KID_SETTINGS_DEFAULT);
    expect(api.cachedKidSettings("bad")).toBe(api.KID_SETTINGS_DEFAULT);
  });
});

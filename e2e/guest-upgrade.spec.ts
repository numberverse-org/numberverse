/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect, type Page } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * Feed finding — guest-mode → account-upgrade path had no e2e.
 *
 * A guest kid plays with local-only progress (durable `nv_store_v1`, no
 * `nv_parent_token`). The Home guest banner (HomeScreen.tsx) names the
 * local-only risk and offers "Sign in / create account". Completing that
 * in-app signup against the mock API must:
 *   · keep the local progress (skills / stats / coins stay in `nv_store_v1`),
 *   · flip the app OUT of guest mode (`guestMode = !hasParentSession()` → the
 *     banner disappears and `nv_parent_token` is set).
 *
 * The backend is mocked (no live account is ever created); only the real
 * shipped bundle + the shared-origin localStorage contract are under test.
 */

/** The locally-seeded guest kid. */
const KID_ID = "guest-kid-e2e";

/** The slice of `nv_store_v1` this spec asserts on. */
interface StoreSnapshot {
  skills?: Record<string, { pMastered?: number }>;
  stats?: Record<string, { stars?: number; score?: number; sessions?: number }>;
  nova?: Record<string, { coins?: number }>;
}

/** Read the durable store, tolerating both the pre-write `{state, version:0}`
 *  blob and the app's own re-persisted `{state, version:1}` blob. */
async function readStore(page: Page): Promise<StoreSnapshot> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("nv_store_v1");
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const state =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as { state?: unknown }).state
        : undefined;
    return (state && typeof state === "object" ? state : {}) as StoreSnapshot;
  });
}

/** Seed a returning guest: one local kid, welcome already seen, and real local
 *  progress (a mastered band-1 skill, lifetime stars, and a coin wallet). Also
 *  neutralize the app's "first tap anywhere → fullscreen" behavior so the
 *  browser viewport doesn't resize mid-click during the test. */
async function seedGuestKid(page: Page): Promise<void> {
  await page.addInitScript((kidId: string) => {
    // #fullscreen — e2e determinism: the shipped app auto-enters fullscreen on
    // the first tap anywhere. Chrome resizes the viewport mid-click, which can
    // detach the element Playwright is clicking. Shadow the API so `requestFullscreen`
    // no-ops (fsSupported() then reads false → the footer toggle hides too).
    try {
      Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => false });
      Object.defineProperty(document.documentElement, "requestFullscreen", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(document.documentElement, "webkitRequestFullscreen", {
        configurable: true,
        value: undefined,
      });
    } catch {
      /* ignore — the click-stability guard is best-effort */
    }

    const now = Date.now();
    const storeState = {
      pending: [],
      stories: [],
      accel: [],
      skills: {
        [`${kidId}:count-1-10`]: {
          kidId,
          skillId: "count-1-10",
          pMastered: 0.9,
          correct: 9,
          attempts: 10,
          streak: 3,
          lastPractice: now - 60_000,
          lastDecay: now,
        },
      },
      mistakes: {},
      stats: {
        [kidId]: { stars: 3, score: 120, sessions: 2 },
      },
      nova: {
        [kidId]: {
          coins: 42,
          totalEarned: 42,
          owned: [],
          equipped: "",
          streak: 0,
          days: [],
          lastDay: "",
          affection: 0,
          affectionBest: false,
          gardenSeen: "",
          fed: "",
          played: "",
          earnedToday: 0,
          earnDay: "",
          careCoins: 0,
          careDay: "",
          careEarnedToday: 0,
          questDay: "",
          questRounds: 0,
          questDone: false,
          questClaimed: true,
          questPaid: 0,
          questType: "",
        },
      },
      garden: {},
      moni: {},
      moniWrongStreak: {},
      moniStrictness: {},
      moniSkillDeltas: {},
      syncSignal: { lastSuccessAt: null, pendingCount: 0, lastError: null },
    };

    try {
      localStorage.setItem("nv_seen_welcome", "1");
        localStorage.setItem("nv_tour_done", "1");
      localStorage.setItem("nv_lang", "en");
      localStorage.setItem(
        "nv_kids",
        JSON.stringify([{ id: kidId, name: "Aria", avatar: "🦊", birthYear: 2020 }])
      );
      localStorage.setItem("nv_kid_id", kidId);
      localStorage.setItem("nv_device_id", "e2e-device-id");
      localStorage.setItem("nv_store_v1", JSON.stringify({ state: storeState, version: 0 }));
    } catch {
      /* private browsing — the DOM assertions below still run */
    }
  }, KID_ID);
}

test.describe("guest-mode → account upgrade", () => {
  test.use({ serviceWorkers: "block" });

  test("guest upgrades via the Home CTA and keeps local progress", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);
    await seedGuestKid(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // 1. A returning guest (no parent session) boots to the parent gate. Tap the
    //    guest entry to reach the kid picker without signing in.
    await page.getByRole("button", { name: /Skip for now/ }).click();

    // 2. Pick the seeded kid → Home, where the guest banner names the risk and
    //    offers the upgrade path.
    await page.locator(".kidpick-card").filter({ hasText: "Aria" }).click();
    const guestBanner = page.locator(".home-guest-banner");
    await expect(guestBanner).toBeVisible();
    await expect(guestBanner).toContainText(/Guest mode/);

    // 3. Confirm the local progress is live on this device BEFORE the upgrade.
    const before = await readStore(page);
    expect(before.skills?.[`${KID_ID}:count-1-10`]?.pMastered).toBeCloseTo(0.9);
    expect(before.nova?.[KID_ID]?.coins).toBe(42);

    // 4. Click the upgrade CTA → the in-app parent gate, with gateReturn = home.
    await guestBanner.getByRole("button", { name: "Sign in / create account" }).click();
    await expect(page.getByRole("tab", { name: "Create account" })).toBeVisible();

    // 5. Complete the signup against the mock API (no live account is created).
    await page.getByRole("tab", { name: "Create account" }).click();
    await page.getByPlaceholder("e.g. Aisha").fill("Test Parent");
    await page.getByPlaceholder("you@example.com").fill("parent@example.com");
    await page.getByPlaceholder("at least 6 characters").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();

    // 6. Back home, the guest flag is gone: the banner disappears and the PLAY
    //    button is the surface again.
    await expect(page.locator(".play-btn")).toBeVisible();
    await expect(page.locator(".home-guest-banner")).toHaveCount(0);

    // The parent session is stored and the local kid maps to a server kid.
    await expect
      .poll(() => page.evaluate(() => !!localStorage.getItem("nv_parent_token")), { timeout: 15_000 })
      .toBe(true);
    await expect.poll(() => api.kids.length, { timeout: 15_000 }).toBe(1);
    expect(api.kids[0].name).toBe("Aria");

    // 7. The local progress SURVIVED the upgrade: the same skill mastery, stats
    //    and coins are still in the durable store.
    const after = await readStore(page);
    expect(after.skills?.[`${KID_ID}:count-1-10`]?.pMastered).toBeCloseTo(0.9);
    expect(after.stats?.[KID_ID]).toEqual(expect.objectContaining({ stars: 3, score: 120, sessions: 2 }));
    expect(after.nova?.[KID_ID]?.coins).toBe(42);
  });
});

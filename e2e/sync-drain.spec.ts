/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect, type Page } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * #925 — the core always-sync contract: progress queued while offline drains
 * the moment the device comes back online (api.ts startAutoSync's `online`
 * listener → syncProgress → POST /progress → clearPending).
 *
 * The kid app's sync gate reads `navigator.onLine`, so this spec simulates the
 * airplane-mode round-trip at the app boundary (patched navigator.onLine flag +
 * the real `window` "online" event) while blocking the service worker so the
 * same-origin /api calls are observable through Playwright routes. The backend
 * is mocked, so no live account or production data is touched.
 */

const KID_ID = "local-kid-e2e";

async function seedOfflineOutbox(page: Page): Promise<void> {
  await page.addInitScript((kidId: string) => {
    const w = window as unknown as { __nvOnline?: boolean };
    w.__nvOnline = false; // start airplane-mode: navigator.onLine reads false

    const onlineGetter = () => w.__nvOnline !== false;
    try {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: onlineGetter });
    } catch {
      /* instance locked — try the prototype as a fallback */
      try {
        Object.defineProperty(Object.getPrototypeOf(navigator) as Navigator, "onLine", {
          configurable: true,
          get: onlineGetter,
        });
      } catch {
        /* prototype locked — the window flag below still drives the transition */
      }
    }

    const state = {
      pending: [
        {
          uid: "e2e-uid-1",
          kidId,
          skillId: "count-to-10",
          gameId: "count-to-10",
          correct: true,
          responseMs: 1200,
          difficulty: 1,
          ts: Date.now() - 60_000,
        },
      ],
      stories: [],
      accel: [],
      skills: {},
      mistakes: {},
      stats: {},
      nova: {},
      garden: {},
      moni: {},
      moniWrongStreak: {},
      moniStrictness: {},
      syncSignal: { lastSuccessAt: null, pendingCount: 1, lastError: null },
    };

    try {
      localStorage.setItem("nv_seen_welcome", "1");
      localStorage.setItem("nv_lang", "en");
      localStorage.setItem(
        "nv_kids",
        JSON.stringify([{ id: kidId, name: "Aria", avatar: "🦊", birthYear: 2020 }])
      );
      localStorage.setItem("nv_kid_id", kidId);
      localStorage.setItem("nv_device_id", "e2e-device-id");
      localStorage.setItem("nv_store_v1", JSON.stringify({ state, version: 0 }));
    } catch {
      /* private browsing — the DOM assertions below still run */
    }
  }, KID_ID);
}

test.describe("always-sync offline → online drain", () => {
  test.use({ serviceWorkers: "block" });

  test("an offline outbox stays queued, then drains on the online event", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);
    await seedOfflineOutbox(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Offline: always-sync arms but must NOT post anything. The durable
    // nv_sync_signal key flips to "offline" once the boot tick has run.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const raw = localStorage.getItem("nv_sync_signal");
            if (!raw) return null;
            return (JSON.parse(raw) as { lastError?: unknown }).lastError;
          }),
        { timeout: 15_000 }
      )
      .toBe("offline");
    expect(api.progressCalls).toHaveLength(0);

    // Come back online and fire the exact event the app listens for.
    await page.evaluate(() => {
      const w = window as unknown as { __nvOnline?: boolean };
      w.__nvOnline = true;
      window.dispatchEvent(new Event("online"));
    });

    // The drain posts one batch and maps the local kid to its server id.
    await expect.poll(() => api.progressCalls.length, { timeout: 15_000 }).toBe(1);
    const posted = api.progressCalls[0] as {
      events?: Array<{ kid_id?: string; skill_id?: string }>;
    };
    expect(posted.events?.[0]?.kid_id).toBe("server-kid-1");
    expect(posted.events?.[0]?.skill_id).toBe("count-to-10");

    // Parent-visible signal clears (written immediately on a confirmed drain).
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const raw = localStorage.getItem("nv_sync_signal");
            if (!raw) return null;
            return JSON.parse(raw) as { pendingCount?: unknown; lastError?: unknown };
          }),
        { timeout: 15_000 }
      )
      .toEqual(expect.objectContaining({ pendingCount: 0, lastError: null }));

    // The persisted outbox empties once the debounced nv_store_v1 write lands.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const raw = localStorage.getItem("nv_store_v1");
            if (!raw) return -1;
            const parsed = JSON.parse(raw) as { state?: { pending?: unknown[] } };
            return parsed.state?.pending?.length ?? -1;
          }),
        { timeout: 15_000 }
      )
      .toBe(0);
  });
});

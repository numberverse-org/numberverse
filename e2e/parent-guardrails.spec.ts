/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect, type Page } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * e2e-scenario "parent-guardrails" — the parent dashboard's guardrail actions
 * (settings save: band lock, per-weekday time limits, quiet hours; plus the
 * danger-zone delete) had zero Playwright coverage. This spec proves the full
 * loop against the REAL shipped bundles with the /api surface mocked:
 *
 *   portal dashboard (set + "Save settings") → PUT /kids/:id/settings
 *   → reload dashboard (GET reads the saved payload back, chips stay locked)
 *   → kid app on "/" (GET /settings → caches the SAME enforced values on-device)
 *
 * No live account is created: the shared parent session, local kid roster and
 * the kid→server mapping are seeded in localStorage (the exact keys the portal
 * and kid app share on the single origin), and the mock backend owns the kid.
 */

const LOCAL_KID_ID = "local-kid-e2e";
const SERVER_KID_ID = "server-kid-1";
const KID_NAME = "Aria";
/** The mock backend's issued token — /auth/me rejects any other bearer. */
const PARENT_TOKEN = "e2e-token";
/** Monday 60m, the rest untouched (defaults: 45 school / 90 weekend). */
const WEEKDAY_LIMIT_MON_60 = "60,45,45,45,45,90,90";

/** Seed the shared-origin localStorage exactly like a real parent session that
 *  already added one kid (see apps/kid/src/api.ts LS map + loadKids). */
async function seedSharedParentSession(page: Page): Promise<void> {
  await page.addInitScript(
    ({ localKidId, serverKidId, kidName, parentToken }) => {
      try {
        localStorage.setItem("nv_seen_welcome", "1");
        localStorage.setItem("nv_parent_onboarded", "1");
        localStorage.setItem("nv_parent_token", parentToken);
        localStorage.setItem("nv_parent_name", "Test Parent");
        localStorage.setItem("nv_lang", "en");
        localStorage.setItem(
          "nv_kids",
          JSON.stringify([{ id: localKidId, name: kidName, avatar: "🦊", birthYear: 2020 }])
        );
        localStorage.setItem("nv_kid_id", localKidId);
        localStorage.setItem("nv_kid_map", JSON.stringify({ [localKidId]: serverKidId }));
      } catch {
        /* private browsing — the DOM/API assertions below still run */
      }
    },
    {
      localKidId: LOCAL_KID_ID,
      serverKidId: SERVER_KID_ID,
      kidName: KID_NAME,
      parentToken: PARENT_TOKEN,
    }
  );
}

test.describe("parent dashboard guardrails", () => {
  test.use({ serviceWorkers: "block" });

  test("band lock + daily time limit + quiet hours save, survive reload, and reach the kid app", async ({ page }) => {
    const api = createMockApiState();
    api.kids.push({ id: SERVER_KID_ID, name: KID_NAME, avatar: "🦊", birth_year: 2020 });
    await mockNumberverseApi(page, api);
    await seedSharedParentSession(page);

    // 1. DASHBOARD — the seeded kid is listed in the family switcher.
    await page.goto("/parent/");
    await expect(page.locator(".kid-name").filter({ hasText: KID_NAME })).toBeVisible();

    // 2. EDIT GUARDRAILS — lock worlds to 3, cap Monday at 60m, switch quiet hours ON.
    const controls = page.locator("#controls");
    await controls.scrollIntoViewIfNeeded();
    await controls.getByRole("button", { name: "World 3" }).click();
    await controls
      .getByRole("group", { name: "Monday playtime" })
      .getByRole("button", { name: "60m" })
      .click();
    await controls.getByRole("button", { name: "🌙 Quiet hours on" }).click();

    // 3. SAVE — assert the exact PUT payload the portal sent to /settings.
    await controls.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/✓ Saved/)).toBeVisible();
    await expect.poll(() => api.settingsCalls.filter((c) => c.method === "PUT").length).toBe(1);
    const put = api.settingsCalls.find((c) => c.method === "PUT");
    expect(put?.kidId).toBe(SERVER_KID_ID);
    expect(put?.body.max_band).toBe(3);
    expect(put?.body.weekday_limits_min).toBe(WEEKDAY_LIMIT_MON_60);
    expect(put?.body.quiet_enabled).toBe(true);

    // 4. RELOAD — the dashboard re-reads the enforced values from the mock and
    //    the chips reflect the saved state (not the pre-edit defaults).
    await page.goto("/parent/");
    await expect(page.locator(".kid-name").filter({ hasText: KID_NAME })).toBeVisible();
    const reloaded = page.locator("#controls");
    await reloaded.scrollIntoViewIfNeeded();
    await expect(reloaded.getByRole("button", { name: "World 3" })).toHaveClass(/on/);
    await expect(
      reloaded.getByRole("group", { name: "Monday playtime" }).getByRole("button", { name: "60m" })
    ).toHaveClass(/on/);
    await expect(reloaded.getByRole("button", { name: "🌙 Quiet hours on" })).toHaveClass(/on/);

    // 5. KID APP — the same shared session opens "/" and fetches the settings;
    //    the enforced values land in its on-device cache (nv_kid_settings),
    //    which is what the runtime uses to cap play and filter worlds.
    await page.goto("/");
    await expect
      .poll(
        async () =>
          page.evaluate((kidId: string) => {
            const raw = localStorage.getItem("nv_kid_settings");
            if (!raw) return null;
            const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
            return parsed[kidId] ?? null;
          }, LOCAL_KID_ID),
        { timeout: 15_000 }
      )
      .toEqual(
        expect.objectContaining({
          max_band: 3,
          weekday_limits_min: WEEKDAY_LIMIT_MON_60,
          quiet_enabled: true,
        })
      );
  });

  test("danger zone delete removes the kid from the family", async ({ page }) => {
    const api = createMockApiState();
    api.kids.push({ id: SERVER_KID_ID, name: KID_NAME, avatar: "🦊", birth_year: 2020 });
    await mockNumberverseApi(page, api);
    await seedSharedParentSession(page);

    // Dashboard with the seeded kid.
    await page.goto("/parent/");
    await expect(page.locator(".kid-name").filter({ hasText: KID_NAME })).toBeVisible();

    // Danger zone: two-tap confirm — "Delete…" then "Yes, delete".
    await page.locator("#edit-kid").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Delete…" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    // The mock backend actually removed the kid (DELETE /kids/:id), and the
    // dashboard re-fetched the family, so the kid chip disappears.
    await expect.poll(() => api.kids.length).toBe(0);
    await expect(page.locator(".kid-name").filter({ hasText: KID_NAME })).not.toBeVisible();
  });
});

/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * #926 — the kid ↔ parent journey (signup → play → portal → logout) had zero
 * e2e coverage. The kid PWA and the parent portal share one origin in the
 * shipped build, so `nv_parent_token` set by the portal signup is the SAME
 * localStorage key the kid app reads. The backend is mocked (no live account);
 * only the shared-origin storage + the real bundles are under test.
 */

test.describe("kid ↔ parent journey", () => {
  test.use({ serviceWorkers: "block" });

  test("signup on the portal → play as the kid → portal sees the kid → logout", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);

    // The one-time welcome is a device flag, not an account flag. Skip it so
    // the shared parent session flows straight into kid setup.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("nv_seen_welcome", "1");
      } catch {
        /* ignore */
      }
    });

    // 1. SIGNUP — parent portal creates the account and stores the shared token.
    await page.goto("/parent/signup");
    await page.getByPlaceholder("Your name").fill("Test Parent");
    await page.getByPlaceholder("Parent email").fill("parent@example.com");
    await page.getByPlaceholder("Password (at least 8 characters)").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/Account created — signed in as/)).toBeVisible();

    // 2. PLAY — the kid app sees the shared parent session and lands on add-kid.
    await page.goto("/");
    await expect(page.locator("#kid-name")).toBeVisible();
    await page.locator("#kid-name").fill("Aria");
    await page.getByRole("button", { name: /✨ Save/ }).click();
    await expect(page.locator(".play-btn")).toBeVisible();
    await expect(page.locator(".play-btn")).toContainText(/Play/);

    // The kid app mapped the local kid to a server kid through the mock API.
    await expect.poll(() => api.kids.length, { timeout: 15_000 }).toBe(1);
    expect(api.kids[0].name).toBe("Aria");

    // 3. PORTAL — the same shared token opens the dashboard and shows that kid.
    await page.goto("/parent/");
    await expect(page.locator(".kid-name").filter({ hasText: "Aria" })).toBeVisible();

    // 4. LOGOUT — the portal revokes the session and returns to the login gate.
    // exact:true — "Sign out" would also substring-match "Sign out of all devices".
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByText(/Sign in to manage/)).toBeVisible();
    expect(api.logoutCalls).toBeGreaterThan(0);
  });
});

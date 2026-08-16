/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect, type Page } from "@playwright/test";
import { createMockApiState, mockNumberverseApi, type MockApiState } from "./lib/apiMocks";

/**
 * #??? — session-management journeys (revoke a device, change password, sign
 * out of all devices, re-login, revoked-token rejection) had zero e2e coverage.
 *
 * The real shipped parent portal is driven against the mocked /api surface:
 * we pre-seed two sessions (this device + an old phone), revoke the old one,
 * change the password, verify the old credential no longer logs in, sign back
 * in with the new password, and finally prove a revoked token bounces at the
 * gate.  A second test proves "sign out of all devices" kills every session.
 */

/** Shared helper: sign in through the portal login page and land on the
 *  dashboard.  Expects `api.password` to already match the credential the
 *  login form will submit. */
async function signInAndOpenDashboard(page: Page, api: MockApiState): Promise<void> {
  await page.goto("/parent/login");
  await page.getByPlaceholder("Parent email").fill("parent@example.com");
  await page.getByPlaceholder("Password").fill(api.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/Signed in as/)).toBeVisible();
  await page.getByRole("link", { name: /Open dashboard/ }).click();
}

test.describe("session management", () => {
  test.use({ serviceWorkers: "block" });

  test("revoke a device → change password → re-login → revoked token rejected", async ({ page }) => {
    const api = createMockApiState();

    // Pre-seed one kid (the AccountCard only renders with an active kid) and
    // two sessions: the current browser + an old iPhone still logged in.
    api.kids.push({ id: "server-kid-1", name: "Aria", avatar: "🦊", birth_year: 2020 });
    api.sessions.push(
      {
        id: "sess-current",
        token: "e2e-token",
        created_at: new Date(Date.now() - 60_000).toISOString(),
        last_seen_at: new Date(Date.now() - 60_000).toISOString(),
        user_agent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        ip: "203.0.113.1",
        current: true,
        revoked: false,
      },
      {
        id: "sess-old-iphone",
        token: "e2e-revoked-token",
        created_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        last_seen_at: new Date(Date.now() - 86_400_000).toISOString(),
        user_agent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        ip: "198.51.100.7",
        current: false,
        revoked: false,
      },
    );

    await mockNumberverseApi(page, api);

    // Skip the one-time onboarding wizard so the dashboard lands directly on
    // the full view with the account card visible.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("nv_parent_onboarded", "1");
      } catch {
        /* ignore */
      }
    });

    // ── 1. SIGN IN ────────────────────────────────────────────────────────
    await signInAndOpenDashboard(page, api);
    // The dashboard loads and the active-logins block in the AccountCard
    // should show both the current device and the old iPhone.
    await expect(page.locator(".session-row").filter({ hasText: "iPhone" })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".session-row").filter({ hasText: "This device" })).toBeVisible();
    // The mock tracks the server-side login call.
    expect(api.loginCalls).toBeGreaterThanOrEqual(1);

    // ── 2. REVOKE THE OLD DEVICE ──────────────────────────────────────────
    // Click "Sign out" on the iPhone row — this arms the two-tap inline
    // confirm (never window.confirm, so headless tests can click through).
    await page
      .locator(".session-row")
      .filter({ hasText: "iPhone" })
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    // Click the confirm button that appears next.
    await page
      .locator(".session-row")
      .filter({ hasText: "iPhone" })
      .getByRole("button", { name: /Confirm sign out/ })
      .click();

    // The portal shows a success message and re-fetches sessions. The iPhone
    // row must disappear because the mock marks it revoked.
    await expect(page.getByText("That device was signed out.")).toBeVisible();
    // The row should be gone from the DOM.
    await expect(page.locator(".session-row").filter({ hasText: "iPhone" })).toHaveCount(0, { timeout: 15_000 });
    // Server-side: the mock recorded the revoke call.
    expect(api.revokeCalls).toBe(1);
    // The old session token is now revoked in the mock state.
    const oldSession = api.sessions.find((s) => s.id === "sess-old-iphone");
    expect(oldSession?.revoked).toBe(true);

    // ── 3. CHANGE PASSWORD ────────────────────────────────────────────────
    // The AccountCard's change-password form (visible because the mock
    // profile has no auth_provider → not a Google account).
    // exact:true — "New password" is a substring of "Confirm new password", so
    // the default substring match would be ambiguous.
    await page.getByLabel("Current password", { exact: true }).fill("password123");
    await page.getByLabel("New password", { exact: true }).fill("newpassword456");
    await page.getByLabel("Confirm new password", { exact: true }).fill("newpassword456");
    await page.getByRole("button", { name: "Change password" }).click();

    await expect(page.getByText(/Password changed/)).toBeVisible();
    expect(api.changePasswordCalls).toBe(1);
    // The mock updated the stored credential.
    expect(api.password).toBe("newpassword456");

    // Per the #265 security contract, the change-password handler also
    // revoked every OTHER session. The old iPhone session was already
    // revoked above; the current session stays alive.
    const currentSession = api.sessions.find((s) => s.id === "sess-current");
    expect(currentSession?.revoked).toBe(false);

    // ── 4. SIGN OUT FROM THE TOPBAR ───────────────────────────────────────
    await page
      .locator("header.topbar")
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    // The portal gate should now show the login prompt.
    await expect(page.getByText(/Sign in to manage/)).toBeVisible();

    // ── 5. OLD PASSWORD REJECTED ──────────────────────────────────────────
    await page.goto("/parent/login");
    await page.getByPlaceholder("Parent email").fill("parent@example.com");
    await page.getByPlaceholder("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Sign in failed — check email and password.")).toBeVisible();

    // ── 6. RE-LOGIN WITH THE NEW PASSWORD ─────────────────────────────────
    await page.getByPlaceholder("Password").fill("newpassword456");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Signed in as/)).toBeVisible();
    // The mock recorded two successful logins (initial + re-login).
    expect(api.loginCalls).toBeGreaterThanOrEqual(2);

    // ── 7. REVOKED TOKEN BOUNCES AT THE GATE ──────────────────────────────
    // Seed the stale, now-revoked iPhone session token into the shared parent
    // storage (the same key the kid app and portal both read) and reload.
    await page.evaluate(() => {
      localStorage.setItem("nv_parent_token", "e2e-revoked-token");
    });
    await page.goto("/parent/");
    // The portal gate should reject the revoked token and show the login
    // screen with a session-ended message.
    await expect(page.getByText(/Your session ended/)).toBeVisible();
    await expect(page.getByText(/Sign in to manage/)).toBeVisible();
    // The mock's /auth/me returned 401 for the revoked token.
    expect(api.rejectedMeCalls).toBeGreaterThanOrEqual(1);
  });

  test("sign out of all devices revokes every session", async ({ page }) => {
    const api = createMockApiState();

    // Same seed: one kid + two sessions.
    api.kids.push({ id: "server-kid-1", name: "Aria", avatar: "🦊", birth_year: 2020 });
    api.sessions.push(
      {
        id: "sess-current",
        token: "e2e-token",
        created_at: new Date(Date.now() - 60_000).toISOString(),
        last_seen_at: new Date(Date.now() - 60_000).toISOString(),
        user_agent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        ip: "203.0.113.1",
        current: true,
        revoked: false,
      },
      {
        id: "sess-old-iphone",
        token: "e2e-revoked-token",
        created_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        last_seen_at: new Date(Date.now() - 86_400_000).toISOString(),
        user_agent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        ip: "198.51.100.7",
        current: false,
        revoked: false,
      },
    );

    await mockNumberverseApi(page, api);
    await page.addInitScript(() => {
      try {
        localStorage.setItem("nv_parent_onboarded", "1");
      } catch {
        /* ignore */
      }
    });

    // Sign in and land on the dashboard.
    await signInAndOpenDashboard(page, api);
    await expect(page.locator(".session-row").filter({ hasText: "This device" })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".session-row").filter({ hasText: "iPhone" })).toBeVisible();

    // Click "Sign out of all devices" — the button inside the AccountCard's
    // active-logins block.
    await page.getByRole("button", { name: "Sign out of all devices" }).click();

    // The portal signs out locally and lands on the login gate.
    await expect(page.getByText(/Sign in to manage/)).toBeVisible();
    // The mock recorded the server-side logout-all call.
    expect(api.logoutAllCalls).toBe(1);
    // Every session row in the mock state is now revoked.
    for (const s of api.sessions) {
      expect(s.revoked).toBe(true);
    }
  });
});

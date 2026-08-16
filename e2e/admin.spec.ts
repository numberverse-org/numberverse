/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect } from "@playwright/test";
import { createMockApiState, mockAdminApi, mockNumberverseApi } from "./lib/apiMocks";

/**
 * #935 — the admin console (apps/admin, the react-admin SPA shipped under
 * /admin/ on the same origin) had zero e2e coverage. This spec drives the REAL
 * deployed bundle through login → profiles list → one edit save against a fully
 * mocked /api/v1 surface, so no live account or production data is touched.
 *
 * The admin console is a separate SPA from the kid app/portal: it keeps its own
 * `nv_admin_token` localStorage key and talks ra-data-simple-rest to
 * /api/v1/admin/*. mockNumberverseApi provides the safety-net catch-all plus the
 * shared auth routes; mockAdminApi (registered after it, so its routes win) answers
 * auth/login with an ADMIN profile and serves the resource + dashboard routes.
 */

test.describe("admin console", () => {
  test.use({ serviceWorkers: "block" });

  /** Operator rows GET_LIST/GET_ONE/UPDATE serve, and what an edit mutates. */
  const ADMIN_PROFILES = [
    {
      id: 1,
      email: "parent@example.com",
      display_name: "Test Parent",
      is_admin: false,
      aggregate_opt_in: true,
      created_at: "2026-07-01T09:00:00.000Z",
    },
    {
      id: 2,
      email: "river@example.com",
      display_name: "River Parent",
      is_admin: false,
      aggregate_opt_in: false,
      created_at: "2026-07-15T10:30:00.000Z",
    },
  ];

  test("login → list profiles → edit save", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);
    await mockAdminApi(page, api, ADMIN_PROFILES);

    // 1. LOGIN — the anonymous gate redirects to react-admin's default login
    //    page. The admin authProvider posts { email, password } to /auth/login
    //    and requires the returned profile to be an admin.
    await page.goto("/admin/");
    // MUI renders the required label as "Username *" — a substring match (no exact).
    await expect(page.getByLabel("Username")).toBeVisible();
    await page.getByLabel("Username").fill("parent@example.com");
    // MUI required label is "Password *" and the eye toggle carries aria-label
    // "Show password" — both substring-match getByLabel. Pin the actual control:
    await page.locator('input[name="password"]').fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    // The dashboard rendered from the mocked /admin/stats + story-health routes.
    await expect(page.getByRole("heading", { name: "Numberverse Console" })).toBeVisible();
    await expect.poll(() => api.adminLoginCalls, { timeout: 15_000 }).toBe(1);

    // 2. LIST PROFILES — the resource menu item opens /#/profiles; the guessed
    //    datagrid renders rows straight from the mocked GET_LIST.
    await page.getByText("Profiles", { exact: true }).click();
    await expect(page.getByText("parent@example.com")).toBeVisible();
    await expect(page.getByText("river@example.com")).toBeVisible();

    // 3. EDIT SAVE — a row click lands on the SHOW view (react-admin's default
    //    row-click order prefers Show), so tap the Edit action to open
    //    ProfilesEdit, which GETs the record and renders the typed form
    //    (email / display_name / aggregate_opt_in).
    await page.getByText("Test Parent", { exact: true }).click();
    await expect(page.getByText("Profile #1")).toBeVisible();
    await page.getByRole("link", { name: "Edit" }).click();  // react-admin renders the action as a link
    await expect(page.getByLabel("Display name")).toHaveValue("Test Parent");
    await page.getByLabel("Display name").fill("Test Parent Edited");
    await page.getByRole("button", { name: "Save" }).click();

    // UI confirmation FIRST — the "Element updated" toast is short-lived
    // (auto-dismisses), so assert it before the slower payload polls below.
    await expect(page.getByText(/Element updated/)).toBeVisible();

    // The save PUT round-tripped through the mocked backend — prove the payload
    // the operator sent AND the persisted server row both changed.
    await expect.poll(() => api.adminProfileUpdates.length, { timeout: 15_000 }).toBe(1);
    expect(api.adminProfileUpdates[0].data.display_name).toBe("Test Parent Edited");
    expect(api.adminProfiles[0].display_name).toBe("Test Parent Edited");

    // <Edit>'s default redirect="list" lands back on the list, now with the new name.
    await expect(page.getByText("Test Parent Edited", { exact: true })).toBeVisible();
  });
});
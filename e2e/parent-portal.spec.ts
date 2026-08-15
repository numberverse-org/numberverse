/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * #927 — the parent portal (Next.js static export under /parent/) had zero
 * Playwright coverage. These specs prove the three faces of the gate — anon
 * redirect, signup i18n, and login success/failure — against the real shipped
 * pages with the API surface mocked so no live account is created.
 */

test.describe("parent portal", () => {
  test.use({ serviceWorkers: "block" });

  test("unauthenticated dashboard shows the login gate", async ({ page }) => {
    await page.goto("/parent/");
    await expect(page.getByRole("heading", { name: "Parent Portal" })).toBeVisible();
    await expect(page.getByText(/Sign in to manage/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to login/ })).toBeVisible();
  });

  test("signup page honors the saved Bangla language", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("nv_parent_lang", "bn");
      } catch {
        /* ignore */
      }
    });
    await page.goto("/parent/signup");
    await expect(page.getByRole("heading", { name: "আপনার অভিভাবক অ্যাকাউন্ট তৈরি করুন" })).toBeVisible();
    await expect(page.getByRole("button", { name: "অ্যাকাউন্ট তৈরি করুন" })).toBeVisible();
  });

  test("login failure shows a parent-facing error", async ({ page }) => {
    await page.route("**/api/v1/auth/login", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid credentials" }),
      })
    );
    await page.goto("/parent/login");
    await page.getByPlaceholder("Parent email").fill("wrong@example.com");
    await page.getByPlaceholder("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Sign in failed — check email and password.")).toBeVisible();
  });

  test("login success lands on the dashboard onboarding", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);
    await page.goto("/parent/login");
    await page.getByPlaceholder("Parent email").fill("parent@example.com");
    await page.getByPlaceholder("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Signed in as/)).toBeVisible();
    await page.getByRole("link", { name: /Open dashboard/ }).click();
    await expect(page.getByRole("heading", { name: /Welcome to Numberverse/ })).toBeVisible();
  });
});

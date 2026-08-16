/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * Age-band content gating from the kid's birth year (# journey.ts bandForAge /
 * kidBand) had no e2e. The journey is deliberately progress-based — "Worlds
 * unlock by progress, not age" is the app's own add-kid subtitle — so the
 * birth year must NOT change which world the HOME screen recommends. What it
 * MUST change is the age-graded reward surface: bands 1–4 keep the nursery pet
 * ("Your pet"), bands 5–8 (the BANDS catalog's older ages, e.g. Star Academy
 * 10–13) swap it for the mature Mission bar + the `nv-mature` register.
 *
 * This spec adds two kids on the same device at two birth years (age 5 → band
 * 2, age 10 → band 5) and asserts, per band:
 *   • the pet/mission reward world shown on home,
 *   • the mature-register copy (recap + challenge tiles), and
 *   • the `nv-mature` html class,
 * while ALSO asserting that the worlds/skills offered at home match BANDS —
 * both fresh kids are offered the band-1 world "Sprout Grove" (BANDS[0])
 * because unlocking is progress-driven, not birth-year-driven.
 * The backend is mocked (no live account); only the real shipped bundles run.
 */

test.describe("age-band content gating from birth year", () => {
  test.use({ serviceWorkers: "block" });

  test("kids at two birth years get different band surfaces (pet vs mission), matching BANDS", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);

    // Benign device seeds (see Rules): skip the one-time welcome + first-play
    // tour, pin English, and set the shared same-origin parent session so the
    // app opens straight on Add Kid (no portal signup needed for this test).
    await page.addInitScript(() => {
      try {
        localStorage.setItem("nv_seen_welcome", "1");
        localStorage.setItem("nv_tour_done", "1");
        localStorage.setItem("nv_lang", "en");
        localStorage.setItem("nv_parent_token", "e2e-token");
      } catch {
        /* ignore */
      }
    });

    const now = new Date();
    const thisYear = now.getFullYear();

    await page.goto("/");
    await expect(page.locator("#kid-name")).toBeVisible();

    // ── 1. MAYA — born thisYear-5 → age 5 → bandForAge: band 2 (Cottage
    //    Fields, ages 4–6 per BANDS). Bands 1–4 keep the nursery pet world.
    await page.locator("#kid-name").fill("Maya");
    // The Add-Kid form defaults birth year to thisYear-5 (age 5 today).
    await expect(page.locator(".year-num").first()).toHaveText(String(thisYear - 5));
    await page.getByRole("button", { name: /✨ Save/ }).click();

    // Maya's home — band 2 → the caring pet world, not the mission world.
    await expect(page.locator(".play-btn")).toBeVisible();
    await expect(page.locator(".pet-card")).toBeVisible();
    await expect(page.locator(".pet-card")).toContainText("Your pet");
    await expect(page.locator(".mission-card")).toHaveCount(0);
    // band 2 < 5 → the mature register stays OFF.
    await expect(page.locator("html")).not.toHaveClass(/nv-mature/);
    // Age does not change the recommended world: a fresh journey starts in
    // BANDS[0] "Sprout Grove" (worlds unlock by progress, not age).
    await expect(page.locator(".play-btn")).toContainText("Sprout Grove");
    // Young register copy (existing i18n, not new strings).
    await expect(page.locator(".recap-card")).toContainText("Star of the Week");
    await expect(page.locator(".challenge-card")).toContainText("Beat Nova");
    // The local kid was mapped to the mock server with the birth year intact.
    await expect.poll(() => api.kids.length, { timeout: 15_000 }).toBe(1);
    expect(api.kids[0].name).toBe("Maya");
    expect(api.kids[0].birth_year).toBe(thisYear - 5);

    // ── 2. ZAYN — born thisYear-10 → age 10 → bandForAge: band 5 (Star
    //    Academy, ages 10–13 per BANDS). Bands 5–8 swap the pet for the
    //    mature Mission bar (streak / badges / achievements hunt).
    await page.locator(".kid-chip").click(); // home → kid picker
    await expect(page.getByRole("button", { name: /Add a kid/ })).toBeVisible();
    await page.getByRole("button", { name: /Add a kid/ }).click();
    await expect(page.locator("#kid-name")).toBeVisible();
    await page.locator("#kid-name").fill("Zayn");
    // Drive the birth-year picker to the oldest reachable age: the form's
    // MIN_BIRTH_YEAR is thisYear-10, i.e. exactly age 10 → band 5 (mature).
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: "year down" }).click();
    }
    await expect(page.locator(".year-num").first()).toHaveText(String(thisYear - 10));
    await page.getByRole("button", { name: /✨ Save/ }).click();

    // Zayn's home — band 5 → the mature Mission world, not the nursery pet.
    await expect(page.locator(".play-btn")).toBeVisible();
    await expect(page.locator(".mission-card")).toBeVisible();
    await expect(page.locator(".mission-card")).toContainText("Mission");
    await expect(page.locator(".mission-card")).toContainText(/0-day streak/);
    await expect(page.locator(".mission-card")).toContainText(/0 badges/);
    await expect(page.locator(".mission-card")).toContainText(/0 achievements/);
    await expect(page.locator(".pet-card")).toHaveCount(0);
    // band 5 ≥ 5 → the mature register flips ON.
    await expect(page.locator("html")).toHaveClass(/nv-mature/);
    // Same BANDS[0] opening world — only the reward surface is age-gated.
    await expect(page.locator(".play-btn")).toContainText("Sprout Grove");
    // Mature register copy (existing i18n).
    await expect(page.locator(".recap-card")).toContainText("Weekly Summary");
    await expect(page.locator(".challenge-card")).toContainText("Math Duel");

    // Both kids exist on the mock server with their two birth years.
    await expect.poll(() => api.kids.length, { timeout: 15_000 }).toBe(2);
    expect(api.kids[1].name).toBe("Zayn");
    expect(api.kids[1].birth_year).toBe(thisYear - 10);
    const birthYears = api.kids.map((k) => k.birth_year).sort();
    expect(birthYears).toEqual([thisYear - 10, thisYear - 5].sort());
  });
});

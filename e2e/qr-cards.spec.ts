/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect, type Page } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * #1345 (flashcard QR deck) + #139 (home scan sheet) — the printable
 * "QR cards" generator and the QR → game-launch round-trip had zero e2e
 * coverage. This spec proves the FULL loop against the real shipped bundles
 * with the /api surface mocked:
 *
 *   1. Sign in through the parent portal, create a kid, and mock the server
 *      mastery fold with "played" skills: the counting ladder's first skill
 *      has crossed the mastery bar, the second is mid-progress.
 *   2. Reload so the boot restore pulls that mastery into the local store,
 *      open the parent panel (first-time PIN setup), and generate the QR deck.
 *      A card reading `NV:<skillId>` must be produced — and the mastered skill
 *      must have dropped out of the deck (the "played" verdict is real).
 *   3. Back on the kid's home screen, open the Scan-a-card sheet, type the
 *      printed code (the manual fallback — no camera on CI), and assert the
 *      SAME skill's game scene launches.
 *
 * Every server call is mocked; no live account is created.
 */

const PIN = "1234";

/** Tap a 4-digit code on the parent-PIN pad (the only interaction the gate has
 *  besides skip — the panel itself is reachable only through it). */
async function enterParentPin(page: Page, code: string): Promise<void> {
  for (const digit of code) {
    await page.locator(".pin-pad").getByRole("button", { name: digit, exact: true }).click();
  }
}

test.describe("worksheet + QR-card generation and the QR → game round-trip", () => {
  test.use({ serviceWorkers: "block" });

  test("print a QR card for a played skill, then scan that code on Home to launch its game", async ({ page }) => {
    const api = createMockApiState();
    // The count ladder is the simulator of "played skills": count-1-10 is
    // mastered (drops out of the default deck), number-song is mid-progress
    // and therefore the FIRST card a fresh deck produces.
    api.mastery = [
      { skillId: "count-1-10", mastery: 0.95, correct: 12, attempts: 14, streak: 6 },
      { skillId: "number-song", mastery: 0.4, correct: 6, attempts: 10, streak: 3 },
    ];
    await mockNumberverseApi(page, api);

    // One-time welcome + language are device flags; pin them so the shared
    // parent session flows straight into kid setup in English.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("nv_seen_welcome", "1");
        localStorage.setItem("nv_tour_done", "1");
        localStorage.setItem("nv_lang", "en");
      } catch {
        /* private browsing — DOM assertions below still run */
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
    await expect.poll(() => api.kids.length, { timeout: 15_000 }).toBe(1);

    // 3. RELOAD — the boot restore's 5-minute throttle is per-app-boot, so a
    // fresh load AFTER the kid exists pulls the mocked played mastery into the
    // store (the flashcard deck seeds from it). Wait for the snapshot fetch so
    // the deck below is a verdict on real restored mastery, not an empty map.
    await page.reload();
    await expect(page.locator(".play-btn")).toBeVisible();
    await expect.poll(() => api.snapshotCalls, { timeout: 15_000 }).toBeGreaterThan(0);

    // 4. PARENT PANEL — open the grown-up corner. A brand-new device has no PIN,
    // so the gate walks the mandatory first-time setup (set → confirm), then
    // asks for a recovery question — which we skip for now.
    await page.getByRole("button", { name: "Parents", exact: true }).click();
    await expect(page.locator(".pin-pad")).toBeVisible();
    await enterParentPin(page, PIN);
    await expect(page.locator(".pin-pad")).toBeVisible(); // confirm step
    await enterParentPin(page, PIN);
    // First-time setup lands on the recovery-question picker; skip it.
    await expect(page.getByRole("button", { name: "Skip for now", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now", exact: true }).click();
    await expect(page.getByText("Flashcard codes")).toBeVisible();

    // 5. QR CARDS — the panel's flashcard card opens the picker; the picker's
    // Print button renders the print sheet and draws the QR rasters offline.
    await page.getByRole("button", { name: /Print flashcards/ }).click();
    await page.getByRole("button", { name: /Print flashcards/ }).click();
    const firstCardCode = page.locator(".fc-card-code").first();
    await expect(firstCardCode).toBeVisible();
    await expect(firstCardCode).toHaveText(/^NV:[A-Za-z0-9-]+$/);
    // A real QR raster (data URL) was drawn — not just the text fallback.
    await expect(page.locator(".fc-card .fc-qr img").first()).toBeVisible();

    // The deck reflects the mocked played mastery: the mastered count-1-10 is
    // gone, so the FIRST card is the mid-progress number-song.
    const code = ((await firstCardCode.textContent()) ?? "").trim();
    const title = ((await page.locator(".fc-card-title").first().textContent()) ?? "").trim();
    expect(code).toBe("NV:number-song");
    expect(title).toBe("Number song");

    // 6. ROUND-TRIP — back on the kid's home screen (fresh load), open the
    // Scan-a-card sheet and type the printed code (manual fallback — the
    // camera path is exercised by decode-unit tests, not in a browser).
    await page.goto("/");
    await expect(page.locator(".play-btn")).toBeVisible();
    await page.getByRole("button", { name: "Scan a card" }).click();
    await expect(page.locator(".scan-sheet")).toBeVisible();
    await page.locator(".scan-input").fill(code);
    await page.getByRole("button", { name: "Open game" }).click();

    // 7. ASSERT — the expected scene launched: the HUD is up and names the
    // exact skill the printed card encoded (and the scan sheet has closed).
    await expect(page.locator(".scan-sheet")).toBeHidden();
    await expect(page.locator(".hud")).toBeVisible();
    await expect(page.locator(".hud-skill")).toHaveText(title);
  });
});

/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect, type Page } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * #86 — the parent-area PIN gate had zero e2e coverage. A signed-in parent's
 * panel is protected by a 4-digit, per-device PIN (PBKDF2-salted hash stored in
 * localStorage, never the raw PIN). Every path to the panel runs through the
 * same render gate in App.tsx:
 *   · no PIN set yet        → mandatory setup pad (new PIN → confirm)
 *   · PIN set + not verified → unlock pad (3 wrong tries → lockout)
 *   · PIN verified          → the panel
 * When the pad locks, the parent recovers IN PLACE via the #247 security
 * question (fully offline, no sign-out, no account lockout).
 *
 * This spec drives the REAL shipped bundles against the mock /api surface: it
 * signs the parent in through the portal signup (mock API), adds a kid, taps
 * the home "Parents" door, completes first-time PIN setup, re-enters to unlock,
 * then proves three wrong attempts lock the pad and that the offline Q&A
 * recovery clears the PIN and lets the parent set a new one.
 *
 * The kid app ships a heavy Phaser runtime and this host routinely runs many
 * e2e jobs in parallel, so the journey gets a generous time budget and
 * transitions are given explicit 30s expect windows.
 */

const PARENT_PIN = "1234";
const WRONG_PIN = "9999";
const QA_ANSWER = "blue";
const TRANSITION = { timeout: 30_000 } as const;

test.describe("parent PIN gate", () => {
  test.describe.configure({ timeout: 300_000 });
  test.use({ serviceWorkers: "block" });

  /** Tap the 4-digit keypad keys one at a time (auto-submits on the 4th digit). */
  async function enterPin(page: Page, digits: string): Promise<void> {
    for (const d of digits) {
      await page.getByRole("button", { name: d, exact: true }).click();
    }
  }

  test("setup → unlock → 3-try lockout → offline Q&A recovery", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);

    // The one-time welcome and the #356 first-play tour are device flags, not
    // account flags. Skip both so the journey flows straight into the parent
    // area: the tour overlay would otherwise intercept the "Parents" door tap.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("nv_seen_welcome", "1");
        localStorage.setItem("nv_tour_done", "1");
        localStorage.setItem("nv_lang", "en");
      } catch {
        /* ignore */
      }
    });

    // ── 1. SIGN IN — parent portal signup creates the account and stores the
    // shared-origin `nv_parent_token` (mock API; no live account is created).
    await page.goto("/parent/signup", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Your name").fill("Test Parent");
    await page.getByPlaceholder("Parent email").fill("parent@example.com");
    await page.getByPlaceholder("Password (at least 8 characters)").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/Account created — signed in as/)).toBeVisible(TRANSITION);

    // ── 2. PLAY — the kid app sees the shared parent session and lands on
    // add-kid; adding a kid opens the home screen where the Parents door lives.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#kid-name")).toBeVisible(TRANSITION);
    await page.locator("#kid-name").fill("Aria");
    await page.getByRole("button", { name: /✨ Save/ }).click();
    await expect(page.locator(".play-btn")).toBeVisible(TRANSITION);
    await expect.poll(() => api.kids.length, { timeout: 30_000 }).toBe(1);

    // ── 3. PARENT DOOR → FIRST-TIME PIN SETUP (no PIN on this device yet).
    // The door re-arms the gate every time it opens, so the pad is mandatory.
    await page.getByRole("button", { name: "Parents", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Set a parent PIN" })).toBeVisible(TRANSITION);
    await expect(
      page.getByText("Choose a 4-digit PIN — you'll need it every time the parent area opens")
    ).toBeVisible(TRANSITION);

    await enterPin(page, PARENT_PIN);
    await expect(page.getByRole("heading", { name: "Confirm your PIN" })).toBeVisible(TRANSITION);
    await expect(page.getByText("Enter the same 4 digits again")).toBeVisible(TRANSITION);
    await enterPin(page, PARENT_PIN);

    // The salted hash lands in localStorage (never the raw PIN).
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("nv_parent_pin")), {
        timeout: 30_000,
      })
      .toBeTruthy();

    // First-time setup steps straight into the #247 recovery-question flow so a
    // forgotten PIN is recoverable from day one. Set it (skip is also allowed,
    // but the lockout recovery below needs it).
    await expect(page.getByRole("heading", { name: "Pick a recovery question" })).toBeVisible(
      TRANSITION
    );
    await page.getByRole("button", { name: "What is your favourite colour?" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByPlaceholder("Type your answer").fill(QA_ANSWER);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByPlaceholder("Repeat your answer").fill(QA_ANSWER);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // The PIN-verified parent panel opens behind the gate. (The panel greets
    // with the generic "Hi Parent" copy, not the profile display name, so
    // assert the panel heading.)
    await expect(page.getByRole("heading", { name: "Parent Panel" })).toBeVisible(TRANSITION);

    // ── 4. RE-ENTER → UNLOCK with the correct PIN. A fresh load lands back on
    // home (kid + parent session persist), and the door re-arms the unlock pad.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".play-btn")).toBeVisible(TRANSITION);
    await page.getByRole("button", { name: "Parents", exact: true }).click();
    await expect(page.getByRole("heading", { name: "🔒 Parent PIN" })).toBeVisible(TRANSITION);
    await expect(page.getByText("Enter the 4-digit PIN to open the parent area")).toBeVisible(
      TRANSITION
    );

    await enterPin(page, PARENT_PIN);
    await expect(page.getByRole("heading", { name: "Parent Panel" })).toBeVisible(TRANSITION);

    // ── 5. THREE WRONG ATTEMPTS → LOCKOUT. The pad counts 3 tries, shows the
    // remaining count, then hides the keypad and demands recovery.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".play-btn")).toBeVisible(TRANSITION);
    await page.getByRole("button", { name: "Parents", exact: true }).click();

    await enterPin(page, WRONG_PIN);
    await expect(page.getByText("Wrong PIN — 2 tries left")).toBeVisible(TRANSITION);

    await enterPin(page, WRONG_PIN);
    await expect(page.getByText("Wrong PIN — 1 try left")).toBeVisible(TRANSITION);

    await enterPin(page, WRONG_PIN);
    await expect(page.getByRole("heading", { name: "PIN pad locked" })).toBeVisible(TRANSITION);
    await expect(
      page.getByText("Too many wrong tries. Answer your security question to reset the PIN here.")
    ).toBeVisible(TRANSITION);
    await expect(page.locator(".pin-pad")).toBeHidden();
    await expect(page.getByRole("button", { name: "Forgot PIN?" })).toBeVisible(TRANSITION);

    // ── 6. OFFLINE RECOVERY via the security question (#247). The Q&A is
    // verified against the local salted hash — no sign-out, no server round-trip.
    await page.getByRole("button", { name: "Forgot PIN?" }).click();
    await expect(page.getByRole("heading", { name: "Recover your PIN" })).toBeVisible(TRANSITION);
    await expect(page.getByText("What is your favourite colour?")).toBeVisible(TRANSITION);
    await page.getByPlaceholder("Type your answer").fill(QA_ANSWER);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // The old PIN is cleared and the setup pad reappears with a reset notice;
    // the parent sets a brand-new PIN. The Q&A is already in place, so the
    // first-time question flow is skipped.
    await expect(page.getByText("PIN reset — now set a new 4-digit PIN below.")).toBeVisible(
      TRANSITION
    );
    await expect(page.getByRole("heading", { name: "Set a parent PIN" })).toBeVisible(TRANSITION);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("nv_parent_pin")), {
        timeout: 30_000,
      })
      .toBeNull();

    await enterPin(page, PARENT_PIN);
    await expect(page.getByRole("heading", { name: "Confirm your PIN" })).toBeVisible(TRANSITION);
    await enterPin(page, PARENT_PIN);

    // The recovered parent is back inside the panel with a freshly hashed PIN.
    // (After a reset the panel greets "Hi Parent" — the generic fallback, not
    // the profile display name — so assert the panel heading.)
    await expect(page.getByRole("heading", { name: "Parent Panel" })).toBeVisible(TRANSITION);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("nv_parent_pin")), {
        timeout: 30_000,
      })
      .toBeTruthy();
  });
});

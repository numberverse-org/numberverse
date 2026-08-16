/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * #935 — The core gameplay loop (Play → Phaser scene → answer → done → progress)
 * had zero e2e coverage. This spec seeds a kid via the mock API, clicks Play,
 * waits for the Phaser canvas + first question, answers all 5 rounds of the
 * CountPop session (the first journey stop), and asserts the done screen appears
 * and a POST /api/v1/progress event is recorded.
 *
 * The Phaser scene is navigated via the keyboard/SR bridge (#785/#1005):
 * Home focuses the first answer button, Enter presses it. For CountPop this
 * pops the bubbles in order 1 → 2 → … → N across 5 rounds (targets 3, 4, 5, 7, 10).
 */

test.describe("core gameplay loop", () => {
  test.use({ serviceWorkers: "block" });

  test("play a full session: CountPop 5 rounds → done screen → progress POST", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);

    // Skip the one-time welcome screen so the parent session flows straight in.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("nv_seen_welcome", "1");
        localStorage.setItem("nv_tour_done", "1");
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

    // 2. ADD KID — the kid app sees the shared parent session and lands on add-kid.
    await page.goto("/");
    await expect(page.locator("#kid-name")).toBeVisible();
    await page.locator("#kid-name").fill("Aria");
    await page.getByRole("button", { name: /✨ Save/ }).click();
    await expect(page.locator(".play-btn")).toBeVisible();
    await expect(page.locator(".play-btn")).toContainText(/Play/);

    // The mock API received the kid creation (the background sync maps the
    // local kid to a server-side id).
    await expect.poll(() => api.kids.length, { timeout: 15_000 }).toBe(1);
    expect(api.kids[0].name).toBe("Aria");

    // 3. CLICK PLAY — start the session. The first journey stop is
    //    "count-1-10" → CountPopScene (pop bubbles 1→N in order).
    await page.locator(".play-btn").click();

    // 4. WAIT FOR PHASER CANVAS — the engine chunk loads asynchronously, then
    //    Phaser creates the canvas inside the game-wrap div.
    const canvas = page.locator(".game-wrap canvas");
    await expect(canvas).toBeVisible({ timeout: 25_000 });

    // Give the scene a moment to render the first round's bubbles.
    await page.waitForTimeout(1500);

    // Click the canvas to focus the game area so the keyboard bridge receives
    // key events (the bridge checks e.target === parent/canvas).
    await canvas.click();

    // 5. ANSWER ALL 5 ROUNDS — CountPop level targets: [3, 4, 5, 7, 10].
    //    The keyboard bridge (#785/#1005) navigates Phaser interactive buttons.
    //    Home → focus first button (bubble 1 in each round, then 2, 3, …).
    //    Enter → pop the focused bubble.
    //    After each pop the bubble is removed; the next button becomes first.
    const roundTargets = [3, 4, 5, 7, 10];
    for (const target of roundTargets) {
      for (let i = 0; i < target; i++) {
        await page.keyboard.press("Home");
        await page.waitForTimeout(60);
        await page.keyboard.press("Enter");
        // Wait for the pop animation (160ms tween + speech) before the next.
        await page.waitForTimeout(280);
      }
      // Wait for the inter-round delay (700ms in CountPop) + buffer.
      await page.waitForTimeout(1000);
    }

    // 6. ASSERT DONE SCREEN — after 5 rounds the app transitions to the done
    //    screen (ROUND_END_TO_DONE_MS = 1200ms after the last round). But a
    //    focused 5-round session crosses Moni's fatigue threshold, so the
    //    #327 well-being break interstitial appears FIRST ("Stretch time,
    //    Aria!"). "I'm good — keep going!" returns to the done screen so the
    //    celebration + next-round button are still there.
    await expect(
      page.locator(".done-screen, .break-screen").first()
    ).toBeVisible({ timeout: 15_000 });
    const breakGo = page.getByRole("button", { name: "I'm good — keep going!" });
    if (await breakGo.isVisible().catch(() => false)) {
      await breakGo.click();
    }
    await expect(page.locator(".done-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Amazing!")).toBeVisible();

    // 7. ASSERT PROGRESS POST — at least one batch of progress events was
    //    POSTed to /api/v1/progress with the correct kid_id and skill_id.
    await expect
      .poll(() => api.progressCalls.length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
    const posted = api.progressCalls[0] as {
      events?: Array<{ kid_id?: string; skill_id?: string; correct?: boolean }>;
    };
    expect(posted.events?.length).toBeGreaterThan(0);
    expect(posted.events?.[0]?.kid_id).toBe("server-kid-1");
    expect(posted.events?.[0]?.skill_id).toBe("count-1-10");
  });
});

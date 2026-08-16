/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect, type Page } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * [feed] — the kid app's Bangla-language surface had zero e2e coverage: the
 * parent signup i18n was tested, but nobody proved a Bangla kid can boot the
 * home screen, open Settings, play a real lesson, and land on the done screen
 * — all speaking বাংলা, with Bengali (bnNum) digits where the locale promises
 * them (apps/kid/src/i18n-bn.ts).
 *
 * This spec seeds nv_lang=bn + a local Bangla kid behind a mocked parent
 * session, then walks the real shipped bundles through the whole loop. The
 * Phaser lesson (CountPop) is a canvas, so the correct bubbles are popped
 * through the game's real pointerdown handler via the shipped `__NV_GAME__`
 * handle — every round is correct, so the wrong-answer mastery gate never
 * trips and the session reaches the done screen on its own.
 */

const KID_ID = "local-kid-bn";
const KID_NAME = "আরিয়া";
/** Bengali digit range used by bnNum() (০ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯). */
const BN_DIGIT = /[০-৯]/;

/** Seed a signed-in Bangla family with one local kid so the app boots straight
 *  into the Bangla home screen (welcome skipped, parent session mocked). */
async function seedBanglaKid(page: Page): Promise<void> {
  await page.addInitScript(
    (seed: { kidId: string; kidName: string }) => {
      const { kidId, kidName } = seed;
      try {
        localStorage.setItem("nv_seen_welcome", "1");
        localStorage.setItem("nv_tour_done", "1");
        localStorage.setItem("nv_lang", "bn");
        localStorage.setItem("nv_parent_token", "e2e-token");
        localStorage.setItem("nv_parent_name", "Test Parent");
        localStorage.setItem(
          "nv_kids",
          JSON.stringify([{ id: kidId, name: kidName, avatar: "🦊", birthYear: 2020 }])
        );
        localStorage.setItem("nv_kid_id", kidId);
        localStorage.setItem("nv_device_id", "e2e-device-id");
      } catch {
        /* private browsing — the DOM assertions below still run */
      }
    },
    { kidId: KID_ID, kidName: KID_NAME }
  );
}

/**
 * Wait until CountPop is showing a fresh, playable round (nextExpected back at
 * 1 with its bubbles on screen). The whole game-walk is inlined because
 * Playwright serializes these functions into the browser — they can't close
 * over Node-side helpers.
 */
async function waitForCountPopRound(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const game = (window as unknown as { __NV_GAME__?: { scene: { getScenes(active: boolean): unknown[] } } })
        .__NV_GAME__;
      const scenes = (game?.scene.getScenes(true) ?? []) as Array<{
        scene: { key: string };
        nextExpected: number;
        roundCount: number;
        bubbles: unknown[];
      }>;
      const s = scenes.find((x) => x.scene.key === "CountPop");
      return !!s && s.nextExpected === 1 && s.roundCount === 0 && s.bubbles.length >= 1;
    },
    undefined,
    { timeout }
  );
}

/** Pop the correct "next" bubble through the REAL Phaser pointerdown handler.
 *  CountPop asks the kid to pop 1→N in order; the scene's nextExpected tells us
 *  which bubble is right, so the lesson is played correctly every time. */
async function popNextCountBubble(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = (window as unknown as { __NV_GAME__?: { scene: { getScenes(active: boolean): unknown[] } } })
      .__NV_GAME__;
    const scenes = (game?.scene.getScenes(true) ?? []) as Array<{
      scene: { key: string };
      nextExpected: number;
      bubbles: Array<{ value: number; sprite: { emit(event: string): void } }>;
    }>;
    const s = scenes.find((x) => x.scene.key === "CountPop");
    if (!s) throw new Error("CountPop scene not active");
    const wanted = s.nextExpected;
    const bubble = s.bubbles.find((b) => b.value === wanted);
    if (!bubble) throw new Error(`CountPop: no bubble for value ${wanted}`);
    bubble.sprite.emit("pointerdown");
  });
}

/** Play one full CountPop scene-round (pop 1..roundTarget in order). The next
 *  round's readiness is handled by the caller (waitForCountPopRound). */
async function playCountPopRound(page: Page): Promise<void> {
  await waitForCountPopRound(page);
  const target = await page.evaluate(() => {
    const game = (window as unknown as { __NV_GAME__?: { scene: { getScenes(active: boolean): unknown[] } } })
      .__NV_GAME__;
    const scenes = (game?.scene.getScenes(true) ?? []) as Array<{
      scene: { key: string };
      roundTarget: number;
    }>;
    return scenes.find((x) => x.scene.key === "CountPop")?.roundTarget ?? 0;
  });
  for (let v = 1; v <= target; v++) {
    await popNextCountBubble(page);
  }
}

test.describe("Bangla kid surface (nv_lang=bn)", () => {
  test.use({ serviceWorkers: "block" });

  test("home → settings → one lesson → done all speak বাংলা with bnNum digits", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);
    await seedBanglaKid(page);

    // ── HOME ───────────────────────────────────────────────────────────────
    await page.goto("/");
    await expect(page.locator(".screen.play-screen")).toBeVisible({ timeout: 20_000 });

    // Bangla greeting by name.
    await expect(page.locator(".home-hello")).toContainText(`হু! হাই ${KID_NAME}!`);
    // The one big PLAY action says "খেলো" and names the kid.
    await expect(page.locator(".play-btn-main")).toContainText("▶ খেলো");
    await expect(page.locator(".play-btn-sub")).toContainText("১ থেকে ১০ গুনি");
    // Difficulty/class line is localized with a Bengali digit (শ্রেণি ১).
    await expect(page.locator(".play-btn-desc")).toContainText("শ্রেণি");
    await expect(page.locator(".play-btn-desc")).toContainText(BN_DIGIT);
    // Daily quest progress is a bnNum fraction (e.g. ০/৩).
    await expect(page.locator(".quest-line")).toContainText(BN_DIGIT);
    // Settings trigger label is Bangla.
    await expect(page.locator(".voice-chip-label")).toHaveText("সেটিংস");
    // The local kid was mapped to a server kid through the mock API.
    await expect.poll(() => api.kids.length, { timeout: 15_000 }).toBe(1);
    expect(api.kids[0].name).toBe(KID_NAME);

    // ── SETTINGS ───────────────────────────────────────────────────────────
    await page.locator(".voice-chip").click();
    await expect(page.locator(".screen-head h2")).toContainText("সেটিংস");
    await expect(page.locator(".head-sub")).toHaveText("তোমার মতো করে বানাও");
    // Sound, language and learning sections are all Bangla.
    await expect(page.locator(".settings-sec").filter({ hasText: "শব্দ ও ভয়েস" })).toBeVisible();
    await expect(page.locator(".settings-sec").filter({ hasText: "ভাষা" })).toBeVisible();
    await expect(page.locator(".settings-sec").filter({ hasText: "আমার শেখা" })).toBeVisible();
    // The Bangla language pill is the active one.
    const bnPill = page.locator(".settings-lang-pill").filter({ hasText: "বাংলা" });
    await expect(bnPill).toHaveAttribute("aria-pressed", "true");
    // Footer names the product in Bangla.
    await expect(page.locator(".settings-footer")).toContainText("নম্বরভার্স");

    // Back home to play.
    await page.locator(".icon-btn").click();
    await expect(page.locator(".screen.play-screen")).toBeVisible({ timeout: 15_000 });

    // ── PLAY ONE LESSON (CountPop) ─────────────────────────────────────────
    await page.locator(".big-btn.play-btn").click();
    // The in-game HUD is Bangla even though the lesson canvas is booting.
    await expect(page.locator(".game-wrap")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".round-chip")).toContainText("রাউন্ড");
    await expect(page.getByRole("button", { name: "খেলা থেকে ফিরুন" })).toBeVisible();
    await expect(page.getByRole("button", { name: "খেলা থামাও" })).toBeVisible();
    // The sound toggle is the `switch` hud control; calm-mode and language also
    // share the hud-music class, so resolve by role.
    await expect(page.getByRole("switch", { name: "শব্দ" })).toHaveAttribute("aria-label", "শব্দ");

    // Play 5 correct scene-rounds (ROUNDS_TO_FINISH=5) — each pops 1..N in
    // order, so the wrong-answer mastery gate never trips and the session ends
    // on the done screen naturally.
    for (let round = 1; round <= 5; round++) {
      await playCountPopRound(page);
    }

    // ── DONE ───────────────────────────────────────────────────────────────
    // A focused 5-round session crosses Moni's fatigue threshold → the #327
    // well-being break interstitial appears FIRST, in Bangla ("বিশ্রাম নাও,
    // আরিয়া!"). "আমি ফ্রেশ — চলো, খেলি!" (keep going) returns to the done
    // screen so the celebration + next-round button are still there.
    await expect(page.locator(".screen.done-screen, .break-screen").first()).toBeVisible({
      timeout: 30_000,
    });
    const breakGo = page.getByRole("button", { name: "আমি ফ্রেশ — চলো, খেলি!" });
    if (await breakGo.isVisible().catch(() => false)) {
      await breakGo.click();
    }
    await expect(page.locator(".screen.done-screen")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".title")).toHaveText("অসাধারণ!");
    // Star summary is announced as ONE image with a Bengali digit (e.g. ৫টা তারা).
    const doneStars = page.locator(".done-stars");
    await expect(doneStars).toHaveAttribute("aria-label", /টা তারা/);
    await expect(doneStars).toHaveAttribute("aria-label", BN_DIGIT);
    // The earned line names the Band-1 world in Bangla.
    await expect(page.locator(".subtitle")).toContainText("কুঁড়ির বাগান");
    // Next-round CTA is Bangla.
    await expect(page.locator(".next-btn")).toContainText("▶ পরের ধাপ");
    // Progress was synced through the mock API (a real progress POST).
    await expect.poll(() => api.progressCalls.length, { timeout: 15_000 }).toBeGreaterThan(0);
  });
});

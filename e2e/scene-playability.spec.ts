/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect, type Page } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * #1999 — RUNTIME PLAYABILITY SWEEP.
 *
 * Until now every scene except CountPop shipped without ever being BOOTED by a
 * test: the "catalog audit" only checks file names line up. A scene whose
 * `create()` throws would pass every gate and reach production as a stuck
 * black screen. This spec boots every catalog scene through the SAME
 * `startSceneWithFade` path the app uses and asserts none of them error.
 *
 * It is the E.3 "Tier 1" gate from the "kids get stuck" plan:
 *   · full sweep when NV_SWEEP_SCENES is unset (release gate)
 *   · scoped sweep when NV_SWEEP_SCENES is a comma list of scene keys (PR CI,
 *     computed by scripts/changed-scenes.mjs from the git diff)
 *
 * Detection: `__nvBootScene(key, data)` (a test-only hook in App.tsx) starts a
 * scene; a synchronous `create()` throw is caught in gameHost → onError →
 * `window.__NV_SCENE_ERROR__`, an async throw lands there via the window
 * error/unhandledrejection trap. A scene that boots cleanly becomes ACTIVE.
 * We poll for `active scene present OR error recorded` — so a hang is a timeout,
 * a crash is a captured key+message.
 */

const KID_ID = "sweep-kid";
const KID_NAME = "Sweep";

/** Seed a signed-in family with one local kid so the app reaches `playing` and
 *  mounts the Phaser game (where the test hooks live). Mirrors bangla-surface. */
async function seedSweepKid(page: Page): Promise<void> {
  await page.addInitScript(
    (seed: { kidId: string; kidName: string }) => {
      try {
        localStorage.setItem("nv_seen_welcome", "1");
        localStorage.setItem("nv_tour_done", "1");
        localStorage.setItem("nv_parent_token", "e2e-token");
        localStorage.setItem("nv_parent_name", "Test Parent");
        localStorage.setItem("nv_kids", JSON.stringify([{ id: seed.kidId, name: seed.kidName, avatar: "🦊", birthYear: 2020 }]));
        localStorage.setItem("nv_kid_id", seed.kidId);
        localStorage.setItem("nv_device_id", "e2e-sweep-device");
      } catch {
        /* ignore */
      }
    },
    { kidId: KID_ID, kidName: KID_NAME }
  );
}

/** The scene keys to sweep, honoring the NV_SWEEP_SCENES scope.
 *  - `__ALL__`  → full catalog (shared scene-base changed / release gate)
 *  - `a,b,c`    → only those keys (PR changed specific scenes)
 *  - empty      → no scene files changed; the caller skips the sweep */
function sweepKeys(): string[] | null {
  const scoped = process.env.NV_SWEEP_SCENES;
  if (scoped && scoped.trim() === "__ALL__") return null; // null → read the full catalog
  if (scoped && scoped.trim()) {
    return scoped.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return null; // null (unset) → read the full catalog (release gate)
}

test.describe("scene playability sweep", () => {
  test.use({ serviceWorkers: "block" });
  test.setTimeout(240_000);

  // #1999 — run only when explicitly armed (NV_SWEEP=1): the default e2e run
  // skips it so PR CI isn't paying for a full 150-scene sweep on every spec.
  // The dedicated CI step + release.sh set NV_SWEEP=1 (+ a scoped NV_SWEEP_SCENES
  // list for PRs).
  test.skip(!process.env.NV_SWEEP, "armed only via NV_SWEEP=1 (CI sweep step / release.sh)");

  test("every catalog scene boots without error", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);
    await seedSweepKid(page);

    await page.goto("/");
    await expect(page.locator(".screen.play-screen")).toBeVisible({ timeout: 25_000 });

    // Start a session so the Phaser game mounts and the test hooks are attached.
    await page.locator(".play-btn").click();
    await expect(page.locator(".game-wrap canvas")).toBeVisible({ timeout: 25_000 });

    // The hooks are attached once bootGame resolves (App.tsx sets them on g).
    await page.waitForFunction(
      () => typeof (window as unknown as { __nvBootScene?: unknown }).__nvBootScene === "function",
      undefined,
      { timeout: 15_000 }
    );

    // Resolve the list of keys to sweep (env scope or the full catalog).
    const keys = await page.evaluate(() => {
      const w = window as unknown as { __nvSceneKeys?: () => string[] };
      return w.__nvSceneKeys ? w.__nvSceneKeys() : [];
    });
    const scoped = sweepKeys();
    const toSweep = scoped ?? keys;
    expect(toSweep.length).toBeGreaterThan(0);

    const failures: Array<{ key: string; message: string }> = [];
    for (const key of toSweep) {
      const outcome = await sweepOne(page, key);
      if (outcome) failures.push({ key, message: outcome });
    }

    // One list at the end so a broken scene is named in the failure output,
    // not hidden behind a mid-loop abort.
    expect(
      failures,
      `${failures.length} scene(s) failed to boot:\n` +
        failures.map((f) => `  · ${f.key}: ${f.message}`).join("\n")
    ).toEqual([]);
  });
});

/** Boot one scene and return an error string, or null if it booted cleanly. */
async function sweepOne(page: Page, key: string): Promise<string | null> {
  // Clear any stale error, then boot through the SAME hook the app uses. The
  // synthetic payload is rebuilt INSIDE the browser (functions can't cross the
  // Playwright serialization boundary).
  const booted = await page.evaluate((k) => {
    const w = window as unknown as {
      __NV_SCENE_ERROR__?: { key: string; message: string } | null;
      __nvBootScene?: (key: string, data?: object) => void;
    };
    w.__NV_SCENE_ERROR__ = null;
    w.__nvBootScene?.(k, {
      startLevelIndex: 0,
      mode: "",
      challenge: false,
      typing: false,
      skill: "",
      skillId: "",
      teach: false,
      kidName: "Sweep",
      kidId: "sweep-kid",
      onBack: () => {},
      onRoundDone: () => {},
      levels: [1, 2, 3],
    });
    return k;
  }, key);

  // Poll: the scene becomes ACTIVE (create() ran) OR an error was recorded.
  // A synchronous throw is caught immediately; an async throw lands via the
  // window trap. A hang (never active, never error) surfaces as a timeout below.
  await page
    .waitForFunction(
      (k) => {
        const w = window as unknown as {
          __NV_SCENE_ERROR__?: { key: string; message: string } | null;
          __NV_GAME__?: { scene: { getScenes(active: boolean): Array<{ scene: { key: string } }> } };
        };
        if (w.__NV_SCENE_ERROR__) return true;
        const scenes = w.__NV_GAME__?.scene.getScenes(true) ?? [];
        return scenes.some((s) => s.scene.key === k);
      },
      booted,
      { timeout: 8_000 }
    )
    .catch(() => {
      /* a hang falls through to the error/timeout branch below */
    });

  return page.evaluate((k) => {
    const w = window as unknown as { __NV_SCENE_ERROR__?: { key: string; message: string } | null };
    if (w.__NV_SCENE_ERROR__) {
      const e = w.__NV_SCENE_ERROR__;
      return `${e.key}: ${e.message}`;
    }
    // No error recorded, but also confirm the scene actually became active
    // (otherwise a silent non-boot would read as "clean").
    const g = window as unknown as { __NV_GAME__?: { scene: { getScenes(active: boolean): Array<{ scene: { key: string } }> } } };
    const active = g.__NV_GAME__?.scene.getScenes(true) ?? [];
    return active.some((s) => s.scene.key === k) ? null : `scene "${k}" never became active`;
  });
}

import { defineConfig } from "@playwright/test";

/**
 * #264 + #925–#932 — e2e for the SHIPPED apps (not a dev server).
 *
 * - `e2e/offline.spec.ts` proves the no-network fallback contract (cold +
 *   warm) in Chromium, Firefox AND WebKit (#931) — the service-worker precache
 *   IS the feature under test, so this project does NOT block service workers.
 * - `e2e/sync-drain.spec.ts`, `e2e/cross-app.spec.ts` and
 *   `e2e/parent-portal.spec.ts` mock the /api surface (see those specs) and
 *   run on Chromium only.
 *
 * Uses the LIVE deployed app (https://kids.munna-khan.xyz) so the tests guard
 * the real artifact. `e2e/global-setup.ts` performs the #930 staged-deployment
 * check before any browser opens: the host must serve the version stamped in
 * apps/kid/src/version.ts (override with NV_E2E_VERSION / NV_E2E_BASE /
 * NV_E2E_SKIP_VERSION_CHECK=1).
 *
 * Run:  npx playwright test                          (headed browser not needed)
 */

const DEFAULT_BASE = "https://kids.munna-khan.xyz";
const baseURL = (process.env.NV_E2E_BASE ?? DEFAULT_BASE).replace(/\/+$/, "");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  use: {
    baseURL,
    // Service workers MUST run for offline.spec.ts — the precache IS the
    // offline fallback that test proves. (The mock-backed specs opt into
    // `serviceWorkers: "block"` per-file.)
  },
  projects: [
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      use: {
        browserName: "chromium",
        // NV_E2E_CHANNEL=chrome → use the machine's Google Chrome (no browser
        // download needed locally). Unset → bundled chromium (CI default).
        channel: process.env.NV_E2E_CHANNEL as "chrome" | undefined,
        // 🔊 MUTE all test-browser audio: the kid app's Web Speech API
        // (speechSynthesis) speaks through the Mac's default output (Hasan's
        // BT earbuds) whenever a test claims a daily reward / unlocks a badge
        // etc. — every playwright run must be silent. `--mute-audio` is a
        // Chromium launch arg; speechSynthesis still fires its events, so
        // assertions on the API keep working — only audible output is muted.
        launchOptions: {
          args: ["--mute-audio"],
        },
      },
    },
    {
      name: "firefox",
      testMatch: /offline\.spec\.ts/,
      use: {
        browserName: "firefox",
      },
    },
    {
      name: "webkit",
      testMatch: /offline\.spec\.ts/,
      use: {
        browserName: "webkit",
      },
    },
  ],
});

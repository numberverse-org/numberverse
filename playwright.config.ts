import { defineConfig } from "@playwright/test";

/**
 * #264 — no-network fallback e2e. Proves the SHIPPED kid app renders and makes
 * zero network calls on launch, both after a cold install (first visit online →
 * offline reload) and on a warm revisit (direct offline).
 *
 * Uses the LIVE deployed app (https://kids.munna-khan.xyz) so the test guards
 * the real artifact, not a dev server. Override with NV_E2E_BASE.
 *
 * Run:  npx playwright test                          (headed browser not needed)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  use: {
    baseURL: process.env.NV_E2E_BASE ?? "https://kids.munna-khan.xyz",
    // Service workers MUST run — the precache IS the offline fallback this
    // test proves. (No "block" here.)
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        // NV_E2E_CHANNEL=chrome → use the machine's Google Chrome (no browser
        // download needed locally). Unset → bundled chromium (CI default).
        channel: process.env.NV_E2E_CHANNEL as "chrome" | undefined,
      },
    },
  ],
});

import { test, expect, type Page } from "@playwright/test";

/**
 * #264 — Guardrail: no-network fallback verification.
 *
 * The machine-enforced contract (docs/OFFLINE.md):
 *   - Cold: a fresh install that saw the network ONCE works fully offline after —
 *     the shell + all launch-critical assets are precached, an offline reload
 *     renders and the ONLY network failures are the two documented runtime
 *     features (neural-voice model download, Google sign-in button) that are
 *     NOT launch-critical and degrade gracefully.
 *   - Warm: revisiting straight offline renders the same way.
 *
 * Assertion model: with the network emulated OFF, a service-worker cache hit
 * still emits a CDP "request" but SUCCEEDS; anything that escapes the SW cache
 * FAILS. So the contract is: every FAILED request must be an allowed runtime
 * feature, and the launch-critical shell (document, /assets/, /fonts/, icons,
 * manifest, favicon) all succeed from cache.
 */

const SETTLE_MS = 4000; // let the first online visit finish precaching

/** Load online once (fresh-install precache seed), wait for SW ready + precache. */
async function coldSeed(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      navigator.serviceWorker?.getRegistrations().then((rs) =>
        rs.some((r) => r.active || r.installing || r.waiting)
      ),
    undefined,
    { timeout: 30_000 }
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(SETTLE_MS); // precache manifest drain
}

// Documented runtime-only features allowed to attempt the network offline.
// Every other failed request is a regression (#264 fails the run).
const ALLOWED_OFFLINE_FAILS = [
  (u: string) => u.includes("/voice/"), // neural-voice model: CacheFirst, first-use download (#114 known gap)
  (u: string) => u.includes("/api/v1/auth/google/status"), // Google button probe (feature-gated)
  (u: string) => u.includes("accounts.google.com"), // Google Identity client script
];

/** Reload with the network OFF; return {failed, rendered}. */
async function offlineReload(page: Page): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  page.on("requestfailed", (r) => {
    if (r.url().startsWith("http")) failed.push(r.url());
  });
  await page.context().setOffline(true);
  await page.reload({ waitUntil: "load", timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(2000); // allow late fetches (voice/google) to surface
  return { failed };
}

async function assertRendered(page: Page): Promise<void> {
  // Mount div is visible AND has app content beneath it (splash/home).
  await expect(page.locator("#root")).toBeVisible({ timeout: 15_000 });
  const children = await page.locator("#root > *").count();
  expect(children).toBeGreaterThan(0);
}

function assertOnlyAllowedFailures(failed: string[]): void {
  const bad = failed.filter((u) => !ALLOWED_OFFLINE_FAILS.some((p) => p(u)));
  expect(bad).toEqual([]);
}

test("cold: install online once → offline reload renders, only runtime features touch the network", async ({ page }) => {
  await coldSeed(page);

  const { failed } = await offlineReload(page);

  await assertRendered(page);
  assertOnlyAllowedFailures(failed);
});

test("warm: revisit offline (SW already controlling) → renders, only runtime features touch the network", async ({ page }) => {
  await coldSeed(page);
  await offlineReload(page); // establish SW control of this page offline

  const { failed } = await offlineReload(page); // second launch, straight offline

  await assertRendered(page);
  assertOnlyAllowedFailures(failed);
});

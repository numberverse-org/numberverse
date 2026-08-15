/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect, type Page, type Request } from "@playwright/test";

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
 * FAILS. So the contract has two halves:
 *   1. every FAILED request must be an allowed runtime feature (#928 keeps the
 *      positive half too — the launch-critical shell must actually SUCCEED);
 *   2. the launch-critical shell (document, /assets/, /fonts/, icons, manifest,
 *      favicon) all succeed from cache.
 */

const SETTLE_MS = 4000; // let the first online visit finish precaching
const QUIET_MS = 350; // event-driven settle: quiet window after the last request
const SETTLE_TIMEOUT_MS = 3000; // bounded ceiling for late runtime fetches

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
  // Cloudflare injects a challenge-platform script into the HTML response for
  // bot-suspect clients (headless Chromium is sometimes challenged). The SW
  // precaches the TRANSFORMED index.html, so offline the injected <script> URL
  // fails — benign third-party infra, never an app request, exactly like the
  // Google Identity script above.
  (u: string) => u.includes("/cdn-cgi/challenge-platform/"),
];

interface OfflineCapture {
  failed: string[];
  finished: string[];
}

function httpUrl(request: Request): string | null {
  const url = request.url();
  return url.startsWith("http") ? url : null;
}

/** #929 — wait for late fetches (voice/google) by EVENT, not a fixed sleep.
 *  Resolves QUIET_MS after the last request event; a ceiling keeps a
 *  never-quiet page from hanging the run. */
async function waitForRequestsToSettle(page: Page): Promise<void> {
  await new Promise<void>((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let ceiling: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const bump = () => {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, QUIET_MS);
    };
    const cleanup = () => {
      page.off("request", bump);
      page.off("requestfinished", bump);
      page.off("requestfailed", bump);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      if (quietTimer) clearTimeout(quietTimer);
      if (ceiling) clearTimeout(ceiling);
      cleanup();
      resolve();
    };

    ceiling = setTimeout(finish, SETTLE_TIMEOUT_MS);
    page.on("request", bump);
    page.on("requestfinished", bump);
    page.on("requestfailed", bump);
    bump();
  });
}

/** Reload with the network OFF; return {failed, finished}. */
async function offlineReload(page: Page): Promise<OfflineCapture> {
  const failed: string[] = [];
  const finished: string[] = [];
  const onFailed = (request: Request) => {
    const url = httpUrl(request);
    if (url) failed.push(url);
  };
  const onFinished = (request: Request) => {
    const url = httpUrl(request);
    if (url) finished.push(url);
  };
  page.on("requestfailed", onFailed);
  page.on("requestfinished", onFinished);
  try {
    await page.context().setOffline(true);
    await page.reload({ waitUntil: "load", timeout: 30_000 }).catch(() => undefined);
    await waitForRequestsToSettle(page);
  } finally {
    // #932 — detach before returning so a later test/phase can't mutate this
    // capture (the listener must never outlive the reload it is observing).
    page.off("requestfailed", onFailed);
    page.off("requestfinished", onFinished);
  }
  return { failed, finished };
}

async function assertRendered(page: Page): Promise<void> {
  // Mount div is visible AND has app content beneath it (splash/home).
  await expect(page.locator("#root")).toBeVisible({ timeout: 15_000 });
  const children = await page.locator("#root > *").count();
  expect(children).toBeGreaterThan(0);
}

function assertOnlyAllowedFailures(failed: string[]): void {
  const bad = failed.filter((url) => !ALLOWED_OFFLINE_FAILS.some((p) => p(url)));
  expect(bad).toEqual([]);
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

/** #928 — the positive half of the contract: the launch-critical shell must be
 *  SERVED from the SW precache, not merely "not failed". */
async function assertLaunchShellSucceeded(page: Page, finished: string[]): Promise<void> {
  expect(finished.some((url) => pathOf(url) === "/"), "document served from SW precache").toBe(true);
  expect(finished.some((url) => url.includes("/assets/")), "app assets served from SW precache").toBe(true);
  expect(finished.some((url) => url.includes("/fonts/")), "fonts served from SW precache").toBe(true);
  expect(
    finished.some((url) => /favicon\.png|apple-touch-icon\.png|\/icon-\d+\.png/.test(url)),
    "icons/favicon served from SW precache"
  ).toBe(true);
  // The manifest is NOT observable via requestfinished: Chromium fetches
  // <link rel="manifest"> once per origin/session for installability and
  // serves it from its own HTTP cache on reload, so no network event fires.
  // Verify the real contract directly — a runtime fetch while offline must
  // be answered by the SW precache (fetch would fail if it escaped to network).
  const manifest = await page.evaluate(async () => {
    const res = await fetch("/manifest.webmanifest");
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, text: (await res.text()).slice(0, 20) };
  });
  expect(manifest).toEqual(expect.objectContaining({ ok: true, status: 200 }));
}

test("cold: install online once → offline reload renders, only runtime features touch the network", async ({ page }) => {
  await coldSeed(page);

  const { failed, finished } = await offlineReload(page);

  await assertRendered(page);
  assertOnlyAllowedFailures(failed);
  await assertLaunchShellSucceeded(page, finished);
});

test("warm: revisit offline (SW already controlling) → renders, only runtime features touch the network", async ({ page }) => {
  await coldSeed(page);
  await offlineReload(page); // establish SW control of this page offline

  const { failed, finished } = await offlineReload(page); // second launch, straight offline

  await assertRendered(page);
  assertOnlyAllowedFailures(failed);
  await assertLaunchShellSucceeded(page, finished);
});

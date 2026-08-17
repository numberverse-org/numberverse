/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect, type Page, type Request } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { seedDeviceFlags } from "./lib/apiMocks";

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

const QUIET_MS = 350; // event-driven settle: quiet window after the last request
const SETTLE_TIMEOUT_MS = 3000; // bounded ceiling for late runtime fetches
// #935 — the cold precache drain (~79 entries, up to ~8MB) is event-driven too:
// a fixed SETTLE_MS=4000 sleep raced slow CI (drain not finished → precache
// partial → offline reload flake) AND wasted 4s per test on fast machines.
const PRECACHE_QUIET_MS = 500; // quiet window after the last precache request
const PRECACHE_CEILING_MS = 20_000; // cold install can fetch the whole manifest; never hang a slow box

/** #935 — wait for the SW precache manifest drain by EVENT (request-quiet),
 *  not a fixed sleep. The precache is complete once requests stop for a quiet
 *  window; the ceiling keeps a slow-but-never-quiet box from hanging the run. */
async function waitForPrecacheDrain(page: Page): Promise<void> {
  await new Promise<void>((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let ceiling: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const bump = () => {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, PRECACHE_QUIET_MS);
    };
    const cleanup = () => {
      page.off("requestfinished", bump);
      if (quietTimer) clearTimeout(quietTimer);
      if (ceiling) clearTimeout(ceiling);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    ceiling = setTimeout(finish, PRECACHE_CEILING_MS);
    page.on("requestfinished", bump);
    bump(); // drain may already be quiet → settle without waiting out the ceiling
  });
}

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
  await waitForPrecacheDrain(page);
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

/* ── #1650 — offline /api replay must use the exact cached request key ──
 * Successful online GETs are cached under the FULL request URL (query
 * included). The offline replay used to match with ignoreSearch, collapsing
 * every /api endpoint to its bare pathname — so on a multi-kid shared device,
 * an offline request for /api/v1/roster?kid=B was answered with the body last
 * cached for /api/v1/roster?kid=A (the WRONG child's roster), with no signal
 * that the response was substituted. The SW must match with the exact same key
 * the put wrote; a query that was never cached falls back to the 503 offline
 * envelope (never another kid's data).
 *
 * Why a real HTTP mock instead of `page.route`? The nv-api cache lives inside
 * the service worker, so this spec leaves the SW ACTIVE (unlike sync-drain).
 * Playwright's `page.route` intercepts page-context requests only — it does
 * NOT intercept the network fetch the SW makes on behalf of the page, so the
 * SW's network-first boundary must reach a genuinely reachable endpoint. This
 * tiny in-process server plays that role on 127.0.0.1:8000 — the exact API
 * base the http-served preview app targets (api.ts: http pages → :8000). No
 * live account is touched; the roster bodies are distinct per kid so a
 * query-agnostic replay would visibly leak A's data into B.
 *
 * Chromium-only: the cold/warm #264 tests above are the cross-browser
 * coverage, and this backend is a chromium-local mock (like sync-drain). */
test("#1650: offline ?kid=B is NOT answered with the cached ?kid=A body", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "#1650 replay-key test runs on chromium only (local mock backend)");

  // ── tiny per-kid /api mock on 127.0.0.1:8000 (the app's http API base) ──
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:8000");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        // The page+SW live on :8081 and fetch :8000 cross-origin — CORS is
        // required for the SW's fetch() to succeed and be cached.
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end(JSON.stringify(body));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }
    // The endpoint under test — A and B get DISTINCT bodies.
    if (url.pathname === "/api/v1/roster") {
      const kid = url.searchParams.get("kid");
      return send(
        200,
        kid === "B"
          ? { kid: "B", name: "Bella", avatar: "🦖" }
          : { kid: "A", name: "Aria", avatar: "🦊" }
      );
    }
    // Boot surface so the app reaches a real home screen (device account).
    if (req.method === "POST" && url.pathname === "/api/v1/auth/signup")
      return send(200, { token: "mock-token", profile: { id: "p1", display_name: "Kid Device" } });
    if (req.method === "POST" && url.pathname === "/api/v1/auth/login")
      return send(200, { token: "mock-token", profile: { id: "p1", display_name: "Kid Device" } });
    if (req.method === "GET" && url.pathname === "/api/v1/auth/me") return send(200, { id: "p1" });
    if (req.method === "GET" && url.pathname === "/api/v1/kids") return send(200, []);
    if (req.method === "POST" && url.pathname === "/api/v1/kids")
      return send(200, { id: "server-kid-1", name: "Aria", avatar: "🦊", birth_year: 2020 });
    if (url.pathname.endsWith("/settings")) return send(200, {});
    if (url.pathname.endsWith("/snapshot")) return send(200, { coins: 0, wallet_seq: 0, mastery: [] });
    if (req.method === "POST" && url.pathname.endsWith("/progress")) return send(200, {});
    return send(200, {});
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(8000, "127.0.0.1", resolve);
  });

  try {
    // Seed the one-time device flags + a local kid so the app boots to a real
    // home screen instead of a welcome/tour modal (same as the mock-backed specs).
    seedDeviceFlags(page);
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          "nv_kids",
          JSON.stringify([{ id: "local-kid-a", name: "Aria", avatar: "🦊", birthYear: 2020 }])
        );
        localStorage.setItem("nv_kid_id", "local-kid-a");
        localStorage.setItem("nv_device_id", "e2e-offline-key-device");
      } catch {
        /* storage denied — the /api assertions below still run */
      }
    });

    // Load the shell online and get a page the SW actually controls.
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
    // Reload so THIS document is controlled (a fresh navigation under the active
    // worker is the reliable contract — clientsClaim adopts it immediately).
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 30_000 });

    // Online: fetch ?kid=A through the SW. The SW's network-first boundary
    // proxies to the mock (200) and caches it under the FULL ?kid=A URL. Use
    // the same absolute base api.ts derives for an http page so the cached key
    // shares the app's real cache namespace.
    const onlineA = await page.evaluate(async () => {
      const res = await fetch("http://127.0.0.1:8000/api/v1/roster?kid=A");
      return { status: res.status, text: await res.text() };
    });
    expect(onlineA.status).toBe(200);
    expect(onlineA.text).toContain('"name":"Aria"');

    // Go offline. The mock server is still reachable from the test host, but
    // the browser's network is down, so the SW's fetch() now FAILS at the
    // boundary and the cache lookup is what answers.
    await page.context().setOffline(true);

    // Offline: ?kid=B was never cached → the exact-key match must MISS and the
    // boundary answers with the 503 envelope. It must NOT be A's roster body
    // (the ignoreSearch bug) and it must NOT be B's live body (the offline
    // fetch really failed — the mock was NOT consulted).
    const offlineB = await page.evaluate(async () => {
      const res = await fetch("http://127.0.0.1:8000/api/v1/roster?kid=B");
      return { status: res.status, text: await res.text(), xNvOffline: res.headers.get("X-NV-Offline") };
    });
    expect(offlineB.status).toBe(503);
    expect(offlineB.xNvOffline).toBe("1");
    expect(offlineB.text).not.toContain("Aria");
    expect(offlineB.text).not.toContain("Bella");

    // And the EXACT key still replays: offline ?kid=A serves A's cached roster,
    // now stamped as a stale offline envelope (X-NV-Offline: 1).
    const offlineA = await page.evaluate(async () => {
      const res = await fetch("http://127.0.0.1:8000/api/v1/roster?kid=A");
      return { status: res.status, text: await res.text(), xNvOffline: res.headers.get("X-NV-Offline") };
    });
    expect(offlineA.status).toBe(200);
    expect(offlineA.text).toContain('"name":"Aria"');
    expect(offlineA.xNvOffline).toBe("1");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/* Numberverse Parent Portal — service worker (scope /parent/)
 *
 * Goals, in order:
 *  1. INSTALLABLE — Chrome/Edge/Safari require a SW with a fetch handler
 *     before they'll offer "Add to Home Screen".
 *  2. FAST REOPENS — hashed build chunks are immutable, so cache them first
 *     and never re-download on every launch.
 *  3. FRESH CONTENT — the HTML document and all /api/ calls always hit the
 *     network (the parent wants LIVE mastery, not a stale snapshot).
 *  4. OFFLINE FALLBACK — if the network drops mid-navigate, serve the last
 *     cached shell so the portal still opens; live data is network-only.
 */

// ── cache naming (#1656) ──────────────────────────────────────────────────
// CACHE_NS scopes cleanup to THIS app's caches only — it must never nuke the
// sibling kid PWA's caches (nv-voice / nv-api / precache), which share this
// origin's CacheStorage. Bump the version suffix whenever the precached
// shell/manifest changes shape so each deploy gets a clean vN cache and
// activate deletes the older v(N-1) one.
const CACHE_NS = "nv-parent-";
const CACHE = CACHE_NS + "v2"; // ← bump this suffix on any shell/manifest change

// Fallback base for cache keys — derived from the SW's ACTUAL scope (deployed
// "/parent/", local dev "/") instead of a hardcoded "/parent/", so the precache
// list matches wherever the SW is registered (#1654).
const BASE = self.registration.scope;

// #1661 — hashed assets are immutable, but across DEPLOYS they accumulate. Sweep
// out entries older than this on activate so the cache stays bounded and can't
// evict the fresh shell.
const ASSET_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// #1654 — precache the shell with per-entry tolerance: one non-2xx must NOT
// abort install (an SW that fails to install is worse than no SW). Individual
// misses are fine — the network-first navigation handler warms the shell online.
async function precacheShell() {
  const cache = await caches.open(CACHE);
  const entries = [BASE, BASE + "index.html", BASE + "manifest.webmanifest"];
  await Promise.all(
    entries.map(async (entry) => {
      try {
        const res = await fetch(entry, { cache: "reload" });
        if (res.ok) await cache.put(entry, res);
      } catch {
        /* tolerate a single miss — the shell warms via network-first later */
      }
    })
  );
}

// #1661 — drop hashed-asset entries older than ASSET_MAX_AGE_MS on activate.
async function purgeExpiredAssets() {
  const cache = await caches.open(CACHE);
  const now = Date.now();
  const keys = await cache.keys();
  await Promise.all(
    keys.map(async (req) => {
      try {
        const res = await cache.match(req);
        const t = Number((res && res.headers.get("X-NV-Cached-At")) || 0);
        if (t && now - t > ASSET_MAX_AGE_MS) await cache.delete(req);
      } catch {
        /* best-effort */
      }
    })
  );
}

self.addEventListener("install", (e) => {
  // #1660 — NO skipWaiting on install: a fresh deploy WAITS (prompt flow) so an
  // open tab is never yanked mid-session. The page's update confirmation sends
  // { type: "SKIP_WAITING" } (handled below), mirroring the kid SW's prompt mode.
  e.waitUntil(precacheShell());
});

// #1660 — explicit-confirmation activation, mirroring the kid SW: only an
// update-banner tap ({ type: "SKIP_WAITING" }) activates the waiting worker.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // #1656 — delete only OLD versions of THIS app's cache; never the sibling
      // kid PWA's caches on the same origin.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(CACHE_NS) && k !== CACHE).map((k) => caches.delete(k))
      );
      await purgeExpiredAssets();
      await self.clients.claim(); // adopt open tabs once the update is confirmed
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Live data / API — never cache, always the freshest parent view.
  if (url.pathname.startsWith("/api/")) return;

  // Immutable hashed build assets (+ the manifest, #1655) → cache-first,
  // populate on first sight with a TTL stamp (#1661). Manifest/webmanifest/json
  // are included so an offline fetch of manifest.webmanifest returns 200.
  if (
    url.pathname.includes("/_next/static/") ||
    /\.(js|css|png|svg|woff2?|ico|json|webmanifest)$/.test(url.pathname)
  ) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              const headers = new Headers(clone.headers);
              headers.set("X-NV-Cached-At", String(Date.now()));
              const stamped = new Response(clone.body, {
                status: clone.status,
                statusText: clone.statusText,
                headers,
              });
              caches.open(CACHE).then((c) => c.put(req, stamped));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navigations → network-first (fresh portal), cached shell as fallback.
  // (#1653) a 5xx/error fetch must fall through to the cached shell rather than
  // being returned verbatim; synthesize a minimal offline page only if the
  // shell is also missing from cache.
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (!res.ok) throw new Error("non-ok navigation " + res.status);
          const clone = res.clone();
          const cache = await caches.open(CACHE);
          await cache.put(BASE + "index.html", clone);
          return res;
        } catch {
          const shell = await caches.match(BASE + "index.html");
          if (shell) return shell;
          return new Response(
            "<!doctype html><meta charset='utf-8'><title>Offline</title><h1>You're offline</h1><p>Reconnect to open the Numberverse Parent Portal.</p>",
            { status: 503, statusText: "Offline", headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }
      })()
    );
  }
});

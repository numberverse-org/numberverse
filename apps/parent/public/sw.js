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
const CACHE = "nv-parent-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/parent/", "/parent/index.html", "/parent/manifest.webmanifest"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Live data / API — never cache, always the freshest parent view.
  if (url.pathname.startsWith("/api/")) return;

  // Immutable hashed build assets → cache-first, populate on first sight.
  if (
    url.pathname.includes("/_next/static/") ||
    /\.(js|css|png|svg|woff2?|ico)$/.test(url.pathname)
  ) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(req, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navigations → network-first (fresh portal), cached shell as fallback.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put("/parent/index.html", clone));
          }
          return res;
        })
        .catch(() => caches.match("/parent/index.html"))
    );
  }
});

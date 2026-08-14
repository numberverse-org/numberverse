/// <reference lib="webworker" />
/**
 * Numberverse service worker — #264 offline-first contract.
 *
 * The SW is the NETWORK BOUNDARY: with the network emulated OFF, a
 * service-worker cache hit still emits a CDP request but SUCCEEDS; anything
 * that escapes the SW cache FAILS. The contract is that ONLY the documented
 * runtime-only features (neural voice download, Google sign-in) may touch the
 * network and fail offline — every launch-critical + /api request must be
 * answered by this worker so the page never sees a network-layer failure.
 *
 * Layers:
 *   1. Precache the whole app shell (index.html + hashed /assets) — a fresh
 *      install works fully offline after ONE online visit.
 *   2. Navigation fallback → index.html, never /parent or /admin (sibling apps
 *      on this origin).
 *   3. Neural voice → CacheFirst on first use (huge model, runtime-downloaded).
 *   4. /api sync traffic → the SW answers EVERY request. Online it proxies
 *      through; offline it serves the last-good GET from cache (nv-api) or a
 *      synthetic 503 the app treats as "offline — keep the outbox queued".
 */
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigation fallback. The sibling apps (/parent portal, /admin console)
// live on the SAME origin — never answer those with the game's index.html.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/parent\//, /^\/admin\//],
  })
);

// Neural-voice assets (piper phonemizer + per-language model + onnx runtime):
// way over the precache cap, so CacheFirst on first use — then fully offline.
registerRoute(
  /\/voice\/.*$/,
  new CacheFirst({
    cacheName: "nv-voice",
    plugins: [
      new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 180 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  "GET"
);

/* ── /api — the offline-first network boundary (#264) ─────────────────── */
const API_CACHE = "nv-api";

function offlineEnvelope(status = 503, body: Record<string, unknown> = { offline: true }): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: "Offline",
    headers: { "Content-Type": "application/json", "X-NV-Offline": "1" },
  });
}

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  async ({ request }) => {
    const cache = await caches.open(API_CACHE);
    try {
      const response = await fetch(request);
      // Cache successful GETs (kid settings, snapshots, roster) so a later
      // offline session replays the last-good server state instead of failing.
      if (request.method === "GET" && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      // Network unreachable — NEVER let this escape as a network failure.
      if (request.method === "GET") {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        return offlineEnvelope(503, {});
      }
      // Mutation offline: the app keeps its durable outbox queued and retries
      // on the online heartbeat — a 503 here is "accepted for retry", not loss.
      return offlineEnvelope();
    }
  }
);

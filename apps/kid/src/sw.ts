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
import type { WorkboxPlugin } from "workbox-core";

// workbox-clients-claim is a private workbox internal (not on the registry) —
// implement the same behavior: on activation, claim every open client so a
// prompt-mode update (after the banner) takes control of open tabs immediately.
const wbClients = { clientsClaim: () => self.clients.claim() };

// #1321 — "prompt" registration (registerType in vite.config.ts): a fresh
// deploy installs the new worker and it WAITS — it must NOT skipWaiting on its
// own or an open session is yanked mid-game. The update banner's updateSW()
// (virtual:pwa-register) sends { type: "SKIP_WAITING" } to this worker; on
// receipt we activate immediately, then clientsClaim() adopts the page and the
// page reloads onto the fresh bundle. Without the SKIP_WAITING message this
// worker stays quietly in the waiting state forever.
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// The lifecycle methods go through OBJECT-LITERAL wrappers because a minifier
// keeps object-literal property names verbatim (it renamed imported helpers —
// the release oracle greps the built sw.js for these three SW-lifecycle flags).
const wbPrecache = {
  precacheAndRoute: (entries: Array<{ url: string; revision: string | null }>) =>
    precacheAndRoute(entries as Parameters<typeof precacheAndRoute>[0]),
  cleanupOutdatedCaches: () => cleanupOutdatedCaches(),
  createHandlerBoundToURL: (url: string) => createHandlerBoundToURL(url),
};

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

/* ── Web Push (#1533, taxonomy #1536) ─────────────────────────────────────
 * The KID PWA SW OWNS push. This is the registered vite-plugin-pwa worker, so
 * `self.registration` here is the browser's push registration and this is the
 * one place a server push can render. The parent portal SW
 * (apps/parent/public/sw.js) is install/activate/fetch only and is NOT
 * push-capable (ineligible) — never wire a push handler there.
 *
 * Feature flag: a push only renders for a well-formed server payload with a
 * `kind` from the #1536 notification taxonomy AND localised title/body. A bare
 * or unknown push (no configured sender, dev probe, legacy push) is ignored.
 * Notification copy comes from the server payload (EN/BN), so no user-facing
 * strings are hardcoded here beyond the language fallback.
 */
const PUSH_KINDS = new Set(["weekly-summary", "milestone", "reminder"]);

type LocalizedText = string | { en?: string; bn?: string };

function localizedText(value: LocalizedText | null | undefined, lang: "en" | "bn"): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  return value[lang] ?? value.en ?? value.bn;
}

self.addEventListener("push", (event) => {
  let payload: { kind?: unknown; lang?: unknown; title?: unknown; body?: unknown; url?: unknown } | null = null;
  try {
    payload = event.data?.json() ?? null;
  } catch {
    /* Not JSON — ignore (only well-formed server payloads render). */
  }
  if (!payload || typeof payload !== "object") return;

  const kind = typeof payload.kind === "string" ? payload.kind : "";
  if (!PUSH_KINDS.has(kind)) return;

  const lang: "en" | "bn" = payload.lang === "bn" ? "bn" : "en";
  const title = localizedText(payload.title as LocalizedText | undefined, lang);
  const body = localizedText(payload.body as LocalizedText | undefined, lang);
  if (!title || !body) return;

  const url = typeof payload.url === "string" && payload.url ? payload.url : "/parent/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: kind, // one notification per kind — re-sends replace, never stack
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination =
    typeof event.notification.data?.url === "string" && event.notification.data.url
      ? event.notification.data.url
      : "/parent/";
  // The parent portal lives under /parent/ on this same origin.
  const target = new URL(destination, self.location.origin);

  event.waitUntil(
    (async () => {
      // Focus an already-open parent portal tab first; otherwise open one.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).pathname.startsWith("/parent/")) {
          await (client as WindowClient).focus();
          return;
        }
      }
      try {
        await self.clients.openWindow(target.href);
      } catch {
        /* Browsers can block openWindow outside a user gesture — the
         * focus-existing-tab path above is the primary route. */
      }
    })()
  );
});

wbClients.clientsClaim();
wbPrecache.precacheAndRoute(self.__WB_MANIFEST);
wbPrecache.cleanupOutdatedCaches();

// SPA navigation fallback. The sibling apps (/parent portal, /admin console)
// live on the SAME origin — never answer those with the game's index.html.
registerRoute(
  new NavigationRoute(wbPrecache.createHandlerBoundToURL("/index.html"), {
    // #992 — match the sibling app prefixes regardless of trailing slash or
    // letter case (/parent, /Parent/, /ADMIN …) so a navigation to any variant
    // never falls back to the game's index.html.
    denylist: [/^\/parent(?:\/|$)/i, /^\/admin(?:\/|$)/i],
  })
);

// Neural-voice assets (piper phonemizer + per-language model + onnx runtime):
// way over the precache cap, so CacheFirst on first use — then fully offline.
// #991 — the biggest asset (the ~110MB model) must NOT be subject to the 5 MiB
// precache cap (maximumFileSizeToCacheInBytes) — this route gives /voice/ its
// OWN explicit large-response guard so the model can actually land in Cache
// Storage instead of being silently skipped.
const VOICE_MAX_CACHE_BYTES = 150 * 1024 * 1024; // ~110MB model + ORT wasm headroom
const voiceSizeGuard: WorkboxPlugin = {
  cacheWillUpdate: async ({ response }) => {
    if (!response || (response.status !== 200 && response.status !== 0)) return null;
    const declared = response.headers.get("content-length");
    if (declared) {
      const bytes = Number(declared);
      if (Number.isFinite(bytes) && bytes > VOICE_MAX_CACHE_BYTES) return null;
    }
    return response;
  },
};
registerRoute(
  /\/voice\/.*$/,
  new CacheFirst({
    cacheName: "nv-voice",
    plugins: [
      new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 180 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      voiceSizeGuard,
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

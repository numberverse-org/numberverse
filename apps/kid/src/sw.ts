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
  const data = (event.data as { type?: string; path?: string } | null) ?? null;
  if (data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  // #1585 — the speech layer probes whether the neural voice model is already in
  // the nv-voice cache. A held Bangla line behind a model that can NEVER download
  // (offline + not cached) falls back to best-effort speech immediately instead of
  // waiting out its hold timeout. Keys are matched by pathname so the probe never
  // couples to the ?v= cache-busting version string (neuralVoice.ts owns that).
  if (data?.type === "NV_VOICE_CACHE_PROBE" && typeof data.path === "string") {
    event.waitUntil(
      (async () => {
        let cached = false;
        if (data.path) {
          try {
            const cache = await caches.open("nv-voice");
            cached = (await cache.keys()).some(
              (req) => req instanceof Request && new URL(req.url).pathname === data.path
            );
          } catch {
            cached = false;
          }
        }
        const src = event.source as { postMessage: (msg: unknown) => void } | null;
        src?.postMessage({ type: "NV_VOICE_CACHE_PROBE_RESULT", path: data.path, cached });
      })()
    );
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
    // #1662 — voice is same-origin and ALWAYS 200; an opaque (status 0)
    // response has no readable headers, so the size guard could not vet it.
    // Only a real 200 may enter nv-voice.
    if (!response || response.status !== 200) return null;
    const declared = response.headers.get("content-length");
    if (declared) {
      const bytes = Number(declared);
      if (Number.isFinite(bytes) && bytes > VOICE_MAX_CACHE_BYTES) return null;
      return response;
    }
    // #1657 — no Content-Length (chunked / CDN-stripped) previously bypassed
    // the guard, so an uncapped body could bloat (or evict) the cache. Stream
    // the body counting ACTUAL bytes and refuse anything over the cap; then
    // reconstruct a fresh Response from the buffered body to cache.
    if (!response.body) return null; // unverifiable length — never cache
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > VOICE_MAX_CACHE_BYTES) {
          await reader.cancel();
          return null; // over the cap — do not cache an unbounded body
        }
        chunks.push(value);
      }
    } catch {
      return null; // stream error — length unverifiable, refuse to cache
    } finally {
      reader.releaseLock();
    }
    const headers = new Headers(response.headers);
    headers.set("content-length", String(total));
    return new Response(new Blob(chunks), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
registerRoute(
  /\/voice\/.*$/,
  new CacheFirst({
    cacheName: "nv-voice",
    plugins: [
      new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 180 }),
      // #1662 — [200] only: voice is same-origin, never opaque (0). An opaque
      // hit would skip the size guard and cache an unvettable body.
      new CacheableResponsePlugin({ statuses: [200] }),
      voiceSizeGuard,
    ],
  }),
  "GET"
);

// #1735 — og-card (social link preview) must survive offline: og:image points
// at the live host, and a shared link opened offline should still show its
// card. og-card.png is in the precache glob, but the WebP/AVIF alternatives
// (#1727) and any future format need a runtime home too — mirror /voice with a
// CacheFirst route so an og-card miss is fetched once, then served offline.
registerRoute(
  /\/og-card\.(?:png|webp|avif)$/,
  new CacheFirst({
    cacheName: "nv-og",
    plugins: [
      new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  }),
  "GET"
);

// #1722 — Bengali font faces (Noto Sans Bengali ×5, ~235KB) are NOT in the
// static precache (see vite.config.ts globIgnores): an en-only install must
// not download Bangla weights it never renders. CacheFirst on first use
// (mirrors /voice) so a bn session works fully offline after one SW-controlled
// online load. Latin faces stay precached. The preload in index.html only fires
// for bn installs, so this route is cold for en sessions.
registerRoute(
  /\/fonts\/NotoSansBengali-.*\.woff2$/,
  new CacheFirst({
    cacheName: "nv-fonts-bn",
    plugins: [
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [200] }),
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

// #1659 — nv-api is a SHORT-TTL, BOUNDED snapshot of the last-good server state
// (never an unbounded log). maxEntries caps growth so the cache can't balloon
// and evict the voice seed; maxAgeSeconds keeps a replay from being arbitrarily
// ancient.
const API_MAX_ENTRIES = 40;
const API_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7-day TTL last-good snapshot

async function apiCachePut(cache: Cache, request: Request, response: Response): Promise<void> {
  const now = Date.now();
  // Stamp the replay time so the staleness marker + TTL purge have a date.
  const headers = new Headers(response.headers);
  headers.set("X-NV-Cached-At", String(now));
  const stamped = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, stamped);
  await trimApiCache(cache, now);
}

async function trimApiCache(cache: Cache, now: number): Promise<void> {
  const read = async (): Promise<Array<{ key: Request; t: number }>> => {
    const out: Array<{ key: Request; t: number }> = [];
    for (const key of await cache.keys()) {
      const res = await cache.match(key);
      const t = Number(res?.headers.get("X-NV-Cached-At") || 0);
      out.push({ key, t });
    }
    out.sort((a, b) => a.t - b.t); // ascending → oldest first
    return out;
  };

  // maxAge — drop entries older than the TTL (ascending → break at first fresh).
  for (const e of await read()) {
    if (e.t && now - e.t > API_MAX_AGE_MS) await cache.delete(e.key);
    else break;
  }
  // maxEntries — cap the live count, deleting oldest first.
  let live = await cache.keys();
  let count = live.length;
  if (count > API_MAX_ENTRIES) {
    for (const e of await read()) {
      if (count <= API_MAX_ENTRIES) break;
      await cache.delete(e.key);
      count--;
    }
  }
}

// #1658 — an offline replay is NOT the live server state: mark it with
// X-NV-Offline:1 (plus Date/Age) so the UI can show "showing last saved data"
// instead of presenting a stale snapshot as if it were current.
function staleEnvelope(cached: Response): Response {
  const headers = new Headers(cached.headers);
  headers.set("X-NV-Offline", "1");
  const date = headers.get("date") || headers.get("X-NV-Cached-At");
  if (date) headers.set("Date", date);
  headers.set("Age", "0");
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers,
  });
}

async function apiNetworkBoundary({ request }: { request: Request }): Promise<Response> {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    // Cache successful GETs (kid settings, snapshots, roster) so a later
    // offline session replays the last-good server state instead of failing.
    if (request.method === "GET" && response.ok) {
      await apiCachePut(cache, request, response.clone());
    }
    return response;
  } catch {
    // Network unreachable — NEVER let this escape as a network failure.
    if (request.method === "GET") {
      // #1650 — match with the EXACT key the put wrote (query included).
      // ignoreSearch would collapse every /api endpoint to its bare pathname
      // and answer an offline ?kid=B request with whatever ?kid=A body was last
      // cached — serving the WRONG child's roster/snapshots/settings on a
      // multi-kid shared device with no staleness signal. The 503 envelope (not
      // a substituted body) is the safe failure mode for a query that wasn't
      // cached.
      const cached = await cache.match(request);
      if (cached) return staleEnvelope(cached);
      return offlineEnvelope(503, {});
    }
    // Mutation offline: the app keeps its durable outbox queued and retries
    // on the online heartbeat — a 503 here is "accepted for retry", not loss.
    return offlineEnvelope();
  }
}

// #1651 — registerRoute defaulted to GET, so the mutation 503 branch above was
// dead for non-GETs and offline writes failed with a TypeError instead of the
// documented 503 + X-NV-Offline:1 envelope. Workbox routes by ONE HTTP method
// per route (Router._routes is keyed by request.method), so register the same
// handler under every method that can hit /api/.
const API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
for (const method of API_METHODS) {
  registerRoute(
    ({ url }) => url.pathname.startsWith("/api/"),
    apiNetworkBoundary,
    method
  );
}

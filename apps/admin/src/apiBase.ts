/**
 * API base for the admin console. Resolution order:
 *  1. VITE_API_URL at build time (the demo/tunnel build sets "/api/v1" —
 *     same origin, proxied by nginx through the Cloudflare tunnel).
 *  2. HTTPS pages → same-origin "/api/v1".
 *  3. Plain http → http://hostname:8000 (LAN dev).
 */
export const API =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  (typeof window !== "undefined"
    ? window.location.protocol === "https:"
      ? "/api/v1"
      : `http://${window.location.hostname}:8000/api/v1`
    : "http://127.0.0.1:8000/api/v1");

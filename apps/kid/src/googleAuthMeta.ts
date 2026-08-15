/**
 * Lightweight Google OAuth metadata (#885) — kept separate from
 * GoogleSignIn.tsx so the parent gate can decide whether to show the Google
 * button WITHOUT bundling the GIS script-loader component (and its retry/
 * render effect) into the App chunk. The heavy identity path stays in the
 * lazy GoogleSignIn chunk.
 */

export function googleClientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
}

/** True when the OAuth client id is configured AND we're in a secure context
 *  (HTTPS — the Cloudflare tunnel origin; the http LAN fallback never shows
 *  the Google button, because GIS refuses to run there). */
export function googleEnabled(): boolean {
  const id = googleClientId();
  if (!id) return false;
  if (typeof window === "undefined") return true;
  return window.isSecureContext === true;
}

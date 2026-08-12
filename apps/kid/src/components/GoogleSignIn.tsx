import { useEffect, useRef, useState } from "react";
import { API } from "../api";

/**
 * Google sign-in (Identity Services) — renders Google's own "Continue with
 * Google" button into a container and hands the verified ID token back.
 *
 * The OAuth client id is baked at build time from `VITE_GOOGLE_CLIENT_ID`.
 * Google's GIS only runs in a secure context, so on the LAN (http) origin the
 * button simply never appears — email + guest always remain the fallback.
 *
 * #382 hardening — three ways a Google button can fail are all handled:
 *  1. The GSI script fails to load → retried with exponential backoff
 *     (1s → 3s → 9s, max 3 attempts) before giving up.
 *  2. The BACKEND has no NV_GOOGLE_CLIENT_ID (a build-time/bake mismatch) →
 *     the button is replaced by `fallbackText` instead of 501-ing on tap.
 *  3. A verified token is still rejected → the caller's submitGoogle path
 *     shows the gate's Google error and email/guest remain.
 */

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (cfg: {
            client_id: string;
            callback: (resp: { credential?: string }) => void;
          }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

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

interface Props {
  onToken: (idToken: string) => void;
  disabled?: boolean;
  /** Localized note shown in place of the button when Google can't run here
   *  (script unloadable after retries, or the backend has no OAuth client).
   *  Points the parent at the email path that always works. */
  fallbackText?: string;
  /** Current app UI language — pinned onto Google's button so it NEVER
   *  auto-localizes to a surprise language (e.g. a German-browser parent
   *  seeing "Weiter mit Google"). bn → বাংলা, en → English. */
  lang?: "en" | "bn";
}

/** Max script-load attempts and backoff between them (ms) — Google's CDN is
 *  usually reliable, but on a flaky mobile connection one retry isn't enough. */
const MAX_SCRIPT_ATTEMPTS = 3;
const RETRY_DELAYS = [1000, 3000, 9000];

export function GoogleSignIn({ onToken, disabled, fallbackText, lang }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<null | "backend" | "script">(null);
  // Keep the latest callback without re-running the mount effect (which would
  // re-render the Google button on every parent re-render).
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    setFailed(null); // fresh attempt per language — a stale fallback note shouldn't linger
    const clientId = googleClientId();
    if (!clientId || !container.current) return;
    if (!googleEnabled()) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    let attempts = 0;

    const start = () => {
      const gid = window.google?.accounts?.id;
      if (!gid || !container.current) return;
      // Re-render safety: GIS throws if renderButton is called on an element
      // that already holds a button (a language switch re-runs this effect) —
      // clear it first so the new locale actually takes.
      container.current.innerHTML = "";
      gid.initialize({
        client_id: clientId,
        callback: (resp) => {
          if (resp?.credential) onTokenRef.current(resp.credential);
          else setFailed("script");
        },
      });
      gid.renderButton(container.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 340,
        // #391 — Google auto-detects the button language from the browser /
        // Google-account locale, which is how a parent ends up seeing
        // "Weiter mit Google". Pin it to the app language: never surprise.
        locale: lang === "bn" ? "bn" : "en",
      });
    };

    // 1) Coherence check (#382): only show the button when THIS backend can
    //    verify Google tokens. A build baked with VITE_GOOGLE_CLIENT_ID but a
    //    server whose env lacks NV_GOOGLE_CLIENT_ID would otherwise 501 on
    //    every tap. Non-fatal on a network hiccup — the token path still
    //    errors clearly.
    fetch(`${API}/auth/google/status`)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((st) => {
        if (!cancelled && st?.enabled === false) setFailed("backend");
      })
      .catch(() => {
        /* backend unreachable right now — stay optimistic */
      });

    // 2) Script load with exponential backoff (#382): a fresh <script> per
    //    attempt, up to MAX_SCRIPT_ATTEMPTS, before we give up and render
    //    the email fallback.
    const loadScript = () => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      const onLoad = () => {
        if (!cancelled) start();
      };
      const onError = () => {
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
        if (cancelled) return;
        attempts += 1;
        if (attempts < MAX_SCRIPT_ATTEMPTS) {
          retryTimer = window.setTimeout(loadScript, RETRY_DELAYS[attempts - 1] ?? 5000);
        } else {
          setFailed("script");
        }
      };
      script.addEventListener("load", onLoad);
      script.addEventListener("error", onError);
    };

    if (window.google?.accounts?.id) {
      start();
      return;
    }
    loadScript();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [lang]);

  if (failed) {
    // GIS unavailable (network or backend) → the email + guest fallbacks are
    // right below; a clear note tells the parent what happened.
    return fallbackText ? (
      <p className="gate-google-fallback" role="status">
        {fallbackText}
      </p>
    ) : null;
  }
  return <div className={`google-btn${disabled ? " busy" : ""}`} ref={container} />;
}

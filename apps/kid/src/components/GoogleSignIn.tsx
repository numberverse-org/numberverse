import { useEffect, useRef, useState } from "react";
import { API } from "../api";
import { googleClientId, googleEnabled } from "../googleAuthMeta";

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

export { googleClientId, googleEnabled } from "../googleAuthMeta";

interface Props {
  onToken: (idToken: string) => void;
  disabled?: boolean;
  /** Localized note shown in place of the button when Google can't run here
   *  (script unloadable after retries, or the backend has no OAuth client).
   *  Points the parent at the email path that always works. */
  fallbackText?: string;
  /** Localized retry label shown with fallbackText so a parent can re-run the
   *  script-load effect after a flaky connection dropped it. */
  retryText?: string;
  /** Current app UI language — pinned onto Google's button so it NEVER
   *  auto-localizes to a surprise language (e.g. a German-browser parent
   *  seeing "Weiter mit Google"). bn → বাংলা, en → English. */
  lang?: "en" | "bn";
}

/** Max script-load attempts and backoff between them (ms) — Google's CDN is
 *  usually reliable, but on a flaky mobile connection one retry isn't enough. */
const MAX_SCRIPT_ATTEMPTS = 3;
const RETRY_DELAYS = [1000, 3000, 9000];

export function GoogleSignIn({ onToken, disabled, fallbackText, retryText, lang }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<null | "backend" | "script" | "unavailable">(null);
  const [retryNonce, setRetryNonce] = useState(0);
  // Keep the latest callback without re-running the mount effect (which would
  // re-render the Google button on every parent re-render).
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    setFailed(null); // fresh attempt per language/retry — a stale fallback note shouldn't linger
    const clientId = googleClientId();
    if (!clientId || !container.current) return;
    if (!googleEnabled()) {
      // #1466 — not a secure context (http LAN), so Google's GIS cannot run.
      // Show the same retry-able fallback instead of a dead-end note.
      setFailed("unavailable");
      return;
    }
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
          // #1465 — always forward the credential; the caller's busy guard
          // surfaces a visible note. Dropping it here would swallow the re-tap
          // with zero feedback.
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
        if (!cancelled && st?.enabled === false) {
          // The container stays mounted (hidden) so Retry can re-run this
          // effect — clear any button that already rendered before the status
          // came back "backend disabled".
          if (container.current) container.current.innerHTML = "";
          setFailed("backend");
        }
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
  }, [lang, retryNonce]);

  // Keep the button container mounted even while failed so a Retry click can
  // re-run the effect above and find the ref again. Hidden while failed so the
  // (empty or stale) Google button never shows next to the fallback note.
  return (
    <>
      <div
        className={`google-btn${disabled ? " busy" : ""}`}
        ref={container}
        aria-busy={disabled || undefined}
        aria-disabled={disabled || undefined}
        style={failed ? { display: "none" } : undefined}
      />
      {failed && fallbackText ? (
        <div className="gate-google-fallback" role="status">
          <span>{fallbackText}</span>
          {retryText && (
            <button
              type="button"
              onClick={() => setRetryNonce((n) => n + 1)}
              style={{
                marginTop: 10,
                padding: "7px 16px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(255,255,255,0.08)",
                color: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {retryText}
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}

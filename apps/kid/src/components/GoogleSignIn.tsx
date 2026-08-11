import { useEffect, useRef, useState } from "react";

/**
 * Google sign-in (Identity Services) — renders Google's own "Continue with
 * Google" button into a container and hands the verified ID token back.
 *
 * The OAuth client id is baked at build time from `VITE_GOOGLE_CLIENT_ID`.
 * Google's GIS only runs in a secure context, so on the LAN (http) origin the
 * button simply never appears — email + guest always remain the fallback.
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
}

export function GoogleSignIn({ onToken, disabled }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Keep the latest callback without re-running the mount effect (which would
  // re-render the Google button on every parent re-render).
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    const clientId = googleClientId();
    if (!clientId || !container.current) return;
    if (!googleEnabled()) return;
    let cancelled = false;

    const start = () => {
      const gid = window.google?.accounts?.id;
      if (!gid || !container.current) return;
      gid.initialize({
        client_id: clientId,
        callback: (resp) => {
          if (resp?.credential) onTokenRef.current(resp.credential);
          else setFailed(true);
        },
      });
      gid.renderButton(container.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 340,
      });
    };

    if (window.google?.accounts?.id) {
      start();
      return;
    }
    let script = document.getElementById("gsi-script") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = "gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const onLoad = () => {
      if (!cancelled) start();
    };
    const onError = () => {
      if (!cancelled) setFailed(true);
    };
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    return () => {
      cancelled = true;
      script?.removeEventListener("load", onLoad);
      script?.removeEventListener("error", onError);
    };
  }, []);

  if (failed) return null; // GIS unavailable → email + guest remain
  return <div className={`google-btn${disabled ? " busy" : ""}`} ref={container} />;
}

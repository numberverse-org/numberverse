"use client";

/**
 * #1704 — route-segment error boundary for the parent portal. When ANY route
 * under this segment throws (a dashboard card, the share client, a lazy load),
 * Next.js renders this friendly fallback instead of unmounting the whole app.
 *
 * Copy matches the portal's BANNER_LANGS tone and is self-contained en/bn
 * (this page must render even when the portal's own data graph has failed, so
 * it never imports from ../lib/portal).
 */
import { useEffect } from "react";
import { logBoundaryError } from "../../kid/src/components/ErrorBoundary";

const ERR_LANGS = {
  en: {
    title: "The portal hit a snag",
    body: "Something went wrong on this page. Try again, or head back to the login screen.",
    retry: "Try again",
    backLogin: "Back to login",
  },
  bn: {
    title: "পোর্টালে একটু সমস্যা হয়েছে",
    body: "এই পাতায় কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন, অথবা লগইন স্ক্রিনে ফিরে যান।",
    retry: "আবার চেষ্টা করুন",
    backLogin: "লগইনে ফিরে যান",
  },
} as const;

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // #1711 — log through the shared boundary's diag path (console.error in dev,
  // capped in-memory buffer in prod — never analytics).
  useEffect(() => {
    logBoundaryError("portal-route", error);
  }, [error]);

  const bn =
    typeof window !== "undefined" &&
    (() => {
      try {
        return localStorage.getItem("nv_parent_lang") === "bn";
      } catch {
        return false;
      }
    })();
  const t = ERR_LANGS[bn ? "bn" : "en"];

  const backToLogin = () => {
    try {
      localStorage.removeItem("nv_parent_token");
      localStorage.removeItem("nv_parent_name");
    } catch {
      /* storage denied — navigation still clears the in-memory session */
    }
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    window.location.href = `${base}/login/`;
  };

  return (
    <main className="shell">
      <div className="card" style={{ textAlign: "center", padding: "48px 24px", marginTop: 48 }}>
        <div className="logo" style={{ fontSize: 44 }} aria-hidden>
          🔢
        </div>
        <h1>{t.title}</h1>
        <p className="muted" style={{ maxWidth: 420, margin: "12px auto" }}>
          {t.body}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-small primary" onClick={reset}>
            {t.retry}
          </button>
          <button type="button" className="btn btn-small" onClick={backToLogin}>
            {t.backLogin}
          </button>
        </div>
      </div>
    </main>
  );
}
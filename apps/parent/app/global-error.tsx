"use client";

/**
 * #1704 — ROOT-LAYOUT error boundary. When even the layout/layout-shell throws
 * (the whole app shell fails to mount), Next.js renders THIS file instead. It
 * must render its own <html><body> — the root layout (and therefore globals.css
 * / PwaBoot) is gone at this point, so everything is inline-styled.
 *
 * Copy matches the portal's BANNER_LANGS tone; self-contained en/bn.
 */
import { useEffect } from "react";
import { logBoundaryError } from "../../kid/src/components/ErrorBoundary";

const GLOBAL_ERR_LANGS = {
  en: {
    title: "Numberverse is having trouble starting",
    body: "The parent portal hit an unexpected error. Try again — your data is safe.",
    retry: "Try again",
    backLogin: "Back to login",
  },
  bn: {
    title: "Numberverse শুরু করতে সমস্যা হচ্ছে",
    body: "অভিভাবক পোর্টালে অপ্রত্যাশিত একটি ত্রুটি হয়েছে। আবার চেষ্টা করুন — আপনার ডেটা নিরাপদ।",
    retry: "আবার চেষ্টা করুন",
    backLogin: "লগইনে ফিরে যান",
  },
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logBoundaryError("portal-global", error);
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
  const t = GLOBAL_ERR_LANGS[bn ? "bn" : "en"];

  const backToLogin = () => {
    try {
      localStorage.removeItem("nv_parent_token");
      localStorage.removeItem("nv_parent_name");
    } catch {
      /* storage denied */
    }
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    window.location.href = `${base}/login/`;
  };

  const btn: React.CSSProperties = {
    border: "none",
    borderRadius: 999,
    padding: "12px 24px",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    minWidth: 140,
    minHeight: 48,
    margin: "0 6px",
  };

  return (
    <html lang={bn ? "bn" : "en"}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "linear-gradient(180deg, #0b2545 0%, #13315c 60%, #1b3a5f 100%)",
          color: "#fff",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 460 }}>
          <div style={{ fontSize: 52 }} aria-hidden>
            🔢
          </div>
          <h1 style={{ margin: "16px 0 8px", fontSize: 24 }}>{t.title}</h1>
          <p style={{ margin: "0 auto 24px", fontSize: 16, opacity: 0.85, maxWidth: 360 }}>
            {t.body}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            <button type="button" onClick={reset} style={{ ...btn, background: "#ffd166", color: "#0b2545" }}>
              {t.retry}
            </button>
            <button
              type="button"
              onClick={backToLogin}
              style={{ ...btn, background: "rgba(255,255,255,0.14)", color: "#fff" }}
            >
              {t.backLogin}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
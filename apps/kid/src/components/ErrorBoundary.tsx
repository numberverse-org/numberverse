/**
 * ErrorBoundary — THE one reusable error boundary for the kid app AND the
 * Next.js parent portal (#1714).
 *
 * The two hand-rolled boundaries (main.tsx BootErrorBoundary, Nova3DHome's
 * IslandErrorBoundary) are migrated onto this, and every screen/section gets
 * one. It is deliberately SELF-CONTAINED (no React-Suspense, no app i18n, no
 * CSS files): it must stay importable by the boot chunk (which cannot pull
 * @numberverse/core or STR — #1217) and by the parent portal (Next.js static
 * export) without dragging either app's graph in.
 *
 * Features:
 *   · configurable fallback — a full `fallback` node, or localized `copy`
 *   · onCatch — #1711: console.error in dev, capped in-memory nvDiagErrors-
 *     style buffer in prod (never analytics)
 *   · action buttons — Retry (default resets the subtree; React.lazy
 *     re-attempts a failed chunk import on re-render), Go home / Go back
 *     (onGoHome), Reset-and-start-fresh (onResetFresh, boot-only #1708)
 */
import { Component, type ReactNode, type ErrorInfo } from "react";

export type ErrLang = "en" | "bn";

/** Localized fallback copy. Kid-app screens override with STR-sourced strings
 *  (locale gate); the boot chunk and the parent portal use the defaults or
 *  their own inline en/bn. */
export interface BoundaryCopy {
  title: string;
  body: string;
  retry: string;
  goHome: string;
  resetFresh: string;
}

export const DEFAULT_ERR_COPY: Record<ErrLang, BoundaryCopy> = {
  en: {
    title: "Something went wrong",
    body: "Don't worry — let's go back and keep playing!",
    retry: "Try again",
    goHome: "Go back",
    resetFresh: "Reset and start fresh",
  },
  bn: {
    title: "কিছু একটা সমস্যা হয়েছে",
    body: "চিন্তা নেই — ফিরে গিয়ে আবার খেলি!",
    retry: "আবার চেষ্টা করো",
    goHome: "ফিরে যাই",
    resetFresh: "রিসেট করে নতুন করে শুরু করো",
  },
};

/** Locale detection that works in BOTH the kid app (nv_lang) and the parent
 *  portal (nv_parent_lang), without importing either app's i18n machinery.
 *  Storage-denied contexts fall back to English. */
export function detectBoundaryLang(): ErrLang {
  try {
    const saved = localStorage.getItem("nv_lang") ?? localStorage.getItem("nv_parent_lang");
    if (saved === "bn") return "bn";
  } catch {
    /* storage denied — English fallback */
  }
  return "en";
}

/* ── #1711 — boundary error logging ─────────────────────────────────────
 * Every boundary calls through logBoundaryError (directly or via the default
 * onCatch): console.error in dev (the console.* audit explicitly allows
 * console.error on genuine error paths), plus a capped in-memory ring buffer
 * mirroring the parent portal's nvDiagErrors. Nothing is ever sent anywhere —
 * no analytics, no beacons. */
export const NV_BOUNDARY_DIAG_MAX = 20;
export const nvBoundaryErrors: { at: string; msg: string }[] = [];

/** Dev check that type-checks under BOTH bundlers: Vite's `import.meta.env`
 *  (kid app) and Next.js (parent). The cast keeps both tsc runs happy. */
const IS_DEV: boolean =
  typeof import.meta !== "undefined" &&
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

export function logBoundaryError(where: string, error: unknown): void {
  const summary = error instanceof Error ? error.message : String(error);
  const msg = `[error-boundary:${where}] ${summary}`;
  if (IS_DEV) console.error(msg, error);
  nvBoundaryErrors.push({ at: new Date().toISOString(), msg });
  if (nvBoundaryErrors.length > NV_BOUNDARY_DIAG_MAX) nvBoundaryErrors.shift();
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** stable label for diag logging ("boot", "screen:home", "island", …) */
  label?: string;
  /** active language for the localized fallback (default: detectBoundaryLang) */
  lang?: ErrLang;
  /** override the localized fallback copy (STR-sourced in the kid app) */
  copy?: Partial<BoundaryCopy>;
  /** full fallback override — replaces the default UI. Receives the same
   *  helpers as the default buttons so callers can build bespoke copy. */
  fallback?: (info: {
    lang: ErrLang;
    copy: BoundaryCopy;
    retry: () => void;
    goHome?: () => void;
    resetFresh?: () => void;
  }) => ReactNode;
  /** #1711 — logging hook. Defaults to logBoundaryError(label). */
  onCatch?: (error: unknown, errorInfo: ErrorInfo) => void;
  /** custom retry instead of the default subtree reset */
  onRetry?: () => void;
  /** shows a "go home / go back" action */
  onGoHome?: () => void;
  /** shows a "reset and start fresh" action (boot #1708) */
  onResetFresh?: () => void;
  /** changing this key after a failure resets the boundary (e.g. retry loops) */
  resetKey?: unknown;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    if (this.props.onCatch) this.props.onCatch(error, errorInfo);
    else logBoundaryError(this.props.label ?? "unknown", error);
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  /** default retry: drop the failed flag so the subtree re-renders. For a lazy
   *  chunk that rejected, React.lazy re-attempts the import on the new render,
   *  so this is a chunk retry WITHOUT a full reload (#1709/#1712). */
  private retry = () => {
    if (this.props.onRetry) this.props.onRetry();
    else this.setState({ failed: false });
  };

  private goHome = () => {
    this.setState({ failed: false });
    this.props.onGoHome?.();
  };

  private resetFresh = () => {
    this.props.onResetFresh?.();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    const lang = this.props.lang ?? detectBoundaryLang();
    const copy: BoundaryCopy = { ...DEFAULT_ERR_COPY[lang], ...this.props.copy };

    if (this.props.fallback) {
      return this.props.fallback({
        lang,
        copy,
        retry: this.retry,
        goHome: this.props.onGoHome ? this.goHome : undefined,
        resetFresh: this.props.onResetFresh ? this.resetFresh : undefined,
      });
    }

    // Default fallback — self-contained inline styles so it renders identically
    // inside the kid app, the boot chunk, and the parent portal. Nova + an
    // accessible alert with kid-safe, localized copy.
    const btn: React.CSSProperties = {
      border: "none",
      borderRadius: 999,
      padding: "12px 24px",
      fontSize: 16,
      fontWeight: 800,
      cursor: "pointer",
      minWidth: 140,
      minHeight: 48,
    };
    return (
      <div
        className="nv-boundary"
        role="alert"
        aria-live="assertive"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: 32,
          textAlign: "center",
          background: "linear-gradient(180deg, #d9f1ff 0%, #a8d8f0 100%)",
          color: "#0b2545",
        }}
      >
        <span role="img" aria-hidden style={{ fontSize: 56 }}>🦉</span>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{copy.title}</h2>
        <p style={{ margin: 0, maxWidth: 320, fontSize: 16, opacity: 0.85 }}>{copy.body}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            onClick={this.retry}
            style={{ ...btn, background: "#ffd166", color: "#0b2545" }}
          >
            {copy.retry}
          </button>
          {this.props.onGoHome && (
            <button
              type="button"
              onClick={this.goHome}
              style={{ ...btn, background: "rgba(255,255,255,0.7)" }}
            >
              {copy.goHome}
            </button>
          )}
          {this.props.onResetFresh && (
            <button
              type="button"
              onClick={this.resetFresh}
              style={{ ...btn, background: "#0b2545", color: "#fff" }}
            >
              {copy.resetFresh}
            </button>
          )}
        </div>
      </div>
    );
  }
}
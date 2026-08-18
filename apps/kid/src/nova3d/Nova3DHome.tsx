/**
 * 🦉 NOVA'S 3D ISLAND — host screen (#684).
 *
 * The opt-in React surface for the lazy three.js island:
 *   • WebGL probe first — unsupported devices fall back to the 2D Nova home
 *     with a friendly message (never a blank/blue screen)
 *   • React.lazy → the island (three + R3F + drei) is its OWN Vite chunk,
 *     keeping the core bundle at the <1.5 MB cold-start budget
 *   • Suspense spinner during shader warm-up / chunk load
 *   • "Play games (2D)" returns to the 2D NovaScene where the pet mini-games
 *     and the 135 learning games live — Phaser never mounts alongside this.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import ErrorBoundary, { logBoundaryError } from "../components/ErrorBoundary";
import { getAppLang } from "../game/locale";
import { speak } from "../game/speech";
import { STR } from "../i18n";
import { sanitizeDisplayName } from "../sanitize"; // #1830 — clean the kid name before it reaches the utterance
import { webglAvailable } from "./webgl";

const Nova3D = lazy(() => import("./Nova3D"));

interface Props {
  kidName: string;
  kidId?: string; // #689 store keys (nova / garden / coins)
  onBack2d: () => void; // → 2D Nova home (pet games etc.)
  onExit: () => void; // → the app home
}

export default function Nova3DHome({ kidName, kidId, onBack2d, onExit }: Props) {
  const lang = getAppLang() === "bn" ? "bn" : "en";
  const t = STR[lang];
  const [noWebgl] = useState(() => !webglAvailable());
  const spokeRef = useRef(false);

  // one gentle spoken welcome when the island actually renders
  useEffect(() => {
    if (noWebgl || spokeRef.current) return;
    spokeRef.current = true;
    const id = window.setTimeout(() => {
      speak(`${kidName ? `${sanitizeDisplayName(kidName, { forSpeech: true })}, ` : ""}${t.islandTitle}`, { lang });
    }, 600);
    return () => window.clearTimeout(id);
  }, [noWebgl, kidName, t.islandTitle, lang]);

  if (noWebgl) {
    return (
      <div className="island-root island-fallback">
        <p className="island-msg">🦉 {t.islandNoWebgl}</p>
        <button className="island-btn" onClick={onBack2d}>
          {t.islandBack2d}
        </button>
      </div>
    );
  }

  return (
    <div className="island-root">
      <header className="island-topbar">
        <button className="island-back" onClick={onExit} aria-label={t.islandBack}>
          {t.islandBack}
        </button>
        <h1 className="island-title">
          {t.islandTitle} <span className="island-beta">{t.islandBeta}</span>
        </h1>
        <button className="island-back island-right" onClick={onBack2d} aria-label={t.islandBack2d}>
          🎮
        </button>
      </header>

      {/* #1714/#1713 — the shared boundary takes over IslandErrorBoundary's
          role: a lazy chunk / render throw never blanks the app. #1713 — the
          fallback now shows a KID-FACING localized message (not a silent empty
          frame) with "Go back" (→ 2D Nova) + Retry (re-attempts the island
          import). */}
      <ErrorBoundary
        label="island"
        lang={lang}
        copy={{
          title: t.errTitle,
          body: t.errBody,
          retry: t.errRetry,
          goHome: t.errGoHome,
        }}
        onCatch={(error) => logBoundaryError("island", error)}
        onGoHome={onBack2d}
      >
        <Suspense
          fallback={
            <div className="island-loading" role="status">
              <div className="island-spinner" aria-hidden="true" />
              <p>{t.islandLoading}</p>
            </div>
          }
        >
          <div className="island-canvas">
            <Nova3D onPlay2d={onBack2d} kidId={kidId} />
          </div>
        </Suspense>
      </ErrorBoundary>

      <footer className="island-bottom">
        <span className="island-hint">{t.islandHint}</span>
        <button className="island-play" onClick={onBack2d}>
          {t.islandPlayGames}
        </button>
      </footer>
    </div>
  );
}

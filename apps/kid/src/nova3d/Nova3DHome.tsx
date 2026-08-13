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
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { getAppLang } from "../game/locale";
import { speak } from "../game/speech";
import { STR } from "../i18n";
import { webglAvailable } from "./webgl";

const Nova3D = lazy(() => import("./Nova3D"));

interface Props {
  kidName: string;
  onBack2d: () => void; // → 2D Nova home (pet games etc.)
  onExit: () => void; // → the app home
}

/** #684 — a lazy-chunk load failure must NEVER blank the app. If the 3D
 *  island's chunk throws (browser quirk, cache corruption…), we fall back to
 *  the 2D Nova home instead of unmounting the whole React tree. */
class IslandErrorBoundary extends Component<
  { onFallback: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // drop the island for this visit — the kid is back on 2D in a tap
    this.props.onFallback();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function Nova3DHome({ kidName, onBack2d, onExit }: Props) {
  const lang = getAppLang() === "bn" ? "bn" : "en";
  const t = STR[lang];
  const [noWebgl] = useState(() => !webglAvailable());
  const spokeRef = useRef(false);

  // one gentle spoken welcome when the island actually renders
  useEffect(() => {
    if (noWebgl || spokeRef.current) return;
    spokeRef.current = true;
    const id = window.setTimeout(() => {
      speak(`${kidName ? `${kidName}, ` : ""}${t.islandTitle}`, { lang });
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

      <IslandErrorBoundary onFallback={onBack2d}>
        <Suspense
          fallback={
            <div className="island-loading" role="status">
              <div className="island-spinner" aria-hidden="true" />
              <p>{t.islandLoading}</p>
            </div>
          }
        >
          <div className="island-canvas">
            <Nova3D />
          </div>
        </Suspense>
      </IslandErrorBoundary>

      <footer className="island-bottom">
        <span className="island-hint">{t.islandHint}</span>
        <button className="island-play" onClick={onBack2d}>
          {t.islandPlayGames}
        </button>
      </footer>
    </div>
  );
}

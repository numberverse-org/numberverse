import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Icon } from "./components/Icon";
import "./styles/boot.css"; // #1177 — splash + base tokens only; screens.css rides the lazy App chunk

/**
 * #1217 — the heavy graph (App → @numberverse/core tables, the full zustand
 * persist tree, ./api, ./i18n's thousands of string keys, Phaser scenes) must
 * NOT evaluate before first paint. Only the splash + a handful of static deps
 * live in the boot chunk; <App/> is a lazy chunk that resolves DURING the
 * splash window, so the splash pixels render first (no JS graph to parse first).
 */
let appLoadedResolve: (() => void) | null = null;
const appLoaded = new Promise<void>((r) => {
  appLoadedResolve = r;
});
const App = lazy(() =>
  import("./App").then((m) => {
    appLoadedResolve?.(); // splash countdown starts when the graph is in
    return m;
  })
);

/**
 * #1224/#1219 — the splash needs the app language for its tagline, but importing
 * getAppLang() pulls @numberverse/core's full LOCALES registry into the boot
 * chunk. Read nv_lang directly here (guarded — private-browsing safe); the real
 * locale machinery lives inside the lazy App graph.
 */
let bootBn = false;
try {
  bootBn = (localStorage.getItem("nv_lang") || "en") === "bn";
} catch {
  /* storage denied — English splash */
}

// Splash-only tokens inlined — importing NV_GOLD/NV_SKY/NV_PINK from ./game/ui
// would drag Phaser + the whole UI toolkit into the boot chunk. (#1217)
const NV_GOLD = "#ffd166";
const NV_SKY = "#4cc9f0";
const NV_PINK = "#ff8fa3";

/**
 * SERVICE WORKER + "PWA always gets the new update" — #1225.
 *
 * SW registration is NEVER on the critical rendering path: the runtime
 * (virtual:pwa-register → workbox) is dynamically imported AFTER first paint
 * (the splash's mount effect fires post-paint), so the boot chunk stays lean.
 *
 * The build uses registerType: "autoUpdate" — a fresh deploy installs a new
 * service worker that takes over immediately. But an OPEN page keeps running
 * its OLD bundle forever unless it reloads. Fix: when a NEW service worker
 * takes control, reload right away.
 *
 * Guards:
 *  · First-ever install has NO prior controller → skip the reload (a fresh
 *    visitor isn't double-loaded). An UPDATE is a change from an existing
 *    controller to a new one.
 *  · sessionStorage survives reloads → one swap, never an infinite loop.
 */
async function deferSWRegistration() {
  try {
    const { registerSW } = await import("virtual:pwa-register");
    const hadController = Boolean(navigator.serviceWorker?.controller);
    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        registration?.addEventListener("controllerchange", () => {
          if (!hadController) return;
          if (sessionStorage.getItem("nv:sw-swap") === "1") return;
          sessionStorage.setItem("nv:sw-swap", "1");
          window.location.reload();
        });
      },
    });
  } catch {
    /* registration is best-effort — a failure must never break the splash */
  }
}

/** #1217 — a failed lazy-chunk load must show a recovery path, never a frozen
 *  blank canvas (offline-first SW + precache make this a rare fallback). */
class BootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const bn = bootBn;
    return (
      <div className="boot-error">
        <p>{bn ? "আবার চেষ্টা করো" : "Tap to retry"}</p>
        <button
          onClick={() => {
            this.setState({ failed: false });
            window.location.reload();
          }}
        >
          ↻
        </button>
      </div>
    );
  }
}

/**
 * 📱 PORTRAIT-ONLY GUARD.
 *
 * The manifest declares `orientation: "portrait"` — Android respects it, but
 * iOS Safari IGNORES the manifest orientation, so on an iPhone a kid can rotate
 * to landscape where every game's fixed vertical layout breaks (title + round
 * meter + play area + answer row all collide / slide off-screen). This overlay
 * covers the app with "turn your phone upright" the moment the phone goes
 * landscape at a phone-sized height, and disappears on portrait. Also shows on
 * short Android/desktop windows so nothing ever looks broken.
 */
function RotateOverlay() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let lockAttempted = false;
    const check = () => {
      // phone-sized landscape: width > height AND a height only a phone (or a
      // very short desktop window) would have — iPads/desktops are left alone.
      const land = window.innerHeight < window.innerWidth && window.innerHeight < 500;
      setShow(land);
      if (land && !lockAttempted) {
        // iOS 16.4+ installed PWAs can auto-rotate BACK to portrait via the
        // screen-orientation lock (older iOS throws — the overlay handles it).
        lockAttempted = true;
        try {
          const so = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<unknown> } }).orientation;
          so?.lock?.("portrait")?.catch?.(() => {});
        } catch {
          /* overlay is the fallback */
        }
      }
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);
  if (!show) return null;
  const bn = bootBn;
  return (
    <div className="rotate-overlay" role="alert">
      <div className="rotate-icon" aria-hidden="true">🔄</div>
      <p className="rotate-title">{bn ? "ফোনটা সোজা করে ধরো" : "Turn your phone upright"}</p>
      <p className="rotate-sub">{bn ? "খেলা খাড়া অবস্থাতেই খেলা যায়!" : "The games love portrait mode!"}</p>
    </div>
  );
}

/**
 * ✨ REALISTIC SPLASH — shown on every launch, just like a real app.
 * Nova pops up over a deep gradient with floating bubbles, an expanding
 * glow ring, a shimmer sweep, the "no ads, ever" promise front and center,
 * and a progress bar. Timed (~2s) so it feels premium but never slow;
 * unmounts fully so it costs nothing after. (Privacy is the moat — the
 * tagline leads with it.)
 */
const SPLASH_FLOAT = [
  { left: 6, size: 12, delay: 0, dur: 8, color: NV_SKY },
  { left: 18, size: 18, delay: 1.2, dur: 9.5, color: NV_GOLD },
  { left: 30, size: 10, delay: 0.5, dur: 7.5, color: "#2ec4b6" },
  { left: 42, size: 16, delay: 2, dur: 10, color: NV_PINK },
  { left: 54, size: 12, delay: 0.9, dur: 8.5, color: "#c4b5fd" },
  { left: 66, size: 20, delay: 1.6, dur: 9, color: NV_SKY },
  { left: 78, size: 10, delay: 0.2, dur: 7, color: NV_GOLD },
  { left: 88, size: 16, delay: 1, dur: 9.5, color: NV_PINK },
];

/** The splash covers first paint AND the lazy App-chunk load: the countdown
 *  only starts once `ready` (the App chunk resolved), so a slow chunk load
 *  never leaves a blank canvas — the splash simply stays a little longer. */
function SplashScreen({ ready }: { ready: boolean }) {
  const [phase, setPhase] = useState<"show" | "hide" | "gone">("show");
  useEffect(() => {
    // #1225 — kick SW registration here (post-paint), never in the boot path.
    void deferSWRegistration();
  }, []);
  // #1182 — dismissal is READINESS-based, not a fixed ~2.35s block on every
  // launch: the countdown only starts once the App chunk resolved (ready), the
  // timers are a short premium-feel FLOOR (0.8s hide / 1.25s gone), and a tap
  // on the splash dismisses it instantly once the app is interactive underneath.
  useEffect(() => {
    if (!ready) return;
    const hide = window.setTimeout(() => setPhase("hide"), 800);
    const gone = window.setTimeout(() => setPhase("gone"), 1250);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(gone);
    };
  }, [ready]);
  const dismiss = () => {
    if (!ready) return; // chunk still loading — tapping must not skip to a blank app
    setPhase("gone");
  };
  if (phase === "gone") return null;
  const bn = bootBn;
  return (
    <div
      className={`splash ${phase === "hide" ? "splash-hide" : ""}`}
      aria-hidden="true"
      onClick={dismiss}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") dismiss(); // instant dismiss on touch/pen
      }}
    >
      <div className="splash-glow splash-glow-a" />
      <div className="splash-glow splash-glow-b" />
      {/* floating bubbles — soft, alive, no noise */}
      {SPLASH_FLOAT.map((f, i) => (
        <span
          key={i}
          className="splash-float"
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            background: f.color,
            animationDuration: `${f.dur}s`,
            animationDelay: `${f.delay}s`,
          }}
        />
      ))}
      {/* shimmer sweep across the whole screen */}
      <div className="splash-shimmer" />
      {/* Nova with an expanding glow ring */}
      <div className="splash-mascot">
        <span className="splash-ring" />
        <span className="splash-ring splash-ring-2" />
        <Icon name="nova" size={118} />
      </div>
      <h1 className="splash-title">Numberverse</h1>
      <p className="splash-tag">{bn ? "খেলতে খেলতে শেখা" : "learn by playing"}</p>
      <div className="splash-no-ads">
        <span className="splash-no-ads-lock" aria-hidden="true">🔒</span>
        {bn ? "কোনো বিজ্ঞাপন নেই · সম্পূর্ণ ব্যক্তিগত" : "No ads, ever · 100% private"}
      </div>
      <div className="splash-bar">
        <div className="splash-bar-fill" />
      </div>
    </div>
  );
}

/** Boot: the splash holds (no blank gap) until the App chunk resolves, then
 *  runs its normal countdown. SplashScreen + RotateOverlay are the ONLY pieces
 *  of the render tree that must be live before first paint. */
function Boot() {
  const [appReady, setAppReady] = useState(false);
  useEffect(() => {
    let alive = true;
    appLoaded.then(() => {
      if (alive) setAppReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <>
      <SplashScreen ready={appReady} />
      <Suspense fallback={null}>
        <BootErrorBoundary>
          <App />
        </BootErrorBoundary>
      </Suspense>
      <RotateOverlay />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boot />
  </React.StrictMode>
);
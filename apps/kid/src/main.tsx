import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Icon } from "./components/Icon";
import { getAppLang } from "./game/locale";
import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import { NV_GOLD, NV_PINK, NV_SKY } from "./game/ui"; // tokenized #591

/**
 * SERVICE WORKER + "PWA always gets the new update".
 *
 * The build uses registerType: "autoUpdate" — a fresh deploy installs a new
 * service worker that takes over immediately. But an OPEN page keeps running
 * its OLD bundle forever unless it reloads. That's exactly why every installed
 * PWA silently served stale games after a deploy.
 *
 * Fix: when a NEW service worker takes control of this page, reload it right
 * away — so every open PWA (iPhone home-screen included) jumps to the new
 * build on the next app open / the moment the background update lands.
 *
 * Guards:
 *  · First-ever install has NO prior controller → we skip the reload so a
 *    fresh visitor isn't double-loaded. A genuine UPDATE is a change from an
 *    existing controller to a new one.
 *  · sessionStorage survives reloads → one swap, never an infinite loop.
 */
const hadController = Boolean(
  typeof navigator !== "undefined" && navigator.serviceWorker?.controller
);

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
  const bn = getAppLang() === "bn";
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

function SplashScreen() {
  const [phase, setPhase] = useState<"show" | "hide" | "gone">("show");
  useEffect(() => {
    const hide = window.setTimeout(() => setPhase("hide"), 1700);
    const gone = window.setTimeout(() => setPhase("gone"), 2350);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(gone);
    };
  }, []);
  if (phase === "gone") return null;
  const bn = getAppLang() === "bn";
  return (
    <div className={`splash ${phase === "hide" ? "splash-hide" : ""}`} aria-hidden="true">
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SplashScreen />
    <App />
    <RotateOverlay />
  </React.StrictMode>
);
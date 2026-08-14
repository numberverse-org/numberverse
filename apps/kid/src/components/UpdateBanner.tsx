import { useEffect, useState, useSyncExternalStore } from "react";
import { subscribeSWUpdate, getSWUpdate } from "../updateBanner";
import { APP_VERSION } from "../version";
import type { Lang } from "../i18n";

/**
 * #1321 — PWA update banner with version notes.
 *
 * registerType is "prompt": a fresh deploy installs a NEW service worker that
 * WAITS instead of yanking an open session mid-game. This banner is the
 * kid-safe "a new version is ready" prompt — tap Update → apply() →
 * updateSW() sends SKIP_WAITING → the waiting worker activates → clientsClaim
 * takes control → the page reloads onto the fresh bundle.
 *
 * Rendered from Boot (main.tsx) so it's GLOBAL and survives the App-chunk
 * swap. It reads the pending state from the updateBanner bridge (filled by
 * main.tsx's registration) and the version from version.ts — the SAME stamp
 * the parent footer shows (#1321 "Version notes source").
 *
 * i18n: self-contained en/bn dict (same pattern as the splash) — importing the
 * central STR table would drag the 2k-line language pack into the boot chunk.
 * Extend this record when more locales land; the language follows the app's
 * nv_lang via the "nv:lang" event App dispatches on change.
 */
const DICT: Record<Lang, { ready: string; sub: string; update: string; later: string }> = {
  en: {
    ready: "New version is here! ✨",
    sub: "New stuff arrived — update to see it.",
    update: "Update now",
    later: "Later",
  },
  bn: {
    ready: "নতুন ভার্সন এসেছে! ✨",
    sub: "নতুন জিনিস এসেছে — আপডেট করে দেখো।",
    update: "আপডেট করো",
    later: "পরে",
  },
};

const DISMISS_KEY = "nv:update-dismiss"; // per-session "not now" (sessionStorage)

function readLang(): Lang {
  try {
    return localStorage.getItem("nv_lang") === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

export default function UpdateBanner() {
  const sw = useSyncExternalStore(subscribeSWUpdate, getSWUpdate);
  // Live language: App persists nv_lang + dispatches "nv:lang" on change; the
  // splash's bootBn read would go stale if the kid switches mid-session.
  const [lang, setLang] = useState<Lang>(readLang);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onLang = () => setLang(readLang());
    window.addEventListener("nv:lang", onLang);
    return () => window.removeEventListener("nv:lang", onLang);
  }, []);

  if (!sw.available || dismissed) return null;
  const t = DICT[lang];

  const update = () => {
    if (sw.apply) sw.apply();
    // apply() triggers a reload; belt-and-suspenders so a stale open banner
    // can't re-arm mid-swap.
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };
  const later = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-card">
        <span className="update-banner-emoji" aria-hidden="true">🆕</span>
        <div className="update-banner-body">
          <p className="update-banner-title">{t.ready}</p>
          <p className="update-banner-sub">
            {t.sub} <em className="update-banner-ver">v{APP_VERSION}</em>
          </p>
        </div>
        <div className="update-banner-actions">
          <button className="update-banner-btn" onClick={update}>
            {t.update}
          </button>
          <button className="update-banner-later" onClick={later} aria-label={t.later}>
            {t.later}
          </button>
        </div>
      </div>
    </div>
  );
}

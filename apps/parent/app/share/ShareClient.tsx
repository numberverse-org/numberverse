"use client";

import { useEffect, useState } from "react";
import { fetchShareSnapshot, type ShareSnapshot } from "../../lib/api";
import { SHARE_LANGS, type ShareLang } from "../lib/portal";

/**
 * #245 + #1597 — client half of the public share-card route. The server shell
 * (`share/page.tsx`) prints the logo + `<h1>` statically so crawlers always
 * see the real headline; this child takes over everything dynamic — reading
 * the `?t=` token from the URL, the page's ONE network fetch, and the
 * loading/failed/stat-tile rendering.
 *  · #1597 — an expired/invalid token (401/404) renders "This link has
 *    expired", while a network/5xx failure renders "Please try again later".
 *  · No tracking — still exactly one fetch, no analytics, no pixels
 */
export default function ShareClient() {
  const token =
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("t") ?? "")
      : "";
  const [snap, setSnap] = useState<ShareSnapshot | null>(null);
  const [failKind, setFailKind] = useState<"expired" | "unavailable" | null>(null);
  const [lang, setLang] = useState<ShareLang>("en");

  // #1597 — anonymous page: read the parent portal's saved language when it
  // exists, otherwise English. A tiny EN/বাংলা toggle lets the reader switch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nv_parent_lang");
      if (saved === "en" || saved === "bn") setLang(saved);
    } catch {
      /* private browsing — keep English */
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setFailKind("expired");
      return;
    }
    let alive = true;
    void fetchShareSnapshot(token).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setSnap(res.data);
      } else {
        setFailKind(res.reason);
      }
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const t = SHARE_LANGS[lang];
  const toggleLang = () => setLang((prev) => (prev === "en" ? "bn" : "en"));

  return (
    <>
      <div className="share-lang-toggle center" style={{ textAlign: "center", marginBottom: 10 }}>
        <button className="ghost-btn small" onClick={toggleLang} aria-pressed={lang === "bn"}>
          {t.lang}
        </button>
      </div>
      {failKind === "expired" ? (
        <p className="center muted">{t.expired}</p>
      ) : failKind === "unavailable" ? (
        <p className="center muted">{t.unavailable}</p>
      ) : !snap ? (
        <p className="center muted">
          <span className="spinner" aria-hidden />
          {t.loading}
        </p>
      ) : (
        <>
          <p className="center muted small">{t.intro}</p>
          <section className="card">
            <div className="stat-tiles">
              <div className="tile">
                <span className="tile-num">{snap.rounds}</span>
                <span className="tile-label">{t.rounds}</span>
              </div>
              <div className="tile">
                <span className="tile-num">{snap.correct_pct}%</span>
                <span className="tile-label">{t.correct}</span>
              </div>
              <div className="tile">
                <span className="tile-num">{snap.minutes}</span>
                <span className="tile-label">{t.minutesPlayed}</span>
              </div>
              <div className="tile">
                <span className="tile-num">{snap.active_days}</span>
                <span className="tile-label">{t.daysActive}</span>
              </div>
              <div className="tile">
                <span className="tile-num">{snap.mastered_count}</span>
                <span className="tile-label">{t.skillsMastered}</span>
              </div>
              {typeof snap.coins === "number" && snap.coins > 0 && (
                <div className="tile">
                  <span className="tile-num">🪙 {snap.coins}</span>
                  <span className="tile-label">{t.coinsInWallet}</span>
                </div>
              )}
            </div>
            {snap.minutes_by_day && snap.minutes_by_day.some((m) => m > 0) && (
              <div className="share-minbars" aria-label={t.minutesPlayed}>
                {snap.minutes_by_day.map((m, i) => (
                  <div key={i} className="share-mincol" title={`${Math.round(m)} ${t.min}`}>
                    <div
                      className="share-minbar"
                      style={{ height: `${snap.minutes_by_day ? Math.max(4, Math.round((m / Math.max(1, ...snap.minutes_by_day!)) * 48)) : 4}px` }}
                    />
                  </div>
                ))}
              </div>
            )}
            {snap.top_game && (
              <p className="muted small center" style={{ marginTop: 14 }}>
                {t.favoriteGame}: {snap.top_game.replace("game-", "").replace(/-/g, " ")}
              </p>
            )}
          </section>
          <p className="center muted small">{t.madeWith}</p>
        </>
      )}
    </>
  );
}

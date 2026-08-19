/* ─── OverviewSections — dashboard top (#620) ───
   i18n seam: STREAK_LANGS / TIMELINE_LANGS keyed by `wizLang`; add a locale
   key to those maps in lib/portal and these cards follow. */
"use client";

import type { Kid, WeeklyReport } from "../../lib/api";
import {
  OVERVIEW_LANGS,
  STREAK_LANGS,
  TIMELINE_LANGS,
  gameLabel,
  narrTitleBn,
  narrTitleEn,
  shortDate,
  weekdayShort,
  type WizardLang,
} from "../lib/portal";

interface ActiveKid {
  id: string;
  name: string;
}

interface MasteryTimelineRow {
  id: string;
  at: string | null;
}

export function FamilyOverview({
  kids,
  famMastered,
  famRounds,
  famMinutes,
  famActive,
  wizLang = "en",
}: {
  kids: Kid[];
  famMastered: number;
  famRounds: number;
  famMinutes: number;
  famActive: number;
  // #1497 — page.tsx passes wizLang
  wizLang?: WizardLang;
}) {
  if (kids.length === 0) return null;
  const L = OVERVIEW_LANGS[wizLang];
  return (
        <section className="card overview" id="overview">
<h2>{L.title}</h2>
<div className="stat-tiles">
  <div className="tile">
    <span className="tile-num">{kids.length}</span>
    <span className="tile-label">{L.kids}</span>
  </div>
  <div className="tile">
    <span className="tile-num">{famMastered}</span>
    <span className="tile-label">{L.skillsMastered}</span>
  </div>
  <div className="tile">
    <span className="tile-num">{famRounds}</span>
    <span className="tile-label">{L.roundsWeek}</span>
  </div>
  <div className="tile">
    <span className="tile-num">{famMinutes}</span>
    <span className="tile-label">{L.minWeek}</span>
  </div>
  <div className="tile">
    <span className="tile-num">{famActive}</span>
    <span className="tile-label">{L.activeWeek}</span>
  </div>
</div>
        </section>
  );
}

export function TodayCard({
  todayRounds,
  todayMinutes,
  todayMastered,
  wizLang,
}: {
  todayRounds: number;
  todayMinutes: number;
  todayMastered: string[];
  wizLang: WizardLang;
}) {
  const L = STREAK_LANGS[wizLang];
  return (
<section className="card daily-card" id="today">
  <div className="daily-head">
    <h2>{L.todayTitle}</h2>
    <span className="muted small">
      {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
    </span>
  </div>
  {todayRounds === 0 && todayMastered.length === 0 ? (
    <p className="muted">{L.todayEmpty}</p>
  ) : (
    <p className="daily-line">
      <b>{todayRounds}</b> {todayRounds === 1 ? L.roundsWord : L.roundsWordPlural} ·{" "}
      <b>{todayMinutes}</b> {L.minPlayed}
      {todayMastered.length > 0 && (
        <>
          {" "}· 🏆 {L.masteredWord} <b>{todayMastered.length}</b>{" "}
          {todayMastered.length === 1 ? L.skillWord : L.skillWordPlural}:{" "}
          <strong>{todayMastered.map((id) => narrTitleEn(id)).join(", ")}</strong>
        </>
      )}
    </p>
  )}
</section>
  );
}

export function WeeklyCard({
  active,
  activeWeekly,
  weeklyStreak,
  todayCap,
  todayCapPct,
  todayMinutes,
  shareBusy,
  shareLink,
  shareCopied,
  shareErr,
  handleShareWeekly,
  handleStopSharing,
  shareStopBusy,
  setShareCopied,
  wizLang,
}: {
  active: ActiveKid;
  activeWeekly: WeeklyReport;
  weeklyStreak: number;
  todayCap: number;
  todayCapPct: number;
  todayMinutes: number;
  shareBusy: boolean;
  shareLink: string | null;
  shareCopied: boolean;
  /** #1594 — inline share failure (the real reason, not the global banner). */
  shareErr: string | null;
  handleShareWeekly: () => void;
  /** #866 — revoke the live share link (nulls the token server-side). */
  handleStopSharing: () => void;
  /** #866 — true while a revoke is in flight (disables the stop button). */
  shareStopBusy: boolean;
  setShareCopied: (v: boolean) => void;
  wizLang: WizardLang;
}) {

  return (
<section className="card weekly" id="week">
  <div className="weekly-head">
    <h2>📊 This week</h2>
    {weeklyStreak > 0 && (
      <span className="streak-badge" title={STREAK_LANGS[wizLang].streakTitle.replace("{name}", active.name)}>
        🔥 {weeklyStreak}{" "}
        <span className="streak-days">{weeklyStreak === 1 ? STREAK_LANGS[wizLang].day : STREAK_LANGS[wizLang].days}</span>
      </span>
    )}
    {activeWeekly.rounds > 0 && (
      <button
        className="share-btn"
        disabled={shareBusy}
        onClick={() => void handleShareWeekly()}
        title={STREAK_LANGS[wizLang].shareBtn}
      >
        {shareBusy ? STREAK_LANGS[wizLang].sharePreparing : STREAK_LANGS[wizLang].shareBtn}
      </button>
    )}
    {shareErr && (
      <p className="err inline" role="alert" style={{ marginTop: 8 }}>
        {shareErr}
      </p>
    )}
    {shareLink && (
      <span className="share-link-note">
        🔗{" "}
        <code>{shareLink}</code>{" "}
        <button
          className="ghost-btn small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareLink);
              setShareCopied(true);
              window.setTimeout(() => setShareCopied(false), 1500);
            } catch {
              /* clipboard unavailable */
            }
          }}
        >
          {shareCopied ? STREAK_LANGS[wizLang].shareCopied : STREAK_LANGS[wizLang].shareCopy}
        </button>
        <span className="muted small">{STREAK_LANGS[wizLang].shareNote}</span>{" "}
        <button
          className="ghost-btn small"
          disabled={shareStopBusy}
          onClick={() => void handleStopSharing()}
          title={STREAK_LANGS[wizLang].shareStop}
        >
          {shareStopBusy ? STREAK_LANGS[wizLang].shareStopping : STREAK_LANGS[wizLang].shareStop}
        </button>
      </span>
    )}
  </div>
  {activeWeekly.rounds === 0 ? (
    <p className="muted">{STREAK_LANGS[wizLang].noRounds.replace("{name}", active.name)}</p>
  ) : (
    <>
      <div className="stat-tiles">
        <div className="tile">
          <span className="tile-num">{activeWeekly.rounds}</span>
          <span className="tile-label">{STREAK_LANGS[wizLang].roundsLabel}</span>
        </div>
        <div className="tile">
          <span className="tile-num">{activeWeekly.correct_pct}%</span>
          <span className="tile-label">{STREAK_LANGS[wizLang].correctLabel}</span>
        </div>
        <div className="tile">
          <span className="tile-num">{activeWeekly.minutes}</span>
          <span className="tile-label">{STREAK_LANGS[wizLang].minutesWeek}</span>
        </div>
        <div className="tile">
          <span className="tile-num">{activeWeekly.active_days}</span>
          <span className="tile-label">{STREAK_LANGS[wizLang].daysActiveLabel}</span>
        </div>
      </div>
      {/* #1557 — surface the server-computed most-played game (already in WeeklyReport) */}
      {activeWeekly.top_game && (
        <p className="muted small mt-10">
          {STREAK_LANGS[wizLang].mostPlayed}: <strong>{gameLabel(activeWeekly.top_game, wizLang)}</strong>
        </p>
      )}
      {todayCap > 0 && (
        <div className="cap-row">
          <div className="cap-meta">
            <span>
              {STREAK_LANGS[wizLang].today} {Math.round(todayMinutes)} {STREAK_LANGS[wizLang].of}{" "}
              {todayCap} {STREAK_LANGS[wizLang].minCap}
            </span>
            <span className="cap-pct">{todayCapPct}%</span>
          </div>
          <div className="cap-track">
            <div className="cap-fill" style={{ width: `${todayCapPct}%` }} />
          </div>
        </div>
      )}
      <div className="week-bars">
        {activeWeekly.days.map((d) => (
          <div key={d.date} className="week-col" title={`${weekdayShort(d.date)}: ${d.rounds} rounds`}>
            <div className="week-bar" style={{ height: `${activeWeekly.days.length ? Math.max(4, Math.round((d.rounds / Math.max(1, ...activeWeekly.days.map((x) => x.rounds))) * 60)) : 0}px` }} />
            <span className="week-day">{weekdayShort(d.date)}</span>
          </div>
        ))}
      </div>
      {activeWeekly.mastered_this_week.length > 0 && (
        <p className="muted small mt-10">
          {STREAK_LANGS[wizLang].masteredWeek}{" "}
          {/* #1560 — real skill titles + Bangla variant, not dashed slugs */}
          <strong>
            {activeWeekly.mastered_this_week
              .map((s) => (narrTitleBn(s) !== narrTitleEn(s) ? `${narrTitleEn(s)} · ${narrTitleBn(s)}` : narrTitleEn(s)))
              .join(", ")}
          </strong>
        </p>
      )}
    </>
  )}
</section>
  );
}

export function MasteryTimeline({
  active,
  masteryTimeline,
  wizLang,
}: {
  active: ActiveKid;
  masteryTimeline: MasteryTimelineRow[];
  wizLang: WizardLang;
}) {

  return (
<section className="card timeline-card" id="review">
  <h2>{TIMELINE_LANGS[wizLang].title}</h2>
  <p className="muted small">{TIMELINE_LANGS[wizLang].hint.replace("{name}", active.name)}</p>
  {masteryTimeline.length === 0 ? (
    <p className="muted">{TIMELINE_LANGS[wizLang].empty}</p>
  ) : (
    <ol className="timeline-list">
      {masteryTimeline.map((m) => (
        <li key={m.id} className="timeline-row">
          <span className="timeline-dot" aria-hidden="true" />
          <span className="timeline-name">
            {narrTitleEn(m.id)}
            {narrTitleBn(m.id) !== narrTitleEn(m.id) && (
              <span className="muted small"> · {narrTitleBn(m.id)}</span>
            )}
          </span>
          <span className="timeline-date">
            {m.at ? (
              <>
                {shortDate(m.at, wizLang)} <span className="muted small">· {TIMELINE_LANGS[wizLang].mastered}</span>
              </>
            ) : (
              TIMELINE_LANGS[wizLang].unknownDate
            )}
          </span>
        </li>
      ))}
    </ol>
  )}
</section>
  );
}

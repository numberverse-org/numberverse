/* ─── OverviewSections — dashboard top (#620) ───
   i18n seam: STREAK_LANGS / TIMELINE_LANGS keyed by `wizLang`; add a locale
   key to those maps in lib/portal and these cards follow. */
"use client";

import type { Kid, WeeklyReport } from "../../lib/api";
import {
  STREAK_LANGS,
  TIMELINE_LANGS,
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
}: {
  kids: Kid[];
  famMastered: number;
  famRounds: number;
  famMinutes: number;
  famActive: number;
}) {
  if (kids.length === 0) return null;
  return (
        <section className="card overview" id="overview">
<h2>👨‍👩‍👧 Family overview</h2>
<div className="stat-tiles">
  <div className="tile">
    <span className="tile-num">{kids.length}</span>
    <span className="tile-label">kids</span>
  </div>
  <div className="tile">
    <span className="tile-num">{famMastered}</span>
    <span className="tile-label">skills mastered</span>
  </div>
  <div className="tile">
    <span className="tile-num">{famRounds}</span>
    <span className="tile-label">rounds this week</span>
  </div>
  <div className="tile">
    <span className="tile-num">{famMinutes}</span>
    <span className="tile-label">min this week</span>
  </div>
  <div className="tile">
    <span className="tile-num">{famActive}</span>
    <span className="tile-label">active this week</span>
  </div>
</div>
        </section>
  );
}

export function TodayCard({
  todayRounds,
  todayMinutes,
  todayMastered,
}: {
  todayRounds: number;
  todayMinutes: number;
  todayMastered: string[];
}) {

  return (
<section className="card daily-card" id="today">
  <div className="daily-head">
    <h2>☀️ Today</h2>
    <span className="muted small">
      {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
    </span>
  </div>
  {todayRounds === 0 && todayMastered.length === 0 ? (
    <p className="muted">
      Nothing yet today — a little playtime lights up this card. 🌱
    </p>
  ) : (
    <p className="daily-line">
      <b>{todayRounds}</b> round{todayRounds === 1 ? "" : "s"} ·{" "}
      <b>{todayMinutes}</b> min played
      {todayMastered.length > 0 && (
        <>
          {" "}· 🏆 mastered <b>{todayMastered.length}</b>{" "}
          {todayMastered.length === 1 ? "skill" : "skills"}:{" "}
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
  handleShareWeekly,
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
  handleShareWeekly: () => void;
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
        title="Share this week on WhatsApp with a private, anonymous link"
      >
        {shareBusy ? "Preparing…" : "Share on WhatsApp"}
      </button>
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
          {shareCopied ? "✓ Copied" : "Copy link"}
        </button>
        <span className="muted small">opens a private, anonymous week snapshot</span>
      </span>
    )}
  </div>
  {activeWeekly.rounds === 0 ? (
    <p className="muted">No rounds this week yet — have {active.name} play a game and this report comes alive.</p>
  ) : (
    <>
      <div className="stat-tiles">
        <div className="tile">
          <span className="tile-num">{activeWeekly.rounds}</span>
          <span className="tile-label">rounds</span>
        </div>
        <div className="tile">
          <span className="tile-num">{activeWeekly.correct_pct}%</span>
          <span className="tile-label">correct</span>
        </div>
        <div className="tile">
          <span className="tile-num">{activeWeekly.minutes}</span>
          <span className="tile-label">{STREAK_LANGS[wizLang].minutesWeek}</span>
        </div>
        <div className="tile">
          <span className="tile-num">{activeWeekly.active_days}</span>
          <span className="tile-label">days active</span>
        </div>
      </div>
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
          🏆 Mastered this week:{" "}
          <strong>{activeWeekly.mastered_this_week.map((s) => s.replace(/-/g, " ")).join(", ")}</strong>
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

/* ─── ReportsSections — learning reports (#620) ───
   i18n seam: SESSION_LANGS keyed by `wizLang`; narrLang drives EN/BN titles.
   Add locale keys to those maps in lib/portal and these cards follow. */
"use client";

import type { AccelerationRow, MasteryRow } from "../../lib/api";
import {
  ACCEL_REASONS,
  ARCHIVE_LANGS,
  MISSED_LANGS,
  SESSION_LANGS,
  fmtTime,
  narrTitleBn,
  narrTitleEn,
  readingSkills,
  rollingMonths,
  type FlaggedSkill,
  type MonthSummary,
  type TimelineSession,
  type WizardLang,
} from "../lib/portal";

interface ActiveKid {
  name: string;
}


export function StoriesCard({ active, activeMastery }: { active: ActiveKid; activeMastery: MasteryRow[] }) {
  return (
<section className="card reading-card" id="stories">
  <h2>📚 Reading & stories</h2>
  <p className="muted small">
    Which read-aloud books and story quizzes {active.name} has finished — and how they scored.
    Every story game stays on the kid's device data, so this works offline too.
  </p>
  {readingSkills.length === 0 ? (
    <p className="muted">No story games in the catalog yet.</p>
  ) : (
    <table>
      <thead>
        <tr>
          <th>Story</th>
          <th>Progress</th>
          <th>Score</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {readingSkills.map((s) => {
          const m = activeMastery.find((x) => x.skill_id === s.id);
          const pct = m ? Math.min(100, Math.round(m.mastery * 100)) : 0;
          const status = !m ? "🌱 Not started" : m.mastery >= 0.8 ? "✅ Finished" : "🔶 In progress";
          return (
            <tr key={s.id}>
              <td>
                {s.title}
                {s.titleBn ? <span className="muted small"> · {s.titleBn}</span> : null}
              </td>
              <td>
                {m ? (
                  <>
                    <div className="bar">
                      <div className={`fill${m.mastery >= 0.8 ? " done" : ""}`} style={{ width: `${pct}%` }} />
                    </div>
                    {pct}%
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td>{m ? `${m.correct}/${m.attempts}` : "—"}</td>
              <td>{status}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  )}
</section>
  );
}

export function WeekWordsCard({
  active,
  weekNarrative,
  narrLang,
  setNarrLang,
  narrText,
  onNarrativeEdit,
  handleRegenerateNarr,
  handleCopyNarr,
  narrCopied,
}: {
  active: ActiveKid;
  weekNarrative: { en: string; bn: string } | null;
  narrLang: "en" | "bn";
  setNarrLang: (l: "en" | "bn") => void;
  narrText: string;
  onNarrativeEdit: (t: string) => void;
  handleRegenerateNarr: () => void;
  handleCopyNarr: () => Promise<void> | void;
  narrCopied: boolean;
}) {
  return (
<section className="card narrative-card" id="week-words">
  <div className="narrative-head">
    <h2>📖 {active.name}'s week in words</h2>
    <div className="row-buttons" role="group" aria-label="Narrative language">
      <button
        className={`toggle-chip${narrLang === "en" ? " on" : ""}`}
        onClick={() => setNarrLang("en")}
      >
        English
      </button>
      <button
        className={`toggle-chip${narrLang === "bn" ? " on" : ""}`}
        onClick={() => setNarrLang("bn")}
      >
        বাংলা
      </button>
    </div>
  </div>
  <p className="muted small">
    A plain-language summary of what {active.name} practiced and found tricky this week,
    drawn from the learning stories the app recorded. It is written right here in your
    browser — edit it freely, and nothing you type is ever sent to a server.
  </p>
  {weekNarrative ? (
    <>
      <textarea
        className="narrative-edit"
        rows={7}
        value={narrText}
        onChange={(e) => onNarrativeEdit(e.target.value)}
        aria-label="Weekly learning narrative (editable)"
      />
      <div className="row-buttons">
        <button className="btn ghost-btn" onClick={handleRegenerateNarr}>
          ↺ Regenerate
        </button>
        <button className="btn ghost-btn" onClick={() => void handleCopyNarr()}>
          {narrCopied ? "✓ Copied" : "📋 Copy text"}
        </button>
      </div>
      <p className="muted small mt-8">
        💾 Your edits stay in this browser only — safe to tweak and share however you like.
      </p>
    </>
  ) : (
    <p className="muted">
      No learning stories for this week yet — have {active.name} play a few rounds and a
      summary appears here.
    </p>
  )}
</section>
  );
}

export function HelpNeededCard({
  active,
  flags,
  narrLang,
  reteachQr,
  reteachBusy,
  handleReteachQr,
}: {
  active: ActiveKid;
  flags: FlaggedSkill[];
  narrLang: "en" | "bn";
  reteachQr: Record<string, { title: string; dataUrl: string; code: string }>;
  reteachBusy: boolean;
  handleReteachQr: (skillId: string, title: string) => Promise<void> | void;
}) {
  return (
<section className="card alert-card" id="help-needed">
  <h2>🚨 Needs a little help</h2>
  <p className="muted small">
    Skills where Moni flagged a misconception or tiredness this week — read from{" "}
    {active.name}’s learning stories on this device, nothing extra is sent anywhere.
  </p>
  {flags.length === 0 ? (
    <p className="muted">No flags this week — {active.name}’s learning is on a steady climb! 🎉</p>
  ) : (
    <ul className="alert-list">
      {flags.map((f) => (
        <li key={f.skillId} className="alert-row">
          <div className="alert-main">
            <strong>{narrTitleEn(f.skillId)}</strong>
            {narrTitleBn(f.skillId) !== narrTitleEn(f.skillId) && (
              <span className="muted small"> · {narrTitleBn(f.skillId)}</span>
            )}
            <p className="alert-reason small">
              {narrLang === "bn" ? f.reason.bn : f.reason.en}
            </p>
          </div>
          <button
            className="btn ghost-btn small"
            disabled={reteachBusy}
            onClick={() => void handleReteachQr(f.skillId, narrTitleEn(f.skillId))}
          >
            {reteachQr[f.skillId] ? "✓ QR ready" : "🔄 Reteach QR"}
          </button>
          {reteachQr[f.skillId] && (
            <div className="reteach-qr">
              <img
                src={reteachQr[f.skillId].dataUrl}
                alt={`QR code to open ${reteachQr[f.skillId].title} in the kid app`}
                width={116}
                height={116}
              />
              <span className="muted small">
                Scan in the kid app to open {reteachQr[f.skillId].title}
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
  )}
</section>
  );
}

export function AccelCard({ active, accelRows, narrLang }: {
  active: ActiveKid;
  accelRows: AccelerationRow[];
  narrLang: "en" | "bn";
}) {
  return (
<section className="card accel-card" id="accel">
  <h2>🚀 Acceleration plan</h2>
  <p className="muted small">
    Skills {active.name} skipped ahead past in the kid app (marked “I already know
    this”), with the world-band jump. Read from the dashboard’s already-loaded data —
    it works offline.
  </p>
  {accelRows.length === 0 ? (
    <p className="muted">
      No skips yet — when {active.name} skips a lesson in the app it lands here.
    </p>
  ) : (
    <ul className="accel-list">
      {accelRows.map((row) => (
        <li key={row.id} className="accel-row">
          <div className="accel-main">
            <span className="accel-ico">⏭</span>
            <div>
              <strong>{narrTitleEn(row.skill_id)}</strong>
              {narrTitleBn(row.skill_id) !== narrTitleEn(row.skill_id) && (
                <span className="muted small"> · {narrTitleBn(row.skill_id)}</span>
              )}
              <p className="accel-reason small">
                {narrLang === "bn" ? ACCEL_REASONS[row.reason]?.bn : ACCEL_REASONS[row.reason]?.en}
              </p>
            </div>
          </div>
          <span className="accel-jump">Band {row.band_from} → {row.band_to}</span>
        </li>
      ))}
    </ul>
  )}
</section>
  );
}

export function ArchiveCard({
  active,
  activeArchive,
  archLoading,
  archiveLoaded,
  activeId,
  selMonth,
  setArchMonth,
  exportArchive,
  narrLang,
  // #1517 — page.tsx wires onRetryArchive
  onRetryArchive,
  archiveError,
}: {
  active: ActiveKid;
  activeArchive: MonthSummary[];
  archLoading: boolean;
  archiveLoaded: boolean;
  activeId: string;
  selMonth: string | null;
  setArchMonth: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  exportArchive: () => void;
  narrLang: "en" | "bn";
  /** #1517 — inline archive retry; optional so this compiles before page.tsx
   *  passes it. When set and the archive fetch failed, a Try again button
   *  appears inside the card instead of leaning on the global error banner. */
  onRetryArchive?: () => void;
  archiveError?: boolean;
}) {
  const selSummary = activeArchive.find((m) => m.key === selMonth) ?? null;
  return (
<section className="card archive-card" id="archive">
  <div className="archive-head">
    <h2>🗓️ Monthly archive</h2>
    <button
      className="btn ghost-btn small"
      onClick={exportArchive}
      disabled={!archiveLoaded || activeArchive.length === 0}
    >
      ⬇️ Export CSV
    </button>
  </div>
  <p className="muted small">
    The last 12 months of {active.name}’s learning at a glance — rounds, time and the
    skills that got the most play. Generated right here in your browser from the
    history we load once, so it works offline after that.
  </p>
  {!archiveLoaded ? (
    <div className="muted archive-load">
      {archLoading && <span className="spinner" aria-hidden />}
      <span>
        {archLoading
          ? ARCHIVE_LANGS[narrLang].loading
          : archiveError
            ? ARCHIVE_LANGS[narrLang].failed
            : ARCHIVE_LANGS[narrLang].notLoaded}
      </span>
      {/* #1517 — inline retry keeps one kid's failed archive from becoming a
          page-level error; the optional prop leaves the card page.tsx-free. */}
      {!archLoading && archiveError && onRetryArchive && (
        <button className="btn ghost-btn small" onClick={onRetryArchive}>
          {ARCHIVE_LANGS[narrLang].retry}
        </button>
      )}
    </div>
  ) : (
    <>
      <div className="archive-grid" role="tablist" aria-label="Select a month">
        {activeArchive.map((m) => {
          const mm = rollingMonths(12).find((x) => x.key === m.key);
          const active = m.key === selMonth;
          return (
            <button
              key={m.key}
              className={`archive-month${active ? " on" : ""}${m.rounds === 0 ? " empty" : ""}`}
              onClick={() => setArchMonth((prev) => ({ ...prev, [activeId]: m.key }))}
              role="tab"
              aria-selected={active}
            >
              <span className="archive-month-label">
                {narrLang === "bn" ? mm?.labelBn : mm?.labelEn}
              </span>
              <span className="archive-month-num">
                {m.rounds === 0 ? "—" : `${m.rounds} rounds`}
              </span>
            </button>
          );
        })}
      </div>
      {selSummary && (
        <div className="archive-detail">
          <div className="archive-stats">
            <span className="archive-stat"><b>{selSummary.rounds}</b> rounds</span>
            <span className="archive-stat"><b>{selSummary.rounds ? Math.round((selSummary.correct / selSummary.rounds) * 100) : 0}%</b> correct</span>
            <span className="archive-stat"><b>{selSummary.minutes}</b> min</span>
          </div>
          {selSummary.top.length > 0 && (
            <ul className="archive-top">
              {selSummary.top.map((t) => (
                <li key={t.id} className="archive-top-row">
                  <span className="archive-top-title">
                    {narrTitleEn(t.id)}
                    {narrTitleBn(t.id) !== narrTitleEn(t.id) && (
                      <span className="muted small"> · {narrTitleBn(t.id)}</span>
                    )}
                  </span>
                  <span className="archive-top-count">
                    {t.rounds} rounds · {t.rounds ? Math.round((t.correct / t.rounds) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )}
</section>
  );
}

export function SessionsCard({
  activeId,
  activeSessions,
  sessionDays,
  selSessionDay,
  setSessionDay,
  visibleSessions,
  archLoading,
  archiveLoaded,
  wizLang,
}: {
  activeId: string | null;
  activeSessions: TimelineSession[];
  sessionDays: string[];
  selSessionDay: string;
  setSessionDay: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  visibleSessions: TimelineSession[];
  archLoading: boolean;
  archiveLoaded: boolean;
  wizLang: WizardLang;
}) {
  return (
<section className="card timeline-card" id="sessions">
  <h2>{SESSION_LANGS[wizLang].title}</h2>
  <p className="muted small">{SESSION_LANGS[wizLang].hint}</p>
  {!archiveLoaded ? (
    <p className="muted">
      {archLoading && <span className="spinner" aria-hidden />}
      {archLoading ? SESSION_LANGS[wizLang].loading : SESSION_LANGS[wizLang].notLoaded}
    </p>
  ) : activeSessions.length === 0 ? (
    <p className="muted">{SESSION_LANGS[wizLang].empty}</p>
  ) : (
    <>
      <div className="timeline-filter" role="tablist" aria-label={SESSION_LANGS[wizLang].filterByDay}>
        <button
          className={`timeline-chip${selSessionDay === "all" ? " on" : ""}`}
          onClick={() => activeId && setSessionDay((p) => ({ ...p, [activeId]: "all" }))}
        >
          {SESSION_LANGS[wizLang].allDays}
        </button>
        {sessionDays.map((d) => (
          <button
            key={d}
            className={`timeline-chip${selSessionDay === d ? " on" : ""}`}
            onClick={() => activeId && setSessionDay((p) => ({ ...p, [activeId]: d }))}
          >
            {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </button>
        ))}
      </div>
      <ul className="timeline-list">
        {visibleSessions.map((s) => {
          const pct = s.rounds ? Math.round((s.correct / s.rounds) * 100) : 0;
          return (
            <li key={s.key} className="timeline-row">
              <div className="timeline-head">
                <span className="timeline-time">{fmtTime(s.startISO)}</span>
                <span className="timeline-count">
                  {s.rounds} {SESSION_LANGS[wizLang].rounds} · {s.minutes} {SESSION_LANGS[wizLang].min}
                </span>
              </div>
              <div className="timeline-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span className="timeline-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="timeline-foot">
                <span className="timeline-pct">{pct}% {SESSION_LANGS[wizLang].accuracy}</span>
                {s.mastered.length > 0 && (
                  <span className="timeline-mastered">
                    {SESSION_LANGS[wizLang].mastered}:{" "}
                    {s.mastered.map((id) => (
                      <span key={id} className="mastered-chip">
                        {narrTitleEn(id)}
                        {narrTitleBn(id) !== narrTitleEn(id) && (
                          <span className="muted"> · {narrTitleBn(id)}</span>
                        )}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  )}
</section>
  );
}
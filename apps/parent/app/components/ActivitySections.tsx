/* ─── ActivitySections — feed / missed / mastery (#620) ───
   i18n seam: MISSED_LANGS keyed by `wizLang`; add a locale key to that map
   in lib/portal and the missed card follows. */
"use client";

import { useEffect, useState } from "react";
import { SKILLS } from "@numberverse/core";
import type { ActivityRow, MasteryRow } from "../../lib/api";
import {
  ACTIVITY_LANGS,
  MISSED_LANGS,
  OVERVIEW_LANGS,
  SUBJECTS,
  fmtTime,
  gameLabel,
  masteryPct,
  narrTitleBn,
  narrTitleEn,
  relTime,
  skillLabel,
  type MissedSkill,
  type WizardLang,
} from "../lib/portal";

function subjectOf(skillId: string): string {
  return SKILLS.find((s) => s.id === skillId)?.subject ?? "other";
}

function subjectEmoji(subject: string): string {
  return SUBJECTS.find((s) => s.id === subject)?.emoji ?? "📚";
}

function subjectLabelOf(lang: WizardLang, subject: string): string {
  return OVERVIEW_LANGS[lang].subjects[subject] ?? subject.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ActiveKid {
  id: string;
  name: string;
}



export function ActivityFeed({ active, activity, wizLang }: {
  active: ActiveKid;
  activity: ActivityRow[];
  wizLang: WizardLang;
}) {
  // #1492 — the feed can now receive the same full-history cursor as the
  // archive, so paginate client-side: reveal 40 more rows per click.
  const PAGE = 40;
  const [limit, setLimit] = useState(PAGE);
  const visible = activity.slice(0, limit);
  const canShowMore = activity.length > PAGE;
  const isExpanded = limit >= activity.length;

  return (
<section className="card" id="activity">
  <h2>📈 Recent activity</h2>
  {activity.length === 0 ? (
    <p className="muted">Nothing yet — have {active.name} play a round to see it here.</p>
  ) : (
    <>
      <ul className="activity-list" id="activity-list">
        {visible.map((a) => (
          <li key={a.id} className={`activity-item ${a.correct ? "ok" : "no"}`}>
            <span className="activity-badge">{a.correct ? "✓" : "✗"}</span>
            <span className="activity-game">
              {gameLabel(a.game_id, wizLang)}
              {/* #1494 — surface the skill/subject context like MissedCard does */}
              {skillLabel(a.skill_id, wizLang) ? (
                <span className="muted small">
                  {" "}· {subjectEmoji(subjectOf(a.skill_id))} {skillLabel(a.skill_id, wizLang)}
                </span>
              ) : null}
            </span>
            <span className="activity-time">{fmtTime(a.created_at, wizLang)}</span>
          </li>
        ))}
      </ul>
      {canShowMore && (
        <div className="activity-more">
          <button
            className="btn ghost-btn small"
            onClick={() => setLimit((v) => (v >= activity.length ? PAGE : Math.min(v + PAGE, activity.length)))}
            aria-expanded={isExpanded}
            aria-controls="activity-list"
          >
            {isExpanded ? ACTIVITY_LANGS[wizLang].showLess : ACTIVITY_LANGS[wizLang].showMore}
          </button>
        </div>
      )}
    </>
  )}
</section>
  );
}

export function MissedCard({ active, missedSkills, wizLang }: {
  active: { name: string };
  missedSkills: MissedSkill[];
  wizLang: WizardLang;
}) {
  return (
<section className="card missed-card" id="missed">
  <h2>{MISSED_LANGS[wizLang].title}</h2>
  <p className="muted small">{MISSED_LANGS[wizLang].hint.replace("{name}", active.name)}</p>
  {missedSkills.length === 0 ? (
    <p className="muted">{MISSED_LANGS[wizLang].empty}</p>
  ) : (
    <div className="missed-list">
      {missedSkills.map((ms) => (
        <details key={ms.skillId} className="missed-skill" open>
          <summary>
            <span className="missed-skill-name">{skillLabel(ms.skillId, wizLang)}</span>
            <span className="missed-count">{ms.misses.length}</span>
            {ms.misses.some((m) => m.reteaching) && (
              <span className="reteach-badge">{MISSED_LANGS[wizLang].reteaching}</span>
            )}
          </summary>
          <ul className="missed-rows">
            {ms.misses.map((m, i) => (
              <li key={i} className="missed-row">
                <span className="missed-game">{gameLabel(m.gameId, wizLang)}</span>
                <span className="missed-time">{fmtTime(m.at, wizLang)}</span>
                <span className="missed-detail">
                  {m.wrongAnswer != null && `${MISSED_LANGS[wizLang].picked} ${m.wrongAnswer}`}
                  {m.wrongAnswer != null && m.correctAnswer != null && " · "}
                  {m.correctAnswer != null && `${MISSED_LANGS[wizLang].answer} ${m.correctAnswer}`}
                  {m.fingerprint ? ` · ${m.fingerprint}` : ""}
                </span>
                {m.errorKind && <span className={`missed-kind kind-${m.errorKind}`}>{m.errorKind}</span>}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )}
</section>
  );
}

export function MasteryCard({ activeMastery }: {
  activeMastery: MasteryRow[];
}) {
  // #1520/#1521 — follow the portal language (same localStorage key as page.tsx)
  // and keep the weakness-first sort + subject filter purely in local state, so
  // the card works offline from the already-loaded mastery rows.
  const [wizLang, setWizLang] = useState<WizardLang>("en");
  useEffect(() => {
    const saved = localStorage.getItem("nv_parent_lang");
    if (saved === "en" || saved === "bn") setWizLang(saved);
  }, []);
  const [weakestFirst, setWeakestFirst] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const L = OVERVIEW_LANGS[wizLang];

  // #1524 — a below-mastery skill goes stale after 7 days with no practice.
  const STALE_PRACTICE_MS = 7 * 24 * 60 * 60 * 1000;
  const lastPracticeAge = (m: MasteryRow): number | null => {
    if (!m.last_practice) return null;
    const t = Date.parse(m.last_practice);
    if (Number.isNaN(t)) return null;
    return Date.now() - t;
  };

  // #1520 — weakest skills first; attempts asc breaks ties, then the slug for a
  // deterministic order. Toggling off restores the server's alphabetical order.
  const sorted = [...activeMastery].sort((a, b) =>
    weakestFirst
      ? a.mastery - b.mastery || a.attempts - b.attempts || a.skill_id.localeCompare(b.skill_id)
      : a.skill_id.localeCompare(b.skill_id)
  );

  // #1521/#3038 — present subjects in catalog order. The chip shows
  // mastered/total (skills at mastery ≥0.8), matching the summary card's
  // catalog-coverage denominator so the two percentages reconcile instead of
  // contradicting (a subject's arithmetic mean of BKT values could mislead).
  const subjectOrder = ["math", "bangla", "english", "science", "bgs", "ict"];
  const subjectStats = activeMastery.reduce<Record<string, { count: number; mastered: number }>>((acc, m) => {
    const sub = subjectOf(m.skill_id);
    const e = acc[sub] ?? { count: 0, mastered: 0 };
    e.count += 1;
    if (m.mastery >= 0.8) e.mastered += 1;
    acc[sub] = e;
    return acc;
  }, {});
  const presentSubjects = Object.keys(subjectStats).sort(
    (a, b) => (subjectOrder.indexOf(a) === -1 ? 999 : subjectOrder.indexOf(a)) - (subjectOrder.indexOf(b) === -1 ? 999 : subjectOrder.indexOf(b))
  );
  const filtered = subjectFilter === "all" ? sorted : sorted.filter((m) => subjectOf(m.skill_id) === subjectFilter);

  return (
<section className="card" id="mastery">
  <h2>🧠 Skill mastery</h2>
  {activeMastery.length === 0 ? (
    <p className="muted">No practice yet — play the kid app to record progress.</p>
  ) : (
    <>
      <div className="timeline-filter">
        <button
          className="timeline-chip"
          onClick={() => setWeakestFirst((v) => !v)}
          aria-pressed={weakestFirst}
        >
          {weakestFirst ? L.weakestFirst : L.azSort}
        </button>
        <button
          className={`timeline-chip${subjectFilter === "all" ? " on" : ""}`}
          onClick={() => setSubjectFilter("all")}
        >
          {L.allFilter}
        </button>
        {presentSubjects.map((sub) => {
          const stat = subjectStats[sub];
          return (
            <button
              key={sub}
              className={`timeline-chip${subjectFilter === sub ? " on" : ""}`}
              onClick={() => setSubjectFilter(sub)}
            >
              {subjectEmoji(sub)} {subjectLabelOf(wizLang, sub)} · {stat.mastered}/{stat.count}
            </button>
          );
        })}
      </div>
      <table>
        <thead>
          <tr>
            <th>Skill</th>
            <th>Mastery</th>
            <th>Correct / Attempts</th>
            <th>Streak</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((m) => (
            <tr key={m.skill_id}>
              <td>
                {/* #1522 — curated titles + Bangla suffix, matching StoriesCard */}
                {narrTitleEn(m.skill_id)}
                {narrTitleBn(m.skill_id) !== narrTitleEn(m.skill_id) && (
                  <span className="muted small"> · {narrTitleBn(m.skill_id)}</span>
                )}
                {(() => {
                  // #1524 — surface last_practice staleness for skills still
                  // below mastery (null/validated dates render nothing).
                  const age = lastPracticeAge(m);
                  if (age === null || m.mastery >= 0.8) return null;
                  return (
                    <span className="muted small">
                      {" · "}
                      {L.practicedAgo.replace("{time}", relTime(Date.now() - age, wizLang))}
                      {age > STALE_PRACTICE_MS && <span className="stale-tag"> · {L.needsReview}</span>}
                    </span>
                  );
                })()}
              </td>
              <td>
                <div className="bar">
                  <div className={`fill${m.mastery >= 0.8 ? " done" : ""}`} style={{ width: `${masteryPct(m)}%` }} />
                </div>
                {masteryPct(m)}%
              </td>
              <td>{m.correct}/{m.attempts}</td>
              <td>{m.streak}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )}
</section>
  );
}
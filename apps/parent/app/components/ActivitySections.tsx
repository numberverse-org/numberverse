/* ─── ActivitySections — feed / missed / mastery (#620) ───
   i18n seam: MISSED_LANGS keyed by `wizLang`; add a locale key to that map
   in lib/portal and the missed card follows. */
"use client";

import type { ActivityRow, MasteryRow } from "../../lib/api";
import {
  MISSED_LANGS,
  fmtTime,
  gameLabel,
  masteryPct,
  skillLabel,
  type MissedSkill,
  type WizardLang,
} from "../lib/portal";

interface ActiveKid {
  id: string;
  name: string;
}



export function ActivityFeed({ active, activity }: {
  active: ActiveKid;
  activity: ActivityRow[];
}) {
  return (
<section className="card" id="activity">
  <h2>📈 Recent activity</h2>
  {activity.length === 0 ? (
    <p className="muted">Nothing yet — have {active.name} play a round to see it here.</p>
  ) : (
    <ul className="activity-list">
      {activity.map((a) => (
        <li key={a.id} className={`activity-item ${a.correct ? "ok" : "no"}`}>
          <span className="activity-badge">{a.correct ? "✓" : "✗"}</span>
          <span className="activity-game">{gameLabel(a.game_id)}</span>
          <span className="activity-time">{fmtTime(a.created_at)}</span>
        </li>
      ))}
    </ul>
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
            <span className="missed-skill-name">{skillLabel(ms.skillId)}</span>
            <span className="missed-count">{ms.misses.length}</span>
            {ms.misses.some((m) => m.reteaching) && (
              <span className="reteach-badge">{MISSED_LANGS[wizLang].reteaching}</span>
            )}
          </summary>
          <ul className="missed-rows">
            {ms.misses.map((m, i) => (
              <li key={i} className="missed-row">
                <span className="missed-game">{gameLabel(m.gameId)}</span>
                <span className="missed-time">{fmtTime(m.at)}</span>
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
  return (
<section className="card" id="mastery">
  <h2>🧠 Skill mastery</h2>
  {activeMastery.length === 0 ? (
    <p className="muted">No practice yet — play the kid app to record progress.</p>
  ) : (
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
        {activeMastery.map((m) => (
          <tr key={m.skill_id}>
            <td>{m.skill_id.replace(/-/g, " ")}</td>
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
  )}
</section>
  );
}
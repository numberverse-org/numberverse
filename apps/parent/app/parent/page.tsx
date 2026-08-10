"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getKids,
  getMastery,
  getKidSettings,
  saveKidSettings,
  getActivity,
  getWeekly,
  resetKidProgress,
  createKid,
  updateKid,
  deleteKid,
  type Kid,
  type MasteryRow,
  type KidSettings as KidSettingsT,
  type ActivityRow,
  type WeeklyReport,
  type NewKid,
} from "../../lib/api";

const AVATARS = ["🛡️", "🔮", "🗡️", "🪓", "🏹", "🦊", "🐱", "🐼", "🐸", "🦄", "🐯", "🐰", "🐨", "🐹", "🦁"];
const SUBJECTS = [
  { id: "math", label: "Math", emoji: "🔢" },
  { id: "bangla", label: "Bangla", emoji: "অ" },
  { id: "english", label: "English", emoji: "🔤" },
  { id: "science", label: "Science", emoji: "🔬" },
  { id: "bgs", label: "BGS", emoji: "🌏" },
] as const;

const GAME_LABELS: Record<string, string> = {
  "game-countpop": "Count & Pop",
  "game-growcount": "Plant & Count",
  "game-shapecatcher": "Shape Catcher",
  "game-bnletters": "Bangla Letters",
  "game-enletters": "ABCs",
  "game-fruitadd": "Fruit Addition",
  "game-fruittree": "Fruit Tree",
  "game-bnbonds": "Number Bonds",
  "game-bncolors": "Bangla Colors",
  "game-enphonics": "Letter Sounds",
  "game-rocketmult": "Rocket Multiplication",
  "game-pizzafrac": "Pizza Fractions",
  "game-addsub100": "Add & Subtract 100",
  "game-bnwords": "Bangla Words",
  "game-cvc": "CVC Words",
  "game-division": "Division Facts",
  "game-fracmatch": "Fraction Match",
  "game-placevalue": "Place Value",
  "game-bnmatras": "Bangla Matras",
  "game-sightwords": "Sight Words",
  "game-animalhome": "Animal Homes",
  "game-decimals": "Decimals",
  "game-percent": "Percent",
  "game-area": "Area & Perimeter",
  "game-bnsentence": "Bangla Sentences",
  "game-grammar": "Nouns & Verbs",
  "game-bgs": "Bangladesh Facts",
};

function gameLabel(id: string): string {
  return GAME_LABELS[id] ?? id.replace("game-", "").replace(/-/g, " ");
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function weekdayShort(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleString(undefined, { weekday: "short" });
  } catch {
    return iso;
  }
}

/** Privacy-safe share blurb — only aggregates, never a kid's name/device data
 *  unless the parent types the name into the share line themselves. */
function weeklyShareText(kidName: string, w: WeeklyReport): string {
  const n = w.mastered_this_week.length;
  const mastered = n
    ? `🏆 Mastered ${n} skill${n > 1 ? "s" : ""}: ${n <= 4 ? w.mastered_this_week.map((s) => s.replace(/-/g, " ")).join(", ") : `${n} total`}`
    : "🌱 Still growing — we keep playing every day!";
  return [
    `📊 ${kidName}’s learning week on Numberverse`,
    `🎮 ${w.rounds} rounds · ${w.minutes} min · ${w.active_days} day${w.active_days === 1 ? "" : "s"} active`,
    `🎯 ${w.correct_pct}% correct`,
    mastered,
  ].join("\n");
}

function waShare(kidName: string, w: WeeklyReport): string {
  return `https://wa.me/?text=${encodeURIComponent(weeklyShareText(kidName, w))}`;
}

const DEFAULT_SETTINGS: KidSettingsT = {
  enabled_subjects: null,
  max_band: null,
  daily_limit_min: null,
  tts_enabled: true,
  music_enabled: true,
};

function masteryPct(m: MasteryRow): number {
  return Math.min(100, Math.round(m.mastery * 100));
}

export default function ParentDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [mastery, setMastery] = useState<Record<string, MasteryRow[]>>({});
  const [settings, setSettings] = useState<Record<string, KidSettingsT>>({});
  const [activity, setActivity] = useState<Record<string, ActivityRow[]>>({});
  const [weekly, setWeekly] = useState<Record<string, WeeklyReport>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("🦊");
  const [editBirthYear, setEditBirthYear] = useState(2021);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refreshAll = useCallback(
    async (tok: string, kidId: string | null) => {
      const k = await getKids(tok);
      setKids(k);
      const id = kidId ?? (k[0]?.id ?? null);
      setActiveId(id);
      if (!id) return;
      const [m, s, a, w] = await Promise.all([
        getMastery(tok, id),
        getKidSettings(tok, id).catch(() => DEFAULT_SETTINGS),
        getActivity(tok, id).catch(() => []),
        getWeekly(tok, id).catch(() => null),
      ]);
      setMastery((prev) => ({ ...prev, [id]: m }));
      setSettings((prev) => ({ ...prev, [id]: s }));
      setActivity((prev) => ({ ...prev, [id]: a }));
      if (w) setWeekly((prev) => ({ ...prev, [id]: w }));
    },
    []
  );

  useEffect(() => {
    const tok = localStorage.getItem("nv_parent_token");
    if (!tok) {
      setToken(null);
      return;
    }
    setToken(tok);
    refreshAll(tok, null).catch(() => setError("Could not load progress. Is the API running?"));
  }, [refreshAll]);

  const switchKid = useCallback(
    async (id: string) => {
      if (!token) return;
      setActiveId(id);
      if (mastery[id]) return; // already loaded
      try {
        const [m, s, a, w] = await Promise.all([
          getMastery(token, id),
          getKidSettings(token, id).catch(() => DEFAULT_SETTINGS),
          getActivity(token, id).catch(() => []),
          getWeekly(token, id).catch(() => null),
        ]);
        setMastery((prev) => ({ ...prev, [id]: m }));
        setSettings((prev) => ({ ...prev, [id]: s }));
        setActivity((prev) => ({ ...prev, [id]: a }));
        if (w) setWeekly((prev) => ({ ...prev, [id]: w }));
      } catch {
        setError("Failed to load that kid.");
      }
    },
    [token, mastery]
  );

  async function handleSaveSettings() {
    if (!token || !activeId) return;
    setBusy(true);
    setError(null);
    try {
      const s = settings[activeId] ?? DEFAULT_SETTINGS;
      await saveKidSettings(token, activeId, s);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to save settings.");
    } finally {
      setBusy(false);
    }
  }

  function patchSettings(patch: Partial<KidSettingsT>) {
    if (!activeId) return;
    setSettings((prev) => ({
      ...prev,
      [activeId]: { ...(prev[activeId] ?? DEFAULT_SETTINGS), ...patch },
    }));
  }

  async function handleReset() {
    if (!token || !activeId || !confirmReset) return;
    setBusy(true);
    setError(null);
    try {
      await resetKidProgress(token, activeId);
      setConfirmReset(false);
      await refreshAll(token, activeId);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to reset progress.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!token || !activeId || !confirmDelete) return;
    setBusy(true);
    setError(null);
    try {
      await deleteKid(token, activeId);
      setConfirmDelete(false);
      setShowAdd(false);
      await refreshAll(token, null);
    } catch {
      setError("Failed to delete kid.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!token || !editName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const kid = await createKid(token, {
        name: editName.trim(),
        avatar: editAvatar,
        birth_year: editBirthYear,
      } satisfies NewKid);
      setShowAdd(false);
      setEditName("");
      setEditAvatar("🦊");
      await refreshAll(token, kid.id);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to add kid.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    if (!token || !activeId || !editName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateKid(token, activeId, {
        name: editName.trim(),
        avatar: editAvatar,
        birth_year: editBirthYear,
      } satisfies NewKid);
      setEditName("");
      await refreshAll(token, activeId);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to save changes.");
    } finally {
      setBusy(false);
    }
  }

  const active = kids.find((k) => k.id === activeId);
  const activeMastery = activeId ? mastery[activeId] ?? [] : [];
  const masteredCount = activeMastery.filter((m) => m.mastery >= 0.8).length;
  const activeSettings = activeId ? settings[activeId] ?? DEFAULT_SETTINGS : DEFAULT_SETTINGS;
  const EMPTY_WEEKLY: WeeklyReport = { days: [], rounds: 0, correct_pct: 0, minutes: 0, active_days: 0, mastered_this_week: [], top_game: null };
  const activeWeekly = activeId ? weekly[activeId] ?? EMPTY_WEEKLY : EMPTY_WEEKLY;

  if (!token) {
    return (
      <main className="shell">
        <div className="logo">🔢</div>
        <h1>Parent Portal</h1>
        <p className="center muted">Sign in to manage your children’s learning.</p>
        <div className="center" style={{ marginTop: 24 }}>
          <Link className="btn" href="/">Go to login →</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <span className="brand">🔢 <b>Numberverse</b> <span className="muted">Parent Portal</span></span>
        <button className="btn btn-small ghost" onClick={() => { localStorage.removeItem("nv_parent_token"); setToken(null); }}>
          Sign out
        </button>
      </header>

      {error && <p className="err banner">{error}</p>}

      {/* ── kid switcher ── */}
      <section className="kids-row">
        {kids.map((k) => {
          const isActive = k.id === activeId;
          return (
            <button
              key={k.id}
              className={`kid-chip${isActive ? " on" : ""}`}
              onClick={() => switchKid(k.id)}
            >
              <span className="kid-avatar">{k.avatar ?? "🧒"}</span>
              <span className="kid-name">{k.name}</span>
              <span className="kid-year">{k.birth_year ?? "—"}</span>
            </button>
          );
        })}
        <button className="kid-chip add" onClick={() => { setShowAdd((s) => !s); setConfirmReset(false); setConfirmDelete(false); }}>
          <span className="kid-avatar">＋</span>
          <span className="kid-name">Add kid</span>
        </button>
      </section>

      {/* ── add-kid form ── */}
      {showAdd && (
        <section className="card add-kid">
          <h2>Add a new kid</h2>
          <div className="avatar-row">
            {AVATARS.map((a) => (
              <button key={a} className={`avatar-pick${editAvatar === a ? " on" : ""}`} onClick={() => setEditAvatar(a)}>
                {a}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label>
              Name
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Aria" />
            </label>
            <label>
              Birth year
              <input
                type="number"
                min={2010}
                max={2030}
                value={editBirthYear}
                onChange={(e) => setEditBirthYear(Number(e.target.value) || 2021)}
              />
            </label>
          </div>
          <div className="row-buttons">
            <button className="btn primary" disabled={busy || !editName.trim()} onClick={handleCreate}>
              {busy ? "Adding…" : "Add kid"}
            </button>
            <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </section>
      )}

      {active && (
        <>
          {/* ── progress summary ── */}
          <section className="card summary">
            <div className="summary-head">
              <span className="big-avatar">{active.avatar ?? "🧒"}</span>
              <div className="summary-meta">
                <h2>{active.name} <small>(born {active.birth_year ?? "—"})</small></h2>
                <p className="muted">
                  {masteredCount} mastered · {activeMastery.length} skills in progress
                </p>
              </div>
            </div>
            <div className="overall-bar">
              <div className="overall-fill" style={{ width: `${activeMastery.length ? Math.round((masteredCount / activeMastery.length) * 100) : 0}%` }} />
            </div>
          </section>

          {/* ── this week (the "show me my kid learned" card) ── */}
          <section className="card weekly">
            <div className="weekly-head">
              <h2>📊 This week</h2>
              {activeWeekly.rounds > 0 && (
                <a className="share-btn" href={waShare(active.name, activeWeekly)} target="_blank" rel="noopener noreferrer">
                  Share on WhatsApp
                </a>
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
                    <span className="tile-label">min played</span>
                  </div>
                  <div className="tile">
                    <span className="tile-num">{activeWeekly.active_days}</span>
                    <span className="tile-label">days active</span>
                  </div>
                </div>
                <div className="week-bars">
                  {activeWeekly.days.map((d) => (
                    <div key={d.date} className="week-col" title={`${weekdayShort(d.date)}: ${d.rounds} rounds`}>
                      <div className="week-bar" style={{ height: `${activeWeekly.days.length ? Math.max(4, Math.round((d.rounds / Math.max(1, ...activeWeekly.days.map((x) => x.rounds))) * 60)) : 0}px` }} />
                      <span className="week-day">{weekdayShort(d.date)}</span>
                    </div>
                  ))}
                </div>
                {activeWeekly.mastered_this_week.length > 0 && (
                  <p className="muted small" style={{ marginTop: "10px" }}>
                    🏆 Mastered this week:{" "}
                    <strong>{activeWeekly.mastered_this_week.map((s) => s.replace(/-/g, " ")).join(", ")}</strong>
                  </p>
                )}
              </>
            )}
          </section>

          {/* ── controls ── */}
          <section className="card controls">
            <h2>🎛️ Learning controls</h2>

            <div className="ctrl-block">
              <h3>Subjects</h3>
              <p className="muted small">Turn a subject off to hide those games from {active.name}.</p>
              <div className="toggle-grid">
                {SUBJECTS.map((s) => {
                  const list = activeSettings.enabled_subjects;
                  const on = list === null || list.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      className={`toggle-chip${on ? " on" : ""}`}
                      onClick={() => {
                        const list = activeSettings.enabled_subjects;
                        const next = list === null ? SUBJECTS.map((x) => x.id) : [...list];
                        if (on) next.splice(next.indexOf(s.id), 1);
                        else next.push(s.id);
                        if (next.length === SUBJECTS.length) patchSettings({ enabled_subjects: null });
                        else patchSettings({ enabled_subjects: next });
                      }}
                    >
                      <span className="toggle-emoji">{s.emoji}</span>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Difficulty cap</h3>
              <p className="muted small">The hardest world {active.name} can reach (1 = easiest, 5 = hardest).</p>
              <div className="toggle-grid bands">
                <button
                  className={`toggle-chip${activeSettings.max_band === null ? " on" : ""}`}
                  onClick={() => patchSettings({ max_band: null })}
                >
                  All worlds
                </button>
                {[1, 2, 3, 4, 5].map((b) => (
                  <button
                    key={b}
                    className={`toggle-chip${activeSettings.max_band === b ? " on" : ""}`}
                    onClick={() => patchSettings({ max_band: b })}
                  >
                    World {b}
                  </button>
                ))}
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Daily playtime</h3>
              <p className="muted small">A soft limit — the app gently stops play after {active.name} reaches it.</p>
              <div className="toggle-grid">
                <button
                  className={`toggle-chip${activeSettings.daily_limit_min === null ? " on" : ""}`}
                  onClick={() => patchSettings({ daily_limit_min: null })}
                >
                  No limit
                </button>
                {[10, 15, 30, 45, 60, 90].map((m) => (
                  <button
                    key={m}
                    className={`toggle-chip${activeSettings.daily_limit_min === m ? " on" : ""}`}
                    onClick={() => patchSettings({ daily_limit_min: m })}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Reading & sound</h3>
              <div className="toggle-grid">
                <button
                  className={`toggle-chip${activeSettings.tts_enabled ? " on" : ""}`}
                  onClick={() => patchSettings({ tts_enabled: !activeSettings.tts_enabled })}
                >
                  🔊 Voice reading
                </button>
                <button
                  className={`toggle-chip${activeSettings.music_enabled ? " on" : ""}`}
                  onClick={() => patchSettings({ music_enabled: !activeSettings.music_enabled })}
                >
                  🎵 Background music
                </button>
              </div>
            </div>

            <div className="row-buttons save-row">
              <button className="btn primary" disabled={busy} onClick={handleSaveSettings}>
                {busy ? "Saving…" : "Save settings"}
              </button>
              {savedTick > 0 && <span className="saved-note">✓ Saved</span>}
            </div>
          </section>

          {/* ── activity feed ── */}
          <section className="card">
            <h2>📈 Recent activity</h2>
            {(activity[active.id] ?? []).length === 0 ? (
              <p className="muted">Nothing yet — have {active.name} play a round to see it here.</p>
            ) : (
              <ul className="activity-list">
                {(activity[active.id] ?? []).map((a) => (
                  <li key={a.id} className={`activity-item ${a.correct ? "ok" : "no"}`}>
                    <span className="activity-badge">{a.correct ? "✓" : "✗"}</span>
                    <span className="activity-game">{gameLabel(a.game_id)}</span>
                    <span className="activity-time">{fmtTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── mastery table ── */}
          <section className="card">
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

          {/* ── edit + danger zone ── */}
          <section className="card danger">
            <h2>⚙️ Edit {active.name}</h2>
            <div className="avatar-row">
              {AVATARS.map((a) => (
                <button key={a} className={`avatar-pick${editAvatar === a ? " on" : ""}`} onClick={() => setEditAvatar(a)}>
                  {a}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Name
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={active.name} />
              </label>
              <label>
                Birth year
                <input
                  type="number"
                  min={2010}
                  max={2030}
                  value={editBirthYear}
                  onChange={(e) => setEditBirthYear(Number(e.target.value) || 2021)}
                />
              </label>
            </div>
            <div className="row-buttons">
              <button className="btn primary" disabled={busy || !editName.trim()} onClick={handleRename}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>

            <hr />
            <div className="danger-row">
              <div>
                <h3>Reset progress</h3>
                <p className="muted small">Wipes all of {active.name}’s mastery and history. The profile stays.</p>
              </div>
              {confirmReset ? (
                <div className="confirm-group">
                  <button className="btn danger" disabled={busy} onClick={handleReset}>Yes, reset everything</button>
                  <button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn danger-ghost" onClick={() => { setConfirmReset(true); setConfirmDelete(false); }}>Reset progress…</button>
              )}
            </div>

            <div className="danger-row">
              <div>
                <h3>Delete {active.name}</h3>
                <p className="muted small">Permanently removes this profile and all history. This cannot be undone.</p>
              </div>
              {confirmDelete ? (
                <div className="confirm-group">
                  <button className="btn danger" disabled={busy} onClick={handleDelete}>Yes, delete</button>
                  <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn danger-ghost" onClick={() => { setConfirmDelete(true); setConfirmReset(false); }}>Delete…</button>
              )}
            </div>
          </section>
        </>
      )}

      {kids.length === 0 && !error && (
        <p className="hint center">No kids on this account yet — add one above to get started.</p>
      )}
    </main>
  );
}

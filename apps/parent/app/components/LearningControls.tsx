/* ─── LearningControls — 🎛️ Learning controls section (#620) ───
   i18n seam: PAUSE_LANGS / VOICE_LANGS keyed by `wizLang`. Add a locale key
   to those maps in lib/portal and this section follows. */
"use client";

import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import type { KidSettings as KidSettingsT } from "../../lib/api";
import {
  DEFAULT_SETTINGS,
  FOCUS_BANDS,
  LEARNING_LANGS,
  LIMIT_CHOICES,
  MONI_DELTA_LANGS,
  MONI_LANGS,
  PAUSE_LANGS,
  SUBJECTS,
  VOICE_LANGS,
  VOICE_SPEEDS,
  VOICE_TONES,
  WEEKDAYS,
  WEEKDAY_DEFAULTS,
  quietWindowParts,
  quietWindowsArr,
  trySoundPreview,
  tryVoicePreview,
  weekdayLimits,
  writeQuietWindows,
  writeWeekdayLimits,
  type WizardLang,
} from "../lib/portal";

interface LearningControlsProps {
  active: { id: string; name: string };
  activeSettings: KidSettingsT;
  patchSettings: (patch: Partial<KidSettingsT>) => void;
  wizLang: WizardLang;
  busy: boolean;
  handleSaveSettings: () => void;
  savedTick: number;
  /** #1593 — persist the parent's pause decision SERVER-SIDE. page.tsx owns the
   *  API call; this component shows the two-tap confirm + the real state. */
  onTogglePause: () => void;
}

export default function LearningControls({
  active,
  activeSettings,
  patchSettings,
  wizLang,
  busy,
  handleSaveSettings,
  savedTick,
  onTogglePause,
}: LearningControlsProps) {
  // #1593/#1602 — armed pause/resume confirmation (accessible modal).
  const [pauseConfirm, setPauseConfirm] = useState<"pause" | "resume" | null>(null);
  // #1513 — track the last-saved settings snapshot per kid so the save row can
  // show a subtle "Unsaved changes" badge while edits are still pending.
  const [savedSnapshots, setSavedSnapshots] = useState<Record<string, KidSettingsT>>({});
  const [lastSavedTick, setLastSavedTick] = useState(savedTick);

  useEffect(() => {
    // Don't seed the snapshot while the kid's settings are still the loading
    // placeholder (page.tsx falls back to DEFAULT_SETTINGS before fetch lands).
    if (activeSettings === DEFAULT_SETTINGS) return;
    setSavedSnapshots((prev) =>
      prev[active.id] ? prev : { ...prev, [active.id]: activeSettings }
    );
  }, [active.id, activeSettings]);

  useEffect(() => {
    if (savedTick !== lastSavedTick) {
      setSavedSnapshots((prev) => ({ ...prev, [active.id]: activeSettings }));
      setLastSavedTick(savedTick);
    }
  }, [savedTick, lastSavedTick, active.id, activeSettings]);

  const snapshot = savedSnapshots[active.id];
  const unsaved = snapshot ? JSON.stringify(snapshot) !== JSON.stringify(activeSettings) : false;

  // #1512 — the difficulty cap only offers worlds 1–5, but FOCUS_BANDS runs to
  // 7. When a cap is set, focus choices are restricted to bands ≤ the cap so a
  // parent can never pin a world above the ceiling they just chose.
  const maxBand = activeSettings.max_band;
  const focusBands =
    maxBand === null ? FOCUS_BANDS : FOCUS_BANDS.filter((b) => b <= maxBand);

  // #1515 — read the subject set from a ref (kept in sync with props below) so
  // rapid toggles always mutate the latest array instead of a stale snapshot.
  const enabledSubjects = activeSettings.enabled_subjects;
  const enabledSubjectsRef = useRef(enabledSubjects);
  useEffect(() => {
    enabledSubjectsRef.current = activeSettings.enabled_subjects;
  }, [activeSettings.enabled_subjects]);
  function setEnabledSubjects(next: string[] | null) {
    enabledSubjectsRef.current = next;
    patchSettings({ enabled_subjects: next });
  }
  const effectiveIsAll = enabledSubjects === null;
  const effectiveIsNone = Array.isArray(enabledSubjects) && enabledSubjects.length === 0;
  const effectiveIsFull =
    Array.isArray(enabledSubjects) && enabledSubjects.length === SUBJECTS.length;

  // #1044 — per-subject difficulty deltas: explicit choices only (0 = Moni's
  // automatic difficulty for that subject, KEPT in the map so the kid app can
  // clear an earlier +/− on the next sync). null = no parent choices at all.
  function patchDelta(subject: string, delta: number) {
    const clamped = Math.max(-2, Math.min(2, delta));
    const next = { ...(activeSettings.moni_subject_deltas ?? {}) };
    next[subject] = clamped;
    patchSettings({ moni_subject_deltas: next });
  }

  // #1514 — bound the goal input to today's effective daily cap (0 = no limit
  // falls back to 90), and show the post-clamp number, not the raw typed one.
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayCap = weekdayLimits(activeSettings)[todayIdx] ?? 90;
  const goalMax = todayCap > 0 ? todayCap : 90;
  const goalValue = activeSettings.goal_min ?? null;
  const effectiveGoal = goalValue != null && goalValue > 0 ? Math.min(goalValue, goalMax) : null;
  const fmtNum = (n: number) =>
    wizLang === "bn" ? String(n).replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]) : String(n);

  // #1512 — reconcile any stored focus band that already exceeds the cap.
  useEffect(() => {
    const mb = activeSettings.max_band;
    const fb = activeSettings.focus_band;
    if (mb != null && fb != null && fb > mb) {
      patchSettings({ focus_band: mb });
    }
  }, [activeSettings.max_band, activeSettings.focus_band, patchSettings]);

  return (
<section className="card controls" id="controls">
  <h2>{LEARNING_LANGS[wizLang].controlsTitle ?? "🎛️ Learning controls"}</h2>

  {/* #272 — safety: instant pause (parent kill-switch). One tap stops
      every game for this kid with a kid-safe screen; stays paused
      through reloads until a parent resumes. */}
  <div className={`ctrl-block pause-block${activeSettings.paused ? " on" : ""}`}>
    <h3>{PAUSE_LANGS[wizLang].title}</h3>
    <p className="muted small">
      {activeSettings.paused
        ? PAUSE_LANGS[wizLang].onHint.replace("{name}", active.name)
        : PAUSE_LANGS[wizLang].offHint.replace("{name}", active.name)}
    </p>
    {/* #1593 — the button arms a two-tap confirm (actual resulting state shown)
        and the page handler persists the decision server-side immediately. */}
    <button
      className={`btn${activeSettings.paused ? " danger-ghost" : " danger"}`}
      onClick={() => setPauseConfirm(activeSettings.paused ? "resume" : "pause")}
      aria-pressed={activeSettings.paused}
      disabled={busy}
    >
      {busy ? PAUSE_LANGS[wizLang].saving : activeSettings.paused ? PAUSE_LANGS[wizLang].resume : PAUSE_LANGS[wizLang].pause}
    </button>
    <ConfirmDialog
      open={pauseConfirm !== null}
      title={
        pauseConfirm === "resume"
          ? PAUSE_LANGS[wizLang].confirmResumeTitle.replace("{name}", active.name)
          : PAUSE_LANGS[wizLang].confirmPauseTitle.replace("{name}", active.name)
      }
      body={
        pauseConfirm === "resume"
          ? PAUSE_LANGS[wizLang].confirmResumeBody.replace("{name}", active.name)
          : PAUSE_LANGS[wizLang].confirmPauseBody.replace("{name}", active.name)
      }
      confirmLabel={PAUSE_LANGS[wizLang].confirm}
      cancelLabel={PAUSE_LANGS[wizLang].cancel}
      danger={pauseConfirm === "pause"}
      onConfirm={() => {
        setPauseConfirm(null);
        onTogglePause();
      }}
      onCancel={() => setPauseConfirm(null)}
    />
  </div>

  {/* #1041/#1042 — MONI STRICTNESS: the adaptive tutor's difficulty knob.
      gentle/steady/challenging shifts how hard Moni pushes this kid
      (planner difficulty −1/0/+1 + tone). "steady" = Moni's own automatic
      read. Synced to the kid app via KidSettings — applies on every device. */}
  <div className="ctrl-block">
    <h3>{MONI_LANGS[wizLang].title}</h3>
    <p className="muted small">{MONI_LANGS[wizLang].help}</p>
    <div className="toggle-grid">
      {(["gentle", "steady", "challenging"] as const).map((opt) => {
        const cur = activeSettings.moni_strictness ?? "steady";
        return (
          <button
            key={opt}
            className={`toggle-chip${cur === opt ? " on" : ""}`}
            aria-pressed={cur === opt}
            onClick={() => patchSettings({ moni_strictness: opt })}
          >
            {MONI_LANGS[wizLang][opt]}
          </button>
        );
      })}
    </div>
  </div>

  {/* #1044 — PER-SUBJECT difficulty deltas: one area gentler/harder without
      pushing the whole kid. Signed ±2 per subject layered on top of the
      global strictness; 0 = Moni's automatic difficulty for that subject.
      Synced to the kid app, which expands each subject onto its skills. */}
  <div className="ctrl-block">
    <h3>{MONI_DELTA_LANGS[wizLang].title}</h3>
    <p className="muted small">{MONI_DELTA_LANGS[wizLang].help}</p>
    <div className="delta-grid">
      {SUBJECTS.map((s) => {
        const delta = activeSettings.moni_subject_deltas?.[s.id] ?? 0;
        return (
          <div key={s.id} className="delta-row">
            <span className="delta-subject">
              <span className="toggle-emoji">{s.emoji}</span> {s.label}
            </span>
            <div className="delta-stepper" role="group" aria-label={s.label}>
              <button
                type="button"
                className={`delta-btn${delta <= -2 ? " dim" : ""}`}
                disabled={delta <= -2}
                aria-label={`${s.label} easier`}
                onClick={() => patchDelta(s.id, delta - 1)}
              >
                −
              </button>
              <button
                type="button"
                className={`toggle-chip delta-val${delta !== 0 ? " on" : ""}`}
                aria-pressed={delta !== 0}
                title={MONI_DELTA_LANGS[wizLang].rangeHint(delta)}
                onClick={() => patchDelta(s.id, 0)}
              >
                {delta > 0 ? `+${delta}` : delta}
              </button>
              <button
                type="button"
                className={`delta-btn${delta >= 2 ? " dim" : ""}`}
                disabled={delta >= 2}
                aria-label={`${s.label} harder`}
                onClick={() => patchDelta(s.id, delta + 1)}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </div>

  <div className="ctrl-block">
    <h3>{LEARNING_LANGS[wizLang].subjectsTitle}</h3>
    <p className="muted small">
      {LEARNING_LANGS[wizLang].subjectsHint.replace("{name}", active.name)}
    </p>
    {/* #1515 — explicit All/None shortcuts. The badge marks the default
        null state ("all subjects") so it can't be confused with a partial
        restriction; toggling to all keeps the full array instead of
        collapsing it back to null. */}
    <div className="subject-quick">
      <button
        className={`toggle-chip${effectiveIsAll || effectiveIsFull ? " on" : ""}`}
        onClick={() => setEnabledSubjects(null)}
        aria-pressed={effectiveIsAll || effectiveIsFull}
      >
        {LEARNING_LANGS[wizLang].subjectsAll}
      </button>
      <button
        className={`toggle-chip${effectiveIsNone ? " on" : ""}`}
        onClick={() => setEnabledSubjects([])}
        aria-pressed={effectiveIsNone}
      >
        {LEARNING_LANGS[wizLang].subjectsNone}
      </button>
      {effectiveIsAll && (
        <span className="subject-badge">{LEARNING_LANGS[wizLang].allSubjects}</span>
      )}
    </div>
    <div className="toggle-grid">
      {SUBJECTS.map((s) => {
        const list = activeSettings.enabled_subjects;
        const on = list === null || list.includes(s.id);
        return (
          <button
            key={s.id}
            className={`toggle-chip${on ? " on" : ""}`}
            aria-pressed={on}
            onClick={() => {
              // #1515 — read from the ref, not the render snapshot, so rapid
              // clicks always toggle the latest set.
              const cur = enabledSubjectsRef.current;
              const isOn = cur === null || cur.includes(s.id);
              const next = cur === null ? SUBJECTS.map((x) => x.id) : [...cur];
              if (isOn) next.splice(next.indexOf(s.id), 1);
              else next.push(s.id);
              setEnabledSubjects(next);
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
    {/* #1049 — honest label: this gates WORLDS (content bands), it does not
        change per-game difficulty. The old "Difficulty cap" wording conflated
        the two and promised a lever this control doesn't have. */}
    <h3>{LEARNING_LANGS[wizLang].worldsTitle}</h3>
    {/* #1512 — dynamic caption: with a cap set it names that ceiling, and
        with "All worlds" it stays neutral, so the text never contradicts the
        7-band focus picker. */}
    <p className="muted small">
      {maxBand === null
        ? LEARNING_LANGS[wizLang].worldsHintAll.replace("{name}", active.name)
        : LEARNING_LANGS[wizLang].worldsHint
            .replace("{name}", active.name)
            .replace("{n}", fmtNum(maxBand))}
    </p>
    <div className="toggle-grid bands">
      <button
        className={`toggle-chip${activeSettings.max_band === null ? " on" : ""}`}
        onClick={() => patchSettings({ max_band: null })}
      >
        {LEARNING_LANGS[wizLang].allWorlds}
      </button>
      {[1, 2, 3, 4, 5].map((b) => (
        <button
          key={b}
          className={`toggle-chip${activeSettings.max_band === b ? " on" : ""}`}
          onClick={() =>
            patchSettings({
              max_band: b,
              // #1512 — clamp a pinned focus world to the new ceiling.
              ...(activeSettings.focus_band != null && activeSettings.focus_band > b
                ? { focus_band: b }
                : {}),
            })
          }
        >
          World {b}
        </button>
      ))}
    </div>
  </div>

  <div className="ctrl-block">
    <h3>{LEARNING_LANGS[wizLang].playtimeTitle}</h3>
    <p className="muted small">
      {LEARNING_LANGS[wizLang].playtimeHint.replace("{name}", active.name)}
    </p>
    <div className="weekday-limits">
      {WEEKDAYS.map((d, i) => {
        const cur = weekdayLimits(activeSettings)[i];
        return (
          <div key={d.key} className="weekday-row">
            <span className="weekday-name" title={d.full}>{d.short}</span>
            <div className="weekday-chips" role="group" aria-label={`${d.full} ${LEARNING_LANGS[wizLang].playtimeTitle}`}>
              {LIMIT_CHOICES.map((m) => (
                <button
                  key={m}
                  className={`toggle-chip${cur === m ? " on" : ""}`}
                  onClick={() => {
                    const arr = [...weekdayLimits(activeSettings)];
                    arr[i] = m;
                    patchSettings(writeWeekdayLimits(activeSettings, arr));
                  }}
                >
                  {m === 0 ? LEARNING_LANGS[wizLang].off : `${m}m`}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
    <div className="weekday-presets">
      <button
        className="ghost-btn small"
        onClick={() => patchSettings(writeWeekdayLimits(activeSettings, WEEKDAY_DEFAULTS))}
      >
        {LEARNING_LANGS[wizLang].defaultPreset}
      </button>
      <button
        className="ghost-btn small"
        onClick={() => patchSettings(writeWeekdayLimits(activeSettings, [0, 0, 0, 0, 0, 0, 0]))}
      >
        {LEARNING_LANGS[wizLang].noLimitPreset}
      </button>
    </div>
  </div>

  {/* 🎯 #256 — gentle daily goal: Nova nudges toward it, never blocks.
      The server clamps it to the day's cap, so it respects the limits
      set just above. */}
  <div className="ctrl-block">
    <h3>{LEARNING_LANGS[wizLang].dailyGoalTitle}</h3>
    <p className="muted small">
      {LEARNING_LANGS[wizLang].dailyGoalHint.replace("{name}", active.name)}
    </p>
    <div className="goal-row">
      <input
        className="goal-input"
        type="number"
        min={0}
        max={goalMax}
        value={goalValue ?? ""}
        placeholder={LEARNING_LANGS[wizLang].noGoalPlaceholder}
        aria-label={LEARNING_LANGS[wizLang].dailyGoalTitle}
        onChange={(e) => {
          const v = e.target.value.trim();
          // #1514 — empty/0 = "No goal" (null); negative/invalid inputs are
          // ignored so they can't silently collapse into the no-goal state.
          if (v === "") {
            patchSettings({ goal_min: null });
            return;
          }
          const n = parseInt(v, 10);
          if (Number.isNaN(n) || n < 0) return;
          patchSettings({ goal_min: n === 0 ? null : Math.min(n, goalMax) });
        }}
      />
      <span className="goal-unit">{LEARNING_LANGS[wizLang].minutesPerDay}</span>
    </div>
    {effectiveGoal != null && (
      <p className="hint">
        {LEARNING_LANGS[wizLang].goalSavedHint
          .replace("{goal}", fmtNum(effectiveGoal))
          .replace("{cap}", fmtNum(goalMax))}
      </p>
    )}
  </div>

  {/* 📌 #257 — curriculum focus pin: a subject + world the journey
      leads with. Both-or-neither; Clear restores the normal path. */}
  <div className="ctrl-block">
    <h3>{LEARNING_LANGS[wizLang].focusTitle}</h3>
    <p className="muted small">
      {LEARNING_LANGS[wizLang].focusHint.replace("{name}", active.name)}
    </p>
    <div className="focus-subjects">
      {SUBJECTS.map((sub) => (
        <button
          key={sub.id}
          className={`toggle-chip${activeSettings.focus_subject === sub.id ? " on" : ""}`}
          onClick={() => {
            if (activeSettings.focus_subject === sub.id) {
              patchSettings({ focus_subject: null, focus_band: null });
            } else {
              patchSettings({ focus_subject: sub.id, focus_band: null });
            }
          }}
        >
          {sub.emoji} {sub.label}
        </button>
      ))}
    </div>
    {activeSettings.focus_subject && (
      <div className="focus-bands" role="group" aria-label="Focus world">
        {/* #1512 — only offer bands within the active difficulty cap. */}
        {focusBands.map((b) => (
          <button
            key={b}
            className={`toggle-chip${activeSettings.focus_band === b ? " on" : ""}`}
            onClick={() => patchSettings({ focus_band: b })}
          >
            World {b}
          </button>
        ))}
      </div>
    )}
    {(activeSettings.focus_subject || activeSettings.focus_band) && (
      <div className="focus-clear">
        <button
          className="ghost-btn small"
          onClick={() => patchSettings({ focus_subject: null, focus_band: null })}
        >
          {LEARNING_LANGS[wizLang].clearFocus}
        </button>
      </div>
    )}
  </div>

  <div className="ctrl-block">
    <h3>{LEARNING_LANGS[wizLang].readingSoundTitle}</h3>
    <div className="toggle-grid">
      <button
        className={`toggle-chip${activeSettings.tts_enabled ? " on" : ""}`}
        onClick={() => patchSettings({ tts_enabled: !activeSettings.tts_enabled })}
      >
        {LEARNING_LANGS[wizLang].voiceReading}
      </button>
      <button
        className={`toggle-chip${activeSettings.music_enabled ? " on" : ""}`}
        onClick={() => patchSettings({ music_enabled: !activeSettings.music_enabled })}
      >
        {LEARNING_LANGS[wizLang].backgroundMusic}
      </button>
      <button
        className={`toggle-chip${activeSettings.voice_record_enabled ? " on" : ""}`}
        onClick={() => patchSettings({ voice_record_enabled: !activeSettings.voice_record_enabled })}
        title={LEARNING_LANGS[wizLang].voiceRecordingHint}
      >
        {LEARNING_LANGS[wizLang].voiceRecording}
      </button>
    </div>
    {/* #243 — per-kid volume balance: voice / sfx / music, with a Try button */}
    <div className="volume-balance">
      {(
        [
          { key: "voice_volume", icon: "🗣️", labelKey: "volVoice", hintKey: "volVoiceHint" },
          { key: "sfx_volume", icon: "✨", labelKey: "volSfx", hintKey: "volSfxHint" },
          { key: "music_volume", icon: "🎵", labelKey: "volMusic", hintKey: "volMusicHint" },
        ] as const
      ).map((row) => {
        const cur = activeSettings[row.key] ?? 1;
        const label = LEARNING_LANGS[wizLang][row.labelKey];
        const hint = LEARNING_LANGS[wizLang][row.hintKey];
        return (
          <div key={row.key} className="vol-row">
            <span className="vol-label" title={hint}>
              {row.icon} {label}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={cur}
              aria-label={`${label} volume`}
              onChange={(e) => patchSettings({ [row.key]: Number(e.target.value) })}
            />
            <span className="vol-num">{Math.round(cur * 100)}%</span>
            <button
              className="ghost-btn small vol-try"
              type="button"
              onClick={() => trySoundPreview(row.key.replace("_volume", "") as "voice" | "sfx" | "music", cur)}
            >
              {LEARNING_LANGS[wizLang].try}
            </button>
          </div>
        );
      })}
    </div>
    {/* #258 — per-kid VOICE preference: which tone reads + how fast, with a Try button */}
    <div className="voice-pref">
      <div className="vp-row">
        <span className="vp-label" title={VOICE_LANGS[wizLang].toneHint}>
          🗣️ {VOICE_LANGS[wizLang].voice}
        </span>
        <div className="vp-chips">
          {VOICE_TONES.map((t) => {
            const on = activeSettings.voice_tone === t.key;
            return (
              <button
                key={t.key}
                className={`toggle-chip${on ? " on" : ""}`}
                onClick={() => patchSettings({ voice_tone: on ? null : t.key })}
                aria-pressed={on}
              >
                {wizLang === "bn" ? t.bn : t.en}
              </button>
            );
          })}
        </div>
      </div>
      <div className="vp-row">
        <span className="vp-label" title={VOICE_LANGS[wizLang].speedHint}>
          ⚡ {VOICE_LANGS[wizLang].speed}
        </span>
        <div className="vp-chips">
          {VOICE_SPEEDS.map((sp) => {
            const on = (activeSettings.voice_speed ?? 1) === sp.rate;
            return (
              <button
                key={sp.key}
                className={`toggle-chip${on ? " on" : ""}`}
                onClick={() => patchSettings({ voice_speed: on ? null : sp.rate })}
                aria-pressed={on}
              >
                {wizLang === "bn" ? sp.bn : sp.en}
              </button>
            );
          })}
        </div>
      </div>
      <button
        className="ghost-btn small vol-try"
        type="button"
        onClick={() =>
          tryVoicePreview(
            activeSettings.voice_tone ?? "female",
            activeSettings.voice_speed ?? 1,
            wizLang
          )
        }
      >
        {VOICE_LANGS[wizLang].try}
      </button>
    </div>
    <p className="muted small">{LEARNING_LANGS[wizLang].voiceRecordingHint}</p>
  </div>

  {/* #248 — quiet hours: auto-soften during a per-day schedule, never blocks play */}
  <div className="ctrl-block quiet-block">
    <h3>{LEARNING_LANGS[wizLang].quietTitle}</h3>
    <p className="muted small">
      {LEARNING_LANGS[wizLang].quietHint}
    </p>
    <div className="toggle-grid">
      <button
        className={`toggle-chip${activeSettings.quiet_enabled ? " on" : ""}`}
        onClick={() => patchSettings({ quiet_enabled: !activeSettings.quiet_enabled })}
      >
        {LEARNING_LANGS[wizLang].quietOn}
      </button>
      <button
        className={`toggle-chip${activeSettings.quiet_dim ? " on" : ""}`}
        onClick={() => patchSettings({ quiet_dim: !activeSettings.quiet_dim })}
        title={LEARNING_LANGS[wizLang].gentleDimHint}
      >
        {LEARNING_LANGS[wizLang].gentleDim}
      </button>
    </div>

    <div className="quiet-schedule">
      {WEEKDAYS.map((d, i) => {
        const win = quietWindowParts(quietWindowsArr(activeSettings)[i]);
        return (
          <div className="quiet-day" key={d.key}>
            <span className="quiet-day-name">{d.full}</span>
            <label className="quiet-off">
              <input
                type="checkbox"
                checked={win.on}
                onChange={(e) => {
                  const arr = quietWindowsArr(activeSettings);
                  arr[i] = e.target.checked ? "20:00-07:00" : "-";
                  patchSettings(writeQuietWindows(activeSettings, arr));
                }}
              />
              {LEARNING_LANGS[wizLang].on}
            </label>
            <input
              type="time"
              className="quiet-time"
              value={win.start}
              disabled={!win.on}
              onChange={(e) => {
                const arr = quietWindowsArr(activeSettings);
                const cur = quietWindowParts(arr[i]);
                const end = cur.end || "07:00";
                arr[i] = `${e.target.value || "20:00"}-${end}`;
                patchSettings(writeQuietWindows(activeSettings, arr));
              }}
            />
            <span className="quiet-sep">–</span>
            <input
              type="time"
              className="quiet-time"
              value={win.end}
              disabled={!win.on}
              onChange={(e) => {
                const arr = quietWindowsArr(activeSettings);
                const cur = quietWindowParts(arr[i]);
                const start = cur.start || "20:00";
                arr[i] = `${start}-${e.target.value || "07:00"}`;
                patchSettings(writeQuietWindows(activeSettings, arr));
              }}
            />
          </div>
        );
      })}
      <p className="muted small">{LEARNING_LANGS[wizLang].overnightHint}</p>
    </div>

    <div className="vol-row">
      <span className="vol-label" title={LEARNING_LANGS[wizLang].softVolumeHint}>{LEARNING_LANGS[wizLang].softVolume}</span>
      <input
        type="range"
        min={0.05}
        max={1}
        step={0.05}
        value={activeSettings.quiet_volume ?? 0.15}
        aria-label={LEARNING_LANGS[wizLang].quietVolumeLabel}
        onChange={(e) => patchSettings({ quiet_volume: Number(e.target.value) })}
      />
      <span className="vol-num">{Math.round((activeSettings.quiet_volume ?? 0.15) * 100)}%</span>
    </div>
  </div>

  {/* #1592 — the save row sticks to the bottom while there are unsaved edits,
      so a parent who changed difficulty / screen-time can't miss the fact that
      it isn't persisted yet (previously the Save button was below the fold and
      edits silently vanished on reload). */}
  <div className={`row-buttons save-row${unsaved ? " save-row-sticky" : ""}`}>
    <button className="btn primary" disabled={busy} onClick={handleSaveSettings}>
      {busy ? LEARNING_LANGS[wizLang].saving : LEARNING_LANGS[wizLang].saveSettings}
    </button>
    {savedTick > 0 && !unsaved && <span className="saved-note">{LEARNING_LANGS[wizLang].saved}</span>}
    {unsaved && <span className="muted small unsaved-note">{LEARNING_LANGS[wizLang].unsavedBadge}</span>}
  </div>
  {unsaved && (
    <p className="hint center" role="status" style={{ marginTop: 6 }}>
      {LEARNING_LANGS[wizLang].unsavedSticky}
    </p>
  )}
</section>  );
}

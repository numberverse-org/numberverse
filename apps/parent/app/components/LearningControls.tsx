/* ─── LearningControls — 🎛️ Learning controls section (#620) ───
   i18n seam: PAUSE_LANGS / VOICE_LANGS keyed by `wizLang`. Add a locale key
   to those maps in lib/portal and this section follows. */
"use client";

import type { KidSettings as KidSettingsT } from "../../lib/api";
import {
  FOCUS_BANDS,
  LIMIT_CHOICES,
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
}

export default function LearningControls({
  active,
  activeSettings,
  patchSettings,
  wizLang,
  busy,
  handleSaveSettings,
  savedTick,
}: LearningControlsProps) {
  return (
<section className="card controls" id="controls">
  <h2>🎛️ Learning controls</h2>

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
    <button
      className={`btn${activeSettings.paused ? " danger-ghost" : " danger"}`}
      onClick={() => patchSettings({ paused: !activeSettings.paused })}
      aria-pressed={activeSettings.paused}
    >
      {activeSettings.paused ? PAUSE_LANGS[wizLang].resume : PAUSE_LANGS[wizLang].pause}
    </button>
  </div>

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
    <h3>Playtime per day</h3>
    <p className="muted small">
      A soft limit per day of the week — the app gently stops play when {active.name} reaches it. Default: 45 min school days, 90 weekend.
    </p>
    <div className="weekday-limits">
      {WEEKDAYS.map((d, i) => {
        const cur = weekdayLimits(activeSettings)[i];
        return (
          <div key={d.key} className="weekday-row">
            <span className="weekday-name" title={d.full}>{d.short}</span>
            <div className="weekday-chips" role="group" aria-label={`${d.full} playtime`}>
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
                  {m === 0 ? "Off" : `${m}m`}
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
        ↺ Default (45/90)
      </button>
      <button
        className="ghost-btn small"
        onClick={() => patchSettings(writeWeekdayLimits(activeSettings, [0, 0, 0, 0, 0, 0, 0]))}
      >
        No limit
      </button>
    </div>
  </div>

  {/* 🎯 #256 — gentle daily goal: Nova nudges toward it, never blocks.
      The server clamps it to the day's cap, so it respects the limits
      set just above. */}
  <div className="ctrl-block">
    <h3>🎯 Daily goal</h3>
    <p className="muted small">
      A gentle goal {active.name} can aim for each day. Nova cheers it on
      without pressure — it never blocks play, and it always stays at or
      below the day's limit above.
    </p>
    <div className="goal-row">
      <input
        className="goal-input"
        type="number"
        min={0}
        max={600}
        value={activeSettings.goal_min ?? ""}
        placeholder="No goal"
        onChange={(e) => {
          const v = e.target.value.trim();
          patchSettings({ goal_min: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) });
        }}
      />
      <span className="goal-unit">minutes / day</span>
    </div>
    {activeSettings.goal_min != null && activeSettings.goal_min > 0 && (
      <p className="hint">
        ↳ Saved as up to {activeSettings.goal_min} min — clamped to the daily cap if that's lower.
      </p>
    )}
  </div>

  {/* 📌 #257 — curriculum focus pin: a subject + world the journey
      leads with. Both-or-neither; Clear restores the normal path. */}
  <div className="ctrl-block">
    <h3>📌 Focus</h3>
    <p className="muted small">
      Pin a subject + world so {active.name}’s journey leads with those skills.
      Clear it anytime to go back to the normal path.
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
        {FOCUS_BANDS.map((b) => (
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
          ✕ Clear focus
        </button>
      </div>
    )}
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
      <button
        className={`toggle-chip${activeSettings.voice_record_enabled ? " on" : ""}`}
        onClick={() => patchSettings({ voice_record_enabled: !activeSettings.voice_record_enabled })}
        title="Kid can record their own voice and replay. Stays on this device — never synced."
      >
        🎙️ Voice recording
      </button>
    </div>
    {/* #243 — per-kid volume balance: voice / sfx / music, with a Try button */}
    <div className="volume-balance">
      {(
        [
          { key: "voice_volume", icon: "🗣️", label: "Voice", hint: "Read-aloud and spoken feedback" },
          { key: "sfx_volume", icon: "✨", label: "Sound effects", hint: "Pops, chimes and win sounds" },
          { key: "music_volume", icon: "🎵", label: "Music", hint: "The background music" },
        ] as const
      ).map((row) => {
        const cur = activeSettings[row.key] ?? 1;
        return (
          <div key={row.key} className="vol-row">
            <span className="vol-label" title={row.hint}>
              {row.icon} {row.label}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={cur}
              aria-label={`${row.label} volume`}
              onChange={(e) => patchSettings({ [row.key]: Number(e.target.value) })}
            />
            <span className="vol-num">{Math.round(cur * 100)}%</span>
            <button
              className="ghost-btn small vol-try"
              type="button"
              onClick={() => trySoundPreview(row.key.replace("_volume", "") as "voice" | "sfx" | "music", cur)}
            >
              🔊 Try
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
    <p className="muted small">🎙️ Voice recording lets a kid record and replay their own voice. Recordings stay on this device and are never sent to the server.</p>
  </div>

  {/* #248 — quiet hours: auto-soften during a per-day schedule, never blocks play */}
  <div className="ctrl-block quiet-block">
    <h3>🌙 Quiet hours</h3>
    <p className="muted small">
      During these times the app gently lowers volume and dims the screen — play is never blocked.
    </p>
    <div className="toggle-grid">
      <button
        className={`toggle-chip${activeSettings.quiet_enabled ? " on" : ""}`}
        onClick={() => patchSettings({ quiet_enabled: !activeSettings.quiet_enabled })}
      >
        🌙 Quiet hours on
      </button>
      <button
        className={`toggle-chip${activeSettings.quiet_dim ? " on" : ""}`}
        onClick={() => patchSettings({ quiet_dim: !activeSettings.quiet_dim })}
        title="Gently dims the screen during quiet hours."
      >
        🕯️ Gentle dimming
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
              On
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
      <p className="muted small">Overnight windows cross midnight — e.g. 20:00 → 07:00. Start later than end for bedtime.</p>
    </div>

    <div className="vol-row">
      <span className="vol-label" title="How soft the app gets during quiet hours.">🔉 Soft volume</span>
      <input
        type="range"
        min={0.05}
        max={1}
        step={0.05}
        value={activeSettings.quiet_volume ?? 0.15}
        aria-label="Quiet hours volume"
        onChange={(e) => patchSettings({ quiet_volume: Number(e.target.value) })}
      />
      <span className="vol-num">{Math.round((activeSettings.quiet_volume ?? 0.15) * 100)}%</span>
    </div>
  </div>

  <div className="row-buttons save-row">
    <button className="btn primary" disabled={busy} onClick={handleSaveSettings}>
      {busy ? "Saving…" : "Save settings"}
    </button>
    {savedTick > 0 && <span className="saved-note">✓ Saved</span>}
  </div>
</section>  );
}

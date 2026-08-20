/**
 * Shared mobile-safe WebAudio.
 * One context, resumed inside a user gesture (iOS requirement).
 * All sounds are tiny, synthesized, zero-asset — fast + offline-friendly.
 */

import { prefersReducedMotion } from "./reducedMotion";

let ctx: AudioContext | null = null;

export function ensureAudio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") {
      // #3092 — fire-and-forget `void ctx.resume()` leaked a rejected resume
      // (browsers reject under autoplay policy) as an unhandledrejection on
      // EVERY sound effect. Attach a rejection handler: the context stays
      // suspended and the next user gesture retries — no-op, never unhandled.
      void ctx.resume().catch(() => {
        /* suspended — next gesture retries */
      });
    }
    return ctx;
  } catch {
    return null;
  }
}

/* #243 — per-kid volume balance set by the parent portal. The MIX table and
 * music theme gains stay the same; every note is scaled by its layer's knob
 * (sfx for feedback, music for the ambient bed). Voice is handled in speech.ts
 * via setVoiceBalance(). Default 1.0 = full volume, unchanged behavior. */
let sfxVolume = 1;
let musicVolume = 1;
export function setSfxVolume(v: number) {
  sfxVolume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
}
export function setMusicVolume(v: number) {
  musicVolume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
}
// #248 — quiet-hours multiplier (1 = normal). During a parent's quiet window
// the app multiplies EVERY sound by this soft level; tapping the moon badge
// raises it back to 1 for the rest of the session (never hard-blocked).
let quietLevel = 1;
export function setQuietLevel(v: number) {
  quietLevel = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
}

/* #831 — master SFX mute. The parent portal can switch off spoken voice (TTS)
 * and, with it, the whole feedback layer (pops, chimes, win fanfares, clicks).
 * Music has its own mute below; this flag is a dedicated off-switch for the
 * SFX/feedback path and is routed through tone() + whooshUp() so no sound
 * effect can slip through. Persisted like nv_music ("0" = on, "1" = off) but
 * defaulting to ON because SFX are expected out of the box (music is opt-in). */
let sfxMuted = typeof localStorage !== "undefined" ? localStorage.getItem("nv_sfx") === "1" : false;
export function setSfxMuted(v: boolean) {
  sfxMuted = v;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("nv_sfx", sfxMuted ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }
}
export function isSfxMuted(): boolean {
  return sfxMuted;
}

/* #1468 — kid-side sound mute. The kid-facing mute (HUD + Settings) is a
 * combined sound+song switch: one tap silences BOTH the background bed
 * (musicMuted below) and this SFX/feedback layer. Kept separate from the
 * parent's `sfxMuted` above so a parent's reading-off rule can never be undone
 * by a kid tap, and persisted like nv_music so the choice survives reload. */
let kidSfxMuted = typeof localStorage !== "undefined" ? localStorage.getItem("nv_sfx_kid") === "1" : false;
export function setKidSfxMuted(v: boolean) {
  kidSfxMuted = v;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("nv_sfx_kid", kidSfxMuted ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }
}
export function isKidSfxMuted(): boolean {
  return kidSfxMuted;
}

type SoundLayer = "sfx" | "music";

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.15,
  startDelay = 0,
  layer: SoundLayer = "sfx"
) {
  const c = ensureAudio();
  if (!c) return;
  const t = c.currentTime + startDelay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const v = vol * quietLevel * (layer === "music" ? musicVolume : sfxMuted || kidSfxMuted ? 0 : sfxVolume);
  g.gain.setValueAtTime(Math.max(v, 0.0001), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/* #354 — THE MIX. One place that defines how the three layers sit together:
 *
 *   music  ≈ 0.04–0.06   the lowest bed — ducks under everything
 *   sfx    ≈ 0.05–0.16   the feedback layer — sits above music, below voice
 *   voice  ≈ 0.9–1.0     the STAR (neural 0.9 default; WebSpeech = system vol)
 *
 * Raising a layer is ONE knob here — never a magic number in a scene. Mute is
 * respected separately (musicMuted in the scheduler, setSpeechEnabled in
 * speech.ts), and this table is intentionally independent of both. */
const MIX = {
  sfxNote: 0.15, // xylophone melody notes
  sfxPop: 0.15,
  sfxStarPop: 0.05, // round-meter tick — the quietest layer
  sfxCombo: 0.11,
  sfxBad: 0.13, // "uh…"
  sfxBadSecond: 0.1, // "oh"
  sfxWin: 0.16, // victory chord
  sfxWinSparkle: 0.08, // top sparkle note
  sfxClick: 0.08,
  sfxClickSecond: 0.06,
  sfxTada: 0.1, // whole-session fanfare chord
  sfxTadaSparkle: 0.12,
  sfxCoin: 0.12, // coin-grant "cha-ching"
} as const;

/** Play one pitched note at `delay` seconds from now (Counting Song xylophone).
 *  Exported so scenes can schedule melodies (each number = a rising note). */
export function playNote(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol: number = MIX.sfxNote,
  delay = 0
) {
  tone(freq, dur, type, vol, delay);
}

/** Correct pop — bright, rises a little each pop. */
export function pop() {
  const c = ensureAudio();
  if (!c) return;
  tone(520 + Math.random() * 160, 0.13, "sine", MIX.sfxPop);
  haptic(12);
}

/** Round-meter star fills — a tiny, quiet "tick" so progress sounds rewarding. */
export function starPop() {
  tone(1700 + Math.random() * 400, 0.07, "sine", MIX.sfxStarPop);
}

/** Combo chime — a rising three-note sparkle as the combo climbs.
 *  #1065 — rooted in the CURRENT LAND'S key (`landRoot`, swapped by
 *  setMusicTheme), so a win in band 5 rings higher than the same combo in band
 *  1: the celebration pitch already carries the difficulty, not just the streak. */
export function comboChime(combo: number) {
  const base = landRoot * (1 + Math.min(combo, 8) * 0.08);
  [base, base * 1.26, base * 1.5].forEach((f, i) => tone(f, 0.2, "triangle", MIX.sfxCombo, i * 0.055));
}

/** #1066 — distinct "that was hard" acknowledgment: a warm two-note major
 *  third, lower and calmer than the combo chime so a hard-but-correct answer
 *  sounds like recognition, not the same sparkle as an easy combo. */
export function hardAck() {
  tone(659.25, 0.12, "triangle", MIX.sfxCombo); // E5 — "you did a hard thing"
  tone(830.61, 0.18, "sine", MIX.sfxCombo, 0.08); // G#5 — a gentle lift, not a fanfare
  haptic(14);
}

/** Coin grant — a bright two-note "cha-ching" so earning feels tangible. */
export function coinSound() {
  tone(987.77, 0.07, "triangle", MIX.sfxCoin);
  tone(1318.5, 0.14, "triangle", MIX.sfxCoin, 0.06);
  haptic(10);
}

/** Wrong tap — a gentle, warm "oops" nudge. Wrong answers are learning moments:
 * soft, descending, never alarming. Audible enough that the kid hears the cue,
 * but a warm sine pair — no harsh square-wave buzz. */
export function bad() {
  tone(392, 0.16, "sine", MIX.sfxBad); // G4 — "uh…"
  tone(311, 0.26, "sine", MIX.sfxBadSecond, 0.09); // E♭4 — "oh"
  haptic([0, 28, 16, 24]); // short double-nudge: "try that again"
}

/** #134 — the land's celebratory root note (C4 by default). */
let landRoot = 523.25;

/** Round complete — a major fanfare rooted in the current land's key. */
export function win() {
  [1, 1.25, 1.5, 2].forEach((r, i) => tone(landRoot * r, 0.4, "triangle", MIX.sfxWin, i * 0.1));
  tone(landRoot * 2.52, 0.6, "sine", MIX.sfxWinSparkle, 0.42);
  haptic([0, 18, 12, 18, 12, 34]); // little three-beat victory pulse
}

/** Soft UI button tap — DOM navigation buttons (home/worlds/done). */
export function click() {
  tone(660, 0.05, "triangle", MIX.sfxClick);
  tone(880, 0.06, "triangle", MIX.sfxClickSecond, 0.02);
  haptic(8);
}

/* #355 — subtle haptic pulses on taps (correct/wrong/win/UI) where the
 * device supports vibration. Kid-safe by design:
 *  - System respect: no-ops unless `navigator.vibrate` exists (iOS Safari has
 *    none, so those devices never buzz) and the pattern is always tiny.
 *  - Off switch: the app's `nv_haptics` pref (default ON) — the Settings row
 *    flips it to "0". Vibrate is NEVER required for any action.
 * Wrapped in try/catch so a focus-restricted browser can never break audio. */
function haptic(pattern: number | number[]) {
  try {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    if (localStorage.getItem("nv_haptics") === "0") return;
    if (prefersReducedMotion()) return;
    navigator.vibrate(pattern);
  } catch {
    /* some browsers throw when unfocused — never let that break a sound */
  }
}

/** Rising whoosh — "we're going into the game!" transition sweep. */
export function whooshUp() {
  const c = ensureAudio();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(1180, t + 0.5);
  g.gain.setValueAtTime(Math.max(0.12 * quietLevel * (sfxMuted || kidSfxMuted ? 0 : sfxVolume), 0.0001), t); // #243/#248/#831/#1468 — sfx balance + quiet hours + master/kid SFX mute
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + 0.6);
}

/** Whole-session complete — a full C–E–G–C chord + rising arpeggio + sparkle. */
export function tada() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(f, 0.5, "triangle", MIX.sfxTada));
  [1046.5, 1318.5, 1568.0].forEach((f, i) => tone(f, 0.35, "triangle", MIX.sfxTadaSparkle, 0.18 + i * 0.09));
  tone(2093, 0.7, "sine", MIX.sfxWinSparkle, 0.48);
  haptic([0, 20, 14, 20, 14, 20, 14, 50]); // grand finale — sparkle-pulse
}

/* ────────────────────────────── background music ──────────────────────────────
 * Cheerful, zero-asset chiptune loop. Scheduler ticks ahead 0.9s so notes flow
 * seamlessly. Pentatonic melody + soft bass → never grating, kid-safe volume.
 *
 * #134 — per-LAND ambient music: each of the 5 lands (bands) has its own scale,
 * tempo and volume flavor, all still synthesized (zero asset files, offline
 * friendly). `setMusicTheme(bandId)` swaps the active theme; the next scheduled
 * notes pick it up on the following step (step is monotonic — no bursts).
 */
interface MusicTheme {
  name: string;
  melody: number[];
  melody2: number[];
  bass: number[];
  stepDuration: number; // seconds per eighth note
  vol: number; // melody gain
  bassVol: number;
}

const THEME_BAND1: MusicTheme = {
  name: "sprout-grove",
  melody: [523.25, 587.33, 659.25, 587.33, 523.25, 587.33, 659.25, 783.99], // gentle C pentatonic lullaby
  melody2: [659.25, 587.33, 523.25, 659.25, 783.99, 659.25, 587.33, 523.25],
  bass: [130.81, 130.81, 146.83, 130.81, 110.0, 110.0, 98.0, 110.0],
  stepDuration: 0.42,
  vol: 0.04,
  bassVol: 0.045,
};
const THEME_BAND2: MusicTheme = {
  name: "cottage-fields",
  melody: [523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33], // bouncy C major hop
  melody2: [659.25, 698.46, 783.99, 880.0, 987.77, 880.0, 783.99, 698.46],
  bass: [130.81, 130.81, 146.83, 130.81, 110.0, 110.0, 98.0, 110.0],
  stepDuration: 0.3,
  vol: 0.045,
  bassVol: 0.05,
};
const THEME_BAND3: MusicTheme = {
  name: "river-town",
  melody: [659.25, 783.99, 880.0, 987.77, 880.0, 783.99, 659.25, 587.33], // flowing pentatonic stream
  melody2: [880.0, 783.99, 659.25, 587.33, 659.25, 783.99, 880.0, 987.77],
  bass: [110.0, 110.0, 130.81, 130.81, 146.83, 130.81, 110.0, 98.0],
  stepDuration: 0.26,
  vol: 0.05,
  bassVol: 0.055,
};
const THEME_BAND4: MusicTheme = {
  name: "sky-castle",
  melody: [783.99, 880.0, 1046.5, 1174.66, 1046.5, 880.0, 783.99, 659.25], // airy, high shimmer
  melody2: [1046.5, 1174.66, 1318.5, 1174.66, 1046.5, 880.0, 1046.5, 1318.5],
  bass: [98.0, 98.0, 110.0, 98.0, 130.81, 130.81, 110.0, 98.0],
  stepDuration: 0.22,
  vol: 0.05,
  bassVol: 0.045,
};
const THEME_BAND5: MusicTheme = {
  name: "star-academy",
  melody: [659.25, 783.99, 880.0, 1046.5, 880.0, 1046.5, 1174.66, 1318.5], // confident, upbeat
  melody2: [880.0, 987.77, 1046.5, 1174.66, 1318.5, 1174.66, 1046.5, 987.77],
  bass: [130.81, 130.81, 146.83, 130.81, 164.81, 164.81, 146.83, 130.81],
  stepDuration: 0.19,
  vol: 0.055,
  bassVol: 0.06,
};

const THEME_BAND6: MusicTheme = {
  name: "jungle-canopy",
  melody: [587.33, 659.25, 587.33, 783.99, 880.0, 783.99, 659.25, 587.33], // rhythmic D-pentatonic patter
  melody2: [659.25, 880.0, 987.77, 880.0, 783.99, 659.25, 587.33, 523.25],
  bass: [146.83, 146.83, 130.81, 146.83, 98.0, 98.0, 110.0, 98.0],
  stepDuration: 0.16,
  vol: 0.05,
  bassVol: 0.06,
};
const THEME_BAND7: MusicTheme = {
  name: "polar-peaks",
  melody: [783.99, 1046.5, 1174.66, 1046.5, 880.0, 1046.5, 1174.66, 1318.5], // airy bell chimes over the snow
  melody2: [1318.5, 1174.66, 1046.5, 880.0, 783.99, 880.0, 1046.5, 1174.66],
  bass: [130.81, 130.81, 98.0, 130.81, 87.31, 87.31, 98.0, 87.31],
  stepDuration: 0.34,
  vol: 0.045,
  bassVol: 0.045,
};

export const LAND_THEMES: Record<number, MusicTheme> = {
  1: THEME_BAND1,
  2: THEME_BAND2,
  3: THEME_BAND3,
  4: THEME_BAND4,
  5: THEME_BAND5,
  // #20 — the two new lands keep the per-land-music promise (#134): no new
  // audio assets, just new synth themes.
  6: THEME_BAND6,
  7: THEME_BAND7,
};

let musicTimer: number | null = null;
let musicStep = 0;
let musicOn = false;
// Background music is OFF by default (kids' app — quiet start, parent/child opts in).
// Stored as "0" = on, "1" = off; unset → off (true).
let musicMuted = typeof localStorage !== "undefined" ? localStorage.getItem("nv_music") !== "0" : true;
// #134 — active land theme; defaults to band 2 (Cottage Fields) for the home.
let activeTheme: MusicTheme = THEME_BAND2;

/** True once the user has started a game — we auto-start the background music. */
let musicAutoArmed = false;

/** #134 — switch the ambient music + SFX key to a land's theme (1–5, clamps). */
export function setMusicTheme(bandId: number) {
  activeTheme = LAND_THEMES[bandId] ?? THEME_BAND2;
  // The win chime roots in the land's key so celebration feels "of this land".
  landRoot = { 1: 392.0, 2: 523.25, 3: 587.33, 4: 659.25, 5: 783.99, 6: 587.33, 7: 1046.5 }[bandId] ?? 523.25;
}

export function musicThemeName(): string {
  return activeTheme.name;
}

function musicTick() {
  const c = ensureAudio();
  if (!c || !musicOn || musicMuted) {
    musicTimer = null;
    return;
  }
  const { melody, melody2, bass, stepDuration, vol, bassVol } = activeTheme;
  // Schedule notes until we're 0.9s ahead of the playback clock.
  // `musicStep` is monotonic so the absolute note times always move forward —
  // resetting it would burst notes (scheduling in the past).
  while (musicStep * stepDuration < c.currentTime + 0.9) {
    const i = musicStep;
    const mel = Math.floor(i / 16) % 2 === 0 ? melody : melody2;
    const m = mel[i % mel.length];
    const b = bass[Math.floor(i / 2) % bass.length];
    const at = i * stepDuration - c.currentTime; // delay until the note's absolute time
    // #243 — music notes carry the "music" layer so the parent's music-volume
    // balance scales only the ambient bed (SFX feedback keeps its own knob).
    tone(m, stepDuration * 1.6, "triangle", vol, at + 0.02, "music");
    tone(b, stepDuration * 3, "sine", bassVol, at + 0.02, "music");
    if (i % 8 === 4) tone(m * 2, 0.22, "triangle", vol * 0.4, at, "music");
    musicStep++;
  }
  musicTimer = window.setTimeout(musicTick, 200);
}

/** Start (or keep playing) the background music. Called from a user gesture. */
export function startMusic() {
  const c = ensureAudio();
  if (!c) return;
  musicOn = true;
  musicAutoArmed = true;
  if (musicTimer === null && !musicMuted) {
    musicStep = 0;
    musicTimer = window.setTimeout(musicTick, 100);
  }
}

/** Stop the background music. */
export function stopMusic() {
  musicOn = false;
  musicAutoArmed = false;
  if (musicTimer !== null) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
}

/** Toggle mute (keeps playing internally). Returns the new muted state. */
export function toggleMusicMute(): boolean {
  musicMuted = !musicMuted;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("nv_music", musicMuted ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }
  return musicMuted;
}

/** #1468 — the kid-facing mute is a combined sound+song switch: one tap
 *  silences the background bed AND the SFX feedback layer (pop/bad/win/click).
 *  Returns the new muted state (music and kid SFX always move together). */
export function toggleSoundMute(): boolean {
  const next = !musicMuted;
  musicMuted = next;
  kidSfxMuted = next;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("nv_music", musicMuted ? "1" : "0");
      localStorage.setItem("nv_sfx_kid", kidSfxMuted ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }
  return next;
}

export function isMusicMuted(): boolean {
  return musicMuted;
}

export function isMusicOn(): boolean {
  return musicOn;
}

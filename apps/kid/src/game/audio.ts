/**
 * Shared mobile-safe WebAudio.
 * One context, resumed inside a user gesture (iOS requirement).
 * All sounds are tiny, synthesized, zero-asset — fast + offline-friendly.
 */

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
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.15,
  startDelay = 0
) {
  const c = ensureAudio();
  if (!c) return;
  const t = c.currentTime + startDelay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Play one pitched note at `delay` seconds from now (Counting Song xylophone).
 *  Exported so scenes can schedule melodies (each number = a rising note). */
export function playNote(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.15,
  delay = 0
) {
  tone(freq, dur, type, vol, delay);
}

/** Correct pop — bright, rises a little each pop. */
export function pop() {
  const c = ensureAudio();
  if (!c) return;
  tone(520 + Math.random() * 160, 0.13, "sine", 0.15);
}

/** Round-meter star fills — a tiny, quiet "tick" so progress sounds rewarding. */
export function starPop() {
  tone(1700 + Math.random() * 400, 0.07, "sine", 0.05);
}

/** Combo chime — a rising three-note sparkle as the combo climbs. */
export function comboChime(combo: number) {
  const base = 523.25 + Math.min(combo, 8) * 55;
  [base, base * 1.26, base * 1.5].forEach((f, i) => tone(f, 0.2, "triangle", 0.11, i * 0.055));
}

/** Wrong tap — a gentle, warm "oops" nudge. Wrong answers are learning moments:
 * soft, descending, never alarming. Audible enough that the kid hears the cue,
 * but a warm sine pair — no harsh square-wave buzz. */
export function bad() {
  tone(392, 0.16, "sine", 0.13); // G4 — "uh…"
  tone(311, 0.26, "sine", 0.1, 0.09); // E♭4 — "oh"
}

/** Round complete — C–E–G–C fanfare with a sparkle on top. */
export function win() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.4, "triangle", 0.16, i * 0.1));
  tone(1318.5, 0.6, "sine", 0.08, 0.42);
}

/** Soft UI button tap — DOM navigation buttons (home/worlds/done). */
export function click() {
  tone(660, 0.05, "triangle", 0.08);
  tone(880, 0.06, "triangle", 0.06, 0.02);
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
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + 0.6);
}

/** Whole-session complete — a full C–E–G–C chord + rising arpeggio + sparkle. */
export function tada() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(f, 0.5, "triangle", 0.1));
  [1046.5, 1318.5, 1568.0].forEach((f, i) => tone(f, 0.35, "triangle", 0.12, 0.18 + i * 0.09));
  tone(2093, 0.7, "sine", 0.08, 0.48);
}

/* ────────────────────────────── background music ──────────────────────────────
 * Cheerful, zero-asset chiptune loop. Scheduler ticks ahead 0.8s so notes flow
 * seamlessly. Pentatonic melody + soft bass → never grating, kid-safe volume.
 */
const MELODY = [523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33]; // C D E G A G E D
const MELODY2 = [659.25, 698.46, 783.99, 880.0, 987.77, 880.0, 783.99, 698.46]; // E F G A B A G F
const BASS = [130.81, 130.81, 146.83, 130.81, 110.0, 110.0, 98.0, 110.0]; // C2 C2 D2 C2 A1 A1 G1 A1

let musicTimer: number | null = null;
let musicStep = 0;
let musicOn = false;
// Background music is OFF by default (kids' app — quiet start, parent/child opts in).
// Stored as "0" = on, "1" = off; unset → off (true).
let musicMuted = typeof localStorage !== "undefined" ? localStorage.getItem("nv_music") !== "0" : true;

/** True once the user has started a game — we auto-start the background music. */
let musicAutoArmed = false;

function musicTick() {
  const c = ensureAudio();
  if (!c || !musicOn || musicMuted) {
    musicTimer = null;
    return;
  }
  const stepDuration = 0.28; // ~107 BPM eighth notes
  // Schedule notes until we're 0.9s ahead of the playback clock.
  // `musicStep` is monotonic so the absolute note times always move forward —
  // resetting it would burst notes (scheduling in the past).
  while (musicStep * stepDuration < c.currentTime + 0.9) {
    const i = musicStep;
    const mel = Math.floor(i / 16) % 2 === 0 ? MELODY : MELODY2;
    const m = mel[i % mel.length];
    const b = BASS[Math.floor(i / 2) % BASS.length];
    const at = i * stepDuration - c.currentTime; // delay until the note's absolute time
    tone(m, 0.45, "triangle", 0.045, at + 0.02);
    tone(b, 0.85, "sine", 0.05, at + 0.02);
    if (i % 8 === 4) tone(m * 2, 0.22, "triangle", 0.018, at);
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

export function isMusicMuted(): boolean {
  return musicMuted;
}

export function isMusicOn(): boolean {
  return musicOn;
}

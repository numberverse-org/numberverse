/**
 * Kid-friendly text-to-speech (Web Speech API) — the "read everything aloud"
 * layer. Zero assets, fully offline, language-aware (en / bn).
 *
 * Why: our readers are 2–6. They can't read "Tap the color!" or a sight word
 * yet — so every question, hint, and Nova line should be HEARD, not just seen.
 *
 * DYNAMIC PER PLATFORM — iOS and Android load voices very differently:
 *  · ANDROID (Chrome): Google TTS exposes "Google বাংলা" etc. synchronously
 *    after the first getVoices(). We score Google voices FIRST, and prefer
 *    installed (localService) voices — offline-first.
 *  · iOS (Safari): voices load ASYNCHRONOUSLY (getVoices() is empty until the
 *    `voiceschanged` event). Known Apple voices (Samantha, Rani, Karen…)
 *    score high, downloaded enhanced voices (localService) score highest, and
 *    we avoid the generic "Default" entry. iOS also has a cancel→speak race:
 *    speaking immediately after cancel() can DROP the line, so on iOS we defer
 *    the speak by ~40ms.
 *  · FALLBACK: language matching is gated — we never pick a wrong-language
 *    voice while any match exists. If no matching voice is installed at all,
 *    setting `utterance.lang` still makes the system read in that language.
 *
 * iOS gotchas handled here:
 *  · a FRESH SpeechSynthesisUtterance per call (reusing one silently fails);
 *  · speech unlocks inside a user gesture — games always start from a tap, and
 *    each round is spawned in that same gesture chain, so the first speak rides it;
 *  · short utterances only — we cancel the previous line on every new speak, so
 *    rapid taps never pile up a lagging queue.
 *
 * Kid-tuned voice: a touch SLOWER (0.9), a touch BRIGHTER (1.12 on Apple,
 * capped at 1.05 on Android so Google's voices stay warm, not chipmunk), softer
 * (0.9) — a patient, warm teacher, not a call-centre robot.
 *
 * NOTE: the long-term plan is to record the family's own voices (Elder Girl
 * Voice todo) — until then, synthetic TTS is the stopgap that makes the app
 * talk today. When that recording lands, the bn voice below is where it plugs in.
 */

import { getAppLang } from "./locale";
import { t } from "./i18n";
import { neuralSpeak, neuralCancel, isNeuralReady, neuralStatus, onNeuralReady } from "./neuralVoice";
import { hasUnsafeText } from "./speechSafety";

let voices: SpeechSynthesisVoice[] = [];
/** Monotonic token — only the newest speak() actually plays (rapid-tap safe). */
let speakToken = 0;
/** Last time a real line was spoken or canceled (Date.now). Used to avoid the
 *  WebKit cancel→speak race — see the speak() cancel path below. */
let lastSpeechAt = 0;

/* #1375 — when a device has NO Bangla Web-Speech voice and the on-device neural
 * model is still downloading, the old path silently dropped Bangla lines. Now
 * the LATEST line is held and spoken the moment the neural voice becomes ready
 * (still never a wrong-language voice). */
let pendingBnLine: {
  clean: string;
  opts: SpeakOpts;
  token: number;
  speaker?: number;
  volume: number;
} | null = null;
let neuralReadyUnsub: (() => void) | null = null;

function holdBnLine(clean: string, opts: SpeakOpts, token: number, speaker: number | undefined, volume: number) {
  pendingBnLine = { clean, opts, token, speaker, volume };
  if (!neuralReadyUnsub) neuralReadyUnsub = onNeuralReady(flushPendingBnLine);
}

function flushPendingBnLine() {
  const p = pendingBnLine;
  pendingBnLine = null;
  if (!p || p.token !== speakToken || !isNeuralReady()) return;
  void neuralSpeak(p.clean, { queue: p.opts.cancel === false, volume: p.volume, speaker: p.speaker });
}

/* ─────────────────────────── platform detection ─────────────────────────── */

export type SpeechPlatform = "ios" | "android" | "other";

function detectPlatform(): SpeechPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  // iPadOS 13+ masquerades as a Mac — but touch devices with a full browser.
  if (/Mac|Macintosh/.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1) {
    return "ios";
  }
  if (/Android/.test(ua)) return "android";
  return "other";
}

/* ────────────────────────────── voice store ──────────────────────────────
 * Voices load ASYNC in Chrome + Safari (getVoices() is empty on the first
 * call). speak() must WAIT for them or the right voice is never picked — a
 * Bangla question spoken by a no-voice "Default" is silence on desktop. */

let voicesLoaded = false;
let voicesReady: Promise<void> | null = null;

function refreshVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return voices;
  try {
    const v = window.speechSynthesis.getVoices();
    if (v.length) {
      voices = v;
      voicesLoaded = true;
    }
  } catch {
    /* speech unavailable */
  }
  return voices;
}

/** Resolve once voices are loaded (or after a safety timeout — some browsers
 *  never fire voiceschanged). Safe to call any number of times. */
function waitVoices(): Promise<void> {
  if (!speechAvailable()) return Promise.resolve();
  if (voicesLoaded) return Promise.resolve();
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const check = (): boolean => {
      const got = refreshVoices().length > 0;
      if (got) voicesLoaded = true;
      return got;
    };
    if (!check()) {
      const done = () => {
        window.speechSynthesis.onvoiceschanged = null;
        voicesReady = null;
        resolve();
      };
      window.speechSynthesis.onvoiceschanged = () => {
        if (check()) done();
      };
      // safety — never hang if voices never arrive; mark loaded so every
      // later speak proceeds immediately (it uses u.lang instead of a voice).
      window.setTimeout(() => {
        refreshVoices();
        window.speechSynthesis.onvoiceschanged = null;
        voicesReady = null;
        voicesLoaded = true;
        resolve();
      }, 900);
    } else {
      window.speechSynthesis.onvoiceschanged = null;
      voicesReady = null;
      resolve();
    }
  });
  return voicesReady;
}

/** Score a voice for warmth + language fit + PLATFORM fit.
 *  Higher is better; only same-language voices are ever considered. */
function voiceScore(v: SpeechSynthesisVoice, lang: "en" | "bn", platform: SpeechPlatform): number {
  const L = v.lang.toLowerCase().replace("_", "-");
  const name = v.name.toLowerCase();
  let s = 0;
  // Language match is the base — the pool is already gated, but rank exact
  // regions for polish (and accept Google's bn-IN which it reports even for BD).
  if (lang === "bn") {
    if (L === "bn-bd") s += 8;
    else if (L === "bn-in") s += 4;
  } else if (L === "en-us") {
    s += 6;
  }

  // Offline-first: prefer INSTALLED voices on both platforms (works in airplane
  // mode, no data, no lag). Google voices are usually localService=true.
  if (v.localService) s += 20;

  // Platform personalities.
  if (platform === "android") {
    // Google TTS = the whole point on Android ("Google বাংলা").
    if (name.includes("google")) s += 30;
    if (name.includes("samsung") || name.includes("xiaomi") || name.includes("huawei")) s += 4;
  } else if (platform === "ios") {
    // Known Apple voices read like a warm teacher; avoid the raw "Default".
    if (/samantha|rani|karen|tessa|moira|serena|daniel|siri|hysterical|veena|zoe|kanya/.test(name)) s += 15;
    if (name === "default" && !v.localService) s -= 10;
  }

  // Warm / female voices anywhere — proven to hold kids' attention better.
  if (/female|feminine|woman|girl|samantha|siri|tessa|rani|karen/.test(name)) s += 8;
  // #258 — the parent's per-kid TONE biases which INSTALLED voice wins on the
  // Web-Speech path (the neural Bangla path is handled separately by speaker
  // id): "Friendly male" lifts male-ish names; female/soft lift the female
  // names; kid/any = no extra bias (best available wins).
  if (parentVoiceTone === "warm" && /male|daniel|david|george|alex|john/.test(name)) s += 8;
  if ((parentVoiceTone === "female" || parentVoiceTone === "soft") && /female|feminine|woman|girl|samantha|siri|tessa|rani|karen/.test(name)) s += 8;
  return s;
}

/** Language-gated pick: NEVER a wrong-language voice. If no same-language
 *  voice is installed, return undefined — speak() then sets utterance.lang only
 *  and the platform engine reads in that language (the documented fallback).
 *
 *  WHY: the old "last resort: any voice" fallback scored Google voices +30, so
 *  on devices WITHOUT a Bangla voice (no Google বাংলা pack / desktop Chrome /
 *  non-Bangladesh iPhones) it grabbed "Google Deutsch" — a Bangla question
 *  spoken in German. A wrong-language voice is always worse than none. */
function pickVoice(lang: "en" | "bn", platform: SpeechPlatform): SpeechSynthesisVoice | undefined {
  const list = refreshVoices();
  const tag = lang === "bn" ? "bn" : "en";
  const pool = list.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(tag));
  if (!pool.length) return undefined;
  let best: SpeechSynthesisVoice | undefined;
  let bestScore = -1;
  for (const v of pool) {
    const s = voiceScore(v, lang, platform);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

/* ───────────────────────────── public API ───────────────────────────── */

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/* ─────────────────── iOS / WebKit speech "prime" (unlock) ───────────────────
 * iOS Safari (and an installed PWA, strictest of all) requires the FIRST
 * speechSynthesis.speak() to run SYNCHRONOUSLY inside a user gesture. A
 * deferred speak() — setTimeout, .then(), an async callback — never unlocks
 * the engine, so the app stays silent forever. `resume()` does NOT unlock it;
 * only a real speak() in the gesture does.
 *
 * Fix: ride the very first pointer/touch/click/keydown with a near-silent
 * utterance spoken synchronously in that gesture. That unlocks the engine, and
 * every later programmatic speak (however deferred) plays normally. One-shot
 * (idempotent), so it's a few cheap instructions after the first success.
 *
 * CRITICAL: the prime MUST be a real, non-empty WORD. iOS treats a
 * whitespace-only utterance as empty, SKIPS it, and unlocks nothing — the
 * engine stays muted and the app never talks. A single short word is
 * guaranteed to actually synthesize (the unlock), at volume .001 it's
 * inaudible. */
/**
 * Whether the Web Speech engine is PROVEN unlocked. iOS only starts synthesis
 * when a speak() runs synchronously inside a REAL gesture — and only then does
 * the utterance's `onstart` fire. Until onstart has fired, we are not unlocked
 * and we re-prime on every gesture. This is the same proven-unlock pattern as
 * neuralPrime() (which retries until the <audio> element's play() resolves).
 */
let unlocked = false;

export function primeSpeech() {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth || unlocked) return; // proven — no-op from here on
  try {
    // A real word, not a space — see note above. Short + rate 2 = over fast.
    const warm = new SpeechSynthesisUtterance("hi");
    warm.volume = 0.001;
    warm.rate = 2;
    // onstart fires ONLY when synthesis actually begins → genuine unlock.
    // (A locked iOS engine never starts the warm, so we retry next gesture.)
    warm.onstart = () => {
      unlocked = true;
    };
    warm.onerror = () => {
      /* not ready / superseded — the next gesture retries, cheap */
    };
    synth.speak(warm); // MUST be synchronous inside the gesture
    void refreshVoices(); // on iOS getVoices() populates after the first speak
  } catch {
    /* no engine — the next gesture retries */
  }
}

// Ride EVERY gesture until the engine is proven unlocked (the first one often
// misses — voices not loaded yet, event swallowed, scene switch mid-tap).
// Capture phase, so Phaser/React can't swallow the event. Once `unlocked` is
// set this is a no-op on every subsequent gesture (never interrupts a line).
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  for (const evt of ["pointerdown", "touchstart", "click", "keydown"]) {
    window.addEventListener(evt, () => primeSpeech(), true);
  }
}

/** Stop any in-flight speech (scene change / leaving the game). */
export function cancelSpeech() {
  neuralCancel(); // on-device neural Bangla voice (Piper) — must be stopped too
  if (speechAvailable()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
  }
}

export interface SpeakOpts {
  lang?: "en" | "bn";
  rate?: number;
  pitch?: number;
  /** 0..1 loudness. Default 0.9 (warm). A whisper drops this to ~0.4. */
  volume?: number;
  /** Cancel the previous line first (default true). Set false to QUEUE, e.g.
   *  counting 1,2,3… in order — a queue lets each number be heard in sequence. */
  cancel?: boolean;
}

/**
 * Speak one line with a warm, kid-friendly voice. Language follows the text:
 * Bangla glyphs → Bangla voice (Google বাংলা on Android, Apple's Bangla on
 * iOS); otherwise the app UI language unless overridden. Fire-and-forget.
 */
let speechEnabled = true;

/** Parent control: turn off spoken voice for a kid (Settings → Reading & sound).
 *  Safe to call anytime — a later speak() simply no-ops. */
export function setSpeechEnabled(enabled: boolean) {
  speechEnabled = enabled;
}

export function isSpeechEnabled(): boolean {
  return speechEnabled;
}

/** Expand math/reading symbols into spoken WORDS so the engine reads them
 *  naturally (a bare "50% of 80" would otherwise read "50 of 80" — or the
 *  symbol gets dropped entirely). Language-aware: Bangla kids hear Bangla
 *  words, English kids hear English. Harmless when no symbols are present. */
function naturalize(text: string, lang: "en" | "bn"): string {
  const and = lang === "bn" ? " এবং " : " and ";
  const plus = lang === "bn" ? " যোগ " : " plus ";
  const minus = lang === "bn" ? " বিয়োগ " : " minus ";
  const times = lang === "bn" ? " গুণ " : " times ";
  const over = lang === "bn" ? " ভাগ " : " divided by ";
  const percent = lang === "bn" ? " শতাংশ " : " percent ";
  const equals = lang === "bn" ? " সমান " : " equals ";
  let s = text;
  // A leading minus on a negative number ("-5"/"−5", or "-five") says the
  // full word "minus five" — never leave a bare "-"/"−" that some engines
  // silently skip. Run this BEFORE the operator rules below (the digit-minus-
  // digit rule only ever matches an operator between two numbers).
  s = s.replace(/^\s*[−-]\s*(?=[\dঀ-৿A-Za-z])/u, minus);
  // multiplication X-cross symbols (before the emoji strip catches them)
  s = s.replace(/[✕✖]/gu, times);
  // math operators → words
  s = s.replace(/×/gu, times);
  s = s.replace(/÷/gu, over);
  s = s.replace(/%/gu, percent);
  s = s.replace(/−/gu, minus); // unicode minus
  s = s.replace(/(\d)\s*-\s*(?=\d)/gu, (_m, d: string) => d + minus); // 5-3 → five minus three
  s = s.replace(/\+/gu, plus);
  s = s.replace(/=/gu, equals);
  s = s.replace(/&/gu, and);
  return s;
}

/* ─────────── 🗣️ #381 Bangla pronunciation normalizer ─────────────────────
 * The Bangla Piper voice (espeak-ng phonemizer) reads Bangla script fluently
 * but garbles anything Latin — kid names, "Nova", "Moni", game titles and
 * Western digits all come out as weird English-ish noise. Before synthesis we
 *  (1) expand digit runs to Bangla number words,
 *  (2) swap known app vocabulary for its real Bangla spelling, and
 *  (3) transliterate any leftover Latin word into Bengali syllables so the
 *      voice pronounces it the way a Bangla speaker would. */

const BN_APP_WORDS: Array<[RegExp, string]> = [
  [/Nova/gi, "নোভা"],
  [/Moni/gi, "মনি"],
  [/Google/gi, "গুগল"],
  [/YouTube/gi, "ইউটিউব"],
  [/English/gi, "ইংরেজি"],
];

// Roman letters → Bengali. Two-letter keys are read before single letters so
// digraphs ("ch","sh","th"…) come out as one Bengali sound instead of two.
const BN_C = new Map<string, string>([
  ["ch", "চ"], ["sh", "শ"], ["th", "থ"], ["ph", "ফ"], ["bh", "ভ"],
  ["dh", "ধ"], ["gh", "ঘ"], ["kh", "খ"], ["jh", "ঝ"], ["ck", "ক"],
  ["wa", "ওয়া"], ["wi", "ওয়ি"], ["we", "ওয়ে"], ["wo", "ও"], ["wu", "ও"],
  ["ya", "য়া"], ["yi", "য়ি"], ["ye", "য়ে"], ["yo", "য়ো"], ["yu", "য়ু"],
  ["aa", "আ"], ["ee", "ঈ"], ["ii", "ঈ"], ["oo", "ঊ"],
  ["b", "ব"], ["c", "ক"], ["d", "ড"], ["f", "ফ"], ["g", "গ"],
  ["h", "হ"], ["j", "জ"], ["k", "ক"], ["l", "ল"], ["m", "ম"],
  ["n", "ন"], ["p", "প"], ["q", "ক"], ["r", "র"], ["s", "স"],
  ["t", "ট"], ["v", "ভ"], ["w", "ও"], ["x", "ক্স"], ["y", "য়"],
  ["z", "জ"],
]);
const BN_V_FULL: Record<string, string> = { a: "আ", e: "এ", i: "ই", o: "ও", u: "উ" };
const BN_V_MATRA: Record<string, string> = { a: "া", e: "ে", i: "ি", o: "ো", u: "ু" };
// Long/doubled vowel pairs attach to a preceding consonant as one matra:
// "Neel"→নীল, "Saad"→সাড, "Moon"→মুন. (Standalone they still work as full
// vowels via the digraph table above: "ee"→ঈ, "oo"→ঊ, "aa"→আ.)
const BN_LONG_MATRA: Record<string, string> = { ee: "ী", ii: "ী", oo: "ু", aa: "া" };

/** A Bengali vowel-matra (া ি ী ু ূ ে ৈ ো ৌ) ends a syllable — a consonant
 *  character that already carries one must NOT get a halant tacked on. */
const BN_MATRA_RE = /[া-ৌ]$/u;

/** Say a bare Latin word with Bengali phonemes: consonant + vowel folds into
 *  consonant + vowel-matra, isolated vowels become full vowel letters, and a
 *  word-final consonant gets a halant (stripped so words don't end on a dead
 *  syllable). Reads common names the Bangla way — "Mita"→মিটা, "Rahim"→রাহিম,
 *  "Nova"→নোভা, "Wali"→ওয়ালি, "Shyam"→শ্যাম. Unknown letters are kept as-is so
 *  we never drop a name's letters. */
function bnTransliterate(raw: string): string {
  const w = raw.toLowerCase();
  if (!/^[a-z]+$/.test(w)) return raw;
  let out = "";
  let i = 0;
  let prevVowel = false;
  while (i < w.length) {
    const two = w.slice(i, i + 2);
    if (BN_C.has(two)) {
      const c = BN_C.get(two)!;
      const after = w[i + 2];
      if (after !== undefined && BN_V_MATRA[after] !== undefined) {
        out += c + BN_V_MATRA[after]; // digraph + vowel → attach its matra
        i += 3;
      } else if (!BN_MATRA_RE.test(c)) {
        out += c + "্"; // dead consonant (cluster / word edge)
        i += 2;
      } else {
        out += c; // value already ends in a vowel-matra ("য়া", "ওয়া", "ী"…)
        i += 2;
      }
      prevVowel = false;
      continue;
    }
    const one = w[i];
    if (BN_C.has(one)) {
      const c = BN_C.get(one)!;
      const next = w[i + 1];
      const pair = w.slice(i + 1, i + 3);
      if (BN_LONG_MATRA[pair] !== undefined) {
        out += c + BN_LONG_MATRA[pair]; // "Neel"→নী, "Moon"→মু …
        i += 3;
      } else if (next !== undefined && BN_V_MATRA[next] !== undefined) {
        out += c + BN_V_MATRA[next];
        i += 2;
      } else {
        out += c + "্";
        i += 1;
      }
      prevVowel = false;
      continue;
    }
    if (BN_V_MATRA[one] !== undefined) {
      out += BN_V_FULL[one]; // word-start / after another vowel
      prevVowel = true;
      i += 1;
      continue;
    }
    out += one;
    i += 1;
  }
  // A word never ends on a lone halant — drop it (Rahim্ → Rahim).
  return out.replace(/্$/u, "");
}

/** Bangla number words for one digit RUN inside text ("25"→"পঁচিশ"). Decimals
 *  say "দশমিক" ("2.5"→"দুই দশমিক পাঁচ") instead of reading a bare dot. */
function bnDigitRun(m: string): string {
  const [w, f] = m.split(".");
  let s = bnNumber(parseInt(w, 10));
  if (f) s += " দশমিক " + f.split("").map((d) => BN0[parseInt(d, 10)]).join(" ");
  return s;
}

/** Full Bangla text normalizer for speech (#381). Runs only on Bangla text —
 *  the glyphs the kid actually hears. Idempotent enough to be safe on lines
 *  that already contain Bangla number words (no digits left to touch). */
function bnNormalize(text: string): string {
  let s = text;
  // 1) Western digits → Bangla number words.
  s = s.replace(/\d+(?:\.\d+)?/g, bnDigitRun);
  // 2) Known app vocabulary → exact Bangla spelling (before Latin fallback).
  for (const [re, bn] of BN_APP_WORDS) s = s.replace(re, bn);
  // 3) Any remaining Latin word → Bengali-syllable pronunciation. Apostrophes
  //    ("Moni's") are split so each piece is read separately.
  s = s.replace(/[A-Za-z]{1,12}(?:['’][A-Za-z]{1,12})?/g, (w) =>
    /['’]/.test(w) ? w.split(/['’]/).map(bnTransliterate).join(" ") : bnTransliterate(w)
  );
  // Collapse any double spaces left by the swaps.
  return s.replace(/\s+/g, " ").trim();
}

/* #288 — kid voice fun: a device-local volume preference (Soft / Normal /
 * Loud) that applies to EVERY spoken line on BOTH engines (web + neural).
 * Soft = 0.55, Normal = 0.9 (the app default), Loud = 1.0. Zero-config reset. */
const VOICE_FUN_VOL_KEY = "nv_voice_fun_vol";
const VOICE_FUN_VOLUMES = [0.55, 0.9, 1.0] as const;
export function getVoiceFunVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOICE_FUN_VOL_KEY));
    return (VOICE_FUN_VOLUMES as readonly number[]).includes(v) ? v : 0.9;
  } catch {
    return 0.9;
  }
}
export function setVoiceFunVolume(v: number): void {
  try {
    localStorage.setItem(VOICE_FUN_VOL_KEY, String(v));
  } catch {
    /* storage unavailable — the default (Normal) stays active */
  }
}
export function resetVoiceFunVolume(): void {
  try {
    localStorage.removeItem(VOICE_FUN_VOL_KEY);
  } catch {
    /* noop */
  }
}

/* #243 — per-kid voice balance set by the parent portal. Scales every spoken
 * line on BOTH engines (web + neural) on top of the kid's own Soft/Normal/Loud
 * preference (and any caller override). Default 1.0 = full volume. */
let parentVoiceVolume = 1;
export function setVoiceBalance(v: number) {
  parentVoiceVolume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
}
// #248 — quiet-hours multiplier (1 = normal). Scales every spoken line on top
// of the parent balance during a quiet window; the moon-badge tap raises it
// back to 1 for the session (play is never hard-blocked).
let quietLevel = 1;
export function setQuietLevel(v: number) {
  quietLevel = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
}

/* #258 — per-kid VOICE preference set by the parent portal. The TONE picks
 * which neural Bangla speaker reads (and biases Web Speech's gender on the
 * English path); the SPEED scales every Web-Speech line (the neural model's
 * tempo is baked in — length_scale 1.0 — so it only ever scales the web path).
 * null/null = this device's own warm-female voice at normal speed. */
export type VoiceTone = "female" | "kid" | "soft" | "warm" | null;
/** Stable tone handle → neural Piper speaker id (mirrors NEURAL_VOICES). */
const TONE_SPEAKER: Record<"female" | "kid" | "soft" | "warm", number> = {
  female: 11,
  kid: 12,
  soft: 3,
  warm: 7,
};
let parentVoiceTone: "female" | "kid" | "soft" | "warm" | null = null;
/** Accepts any string (settings arrive as JSON); unknown/null → the device's
 *  own default warm-female, never a wrong tone. */
export function setVoiceTone(tone: string | null) {
  parentVoiceTone = tone === "female" || tone === "kid" || tone === "soft" || tone === "warm" ? tone : null;
}
let parentVoiceRate = 1; // multiplier, 1 = normal speed
export function setVoiceSpeed(rate: number | null | undefined) {
  parentVoiceRate = Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate as number)) : 1;
}

export function speak(text: string, opts: SpeakOpts = {}) {
  if (!speechEnabled) return;
  const raw = String(text);
  // Detect the language FIRST (Bangla glyphs → Bangla) — symbol words follow it.
  const bnLike = /[ঀ-৿]/.test(raw);
  // Speech supports en/bn today; any future locale code (ar, hi…) falls back to
  // en until its voice lands — the speech layer never receives an unsupported
  // code (#131).
  const appLang = getAppLang() === "bn" ? "bn" : "en";
  const lang = opts.lang ?? (bnLike ? "bn" : appLang);
  // #288 — kid voice fun: a device-local volume preference (Soft/Normal/Loud)
  // applies to EVERY line on BOTH engines unless a caller overrides volume.
  // #243 — the parent's per-kid voice balance scales on top of that.
  // #248 — quiet hours scale on top of BOTH (softest overall).
  const vol = (opts.volume ?? getVoiceFunVolume()) * parentVoiceVolume * quietLevel;
  // Symbols → words, then never speak pure emoji / whitespace.
  let clean = naturalize(raw, lang)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return;
  // #901 — runtime content-safety backstop: `speak()` is fed dynamic text
  // (kid names, interpolated skill titles) that no static gate can see, so
  // refuse to synthesize an unsafe line. English words are checked before the
  // Bangla normalizer transliterates them out of the Latin alphabet.
  if (hasUnsafeText(clean, "en")) return;
  // 🗣️ #381 — Bangla pronunciation: the neural phonemizer (espeak-ng) only
  // reads Bangla script well. Latin words (Nova, Moni, kid names, game names)
  // and Western digits come out garbled. Normalize BEFORE synthesis so the
  // voice always says clear Bangla words.
  if (lang === "bn") {
    clean = bnNormalize(clean);
    if (hasUnsafeText(clean, "bn")) return;
  }

  // Only the LATEST speak wins (except queue mode) — stale deferred speaks
  // from a previous question are skipped, so rapid taps never stack.
  const token = ++speakToken;
  // A newer line supersedes any held no-bn-voice line (latest-wins across both
  // the web and neural engines).
  pendingBnLine = null;

  // Bangla → the ON-DEVICE neural voice (Piper VITS) whenever it's ready: the
  // SAME warm Bengali voice on every device, fully offline, and zero risk of a
  // wrong-language voice (the old German bug). If neural can't actually play
  // (iOS audio element still locked, synth error, worker hiccup), we FALL BACK
  // to Web Speech for that line — Bangla is never silent.
  //
  // FALL BACK ONLY ON A GENUINE "failed" — a "superseded" outcome means a NEWER
  // line already took over (another neuralSpeak — a rapid second question, or
  // the voice-picker preview — or webSpeak's neuralCancel on a newer web line).
  // Falling back then makes the OLD line speak on Web Speech WHILE the new line
  // speaks on neural → the both-voices-at-once bug. "superseded" must stay silent.
  // #258 — the parent's per-kid TONE picks WHICH neural speaker reads (the
  // portal tone overrides this device's own picker; null = the device choice).
  const toneSpk = parentVoiceTone ? TONE_SPEAKER[parentVoiceTone] : undefined;
  if (lang === "bn" && isNeuralReady()) {
    void neuralSpeak(clean, { queue: opts.cancel === false, volume: vol, speaker: toneSpk }).then(
      (outcome) => {
        if (outcome === "failed" && token === speakToken) webSpeak(clean, lang, opts, token);
      },
      () => {
        // Defensive — neuralSpeak never rejects today, but if it ever does,
        // treat it as a genuine failure (never a double-speak source).
        if (token === speakToken) webSpeak(clean, lang, opts, token);
      }
    );
    return;
  }

  webSpeak(clean, lang, opts, token);
}

/** The Web Speech path — voices load async, so it waits for them; keeps the
 *  latest-wins token so stale deferred speaks never stack. Used directly for
 *  English + pre-neural Bangla, and as the FALLBACK when neural can't play. */
function webSpeak(clean: string, lang: "en" | "bn", opts: SpeakOpts, token: number) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return;
  const doSpeak = () => {
    if (token !== speakToken) return;
    const platform = detectPlatform();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang === "bn" ? "bn-BD" : "en-US";
    const v = pickVoice(lang, platform);
    if (v) u.voice = v;
    else if (lang === "bn") {
      // 🗣️ #387 — NEVER read Bengali script with a non-Bangla voice. On a
      // device with NO Bangla voice (desktop Chrome, a phone without the bn
      // TTS pack), the engine reads Bengali with its DEFAULT (English) voice
      // → exactly the "speaks like latin, not bengali" sound users report.
      // A wrong-language voice is always worse than a short wait.
      // #1375 — while the on-device neural voice is still downloading, HOLD
      // the latest line and speak it the moment the model is ready instead of
      // dropping it into silence. If neural is already ready and still failed
      // (e.g. iOS audio locked), keep the old drop rather than loop forever.
      if (!isNeuralReady()) {
        const toneSpk = parentVoiceTone ? TONE_SPEAKER[parentVoiceTone] : undefined;
        holdBnLine(
          clean,
          opts,
          token,
          toneSpk,
          (opts.volume ?? getVoiceFunVolume()) * parentVoiceVolume * quietLevel
        );
      }
      return;
    }
    // Cross-engine latest-wins: if a neural Bangla line is still playing or
    // synthesizing, cut it — the newest line wins across BOTH engines.
    neuralCancel();
    primeSpeech(); // no-op once proven unlocked — safety if we're inside a gesture
    try {
      // #258 — the parent's per-kid SPEED scales the Web-Speech rate on top of
      // the app's warm 0.9 base (caller overrides like math still keep theirs).
      u.rate = (opts.rate ?? 0.9) * parentVoiceRate; // a touch slower — small ears
      // Brighter than adult speech, but capped on Android so Google's voices
      // stay warm instead of chipmunk; Apple's voices take the higher pitch.
      u.pitch = opts.pitch ?? (platform === "android" ? 1.05 : 1.12);
      u.volume = (opts.volume ?? getVoiceFunVolume()) * parentVoiceVolume * quietLevel; // #288 pref · #243 balance · #248 quiet
      synth.resume?.(); // some Android builds pause after idle
      if (opts.cancel !== false) {
        // WebKit/Chrome cancel→speak race: a speak() called immediately after
        // cancel() is silently DROPPED. Two rules make the FIRST line (and
        // every spaced line) reliable:
        //  1. Only cancel when something recently played. The very first real
        //     line right after the prime needs NO cancel — skipping it is what
        //     lets iOS play it at all.
        //  2. When we DO cancel, defer longer on iOS (it drops speaks that
        //     follow cancel by ~50ms; 120ms clears the race).
        const now = Date.now();
        const recentlySpoke = now - lastSpeechAt < 800;
        if (recentlySpoke) {
          synth.cancel(); // one voice at a time, no lagging queue
          const delay = platform === "ios" ? 120 : 50;
          window.setTimeout(() => {
            if (token !== speakToken) return;
            try {
              synth.speak(u);
            } catch {
              /* noop */
            }
          }, delay);
        } else {
          try {
            synth.speak(u);
          } catch {
            /* noop */
          }
        }
        lastSpeechAt = now;
        return;
      }
      synth.speak(u); // queue mode (counting 1,2,3…)
      lastSpeechAt = Date.now();
    } catch {
      /* speech unavailable */
    }
  };
  // Voices load async — wait for them so the RIGHT voice is picked. If we
  // speak before they arrive, the system default may be silent for the text.
  if (speechAvailable() && !voicesLoaded) {
    void waitVoices().then(doSpeak);
  } else {
    doSpeak();
  }
}

/** Live diagnostic for the parent panel — shows what THIS device actually has. */
export interface SpeechStatus {
  available: boolean;
  platform: SpeechPlatform;
  /** Total installed voices exposed by the browser. */
  voiceCount: number;
  /** Bangla voice names (empty → no Bangla voice installed). */
  bnVoices: string[];
  /** English voice names. */
  enVoices: string[];
  /** The exact Bangla voice the app would pick right now (undefined → none). */
  bnPick?: string;
  /** The exact English voice the app would pick right now. */
  enPick?: string;
  /** True when the best Android voice ("Google বাংলা") is installed. */
  googleBn: boolean;
  /** True on https / localhost — some browsers gate TTS outside secure contexts
   *  (testing over a network IP http://192.168.x.x may be silent because of this). */
  secureContext: boolean;
  /** On-device neural Bangla voice (Piper VITS) status — when `neural.ready`,
   *  Bangla is spoken by the same neural voice on every device, offline. */
  neural: {
    supported: boolean;
    state: "idle" | "loading" | "ready" | "error";
    progress: number;
    ready: boolean;
    error?: string;
    /** Per-line WAV cache meter (on-device) — synth hit rate across sessions. */
    cache?: { hits: number; misses: number; hitRate: number };
  };
}

export function speechStatus(): SpeechStatus {
  const available = speechAvailable();
  const platform = detectPlatform();
  const list = available ? refreshVoices() : [];
  const bnVoices = list.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("bn")).map((v) => v.name);
  const enVoices = list.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("en")).map((v) => v.name);
  const bnPick = available ? pickVoice("bn", platform)?.name : undefined;
  const enPick = available ? pickVoice("en", platform)?.name : undefined;
  return {
    available,
    platform,
    voiceCount: list.length,
    bnVoices,
    enVoices,
    bnPick,
    enPick,
    googleBn: bnVoices.some((n) => n.toLowerCase().includes("google")),
    secureContext: typeof window !== "undefined" && (window.isSecureContext ?? false),
    neural: neuralStatus(),
  };
}

/** Compact readiness probe for the app's "TTS check on each run" chip. */
export interface SpeechReadiness {
  available: boolean;
  voiceCount: number;
  bnVoices: number;
  bnPick?: string;
  enPick?: string;
}

export function speechReadiness(): SpeechReadiness {
  const st = speechStatus();
  return {
    available: st.available,
    voiceCount: st.voiceCount,
    bnVoices: st.bnVoices.length,
    bnPick: st.bnPick,
    enPick: st.enPick,
  };
}

/* ──────────────────────── Bangla number → word (for math) ────────────────────────
 * Google বাংলা reads "৪ + ২" awkwardly ("four two"). Kids learning to count
 * deserve REAL Bangla number words, so we say "চার যোগ দুই". Standard Bengali
 * numerals for 0–9999 (and লাখ/কোটি for bigger place-value numbers). */
const BN0 = ["শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়"];
const BN_TEEN = ["দশ", "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোল", "সতেরো", "আঠারো", "উনিশ"];
const BN_TENS: Record<number, string[]> = {
  2: ["বিশ", "একুশ", "বাইশ", "তেইশ", "চব্বিশ", "পঁচিশ", "ছাব্বিশ", "সাতাশ", "আঠাশ", "ঊনত্রিশ"],
  3: ["ত্রিশ", "একত্রিশ", "বত্রিশ", "তেত্রিশ", "চৌত্রিশ", "পঁয়ত্রিশ", "ছত্রিশ", "সাঁইত্রিশ", "আটত্রিশ", "ঊনচল্লিশ"],
  4: ["চল্লিশ", "একচল্লিশ", "বিয়াল্লিশ", "তেতাল্লিশ", "চুয়াল্লিশ", "পঁয়তাল্লিশ", "ছেচল্লিশ", "সাতচল্লিশ", "আটচল্লিশ", "ঊনপঞ্চাশ"],
  5: ["পঞ্চাশ", "একান্ন", "বাহান্ন", "তিপ্পান্ন", "চুয়ান্ন", "পঞ্চান্ন", "ছাপ্পান্ন", "সাতান্ন", "আটান্ন", "ঊনষাট"],
  6: ["ষাট", "একষট্টি", "বাষট্টি", "তেষট্টি", "চৌষট্টি", "পঁয়ষট্টি", "ছেষট্টি", "সাতষট্টি", "আটষট্টি", "ঊনসত্তর"],
  7: ["সত্তর", "একাত্তর", "বাহাত্তর", "তিয়াত্তর", "চুয়াত্তর", "পঁচাত্তর", "ছিয়াত্তর", "সাতাত্তর", "আটাত্তর", "ঊনআশি"],
  8: ["আশি", "একাশি", "বিরাশি", "তিরাশি", "চুরাশি", "পঁচাশি", "ছিয়াশি", "সাতাশি", "আটাশি", "ঊননব্বই"],
  9: ["নব্বই", "একানব্বই", "বিরানব্বই", "তিরানব্বই", "চুরানব্বই", "পঁচানব্বই", "ছিয়ানব্বই", "সাতানব্বই", "আটানব্বই", "নিরানব্বই"],
};

/** Standard Bangla words for 0 ≤ n ≤ 99,999,999 (কোটি/লাখ/হাজার grouping). */
export function bnNumber(n: number): string {
  const abs = Math.floor(Math.abs(n));
  if (abs === 0) return BN0[0];
  const part = (x: number): string => {
    if (x === 0) return "";
    const hun = Math.floor(x / 100);
    let s = "";
    if (hun > 0) s += (hun === 1 ? "একশ" : BN0[hun] + "শ") + " ";
    const r = x % 100;
    if (r >= 20) {
      s += BN_TENS[Math.floor(r / 10)][r % 10];
    } else if (r >= 10) {
      s += BN_TEEN[r - 10];
    } else if (r > 0) {
      s += BN0[r];
    }
    return s.trim();
  };
  let out = "";
  let x = abs;
  if (x >= 10000000) {
    out += part(Math.floor(x / 10000000)) + " কোটি ";
    x %= 10000000;
  }
  if (x >= 100000) {
    out += part(Math.floor(x / 100000)) + " লাখ ";
    x %= 100000;
  }
  if (x >= 1000) {
    out += part(Math.floor(x / 1000)) + " হাজার ";
    x %= 1000;
  }
  out += part(x);
  return out.trim();
}

/** Spoken math questions in the app's CURRENT language (Bangla kids hear
 *  Bangla math, English kids hear English). The Bangla side uses real number
 *  words so Google বাংলা reads it like a teacher would say it.
 *
 *  Every phrase is a full QUESTION ("What is 3 plus 4?" / "তিন যোগ দুই কত?") —
 *  the engine reads it with rising, curious intonation instead of a flat
 *  command, which kids naturally respond to. We deliberately say the numbers
 *  and the operation but STOP before the answer. */
export type MathOp = "add" | "sub" | "mul" | "div" | "pct" | "bonds";

/** English number words (0–99) so math is HEARD as words, not digits —
 *  "The answer is two" (not a bare "2" some voices read as "to"). */
const EN0 = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const EN_TEEN = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
export function enNumber(n: number): string {
  const abs = Math.floor(Math.abs(n));
  if (abs < 10) return EN0[abs];
  if (abs < 20) return EN_TEEN[abs - 10];
  const t = Math.floor(abs / 10);
  const o = abs % 10;
  return o === 0 ? EN_TENS[t] : `${EN_TENS[t]} ${EN0[o]}`;
}

/** Speak a revealed ANSWER as a WORD in the app's language. Numbers become
 *  number-words ("The answer is two"/"উত্তর হলো দুই"); letters stay letters.
 *  This kills the "TTS says a wrong digit" confusion kids hit on bare digits. */
export function speakAnswer(label: string | number) {
  const bn = getAppLang() === "bn";
  const s = String(label);
  const word = /^-?\d+$/.test(s) ? (bn ? bnNumber(Number(s)) : enNumber(Number(s))) : s;
  speak(t("answerIsWord", { label: word }), { rate: 0.9 });
}

export function speakMath(op: MathOp, a: number, b: number, opts: SpeakOpts & { concrete?: boolean } = {}) {
  const bn = getAppLang() === "bn";
  const concrete = opts.concrete ?? false;
  const { concrete: _c, ...rest } = opts;
  const x = bn ? bnNumber(a) : String(a);
  const y = bn ? bnNumber(b) : String(b);
  // ALL question phrasing lives in the central i18n table (i18n.ts) — one
  // place holds every en/bn line, so the spoken words always match the UI.
  const key =
    concrete && op === "add" ? "qConcreteAdd" :
    concrete && op === "sub" ? "qConcreteSub" :
    op === "add" ? "qAdd" :
    op === "sub" ? "qSub" :
    op === "mul" ? "qMul" :
    op === "div" ? "qDiv" :
    op === "pct" ? "qPct" :
    "qBonds"; // bonds
  speak(t(key, { a, b, x, y }), { lang: bn ? "bn" : "en", ...rest });
}

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
import { neuralSpeak, neuralCancel, isNeuralReady, neuralStatus } from "./neuralVoice";

let voices: SpeechSynthesisVoice[] = [];
/** Monotonic token — only the newest speak() actually plays (rapid-tap safe). */
let speakToken = 0;
/** Last time a real line was spoken or canceled (Date.now). Used to avoid the
 *  WebKit cancel→speak race — see the speak() cancel path below. */
let lastSpeechAt = 0;

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

export function speak(text: string, opts: SpeakOpts = {}) {
  if (!speechEnabled) return;
  const raw = String(text);
  // Detect the language FIRST (Bangla glyphs → Bangla) — symbol words follow it.
  const bnLike = /[ঀ-৿]/.test(raw);
  const lang = opts.lang ?? (bnLike ? "bn" : getAppLang());
  // Symbols → words, then never speak pure emoji / whitespace.
  const clean = naturalize(raw, lang)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return;

  // Only the LATEST speak wins (except queue mode) — stale deferred speaks
  // from a previous question are skipped, so rapid taps never stack.
  const token = ++speakToken;

  // Bangla → the ON-DEVICE neural voice (Piper VITS) whenever it's ready: the
  // SAME warm Bengali voice on every device, fully offline, and zero risk of a
  // wrong-language voice (the old German bug). If neural can't actually play
  // (iOS audio element still locked, synth error, worker hiccup), we FALL BACK
  // to Web Speech for that line — Bangla is never silent.
  if (lang === "bn" && isNeuralReady()) {
    void neuralSpeak(clean, { queue: opts.cancel === false, volume: opts.volume ?? 0.9 }).then(
      (played) => {
        if (!played && token === speakToken) webSpeak(clean, lang, opts, token);
      },
      () => {
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
    // Cross-engine latest-wins: if a neural Bangla line is still playing or
    // synthesizing, cut it — the newest line wins across BOTH engines.
    neuralCancel();
    primeSpeech(); // no-op once proven unlocked — safety if we're inside a gesture
    try {
      const platform = detectPlatform();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = lang === "bn" ? "bn-BD" : "en-US";
      const v = pickVoice(lang, platform);
      if (v) u.voice = v;
      u.rate = opts.rate ?? 0.9; // a touch slower — small ears
      // Brighter than adult speech, but capped on Android so Google's voices
      // stay warm instead of chipmunk; Apple's voices take the higher pitch.
      u.pitch = opts.pitch ?? (platform === "android" ? 1.05 : 1.12);
      u.volume = opts.volume ?? 0.9; // warm, never shouty — unless asked (funny voices)
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

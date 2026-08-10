/**
 * On-device neural Bangla voice — Piper VITS running ENTIRELY in a Web Worker
 * (espeak-ng WASM phonemizer + onnxruntime-web). The model + runtime are baked
 * into the nginx image at deploy time (infra/deploy/scripts/fetch_voice_assets.sh)
 * and served from /voice/, then runtime-cached by the service worker → fully
 * offline after one download.
 *
 * WHY THIS EXISTS: Web Speech's Bangla voice is a per-device lottery — most
 * devices have NO Bangla voice at all, and the old "any voice" fallback once
 * spoke Bangla questions in German. Piper gives every device the SAME warm
 * Bengali neural voice, 100% on-device, and nothing ever leaves the device
 * (privacy is the moat).
 *
 * ARCHITECTURE:
 *  · piper_worker.js (classic worker, single-threaded — no COOP/COEP/
 *    SharedArrayBuffer needed) fetches phonemizer + ORT + model via XHR,
 *    synthesizes WAV, posts it back as a Blob.
 *  · This module is the MAIN-THREAD half: worker lifecycle, blob cache (the
 *    20MB int8 model downloads once per session), latest-wins + queue semantics
 *    mirroring speech.ts, and playback through ONE shared <audio> element
 *    (which iOS unlocks on the first user gesture).
 *  · Web Speech remains the fallback until the model is ready (or for English).
 *
 * NOTE: rate/pitch are baked into the model (length_scale 1.0) — the neural
 * voice always speaks at its natural teacher pace. volume still applies.
 */

const BASE = "/voice/";
// Cache-busting query — the service worker runtime-caches /voice/ CacheFirst for
// 6 MONTHS. If we ever change a worker/model file at the same URL, old installs
// keep serving the stale bytes until the cache expires. Bump this version to
// force every client onto fresh bytes after a voice deploy.
const VOICE_V = "v2";
const PHON_JS = BASE + "piper_phonemize.js";
const PHON_WASM = BASE + "piper_phonemize.wasm";
const PHON_DATA = BASE + "piper_phonemize.data";
const WORKER_JS = BASE + "piper_worker.js?v=" + VOICE_V;
const MODEL = BASE + "bn_BD-google-medium.onnx?v=" + VOICE_V;
const MODEL_JSON = BASE + "bn_BD-google-medium.onnx.json";
const ORT_BASE = BASE + "onnx/";

/** Near-silent 8ms WAV — played synchronously inside the first user gesture to
 *  unlock the shared <audio> element for later programmatic plays (iOS strictest). */
const SILENT_WAV = "data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAAAA";

/* ─────────────────────────── worker message types ─────────────────────────── */

interface FetchMsg { kind: "fetch"; id: number; url: string; blob?: Blob; total?: number; loaded?: number; }
interface OutputMsg { kind: "output"; input: string; file: Blob; duration: number; }
interface StderrMsg { kind: "stderr"; message: string; }
type WorkerMsg = FetchMsg | OutputMsg | StderrMsg;

/* ────────────────────────────────── state ────────────────────────────────── */

let worker: Worker | null = null;
let state: "idle" | "loading" | "ready" | "error" = "idle";
let errorMsg = "";
/** Blob cache — passed back to the worker on every init so the 20MB int8 model (and
 *  every other asset) downloads exactly once per session. */
let blobs: Record<string, Blob> = {};
/** Monotonic token — only the newest neuralSpeak actually plays (rapid-tap safe). */
let synthToken = 0;
/** One shared <audio> element — iOS unlocks THE element in the first gesture,
 *  then it plays programmatically forever after. */
let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;
let currentPlayResolve: ((ok: boolean) => void) | null = null;
/** Chain for queue mode (counting 1,2,3…): each queued synth waits its turn. */
let queueChain: Promise<boolean> = Promise.resolve(true);
/** Chain so worker jobs serialize (the worker runs one init at a time). */
let jobChain: Promise<void> = Promise.resolve();
let preloadStarted = false;
let gestured = false;

/** The big files, by byte size — used for a coarse overall download progress.
 *  The model is the ~20MB int8 build (weight-only QDQ, see Dockerfile.web's
 *  `voice` stage / infra/deploy/scripts/quantize_voice.py). */
const MODEL_BYTES = 20_000_000;
const BIG: Array<[string, number]> = [
  [PHON_DATA, 18_077_249],
  [ORT_BASE + "ort-wasm-simd.wasm", 10_549_605],
  [MODEL, MODEL_BYTES],
];
const totalBigBytes = BIG.reduce((s, [, n]) => s + n, 0);
let urlLoaded: Record<string, number> = {};
let progress = 0;

/* ────────────────────────────── worker client ────────────────────────────── */

function supported(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(WORKER_JS);
    worker.addEventListener("message", onMessage);
    // A worker crash (uncaught exception, OOM, etc.) must surface as an error
    // state — not eternal silence with a forever-"loading" download banner.
    worker.addEventListener("error", (e) => {
      const msg = e?.message || "voice worker crashed";
      console.error("[neuralVoice] worker error:", msg);
      failNeural(msg);
    });
  }
  return worker;
}

/** Per-synth watchdog: if the worker goes silent (no output AND no fetch
 *  progress) for too long, kill it and reject so speech.ts falls back to Web
 *  Speech instead of hanging the app on a dead voice. */
let watchInterval: ReturnType<typeof setInterval> | null = null;
let watchDeadline = 0;
let watchTimeout: (() => void) | null = null;
function armWatchdog(ms: number, onTimeout: () => void) {
  watchDeadline = Date.now() + ms;
  watchTimeout = onTimeout;
  if (watchInterval) clearInterval(watchInterval);
  watchInterval = setInterval(() => {
    if (watchDeadline && Date.now() >= watchDeadline) {
      console.error("[neuralVoice] watchdog: synth stalled — killing worker");
      const w = worker;
      worker = null;
      try { w?.terminate(); } catch { /* noop */ }
      const fn = watchTimeout;
      disarmWatchdog();
      fn?.();
    }
  }, 2_000);
}
function disarmWatchdog() {
  watchDeadline = 0;
  watchTimeout = null;
  if (watchInterval) clearInterval(watchInterval);
  watchInterval = null;
}
/** Any fetch progress from the worker resets the watchdog — a 20MB model
 *  download on slow Wi-Fi must be allowed to take its time. */
function kickWatchdog() {
  if (watchDeadline) watchDeadline = Date.now() + 30_000;
}

/** Mark the voice failed with a reason — shown in the parent-panel voice card
 *  and the home voice chip, and the SW bundle version note helps the parent
 *  know a fresh download is expected after a deploy. */
function failNeural(msg: string) {
  state = "error";
  errorMsg = msg;
  preloadStarted = false; // allow the next gesture to retry the download
}

/** Mirror the worker's blob cache + track the big downloads for progress. */
function onMessage(ev: MessageEvent) {
  const data = ev.data as WorkerMsg;
  if (data.kind !== "fetch") return;
  kickWatchdog(); // progress = the worker is alive
  if (data.blob) {
    blobs[data.url] = data.blob;
    if (data.url === MODEL) {
      urlLoaded[MODEL] = MODEL_BYTES;
      bumpProgress();
      markReady(); // model cached ⇒ every earlier asset already is
    }
  } else if (data.total) {
    urlLoaded[data.url] = data.loaded ?? 0;
    bumpProgress();
  }
}

function bumpProgress() {
  const loaded = BIG.reduce((s, [u, n]) => s + Math.min(urlLoaded[u] ?? 0, n), 0);
  progress = Math.min(0.99, loaded / totalBigBytes);
}

function markReady() {
  if (state === "ready") return;
  state = "ready";
  progress = 1;
  urlLoaded = {};
}

/* ──────────────────────── speaker selection (the 16 voices) ────────────────────────
 * bn_BD-google-medium is a 16-speaker model — we measured F0 (fundamental
 * frequency) on every voice to classify them. Speaker 0 (the piper default) is
 * actually MALE (132 Hz). Warm female = 11 (176 Hz, clearest), child = 12
 * (262 Hz). The parent panel offers a picker; the choice is persisted here. */

const SPEAKER_KEY = "nv_bn_speaker";
export const NEURAL_SPEAKER_COUNT = 16;
/** Curated voices for the parent-panel picker. `key` is a stable (non-i18n)
 *  handle — the human label lives in App.tsx's Strings table so the parent
 *  panel stays one translation source (and the scene-audit stays clean). */
export const NEURAL_VOICES: Array<{ id: number; key: "female" | "kid" | "soft" | "warm" }> = [
  { id: 11, key: "female" },
  { id: 12, key: "kid" },
  { id: 3, key: "soft" },
  { id: 7, key: "warm" },
];

function loadSpeaker(): number {
  try {
    const raw = localStorage.getItem(SPEAKER_KEY);
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n < NEURAL_SPEAKER_COUNT) return n;
  } catch {
    /* noop */
  }
  return 11; // default = warm female (was 0/male — see note above)
}
let speakerId = loadSpeaker();

/** Get the active Bangla voice id (0–15). */
export function getNeuralSpeaker(): number {
  return speakerId;
}

/** Set the active Bangla voice id (persisted). Applies to the next synth. */
export function setNeuralSpeaker(id: number) {
  if (!Number.isInteger(id) || id < 0 || id >= NEURAL_SPEAKER_COUNT) return;
  speakerId = id;
  try {
    localStorage.setItem(SPEAKER_KEY, String(id));
  } catch {
    /* noop */
  }
}

/** Synthesize text → WAV Blob. Serialized (jobChain) so worker jobs never
 *  interleave. Resolves with the WAV; rejects on a worker stderr (fatal). */
function synth(text: string, spk: number): Promise<Blob> {
  const result = jobChain.then(() => synthNow(text, spk));
  jobChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function synthNow(text: string, spk: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    let settled = false;
    const fail = (e: unknown) => {
      if (settled) return;
      settled = true;
      disarmWatchdog();
      w.removeEventListener("message", onMsg);
      reject(e instanceof Error ? e : new Error(String(e)));
    };
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as WorkerMsg;
      if (data.kind === "output" && data.input === text) {
        settled = true;
        disarmWatchdog();
        w.removeEventListener("message", onMsg);
        resolve(data.file);
      } else if (data.kind === "stderr") {
        fail(new Error(data.message));
      }
    };
    w.addEventListener("message", onMsg);
    armWatchdog(60_000, () => fail(new Error("voice worker stalled (timeout)")));
    try {
      w.postMessage({
        kind: "init",
        input: text,
        speakerId: spk,
        blobs,
        piperPhonemizeJsUrl: PHON_JS,
        piperPhonemizeWasmUrl: PHON_WASM,
        piperPhonemizeDataUrl: PHON_DATA,
        modelUrl: MODEL,
        modelConfigUrl: MODEL_JSON,
        phonemeIds: null,
        onnxruntimeUrl: ORT_BASE,
      });
    } catch (e) {
      fail(e);
    }
  });
}

/* ──────────────────────────────── playback ──────────────────────────────── */

function sharedAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
  }
  return audio;
}

/** Play a WAV blob through the shared element. Resolves TRUE only when audio
 *  actually played to completion; FALSE on error / iOS rejecting play() (element
 *  not unlocked by a gesture). speech.ts falls back to Web Speech on FALSE, so
 *  a locked iOS audio element can never cause silence. Cancellation via
 *  neuralStopPlayback() resolves FALSE so chains never stall. */
function playBlob(blob: Blob, volume: number): Promise<boolean> {
  const el = sharedAudio();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(blob);
  el.src = audioUrl;
  el.volume = volume;
  return new Promise((resolve) => {
    let settled = false;
    currentPlayResolve = resolve;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (currentPlayResolve === resolve) currentPlayResolve = null;
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("error", onErr);
      resolve(ok);
    };
    const onEnd = () => done(true); // played to completion
    const onErr = () => done(false); // decode/playback error
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", onErr);
    el.play().then(() => {
      audioUnlocked = true; // play() started → iOS has unlocked this element
    }, () => done(false)); // iOS rejection (pre-gesture) → report failure
  });
}

/** Track whether iOS granted playback on the shared element. */
let audioUnlocked = false;

function neuralStopPlayback() {
  if (currentPlayResolve) currentPlayResolve(false); // canceled → not played
  currentPlayResolve = null;
  if (audio) {
    try {
      audio.pause();
    } catch {
      /* noop */
    }
  }
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
}

/* ──────────────────────────────── public API ──────────────────────────────── */

export interface NeuralStatus {
  supported: boolean;
  state: "idle" | "loading" | "ready" | "error";
  /** 0..1 download progress (0 when idle/ready). */
  progress: number;
  ready: boolean;
  error?: string;
}

export function neuralStatus(): NeuralStatus {
  return { supported: supported(), state, progress, ready: isNeuralReady(), error: errorMsg || undefined };
}

export function isNeuralReady(): boolean {
  return supported() && state === "ready";
}

/** Warm the FULL pipeline in the background: downloads phonemizer + ORT + the
 *  20MB int8 model (then the service worker caches them → offline forever), and
 *  builds the ORT session so the first real Bangla line is instant. Audio is
 *  discarded — nothing plays. Starts on the first user gesture; RETRIES on every
 *  later gesture if the first attempt failed (flaky Wi-Fi, dropped fetch), and
 *  a fresh worker is created each retry. */
export function preloadNeuralVoice() {
  if (!supported() || preloadStarted) return;
  preloadStarted = true;
  state = "loading";
  synth("এক", speakerId) // tiny word — warm-up only, never played
    .then(() => markReady())
    .catch((e) => {
      failNeural(e instanceof Error ? e.message : String(e));
    });
}

/** Unlock the shared <audio> element inside a user gesture (iOS rejects every
 *  programmatic play until ONE play() succeeds inside a gesture). Retried on
 *  EVERY gesture until it works — the first tap sometimes misses (keyboard
 *  focus, gesture eaten), so we keep riding gestures until audioUnlocked.
 *  Cheap: a data-URI silent WAV, then the guard short-circuits. */
function neuralPrime() {
  if (!supported() || audioUnlocked) return;
  try {
    const el = sharedAudio();
    el.src = SILENT_WAV;
    el.volume = 0.001;
    const p = el.play();
    if (p) {
      p.then(
        () => {
          audioUnlocked = true;
        },
        () => {
          /* still locked — next gesture retries */
        }
      );
    }
  } catch {
    /* still locked — next gesture retries */
  }
}

export interface NeuralSpeakOpts {
  /** Chain instead of cutting the current line (counting 1,2,3…). */
  queue?: boolean;
  /** 0..1 loudness. Default 0.9 (warm). */
  volume?: number;
  /** Preview a specific voice (0–15) without changing the persistent choice. */
  speaker?: number;
}

/** Speak one Bangla line with the on-device neural voice. Latest-wins (unless
 *  queue mode). Resolves TRUE if audio actually played, FALSE on any failure
 *  (model not ready, synth error, superseded, or iOS audio still locked) — the
 *  caller (speech.ts) falls back to Web Speech on FALSE, so Bangla is never
 *  silent even on a locked iOS audio element. `opts.speaker` previews a
 *  specific voice without changing the persistent selection. */
export function neuralSpeak(text: string, opts: NeuralSpeakOpts = {}): Promise<boolean> {
  if (!isNeuralReady()) return Promise.resolve(false);
  const vol = opts.volume ?? 0.9;
  const spk = opts.speaker ?? speakerId;
  if (opts.queue) {
    // Queue mode: snapshot the token (don't bump — that's latest-wins' job).
    const token = synthToken;
    queueChain = queueChain
      .then(() => synth(text, spk))
      .then(
        (b) => (token !== synthToken ? false : playBlob(b, vol)),
        () => false // synth error → let the caller fall back
      );
    return queueChain;
  }
  const token = ++synthToken;
  neuralStopPlayback();
  return synth(text, spk).then(
    (b) => (token !== synthToken ? false : playBlob(b, vol)),
    () => false
  );
}

/** Stop any in-flight neural speech (scene change / leaving the game). */
export function neuralCancel() {
  synthToken++;
  neuralStopPlayback();
}

/* Wire gestures anywhere in the app: unlock the audio element and kick off the
 * background voice download. Runs on EVERY gesture (not just the first) so:
 *  · neuralPrime retries until the audio element is actually unlocked;
 *  · preloadNeuralVoice retries the download after a flaky-Wi-Fi failure —
 *    a fresh worker is created each time. Cheap: all guards short-circuit.
 * Capture phase so Phaser/React can't swallow the event. */
if (supported() && typeof window !== "undefined") {
  for (const evt of ["pointerdown", "touchstart", "click", "keydown"]) {
    window.addEventListener(evt, () => {
      gestured = true;
      neuralPrime();
      preloadNeuralVoice();
    }, true);
  }
}

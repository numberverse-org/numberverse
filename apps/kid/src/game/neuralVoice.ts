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
//
// CI GUARD: this version MUST be bumped whenever the model (onnx), worker JS,
// phonemizer WASM/data, or onnxruntime-engine files change. The build script
// (fetch_voice_assets.sh) SHOULD compute a content hash of the assembled voice
// payload and inject it as VITE_VOICE_V at build time. Until that pipeline is
// wired, every human deployer MUST verify that VOICE_V is incremented when any
// /voice/ asset changes — a stale version means a 6-month silent rollback for
// every installed PWA (CacheFirst route, maxAgeSeconds 180d @ vite.config.ts:76).
const VOICE_V = "v9"; // v9 = ORT engine back to 1.17 (piper-wasm's engine) — 1.20+ needs import() of an .mjs, which Safari's classic worker can't do
// NOTE: MODEL_JSON MUST carry the SAME ?v= bump (line 39) so the config and
// model rev together — a voice deploy that only renames the .onnx file would
// otherwise leave the .onnx.json config frozen in the 6-month CacheFirst cache,
// creating a mismatched model+config pair for installed clients.
// #1652 — the PHON_* phonemizer files used to be fetched at bare URLs, so an
// installed PWA kept serving old phonemizer bytes up to 6 months after a deploy
// (game by the 180d CacheFirst voice route) → model/phonemizer mismatch. They
// now carry ?v=VOICE_V too, so the whole voice payload revs together. The ONLY
// exception is ORT_WASM (below), which must keep its UNVERSIONED URL because
// ORT 1.17's loader string-concats its own filename — that one uses the
// rename-on-change convention instead.
const PHON_JS = BASE + "piper_phonemize.js?v=" + VOICE_V;
const PHON_WASM = BASE + "piper_phonemize.wasm?v=" + VOICE_V;
const PHON_DATA = BASE + "piper_phonemize.data?v=" + VOICE_V;
const WORKER_JS = BASE + "piper_worker.js?v=" + VOICE_V;
const MODEL = BASE + "bn_BD-google-medium.onnx?v=" + VOICE_V;
const MODEL_JSON = BASE + "bn_BD-google-medium.onnx.json?v=" + VOICE_V;
const ORT_BASE = BASE + "onnx/";
const ORT_JS = ORT_BASE + "ort.min.js?v=" + VOICE_V;
// ORT 1.17's loader string-concats `wasmPaths + "ort-wasm-simd.wasm"` (no
// query) and XHRs it — so the app must cache the SAME unversioned URL for the
// SW to serve the cached bytes (a ?v= here would be a different cache key and
// re-download). On a deliberate engine change we rename the file instead.
const ORT_WASM = ORT_BASE + "ort-wasm-simd.wasm";

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
let currentPlayResolve: ((outcome: NeuralOutcome) => void) | null = null;
/** Chain for queue mode (counting 1,2,3…): each queued synth waits its turn. */
let queueChain: Promise<NeuralOutcome> = Promise.resolve("played");
/** Chain so worker jobs serialize (the worker runs one init at a time). */
let jobChain: Promise<void> = Promise.resolve();
/** Separate low-priority chain for warm-phrase pre-synthesis — real speech
 *  (via synth() + jobChain) always jumps ahead of warm items so pre-synthesis
 *  never delays a kid's first real line. Items on this chain only run when
 *  jobChain is idle (i.e. no real speech waiting). */
let warmChain: Promise<void> = Promise.resolve();
let preloadStarted = false;

/** #1375 — one-shot listeners invoked when the neural model transitions to
 *  ready. speech.ts uses this to flush the latest Bangla line that was held
 *  while no bn Web-Speech voice existed (never a wrong-language voice). */
type NeuralReadyListener = () => void;
const readyWaiters: NeuralReadyListener[] = [];
export function onNeuralReady(cb: NeuralReadyListener): () => void {
  readyWaiters.push(cb);
  return () => {
    const i = readyWaiters.indexOf(cb);
    if (i >= 0) readyWaiters.splice(i, 1);
  };
}

/** The big files, by byte size — used for a coarse overall download progress.
 *  The model is the int8 quantized build (~20MB; weight-only QDQ, see
 *  Dockerfile.web's `voice` stage / infra/deploy/scripts/quantize_voice.py).
 *  NOTE: MODEL_BYTES is a build-time estimate — the actual gzip-served wire
 *  bytes differ. Progress reaches 100% when the LAST big file lands regardless
 *  of byte-count precision, so the estimate is only used for the coarse
 *  intermediate progress bar fill (not load-bearing). A future build pipeline
 *  should inject the exact post-quantization byte count from
 *  fetch_voice_assets.sh alongside VITE_VOICE_V.
 *  We preload these IN PARALLEL on the main thread (the worker would otherwise
 *  fetch them sequentially inside init), then seed the SW cache BEFORE the first
 *  synth — so ORT 1.17's own XHR of the wasm hits the SW cache instead of the
 *  network. */
const MODEL_BYTES = 20_000_000; // int8 model; real byte size injected at build
const ORT_WASM_BYTES = 10_500_000; // ort-wasm-simd.wasm (1.17, single-threaded SIMD)
/** Files the APP downloads + owns (progress-tracked): phonemize data, model,
 *  ORT wasm. The app caches them and passes them to the worker — so a reload
 *  needs ZERO network for the big voice payload. */
const BIG: Array<[string, number]> = [
  [PHON_DATA, 18_077_249],
  [MODEL, MODEL_BYTES],
  [ORT_WASM, ORT_WASM_BYTES],
];
/** Small files the worker needs — fetched quietly (no progress) + seeded, so
 *  the worker's getBlob hits `blobs` and never touches the network for them. */
const SMALL = [PHON_JS, PHON_WASM, ORT_JS, MODEL_JSON];
const ALL_VOICE = [...BIG.map(([u]) => u), ...SMALL];
const totalBigBytes = BIG.reduce((s, [, n]) => s + n, 0);
let urlLoaded: Record<string, number> = {};
let progress = 0;
/** URLs whose downloads have COMPLETED — progress counts them at full size
 *  even when the wire bytes were gzip-encoded (fewer than the estimate). */
const doneFiles = new Set<string>();
function markFileDone(url: string) {
  doneFiles.add(url);
  urlLoaded[url] = 0;
  bumpProgress();
}

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
      // Terminate and null the crashed worker so the next gesture creates a
      // fresh one cleanly (no stale worker reference). Also disarm the in-flight
      // synth watchdog and reject any pending synth promise so speech.ts falls
      // back to Web Speech on this line instead of waiting for the 60s timeout.
      const w = worker;
      worker = null;
      try { w?.terminate(); } catch { /* noop */ }
      if (watchTimeout) {
        const fn = watchTimeout;
        disarmWatchdog();
        fn(); // reject the pending synth promise
      }
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
/** Full stall window for a synth. `kickWatchdog()` must never reset the
 *  deadline below this: the first warm-up synth's ORT session build is a
 *  silent stretch (no fetch progress), and a low-end phone can spend most of
 *  this window building the session before the first inference. */
const SYNTH_WATCHDOG_MS = 60_000;
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
      // Flip module state to "error" so isNeuralReady() returns false,
      // the parent-panel voice card shows the failure reason, and the next
      // gesture re-attempts the full download + init cycle. Previously the
      // worker was killed silently and state stayed "ready" — dead worker
      // masquerading as healthy, every subsequent neuralSpeak spawning a
      // fresh worker in a loop with no recovery path.
      failNeural("voice worker stalled (timeout)");
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
 *  download on slow Wi-Fi must be allowed to take its time. The window must be
 *  no smaller than the arm in `synthNow()`, otherwise the first fetch kicks the
 *  deadline below the full session-build window. */
function kickWatchdog() {
  if (watchDeadline) watchDeadline = Date.now() + SYNTH_WATCHDOG_MS;
}

/** Re-arm the current watchdog with the full window. Used when the worker
 *  finishes its fetch phase and is about to enter the silent compute stretch
 *  (phonemizer + ORT session build + inference), so that stretch is measured
 *  against a fresh full window rather than the tail of a download deadline. */
function rearmWatchdog() {
  if (watchDeadline && watchTimeout) armWatchdog(SYNTH_WATCHDOG_MS, watchTimeout);
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
  if (data.blob) {
    // Completed fetch — the worker is now entering the silent compute phase
    // (phonemizer + ORT session build + inference). Re-arm with the full
    // window so a slow first session build is never cut short by the deadline
    // left over from the download.
    rearmWatchdog();
    blobs[data.url] = data.blob;
    markFileDone(data.url);
    if (data.url === MODEL) markReady(); // model cached ⇒ every earlier asset already is
  } else {
    kickWatchdog(); // progress = the worker is alive
    if (data.total) {
      urlLoaded[data.url] = data.loaded ?? 0;
      bumpProgress();
    }
  }
}

function bumpProgress() {
  let loaded = 0;
  for (const [u, n] of BIG) {
    // Done files count their full size (wire bytes may be gzip-smaller).
    loaded += doneFiles.has(u) ? n : Math.min(urlLoaded[u] ?? 0, n);
  }
  // #1407 — the download bar is allowed to reach 100% the moment the last big
  // file lands (the subsequent silent warm-up is a readiness step, not bytes).
  progress = Math.min(1, loaded / totalBigBytes);
}

function markReady() {
  if (state === "ready") return;
  state = "ready";
  progress = 1;
  urlLoaded = {};
  // #1375 — any Bangla lines held because no bn Web-Speech voice existed can
  // now speak on the freshly-ready neural voice (latest-wins, no stale queue).
  const waiters = readyWaiters.splice(0);
  for (const cb of waiters) {
    try {
      cb();
    } catch {
      /* a listener must never break the ready transition */
    }
  }
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

/** Low-priority variant of synth() used by warmCommonPhrases(). Runs on
 *  warmChain (separate from jobChain) so pre-synthesis never delays a real
 *  speech line — warm items execute only when jobChain is idle.
 *
 *  #3087 — the two chains must actually WAIT on each other: a warm item now
 *  serializes behind the CURRENT jobChain (any in-flight real speech) *and*
 *  behind warmChain, so a warm phrase can never post a worker init while a real
 *  line's init is still in flight. Real speech (synth → jobChain) still jumps
 *  ahead because it never waits on warmChain. */
function synthWarm(text: string, spk: number): Promise<Blob> {
  const result = jobChain.then(() => warmChain.then(() => synthNow(text, spk)));
  warmChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/** Track consecutive synth-level stderr rejections. After a threshold of
 *  consecutive stderr failures (rather than one-off worker crashes), we degrade
 *  the full neural state to "error" so the parent panel surfaces the problem and
 *  the app re-runs preload. This distinguishes a persistent model/ORT problem
 *  from a transient one-off failure. */
let stderrConsecutive = 0;
const STDERR_FAIL_THRESHOLD = 3;

function synthNow(text: string, spk: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    let settled = false;
    const fail = (e: unknown) => {
      if (settled) return;
      settled = true;
      disarmWatchdog();
      w.removeEventListener("message", onMsg);
      // Track consecutive stderr rejections — if the worker keeps emitting
      // stderr for every inference (persistent model/ORT issue), degrade the
      // full neural state so speech.ts chooses Web Speech instead of looping
      // on a broken neural path. One-off stderr failures (e.g. first warm-up
      // glitch) are swallowed at synth level only.
      const errMsg = e instanceof Error ? e.message : String(e);
      stderrConsecutive++;
      if (stderrConsecutive >= STDERR_FAIL_THRESHOLD && state === "ready") {
        failNeural("persistent synth error (" + stderrConsecutive + "x): " + errMsg);
      }
      reject(e instanceof Error ? e : new Error(errMsg));
    };
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as WorkerMsg;
      if (data.kind === "output" && data.input === text) {
        settled = true;
        disarmWatchdog();
        stderrConsecutive = 0; // successful synth resets the counter
        w.removeEventListener("message", onMsg);
        resolve(data.file);
      } else if (data.kind === "stderr") {
        fail(new Error(data.message));
      }
    };
    w.addEventListener("message", onMsg);
    armWatchdog(SYNTH_WATCHDOG_MS, () => fail(new Error("voice worker stalled (timeout)")));
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
        ortVersion: VOICE_V,
      });
    } catch (e) {
      fail(e);
    }
  });
}

/* ──────────────────────────────── playback ──────────────────────────────── */

/**
 * What happened to one neural line. speech.ts needs to know WHY a line did not
 * play, because the right reaction differs:
 *  - "played"      → audio actually played to completion.
 *  - "failed"      → genuine failure (voice not ready, synth error, iOS audio
 *                    still locked) → speech.ts SHOULD fall back to Web Speech
 *                    so Bangla is never silent.
 *  - "superseded"  → a NEWER line took over (another neuralSpeak bumped
 *                    synthToken, or webSpeak's neuralCancel fired). Falling
 *                    back here would make BOTH engines speak the old line at
 *                    once — the exact double-TTS bug. Never fall back.
 */
export type NeuralOutcome = "played" | "failed" | "superseded";

function sharedAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
  }
  return audio;
}

/** Stop any in-flight Web Speech line (the OTHER engine). Cross-engine
 *  latest-wins: webSpeak() already cancels neural before it speaks; this is
 *  the mirror direction, so a neural line never starts while a Web Speech line
 *  is still audible (English line → Bangla line used to make BOTH speak).
 *  Only called in playBlob — right before neural audio actually starts — so a
 *  neural line that never plays (superseded mid-synth) leaves web speech alone. */
function stopWebSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume?.(); // clear a paused state so we don't queue
    } catch {
      /* noop */
    }
  }
}

/** Play a WAV blob through the shared element. Resolves "played" only when
 *  audio actually played to completion; "failed" on error / iOS rejecting
 *  play() (element not unlocked by a gesture) — speech.ts falls back to Web
 *  Speech on "failed", so a locked iOS audio element can never cause silence.
 *  Cancellation via neuralStopPlayback() resolves "superseded" (a newer line
 *  took over) so chains never stall AND the old line never falls back. */
function playBlob(blob: Blob, volume: number): Promise<NeuralOutcome> {
  stopWebSpeech(); // the newest line wins across BOTH engines — kill web before we play
  const el = sharedAudio();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(blob);
  el.src = audioUrl;
  el.volume = volume;
  return new Promise((resolve) => {
    let settled = false;
    currentPlayResolve = resolve;
    const done = (outcome: NeuralOutcome) => {
      if (settled) return;
      settled = true;
      if (currentPlayResolve === resolve) currentPlayResolve = null;
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("error", onErr);
      resolve(outcome);
    };
    const onEnd = () => done("played"); // played to completion
    const onErr = () => done("failed"); // decode/playback error
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", onErr);
    el.play().then(() => {
      audioUnlocked = true; // play() started → iOS has unlocked this element
    }, () => done("failed")); // iOS rejection (pre-gesture) → report failure
  });
}

/** Track whether iOS granted playback on the shared element. */
let audioUnlocked = false;

function neuralStopPlayback() {
  if (currentPlayResolve) currentPlayResolve("superseded"); // canceled → a newer line took over, never fall back
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
  /** Per-line WAV cache (on-device, IndexedDB) — the parent-panel meter. All
   *  zeros until at least one line has been spoken. */
  cache?: { hits: number; misses: number; hitRate: number };
}

export function neuralStatus(): NeuralStatus {
  const total = cacheHits + cacheMisses;
  return {
    supported: supported(), state, progress, ready: isNeuralReady(), error: errorMsg || undefined,
    cache: { hits: cacheHits, misses: cacheMisses, hitRate: total ? cacheHits / total : 0 },
  };
}

export function isNeuralReady(): boolean {
  return supported() && state === "ready";
}

/** Per-fetch deadline for a stalled stream — if the server stops sending bytes
 *  mid-stream the promise rejects, failNeural() resets preloadStarted, and the
 *  next gesture genuinely retries instead of hanging forever. 120s covers even
 *  the 20MB model on a throttled 3G connection (< 200 KB/s). */
const FETCH_DEADLINE_MS = 120_000;

/** Download one big file with streaming progress, caching the blob so the
 *  worker's getBlob hits the cache instead of re-fetching. Gzip-encoded
 *  responses decompress transparently (progress counts real decoded bytes).
 *  Wraps the stream in an AbortController deadline so a stalled mid-stream
 *  fetch never permanently blocks the retry path. */
function fetchBlobWithProgress(url: string): Promise<Blob> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_DEADLINE_MS);
  return fetch(url, { signal: controller.signal }).then(async (res) => {
    clearTimeout(timer);
    if (!res.ok) throw new Error(`voice fetch ${res.status} ${url}`);
    const reader = res.body?.getReader();
    if (!reader) {
      const b = await res.blob();
      blobs[url] = b;
      markFileDone(url);
      return b;
    }
    const chunks: BlobPart[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      chunks.push(value);
      urlLoaded[url] = loaded;
      bumpProgress();
    }
    // Preserve the response's MIME type on the blob. Without it (new Blob(parts)
    // defaults to type "") any consumer that does WebAssembly streaming compile
    // on a blob: URL — e.g. ORT's compileStreaming(fetch(blobUrl)) — throws
    // "Incorrect response MIME type. Expected 'application/wasm'". The wasm must
    // keep application/wasm so blob-URL streams work (defense in depth: the
    // worker now also compiles it from wasmBinary bytes, which skips streaming).
    const b = new Blob(chunks, { type: res.headers.get("content-type") || "" });
    blobs[url] = b;
    markFileDone(url);
    return b;
  }).catch((e) => {
    clearTimeout(timer);
    throw e; // re-throw so preloadNeuralVoice.catch → failNeural resets preloadStarted
  });
}

/** Reuse a blob we seeded in a PREVIOUS session from the `nv-voice` runtime
 *  cache (visit 2+, reload, tab re-open): NO network, NO service-worker
 *  dependency — the app owns its persistence, so a missing/not-yet-active SW
 *  can never force a re-download. Keys match `seedSwVoiceCache` exactly. */
async function cachedBlob(url: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open("nv-voice");
    const hit = await cache.match(url);
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

/** Fetch ALL voice files (big + small) IN PARALLEL on the main thread —
 *  first-run time ≈ max(file), not the sequential sum the worker's init would
 *  produce. No gesture needed: only PLAYBACK is gesture-gated, downloading is
 *  not. On a retry/reload any file already in memory OR in the nv-voice runtime
 *  cache is reused, not re-downloaded (reloads are instant + fully offline).
 *  The worker's getBlob reads `blobs` first and the ORT loader's wasmPaths
 *  reads `blobs` too, so once these are fetched the worker needs only the
 *  tiny 24KB .mjs wrapper from the network. */
function downloadParallel(): Promise<void> {
  return Promise.all(
    ALL_VOICE.map(async (url) => {
      if (blobs[url]) return;
      const cached = await cachedBlob(url);
      if (cached) {
        blobs[url] = cached;
        markFileDone(url);
        return;
      }
      await fetchBlobWithProgress(url); // first visit / cache miss
    })
  ).then(() => undefined);
}

/** Seed the `nv-voice` runtime cache from the blobs we ALREADY downloaded
 *  (ALL of them — big files, phonemizer, ORT loader + wasm). Puts zero extra
 *  bytes on the wire. Reads happen on TWO paths: the app's own `cachedBlob()`
 *  (reload is instant, no SW needed) AND the service worker's CacheFirst route
 *  (a safety net for anything the worker/ORT fetch directly). Both use the
 *  same `nv-voice` cache + exact URLs. */
async function seedSwVoiceCache() {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open("nv-voice"); // matches vite.config.ts cacheName
    await Promise.all(
      Object.entries(blobs).map(async ([url, blob]) => {
        if (blob)
          await cache.put(
            url,
            // Store the Content-Type so a reload's cachedBlob() returns a blob
            // with the RIGHT MIME — otherwise the cache would degrade the wasm
            // blob to type "" and any streaming-compile path would throw again.
            new Response(blob, {
              status: 200,
              headers: { "Content-Type": blob.type || "application/octet-stream" },
            })
          );
      })
    );
  } catch {
    /* SW cache unavailable (insecure LAN) — voice still works, just re-downloads */
  }
}

/* ──────────────────── per-line WAV cache (IndexedDB LRU) ────────────────────
 * Synthesis is the slow part (phonemizer + ORT inference per line). The game
 * repeats the same SHORT Bangla phrases constantly — counting words, praise,
 * prompts — so caching each WAV by `${speakerId}:${text}` makes repeat lines
 * INSTANT (no synth), and idle pre-synthesis of common phrases makes the FIRST
 * line of a session instant too. Everything stays ON-DEVICE (privacy is the
 * moat): IndexedDB, no network, no analytics. */
const CACHE_DB = "nv-wav-cache";
const CACHE_STORE = "waves";
/** #1235 — bump this when the record shape / indexes change; onupgradeneeded
 *  then REBUILDS the store so the 'ts' LRU index can't silently drift. */
const CACHE_DB_VERSION = 1;
const CACHE_MAX_BYTES = 30 * 1024 * 1024; // LRU cap (~600 short phrases)
const CACHE_MAX_TEXT = 100;               // only short phrases — long unique lines waste space
const CACHE_TOUCH_MS = 60_000;            // refresh LRU timestamp at most once/minute/entry

let cacheDbPromise: Promise<IDBDatabase | null> | null = null;
function openVoiceCache(): Promise<IDBDatabase | null> {
  if (cacheDbPromise) return cacheDbPromise;
  cacheDbPromise = new Promise((resolve) => {
    let blockedTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const req = indexedDB.open(CACHE_DB, CACHE_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // #1235 — schema drift: if the store exists but lacks the 'ts' index it
        // was built by an OLD version — rebuild it so LRU eviction stays
        // authoritative (a stale shape would silently break eviction).
        if (db.objectStoreNames.contains(CACHE_STORE)) {
          const old = req.transaction?.objectStore(CACHE_STORE);
          if (old && !old.indexNames.contains("ts")) {
            db.deleteObjectStore(CACHE_STORE);
          }
        }
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          const store = db.createObjectStore(CACHE_STORE, { keyPath: "key" });
          store.createIndex("ts", "ts"); // LRU eviction by last-used
        }
      };
      req.onsuccess = () => {
        const db = req.result || null;
        if (blockedTimer) {
          clearTimeout(blockedTimer);
          blockedTimer = null;
        }
        if (!db) {
          resolve(null);
          return;
        }
        // #1232 — ONE lightweight ledger seed per page load (keys/bytes/ts only,
        // walked via the 'ts' index cursor so it's already LRU-ordered); after
        // this, put/get touch the in-memory ledger — never a per-store getAll.
        // #3093 — resolve SYNCHRONOUSLY here (non-async handler) and settle the
        // seed with an always-resolving .then: a future throw inside seedLruLedger
        // (or a change to its error handling) must never leave cacheDbPromise
        // pending forever — every voiceCacheGet/Put awaits it and would hang the
        // speech queue. A ledger-seed failure falls back to an empty ledger (best
        // effort cache), never blocks speech.
        seedLruLedger(db).then(
          () => resolve(db),
          () => resolve(db)
        );
      };
      req.onerror = () => {
        if (blockedTimer) {
          clearTimeout(blockedTimer);
          blockedTimer = null;
        }
        resolve(null);
      };
      req.onblocked = () => {
        // #1235 — another tab holds the OLD-version connection open. Don't
        // silently disable the cache: give it a moment to close (up to 4s),
        // then fall back to uncached speech rather than hanging forever.
        // (no console.warn — the shipped-code audit forbids debug logging)
        if (blockedTimer) return;
        blockedTimer = setTimeout(() => resolve(null), 4000);
      };
    } catch {
      resolve(null); // IDB unavailable (private mode / insecure) — cache is best-effort
    }
  });
  return cacheDbPromise;
}

function cacheKey(spk: number, text: string): string {
  return spk + ":" + text;
}

/** DEV-ONLY test hook — exposes the wave-cache internals for the runtime smoke
 *  test (real IndexedDB). Folds to `undefined` in production builds
 *  (import.meta.env.DEV = false → dead branch eliminated), so it never ships. */
export const __nvTestCache =
  import.meta.env.DEV
    ? {
        put: (spk: number, text: string, blob: Blob) => voiceCachePut(spk, text, blob),
        get: (spk: number, text: string) => voiceCacheGet(spk, text),
        ledger: () => ({ size: lruMap?.size ?? 0, bytes: lruBytes }),
        waitLedger: () => openVoiceCache(),
        bump: (hit: boolean) => bumpCache(hit),
        flushMetric: () => flushCacheMetric(),
        metric: () => ({ h: cacheHits, m: cacheMisses }),
      }
    : undefined;

/* ── #1232 in-memory LRU ledger ──────────────────────────────────────────────
 * The wave cache used to store.getAll() + sort the WHOLE store on EVERY put to
 * enforce the byte cap — O(n) over every cached phrase inside a readwrite tx.
 * Now the {key,bytes,ts} bookkeeping lives in memory, seeded once at open, and
 * eviction walks the Map from the oldest end (insertion order = ts order from
 * the 'ts' index cursor). The blob payloads are never held in memory — the
 * cursor hands each record one at a time and only the small fields are kept. */
let lruMap: Map<string, { bytes: number; ts: number }> | null = null;
let lruBytes = 0;

function seedLruLedger(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains(CACHE_STORE)) {
      lruMap = new Map();
      lruBytes = 0;
      resolve();
      return;
    }
    try {
      const store = db.transaction(CACHE_STORE, "readonly").objectStore(CACHE_STORE);
      if (!store.indexNames.contains("ts")) {
        lruMap = new Map();
        lruBytes = 0;
        resolve();
        return;
      }
      const req = store.index("ts").openCursor(); // ts ascending → oldest FIRST = LRU head
      const map = new Map<string, { bytes: number; ts: number }>();
      let total = 0;
      req.onsuccess = () => {
        const cur = req.result as IDBCursorWithValue | null;
        if (cur) {
          const rec = cur.value as { key?: string; bytes?: number; ts?: number };
          const k = rec.key ?? "";
          if (k !== "") {
            const bytes = rec.bytes || 0;
            total += bytes;
            map.set(k, { bytes, ts: rec.ts || 0 });
          }
          cur.continue();
        } else {
          lruMap = map;
          lruBytes = total;
          resolve();
        }
      };
      req.onerror = () => {
        lruMap = map;
        lruBytes = total;
        resolve();
      };
    } catch {
      lruMap = new Map();
      lruBytes = 0;
      resolve();
    }
  });
}

async function voiceCacheGet(spk: number, text: string): Promise<Blob | undefined> {
  const db = await openVoiceCache();
  if (!db) return undefined;
  const key = cacheKey(spk, text);
  return new Promise((resolve) => {
    try {
      // READONLY only — never a readwrite tx on the hot read path. The
      // LRU timestamp refresh in memory is sufficient for eviction ordering;
      // the on-disk ts is updated on the next cache put for this entry.
      // Previously a deferred readwrite put() ran on every cache hit to
      // refresh the ts on disk, adding write amplification and contention
      // with the put-path's own readwrite eviction transaction.
      const tx = db.transaction(CACHE_STORE, "readonly");
      const store = tx.objectStore(CACHE_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const rec = req.result as { blob: Blob; ts: number } | undefined;
        if (!rec) { resolve(undefined); return; }
        if (Date.now() - rec.ts > CACHE_TOUCH_MS) {
          rec.ts = Date.now();
          if (lruMap) {
            const prev = lruMap.get(key);
            lruMap.delete(key);
            lruMap.set(key, { bytes: prev?.bytes ?? 0, ts: rec.ts }); // move to LRU tail
          }
        }
        resolve(rec.blob);
      };
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function voiceCachePut(spk: number, text: string, blob: Blob): Promise<void> {
  const db = await openVoiceCache();
  if (!db || blob.size <= 0) return;
  const key = cacheKey(spk, text);
  const now = Date.now();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CACHE_STORE, "readwrite");
      const store = tx.objectStore(CACHE_STORE);
      store.put({ key, blob, ts: now, bytes: blob.size });
      // #1232 — eviction from the in-memory ledger (seeded once at open): no
      // per-store getAll + sort. Same-task issuance keeps the delete requests
      // inside the live tx. Falls back to uncapped (best-effort) if the ledger
      // somehow wasn't seeded.
      if (lruMap) {
        const prev = lruMap.get(key);
        if (prev) lruBytes -= prev.bytes;
        lruMap.delete(key);
        lruMap.set(key, { bytes: blob.size, ts: now }); // newest = LRU tail
        lruBytes += blob.size;
        while (lruBytes > CACHE_MAX_BYTES && lruMap.size > 0) {
          const oldestKey = lruMap.keys().next().value as string;
          const oldest = lruMap.get(oldestKey)!;
          store.delete(oldestKey);
          lruBytes -= oldest.bytes;
          lruMap.delete(oldestKey);
        }
      }
      resolve();
    } catch {
      resolve(); // best-effort — a full cache never breaks speech
    }
  });
}

/** Privacy-safe on-device meter: synth hit vs miss (localStorage, no network). */
let cacheHits = 0;
let cacheMisses = 0;
let cacheMetricTimer: ReturnType<typeof setTimeout> | null = null;
/** #1233 — don't localStorage-write on EVERY spoken line (every praise/prompt/
 *  count word hits/misses the cache). Coalesce into one trailing write per 500ms
 *  and always flush on page exit / tab hide. */
function scheduleCacheMetricWrite() {
  if (cacheMetricTimer) return;
  cacheMetricTimer = setTimeout(() => {
    cacheMetricTimer = null;
    writeCacheMetric();
  }, 500);
}
function writeCacheMetric() {
  try {
    localStorage.setItem("nv_cache_metric", JSON.stringify({ h: cacheHits, m: cacheMisses }));
  } catch {
    /* noop */
  }
}
function flushCacheMetric() {
  if (cacheMetricTimer) {
    clearTimeout(cacheMetricTimer);
    cacheMetricTimer = null;
  }
  writeCacheMetric();
}
function bumpCache(hit: boolean) {
  if (hit) cacheHits++;
  else cacheMisses++;
  scheduleCacheMetricWrite();
}
function loadCacheMetric() {
  try {
    const raw = localStorage.getItem("nv_cache_metric");
    if (raw) {
      const o = JSON.parse(raw);
      cacheHits = (o.h | 0) || 0;
      cacheMisses = (o.m | 0) || 0;
    }
  } catch {
    /* noop */
  }
}
loadCacheMetric();
// #1233 — never lose the trailing metric write: flush on page exit / tab hide.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushCacheMetric);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushCacheMetric();
  });
}

/** Resolve a WAV for text — cache-hit returns INSTANTLY (no synth), miss synths
 *  then stores (best-effort, LRU-capped). */
function getBlobFor(text: string, spk: number): Promise<Blob> {
  return voiceCacheGet(spk, text).then((cached) => {
    if (cached) {
      bumpCache(true);
      return cached;
    }
    bumpCache(false);
    return synth(text, spk).then((blob) => {
      if (text.length <= CACHE_MAX_TEXT) void voiceCachePut(spk, text, blob);
      return blob;
    });
  });
}

/** Warm the FULL pipeline in the background: downloads phonemizer + the
 *  ~20MB int8 model IN PARALLEL (then the service worker caches them → offline
 *  forever), and builds the ORT session so the first real Bangla line is
 *  instant. Audio is discarded — nothing plays. Starts at BOOT (first idle),
 *  NOT on the first user gesture — a kid's first question waits less. The
 *  gesture handler below still retries after a flaky-Wi-Fi failure (a fresh
 *  worker is created each retry). */
export function preloadNeuralVoice() {
  if (!supported() || preloadStarted) return;
  preloadStarted = true;
  state = "loading";
  // 1. Parallel main-thread download of the big files (progressed live).
  downloadParallel()
    .then(() => seedSwVoiceCache())
    .then(() => {
      // 2. Hand the blobs to the worker — its init hits the cache, and ORT
      //    1.17's own XHR of ort-wasm-simd.wasm hits the freshly-seeded SW
      //    cache (so the wasm is never fetched twice / never re-downloaded).
      return synth("এক", speakerId); // tiny word — warm-up only, never played
    })
    .then(() => {
      markReady();
      // 3. Idle pre-synthesis of the common phrases — the first gameplay lines
      //    hit the WAV cache instead of the worker.
      void warmCommonPhrases();
    })
    .catch((e) => {
      failNeural(e instanceof Error ? e.message : String(e));
    });
}

/** Start the voice download at first idle after paint — the biggest lever for
 *  first-run time (download needs no gesture, only playback does). Falls back
 *  to a short timeout where requestIdleCallback is unavailable. */
function bootPreload() {
  if (!supported() || typeof window === "undefined") return;
  const kick = () => preloadNeuralVoice();
  const idle = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof idle === "function") idle(kick, { timeout: 3000 });
  else window.setTimeout(kick, 1000);
}

/** #1318 — explicit RETRY after a failed download. failNeural() already reset
 *  `preloadStarted`, so this is the honest name for the same re-arm: a fresh
 *  worker is created and the big files re-download (any file already in memory
 *  OR in the nv-voice runtime cache is reused — a flaky-Wi-Fi retry is cheap).
 *  Callable from the home/settings/parent retry buttons; the caller then
 *  re-snapshots speechStatus() so the UI watches the download land. */
export function retryNeuralVoice(): void {
  preloadNeuralVoice();
}

/** Bangla words 0–20 — MUST mirror `bnNumber()` in speech.ts (the game speaks
 *  counting via those exact strings, so the cache keys align). Kept local here
 *  to avoid a circular import; if bnNumber changes, update this table too. */
const BN_WARM_WORDS = [
  "শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়",
  "দশ", "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোল", "সতেরো", "আঠারো", "উনিশ",
  "বিশ",
];
/** Universal Bangla praise/prompt words that repeat across every scene. */
const BN_WARM_PHRASES = ["দারুণ", "সাবাশ", "ঠিক আছে", "বাহ", "শোনো", "চমৎকার", "আবার", "নোট"];

let warmed = false;
/** After the model is ready, synthesize the common phrases in small idle
 *  batches (cache-first: on a re-visit they're already stored, so this is a
 *  no-op sweep). Yields between batches so real speech synths interleave —
 *  pre-synthesis never blocks a kid's line. */
function warmCommonPhrases() {
  if (warmed || !isNeuralReady()) return;
  warmed = true;
  const items = [...BN_WARM_WORDS, ...BN_WARM_PHRASES];
  let i = 0;
  const spk = speakerId;
  const step = () => {
    if (!isNeuralReady()) return;
    const batch = items.slice(i, i + 3);
    i += 3;
    void Promise.allSettled(
      batch.map((s) =>
        voiceCacheGet(spk, s).then((b) =>
          b ? undefined : synthWarm(s, spk).then((blob) => {
            if (s.length <= CACHE_MAX_TEXT) void voiceCachePut(spk, s, blob);
          })
        )
      )
    ).then(() => {
      if (i < items.length) window.setTimeout(step, 120); // yield for real speech
    });
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  if (typeof idle === "function") idle(() => step(), { timeout: 5000 });
  else window.setTimeout(step, 400);
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
 *  queue mode). Resolves "played" if audio actually played; "failed" on a
 *  GENUINE failure (model not ready, synth error, iOS audio still locked) —
 *  the caller (speech.ts) falls back to Web Speech on "failed", so Bangla is
 *  never silent even on a locked iOS audio element; "superseded" when a newer
 *  line took over (another neuralSpeak, or webSpeak's neuralCancel) — the
 *  caller must NOT fall back then, or BOTH engines speak at once.
 *  `opts.speaker` previews a specific voice without changing the selection. */
export function neuralSpeak(text: string, opts: NeuralSpeakOpts = {}): Promise<NeuralOutcome> {
  if (!isNeuralReady()) return Promise.resolve("failed");
  const vol = opts.volume ?? 0.9;
  const spk = opts.speaker ?? speakerId;
  if (opts.queue) {
    // Queue mode: snapshot the token (don't bump — that's latest-wins' job).
    const token = synthToken;
    queueChain = queueChain
      .then(() => getBlobFor(text, spk)) // cache-hit skips synth entirely
      .then(
        (b) => (token !== synthToken ? "superseded" : playBlob(b, vol)),
        () => "failed" // synth/cache error → the caller may fall back
      );
    return queueChain;
  }
  const token = ++synthToken;
  neuralStopPlayback();
  return getBlobFor(text, spk).then(
    (b) => (token !== synthToken ? "superseded" : playBlob(b, vol)),
    () => "failed"
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
  // Kick the download at boot (first idle) — not waiting for a tap.
  bootPreload();
  for (const evt of ["pointerdown", "touchstart", "click", "keydown"]) {
    window.addEventListener(evt, () => {
      neuralPrime();           // audio unlock — genuinely needs the gesture
      preloadNeuralVoice();    // no-op if boot preload is running/done — retry path
    }, true);
  }
}

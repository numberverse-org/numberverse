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
const VOICE_V = "v9"; // v9 = ORT engine back to 1.17 (piper-wasm's engine) — 1.20+ needs import() of an .mjs, which Safari's classic worker can't do
const PHON_JS = BASE + "piper_phonemize.js";
const PHON_WASM = BASE + "piper_phonemize.wasm";
const PHON_DATA = BASE + "piper_phonemize.data";
const WORKER_JS = BASE + "piper_worker.js?v=" + VOICE_V;
const MODEL = BASE + "bn_BD-google-medium.onnx?v=" + VOICE_V;
const MODEL_JSON = BASE + "bn_BD-google-medium.onnx.json";
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
let preloadStarted = false;
let gestured = false;

/** The big files, by byte size — used for a coarse overall download progress.
 *  The model is the ~20MB int8 build (weight-only QDQ, see Dockerfile.web's
 *  `voice` stage / infra/deploy/scripts/quantize_voice.py). We preload these IN
 *  PARALLEL on the main thread (the worker would otherwise fetch them
 *  sequentially inside init), then seed the SW cache BEFORE the first synth —
 *  so ORT 1.17's own XHR of the wasm hits the SW cache instead of the network. */
const MODEL_BYTES = 20_000_000;
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
const SMALL = [PHON_JS, PHON_WASM, ORT_JS];
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
    markFileDone(data.url);
    if (data.url === MODEL) markReady(); // model cached ⇒ every earlier asset already is
  } else if (data.total) {
    urlLoaded[data.url] = data.loaded ?? 0;
    bumpProgress();
  }
}

function bumpProgress() {
  let loaded = 0;
  for (const [u, n] of BIG) {
    // Done files count their full size (wire bytes may be gzip-smaller).
    loaded += doneFiles.has(u) ? n : Math.min(urlLoaded[u] ?? 0, n);
  }
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

/** Download one big file with streaming progress, caching the blob so the
 *  worker's getBlob hits the cache instead of re-fetching. Gzip-encoded
 *  responses decompress transparently (progress counts real decoded bytes). */
function fetchBlobWithProgress(url: string): Promise<Blob> {
  return fetch(url).then(async (res) => {
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
const CACHE_MAX_BYTES = 30 * 1024 * 1024; // LRU cap (~600 short phrases)
const CACHE_MAX_TEXT = 100;               // only short phrases — long unique lines waste space
const CACHE_TOUCH_MS = 60_000;            // refresh LRU timestamp at most once/minute/entry

let cacheDbPromise: Promise<IDBDatabase | null> | null = null;
function openVoiceCache(): Promise<IDBDatabase | null> {
  if (cacheDbPromise) return cacheDbPromise;
  cacheDbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(CACHE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          const store = db.createObjectStore(CACHE_STORE, { keyPath: "key" });
          store.createIndex("ts", "ts"); // LRU eviction by last-used
        }
      };
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null); // IDB unavailable (private mode / insecure) — cache is best-effort
    }
  });
  return cacheDbPromise;
}

function cacheKey(spk: number, text: string): string {
  return spk + ":" + text;
}

async function voiceCacheGet(spk: number, text: string): Promise<Blob | undefined> {
  const db = await openVoiceCache();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CACHE_STORE, "readwrite"); // readwrite so we can refresh ts
      const store = tx.objectStore(CACHE_STORE);
      const req = store.get(cacheKey(spk, text));
      req.onsuccess = () => {
        const rec = req.result as { blob: Blob; ts: number } | undefined;
        if (!rec) { resolve(undefined); return; }
        if (Date.now() - rec.ts > CACHE_TOUCH_MS) {
          rec.ts = Date.now();
          store.put(rec); // keep LRU roughly true with few writes
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
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CACHE_STORE, "readwrite");
      const store = tx.objectStore(CACHE_STORE);
      store.put({ key: cacheKey(spk, text), blob, ts: Date.now(), bytes: blob.size });
      // Issue getAll SYNCHRONOUSLY after put — a gap between IDB requests lets
      // the tx auto-commit (IndexedDB lifetime footgun), silently dropping the
      // eviction. Same-task issuance keeps the tx alive.
      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const all = allReq.result as Array<{ key: string; bytes: number; ts: number }>;
        let total = all.reduce((s, r) => s + (r.bytes || 0), 0);
        if (total > CACHE_MAX_BYTES) {
          const oldest = all.slice().sort((a, b) => a.ts - b.ts);
          for (const rec of oldest) {
            if (total <= CACHE_MAX_BYTES) break;
            store.delete(rec.key);
            total -= rec.bytes || 0;
          }
        }
        resolve();
      };
      allReq.onerror = () => resolve();
      tx.onabort = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve(); // best-effort — a full cache never breaks speech
    }
  });
}

/** Privacy-safe on-device meter: synth hit vs miss (localStorage, no network). */
let cacheHits = 0;
let cacheMisses = 0;
function bumpCache(hit: boolean) {
  if (hit) cacheHits++;
  else cacheMisses++;
  try {
    localStorage.setItem("nv_cache_metric", JSON.stringify({ h: cacheHits, m: cacheMisses }));
  } catch {
    /* noop */
  }
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
          b ? undefined : synth(s, spk).then((blob) => {
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
      gestured = true;
      neuralPrime();           // audio unlock — genuinely needs the gesture
      preloadNeuralVoice();    // no-op if boot preload is running/done — retry path
    }, true);
  }
}

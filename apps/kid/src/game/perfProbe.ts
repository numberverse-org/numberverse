/**
 * #1324 — frame-jank probe: the "Profiled on low-end phone" measuring stick.
 *
 * Round-based scenes recycle objects (see cardPool in ui.ts), but the question
 * "did we actually cut jank on a low-end phone?" needs a measurement. This tiny
 * sampler rides the rAF loop while a game is up and records long frames:
 *   16.7ms = one 60fps frame; a frame > LONG_MS has DROPPED at least one frame
 *   (that's the stutter a kid sees). Session totals make a low-end phone
 *   objectively profiable — open https://kids.munna-khan.xyz/?nvperf=1
 *   (or set window.__NV_PERF_ENABLED__ = 1) and play a few rounds.
 *
 * Surface:
 *  · a small live pill in the corner (FPS + worst frame) while the game runs,
 *  · perfSnapshot() for callers / a session summary + window.__NV_PERF__ at
 *    teardown for scripting.
 *
 * Costs nothing when off: no rAF loop, no listeners, no pill.
 */

export interface JankStats {
  /** rAF frames sampled this session. */
  frames: number;
  /** Frames that took longer than LONG_MS (dropped-frame candidates). */
  longFrames: number;
  /** Longest single frame (ms). */
  worstMs: number;
  /** longFrames / frames. */
  longFramePct: number;
  /** Session average FPS (only meaningful after some frames). */
  avgFps: number;
}

/** A frame slower than this has skipped at least one 60fps frame. */
const LONG_MS = 50;
const PILL_INTERVAL_MS = 500;
const SAMPLE_MAX = 300; // keep the rolling average bounded on a long session

let enabled = false;
let raf = 0;
let last = 0;
let frames = 0;
let longFrames = 0;
let worstMs = 0;
let fpsAcc = 0;
let pill: HTMLDivElement | null = null;
let pillTimer = 0;

function onFrame(now: number) {
  if (!enabled) return;
  const ms = last ? now - last : 16.7;
  last = now;
  frames++;
  fpsAcc += ms;
  if (frames > SAMPLE_MAX) {
    // keep the rolling window bounded (drop the oldest approximation)
    fpsAcc -= fpsAcc / SAMPLE_MAX;
  }
  if (ms > LONG_MS) longFrames++;
  if (ms > worstMs) worstMs = ms;
  raf = window.requestAnimationFrame(onFrame);
}

function snapshot(): JankStats {
  const avgMs = frames > 0 ? fpsAcc / Math.min(frames, SAMPLE_MAX) : 16.7;
  return {
    frames,
    longFrames,
    worstMs: Math.round(worstMs * 10) / 10,
    longFramePct: frames > 0 ? Math.round((longFrames / frames) * 1000) / 10 : 0,
    avgFps: Math.round(1000 / avgMs),
  };
}

export function perfSnapshot(): JankStats | null {
  return enabled ? snapshot() : null;
}

function mountPill(): void {
  if (pill || typeof document === "undefined") return;
  pill = document.createElement("div");
  pill.className = "nv-perf-pill";
  pill.setAttribute("role", "status");
  document.body.appendChild(pill);
  const tick = () => {
    if (!enabled || !pill) return;
    const s = snapshot();
    pill.textContent = `${s.avgFps}fps · worst ${s.worstMs}ms · ${s.longFramePct}% long`;
    pillTimer = window.setTimeout(tick, PILL_INTERVAL_MS);
  };
  tick();
}

export function startPerfProbe(): void {
  if (enabled || typeof window === "undefined") return;
  const qs = new URLSearchParams(window.location.search);
  const forced = qs.get("nvperf") === "1" || (window as unknown as { __NV_PERF_ENABLED__?: boolean }).__NV_PERF_ENABLED__;
  if (!forced) return;
  enabled = true;
  last = 0;
  frames = 0;
  longFrames = 0;
  worstMs = 0;
  fpsAcc = 0;
  mountPill();
  raf = window.requestAnimationFrame(onFrame);
}

export function stopPerfProbe(): void {
  if (!enabled) return;
  enabled = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (pillTimer) window.clearTimeout(pillTimer);
  pillTimer = 0;
  pill?.remove();
  pill = null;
  const s = snapshot();
  // Leave the data on the window for scripting / device capture.
  (window as unknown as { __NV_PERF__?: JankStats }).__NV_PERF__ = s;
  if (s.frames > 0) {
    // eslint-disable-next-line no-console
    console.info(`[nvperf] ${s.frames} frames · ${s.longFramePct}% > ${LONG_MS}ms · worst ${s.worstMs}ms · ~${s.avgFps}fps`);
  }
}

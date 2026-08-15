/**
 * Reduced-motion support (#350) — an accessibility toggle for kids who find
 * motion overwhelming (or whose device OS already asks for it).
 *
 * Three sources, in priority order:
 *   1. The in-app toggle (localStorage `nv_reduced_motion` = "1"/"0") — an
 *      explicit child/family choice always wins.
 *   2. Otherwise the OS preference (prefers-reduced-motion: reduce).
 *   3. Otherwise motion is ON.
 */

const LS_KEY = "nv_reduced_motion";

type ReducedMotionListener = (reduced: boolean) => void;
const listeners = new Set<ReducedMotionListener>();

/** Subscribe to in-app reduced-motion changes. Returns an unsubscribe fn.
 *  Only fires for explicit setReducedMotion() toggles — used by long-lived
 *  Phaser scenes/helpers so a toggle has a live effect on an already-running
 *  scene instead of being read once at create time (#1440). */
export function onReducedMotionChange(listener: ReducedMotionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(LS_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    /* storage blocked — fall through to the OS preference */
  }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function setReducedMotion(on: boolean): void {
  try {
    window.localStorage.setItem(LS_KEY, on ? "1" : "0");
  } catch {
    /* storage blocked — the toggle simply won't persist across reloads */
  }
  listeners.forEach((listener) => listener(on));
}

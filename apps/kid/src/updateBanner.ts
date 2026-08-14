/**
 * #1321 — PWA update-banner bridge (boot-chunk ↔ banner UI).
 *
 * The service-worker registration lives in the BOOT chunk (main.tsx, so it
 * never blocks first paint); the update banner also renders from the boot
 * chunk (so it keeps working while the App chunk is being swapped). This tiny
 * module is the state seam between them — plain subscribe/notify, no React,
 * no zustand, so importing it costs almost nothing in the boot bundle.
 *
 * IMPORTANT (useSyncExternalStore contract): getSWUpdate must return a STABLE
 * snapshot — the same object reference until the store actually changes.
 * Returning a fresh `{ available, apply }` literal every call makes React see
 * a "different" snapshot on every render → infinite update loop (error #185).
 * So the snapshot object is replaced ONLY in swUpdateAvailable, and read-only
 * between changes.
 */
type Sub = () => void;
const subs = new Set<Sub>();

export type SWUpdateSnapshot = { available: boolean; apply: (() => void) | null };

let snapshot: SWUpdateSnapshot = { available: false, apply: null };

function notify() {
  for (const fn of subs) fn();
}

/** Banner-side subscribe — pair with useSyncExternalStore. */
export function subscribeSWUpdate(fn: Sub): () => void {
  subs.add(fn);
  return () => void subs.delete(fn);
}

/** Banner-side snapshot: is an update waiting, and how do we apply it?
 *  Stable reference until swUpdateAvailable replaces it (see note above). */
export function getSWUpdate(): SWUpdateSnapshot {
  return snapshot;
}

/** Boot-side — a new service worker is installed + waiting; arm the banner.
 *  `applyFn` triggers the actual update (→ updateSW → SKIP_WAITING → reload). */
export function swUpdateAvailable(applyFn: () => void): void {
  snapshot = { available: true, apply: applyFn };
  notify();
}

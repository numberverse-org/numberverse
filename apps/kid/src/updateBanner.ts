/**
 * #1321 — PWA update-banner bridge (boot-chunk ↔ banner UI).
 *
 * The service-worker registration lives in the BOOT chunk (main.tsx, so it
 * never blocks first paint); the update banner also renders from the boot
 * chunk (so it keeps working while the App chunk is being swapped). This tiny
 * module is the state seam between them — plain subscribe/notify, no React,
 * no zustand, so importing it costs almost nothing in the boot bundle.
 */
type Sub = () => void;
const subs = new Set<Sub>();

let available = false;
let apply: (() => void) | null = null;

function notify() {
  for (const fn of subs) fn();
}

/** Banner-side subscribe — pair with useSyncExternalStore. */
export function subscribeSWUpdate(fn: Sub): () => void {
  subs.add(fn);
  return () => void subs.delete(fn);
}

/** Banner-side snapshot: is an update waiting, and how do we apply it? */
export function getSWUpdate(): { available: boolean; apply: (() => void) | null } {
  return { available, apply };
}

/** Boot-side — a new service worker is installed + waiting; arm the banner.
 *  `applyFn` triggers the actual update (→ updateSW → SKIP_WAITING → reload). */
export function swUpdateAvailable(applyFn: () => void): void {
  available = true;
  apply = applyFn;
  notify();
}

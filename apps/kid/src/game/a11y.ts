/**
 * 🧏 #250 — kid-side of the GLOBAL accessibility toggles.
 *
 * Same-origin with the parent portal, so both read/write ONE localStorage key
 * (`nv_a11y`, pure shape/parsing in @numberverse/core). Applying = toggling
 * `.nv-big-text` / `.nv-high-contrast` classes on <html> so every screen
 * scales. A `storage` listener keeps open tabs (kid app ↔ portal) in sync.
 */
import {
  a11yStorageKey,
  a11yToStorage,
  parseA11yPrefs,
  A11Y_DEFAULTS,
  type A11yPrefs as CoreA11yPrefs,
} from "@numberverse/core";

export type A11yPrefs = CoreA11yPrefs;

export function readA11y(): A11yPrefs {
  try {
    return parseA11yPrefs(localStorage.getItem(a11yStorageKey()));
  } catch {
    return { ...A11Y_DEFAULTS };
  }
}

export function writeA11y(p: A11yPrefs): void {
  try {
    localStorage.setItem(a11yStorageKey(), a11yToStorage(p));
  } catch {
    /* ignore */
  }
  applyA11y(p);
}

export function applyA11y(p: A11yPrefs): void {
  const el = document.documentElement;
  el.classList.toggle("nv-big-text", p.bigText);
  el.classList.toggle("nv-high-contrast", p.highContrast);
}

/** Apply on boot + live-sync open tabs on storage changes. Returns an
 *  unsubscribe that an effect should call on unmount. */
export function initA11y(): () => void {
  applyA11y(readA11y());
  const onStorage = (e: StorageEvent) => {
    if (e.key === a11yStorageKey()) applyA11y(readA11y());
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

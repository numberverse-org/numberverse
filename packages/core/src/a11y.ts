/**
 * 🧏 #250 — shared accessibility prefs (big text + high contrast).
 *
 * The parent portal and the kid app are SAME-ORIGIN (`kids.munna-khan.xyz` and
 * `kids.munna-khan.xyz/parent/`), so both read/write ONE localStorage key
 * (`nv_a11y`). Toggling big text in the kid app applies to the parent portal
 * the next time it opens (and vice-versa) — a genuine global toggle.
 *
 * This module is PURE (no DOM) so it lives in core and both apps share the
 * exact same shape/parsing. The DOM-apply side is tiny and app-local.
 */

export interface A11yPrefs {
  /** Scale the whole UI's type up (≥1.2×) for readers who need it. */
  bigText: boolean;
  /** Boost foreground/background contrast + thicker borders + focus rings. */
  highContrast: boolean;
}

export const A11Y_DEFAULTS: A11yPrefs = { bigText: false, highContrast: false };

/** The single shared localStorage key — the "global toggle" contract. */
export function a11yStorageKey(): string {
  return "nv_a11y";
}

/** Parse the raw localStorage value into prefs. Malformed/unknown → defaults
 *  (never throws — a tampered key can't break the app). */
export function parseA11yPrefs(raw: string | null): A11yPrefs {
  if (!raw) return { ...A11Y_DEFAULTS };
  try {
    const j = JSON.parse(raw) as Partial<A11yPrefs>;
    return {
      bigText: j.bigText === true,
      highContrast: j.highContrast === true,
    };
  } catch {
    return { ...A11Y_DEFAULTS };
  }
}

/** Serialize for storage. */
export function a11yToStorage(p: A11yPrefs): string {
  return JSON.stringify(p);
}

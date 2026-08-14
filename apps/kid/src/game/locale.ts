/**
 * Tiny app-language bridge shared by game code (Phaser scenes) and React.
 * Kept dependency-free so scenes can read the current UI language without
 * threading props through every scene's create().
 *
 * Locale packs live in @numberverse/core (packages/core/src/locale.ts) — this
 * file is just the runtime "which locale is active" holder. Adding a language
 * later (Arabic, Hindi…) = register a pack + pick it here; nothing else in the
 * app changes (#131).
 */

import {
  LOCALES,
  getLocale as resolveLocale,
  currentFestival as resolveFestival,
  type LocalePack,
} from "@numberverse/core";

const DEFAULT_CODE = "en";

// #1224 — the nv_lang read is DEFERRED out of module top-level: main.tsx needs
// the language for the splash tagline and reads nv_lang itself (guarded, no
// core import), while THIS module initializes lazily on the first accessor
// call. App.tsx calls setAppLang(lang) on boot (after its guarded nv_lang
// read), so the first getAppLang()/getLocale() below resolves to the same
// value — but a storage exception in private browsing can never abort this
// module's eval, and nothing touches storage during module-graph eval.
let appCode: string | null = null;

function ensureCode(): string {
  if (appCode) return appCode;
  try {
    appCode = localStorage.getItem("nv_lang") || DEFAULT_CODE;
  } catch {
    appCode = DEFAULT_CODE; // storage denied — English default
  }
  return appCode;
}

/** Validated: unknown codes fall back to en (never a broken state). */
export function setAppLang(code: string) {
  appCode = LOCALES[code] ? code : DEFAULT_CODE;
}

/** The active locale pack (dir, digits, voice, curriculum…) — the app reads this. */
export function getLocale(): LocalePack {
  return resolveLocale(ensureCode());
}

/** Compatibility: the active locale code ("en" | "bn" today, "ar"|"hi" later). */
export function getAppLang(): string {
  return ensureCode();
}

/** The active festival for the current locale (null off-season) — #137. */
export function currentFestival(): import("@numberverse/core").FestivalEvent | null {
  return resolveFestival(ensureCode());
}

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
  type LocalePack,
} from "@numberverse/core";

const DEFAULT_CODE = "en";

let appCode: string =
  typeof localStorage !== "undefined"
    ? localStorage.getItem("nv_lang") || DEFAULT_CODE
    : DEFAULT_CODE;

/** Validated: unknown codes fall back to en (never a broken state). */
export function setAppLang(code: string) {
  appCode = LOCALES[code] ? code : DEFAULT_CODE;
}

/** The active locale pack (dir, digits, voice, curriculum…) — the app reads this. */
export function getLocale(): LocalePack {
  return resolveLocale(appCode);
}

/** Compatibility: the active locale code ("en" | "bn" today, "ar"|"hi" later). */
export function getAppLang(): string {
  return appCode;
}

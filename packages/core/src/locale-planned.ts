/**
 * 🇸🇦 🇮🇳 — PLANNED locale scaffolds (research only, NOT yet shipping).
 *
 * Kept OUT of the shipped LOCALES registry so the kid app's bundle tree-shakes
 * them away entirely: the i18n rule is "only what ships ships". A future app
 * that researches ar/hi imports this module explicitly and merges it:
 *
 *   import { PLANNED_LOCALES, registerPlannedLocales } from "@numberverse/core";
 *   registerPlannedLocales(LOCALES);
 */
import type { LocalePack } from "./locale.js";

export const PLANNED_LOCALES: Record<string, LocalePack> = {
  ar: {
    code: "ar",
    nativeName: "العربية",
    dir: "rtl",
    digits: "arabic-indic",
    localeTag: "ar-SA",
    curriculum: "saudi-arabia",
    voice: "ar-SA",
    status: "planned",
    festivals: [
      { key: "ramadan", emoji: "🌙", windows: [
        { start: "2026-02-17", end: "2026-03-18" }, { start: "2027-02-07", end: "2027-03-08" },
        { start: "2028-01-27", end: "2028-02-25" },
      ] },
      { key: "eid_fitr", emoji: "⭐", windows: [
        { start: "2026-03-19", end: "2026-03-24" }, { start: "2027-03-09", end: "2027-03-14" },
        { start: "2028-02-26", end: "2028-03-02" },
      ] },
      { key: "eid_adha", emoji: "🕌", windows: [
        { start: "2026-05-26", end: "2026-05-31" }, { start: "2027-05-15", end: "2027-05-20" },
        { start: "2028-05-04", end: "2028-05-09" },
      ] },
    ],
  },
  hi: {
    code: "hi",
    nativeName: "हिन्दी",
    dir: "ltr",
    digits: "devanagari",
    localeTag: "hi-IN",
    curriculum: "india-ncert",
    voice: "hi-IN",
    status: "planned",
    festivals: [
      { key: "diwali", emoji: "🪔", windows: [
        { start: "2026-11-06", end: "2026-11-12" }, { start: "2027-10-27", end: "2027-11-02" },
        { start: "2028-10-15", end: "2028-10-21" },
      ] },
      { key: "holi", emoji: "🎨", windows: [
        { start: "2026-03-02", end: "2026-03-08" }, { start: "2027-03-21", end: "2027-03-27" },
        { start: "2028-03-11", end: "2028-03-17" },
      ] },
    ],
  },
};

/** Extend a shipped registry with the planned scaffolds (research/preview only). */
export function registerPlannedLocales(registry: Record<string, LocalePack>): void {
  for (const [code, pack] of Object.entries(PLANNED_LOCALES)) registry[code] = pack;
}

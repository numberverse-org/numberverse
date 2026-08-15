/* i18n — app language-pack loader (English / বাংলা). #881 — the full EN and BN
 * dictionaries used to live here as one ~112KB static module. They are now
 * code-split into i18n-en.ts / i18n-bn.ts; this module top-level-awaits ONLY
 * the active locale so the boot graph never ships both languages. The Bangla
 * digit helpers live in i18n-core.ts so game scenes can import bnNum() without
 * pulling this loader (or either dictionary) into the Phaser engine chunk.
 *
 * i18n seams: to add a language/country later, extend `Lang`, add a locale
 * module, register it in `loadDict`, and (for digits) extend BN_DIGITS/
 * per-locale digit maps. The kid app is architected so every user-facing
 * string flows through STR.
 */

import { BN_DIGITS, BN_MONTHS, bnNum, type Lang, type Strings } from "./i18n-core";

export { BN_DIGITS, BN_MONTHS, bnNum };
export type { Lang, Strings };

const BOOT_LANG: Lang = (() => {
  try {
    return localStorage.getItem("nv_lang") === "bn" ? "bn" : "en";
  } catch {
    return "en"; // storage denied — English default
  }
})();

/** The loaded dictionaries. STR always has the ACTIVE locale synchronously;
 *  the other locale is filled by ensureStrings() when the kid switches. */
export const STR: Record<Lang, Strings> = {
  en: {} as Strings,
  bn: {} as Strings,
};

const loaded: Record<Lang, Strings | null> = { en: null, bn: null };

async function loadDict(lang: Lang): Promise<Strings> {
  const dict = lang === "bn"
    ? (await import("./i18n-bn")).bn
    : (await import("./i18n-en")).en;
  loaded[lang] = dict;
  STR[lang] = dict;
  return dict;
}

// Top-level await is deliberate: the module graph (App chunk) waits here, so
// the first render always has the ACTIVE language synchronously in STR. The
// other language stays a separate lazy chunk loaded on language switch.
await loadDict(BOOT_LANG);

/** Load (or return the cached) strings for a language before using STR[lang]. */
export function ensureStrings(lang: Lang): Promise<Strings> {
  return loaded[lang] ? Promise.resolve(loaded[lang] as Strings) : loadDict(lang);
}

/** 📚 #330 — misconception codes → parent-friendly labels (EN + BN). Plain
 *  strings on purpose (not t()) so the class-insights card stays readable
 *  without bloating the i18n table with a full code dictionary. */
export const MISCONCEPTION_LABELS: Record<string, { en: string; bn: string }> = {
  "overcount-1": { en: "Counts one too many", bn: "এক বেশি গুনে" },
  "undercount-1": { en: "Counts one too few", bn: "এক কম গুনে" },
  "off-by-ten": { en: "Off by ten — tens/ones mix-up", bn: "দশের ঘরের গোলমাল" },
  "off-by-hundred": { en: "Off by one hundred — place mix-up", bn: "শতকের ঘরের গোলমাল" },
  double: { en: "Doubles the number", bn: "সংখ্যা দ্বিগুণ করে" },
  half: { en: "Halves the number", bn: "সংখ্যা অর্ধেক করে" },
  reversal: { en: "Writes the digit backwards", bn: "অঙ্ক উল্টে লেখে" },
  "repeated-error": { en: "Same mistake keeps repeating", bn: "একই ভুল বারবার হয়" },
};

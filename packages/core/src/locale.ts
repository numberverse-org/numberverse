/**
 * 🌍 Locale packs — one config object per language+country.
 *
 * Numberverse is Bangla-first today (curriculum NCTB, Bangladesh), but the
 * app is architected so ANY language+country is a CONFIG addition, not a code
 * rewrite (#131): add a `LocalePack` here + a dictionary in the kid app's
 * i18n table + a curriculum/content pack, and the whole app follows.
 *
 * A `LocalePack` captures every language-dependent decision the UI makes:
 *   - which script + text direction (Arabic is RTL)
 *   - which numeral set (Bangla ০১২৩, Arabic-Indic ٠١٢٣, Devanagari ०१२३, Latin)
 *   - the BCP-47 tag for Intl + TTS voice hints
 *   - which curriculum/content catalog this country uses
 *   - whether it ships today or is a planned scaffold
 *
 * Pure + dependency-free so CI can test it without a bundler or browser.
 */

export type TextDir = "ltr" | "rtl";
export type DigitSet = "latin" | "bengali" | "arabic-indic" | "devanagari";
export type LocaleStatus = "shipped" | "planned";

export interface LocalePack {
  /** BCP-47-style code — the key in nv_lang and the i18n DICTS table. */
  code: string;
  /** Human label in its own script (for the language picker). */
  nativeName: string;
  /** Text direction — Arabic/Hebrew/Urdu are "rtl". */
  dir: TextDir;
  /** Which numeral set the UI displays. */
  digits: DigitSet;
  /** BCP-47 locale tag for Intl + number grouping (e.g. "bn-BD", "ar-SA"). */
  localeTag: string;
  /** Curriculum/content catalog key — country-based content packs. */
  curriculum: string;
  /** TTS voice hint used by the speech layer (Bangla: "bn-BD"). */
  voice: string;
  /** "shipped" locales are audited for i18n parity; "planned" are research. */
  status: LocaleStatus;
}

/** The single registry — adding a country = adding one entry here. */
export const LOCALES: Record<string, LocalePack> = {
  en: {
    code: "en",
    nativeName: "English",
    dir: "ltr",
    digits: "latin",
    localeTag: "en-GB",
    curriculum: "early-years-uk",
    voice: "en-GB",
    status: "shipped",
  },
  bn: {
    code: "bn",
    nativeName: "বাংলা",
    dir: "ltr",
    digits: "bengali",
    localeTag: "bn-BD",
    curriculum: "nctb-bangladesh",
    voice: "bn-BD",
    status: "shipped",
  },
  // ── planned scaffold (research only — NOT yet shipping) ──
  ar: {
    code: "ar",
    nativeName: "العربية",
    dir: "rtl",
    digits: "arabic-indic",
    localeTag: "ar-SA",
    curriculum: "saudi-arabia",
    voice: "ar-SA",
    status: "planned",
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
  },
};

/** Digit glyphs per numeral set — the UI maps 0-9 through this. */
const DIGITS: Record<DigitSet, string[]> = {
  latin: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  bengali: ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"],
  "arabic-indic": ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"],
  devanagari: ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"],
};

export function getLocale(code: string): LocalePack {
  return LOCALES[code] ?? LOCALES.en;
}

/** Every shipped locale code, sorted — used by the i18n parity audit. */
export function shippedLocales(): string[] {
  return Object.values(LOCALES)
    .filter((l) => l.status === "shipped")
    .map((l) => l.code)
    .sort();
}

/** Render a number in a locale's numeral set — replaces scattered BN_D tables. */
export function formatNumber(n: number, code: string): string {
  const set = DIGITS[getLocale(code).digits];
  return String(n).replace(/\d/g, (d) => set[Number(d)]);
}

/** Convenience: is this locale right-to-left? (drives the app's dir attribute.) */
export function isRtl(code: string): boolean {
  return getLocale(code).dir === "rtl";
}

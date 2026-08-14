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

/**
 * One festival/holiday for a country pack (#137). Fully CONFIG — no code:
 * fixed feasts get a single MM-DD window; lunar feasts (Eid, Ramadan) move
 * ~11 days earlier each Gregorian year, so they carry one window per year as
 * data. The kid app decorates the journey/home while a window is active.
 */
export interface FestivalEvent {
  /** Machine key — the UI looks up a localized label via this key. */
  key: string;
  /** Decor emoji shown in the banner. */
  emoji: string;
  /** Inclusive Gregorian windows ("MM-DD" → "MM-DD"), one per occurrence. */
  windows: Array<{ start: string; end: string }>;
}

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
  /** Country festivals — config, the UI just reads the active one. */
  festivals: FestivalEvent[];
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
    festivals: [
      { key: "christmas", emoji: "🎄", windows: [{ start: "12-01", end: "12-31" }] },
    ],
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
    festivals: [
      // Pohela Boishakh — Bengali New Year, fixed (Apr 14).
      { key: "boishakh", emoji: "🎋", windows: [{ start: "04-01", end: "04-30" }] },
      // Lunar feasts move ~11 days earlier each year — one window per year, as config.
      { key: "eid_fitr", emoji: "🌙", windows: [
        { start: "2026-03-18", end: "2026-03-23" }, { start: "2027-03-07", end: "2027-03-12" },
        { start: "2028-02-24", end: "2028-02-29" }, { start: "2029-02-12", end: "2029-02-17" },
        { start: "2030-02-02", end: "2030-02-07" },
      ] },
      { key: "eid_adha", emoji: "🕌", windows: [
        { start: "2026-05-25", end: "2026-05-30" }, { start: "2027-05-14", end: "2027-05-19" },
        { start: "2028-05-03", end: "2028-05-08" }, { start: "2029-04-22", end: "2029-04-27" },
        { start: "2030-04-11", end: "2030-04-16" },
      ] },
    ],
  },
  // NOTE: planned locales (ar/hi) live in locale-planned.ts — kept OUT of this
  // shipped registry so the kid app tree-shakes them (only what ships ships).
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

/** The active festival for a locale on a given day (defaults to today). */
export function currentFestival(code: string, today: Date = new Date()): FestivalEvent | null {
  const md = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const full = `${today.getFullYear()}-${md}`;
  for (const f of getLocale(code).festivals) {
    for (const w of f.windows) {
      // Fixed "MM-DD" windows match every year; full "YYYY-MM-DD" windows are
      // year-specific (lunar feasts). Lexicographic compare works because every
      // field is zero-padded.
      if (w.start.length === 5) {
        if (md >= w.start && md <= w.end) return f;
      } else if (full >= w.start && full <= w.end) {
        return f;
      }
    }
  }
  return null;
}

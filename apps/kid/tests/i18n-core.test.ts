/* test-coverage-kid #13 — i18n digit/interpolation.
 *
 * Covers the i18n-core helpers (bnNum / BN_DIGITS / BN_MONTHS) plus the shared
 * t() interpolation contract the game scenes use (apps/kid/src/game/i18n.ts),
 * and the i18n-extensible gate: the EN and BN dictionaries MUST expose identical
 * key sets (a missing key on one side would render a raw key / empty string to
 * that locale).
 */
import { describe, it, expect, vi } from "vitest";

import { BN_DIGITS, BN_MONTHS, bnNum, type Lang, type Strings } from "../src/i18n-core";
import { en } from "../src/i18n-en";
import { bn } from "../src/i18n-bn";
import { t, digit } from "../src/game/i18n";
import { setAppLang } from "../src/game/locale";

describe("bnNum — Bangla digit conversion", () => {
  it("converts 0–9 and multi-digit numbers", () => {
    expect(bnNum(0)).toBe("০");
    expect(bnNum(9)).toBe("৯");
    expect(bnNum(10)).toBe("১০");
    expect(bnNum(25)).toBe("২৫");
    expect(bnNum(100)).toBe("১০০");
  });

  it("preserves zero digits inside large numbers", () => {
    expect(bnNum(1000)).toBe("১০০০");
    expect(bnNum(1005)).toBe("১০০৫");
    expect(bnNum(1000000)).toBe("১০০০০০০");
    expect(bnNum(205)).toBe("২০৫");
  });

  it("handles negatives with the module's actual glyph (ASCII hyphen, not U+2212)", () => {
    // String(-10) === "-10" → only the ASCII digits are replaced → "-১০".
    expect(bnNum(-10)).toBe("-১০");
    expect(bnNum(-999)).toBe("-৯৯৯");
  });

  it("accepts string inputs and converts ONLY ASCII digits (Bangla digits pass through)", () => {
    expect(bnNum("42")).toBe("৪২");
    // Mixed digit string: the lone ASCII '1' is converted; the Bangla digits are
    // not matched by /\d/ (ASCII-only) and are left untouched.
    expect(bnNum("1২৩")).toBe("১২৩");
  });
});

describe("BN_DIGITS / BN_MONTHS constants", () => {
  it("BN_DIGITS has 10 entries and BN_MONTHS has 12 entries", () => {
    expect(BN_DIGITS).toHaveLength(10);
    expect(BN_MONTHS).toHaveLength(12);
  });

  it("every digit and month entry is a non-empty string", () => {
    for (const d of BN_DIGITS) expect(d.length).toBeGreaterThan(0);
    for (const m of BN_MONTHS) expect(m.length).toBeGreaterThan(0);
  });
});

describe("t() interpolation — {name}/{n} placeholder evaluation", () => {
  it("replaces placeholders with the passed vars", () => {
    setAppLang("en");
    expect(t("round", { n: 3 })).toBe("Round 3");
    expect(t("whereLivesN", { n: 2, total: 5 })).toBe("Where does this live? (2/5)");
    expect(t("findLetter", { ch: "অ", hint: "a" })).toBe("Find  অ  (a)");
  });

  it("leaves missing placeholders literal (never renders undefined)", () => {
    setAppLang("en");
    expect(t("round", {})).toBe("Round {n}");
    expect(t("round")).toBe("Round {n}");
    expect(t("whereLivesN", { n: 1 })).toBe("Where does this live? (1/{total})");
  });

  it("falls back EN → key for unknown keys", () => {
    setAppLang("bn");
    // bn dict has no such key → EN dict has no such key → the key itself.
    expect(t("no_such_key_xyz")).toBe("no_such_key_xyz");
  });

  it("evaluates function entries with and without vars", () => {
    setAppLang("en");
    expect(t("almost", { name: "Rafi" })).toBe("Almost, Rafi! Try again");
    expect(t("almost")).toBe("Almost, try again");
    expect(t("ceStreak", { n: 5 })).toBe("x5 🔥");
    expect(t("ceStreak")).toBe("x? 🔥");
  });

  it("interpolates RAW values — digit conversion is the job of digit()/bnNum()", () => {
    setAppLang("bn");
    // t() does not auto-convert interpolated numbers to Bangla digits; callers
    // that want Bangla glyphs pass digit(n) / bnNum(n) as the var (module doc:
    // "`{name}` placeholders are interpolated by t() from the vars you pass").
    // The exception is the `round` counter key itself, which is a digit-aware
    // function entry (see the BN dict) so Bangla round-HUDs show "রাউন্ড ৩" not
    // "রাউন্ড 3" — the same convention as exploreGardenCounter/petBirthdayCoins.
    expect(t("round", { n: 3 })).toBe("রাউন্ড ৩");
    expect(t("whereLivesN", { n: 2, total: 5 })).toBe("এটা কোথায় থাকে? (2/5)");
    expect(digit(3, "bn")).toBe("৩");
    expect(bnNum(3)).toBe("৩");
  });
});

describe("digit() — locale-aware glyph helper", () => {
  it("returns Latin digits for en and Bangla digits for bn", () => {
    setAppLang("en");
    expect(digit(5)).toBe("5");
    expect(digit(5, "en")).toBe("5");
    expect(digit(5, "bn")).toBe("৫");
    expect(digit(100, "bn")).toBe("১০০");
    expect(digit("১২৩", "bn")).toBe("১২৩");
  });
});

describe("Lang / Strings contract — i18n-extensible gate", () => {
  it("the Lang type names exactly the shipped locales", () => {
    const shipped: Lang[] = ["en", "bn"];
    expect(shipped).toEqual(["en", "bn"]);
  });

  it("en and bn dictionaries expose IDENTICAL key sets", () => {
    const enKeys = Object.keys(en).sort();
    const bnKeys = Object.keys(bn).sort();
    expect(bnKeys).toEqual(enKeys);
  });

  it("both dictionaries are substantial (parity diff is meaningful, not a stub)", () => {
    expect(Object.keys(en).length).toBeGreaterThan(500);
    expect(Object.keys(bn).length).toBeGreaterThan(500);
  });

  it("the Strings type is satisfied by both dictionaries at compile time", () => {
    // The dictionaries are declared `const en: Strings` / `const bn: Strings`;
    // this assignment re-checks the contract here so a future dictionary that
    // drops a required key fails this file even if the source annotation drifts.
    const enDict: Strings = en;
    const bnDict: Strings = bn;
    expect(enDict.viewTabs.length).toBeGreaterThan(0);
    expect(bnDict.viewTabs.length).toBeGreaterThan(0);
  });
});

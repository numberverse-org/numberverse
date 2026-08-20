/**
 * 📄 Printable worksheet generator (#132).
 *
 * Turns a kid's weak-skills list into a print-ready practice sheet. Math
 * skills get real generated problems (a+b, a−b, a×b, a÷b, fractions, time,
 * money, place value); language/letter skills get a "say & write" prompt
 * (worksheets can't ask a pre-reader to decode, so those list the skill +
 * an at-home activity instead of a fake problem).
 *
 * Deterministic by seed so re-opening the sheet gives the same problems
 * until the parent regenerates it.
 */

import type { WeakSkillRow } from "./api";

/** #2963 — Bengali numeral converter (mirrors the portal's toBnNum #1559) so
 *  a bn worksheet prints ০–৯ digits instead of ASCII. */
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
function toBnNum(n: number): string {
  return String(n).replace(/[0-9]/g, (x) => BN_DIGITS[Number(x)]);
}

export interface WorksheetProblem {
  skillId: string;
  title: string;
  prompt: string;
  /** blank answer lines (2 = "a + b = ____") */
  lines: number;
}

/** 32-bit LCG — small, deterministic, no deps. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const ri = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

function addProblems(r: () => number, maxSum: number, n: number, num: (x: number) => string): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = ri(r, 1, maxSum - 1);
    const b = ri(r, 1, maxSum - a);
    out.push([`${num(a)} + ${num(b)} =`, a + b]);
  }
  return out;
}
function subProblems(r: () => number, max: number, n: number, num: (x: number) => string): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = ri(r, 2, max);
    const b = ri(r, 1, a);
    out.push([`${num(a)} − ${num(b)} =`, a - b]);
  }
  return out;
}
function multProblems(r: () => number, maxF: number, n: number, num: (x: number) => string): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = ri(r, 2, maxF);
    const b = ri(r, 2, maxF);
    out.push([`${num(a)} × ${num(b)} =`, a * b]);
  }
  return out;
}
function divProblems(r: () => number, divisors: number[], n: number, num: (x: number) => string): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (let i = 0; i < n; i++) {
    const d = divisors[ri(r, 0, divisors.length - 1)];
    const q = ri(r, 2, 9);
    out.push([`${num(d * q)} ÷ ${num(d)} =`, q]);
  }
  return out;
}

/** Build a printable sheet from weak skills. `lang` "bn" picks Bangla titles. */
export function worksheetFor(rows: WeakSkillRow[], lang: "en" | "bn", seed = 20260812): WorksheetProblem[] {
  const r = rng(seed + rows.length * 7);
  const out: WorksheetProblem[] = [];
  // #2963 — locale-aware digit formatter: bn prompts print ০–৯, en prints ASCII.
  const num = (x: number) => (lang === "bn" ? toBnNum(x) : String(x));
  for (const s of rows) {
    const title = lang === "bn" && s.title_bn ? s.title_bn : s.title;
    switch (s.skill_id) {
      case "fruit-tree-add":
      case "add-within-10":
        for (const [q] of addProblems(r, 10, 5, num)) out.push({ skillId: s.skill_id, title, prompt: q, lines: 1 });
        break;
      case "add-within-20":
        for (const [q] of addProblems(r, 20, 5, num)) out.push({ skillId: s.skill_id, title, prompt: q, lines: 1 });
        break;
      case "add-to-20":
        for (const [q] of addProblems(r, 20, 8, num)) out.push({ skillId: s.skill_id, title, prompt: q, lines: 1 });
        break;
      case "add-sub-100":
        for (let i = 0; i < 5; i++) {
          const a = ri(r, 11, 99);
          const b = ri(r, 1, 99 - a);
          out.push({ skillId: s.skill_id, title, prompt: `${num(a)} + ${num(b)} =`, lines: 1 });
        }
        for (let i = 0; i < 5; i++) {
          const a = ri(r, 21, 99);
          const b = ri(r, 1, a - 1);
          out.push({ skillId: s.skill_id, title, prompt: `${num(a)} − ${num(b)} =`, lines: 1 });
        }
        break;
      case "add-sub-regroup":
        for (let i = 0; i < 4; i++) {
          const a = ri(r, 102, 999);
          const b = ri(r, 11, 999 - a);
          out.push({ skillId: s.skill_id, title, prompt: `${num(a)} + ${num(b)} =`, lines: 1 });
        }
        for (let i = 0; i < 4; i++) {
          const a = ri(r, 110, 999);
          const b = ri(r, 11, a - 1);
          out.push({ skillId: s.skill_id, title, prompt: `${num(a)} − ${num(b)} =`, lines: 1 });
        }
        break;
      case "sub-within-10":
        for (const [q] of subProblems(r, 10, 5, num)) out.push({ skillId: s.skill_id, title, prompt: q, lines: 1 });
        break;
      case "sub-within-20":
        for (const [q] of subProblems(r, 20, 5, num)) out.push({ skillId: s.skill_id, title, prompt: q, lines: 1 });
        break;
      case "number-bonds-10":
        for (let i = 0; i < 5; i++) {
          const a = ri(r, 1, 9);
          out.push({ skillId: s.skill_id, title, prompt: `${num(a)} + ___ = ${num(10)}`, lines: 1 });
        }
        break;
      case "mult-facts-2-5-10":
        for (const [q] of multProblems(r, 10, 6, num)) out.push({ skillId: s.skill_id, title, prompt: q, lines: 1 });
        break;
      case "mult-facts-2-10":
        for (const [q] of multProblems(r, 10, 8, num)) out.push({ skillId: s.skill_id, title, prompt: q, lines: 1 });
        break;
      case "div-facts-fair-share":
      case "division-facts":
        for (const [q] of divProblems(r, [2, 3, 5, 10], 6, num)) out.push({ skillId: s.skill_id, title, prompt: q, lines: 1 });
        break;
      case "div-facts-by-2-3":
        for (const [q] of divProblems(r, [2, 3], 5, num)) out.push({ skillId: s.skill_id, title, prompt: q, lines: 1 });
        break;
      case "fractions-intro":
        out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? "৪টির মধ্যে ২টি ছায়া দাও — ভগ্নাংশ লিখো ___" : "Shade 2 of the 4 boxes. Write the fraction ___", lines: 1 });
        out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? "একটি বর্গের অর্ধেক ___ (লিখো: ½, ¼, বা ¾)" : "What fraction of a square is one half? ___ (write ½, ¼ or ¾)", lines: 1 });
        break;
      case "fractions-equiv":
        out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? "½ = ___/৪  (সমতুল্য ভগ্নাংশ)" : "½ = ___ / 4 (equivalent fraction)", lines: 1 });
        out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? "৩/৪ = ___/৮" : "¾ = ___ / 8", lines: 1 });
        break;
      case "tell-time":
        for (let i = 0; i < 4; i++) {
          const h = ri(r, 1, 12);
          out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? `ছোট কাঁটা ${num(h)}-এ, বড় কাঁটা ১২-এ → সময় ___` : `Short hand on ${h}, long hand on 12 → time ___`, lines: 1 });
        }
        break;
      case "place-value-1000":
        for (let i = 0; i < 3; i++) {
          const n = ri(r, 1234, 9876);
          const th = Math.floor(n / 1000);
          const hu = Math.floor((n % 1000) / 100);
          const te = Math.floor((n % 100) / 10);
          const on = n % 10;
          out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? `${num(n)} = ___ + ___ + ___ + ___  (হাজার + শত + দশ + এক)` : `${n} = ___ + ___ + ___ + ___  (thousands + hundreds + tens + ones)`, lines: 1 });
          if (i === 0) out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? `${num(th)} হাজার, ${num(hu)} শত, ${num(te)} দশ, ${num(on)} এক → সংখ্যাটি লেখো ___` : `${th} thousands, ${hu} hundreds, ${te} tens, ${on} ones → write the number ___`, lines: 1 });
        }
        break;
      case "bd-taka":
        for (let i = 0; i < 4; i++) {
          const total = ri(r, 5, 10);
          const price = ri(r, 1, total - 1);
          out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? `তোমার কাছে ৳${num(total)}, খেলনা ৳${num(price)} → ফেরত ___` : `You have ৳${total}, a toy costs ৳${price} → change ___`, lines: 1 });
        }
        break;
      case "decimals-intro":
        out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? "০.৫ + ০.২৫ = ___" : "0.5 + 0.25 = ___", lines: 1 });
        out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? "কোনটি বড়: ০.৯ নাকি ০.৭৫? ___" : "Which is bigger: 0.9 or 0.75? ___", lines: 1 });
        break;
      case "percent-intro":
        out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? `${num(50)}% এর ${num(10)} = ___` : "50% of 10 = ___", lines: 1 });
        out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? `${num(25)}% এর ${num(8)} = ___` : "25% of 8 = ___", lines: 1 });
        break;
      case "area-perimeter":
        out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? "৪ সেমি × ৩ সেমি আয়তক্ষেত্র → ক্ষেত্রফল ___ বর্গ সেমি" : "4 cm × 3 cm rectangle → area ___ cm²", lines: 1 });
        out.push({ skillId: s.skill_id, title, prompt: lang === "bn" ? "একই আয়তক্ষেত্রের পরিসীমা ___ সেমি" : "Same rectangle → perimeter ___ cm", lines: 1 });
        break;
      default:
        // Non-arithmetic skills (counting, letters, science, values…) get an
        // at-home activity prompt — a worksheet can't fake a pre-reader decode.
        out.push({
          skillId: s.skill_id,
          title,
          prompt:
            lang === "bn"
              ? `ঘরে এই দক্ষতা নিয়ে খেলো: অ্যাপে "${title}" খেলাটি চালাও — আজ ${num(s.attempts || 0)} বার চেষ্টা করেছো, সঠিক ${num(s.correct || 0)}।`
              : `Play "${title}" in the app at home — you've tried ${s.attempts || 0} times, got ${s.correct || 0} right.`,
          lines: 1,
        });
    }
  }
  return out;
}

import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { getAppLang } from "./locale";
import { t } from "./i18n";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, roundMeter, BTN_PRIMARY, type RoundMeterApi, NV_GOLD } from "./ui";
import { answerRow } from "./layout";

const LEVELS = GAMES.find((g) => g.id === "game-mathsolve")?.difficultyLevels ?? [1, 2, 3, 4, 5, 6];
const ROUNDS_TO_FINISH = 3;
const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure

/** Bilingual helper — new scenes are data-first; their UI copy lives here
 *  instead of growing the central i18n table (skill text lives in skills.ts). */
const L = (en: string, bn: string) => (getAppLang() === "bn" ? bn : en);

interface Round {
  prompt: string;
  fact: string;
  options: string[];
  correct: string;
  hint: string;
  hintBn: string;
}

const PROB_WORDS = ["certain", "likely", "unlikely", "impossible"] as const;
type ProbWord = (typeof PROB_WORDS)[number];
const PROB_LABEL: Record<ProbWord, string> = {
  certain: "Certain",
  likely: "Likely",
  unlikely: "Unlikely",
  impossible: "Impossible",
};
const PROB_LABEL_BN: Record<ProbWord, string> = {
  certain: "নিশ্চিত",
  likely: "সম্ভবত",
  unlikely: "অসম্ভাব্য",
  impossible: "অসম্ভব",
};

interface ProbItem {
  en: string;
  bn: string;
  word: ProbWord;
  tier: number;
}

const PROB_ITEMS: ProbItem[] = [
  { en: "The sun will rise tomorrow.", bn: "আগামীকাল সূর্য উঠবে।", word: "certain", tier: 1 },
  { en: "A stone will float on water.", bn: "পাথর পানিতে ভাসবে।", word: "impossible", tier: 1 },
  { en: "A pig will fly.", bn: "শূকর উড়বে।", word: "impossible", tier: 1 },
  { en: "A baby will grow into an adult.", bn: "শিশু বড় হয়ে প্রাপ্তবয়স্ক হবে।", word: "certain", tier: 1 },
  { en: "It will rain sometime this month.", bn: "এই মাসে কোনো না কোনো দিন বৃষ্টি হবে।", word: "likely", tier: 2 },
  { en: "You will win the lottery today.", bn: "আজ তুমি লটারি জিতবে।", word: "unlikely", tier: 3 },
  { en: "You will find a four-leaf clover today.", bn: "আজ তুমি চার পাতার ক্লোভার পাবে।", word: "unlikely", tier: 3 },
  { en: "It will snow in Dhaka in July.", bn: "জুলাইয়ে ঢাকায় তুষারপাত হবে।", word: "impossible", tier: 1 },
];

const RATE_ITEMS = [
  { en: "pens", bn: "কলম" },
  { en: "pencils", bn: "পেনসিল" },
  { en: "apples", bn: "আপেল" },
  { en: "oranges", bn: "কমলা" },
  { en: "notebooks", bn: "খাতা" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Phaser.Math.Between(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function numericOptions(correct: number, min = 0): number[] {
  const opts = new Set<number>([correct]);
  let delta = 1;
  let guard = 0;
  while (opts.size < 4 && guard++ < 40) {
    const cand = correct + (delta % 2 === 1 ? -delta : delta);
    if (cand >= min && cand !== correct) opts.add(cand);
    delta++;
  }
  return shuffle([...opts]);
}

/** One new answer-button scene for the band 6–7 "solve it yourself" strand.
 *  It hosts every new reasoning skill that has no legacy game: missing-number
 *  equations, one-step algebra, ratio simplification, unit rates, probability
 *  words and mean/mode/median. Each skill id selects the question generator;
 *  the scene keeps the same create/startRound/onRoundDone/questionPanel/
 *  modernAnswerButton/meter contract as PercentScene/DecimalsScene. */
export class MathSolveScene extends Phaser.Scene {
  private levels = LEVELS;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private challenge = false; // #1158 — band 6-7 independent mode (timed rounds, no reveal)
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private round!: Round;
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private factText!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("MathSolve");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; levels?: number[]; challenge?: boolean; skill?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levels = data.levels?.length ? data.levels : LEVELS;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.skillId = data.skill ?? "";
    // #1158 — challenge mode: band 6-7 skills (skill.challenge → App passes it)
    // get a per-round countdown bar and no hint/reveal on wrong.
    this.challenge = !!data.challenge;
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    this.background = this.add.graphics();
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, this.titleForSkill(), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.factText = this.add
      .text(0, 0, "", txt(42, NV_GOLD, { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private skillId = "";

  private titleForSkill(): string {
    switch (this.skillId) {
      case "alg-one-step":
        return L("One-step equations", "এক ধাপের সমীকরণ");
      case "alg-two-step":
        return L("Two-step equations", "দুই ধাপের সমীকরণ");
      case "ratio-simplify":
        return L("Simplify ratios", "অনুপাত ছোট করি");
      case "ratio-equivalent":
        return L("Equivalent ratios", "সমান অনুপাত");
      case "ratio-unit-rate":
        return L("Unit rates", "একক দর");
      case "prob-words":
        return L("Probability words", "সম্ভাবনার শব্দ");
      case "stats-mean-mode":
        return L("Mean, mode & median", "গড়, প্রচুরক ও মধ্যমা");
      case "stats-larger-sets":
        return L("Statistics: larger sets", "পরিসংখ্যান: বড় সেট");
      case "percent-change":
        return L("Percentage change", "শতকরা পরিবর্তন");
      case "geo-volume-angles":
        return L("Angles & volume", "কোণ ও আয়তন");
      default:
        return L("Missing numbers", "অজানা সংখ্যা");
    }
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.factText.setPosition(width / 2, height * 0.42);
    this.prompt.setPosition(width / 2, height - 150);
  }

  private get answersY() {
    return this.scale.height - 64;
  }

  private startRound() {
    this.clearButtons();
    this.round = this.buildRound();
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.factText.setText(this.round.fact);
    this.prompt.set(this.round.prompt);
    this.spawnButtons();
    this.armChallenge();
  }

  /* ── question generators (one per skill id) ── */
  private buildRound(): Round {
    switch (this.skillId) {
      case "alg-one-step":
        return this.oneStepRound();
      case "alg-two-step":
        return this.twoStepRound();
      case "ratio-simplify":
        return this.ratioSimplifyRound();
      case "ratio-equivalent":
        return this.ratioEquivalentRound();
      case "ratio-unit-rate":
        return this.unitRateRound();
      case "prob-words":
        return this.probabilityRound();
      case "stats-mean-mode":
        return this.statsRound();
      case "stats-larger-sets":
        return this.statsLargerRound();
      case "percent-change":
        return this.percentChangeRound();
      case "geo-volume-angles":
        return this.geometryRound();
      default:
        return this.missingNumberRound();
    }
  }

  private missingNumberRound(): Round {
    const level = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    let fact = "";
    let correct = 0;
    if (level <= 1) {
      const b = Phaser.Math.Between(8, 20);
      const a = Phaser.Math.Between(2, b - 2);
      correct = b - a;
      fact = `? + ${a} = ${b}`;
    } else if (level === 2) {
      const a = Phaser.Math.Between(2, 9);
      const b = Phaser.Math.Between(2, 15);
      correct = a + b;
      fact = `? − ${a} = ${b}`;
    } else {
      const kind = Phaser.Math.Between(0, 2);
      if (kind === 0) {
        const b = Phaser.Math.Between(10, 24);
        const a = Phaser.Math.Between(2, b - 2);
        correct = b - a;
        fact = `? + ${a} = ${b}`;
      } else if (kind === 1) {
        const a = Phaser.Math.Between(2, 9);
        const b = Phaser.Math.Between(2, 15);
        correct = a + b;
        fact = `? − ${a} = ${b}`;
      } else {
        const b = Phaser.Math.Between(4, 15);
        const a = Phaser.Math.Between(b + 2, b + 12);
        correct = a - b;
        fact = `${a} − ? = ${b}`;
      }
    }
    return {
      prompt: L("Find the missing number", "অজানা সংখ্যাটি খুঁজো"),
      fact,
      options: numericOptions(correct).map(String),
      correct: String(correct),
      hint: L(`Work backwards from ${fact}`, `উল্টোভাবে ভাবো: ${fact}`),
      hintBn: `উল্টোভাবে ভাবো: ${fact}`,
    };
  }

  private oneStepRound(): Round {
    const level = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    let fact = "";
    let correct = 0;
    if (level <= 1) {
      const a = Phaser.Math.Between(2, 12);
      const b = Phaser.Math.Between(a + 2, a + 16);
      correct = b - a;
      fact = `x + ${a} = ${b}`;
    } else if (level === 2) {
      const a = Phaser.Math.Between(2, 12);
      const b = Phaser.Math.Between(1, 14);
      correct = a + b;
      fact = `x − ${a} = ${b}`;
    } else {
      const kind = Phaser.Math.Between(0, 1);
      if (kind === 0) {
        const a = Phaser.Math.Between(3, 14);
        const b = Phaser.Math.Between(a + 1, a + 15);
        correct = b - a;
        fact = `x + ${a} = ${b}`;
      } else {
        const a = Phaser.Math.Between(2, 12);
        const b = Phaser.Math.Between(1, 12);
        correct = a + b;
        fact = `x − ${a} = ${b}`;
      }
    }
    return {
      prompt: L("Solve for x", "x-এর মান বের করো"),
      fact,
      options: numericOptions(correct).map(String),
      correct: String(correct),
      hint: L(`Do the opposite operation to isolate x`, `উল্টো অপারেশন করে x আলাদা করো`),
      hintBn: "উল্টো অপারেশন করে x আলাদা করো",
    };
  }

  private ratioSimplifyRound(): Round {
    const scale = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    const base: Array<[number, number]> = [
      [1, 2],
      [1, 3],
      [2, 3],
      [1, 4],
      [3, 4],
      [2, 5],
    ];
    const [p, q] = base[Phaser.Math.Between(0, base.length - 1)];
    const a = p * scale;
    const b = q * scale;
    const correct = `${p}:${q}`;
    const opts = new Set<string>([correct]);
    const cands = [`${a}:${q}`, `${p}:${b}`, `${p + 1}:${q}`, `${p}:${q + 1}`, `${p}:${q + 2}`];
    for (const c of cands) {
      if (opts.size >= 4) break;
      if (c !== correct) opts.add(c);
    }
    return {
      prompt: L("Simplify the ratio", "অনুপাতটি ছোট করো"),
      fact: `${a} : ${b} = ?`,
      options: shuffle([...opts]),
      correct,
      hint: L("Divide both sides by the same number", "দুই পাশকে একই সংখ্যা দিয়ে ভাগ করো"),
      hintBn: "দুই পাশকে একই সংখ্যা দিয়ে ভাগ করো",
    };
  }

  private ratioEquivalentRound(): Round {
    const scale = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    const base: Array<[number, number]> = [
      [1, 2],
      [1, 3],
      [2, 3],
      [1, 4],
      [3, 4],
      [2, 5],
    ];
    const [p, q] = base[Phaser.Math.Between(0, base.length - 1)];
    const a = p * scale;
    const b = q * scale;
    const correct = `${a}:${b}`;
    const opts = new Set<string>([correct]);
    const cands = [`${p}:${q + 1}`, `${p + 1}:${q}`, `${a}:${q}`, `${p}:${b}`, `${p}:${q + 2}`];
    for (const c of cands) {
      if (opts.size >= 4) break;
      if (c !== correct && c !== `${p}:${q}`) opts.add(c);
    }
    return {
      prompt: L("Tap the equivalent ratio", "সমান অনুপাতটি বাছো"),
      fact: `${p} : ${q}  =  ?`,
      options: shuffle([...opts]),
      correct,
      hint: L("Multiply (or divide) both sides by the same number", "দুই পাশকে একই সংখ্যা দিয়ে গুণ (বা ভাগ) করো"),
      hintBn: "দুই পাশকে একই সংখ্যা দিয়ে গুণ (বা ভাগ) করো",
    };
  }

  private unitRateRound(): Round {
    const items = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    const item = RATE_ITEMS[Phaser.Math.Between(0, RATE_ITEMS.length - 1)];
    const each = Phaser.Math.Between(3, 12);
    const total = items * each;
    return {
      prompt: L("Find the unit rate", "একক দর বের করো"),
      fact: L(`${items} ${item.en} cost ৳${total} — 1 costs?`, `${items} ${item.bn}-এর দাম ৳${total} — ১টির দাম?`),
      options: numericOptions(each, 1).map(String),
      correct: String(each),
      hint: L(`Divide the total by ${items}`, `মোটকে ${items} দিয়ে ভাগ করো`),
      hintBn: `মোটকে ${items} দিয়ে ভাগ করো`,
    };
  }

  private probabilityRound(): Round {
    const level = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    const pool = PROB_ITEMS.filter((p) => p.tier <= level);
    const item = pool[Phaser.Math.Between(0, pool.length - 1)];
    const word = item.word;
    const labels = PROB_WORDS.map((w) => (getAppLang() === "bn" ? PROB_LABEL_BN[w] : PROB_LABEL[w]));
    return {
      prompt: L("How likely is it?", "এটা কতটা সম্ভব?"),
      fact: L(item.en, item.bn),
      options: shuffle(labels),
      correct: getAppLang() === "bn" ? PROB_LABEL_BN[word] : PROB_LABEL[word],
      hint: L("Certain = always, impossible = never", "নিশ্চিত = অবশ্যই, অসম্ভব = কখনোই না"),
      hintBn: "নিশ্চিত = অবশ্যই, অসম্ভব = কখনোই না",
    };
  }

  private statsRound(): Round {
    const level = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    let fact = "";
    let correct = 0;
    if (level <= 1) {
      const mean = Phaser.Math.Between(4, 10);
      const a = Phaser.Math.Between(2, 9);
      const b = Phaser.Math.Between(2, 9);
      const c = 3 * mean - a - b;
      if (c < 1 || c > 15) {
        fact = `Mean of ${mean - 1}, ${mean}, ${mean + 1}`;
        correct = mean;
      } else {
        const nums = shuffle([a, b, c]);
        fact = `Mean of ${nums.join(", ")}`;
        correct = mean;
      }
    } else if (level === 2) {
      const mode = Phaser.Math.Between(3, 9);
      let x = Phaser.Math.Between(2, 9);
      if (x === mode) x = x === 2 ? x + 1 : x - 1;
      let z = Phaser.Math.Between(2, 12);
      while (z === mode || z === x) z = Phaser.Math.Between(2, 12);
      const nums = shuffle([mode, mode, mode, x, z]);
      fact = `Mode of ${nums.join(", ")}`;
      correct = mode;
    } else {
      const median = Phaser.Math.Between(4, 9);
      const a = median - Phaser.Math.Between(2, 3);
      const b = median - 1;
      const d = median + 1;
      const e = median + Phaser.Math.Between(2, 3);
      const nums = shuffle([a, b, median, d, e]);
      fact = `Median of ${nums.join(", ")}`;
      correct = median;
    }
    return {
      prompt: L("Find it!", "বের করো!"),
      fact,
      options: numericOptions(correct).map(String),
      correct: String(correct),
      hint: L("Check the definition — mean is average, mode is most, median is middle", "সংজ্ঞা মনে করো — গড় হলো গড়, প্রচুরক হলো সবচেয়ে বেশি, মধ্যমা হলো মাঝেরটি"),
      hintBn: "সংজ্ঞা মনে করো — গড় হলো গড়, প্রচুরক হলো সবচেয়ে বেশি, মধ্যমা হলো মাঝেরটি",
    };
  }

  /* ── band-8 generators (#1164) ── */

  private twoStepRound(): Round {
    const level = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    let fact = "";
    let correct = 0;
    if (level <= 1) {
      const a = 2;
      const b = Phaser.Math.Between(3, 8);
      const x = Phaser.Math.Between(2, 9);
      correct = x;
      fact = `${a}x + ${b} = ${a * x + b}`;
    } else if (level === 2) {
      const a = 2;
      const b = Phaser.Math.Between(2, 7);
      const x = Phaser.Math.Between(3, 9);
      correct = x;
      fact = `${a}x − ${b} = ${a * x - b}`;
    } else {
      const a = Phaser.Math.Between(3, 5);
      const b = Phaser.Math.Between(4, 12);
      const x = Phaser.Math.Between(2, 9);
      correct = x;
      fact = level === 3 ? `${a}x + ${b} = ${a * x + b}` : `${a}x − ${b} = ${a * x - b}`;
    }
    return {
      prompt: L("Solve for x", "x-এর মান বের করো"),
      fact,
      options: numericOptions(correct).map(String),
      correct: String(correct),
      hint: L("Undo two operations — reverse the order", "দুটি অপারেশন উল্টো ক্রমে ভাঙো"),
      hintBn: "দুটি অপারেশন উল্টো ক্রমে ভাঙো",
    };
  }

  private percentChangeRound(): Round {
    const pct = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    const old = pct * 4; // 10→40, 20→80, 25→100, 50→200 — always a clean change
    const change = (old * pct) / 100;
    const increase = this.levelIndex % 2 === 0;
    const next = increase ? old + change : old - change;
    const correct = `${pct}%`;
    const opts = new Set<string>([correct]);
    for (const c of [`${Math.max(5, pct - 5)}%`, `${pct + 5}%`, `${pct + 10}%`, `${pct + 15}%`]) {
      if (opts.size >= 4) break;
      if (c !== correct) opts.add(c);
    }
    return {
      prompt: L("What is the percent change?", "শতকরা পরিবর্তন কত?"),
      fact: L(
        `Old price ৳${old} → new price ৳${next}`,
        `পুরনো দাম ৳${old} → নতুন দাম ৳${next}`
      ),
      options: shuffle([...opts]),
      correct,
      hint: L("Change ÷ original × 100", "পরিবর্তন ÷ পুরনো দাম × ১০০"),
      hintBn: "পরিবর্তন ÷ পুরনো দাম × ১০০",
    };
  }

  private geometryRound(): Round {
    const level = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    // Levels 1–3: complementary & supplementary angle pairs. Levels 4–6: volume
    // of cubes and cuboids — two class-8 geometry skills sharing one ladder.
    if (level <= 3) {
      const complementary = level <= 1 || (level === 3 && Phaser.Math.Between(0, 1) === 0);
      const a = complementary
        ? Phaser.Math.Between(20, 70)
        : Phaser.Math.Between(100, 150);
      const sum = complementary ? 90 : 180;
      const correct = sum - a;
      return {
        prompt: L("Find the missing angle", "অজানা কোণটি খুঁজো"),
        fact: complementary ? `${a}° + ? = 90°` : `${a}° + ? = 180°`,
        options: numericOptions(correct, 0).map((n) => `${n}°`),
        correct: `${correct}°`,
        hint: complementary
          ? L("Complementary angles add to 90°", "পূরক কোণের যোগফল ৯০°")
          : L("Supplementary angles add to 180°", "সম্পূরক কোণের যোগফল ১৮০°"),
        hintBn: complementary ? "পূরক কোণের যোগফল ৯০°" : "সম্পূরক কোণের যোগফল ১৮০°",
      };
    }
    const cube = level === 4;
    if (cube) {
      const s = Phaser.Math.Between(2, 5);
      const correct = s * s * s;
      return {
        prompt: L("Find the volume", "আয়তন বের করো"),
        fact: L(`Cube with side ${s} cm — volume?`, `${s} সেমি বাহুর ঘনকের আয়তন?`),
        options: numericOptions(correct, 1).map((n) => `${n} cm³`),
        correct: `${correct} cm³`,
        hint: L("Volume of a cube = side × side × side", "ঘনকের আয়তন = বাহু × বাহু × বাহু"),
        hintBn: "ঘনকের আয়তন = বাহু × বাহু × বাহু",
      };
    }
    const l = Phaser.Math.Between(3, 6);
    const w = Phaser.Math.Between(2, 5);
    const h = level === 5 ? Phaser.Math.Between(2, 4) : Phaser.Math.Between(5, 8);
    const correct = l * w * h;
    return {
      prompt: L("Find the volume", "আয়তন বের করো"),
      fact: L(`Cuboid ${l} × ${w} × ${h} cm — volume?`, `আয়তঘন ${l} × ${w} × ${h} সেমি — আয়তন?`),
      options: numericOptions(correct, 1).map((n) => `${n} cm³`),
      correct: `${correct} cm³`,
      hint: L("Volume = length × width × height", "আয়তন = দৈর্ঘ্য × প্রস্থ × উচ্চতা"),
      hintBn: "আয়তন = দৈর্ঘ্য × প্রস্থ × উচ্চতা",
    };
  }

  private statsLargerRound(): Round {
    const level = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    let fact = "";
    let correct = 0;
    if (level <= 1) {
      const mean = Phaser.Math.Between(10, 16);
      const a = Phaser.Math.Between(4, 16);
      const b = Phaser.Math.Between(4, 16);
      const c = Phaser.Math.Between(4, 16);
      const d = Phaser.Math.Between(4, 16);
      const e = 5 * mean - a - b - c - d;
      if (e < 1 || e > 20) {
        fact = `Mean of ${mean - 2}, ${mean - 1}, ${mean}, ${mean + 1}, ${mean + 2}`;
        correct = mean;
      } else {
        const nums = shuffle([a, b, c, d, e]);
        fact = `Mean of ${nums.join(", ")}`;
        correct = mean;
      }
    } else if (level === 2) {
      const median = Phaser.Math.Between(12, 20);
      const parts = [
        median - Phaser.Math.Between(4, 7),
        median - Phaser.Math.Between(2, 3),
        median - 1,
        median + 1,
        median + Phaser.Math.Between(2, 3),
        median + Phaser.Math.Between(4, 7),
      ];
      const nums = shuffle([...parts, median]);
      fact = `Median of ${nums.join(", ")}`;
      correct = median;
    } else {
      const lo = Phaser.Math.Between(4, 10);
      const hi = lo + Phaser.Math.Between(10, 20);
      const mid1 = Phaser.Math.Between(lo + 1, hi - 1);
      let mid2 = Phaser.Math.Between(lo + 1, hi - 1);
      while (mid2 === mid1) mid2 = Phaser.Math.Between(lo + 1, hi - 1);
      const nums = shuffle([lo, mid1, mid2, hi]);
      fact = `Range of ${nums.join(", ")}`;
      correct = hi - lo;
    }
    return {
      prompt: L("Find it!", "বের করো!"),
      fact,
      options: numericOptions(correct).map(String),
      correct: String(correct),
      hint: L("Mean = average, median = middle, range = biggest − smallest", "গড় = গড়, মধ্যমা = মাঝেরটি, বিস্তার = সবচেয়ে বড় − সবচেয়ে ছোট"),
      hintBn: "গড় = গড়, মধ্যমা = মাঝেরটি, বিস্তার = সবচেয়ে বড় − সবচেয়ে ছোট",
    };
  }

  /* ── challenge countdown (same contract as Percent/Decimals) ── */
  private armChallenge() {
    if (!this.challenge) return;
    if (this.challengeTimer) this.challengeTimer.remove(false);
    this.challengeDone = false;
    const bar = this.challengeBar;
    if (bar) {
      this.tweens.killTweensOf(bar);
      bar.setPosition(20, 122).setSize(Math.min(this.scale.width - 40, 320), 6).setScale(1, 1).setAlpha(1);
      this.tweens.add({ targets: bar, scaleX: 0, duration: CHALLENGE_SECONDS * 1000, ease: "Linear.easeNone" });
    }
    this.challengeTimer = this.time.delayedCall(CHALLENGE_SECONDS * 1000, () => {
      if (this.challengeDone) return;
      this.challengeDone = true;
      this.roundsDone++;
      this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.onRoundDone?.(false, CHALLENGE_SECONDS * 1000, this.levelIndex + 1);
      this.levelIndex++;
      this.startRound();
    });
  }

  private disarmChallenge() {
    if (this.challengeTimer) {
      this.challengeTimer.remove(false);
      this.challengeTimer = undefined;
    }
    if (this.challengeBar) {
      this.tweens.killTweensOf(this.challengeBar);
      this.challengeBar.setAlpha(0);
    }
  }

  private spawnButtons() {
    const { options } = this.round;
    const longLabels = this.skillId === "prob-words";
    const maxRadius = longLabels ? 70 : 56;
    const { radius, y, xFor } = answerRow(this, options.length, maxRadius);
    options.forEach((value, i) => {
      const labelSize = longLabels ? 16 : value.length > 4 ? 22 : 28;
      const c = modernAnswerButton(this, xFor(i), y, radius, value, BTN_PRIMARY, {
        labelSize,
        wrap: longLabels ? Math.round(radius * 2 - 12) : undefined,
      });
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: string) {
    if (value !== this.round.correct) {
      hintWrong(this, container, {
        hint: this.round.hint,
        hintBn: this.round.hintBn,
        correct: () => this.round.correct,
        options: () => this.buttons,
        challenge: this.challenge, // #1158 — no banner/reveal; solve it yourself
      });
      return;
    }
    this.challengeDone = true; // the round is solved — stop the countdown
    this.disarmChallenge();
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(value === this.round.correct, ms, this.levelIndex + 1);
    this.time.delayedCall(800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
  }
}

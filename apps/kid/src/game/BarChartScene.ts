import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { getAppLang } from "./locale";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak, bnNumber } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, correctButton, roundMeter, type RoundMeterApi, NV_GOLD, NV_NAVY } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-barchart")?.difficultyLevels ?? [3, 3, 4, 4, 4, 4];


interface ChartCat {
  emoji: string;
  /** Category word for the question/speech — inline EN/BN like hintWrong. */
  en: string;
  bn: string;
  count: number;
}
interface ChartDef {
  name: string;
  cats: ChartCat[];
}

/* 6 kid-friendly charts (#230 "6+ charts"). Every chart's counts are DISTINCT
 * so "which one has N?" always has exactly one answer. Emoji labels are
 * language-neutral; the words under them (and in the question) localize. */
const CHARTS: ChartDef[] = [
  {
    name: "fruit",
    cats: [
      { emoji: "🍎", en: "apples", bn: "আপেল", count: 4 },
      { emoji: "🍌", en: "bananas", bn: "কলা", count: 3 },
      { emoji: "🍇", en: "grapes", bn: "আঙুর", count: 2 },
      { emoji: "🍊", en: "oranges", bn: "কমলা", count: 5 },
    ],
  },
  {
    name: "ocean",
    cats: [
      { emoji: "🐟", en: "fish", bn: "মাছ", count: 5 },
      { emoji: "🐙", en: "octopuses", bn: "অক্টোপাস", count: 2 },
      { emoji: "🦀", en: "crabs", bn: "কাঁকড়া", count: 3 },
      { emoji: "🐠", en: "goldfish", bn: "সোনালি মাছ", count: 4 },
    ],
  },
  {
    name: "farm",
    cats: [
      { emoji: "🐮", en: "cows", bn: "গরু", count: 3 },
      { emoji: "🐔", en: "chickens", bn: "মুরগি", count: 4 },
      { emoji: "🐑", en: "sheep", bn: "ভেড়া", count: 2 },
      { emoji: "🐷", en: "pigs", bn: "শূকর", count: 5 },
    ],
  },
  {
    name: "space",
    cats: [
      { emoji: "⭐", en: "stars", bn: "তারা", count: 6 },
      { emoji: "🚀", en: "rockets", bn: "রকেট", count: 3 },
      { emoji: "🌙", en: "moons", bn: "চাঁদ", count: 2 },
      { emoji: "🪐", en: "planets", bn: "গ্রহ", count: 4 },
    ],
  },
  {
    name: "garden",
    cats: [
      { emoji: "🌻", en: "sunflowers", bn: "সূর্যমুখী", count: 5 },
      { emoji: "🌷", en: "tulips", bn: "টিউলিপ", count: 3 },
      { emoji: "🌹", en: "roses", bn: "গোলাপ", count: 4 },
      { emoji: "🌼", en: "daisies", bn: "ডেইজি", count: 2 },
    ],
  },
  {
    name: "toys",
    cats: [
      { emoji: "🎈", en: "balloons", bn: "বেলুন", count: 4 },
      { emoji: "🧸", en: "teddy bears", bn: "টেডি", count: 3 },
      { emoji: "🚗", en: "cars", bn: "গাড়ি", count: 5 },
      { emoji: "🚂", en: "trains", bn: "ট্রেন", count: 2 },
    ],
  },
];

type QType = "most" | "which" | "howmany";

/**
 * Bar Chart — read a kid-friendly bar chart and TAP the answer bar.
 * Band 3 (ages 6–8). 6 emoji charts; the question rotates a ladder:
 *   levels 0–1 "which is the MOST?" (find the tallest)
 *   levels 2–3 "which one has N?" (read a height)
 *   levels 4–5 "how many 🍎?" (match category → count)
 * Difficulty = how many categories the chart shows (3 → 4 bars).
 */
export class BarChartScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private chart!: ChartDef;
  private qType: QType = "most";
  private qWord = "";
  private answerIdx = 0;
  private bars: { sprite: Phaser.GameObjects.Container; count: number; value: unknown }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("BarChart");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleBarChart"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    onSceneResize(this, () => {
      this.layout();
      if (this.bars.length) this.drawBars();
    });
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height * 0.28);
  }

  private get baselineY() {
    return this.scale.height * 0.74;
  }

  private get maxBarH() {
    return this.scale.height * 0.34;
  }

  /** Number of bars shown this level — the difficulty ladder. */
  private get shownCats() {
    return Math.min(LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)], 4);
  }

  private pickChart() {
    this.chart = CHARTS[Math.floor(Math.random() * CHARTS.length)];
  }

  private pickQuestion() {
    const cats = this.chart.cats.slice(0, this.shownCats);
    const bn = getAppLang() === "bn";
    const word = (c: ChartCat) => (bn ? c.bn : c.en);
    if (this.levelIndex <= 1) {
      this.qType = "most";
      const max = Math.max(...cats.map((c) => c.count));
      this.answerIdx = cats.findIndex((c) => c.count === max);
      this.prompt.set(t("chartMost"));
      speak(t("chartMostSpeak"), { lang: bn ? "bn" : "en" });
    } else if (this.levelIndex <= 3) {
      this.qType = "which";
      const pick = cats[Math.floor(Math.random() * cats.length)];
      this.answerIdx = cats.indexOf(pick);
      const n = pick.count;
      this.prompt.set(t("chartWhich", { n: digit(n) }));
      speak(t("chartWhichSpeak", { word: bn ? bnNumber(n) : String(n) }), { lang: bn ? "bn" : "en" });
    } else {
      this.qType = "howmany";
      const pick = cats[Math.floor(Math.random() * cats.length)];
      this.answerIdx = cats.indexOf(pick);
      this.qWord = word(pick);
      this.prompt.set(t("chartHowMany", { w: this.qWord }));
      speak(t("chartHowManySpeak", { w: this.qWord }), { lang: bn ? "bn" : "en" });
    }
  }

  private startRound() {
    this.clearBars();
    this.startedAt = this.time.now;
    this.pickChart();
    this.pickQuestion();
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.drawBars();
  }

  private drawBars() {
    this.clearBars();
    const { width } = this.scale;
    const cats = this.chart.cats.slice(0, this.shownCats);
    const max = Math.max(...cats.map((c) => c.count));
    const gap = width / (cats.length + 1);
    const barW = Math.min(64, gap * 0.62);
    const bn = getAppLang() === "bn";
    cats.forEach((cat, i) => {
      const x = gap * (i + 1);
      const barH = Math.max(18, (cat.count / max) * this.maxBarH);
      const topY = this.baselineY - barH;
      const c = this.add.container(x, 0);
      // bar
      const g = this.add.graphics();
      g.fillStyle(0x6ee7ff, 1);
      g.fillRoundedRect(-barW / 2, topY, barW, barH, 8);
      g.lineStyle(2, 0x2f7fd6, 1);
      g.strokeRoundedRect(-barW / 2, topY, barW, barH, 8);
      c.add(g);
      // emoji floating above the bar
      const emoji = this.add.text(0, topY - 34, cat.emoji, txt(30, "#ffffff", { align: "center" })).setOrigin(0.5);
      c.add(emoji);
      // word below the baseline
      const label = this.add.text(0, this.baselineY + 26, bn ? cat.bn : cat.en, txt(15, "#ffffff", { align: "center" })).setOrigin(0.5, 0);
      c.add(label);
      // count badge on the bar top
      const badge = this.add.text(0, topY + 14, digit(cat.count), txt(16, NV_NAVY, { bold: true })).setOrigin(0.5);
      c.add(badge);
      // tap target = the whole column (emoji + bar + word)
      const hitH = this.baselineY - topY + 52;
      c.setSize(barW + 28, hitH);
      c.setInteractive();
      const idx = i;
      c.on("pointerdown", () => this.tap(c, idx));
      this.bars.push({ sprite: c, count: cat.count, value: cat.emoji });
    });
  }

  private tap(container: Phaser.GameObjects.Container, idx: number) {
    if (idx !== this.answerIdx) {
      const cat = this.chart.cats[idx];
      hintWrong(this, container, {
        hint: () => (this.qType === "most" ? "The tallest bar is the most!" : this.qType === "which" ? `Count the ${cat.emoji} — ${cat.en}!` : `Tap the ${cat.en} bar!`),
        hintBn: () => (this.qType === "most" ? "সবচেয়ে লম্বা বারটাই সবচেয়ে বেশি!" : this.qType === "which" ? `${cat.emoji} গুনো — ${cat.bn}!` : `${cat.bn} এর বারটা ট্যাপ করো!`),
        correct: () => this.chart.cats[this.answerIdx].emoji,
        options: () => this.bars,
      });
      return;
    }
    pop();
    correctButton(container);
    this.bars.forEach((b) => b.sprite.disableInteractive());
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearBars() {
    this.bars.forEach((b) => b.sprite.destroy());
    this.bars = [];
  }
}

import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { getAppLang } from "./locale";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak, bnNumber, enNumber } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, BTN_PRIMARY, BTN_ORANGE, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { answerRow } from "./layout";
import { SAB } from "./safeArea";

/** The KEY doubles as the difficulty ladder: one picture = 2, then 5, then 10. */
const KEYS = GAMES.find((g) => g.id === "game-picto")?.difficultyLevels ?? [2, 2, 5, 5, 10, 10];
const ROUNDS_TO_FINISH = 3;
const BN_D = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** Bangla kids read ১৫; English kids 15 — same numeral, local digits. */
function bdDigits(s: string | number): string {
  return getAppLang() === "bn" ? String(s).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(s);
}

interface PictoCat {
  emoji: string;
  /** Category word — inline EN/BN data (repo pattern), question phrasing via t(). */
  en: string;
  bn: string;
  /** How many PICTURES the row shows (1–5); the count is pictures × key. */
  pics: number;
}
interface PictoChart {
  name: string;
  cats: PictoCat[];
}

/* 6 kid-friendly pictograph charts. Picture counts are DISTINCT so "which is
 * the most?" always has exactly one answer, and small (1–5) so the pictures
 * stay countable on a phone. */
const CHARTS: PictoChart[] = [
  {
    name: "fruit",
    cats: [
      { emoji: "🍎", en: "apples", bn: "আপেল", pics: 4 },
      { emoji: "🍌", en: "bananas", bn: "কলা", pics: 2 },
      { emoji: "🍇", en: "grapes", bn: "আঙুর", pics: 3 },
      { emoji: "🍊", en: "oranges", bn: "কমলা", pics: 5 },
    ],
  },
  {
    name: "farm",
    cats: [
      { emoji: "🐮", en: "cows", bn: "গরু", pics: 3 },
      { emoji: "🐔", en: "chickens", bn: "মুরগি", pics: 4 },
      { emoji: "🐑", en: "sheep", bn: "ভেড়া", pics: 2 },
      { emoji: "🐷", en: "pigs", bn: "শূকর", pics: 5 },
    ],
  },
  {
    name: "space",
    cats: [
      { emoji: "⭐", en: "stars", bn: "তারা", pics: 5 },
      { emoji: "🚀", en: "rockets", bn: "রকেট", pics: 2 },
      { emoji: "🌙", en: "moons", bn: "চাঁদ", pics: 3 },
      { emoji: "🪐", en: "planets", bn: "গ্রহ", pics: 4 },
    ],
  },
  {
    name: "garden",
    cats: [
      { emoji: "🌻", en: "sunflowers", bn: "সূর্যমুখী", pics: 4 },
      { emoji: "🌷", en: "tulips", bn: "টিউলিপ", pics: 2 },
      { emoji: "🌹", en: "roses", bn: "গোলাপ", pics: 3 },
      { emoji: "🌼", en: "daisies", bn: "ডেইজি", pics: 5 },
    ],
  },
  {
    name: "ocean",
    cats: [
      { emoji: "🐟", en: "fish", bn: "মাছ", pics: 5 },
      { emoji: "🐙", en: "octopuses", bn: "অক্টোপাস", pics: 2 },
      { emoji: "🦀", en: "crabs", bn: "কাঁকড়া", pics: 3 },
      { emoji: "🐠", en: "goldfish", bn: "সোনালি মাছ", pics: 4 },
    ],
  },
  {
    name: "toys",
    cats: [
      { emoji: "🎈", en: "balloons", bn: "বেলুন", pics: 3 },
      { emoji: "🧸", en: "teddy bears", bn: "টেডি", pics: 4 },
      { emoji: "🚗", en: "cars", bn: "গাড়ি", pics: 2 },
      { emoji: "🚂", en: "trains", bn: "ট্রেন", pics: 5 },
    ],
  },
];

type QType = "howmany" | "most";

/**
 * Picture Chart — read a pictograph where ONE picture = a key number (2/5/10).
 * Band 3 (ages 6–8, math/data). The key climbs with the level (2 → 5 → 10);
 * the question rotates "how many {w}?" (multiply pictures × key) with
 * "which is the most?" (compare the rows). Answer = tap the count button.
 */
export class PictoGraphScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private chart!: PictoChart;
  private key = 2;
  private qType: QType = "howmany";
  private qCat: PictoCat | null = null;
  private qWord = "";
  private answer = 0;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private rows: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private meter!: RoundMeterApi;
  private keyChip!: Phaser.GameObjects.Container;
  private chartBox!: Phaser.GameObjects.Container;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("PictoGraph");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titlePicto"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.keyChip = this.add.container(0, 0);
    this.chartBox = this.add.container(0, 0);
    onSceneResize(this, () => {
      this.layout();
      this.buildChart();
    });
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.keyChip.setPosition(width / 2, 134);
    this.prompt.setPosition(width / 2, height * 0.24);
  }

  private get chartTop() {
    return this.scale.height * 0.3;
  }

  private get answersY() {
    return this.scale.height * 0.82;
  }

  private pickChart() {
    this.chart = CHARTS[Math.floor(Math.random() * CHARTS.length)];
  }

  private pickQuestion() {
    const bn = getAppLang() === "bn";
    const word = (c: PictoCat) => (bn ? c.bn : c.en);
    this.qType = this.levelIndex >= 3 && Math.random() < 0.5 ? "most" : "howmany";
    if (this.qType === "howmany") {
      this.qCat = this.chart.cats[Math.floor(Math.random() * this.chart.cats.length)];
      this.qWord = word(this.qCat);
      this.answer = this.qCat.pics * this.key;
      this.prompt.set(t("pictoHowMany", { w: this.qWord }));
    } else {
      const maxPics = Math.max(...this.chart.cats.map((c) => c.pics));
      this.qCat = this.chart.cats.find((c) => c.pics === maxPics)!;
      this.qWord = word(this.qCat);
      this.answer = this.qCat.pics * this.key;
      this.prompt.set(t("pictoMost"));
    }
  }

  private startRound() {
    this.clearButtons();
    this.startedAt = this.time.now;
    this.key = KEYS[Math.min(this.levelIndex, KEYS.length - 1)];
    this.pickChart();
    this.pickQuestion();
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.buildKeyChip();
    this.buildChart();
    this.spawnButtons();
    // Spoken (#746): read the key, then the question — the pictures alone
    // don't say the value, so the key MUST be heard for non-readers.
    this.time.delayedCall(350, () => {
      if (!this.scene.isActive()) return;
      const bn = getAppLang() === "bn";
      speak(t("pictoKeySpeak", { n: bn ? bnNumber(this.key) : enNumber(this.key) }), { cancel: false });
      speak(t(this.qType === "howmany" ? "pictoHowManySpeak" : "pictoMostSpeak", { w: this.qWord }), { cancel: false });
    });
  }

  private buildKeyChip() {
    this.keyChip.removeAll(true);
    const bn = getAppLang() === "bn";
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.16);
    bg.fillRoundedRect(-112, -18, 224, 36, 18);
    bg.lineStyle(2, 0xffffff, 0.6);
    bg.strokeRoundedRect(-112, -18, 224, 36, 18);
    const emoji = this.add.text(-86, 0, "🍎", txt(22, "#ffffff")).setOrigin(0.5);
    const txt_ = this.add
      .text(-34, 0, t("pictoKey", { n: bdDigits(this.key) }), txt(bn ? 17 : 16, "#ffffff", { bold: true }))
      .setOrigin(0, 0.5);
    this.keyChip.add([bg, emoji, txt_]);
  }

  private buildChart() {
    this.chartBox.removeAll(true);
    this.rows = [];
    const { width } = this.scale;
    const bn = getAppLang() === "bn";
    const rowH = 46;
    const rowY = (i: number) => this.chartTop + i * rowH;
    this.chart.cats.forEach((cat, i) => {
      const c = this.add.container(0, rowY(i));
      // category emoji + word (left rail)
      const emoji = this.add.text(width * 0.2, 0, cat.emoji, txt(26, "#ffffff")).setOrigin(0.5);
      const label = this.add
        .text(width * 0.2, 22, bn ? cat.bn : cat.en, txt(14, "#ffffff", { align: "center" }))
        .setOrigin(0.5);
      c.add([emoji, label]);
      // the pictograph row: one emoji per picture
      const startX = width * 0.34;
      const step = Math.min(34, (width * 0.9 - startX) / Math.max(4, cat.pics + 0.6));
      cat.pics;
      for (let p = 0; p < cat.pics; p++) {
        const pic = this.add.text(startX + p * step, 0, cat.emoji, txt(24, "#ffffff")).setOrigin(0.5);
        c.add(pic);
      }
      this.chartBox.add(c);
      this.rows.push(c);
    });
  }

  private spawnButtons() {
    const { y, xFor } = answerRow(this, 3, 58, 14);
    const opts = this.buildOptions();
    opts.forEach((v, i) => {
      const label = bdDigits(v);
      const c = modernAnswerButton(this, xFor(i), y, 58, label, i === 0 ? BTN_PRIMARY : BTN_ORANGE, { labelSize: 30 });
      c.on("pointerdown", () => this.tap(c, v));
      this.buttons.push({ sprite: c, value: v });
    });
  }

  /** The three count choices: correct + 2 picture-off distractors. */
  private buildOptions(): number[] {
    if (this.qType === "most") {
      // the counts of 3 rows (one of them is the max) — reading the chart answers it
      const counts = this.chart.cats.map((c) => c.pics * this.key).sort((a, b) => a - b);
      const opt = [this.answer, ...counts.filter((v) => v !== this.answer).slice(0, 2)];
      return opt.sort(() => Math.random() - 0.5);
    }
    const pool = [this.key, this.key * 2, this.key * 3, this.key * 4, this.key * 5, this.key * 6]
      .filter((v) => v !== this.answer);
    const d1 = pool[Math.floor(Math.random() * pool.length)];
    const rest = pool.filter((v) => v !== d1);
    const d2 = rest[Math.floor(Math.random() * rest.length)];
    return [this.answer, d1, d2].sort(() => Math.random() - 0.5);
  }

  private tap(container: Phaser.GameObjects.Container, value: number) {
    if (value !== this.answer) {
      const bn = getAppLang() === "bn";
      const k = bdDigits(this.key);
      hintWrong(this, container, {
        hint: () => (this.qType === "howmany" ? t("pictoHintHowMany", { w: this.qWord, k }) : t("pictoHintMost")),
        hintBn: () => (this.qType === "howmany" ? t("pictoHintHowMany", { w: this.qWord, k }) : t("pictoHintMost")),
        correct: () => this.answer,
        options: () => this.buttons,
      });
      return;
    }
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    const bn = getAppLang() === "bn";
    if (this.qType === "howmany") {
      const n = bn ? bnNumber(this.answer) : enNumber(this.answer);
      speak(t("pictoRightHowMany", { w: this.qWord, n }), { lang: bn ? "bn" : "en" });
    } else {
      speak(t("pictoRightMost", { w: this.qWord }), { lang: bn ? "bn" : "en" });
    }
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
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

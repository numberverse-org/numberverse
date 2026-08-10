import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, gridLayout, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-sightwords")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
const WORDS = [
  { word: "the" }, { word: "and" }, { word: "you" }, { word: "that" },
  { word: "with" }, { word: "have" }, { word: "from" }, { word: "were" },
  { word: "they" }, { word: "when" }, { word: "your" }, { word: "about" },
  { word: "what" }, { word: "which" }, { word: "there" }, { word: "where" },
  { word: "would" }, { word: "could" }, { word: "should" }, { word: "people" },
  { word: "water" }, { word: "because" }, { word: "more" }, { word: "make" },
];
const CARD_W = 110;
const CARD_H = 64;
const ROUNDS_TO_FINISH = 3;

/**
 * Sight Words — read the sight word, tap the matching word card.
 * Band 4 (ages 8–10). High-frequency English words for fluent reading.
 */
export class SightWordsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target!: string;
  private cards: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private wordText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("SightWords");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleSightWords"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.wordText = this.add
      .text(0, 0, "", txt(56, "#ffd166", {bold: true, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("findWord"));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "night");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.wordText.setPosition(width / 2, height * 0.26);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = WORDS[Phaser.Math.Between(0, WORDS.length - 1)].word;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.wordText.setText(this.target);
    speak(this.target, { lang: "en" });
    this.spawnCards(n);
  }

  private spawnCards(n: number) {
    const grid = n <= 3 ? { cols: 3, rows: 1 } : n <= 4 ? { cols: 2, rows: 2 } : n <= 6 ? { cols: 3, rows: 2 } : { cols: 4, rows: Math.ceil(n / 4) };
    const opts = [this.target, ...WORDS.filter((w) => w.word !== this.target).map((w) => w.word)]
      .slice(0, n)
      .sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: grid.cols,
      rows: grid.rows,
      preferredW: CARD_W,
      minW: 54,
      widthPad: 60,
      topPad: this.scale.height * 0.34,
      bottomY: this.scale.height - 172 - SAB(),
      cardH: CARD_H,
    });
    const cardW = gl.cardW;
    opts.forEach((w, i) => {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (grid.rows - 1) / 2) * gl.spacingY;
      const c = modernCardButton(this, x, y, cardW, gl.cardH, w, BTN_NEUTRAL, 28);
      c.on("pointerdown", () => this.tap(c, w));
      c.setData("val", w);
      this.cards.push(c);
    });
  }

  private tap(container: Phaser.GameObjects.Container, word: string) {
    if (word !== this.target) {
      hintWrong(this, container, {
        hint: "Read the word out loud, then find the card that shows it",
        hintBn: "শব্দটা জোরে পড়ো, তারপর সেই কার্ডটি খুঁজো",
        correct: () => this.target,
        options: () => this.cards.map((s) => ({ sprite: s, value: s.getData("val") })),
      });
      return;
    }
    pop();
    correctButton(container);
    this.cards.forEach((c) => c.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 16; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, this.randomColor());
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-70, 70),
        y: y + Phaser.Math.Between(-70, 70),
        alpha: 0,
        duration: 520,
        onComplete: () => p.destroy(),
      });
    }
  }

  private randomColor(): number {
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255)
    );
  }
}

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
import { ensureAssets } from "./svgAssets";

const LEVELS = GAMES.find((g) => g.id === "game-cvc")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
const WORDS = [
  { en: "cat", icon: "cat" },
  { en: "dog", icon: "dog" },
  { en: "sun", icon: "sun" },
  { en: "hat", icon: "hat" },
  { en: "bed", icon: "bed" },
  { en: "car", icon: "car" },
  { en: "bus", icon: "bus" },
  { en: "egg", icon: "egg2" },
  { en: "pig", icon: "pig" },
  { en: "fox", icon: "fox" },
  { en: "cow", icon: "cow" },
  { en: "owl", icon: "owl" },
  { en: "bat", icon: "bat" },
  { en: "rat", icon: "rat" },
  { en: "hen", icon: "hen" },
  { en: "web", icon: "web" },
];
const CARD_RADIUS = 56;
const ROUNDS_TO_FINISH = 3;

/**
 * CVC Words — read the 3-letter word, tap the matching picture.
 * Band 3 (ages 6–8). First English reading.
 */
export class CvcScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target!: (typeof WORDS)[number];
  private cards: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private wordText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Cvc");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    ensureAssets(this);
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleCvc"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.wordText = this.add
      .text(0, 0, "", txt(56, "#ffd166", {bold: true, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("readWordTapPic"));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "sky");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.wordText.setPosition(width / 2, height * 0.28);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private startRound() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = WORDS[Phaser.Math.Between(0, WORDS.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.wordText.setText(this.target.en);
    speak(this.target.en, { lang: "en" });
    this.spawnCards(n);
  }

  private spawnCards(n: number) {
    const grid = n <= 3 ? { cols: 3, rows: 1 } : n <= 4 ? { cols: 2, rows: 2 } : n <= 6 ? { cols: 3, rows: 2 } : { cols: 4, rows: Math.ceil(n / 4) };
    const opts = [this.target, ...WORDS.filter((w) => w.en !== this.target.en)].slice(0, n).sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: grid.cols,
      rows: grid.rows,
      preferredW: n <= 6 ? CARD_RADIUS * 2 : CARD_RADIUS * 1.6,
      minW: 56,
      widthPad: 40,
      topPad: Math.round(this.scale.height * 0.28 + 40),
      bottomY: this.scale.height - 172 - SAB(),
    });
    opts.forEach((word, i) => {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (grid.rows - 1) / 2) * gl.spacingY;
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, "", BTN_NEUTRAL, { icon: { key: word.icon, size: Math.max(28, Math.round(gl.cardW * 0.6)) } });
      c.on("pointerdown", () => this.tap(c, word.en));
      c.setData("val", word.en);
      this.cards.push(c);
    });
  }

  private tap(container: Phaser.GameObjects.Container, en: string) {
    if (en !== this.target.en) {
      hintWrong(this, container, {
        hint: "Match the word to the picture — sound it out slowly",
        hintBn: "শব্দটির সাথে ছবিটি মিলাও — ধীরে ধীরে পড়ো",
        correct: () => this.target.en,
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

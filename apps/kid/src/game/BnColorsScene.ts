import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, gridLayout, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-bncolors")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
/** 13 Bangla colors so the 6-level ladder is real (3→10 cards). */
const COLORS = [
  { bn: "লাল", hex: 0xff5252 },
  { bn: "নীল", hex: 0x4cc9f0 },
  { bn: "সবুজ", hex: 0x2ec4b6 },
  { bn: "হলুদ", hex: 0xffd166 },
  { bn: "কমলা", hex: 0xf4a261 },
  { bn: "বেগুনি", hex: 0x9b5de5 },
  { bn: "গোলাপি", hex: 0xff8fab },
  { bn: "বাদামি", hex: 0x8d6e63 },
  { bn: "কালো", hex: 0x37474f },
  { bn: "ধূসর", hex: 0x90a4ae },
  { bn: "সাদা", hex: 0xf7f9fb },
  { bn: "আকাশি", hex: 0x80deea },
  { bn: "সোনালি", hex: 0xffd700 },
];
const CARD_RADIUS = 52;
const ROUNDS_TO_FINISH = 3;

/**
 * Bangla Colors — read the Bangla color word, tap the matching color.
 * Band 2 (ages 4–6, Bangla). লাল নীল সবুজ — first color words.
 */
export class BnColorsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target!: (typeof COLORS)[number];
  private cards: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private wordText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("BnColors");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleBnColors"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.wordText = this.add
      .text(0, 0, "", txt(56, NV_GOLD, {bold: true, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("tapColor"));
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "candy");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.wordText.setPosition(width / 2, height * 0.28);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = COLORS[Phaser.Math.Between(0, COLORS.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.wordText.setText(this.target.bn);
    speak(this.target.bn);
    this.spawnCards(n);
  }

  private spawnCards(n: number) {
    // 3-wide up to 6 cards, 4-wide from 8 so 10-card rounds stay on screen
    const cols = n <= 3 ? 3 : n <= 4 ? 2 : n <= 6 ? 3 : 4;
    const opts = [this.target, ...COLORS.filter((c) => c.bn !== this.target.bn)].slice(0, n).sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols,
      rows: Math.ceil(n / cols),
      preferredW: n <= 6 ? CARD_RADIUS * 2 : CARD_RADIUS * 1.6,
      minW: 56,
      widthPad: 40,
      topPad: Math.round(this.scale.height * 0.28 + 40),
      bottomY: this.scale.height - 172 - SAB(),
      gapX: 10,
      gapY: 10,
    });
    opts.forEach((color, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (Math.ceil(n / cols) - 1) / 2) * gl.spacingY;
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, "", btnFromColor(color.hex));
      c.on("pointerdown", () => this.tap(c, color.bn));
      c.setData("val", color.bn);
      this.cards.push(c);
    });
  }

  private tap(container: Phaser.GameObjects.Container, bn: string) {
    if (bn !== this.target.bn) {
      hintWrong(this, container, {
        hint: () => `Look for the color ${this.target.bn}`,
        hintBn: () => `${this.target.bn} রঙটি খুঁজে বের করো`,
        correct: () => this.target.bn,
        options: () => this.cards.map((s) => ({ sprite: s, value: s.getData("val") })),
      });
      return;
    }
    pop();
    ringCorrect(this, container);
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

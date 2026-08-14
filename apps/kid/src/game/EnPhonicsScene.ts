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
import { ensureAssets, assetIcon } from "./svgAssets";

const LEVELS = GAMES.find((g) => g.id === "game-enphonics")?.difficultyLevels ?? [3, 4, 5, 6, 7, 8];
const PHONICS = [
  { ch: "A", word: "Apple", icon: "apple" },
  { ch: "B", word: "Ball", icon: "ball" },
  { ch: "C", word: "Cat", icon: "cat" },
  { ch: "D", word: "Dog", icon: "dog" },
  { ch: "E", word: "Egg", icon: "egg2" },
  { ch: "F", word: "Fish", icon: "fish" },
  { ch: "G", word: "Grapes", icon: "grapes" },
  { ch: "H", word: "Hat", icon: "hat" },
  { ch: "I", word: "Ice", icon: "ice" },
  { ch: "J", word: "Jam", icon: "strawberry" },
  { ch: "K", word: "Kite", icon: "kite" },
  { ch: "L", word: "Lion", icon: "lion" },
];
const BUTTON_RADIUS = 48;
const ROUNDS_TO_FINISH = 3;

/**
 * English Phonics — see the picture, tap the letter it starts with.
 * Band 2 (ages 4–6, English). First letter sounds with real words.
 */
export class EnPhonicsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target!: (typeof PHONICS)[number];
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private pictureBox!: Phaser.GameObjects.Container;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("EnPhonics");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    ensureAssets(this);
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleEnPhonics"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.pictureBox = this.add.container(0, 0);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("startLetter"));
    onSceneResize(this, () => this.layout());
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
    this.pictureBox.setPosition(width / 2, Math.min(height * 0.4, Math.max(140, height - 400), 240));
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.clearButtons();
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = PHONICS[Phaser.Math.Between(0, PHONICS.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.pictureBox.removeAll(true);
    this.pictureBox.add(assetIcon(this, this.target.icon, 108, { y: -34 }));
    this.pictureBox.add(
      this.add.text(0, 56, this.target.word, txt(30, "#ffffff", { bold: true, outline: true, shadow: false })).setOrigin(0.5)
    );
    this.spawnButtons(n);
    speak(`${this.target.word} starts with which letter?`, { lang: "en" });
  }

  private spawnButtons(n: number) {
    const opts = [this.target, ...PHONICS.filter((p) => p.ch !== this.target.ch)]
      .slice(0, n)
      .sort(() => Math.random() - 0.5);
    // 8–10 buttons: 5×2 on narrow phones (shorter than 4×3 → keeps 2 rows on small screens)
    const cols = n >= 8 && this.scale.width < 400 ? 5 : n <= 3 ? 3 : n <= 4 ? 2 : n <= 6 ? 3 : 4;
    const gl = gridLayout(this, {
      cols,
      rows: Math.ceil(n / cols),
      preferredW: n <= 6 ? BUTTON_RADIUS * 2 : BUTTON_RADIUS * 1.6,
      minW: 52,
      widthPad: 40,
      // picture icon + word unit, grid sits below it
      topPad: Math.round(Math.min(this.scale.height * 0.4, Math.max(140, this.scale.height - 400), 240) + 83),
      bottomY: this.scale.height - 172 - SAB(),
      gapX: 12,
      gapY: 12,
    });
    opts.forEach((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (Math.ceil(n / cols) - 1) / 2) * gl.spacingY;
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, p.ch, BTN_PRIMARY, { labelSize: Math.max(24, Math.round(gl.cardW / 1.8)) });
      c.on("pointerdown", () => this.tap(c, p.ch));
      c.setData("val", p.ch);
      this.buttons.push({ sprite: c, value: p.ch });
    });
  }

  private tap(container: Phaser.GameObjects.Container, ch: string) {
    if (ch !== this.target.ch) {
      hintWrong(this, container, {
        hint: "Say the word slowly — which letter makes the FIRST sound?",
        hintBn: "শব্দটি ধীরে পড়ো — কোন অক্ষর দিয়ে শুরু হয়?",
        correct: () => this.target.ch,
        options: () => this.buttons,
      });
      return;
    }
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
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

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
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

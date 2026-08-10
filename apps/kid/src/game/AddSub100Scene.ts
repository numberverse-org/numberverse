import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speakMath } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";
import { answerRow } from "./layout";

const LEVELS = GAMES.find((g) => g.id === "game-addsub100")?.difficultyLevels ?? [20, 40, 60, 90, 99, 150];
const BUTTON_RADIUS = 50;
const ROUNDS_TO_FINISH = 3;

/**
 * Add & Subtract to 100 — two-digit addition and subtraction.
 * Band 3 (ages 6–8). Mixed add/sub; level = max operand size.
 */
export class AddSub100Scene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private mode: "add" | "sub" = "add";
  private a = 0;
  private b = 0;
  private answer = 0;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private factText!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("AddSub100");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleAddSub100"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", {bold: true}))
      .setOrigin(0.5);
    this.factText = this.add
      .text(0, 0, "", txt(50, "#ffd166", {bold: true, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("solveIt"));
    this.meter = roundMeter(this);
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
    this.factText.setPosition(width / 2, height * 0.44);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.clearButtons();
    const max = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.mode = Math.random() < 0.5 ? "add" : "sub";
    if (this.mode === "add") {
      const hi = Math.min(max, 60);
      this.a = Phaser.Math.Between(2, hi);
      this.b = Phaser.Math.Between(2, Math.min(max - this.a, hi));
      this.answer = this.a + this.b;
      this.factText.setText(`${this.a} + ${this.b} = ?`);
    } else {
      this.a = Phaser.Math.Between(10, max);
      this.b = Phaser.Math.Between(1, this.a - 1);
      this.answer = this.a - this.b;
      this.factText.setText(`${this.a} − ${this.b} = ?`);
    }
    this.startedAt = this.time.now;
    speakMath(this.mode === "add" ? "add" : "sub", this.a, this.b);
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.spawnButtons();
  }

  private spawnButtons() {
    const opts = new Set<number>([this.answer]);
    let delta = 1;
    while (opts.size < 4) {
      const cand = Math.max(0, this.answer + (delta % 2 === 1 ? -delta : delta));
      if (cand !== this.answer) opts.add(cand);
      delta++;
    }
    const values = [...opts].sort(() => Math.random() - 0.5);
    const { radius, y, xFor } = answerRow(this, values.length, BUTTON_RADIUS);
    values.forEach((value, i) => {
      const c = modernAnswerButton(this, xFor(i), y, radius, String(value));
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: number) {
    if (value !== this.answer) {
      hintWrong(this, container, {
        hint: () =>
          this.mode === "add"
            ? "Add the two numbers together — count them if you need to"
            : "Subtract — take the small number away from the big one",
        hintBn: () =>
          this.mode === "add"
            ? "দুই সংখ্যা মিলিয়ে যোগ করো — দরকার হলে গুনে দেখো"
            : "বিয়োগ করো — বড় থেকে ছোট সংখ্যাটা বাদ দাও",
        correct: () => this.answer,
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
    this.onRoundDone?.(true, ms, this.answer);
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

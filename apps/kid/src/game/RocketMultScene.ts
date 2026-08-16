import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speakMath } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { answerRow } from "./layout";
import { ensureAssets, assetIcon } from "./svgAssets";

const LEVELS = GAMES.find((g) => g.id === "game-rocketmult")?.difficultyLevels ?? [2, 5, 10, 12, 16, 20];
/** Level → multiplier set. Stays INSIDE the skill's promise (tables 2, 5, 10) —
 *  later levels just MIX the same three tables (harder, but never ×3/×4/…).
 *  The "tables 2–10" skill (game-multable) owns the other multipliers. */
const TABLE_SETS: number[][] = [
  [2],       // level 1: ×2 only
  [5],       // level 2: ×5 only
  [10],      // level 3: ×10 only
  [2, 5],    // level 4: mixed pair
  [2, 10],   // level 5: mixed pair
  [2, 5, 10], // level 6: all three mixed
];
const BUTTON_RADIUS = 50;
const ROUNDS_TO_FINISH = 3;

/**
 * Rocket Builder — "fuel the rocket with the right product".
 * Band 3 (ages 6–8). Level = times table (2, 5, 10 → then mixed).
 * Shows a fact like "3 × 2 = ?" and 4 answer choices; correct answer fuels the rocket.
 */
export class RocketMultScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private fact = { a: 1, b: 2 };
  private answer = 0;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private factText!: Phaser.GameObjects.Text;
  private rocket!: Phaser.GameObjects.Container;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("RocketMult");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    ensureAssets(this);
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleRocket"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.rocket = assetIcon(this, "star-academy", 96);
    this.factText = this.add
      .text(0, 0, "", txt(52, NV_GOLD, {bold: true, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("fuelRocket"));
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "space");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.rocket.setPosition(width / 2, height * 0.22);
    this.factText.setPosition(width / 2, height * 0.46);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.clearButtons();
    const idx = Math.min(this.levelIndex, LEVELS.length - 1);
    const set = TABLE_SETS[Math.min(idx, TABLE_SETS.length - 1)];
    const a = Phaser.Math.Between(2, 9);
    // table = which multiplier set; mixed sets make later levels genuinely harder
    const b = Phaser.Math.RND.pick(set);
    this.fact = { a, b };
    this.answer = a * b;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.factText.setText(`${a} × ${b} = ?`);
    speakMath("mul", a, b);
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
        hint: "Count one row, then add it that many times",
        hintBn: "একটা সারি গুনো, তারপর সেটা ওই সংখ্যক বার যোগ করো",
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
    this.onRoundDone?.(value === this.answer, ms, this.levelIndex + 1);
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

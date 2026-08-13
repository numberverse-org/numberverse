import Phaser from "phaser";
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

const LEVELS = GAMES.find((g) => g.id === "game-area")?.difficultyLevels ?? [6, 12, 20, 30, 42, 56];
const BUTTON_RADIUS = 52;
const ROUNDS_TO_FINISH = 3;
const TILE = 26;

/**
 * Area Lab — count the squares to find the area.
 * Band 5 (ages 10–13). Draws a grid rectangle, kid taps the area.
 * Level = max area for a dimension pair.
 */
export class AreaPerimScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private w = 3;
  private h = 2;
  private answer = 6;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private gridGfx!: Phaser.GameObjects.Graphics;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private factText!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("AreaPerim");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.gridGfx = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleArea"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.factText = this.add
      .text(0, 0, "", txt(40, NV_GOLD, {bold: true, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("whatArea"));
    this.meter = roundMeter(this);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "desert");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.factText.setPosition(width / 2, height * 0.22);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private get gridCenter() {
    return { x: this.scale.width / 2, y: this.scale.height * 0.52 };
  }

  private startRound() {
    this.clearButtons();
    const maxArea = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    // pick w,h such that w*h <= maxArea, w<=6, h<=6, and not 1×n trivial
    const pairs: [number, number][] = [];
    for (let w = 2; w <= 6; w++) {
      for (let h = 2; h <= 6; h++) {
        if (w * h <= maxArea) pairs.push([w, h]);
      }
    }
    [this.w, this.h] = Phaser.Math.RND.pick(pairs);
    this.answer = this.w * this.h;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.factText.setText(`${this.w} × ${this.h}`);
    speakMath("mul", this.w, this.h);
    this.drawGrid();
    this.spawnButtons();
  }

  private drawGrid() {
    const { x, y } = this.gridCenter;
    const totalW = this.w * TILE;
    const totalH = this.h * TILE;
    const left = x - totalW / 2;
    const top = y - totalH / 2;
    this.gridGfx.clear();
    this.gridGfx.fillStyle(0x74c69d, 0.6);
    this.gridGfx.fillRect(left, top, totalW, totalH);
    this.gridGfx.lineStyle(2, 0xf8f9fa, 1);
    for (let i = 0; i <= this.w; i++) {
      this.gridGfx.lineBetween(left + i * TILE, top, left + i * TILE, top + totalH);
    }
    for (let j = 0; j <= this.h; j++) {
      this.gridGfx.lineBetween(left, top + j * TILE, left + totalW, top + j * TILE);
    }
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
        hint: "Multiply the side numbers — or count all the little squares",
        hintBn: "দুই বাহুর সংখ্যা গুণ করো — অথবা ছোট বর্গগুলো গুনে ফেলো",
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

import Phaser from "phaser";
import { t } from "./i18n";
import { frameText } from "./framing";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speakMath } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi } from "./ui";
import { answerRow } from "./layout";

const LEVELS = GAMES.find((g) => g.id === "game-bnbonds")?.difficultyLevels ?? [4, 5, 6, 8, 10, 12];
/** Skill seed for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-bnbonds")?.skillId ?? "number-bonds-10";
const TARGET = 10;
const ROUNDS_TO_FINISH = 3;
const BUTTON_RADIUS = 52;

/**
 * Number Bonds to 10 — "How many more to make 10?"
 * Band 2 (ages 4–6). Shows a number + the owl asks how many more make 10.
 * Difficulty = how big the shown number can get (level → max shown).
 */
export class NumberBondsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private shown = 0;
  private answer!: number;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private shownText!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("NumberBonds");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleNumberBonds"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", {bold: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(frameText("howManyMore", SKILL_ID, 0));
    this.shownText = this.add
      .text(0, 0, "", txt(72, "#ffd166", {bold: true, outline: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "magic");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.shownText.setPosition(width / 2, height * 0.42);
    this.prompt.setPosition(width / 2, height * 0.56);
  }

  private get answersY() {
    return this.scale.height * 0.78;
  }

  private startRound() {
    this.clearButtons();
    const max = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.shown = Phaser.Math.Between(1, Math.min(9, max - 1));
    this.answer = TARGET - this.shown;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.prompt.set(frameText("howManyMore", SKILL_ID, this.levelIndex));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.shownText.setText(String(this.shown));
    speakMath("bonds", this.shown, TARGET);
    this.spawnButtons();
  }

  private spawnButtons() {
    const opts = new Set<number>([this.answer]);
    let delta = 1;
    while (opts.size < 4) {
      const cand = this.answer + (delta % 2 === 1 ? -delta : delta);
      if (cand >= 1 && cand <= 9) opts.add(cand);
      delta++;
    }
    const values = [...opts].sort(() => Math.random() - 0.5);
    const { radius, y, xFor } = answerRow(this, values.length, BUTTON_RADIUS, 14);
    values.forEach((value, i) => {
      const c = modernAnswerButton(this, xFor(i), y, radius, String(value));
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: number) {
    if (value !== this.answer) {
      hintWrong(this, container, {
        hint: () => `Which number joins ${this.shown} to make ${TARGET}?`,
        hintBn: () => `${this.shown} এর সাথে কত যোগ করলে ${TARGET} হয়?`,
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
    this.onRoundDone?.(true, ms, this.shown);
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

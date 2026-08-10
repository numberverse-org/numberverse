import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak, bnNumber } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";
import { answerRow } from "./layout";

const LEVELS = GAMES.find((g) => g.id === "game-placevalue")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
const PLACES = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands"];
const BN_PLACE: Record<string, string> = {
  ones: "একক", tens: "দশক", hundreds: "শতক", thousands: "হাজার",
  "ten-thousands": "দশ হাজার", "hundred-thousands": "লাখ",
};
const BUTTON_RADIUS = 50;
const ROUNDS_TO_FINISH = 3;

/**
 * Place Value — find the digit in a given place.
 * Band 4 (ages 8–10). Shows "In 4,829, what is the TENS digit?"
 * Kid taps the correct digit button.
 */
export class PlaceValueScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private number = 0;
  private place = "tens";
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
    super("PlaceValue");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titlePlaceValue"), txt(28, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", {bold: true}))
      .setOrigin(0.5);
    this.factText = this.add
      .text(0, 0, "", txt(26, "#ffd166", {bold: true, align: "center", wrap: 340, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("tapDigitPlace"));
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
    this.factText.setPosition(width / 2, height * 0.42).setWordWrapWidth(Math.max(140, width - 20));
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.clearButtons();
    const digits = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.number = Phaser.Math.Between(Math.pow(10, digits - 1), Math.pow(10, digits) - 1);
    const maxPlace = Math.min(digits - 1, PLACES.length - 1);
    const pi = Phaser.Math.Between(0, maxPlace);
    this.place = PLACES[pi];
    this.answer = Math.floor(this.number / Math.pow(10, pi)) % 10;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.factText.setText(`In ${this.number.toLocaleString()}, the ${this.place} digit is?`);
    speak(
      getAppLang() === "bn"
        ? `${bnNumber(this.number)}-এ ${BN_PLACE[this.place] ?? this.place} ঘরে কোন অঙ্কটি আছে?`
        : `In ${this.number}, what is the ${this.place} digit?`
    );
    this.spawnButtons();
  }

  private spawnButtons() {
    const opts = new Set<number>([this.answer]);
    while (opts.size < 4) {
      opts.add(Phaser.Math.Between(0, 9));
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
        hint: "Look at the place value — tens first, then ones",
        hintBn: "ঘরের মান দেখো — আগে দশক, তারপর একক",
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

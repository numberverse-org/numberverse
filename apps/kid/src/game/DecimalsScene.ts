import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-decimals")?.difficultyLevels ?? [1, 2, 3, 4, 5, 6];
const BUTTON_RADIUS = 78;
const ROUNDS_TO_FINISH = 3;

/**
 * Decimal Duel — which decimal is bigger?
 * Band 5 (ages 10–13). Two big buttons; tap the larger number.
 * Level = max decimal places (1 → 2 → 3).
 */
export class DecimalsScene extends Phaser.Scene {
  private levels = LEVELS;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private a = "0.5";
  private b = "0.45";
  private bigger = "a";
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Decimals");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; levels?: number[] }) {
    this.onRoundDone = data.onRoundDone;
    // #1170 — per-skill ladder: decimals-intro (band 5) → [1,2,3,4,5,6],
    // decimals-tenths (band 7) → [2,3,4,5,6] (hundredths onward, no whole-tenths).
    this.levels = data.levels?.length ? data.levels : LEVELS;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleDecimals"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("tapBiggerDecimal"));
    this.meter = roundMeter(this);
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
    this.prompt.setPosition(width / 2, height * 0.3);
  }

  private get answersY() {
    return this.scale.height * 0.6;
  }

  private startRound() {
    this.clearButtons();
    const places = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    // generate two different decimals with `places` decimal digits
    let av = Phaser.Math.FloatBetween(0.1, 9.9);
    let bv = Phaser.Math.FloatBetween(0.1, 9.9);
    let guard = 0;
    while (Math.abs(av - bv) < 0.01 && guard++ < 50) bv = Phaser.Math.FloatBetween(0.1, 9.9);
    const fmt = (v: number) => v.toFixed(places);
    this.a = fmt(av);
    this.b = fmt(bv);
    this.bigger = parseFloat(this.a) >= parseFloat(this.b) ? "a" : "b";
    speak(getAppLang() === "bn" ? `কোনটা বড় — ${this.a} নাকি ${this.b}?` : `Which is bigger, ${this.a} or ${this.b}?`);
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.spawnButtons();
  }

  private spawnButtons() {
    const opts = [this.a, this.b].sort(() => Math.random() - 0.5);
    const { width } = this.scale;
    const spacing = BUTTON_RADIUS * 2 + 16;
    const startX = width / 2 - (spacing * (opts.length - 1)) / 2;
    const y = this.answersY;
    // More decimal places = longer labels — shrink so "9.999999" stays inside the circle.
    const places = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    const labelSize = places >= 6 ? 26 : places >= 4 ? 32 : 38;
    opts.forEach((value, i) => {
      const c = modernAnswerButton(this, startX + i * spacing, y, BUTTON_RADIUS, value, BTN_PRIMARY, { labelSize });
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: string) {
    const correctVal = this.bigger === "a" ? this.a : this.b;
    if (value !== correctVal) {
      hintWrong(this, container, {
        hint: "The bigger decimal has more in the tenths (and hundredths) place",
        hintBn: "বড় দশমিকে দশমাংশ (ও শতাংশ) ঘরে বেশি থাকে",
        correct: () => (this.bigger === "a" ? this.a : this.b),
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
    // #1170 — difficulty is the skill's ladder value (decimal places), not the index.
    this.onRoundDone?.(true, ms, this.levels[Math.min(this.levelIndex, this.levels.length - 1)]);
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

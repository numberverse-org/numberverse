import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { getAppLang } from "./locale";
import { frameText } from "./framing";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak, bnNumber } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, BTN_PRIMARY, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-round")?.difficultyLevels ?? [40, 80, 120, 400, 700, 999];
/** Skill seed for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-round")?.skillId ?? "round-nearest-10-100";
const ROUNDS_TO_FINISH = 3;
const BUTTON_RADIUS = 50;
const BN_D = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
/** Bangla kids read ৪৭; English kids 47 — same numeral, local digits. */
function bdDigits(s: string | number): string {
  return getAppLang() === "bn" ? String(s).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(s);
}

/**
 * Round It — round a number to the nearest ten or hundred on a NUMBER LINE.
 * Band 3 (ages 6–8). The number sits between its two fence-posts (e.g. 40 · 47 · 50)
 * on a real line; tap the post the number is nearer to and the marker ball
 * JUMPS onto it. Levels 0–2 = nearest 10, levels 3–5 = nearest 100.
 */
export class RoundingScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private shown = 0;
  private lower = 0;
  private upper = 0;
  private correct = 0;
  private frac = 0.5;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private shownText!: Phaser.GameObjects.Text;
  private lineBox!: Phaser.GameObjects.Container;
  private marker!: Phaser.GameObjects.Arc;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Rounding");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleRounding"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.shownText = this.add
      .text(0, 0, "", txt(64, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5);
    this.lineBox = this.add.container(0, 0);
    this.marker = this.add.circle(0, 0, 11, 0xffb35c).setStrokeStyle(3, 0xffffff).setDepth(100);
    this.meter = roundMeter(this);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "sunset");
  }

  private layout() {
    const { width, height } = this.scale;
    const lineY = this.lineY();
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height * 0.24);
    this.shownText.setPosition(width / 2, height * 0.40);
    this.lineBox.setPosition(width / 2, lineY);
    this.marker.setPosition(width / 2 + (this.frac - 0.5) * this.lineW(), lineY);
    this.repositionButtons();
  }

  private lineY() {
    return this.scale.height * 0.60;
  }

  private lineW() {
    return Math.min(this.scale.width * 0.72, 440);
  }

  private get answersY() {
    return this.scale.height * 0.84;
  }

  /** true for levels 3–5 → round to the nearest HUNDRED (not ten). */
  private get toHundred() {
    return this.levelIndex >= 3;
  }

  private step() {
    return this.toHundred ? 100 : 10;
  }

  private startRound() {
    this.clearButtons();
    this.lineBox.removeAll(true);
    this.tweens.killTweensOf(this.marker);
    const max = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const min = this.toHundred ? 100 : 10;
    // Never a fence-post (already rounded) nor an exact half-way (the tie rule —
    // every round has ONE clearly nearer answer).
    let n: number;
    do {
      n = Phaser.Math.Between(min, max);
    } while (n % this.step() === 0 || n % this.step() === this.step() / 2);
    this.shown = n;
    this.lower = Math.floor(n / this.step()) * this.step();
    this.upper = this.lower + this.step();
    this.correct = n - this.lower < this.upper - n ? this.lower : this.upper;
    this.frac = (n - this.lower) / this.step();
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.prompt.set(frameText(this.toHundred ? "round100Prompt" : "round10Prompt", SKILL_ID, this.levelIndex, { n: bdDigits(n) }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.shownText.setText(bdDigits(n));
    const bn = getAppLang() === "bn";
    speak(t(this.toHundred ? "roundSpeak100" : "roundSpeak10", { word: bn ? bnNumber(n) : String(n) }), { lang: bn ? "bn" : "en" });
    this.drawLine();
    this.spawnButtons();
  }

  /** The number line between the two fence-posts, with the marker on it. */
  private drawLine() {
    const half = this.lineW() / 2;
    const g = this.add.graphics();
    g.lineStyle(4, 0xffffff, 0.9);
    g.lineBetween(-half, 0, half, 0);
    this.lineBox.add(g);
    const ticks = this.add.graphics();
    ticks.lineStyle(4, 0xffd166, 1);
    ticks.lineBetween(-half, -14, -half, 14);
    ticks.lineBetween(half, -14, half, 14);
    this.lineBox.add(ticks);
    // tiny mid-tick at the number's spot so the ball reads "on the line"
    const mid = this.add.graphics();
    mid.lineStyle(2, 0xffffff, 0.5);
    mid.lineBetween((this.frac - 0.5) * this.lineW(), -9, (this.frac - 0.5) * this.lineW(), 9);
    this.lineBox.add(mid);
  }

  /** The two fence-post buttons sit AT the line's endpoints (left = lower,
   *  right = upper) so the kid taps the post the number is closer to. */
  private spawnButtons() {
    const { width, height } = this.scale;
    const y = this.answersY;
    const leftX = width / 2 - this.lineW() / 2;
    const rightX = width / 2 + this.lineW() / 2;
    const opts = [
      { x: leftX, value: this.lower },
      { x: rightX, value: this.upper },
    ];
    opts.forEach((o) => {
      const c = modernAnswerButton(this, o.x, y, BUTTON_RADIUS, bdDigits(o.value), BTN_PRIMARY, { labelSize: 30 });
      c.on("pointerdown", () => this.tap(c, o.value));
      this.buttons.push({ sprite: c, value: o.value });
    });
  }

  private repositionButtons() {
    if (this.buttons.length !== 2) return;
    this.buttons[0].sprite.setPosition(this.scale.width / 2 - this.lineW() / 2, this.answersY);
    this.buttons[1].sprite.setPosition(this.scale.width / 2 + this.lineW() / 2, this.answersY);
  }

  private tap(container: Phaser.GameObjects.Container, value: number) {
    if (value !== this.correct) {
      hintWrong(this, container, {
        hint: () => `${this.shown} is closer to ${this.correct}!`,
        hintBn: () => `${bdDigits(this.shown)} ${bdDigits(this.correct)} এর কাছাকাছি!`,
        correct: () => this.correct,
        options: () => this.buttons,
      });
      return;
    }
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    // the marker ball JUMPS onto the winning fence-post
    this.tweens.add({
      targets: this.marker,
      x: container.x,
      y: container.y - 40,
      duration: 430,
      ease: "Cubic.easeInOut",
    });
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.shown);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
  }
}

import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak, bnNumber } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-fracmatch")?.difficultyLevels ?? [2, 3, 4, 6, 8, 12];
const BUTTON_RADIUS = 52;
const ROUNDS_TO_FINISH = 3;
const PIZZA_RADIUS = 82;
const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure

/** Simplified fractions — kid matches the shaded pizza to its simplest form. */
const SIMPLE = [
  { label: "½", num: 1, den: 2 },
  { label: "⅓", num: 1, den: 3 },
  { label: "¼", num: 1, den: 4 },
  { label: "⅔", num: 2, den: 3 },
  { label: "¾", num: 3, den: 4 },
];

/**
 * Fraction Match — which fraction equals this pizza?
 * Band 4 (ages 8–10). Shows a pizza cut into slices with some shaded;
 * kid taps the SIMPLIFIED fraction (e.g. 2/4 → ½). Teaches equivalence.
 */
export class FractionMatchScene extends Phaser.Scene {
  private levels = LEVELS;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private challenge = false; // #1158 — band 6-7 independent mode (timed rounds, no reveal)
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private target!: { label: string; num: number; den: number };
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private pizzaGfx!: Phaser.GameObjects.Graphics;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("FractionMatch");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; levels?: number[]; challenge?: boolean }) {
    this.onRoundDone = data.onRoundDone;
    // #1170 — per-skill ladder: fractions-equiv (band 4) → [2,3,4,6,8,12],
    // fraction-simplify (band 7) → [4,6,8,12] (bigger denominators to reduce).
    this.levels = data.levels?.length ? data.levels : LEVELS;
    this.levelIndex = data.startLevelIndex ?? 0;
    // #1158 — challenge mode: band 6-7 skills (skill.challenge → App passes it)
    // get a per-round countdown bar and no hint/reveal on wrong.
    this.challenge = !!data.challenge;
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    this.background = this.add.graphics();
    this.pizzaGfx = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleFraction"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("tapSimplestFrac"));
    this.meter = roundMeter(this);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "kitchen");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get pizzaCenter() {
    return { x: this.scale.width / 2, y: this.scale.height * 0.44 };
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.clearButtons();
    const slices = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    // pick a simple fraction that divides evenly into `slices` (or any num<den works)
    const simple = SIMPLE[Phaser.Math.Between(0, SIMPLE.length - 1)];
    const scale = Math.max(1, Math.floor(slices / simple.den));
    const shaded = simple.num * scale;
    const den = slices;
    this.target = simple;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.drawPizza(shaded, den);
    // Narrate what the pizza SHOWS, then ask for the simplest form — the kid
    // hears "2 out of 4" and must find the equivalent "½", not the literal label.
    speak(getAppLang() === "bn"
      ? `এটা ${bnNumber(this.target.num)} ভাগ ${bnNumber(this.target.den)} — সবচেয়ে ছোট ভগ্নাংশটা বাছো!`
      : `This shows ${this.target.num} out of ${this.target.den} — tap the simplest fraction!`);
    this.spawnButtons();
    this.armChallenge();
  }

  /** #1158 — challenge-mode countdown: a gold bar drains over CHALLENGE_SECONDS;
   *  time-up records a WRONG round (streak breaks, no coin, block does NOT
   *  advance) and deals the next round. No re-teach, no reveal — the older kid
   *  races the clock, and the combo/coin economy feels the miss. */
  private armChallenge() {
    if (!this.challenge) return;
    if (this.challengeTimer) this.challengeTimer.remove(false);
    this.challengeDone = false;
    const bar = this.challengeBar;
    if (bar) {
      this.tweens.killTweensOf(bar);
      bar.setPosition(20, 122).setSize(Math.min(this.scale.width - 40, 320), 6).setScale(1, 1).setAlpha(1);
      this.tweens.add({ targets: bar, scaleX: 0, duration: CHALLENGE_SECONDS * 1000, ease: "Linear.easeNone" });
    }
    this.challengeTimer = this.time.delayedCall(CHALLENGE_SECONDS * 1000, () => {
      if (this.challengeDone) return;
      this.challengeDone = true;
      // A time-up is a completed (failed) round: the App counts it toward the
      // block (roundsDone), the meter reflects it, and a fresh round deals.
      // No open-wrong is recorded (no tap) so a fully-timed-out block still
      // advances the session — the wrong events make BKT drop the tier.
      this.roundsDone++;
      this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.onRoundDone?.(false, CHALLENGE_SECONDS * 1000, this.levelIndex + 1);
      this.levelIndex++;
      this.startRound();
    });
  }

  private disarmChallenge() {
    if (this.challengeTimer) {
      this.challengeTimer.remove(false);
      this.challengeTimer = undefined;
    }
    if (this.challengeBar) {
      this.tweens.killTweensOf(this.challengeBar);
      this.challengeBar.setAlpha(0);
    }
  }

  private drawPizza(shaded: number, slices: number) {
    const { x, y } = this.pizzaCenter;
    this.pizzaGfx.clear();
    const startAngle = -Math.PI / 2;
    const step = (Math.PI * 2) / slices;
    this.pizzaGfx.fillStyle(0xe9c46a, 1);
    this.pizzaGfx.slice(x, y, PIZZA_RADIUS, 0, Math.PI * 2);
    this.pizzaGfx.fillPath();
    this.pizzaGfx.fillStyle(0xe76f51, 1);
    for (let i = 0; i < shaded; i++) {
      const a0 = startAngle + i * step;
      const a1 = a0 + step;
      this.pizzaGfx.slice(x, y, PIZZA_RADIUS - 2, a0, a1);
      this.pizzaGfx.fillPath();
    }
    this.pizzaGfx.lineStyle(3, 0x8d5a2b, 1);
    for (let i = 0; i <= slices; i++) {
      const a = startAngle + i * step;
      this.pizzaGfx.lineBetween(
        x, y,
        x + Math.cos(a) * PIZZA_RADIUS,
        y + Math.sin(a) * PIZZA_RADIUS
      );
    }
  }

  private spawnButtons() {
    const opts = new Set<string>([this.target.label]);
    const pool = SIMPLE.filter((f) => f.label !== this.target.label);
    while (opts.size < 3 && pool.length) {
      opts.add(pool[Phaser.Math.Between(0, pool.length - 1)].label);
    }
    const values = [...opts].sort(() => Math.random() - 0.5);
    const { width } = this.scale;
    const spacing = BUTTON_RADIUS * 2 + 14;
    const startX = width / 2 - (spacing * (values.length - 1)) / 2;
    const y = this.answersY;
    values.forEach((label, i) => {
      const c = modernAnswerButton(this, startX + i * spacing, y, BUTTON_RADIUS, label, BTN_PRIMARY, { labelSize: 32 });
      c.on("pointerdown", () => this.tap(c, label));
      this.buttons.push({ sprite: c, value: label });
    });
  }

  private tap(container: Phaser.GameObjects.Container, label: string) {
    if (label !== this.target.label) {
      hintWrong(this, container, {
        hint: "Count the shaded parts over the total parts",
        hintBn: "ছায়াযুক্ত অংশ আর মোট অংশ গুনে দেখো",
        correct: () => this.target.label,
        options: () => this.buttons,
        challenge: this.challenge, // #1158 — no banner/reveal; solve it yourself
      });
      return;
    }
    this.challengeDone = true; // the round is solved — stop the countdown
    this.disarmChallenge();
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(label === this.target.label, ms, this.levelIndex + 1);
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

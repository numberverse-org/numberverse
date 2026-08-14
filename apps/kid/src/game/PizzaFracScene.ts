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

const LEVELS = GAMES.find((g) => g.id === "game-pizzafrac")?.difficultyLevels ?? [2, 3, 4, 5, 6, 8];
const BUTTON_RADIUS = 52;
const ROUNDS_TO_FINISH = 3;
const PIZZA_RADIUS = 82;

/** Fraction choices rendered as text — every denominator the ladder uses. */
const FRACTIONS = [
  { key: "half", label: "½", num: 1, den: 2 },
  { key: "quarter", label: "¼", num: 1, den: 4 },
  { key: "three-quarter", label: "¾", num: 3, den: 4 },
  { key: "third", label: "⅓", num: 1, den: 3 },
  { key: "two-thirds", label: "⅔", num: 2, den: 3 },
  { key: "fifth", label: "⅕", num: 1, den: 5 },
  { key: "two-fifths", label: "⅖", num: 2, den: 5 },
  { key: "three-fifths", label: "⅗", num: 3, den: 5 },
  { key: "four-fifths", label: "⅘", num: 4, den: 5 },
  { key: "sixth", label: "⅙", num: 1, den: 6 },
  { key: "five-sixths", label: "⅚", num: 5, den: 6 },
  { key: "eighth", label: "⅛", num: 1, den: 8 },
  { key: "three-eighths", label: "⅜", num: 3, den: 8 },
  { key: "five-eighths", label: "⅝", num: 5, den: 8 },
  { key: "seven-eighths", label: "⅞", num: 7, den: 8 },
];

/**
 * Pizza Fractions — how much of the pizza is shaded?
 * Band 3 (ages 6–8). Shows a pizza split into slices with some shaded;
 * kid taps the matching fraction. Level = slices (2 → 3 → 4).
 */
export class PizzaFracScene extends Phaser.Scene {
  private levels = LEVELS;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
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
    super("PizzaFrac");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; levels?: number[] }) {
    this.onRoundDone = data.onRoundDone;
    // #1170 — per-skill ladder: fractions-intro (band 3) → [2,3,4,5,6,8],
    // fraction-read (band 6) → [4,5,6,8] (quarters onward, never halves).
    this.levels = data.levels?.length ? data.levels : LEVELS;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.pizzaGfx = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titlePizza"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("pizzaShaded"));
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
    const den = slices;
    const shaded = Phaser.Math.Between(1, den - 1);
    this.target = FRACTIONS.find((f) => f.num === shaded && f.den === den) ??
      { key: `${shaded}-${den}`, label: `${shaded}/${den}`, num: shaded, den };
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.drawPizza(shaded, den);
    // Ask the QUESTION — never reveal the answer. The kid counts the shaded
    // slices from the pizza and picks the matching fraction button.
    speak(getAppLang() === "bn" ? "পিৎজার কত অংশ রঙিন?" : "How much pizza is shaded?");
    this.spawnButtons();
  }

  private drawPizza(shaded: number, slices: number) {
    const { x, y } = this.pizzaCenter;
    this.pizzaGfx.clear();
    const startAngle = -Math.PI / 2;
    const step = (Math.PI * 2) / slices;
    // base circle
    this.pizzaGfx.fillStyle(0xe9c46a, 1);
    this.pizzaGfx.slice(x, y, PIZZA_RADIUS, 0, Math.PI * 2);
    this.pizzaGfx.fillPath();
    // shaded slices
    this.pizzaGfx.fillStyle(0xf4a261, 1);
    for (let i = 0; i < slices; i++) {
      const a0 = startAngle + i * step;
      const a1 = a0 + step;
      this.pizzaGfx.slice(x, y, PIZZA_RADIUS - 2, a0, a1);
      this.pizzaGfx.fillPath();
    }
    // overlay "topping" only on shaded slices → fill darker + draw slice lines
    this.pizzaGfx.fillStyle(0xe76f51, 1);
    for (let i = 0; i < shaded; i++) {
      const a0 = startAngle + i * step;
      const a1 = a0 + step;
      this.pizzaGfx.slice(x, y, PIZZA_RADIUS - 2, a0, a1);
      this.pizzaGfx.fillPath();
    }
    // slice lines — dark enough to read against the kitchen-orange background
    this.pizzaGfx.lineStyle(4, 0x5c2a0e, 1);
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
    const pool = FRACTIONS.filter((f) => f.label !== this.target.label);
    while (opts.size < 3 && pool.length) {
      opts.add(pool[Phaser.Math.Between(0, pool.length - 1)].label);
      pool.length === 0 ? null : null;
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
        hint: "Count the shaded slices — that's the top number",
        hintBn: "ছায়াযুক্ত টুকরোগুলো গুনো — সেটাই উপরের সংখ্যা",
        correct: () => this.target.label,
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
    this.onRoundDone?.(true, ms, this.target.den);
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

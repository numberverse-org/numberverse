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
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, gridLayout, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { ensureAssets } from "./svgAssets";

const LEVELS = GAMES.find((g) => g.id === "game-shapecatcher")?.difficultyLevels ?? [3, 4, 6, 8, 10, 12];
/** 12 visually-distinct shape SVGs so the 6-level ladder is real (3→12 options). */
const SHAPE_BN: Record<string, string> = {
  circle: "বৃত্ত", square: "বর্গক্ষেত্র", triangle: "ত্রিভুজ", star: "তারা",
  diamond: "হীরা", heart: "হৃদয়", ring: "রিং", moon: "চাঁদ", egg: "ডিম",
  arrow: "তীর", bolt: "বাজ", flower: "ফুল",
};

const SHAPES = [
  "circle",
  "square",
  "triangle",
  "star",
  "diamond",
  "heart",
  "ring",
  "moon",
  "egg",
  "arrow",
  "bolt",
  "flower",
];
const ROUNDS_TO_FINISH = 3;

/**
 * Shape Catcher — the owl asks for a shape; kid taps the matching falling shape.
 * Band 1 (ages 2–4). Zero text; visual + audio prompts. Teaches shapes, colors.
 */
export class ShapeCatcherScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target!: string;
  private shapes: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;
  // #1085 — en-shapes (c1-english-3) teaches the ENGLISH shape labels, so its
  // prompt + narration stay in English no matter the app language. The math
  // 'shapes' skill (c1-math-3) keeps the app-language prompt (shape recognition).
  private englishMode = false;

  constructor() {
    super("ShapeCatcher");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; skill?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.englishMode = data.skill === "en-shapes";
    ensureAssets(this);
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleShapeCatcher"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
        this.prompt = questionPanel(this, 0, 0, { tail: "none" });
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "candy");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 44);
    this.roundText.setPosition(width / 2, 82);
    this.meter.setPosition(width / 2, 104);
    // prompt is the QUESTION ("Tap the circle!") — lift it above the phone
    // home-indicator/gesture area (canvas is full-bleed).
    this.prompt.setPosition(width / 2, height - 34 - SAB());
  }

  private startRound() {
    this.shapes.forEach((s) => s.destroy());
    this.shapes = [];
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = SHAPES[Phaser.Math.Between(0, SHAPES.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    if (this.englishMode) {
      // English-label lesson (en-shapes): the prompt + speech use the ENGLISH
      // word regardless of app language, so a Bengali-UI kid still learns "circle".
      // Force { lang: "en" } so the spoken label uses an English voice too.
      this.prompt.set(`Tap the ${this.target}!`);
      speak(`Tap the ${this.target}!`, { lang: "en" });
    } else {
      // Shape-recognition lesson (math): prompt in the app language, using the
      // localized shape name so the Bangla UI never mixes "ট্যাপ করো circle!".
      const label = getAppLang() === "bn" ? (SHAPE_BN[this.target] ?? this.target) : this.target;
      this.prompt.set(t("tapThe", { target: label }));
      speak(getAppLang() === "bn" ? `${label} ট্যাপ করো!` : `Tap the ${this.target}!`);
    }
    this.spawnShapes(n);
  }

  private spawnShapes(n: number) {
    // 3-wide up to 6 options, 4-wide from 8 so tall rounds stay on screen
    const grid = { cols: n <= 3 ? 3 : n <= 4 ? 2 : n <= 6 ? 3 : 4 };
    const gl = gridLayout(this, {
      cols: grid.cols,
      rows: Math.ceil(n / grid.cols),
      preferredW: n <= 6 ? 104 : 84,
      minW: 56,
      widthPad: 40,
      topPad: 128,
      bottomY: this.scale.height - 72 - SAB(),
      gapX: 10,
      gapY: 10,
    });
    const opts = [this.target, ...SHAPES.filter((s) => s !== this.target)].slice(0, n).sort(() => Math.random() - 0.5);
    opts.forEach((shape, i) => {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (Math.ceil(n / grid.cols) - 1) / 2) * gl.spacingY;
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, "", BTN_PRIMARY, { icon: { key: shape, size: Math.max(26, Math.round(gl.cardW * 0.62)) } });
      c.on("pointerdown", () => this.tap(c, shape));
      c.setData("val", shape);
      this.shapes.push(c);
    });
  }

  private tap(container: Phaser.GameObjects.Container, shape: string) {
    if (shape !== this.target) {
      hintWrong(this, container, {
        hint: () => `Look for the ${this.target}`,
        hintBn: () => `${this.target} আকৃতিটি খুঁজো`,
        correct: () => this.target,
        options: () => this.shapes.map((s) => ({ sprite: s, value: s.getData("val") })),
      });
      return;
    }
    pop();
    correctButton(container);
    this.shapes.forEach((s) => s.disableInteractive());
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

import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-perim")?.difficultyLevels ?? [4, 5, 6, 8, 8, 10];
const ROUNDS_TO_FINISH = 3;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ১ ২ ৩, English kids 1 2 3. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

/** Integer-side right triangles (hypotenuse is a whole unit). */
const TRIPLES: [number, number, number][] = [
  [3, 4, 5],
  [6, 8, 10],
  [5, 12, 13],
  [9, 12, 15],
  [8, 15, 17],
  [12, 16, 20],
];

/**
 * Perimeter intro — measure the fence (#201).
 * Band 3: a rectangle (4 sides, lvl 1–2) or right triangle (3 sides, lvl 3+)
 * is drawn with UNIT-CUBE fence posts along every straight edge + labelled side
 * lengths. The kid adds the sides and taps the perimeter (the fence length).
 *  · lvl 1–2: rectangles 2×2 … 4×4 (sides 2–4)
 *  · lvl 3–4: rectangles 3×2 … 6×5 + right triangles from small Pythagorean triples
 *  · lvl 5+:  bigger rectangles + all triples up to 12×16
 * Distractors are near-perimeters (P±…); the correct total never repeats.
 */
export class PerimFenceScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private isTriangle = false;
  private a = 3;
  private b = 2;
  private c = 0;
  private P = 10;
  private lastP = -1;
  private cards: { sprite: Phaser.GameObjects.Container; val: string; correct: boolean }[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super("PerimFence");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "forest");
    this.titleText = this.add
      .text(0, 0, t("titlePerim"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.gfx = this.add.graphics().setDepth(4);

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.14);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.tallyText.setPosition(width / 2, height * 0.6);
    this.drawShape();
  }

  private startRound() {
    this.clearCards();
    this.locked = false;
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.qIndex = 0;
    this.lastP = -1;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearCards();
    this.locked = false;
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    let guard = 0;
    do {
      this.isTriangle = lvl >= 3;
      if (this.isTriangle) {
        const pool: typeof TRIPLES = lvl < 5 ? TRIPLES.slice(0, 2) : TRIPLES;
        const tr = pool[Phaser.Math.Between(0, pool.length - 1)];
        this.a = tr[0];
        this.b = tr[1];
        this.c = tr[2];
        this.P = this.a + this.b + this.c;
      } else {
        this.a = Phaser.Math.Between(lvl < 2 ? 2 : 3, lvl < 2 ? 4 : 6);
        this.b = Phaser.Math.Between(2, lvl < 2 ? 4 : 5);
        this.c = 0;
        this.P = 2 * (this.a + this.b);
      }
      guard++;
    } while (this.P === this.lastP && guard < 40);
    this.lastP = this.P;

    this.prompt.setText(t("peQ"));
    this.drawShape();

    const cands: number[] = [];
    for (let v = Math.max(1, this.P - 12); v <= this.P + 12; v++) if (v !== this.P) cands.push(v);
    cands.sort(() => Math.random() - 0.5);
    const lbl = (v: number) => t("peUnit", { n: digit(v) });
    const opts = [lbl(this.P), lbl(cands[0]), lbl(cands[1]), lbl(cands[2])].sort(() => Math.random() - 0.5);

    const gl = gridLayout(this, {
      cols: 2,
      rows: 2,
      preferredW: 180,
      minW: 110,
      widthPad: 16,
      topPad: this.scale.height * 0.64,
      bottomY: this.scale.height - 24 - SAB(),
      cardH: 66,
    });
    opts.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tile = modernCardButton(this, gl.startX + col * gl.spacingX, gl.cy + row * gl.spacingY, gl.cardW, 66, s, BTN_NEUTRAL, 28);
      const isCorrect = s === lbl(this.P);
      tile.on("pointerdown", () => this.tap(tile, s, isCorrect));
      this.cards.push({ sprite: tile, val: s, correct: isCorrect });
    });
  }

  /** Draw the shape with unit-cube fence posts + labelled side lengths. */
  private drawShape() {
    this.gfx.clear();
    this.labels.forEach((l) => l.destroy());
    this.labels = [];
    const { width, height } = this.scale;
    const maxDim = Math.max(this.a, this.b);
    const u = Math.max(14, Math.floor(Math.min((width * 0.72) / maxDim, (height * 0.3) / maxDim, 34)));
    const cx = width / 2;
    const cy = height * 0.42;
    if (!this.isTriangle) {
      const x0 = cx - (this.a * u) / 2;
      const y0 = cy - (this.b * u) / 2;
      // translucent field + outline
      this.gfx.fillStyle(0x2ec4b6, 0.12);
      this.gfx.fillRect(x0, y0, this.a * u, this.b * u);
      this.gfx.lineStyle(3, 0xffffff, 0.9);
      this.gfx.strokeRect(x0, y0, this.a * u, this.b * u);
      // unit cubes along every edge
      for (let i = 0; i < this.a; i++) {
        this.cube(x0 + (i + 0.5) * u, y0, u);
        this.cube(x0 + (i + 0.5) * u, y0 + this.b * u, u);
      }
      for (let i = 0; i < this.b; i++) {
        this.cube(x0, y0 + (i + 0.5) * u, u);
        this.cube(x0 + this.a * u, y0 + (i + 0.5) * u, u);
      }
      // side length labels (all four — opposites are equal)
      const aStr = digit(this.a);
      const bStr = digit(this.b);
      this.labels.push(this.add.text(x0 + (this.a * u) / 2, y0 - 18, aStr, txt(22, NV_GOLD, { bold: true, outline: true })).setOrigin(0.5));
      this.labels.push(this.add.text(x0 + (this.a * u) / 2, y0 + this.b * u + 18, aStr, txt(22, NV_GOLD, { bold: true, outline: true })).setOrigin(0.5));
      this.labels.push(this.add.text(x0 - 18, y0 + (this.b * u) / 2, bStr, txt(22, NV_GOLD, { bold: true, outline: true })).setOrigin(0.5));
      this.labels.push(this.add.text(x0 + this.a * u + 18, y0 + (this.b * u) / 2, bStr, txt(22, NV_GOLD, { bold: true, outline: true })).setOrigin(0.5));
    } else {
      // right triangle, right angle at bottom-left
      const x0 = cx - (this.a * u) / 2;
      const y0 = cy + (this.b * u) / 2;
      this.gfx.fillStyle(0x2ec4b6, 0.12);
      this.gfx.fillTriangle(x0, y0, x0 + this.a * u, y0, x0, y0 - this.b * u);
      this.gfx.lineStyle(3, 0xffffff, 0.9);
      this.gfx.lineBetween(x0, y0, x0 + this.a * u, y0);
      this.gfx.lineBetween(x0, y0, x0, y0 - this.b * u);
      this.gfx.lineBetween(x0 + this.a * u, y0, x0, y0 - this.b * u);
      // unit cubes along the two legs
      for (let i = 0; i < this.a; i++) this.cube(x0 + (i + 0.5) * u, y0, u);
      for (let i = 0; i < this.b; i++) this.cube(x0, y0 - (i + 0.5) * u, u);
      // labels a (bottom), b (left), c (hypotenuse)
      this.labels.push(this.add.text(x0 + (this.a * u) / 2, y0 + 18, digit(this.a), txt(22, NV_GOLD, { bold: true, outline: true })).setOrigin(0.5));
      this.labels.push(this.add.text(x0 - 18, y0 - (this.b * u) / 2, digit(this.b), txt(22, NV_GOLD, { bold: true, outline: true })).setOrigin(0.5));
      const hx = (x0 + this.a * u + x0) / 2;
      const hy = (y0 + y0 - this.b * u) / 2;
      this.labels.push(this.add.text(hx + 16, hy - 14, digit(this.c), txt(22, NV_GOLD, { bold: true, outline: true })).setOrigin(0.5));
    }
  }

  private cube(x: number, y: number, s: number) {
    this.gfx.fillStyle(0x2ec4b6, 1);
    this.gfx.fillRect(x - s / 2, y - s / 2, s, s);
    this.gfx.lineStyle(1, 0xffffff, 0.6);
    this.gfx.strokeRect(x - s / 2, y - s / 2, s, s);
  }

  private tap(tile: Phaser.GameObjects.Container, str: string, isCorrect: boolean) {
    if (this.locked) return;
    if (isCorrect) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.correct++;
      this.floatMsg(t("peGreat"));
      speak(t("peSpeak", { n: digit(this.P) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.tweens.add({ targets: tile, scale: 1.1, duration: 140, yoyo: true, ease: "Back.easeOut" });
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    hintWrongLocal(this, tile, () => t("peUnit", { n: digit(this.P) }));
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.advance(ms);
  }

  private advance(ms: number) {
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.qIndex++;
      this.time.delayedCall(1000, () => this.askQuestion());
      return;
    }
    this.finishRound(ms);
  }

  private finishRound(ms: number) {
    this.floatMsg(`${t("peDone")}  ${digit(this.correct)}/${digit(this.total)}`);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.correct === this.total, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.42, text, txt(28, NV_GOLD, { bold: true, outline: true, wrap: 320 }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }

  private clearCards() {
    this.cards.forEach((o) => o.sprite.destroy());
    this.cards = [];
  }
}

/** Wrong-answer feedback without hintWrong's "keep on wrong" retirement. */
function hintWrongLocal(scene: Phaser.Scene, tile: Phaser.GameObjects.Container, correct: () => string) {
  scene.tweens.add({ targets: tile, scale: 0.9, duration: 90, yoyo: true, ease: "Sine.easeInOut" });
  tile.setAlpha(0.4);
  tile.disableInteractive();
  const m = scene.add
    .text(tile.x, tile.y - 40, correct(), txt(20, NV_GREEN, { bold: true, outline: true }))
    .setOrigin(0.5)
    .setDepth(40);
  scene.tweens.add({ targets: m, y: m.y - 20, alpha: 0, duration: 700, onComplete: () => m.destroy() });
}

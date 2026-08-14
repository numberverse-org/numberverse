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

const LEVELS = GAMES.find((g) => g.id === "game-array-mult")?.difficultyLevels ?? [4, 5, 6, 8, 8, 10];
const ROUNDS_TO_FINISH = 3;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ১ ২ ৩, English kids 1 2 3. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

/**
 * Multiplication arrays (visual times tables) (#194).
 * Band 2/3: teach tables 2–5 with COUNTABLE ARRAYS before numbers. A dot array
 * of a rows × b columns is shown with edge badges (1..a on the left, 1..b on
 * top); the kid taps the full equation "3 × 4 = 12" that matches the array.
 * Distractors are other valid arrays (different factors/products), never a
 * commutative twin or an equal-product swap.
 */
export class ArrayMultScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private a = 0;
  private b = 0;
  private tiles: { sprite: Phaser.GameObjects.Container; val: string; correct: boolean }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private gfx!: Phaser.GameObjects.Graphics;
  private badges: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("ArrayMult");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "desert");
    this.titleText = this.add
      .text(0, 0, t("titleArrayMult"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true }))
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
    this.prompt.setPosition(width / 2, height * 0.22);
    this.tallyText.setPosition(width / 2, height * 0.28);
    if (this.tiles.length === 0) this.drawArray();
  }

  private startRound() {
    this.clearTiles();
    this.locked = false;
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.qIndex = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askQuestion();
  }

  private maxFactor(): number {
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    if (lvl < 2) return 3;
    if (lvl < 4) return 4;
    return 5;
  }

  private askQuestion() {
    this.clearTiles();
    this.locked = false;
    const mf = this.maxFactor();
    this.a = Phaser.Math.Between(2, mf);
    this.b = Phaser.Math.Between(2, mf);
    const P = this.a * this.b;
    this.prompt.setText(t("amMatch"));
    this.drawArray();

    const eq = (x: number, y: number) => `${digit(x)} × ${digit(y)} = ${digit(x * y)}`;
    const cands: [number, number][] = [];
    for (let x = 2; x <= 5; x++) {
      for (let y = 2; y <= 5; y++) {
        if (x === this.a && y === this.b) continue; // the answer
        if (x === this.b && y === this.a) continue; // no commutative twin
        if (x * y === P) continue; // no equal-product confusion
        cands.push([x, y]);
      }
    }
    cands.sort(() => Math.random() - 0.5);
    const opts = [eq(this.a, this.b), eq(...cands[0]), eq(...cands[1]), eq(...cands[2])].sort(() => Math.random() - 0.5);

    const gl = gridLayout(this, {
      cols: 2,
      rows: 2,
      preferredW: 190,
      minW: 120,
      widthPad: 16,
      topPad: this.scale.height * 0.62,
      bottomY: this.scale.height - 24 - SAB(),
      cardH: 74,
    });
    opts.forEach((str, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tile = modernCardButton(this, gl.startX + col * gl.spacingX, gl.cy + row * gl.spacingY, gl.cardW, 74, str, BTN_NEUTRAL, 22);
      const isCorrect = str === eq(this.a, this.b);
      tile.on("pointerdown", () => this.tap(tile, str, isCorrect));
      this.tiles.push({ sprite: tile, val: str, correct: isCorrect });
    });
  }

  /** Dot array a×b with row badges (left) and column badges (top). */
  private drawArray() {
    this.gfx.clear();
    this.badges.forEach((x) => x.destroy());
    this.badges = [];
    const { width, height } = this.scale;
    const cy = height * 0.4;
    const gap = 30;
    const r = 11;
    const x0 = width / 2 - ((this.b - 1) * gap) / 2;
    const y0 = cy - ((this.a - 1) * gap) / 2;
    for (let i = 0; i < this.a; i++) {
      for (let j = 0; j < this.b; j++) {
        const x = x0 + j * gap;
        const y = y0 + i * gap;
        const isRowHead = j === 0;
        const isColHead = i === 0;
        this.gfx.fillStyle(isRowHead || isColHead ? 0x4ade80 : 0x7dd3fc, 1);
        this.gfx.fillCircle(x, y, r);
      }
    }
    // row badges 1..a on the left
    for (let i = 0; i < this.a; i++) {
      const x = x0 - 30;
      const y = y0 + i * gap;
      const bd = this.add.text(x, y, digit(i + 1), txt(14, NV_GOLD, { bold: true })).setOrigin(0.5).setDepth(5);
      this.badges.push(bd);
    }
    // column badges 1..b on top
    for (let j = 0; j < this.b; j++) {
      const x = x0 + j * gap;
      const y = y0 - 30;
      const bd = this.add.text(x, y, digit(j + 1), txt(14, NV_GOLD, { bold: true })).setOrigin(0.5).setDepth(5);
      this.badges.push(bd);
    }
  }

  private tap(tile: Phaser.GameObjects.Container, str: string, isCorrect: boolean) {
    if (this.locked) return;
    const P = this.a * this.b;
    if (isCorrect) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.correct++;
      this.floatMsg(t("amGreat"));
      speak(t("amSpeak", { a: digit(this.a), b: digit(this.b), p: digit(P) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.tweens.add({ targets: tile, scale: 1.1, duration: 140, yoyo: true, ease: "Back.easeOut" });
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    hintWrongLocal(this, tile, () => `${digit(this.a)} × ${digit(this.b)} = ${digit(P)}`);
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
    this.floatMsg(`${t("amDone")}  ${digit(this.correct)}/${digit(this.total)}`);
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
      .text(this.scale.width / 2, this.scale.height * 0.55, text, txt(28, NV_GOLD, { bold: true, outline: true, wrap: 320 }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
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

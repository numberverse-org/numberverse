import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_CORRECT, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-dectenths")?.difficultyLevels ?? [4, 5, 6, 8, 8, 10];
const ROUNDS_TO_FINISH = 3;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ১ ২ ৩, English kids 1 2 3. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

/** Decimal display string for k tenths: 0.3 … 1.0 (Bangla digits when bn). */
function dec(k: number): string {
  return k === 10 ? `1.${digit(0)}` : `0.${digit(k)}`;
}

const SHADED = 0x4ade80;
const EMPTY = 0x475569;

/**
 * Decimal tenths — read & build (0.1 steps) (#198).
 * Band 3: a 10-cell strip where every cell is 0.1. Questions alternate:
 *  · READ  — k cells are shaded green; the kid taps the matching decimal (0.3).
 *  · BUILD — "Shade 3 tenths"; the kid taps cells to shade them (green, toggle)
 *            then ✅ checks. Correct count → "3 tenths" floats + is spoken.
 * Place-value speech reinforces the tenths naming on every correct answer.
 */
export class DecTenthsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private building = false; // true: build; false: read
  private k = 3;
  private lastK = -1;
  private cells: Phaser.GameObjects.Rectangle[] = [];
  private shaded: boolean[] = [];
  private tiles: { sprite: Phaser.GameObjects.Container; val: string; correct: boolean }[] = [];
  private countText!: Phaser.GameObjects.Text;
  private checkBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;

  constructor() {
    super("DecTenths");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "space");
    this.titleText = this.add
      .text(0, 0, t("titleDecTenths"), txt(34, "#ffffff", { bold: true }))
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
    this.countText = this.add
      .text(0, 0, "", txt(34, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(6);
    this.checkBtn = modernCardButton(this, 0, 0, 150, 74, "✅", BTN_CORRECT, 30);
    this.checkBtn.on("pointerdown", () => this.checkBuild());
    this.checkBtn.setVisible(false);

    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.15);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.tallyText.setPosition(width / 2, height * 0.46);
    this.layoutStrip();
  }

  private kRange(): [number, number] {
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    if (lvl < 2) return [1, 5];
    if (lvl < 4) return [1, 9];
    return [0, 10];
  }

  private startRound() {
    this.clearAll();
    this.locked = false;
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.qIndex = 0;
    this.lastK = -1;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearAll();
    this.locked = false;
    const [lo, hi] = this.kRange();
    let guard = 0;
    do {
      this.k = Phaser.Math.Between(lo, hi);
      guard++;
    } while (this.k === this.lastK && guard < 30);
    this.lastK = this.k;
    this.building = this.qIndex % 2 === 1;
    this.prompt.setText(this.building ? t("deBuild", { n: digit(this.k) }) : t("deRead"));
    this.buildStrip();
    if (this.building) {
      this.checkBtn.setVisible(true);
      this.countText.setVisible(true);
      this.countText.setText(dec(0));
    } else {
      this.spawnOptions();
    }
  }

  /** 10-cell strip; READ shows k green cells, BUILD starts empty + tappable. */
  private buildStrip() {
    this.cells.forEach((c) => c.destroy());
    this.cells = [];
    this.shaded = new Array(10).fill(false);
    const { width, height } = this.scale;
    const cellW = Math.min(46, (width - 40) / 10);
    const cellH = 64;
    const gap = 3;
    const totalW = 10 * cellW + 9 * gap;
    const x0 = width / 2 - totalW / 2;
    const y = height * 0.3;
    for (let i = 0; i < 10; i++) {
      const filled = this.building ? false : i < this.k;
      const c = this.add
        .rectangle(x0 + i * (cellW + gap) + cellW / 2, y, cellW, cellH, filled ? SHADED : EMPTY, 1)
        .setStrokeStyle(2, 0xffffff, 0.8)
        .setOrigin(0.5)
        .setDepth(5);
      if (this.building) {
        c.setInteractive({ useHandCursor: true });
        c.on("pointerdown", () => this.toggleCell(i));
      }
      this.cells.push(c);
      if (filled) this.shaded[i] = true;
    }
  }

  private layoutStrip() {
    if (this.cells.length !== 10) return;
    const { width, height } = this.scale;
    const cellW = this.cells[0].width;
    const gap = 3;
    const totalW = 10 * cellW + 9 * gap;
    const x0 = width / 2 - totalW / 2;
    const y = height * 0.3;
    this.cells.forEach((c, i) => {
      c.setPosition(x0 + i * (cellW + gap) + cellW / 2, y);
    });
    this.countText.setPosition(width / 2, y + 52);
    this.checkBtn.setPosition(width / 2, height - 64 - SAB());
  }

  private toggleCell(i: number) {
    if (this.locked) return;
    this.shaded[i] = !this.shaded[i];
    this.cells[i].setFillStyle(this.shaded[i] ? SHADED : EMPTY, 1);
    pop();
    this.countText.setText(dec(this.shaded.filter(Boolean).length));
  }

  private spawnOptions() {
    const [lo, hi] = this.kRange();
    const cands: number[] = [];
    for (let k = lo; k <= hi; k++) if (k !== this.k) cands.push(k);
    cands.sort(() => Math.random() - 0.5);
    const opts = [dec(this.k), dec(cands[0]), dec(cands[1]), dec(cands[2])].sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: 2,
      rows: 2,
      preferredW: 150,
      minW: 110,
      widthPad: 16,
      topPad: this.scale.height * 0.56,
      bottomY: this.scale.height - 24 - SAB(),
      cardH: 66,
    });
    opts.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tile = modernCardButton(this, gl.startX + col * gl.spacingX, gl.cy + row * gl.spacingY, gl.cardW, 66, s, BTN_NEUTRAL, 30);
      const isCorrect = s === dec(this.k);
      tile.on("pointerdown", () => this.tap(tile, s, isCorrect));
      this.tiles.push({ sprite: tile, val: s, correct: isCorrect });
    });
  }

  private tap(tile: Phaser.GameObjects.Container, str: string, isCorrect: boolean) {
    if (this.locked) return;
    if (isCorrect) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.correct++;
      this.floatMsg(`${t("deGreat")}  ${digit(this.k)}/10 = ${dec(this.k)}`, 0x4ade80);
      speak(t("deSpeak", { n: digit(this.k) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.tweens.add({ targets: tile, scale: 1.1, duration: 140, yoyo: true, ease: "Back.easeOut" });
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    hintWrongLocal(this, tile, () => dec(this.k));
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.advance(ms);
  }

  private checkBuild() {
    if (this.locked) return;
    const shaded = this.shaded.filter(Boolean).length;
    if (shaded === this.k) {
      this.locked = true;
      win();
      this.correct++;
      this.floatMsg(t("deGreat"), 0x4ade80);
      speak(t("deSpeak", { n: digit(this.k) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    this.floatMsg(t("deHint", { n: digit(this.k) }), 0xffd166);
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
    this.floatMsg(`${t("deDone")}  ${digit(this.correct)}/${digit(this.total)}`);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.correct === this.total, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.42, text, txt(26, `#${color.toString(16).padStart(6, "0")}`, { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }

  private clearAll() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
    this.cells.forEach((c) => c.destroy());
    this.cells = [];
    this.shaded = [];
    this.checkBtn.setVisible(false);
    this.countText.setVisible(false);
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

import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-mixedfrac")?.difficultyLevels ?? [4, 5, 6, 8, 8, 10];
const ROUNDS_TO_FINISH = 3;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ১ ২ ৩, English kids 1 2 3. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

interface Frac {
  w: number; // whole part (1 or 2)
  r: number; // fraction numerator (1..d-1)
  d: number; // denominator (2, 3 or 4)
}

/**
 * Mixed numbers ↔ improper fractions (#197).
 * Band 3: a mixed number like 1½ is drawn as whole bars + a fraction bar, with a
 * 0..3 number line marking the value; the kid taps the equivalent IMPROPER
 * fraction (3/2). Next question flips it: an improper-fraction bar (3 halves)
 * is shown and the kid taps the equivalent MIXED number (1½). Every round mixes
 * both conversion directions so the equivalence bar = number-line sinks in.
 */
export class MixedFracScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private toImprop = true; // true: mixed → improper; false: improper → mixed
  private cur: Frac = { w: 1, r: 1, d: 2 };
  private lastKey = -1; // value key of the previous question (no repeats)
  private tiles: { sprite: Phaser.GameObjects.Container; val: string; correct: boolean }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private bars!: Phaser.GameObjects.Graphics;
  private numline!: Phaser.GameObjects.Graphics;
  private tickLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("MixedFrac");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleMixedFrac"), txt(34, "#ffffff", { bold: true }))
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
    this.bars = this.add.graphics().setDepth(4);
    this.numline = this.add.graphics().setDepth(4);
    for (let i = 0; i <= 3; i++) {
      this.tickLabels.push(this.add.text(0, 0, digit(i), txt(18, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(5));
    }

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
    this.tallyText.setPosition(width / 2, height * 0.55);
    this.drawGiven();
    this.drawNumberLine();
  }

  private startRound() {
    this.clearTiles();
    this.locked = false;
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.qIndex = 0;
    this.lastKey = -1;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askQuestion();
  }

  /** Improper numerator n of the current fraction: w*d + r. */
  private n(): number {
    return this.cur.w * this.cur.d + this.cur.r;
  }

  /** Mixed display string, e.g. 1 1/2. */
  private mixedStr(): string {
    return `${digit(this.cur.w)} ${digit(this.cur.r)}/${digit(this.cur.d)}`;
  }

  /** Improper display string, e.g. 3/2. */
  private impStr(): string {
    return `${digit(this.n())}/${digit(this.cur.d)}`;
  }

  /** Integer key of the fraction's VALUE (d ∈ {2,3,4} → ×12 stays integral). */
  private valueKey(f: Frac): number {
    return f.w * 12 + (f.r * 12) / f.d;
  }

  private allCands(dens: number[]): Frac[] {
    const out: Frac[] = [];
    for (const d of dens) {
      for (let w = 1; w <= 2; w++) {
        for (let r = 1; r < d; r++) {
          out.push({ w, r, d });
        }
      }
    }
    return out;
  }

  private askQuestion() {
    this.clearTiles();
    this.locked = false;
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    // [2] alone can never fill 4 options (only 3/2 and 5/2 exist) — 2 and 3 is
    // the smallest pool with enough value-distinct improper/mixed candidates.
    const dens = lvl < 2 ? [2, 3] : lvl < 4 ? [2, 3] : [2, 3, 4];
    this.toImprop = this.qIndex % 2 === 0;

    // Pick a fresh (w, r, d) — value never repeats the previous question.
    let guard = 0;
    do {
      const d = dens[Phaser.Math.Between(0, dens.length - 1)];
      const w = Phaser.Math.Between(1, 2);
      const r = Phaser.Math.Between(1, d - 1);
      this.cur = { w, r, d };
      guard++;
    } while (this.valueKey(this.cur) === this.lastKey && guard < 20);
    this.lastKey = this.valueKey(this.cur);

    this.prompt.setText(
      this.toImprop
        ? t("mfImprop", { w: digit(this.cur.w), r: digit(this.cur.r), d: digit(this.cur.d) })
        : t("mfMixed", { n: digit(this.n()), d: digit(this.cur.d) })
    );

    this.drawGiven();
    this.drawNumberLine();

    // Answer string + 3 value-distinct distractors.
    const ansStr = this.toImprop ? this.impStr() : this.mixedStr();
    const cands = this.allCands(dens).filter((f) => this.valueKey(f) !== this.valueKey(this.cur));
    cands.sort(() => Math.random() - 0.5);
    const str = (f: Frac) =>
      this.toImprop
        ? `${digit(f.w * f.d + f.r)}/${digit(f.d)}`
        : `${digit(f.w)} ${digit(f.r)}/${digit(f.d)}`;
    const opts = [ansStr, str(cands[0]), str(cands[1]), str(cands[2])].sort(() => Math.random() - 0.5);

    const gl = gridLayout(this, {
      cols: 2,
      rows: 2,
      preferredW: 180,
      minW: 120,
      widthPad: 16,
      topPad: this.scale.height * 0.62,
      bottomY: this.scale.height - 24 - SAB(),
      cardH: 70,
    });
    opts.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tile = modernCardButton(this, gl.startX + col * gl.spacingX, gl.cy + row * gl.spacingY, gl.cardW, 70, s, BTN_NEUTRAL, 26);
      const isCorrect = s === ansStr;
      tile.on("pointerdown", () => this.tap(tile, s, isCorrect));
      this.tiles.push({ sprite: tile, val: s, correct: isCorrect });
    });
  }

  /** The given form's bar model: mixed = w whole bars + a r/d bar; improper = n/d split bars. */
  private drawGiven() {
    this.bars.clear();
    const { width, height } = this.scale;
    const bh = 38;
    const gap = 6;
    const y = height * 0.28;
    const nb = this.toImprop ? this.cur.w + 1 : Math.ceil(this.n() / this.cur.d);
    const bw = Math.min(110, (width - 48) / nb);
    const totalW = nb * bw + (nb - 1) * gap;
    let x = width / 2 - totalW / 2;
    if (this.toImprop) {
      // w whole bars (every segment filled) then one fraction bar (r/d).
      for (let i = 0; i < this.cur.w; i++) {
        this.unitBar(x, y, bw, bh, this.cur.d, this.cur.d);
        x += bw + gap;
      }
      this.unitBar(x, y, bw, bh, this.cur.d, this.cur.r);
    } else {
      // ceil(n/d) bars split into d, the first n segments filled.
      for (let i = 0; i < nb; i++) {
        const filled = Math.max(0, Math.min(this.cur.d, this.n() - i * this.cur.d));
        this.unitBar(x, y, bw, bh, this.cur.d, filled);
        x += bw + gap;
      }
    }
  }

  /** One unit bar split into `d` segments; the first `filled` are green. */
  private unitBar(x: number, y: number, w: number, h: number, d: number, filled: number) {
    const segW = w / d;
    for (let i = 0; i < d; i++) {
      this.bars.fillStyle(i < filled ? 0x4ade80 : 0x475569, 1);
      this.bars.fillRect(x + i * segW, y, segW, h);
    }
    this.bars.lineStyle(2, 0xffffff, 1);
    this.bars.strokeRect(x, y, w, h);
    this.bars.lineStyle(1, 0x1e293b, 0.6);
    for (let i = 1; i < d; i++) {
      this.bars.lineBetween(x + i * segW, y, x + i * segW, y + h);
    }
  }

  /** 0..3 number line with the current value marked in gold. */
  private drawNumberLine() {
    this.numline.clear();
    const { width, height } = this.scale;
    const y = height * 0.46;
    const x0 = width * 0.12;
    const x1 = width * 0.88;
    const len = x1 - x0;
    const val = this.cur.w + this.cur.r / this.cur.d;
    const px = x0 + (val / 3) * len;
    this.numline.lineStyle(3, 0xffffff, 0.9);
    this.numline.lineBetween(x0, y, x1, y);
    this.numline.lineStyle(5, 0x4ade80, 1);
    this.numline.lineBetween(x0, y, px, y);
    for (let i = 0; i <= 3; i++) {
      const tx = x0 + (i / 3) * len;
      this.numline.lineStyle(2, 0xffffff, 1);
      this.numline.lineBetween(tx, y - 8, tx, y + 8);
      this.tickLabels[i].setPosition(tx, y + 22);
    }
    this.numline.fillStyle(0xffd166, 1);
    this.numline.fillCircle(px, y, 8);
  }

  private tap(tile: Phaser.GameObjects.Container, str: string, isCorrect: boolean) {
    if (this.locked) return;
    if (isCorrect) {
      this.locked = true;
      pop();
      win();
      this.correct++;
      this.floatMsg(t("mfGreat"));
      speak(
        t("mfSpeak", { a: this.toImprop ? this.mixedStr() : this.impStr(), b: this.toImprop ? this.impStr() : this.mixedStr() }),
        { lang: getAppLang() === "bn" ? "bn" : "en" }
      );
      this.tweens.add({ targets: tile, scale: 1.1, duration: 140, yoyo: true, ease: "Back.easeOut" });
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    hintWrongLocal(this, tile, () => (this.toImprop ? this.impStr() : this.mixedStr()));
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
    this.floatMsg(`${t("mfDone")}  ${digit(this.correct)}/${digit(this.total)}`);
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
      .text(this.scale.width / 2, this.scale.height * 0.4, text, txt(28, NV_GOLD, { bold: true, outline: true, wrap: 320 }))
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

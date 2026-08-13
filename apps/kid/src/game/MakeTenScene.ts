import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-maketen")?.difficultyLevels ?? [5, 6, 8, 8, 10, 10];
const ROUNDS_TO_FINISH = 3;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ১ ২ ৩, English kids 1 2 3. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

/**
 * Making ten strategy (#191).
 * Band 1/2: compose ten inside a TEN-FRAME, then bridge to the teens.
 * Every question shows 8+5 = 8+2+3 = 10+3: the first ten-frame fills the
 * make-ten dots green, the leftover dots carry into a second frame (yellow),
 * and the strategy line + spoken "make ten" confirmation teach the shortcut.
 */
export class MakeTenScene extends Phaser.Scene {
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
  private fill = 0; // b-part that fills the frame
  private left = 0; // leftover b that bridges past 10
  private tiles: { sprite: Phaser.GameObjects.Container; val: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private tallyText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private framesGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super("MakeTen");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "magic");
    this.titleText = this.add
      .text(0, 0, t("titleMakeTen"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.hintText = this.add
      .text(0, 0, "", txt(22, "#4ade80", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5)
      .setVisible(false);
    this.framesGfx = this.add.graphics().setDepth(4);

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.2);
    this.tallyText.setPosition(width / 2, height * 0.3);
    this.hintText.setPosition(width / 2, height * 0.55);
    this.hintText.setWordWrapWidth(Math.max(200, width - 60));
    if (this.tiles.length === 0) this.drawFrames();
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

  private askQuestion() {
    this.clearTiles();
    this.locked = false;
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    const minA = lvl < 2 ? 7 : 6;
    this.a = Phaser.Math.Between(minA, 9);
    const bMin = Math.max(2, 10 - this.a + 1); // always bridges past ten
    this.b = Phaser.Math.Between(bMin, 9);
    this.fill = 10 - this.a;
    this.left = this.b - this.fill;
    const ans = this.a + this.b;
    this.prompt.set(`${digit(this.a)} + ${digit(this.b)} = ?`);
    this.drawFrames();
    this.hintText
      .setText(t("mtHint", { a: digit(this.a), m: digit(this.fill), l: digit(this.left), n: digit(ans) }))
      .setVisible(true);

    const opts = new Set<number>([ans]);
    while (opts.size < 4) {
      const d = ans + Phaser.Math.Between(-3, 3);
      if (d >= 10 && d <= 19) opts.add(d);
    }
    const bank = [...opts].sort(() => Math.random() - 0.5);

    const gl = gridLayout(this, {
      cols: 4,
      rows: 1,
      preferredW: 120,
      minW: 64,
      widthPad: 16,
      topPad: this.scale.height * 0.64,
      bottomY: this.scale.height - 40 - SAB(),
      cardH: 84,
    });
    bank.forEach((val, i) => {
      const tile = modernCardButton(this, gl.startX + i * gl.spacingX, gl.cy, gl.cardW, 84, digit(val), BTN_NEUTRAL, 34);
      tile.on("pointerdown", () => this.tap(tile, val));
      this.tiles.push({ sprite: tile, val });
    });
  }

  /** Two 2×5 ten-frames: frame 1 shows a + make = 10, frame 2 shows the leftover. */
  private drawFrames() {
    this.framesGfx.clear();
    const { width, height } = this.scale;
    const cy = height * 0.42;
    const box = 26;
    const rows = 2;
    const cols = 5;
    const frameW = box * cols;
    const gapBetween = 34;
    const totalW = frameW * 2 + gapBetween;
    const x0 = width / 2 - totalW / 2;
    // base addend a (blue), make-ten fill (green), leftover (yellow)
    const dot = (fx: number, i: number, fill: number) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      this.framesGfx.fillStyle(fill, 1);
      this.framesGfx.fillCircle(fx + c * box + box / 2, cy + r * box + box / 2, box / 2 - 4);
    };
    const drawFrame = (fx: number, count: number, fill: number) => {
      this.framesGfx.lineStyle(2, 0xffffff, 0.8);
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          this.framesGfx.strokeRect(fx + c * box, cy + r * box, box, box);
        }
      }
      for (let i = 0; i < count; i++) dot(fx, i, fill);
    };
    drawFrame(x0, this.a, 0x7dd3fc); // blue base addend
    for (let i = this.a; i < this.a + this.fill; i++) dot(x0, i, 0x4ade80); // green make-ten fill
    drawFrame(x0 + frameW + gapBetween, this.left, 0xffd166); // leftover bridges to teens
  }

  private tap(tile: Phaser.GameObjects.Container, val: number) {
    if (this.locked) return;
    const ans = this.a + this.b;
    if (val === ans) {
      this.locked = true;
      pop();
      win();
      this.correct++;
      const ms = Math.max(1, this.time.now - this.startedAt);
      speak(t("mtWin", { a: digit(this.a), m: digit(this.fill), l: digit(this.left), n: digit(ans) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.tweens.add({ targets: tile, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    hintWrongLocal(this, tile, () => digit(ans));
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.advance(ms);
  }

  private advance(ms: number) {
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.qIndex++;
      this.time.delayedCall(950, () => this.askQuestion());
      return;
    }
    this.finishRound(ms);
  }

  private finishRound(ms: number) {
    this.floatMsg(`${t("mtDone")}  ${digit(this.correct)}/${digit(this.total)}`);
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
      .text(this.scale.width / 2, this.scale.height * 0.68, text, txt(26, "#ffd166", { bold: true, outline: true, wrap: 320 }))
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
    .text(tile.x, tile.y - 40, correct(), txt(22, "#4ade80", { bold: true, outline: true }))
    .setOrigin(0.5)
    .setDepth(40);
  scene.tweens.add({ targets: m, y: m.y - 20, alpha: 0, duration: 700, onComplete: () => m.destroy() });
}

import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-subfacts")?.difficultyLevels ?? [6, 8, 10, 10, 12, 12];
const ROUNDS_TO_FINISH = 3;
const QUESTION_TIME = 6000; // ms per fact — a real timed drill
const FAST_MS = 2500; // faster than this → ⚡
const NUM_MIN = 0;
const NUM_MAX = 20;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ১ ২ ৩, English kids 1 2 3. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

/**
 * Subtraction facts to 20 fluency — the minus twin of FactsAddScene (#189).
 * Band 1/2 timed sprint: rapid-fire "a − b = ?" with a 6s countdown bar per fact
 * and a VISUAL NUMBER LINE (0–20) as the always-visible aid: the minuend is
 * marked at question time, and after the answer a ball hops back b steps from a
 * to land on the difference. Speed ⚡ (<2.5s) + accuracy tally on every finish.
 */
export class SubFactsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private totalMs = 0;
  private fastCount = 0;
  private qStart = 0;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private timerTween?: Phaser.Tweens.Tween;
  private a = 0;
  private b = 0;
  private tiles: { sprite: Phaser.GameObjects.Container; val: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private tallyText!: Phaser.GameObjects.Text;
  // number line
  private numLine!: Phaser.GameObjects.Graphics;
  private numLabels: Phaser.GameObjects.Text[] = [];
  private markerDot!: Phaser.GameObjects.Arc;
  private markerLabel!: Phaser.GameObjects.Text;
  private xStart = 0;
  private xEnd = 0;
  private yLine = 0;

  constructor() {
    super("SubFacts");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "ocean");
    this.titleText = this.add
      .text(0, 0, t("titleSubFacts"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.timerBar = this.add.rectangle(0, 0, 0, 10, 0xffd166).setOrigin(0, 0.5).setDepth(5);

    // number line 0–20 (the visual aid)
    this.numLine = this.add.graphics().setDepth(6);
    this.markerDot = this.add.circle(0, 0, 7, 0xffd166).setDepth(7);
    this.markerLabel = this.add.text(0, 0, "", txt(14, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(7);

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.3);
    this.tallyText.setPosition(width / 2, height * 0.42);
    this.timerBar.setPosition(24, height * 0.38).setSize(width - 48, 10);
    this.drawNumLine();
  }

  private drawNumLine() {
    const { width, height } = this.scale;
    const y = height - 64 - SAB();
    this.yLine = y;
    this.xStart = 28;
    this.xEnd = width - 28;
    this.numLine.clear();
    this.numLine.lineStyle(3, 0xffffff, 0.85);
    this.numLine.beginPath();
    this.numLine.moveTo(this.xStart, y);
    this.numLine.lineTo(this.xEnd, y);
    this.numLine.strokePath();
    for (let i = NUM_MIN; i <= NUM_MAX; i++) {
      const x = this.x(i);
      const is5 = i % 5 === 0;
      this.numLine.lineStyle(is5 ? 3 : 1.5, 0xffffff, is5 ? 0.95 : 0.5);
      this.numLine.beginPath();
      this.numLine.moveTo(x, y - (is5 ? 9 : 5));
      this.numLine.lineTo(x, y + (is5 ? 9 : 5));
      this.numLine.strokePath();
    }
    this.numLabels.forEach((lb) => lb.destroy());
    this.numLabels = [];
    for (let i = NUM_MIN; i <= NUM_MAX; i += 5) {
      const lb = this.add
        .text(this.x(i), y + 16, digit(i), txt(13, "#ffffff", { bold: i === 0 || i === NUM_MAX }))
        .setOrigin(0.5)
        .setDepth(6);
      this.numLabels.push(lb);
    }
  }

  private x(i: number): number {
    return this.xStart + (i - NUM_MIN) * (this.xEnd - this.xStart) / (NUM_MAX - NUM_MIN);
  }

  private startRound() {
    this.clearTiles();
    this.locked = false;
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.totalMs = 0;
    this.fastCount = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askFact();
  }

  private factRange(): number {
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    if (lvl < 2) return 10; // minuends to 10
    if (lvl < 4) return 16; // minuends to 16
    return 20; // full fact family to 20
  }

  private askFact() {
    this.clearTiles();
    this.locked = false;
    const maxA = this.factRange();
    this.a = Phaser.Math.Between(1, maxA);
    this.b = Phaser.Math.Between(1, this.a);
    this.prompt.set(`${digit(this.a)} − ${digit(this.b)} = ?`);
    this.placeMarker(this.a, 0xffd166);

    const ans = this.a - this.b;
    const opts = new Set<number>([ans]);
    while (opts.size < 4) {
      const d = ans + Phaser.Math.Between(-3, 3);
      if (d >= 0 && d <= 20) opts.add(d);
    }
    const bank = [...opts].sort(() => Math.random() - 0.5);

    const gl = gridLayout(this, {
      cols: 4,
      rows: 1,
      preferredW: 120,
      minW: 64,
      widthPad: 16,
      topPad: this.scale.height * 0.52,
      bottomY: this.yLine - 64,
      cardH: 84,
    });
    bank.forEach((val, i) => {
      const tile = modernCardButton(this, gl.startX + i * gl.spacingX, gl.cy, gl.cardW, 84, digit(val), BTN_NEUTRAL, 34);
      tile.on("pointerdown", () => this.tap(tile, val));
      this.tiles.push({ sprite: tile, val });
    });

    this.qStart = this.time.now;
    this.timerBar.setSize(this.scale.width - 48, 10).setFillStyle(0xffd166).setAlpha(1);
    this.timerTween?.stop();
    this.timerTween = this.tweens.add({
      targets: this.timerBar,
      width: 0,
      duration: QUESTION_TIME,
      ease: "Linear",
      onComplete: () => this.timeout(),
    });
  }

  private placeMarker(at: number, color: number) {
    this.markerDot.setFillStyle(color).setPosition(this.x(at), this.yLine);
    this.markerLabel.setText(digit(at)).setPosition(this.x(at), this.yLine - 24);
  }

  private tap(tile: Phaser.GameObjects.Container, val: number) {
    if (this.locked) return;
    if (val === this.a - this.b) {
      this.locked = true;
      pop();
      win();
      const ms = Math.max(1, this.time.now - this.qStart);
      this.totalMs += ms;
      this.correct++;
      if (ms < FAST_MS) this.fastCount++;
      this.tweens.add({ targets: tile, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.hopReveal();
      this.advance();
      return;
    }
    bad();
    this.locked = true;
    this.totalMs += Math.max(1, this.time.now - this.qStart);
    hintWrongLocal(this, tile, () => digit(this.a - this.b));
    this.hopReveal();
    this.advance();
  }

  private timeout() {
    if (this.locked) return;
    this.locked = true;
    this.totalMs += QUESTION_TIME;
    this.floatMsg(t("fgSlow"));
    this.hopReveal();
    this.advance();
  }

  /** Ball hops back b steps on the number line from a → a−b, landing green. */
  private hopReveal() {
    const ans = this.a - this.b;
    const hops = Math.min(this.b, 6);
    const dot = this.add.circle(this.x(this.a), this.yLine - 6, 8, 0x4ade80).setDepth(9);
    const badge = this.add
      .text(this.x(this.a), this.yLine - 34, `−${digit(this.b)}`, txt(16, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(9);
    const seq: object[] = [];
    let cur = this.a;
    for (let h = 0; h < hops; h++) {
      seq.push({ x: this.x(cur - 1), y: this.yLine - 26, duration: 70, ease: "Sine.easeOut" });
      seq.push({ y: this.yLine - 6, duration: 70, ease: "Sine.easeIn" });
      cur = cur - 1;
    }
    if (this.b > hops) {
      seq.push({ x: this.x(ans), duration: 240, ease: "Sine.easeInOut" });
    }
    this.tweens.chain({
      targets: dot,
      tweens: seq,
      onComplete: () => {
        this.placeMarker(ans, 0x4ade80);
        badge.setText(`= ${digit(ans)}`);
        badge.setColor(NV_GREEN);
        this.tweens.add({ targets: dot, alpha: 0, duration: 300, onComplete: () => dot.destroy() });
        this.tweens.add({ targets: badge, y: badge.y - 16, alpha: 0, duration: 500, onComplete: () => badge.destroy() });
      },
    });
  }

  private advance() {
    this.timerTween?.stop();
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.time.delayedCall(950, () => this.askFact());
      return;
    }
    this.finishRound();
  }

  private finishRound() {
    const avg = this.totalMs / this.total / 1000;
    this.floatMsg(`${t("fgDone")}  ${t("fgCorr", { n: digit(this.correct) })}  ${t("fgAvg", { s: avg.toFixed(1) })}  ${"⚡".repeat(Math.min(3, this.fastCount))}`);
    const ms = Math.max(1, this.time.now - this.startedAt);
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
      .text(this.scale.width / 2, this.scale.height * 0.68, text, txt(24, NV_GOLD, { bold: true, outline: true, wrap: 300 }))
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
    .text(tile.x, tile.y - 40, correct(), txt(22, NV_GREEN, { bold: true, outline: true }))
    .setOrigin(0.5)
    .setDepth(40);
  scene.tweens.add({ targets: m, y: m.y - 20, alpha: 0, duration: 700, onComplete: () => m.destroy() });
}

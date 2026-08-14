import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";

/** terms revealed before the blank, per level */
const LEVELS = GAMES.find((g) => g.id === "game-skipcount")?.difficultyLevels ?? [2, 3, 3, 4, 4, 5];
/** upper bound for the random start, per level */
const MAX_START = [6, 12, 12, 24, 24, 48];
const ROUNDS_TO_FINISH = 3;

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Skip count! (#225). A band-2/3 math pattern game continuing +3 and +4
 * sequences on a number line. Shows a run of terms ("0 · 3 · 6 · ___") with
 * green dots on a number line and a pulsing "?" at the next position; the kid
 * taps the next number from 3 options. Off-by-one distractors reward true
 * skip-counting, never a penalty.
 */
export class SkipCountScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private start = 0;
  private step = 3;
  private terms = 2;
  private seq: number[] = [];
  private correct = 0;
  private options: number[] = [];
  private qIdx = 0;
  private wrongs = 0;
  private locked = false;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private seqText!: Phaser.GameObjects.Text;
  private lineG!: Phaser.GameObjects.Graphics;
  private dotLabels: Phaser.GameObjects.Text[] = [];
  private blankText?: Phaser.GameObjects.Text;
  private optionBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("SkipCount");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sunset");
    this.titleText = this.add
      .text(0, 0, t("titleSc"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, t("scPrompt"), txt(26, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.seqText = this.add
      .text(0, 0, "", txt(36, "#ffffff", { bold: true, outline: true, wrap: 380 }))
      .setOrigin(0.5);
    this.lineG = this.add.graphics().setDepth(20);
    this.buildOptions();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 32);
    this.roundText.setPosition(width / 2, 64);
    this.meter.setPosition(width / 2, 88);
    this.promptText.setPosition(width / 2, height * 0.38);
    this.promptText.setWordWrapWidth(Math.max(220, width - 50));
    this.seqText.setPosition(width / 2, height * 0.28);
    this.seqText.setWordWrapWidth(Math.max(220, width - 50));
    this.drawLine();
    for (const b of this.optionBtns) {
      if (b.width !== Math.min(300, width - 40)) {
        this.buildOptions();
        return;
      }
    }
    const bw = Math.min(300, width - 40);
    const ys = [height * 0.68, height * 0.8, height * 0.92];
    for (let i = 0; i < 3; i++) this.optionBtns[i]?.setPosition(width / 2, ys[i]);
  }

  private buildOptions() {
    const { width, height } = this.scale;
    for (const b of this.optionBtns) b.destroy(true);
    this.optionBtns = [];
    const bw = Math.min(300, width - 40);
    const ys = [height * 0.68, height * 0.8, height * 0.92];
    for (let i = 0; i < 3; i++) {
      const b = modernCardButton(this, width / 2, ys[i], bw, 54, "", BTN_NEUTRAL, 24);
      b.on("pointerdown", () => this.tap(i));
      this.optionBtns.push(b);
    }
  }

  private startRound() {
    this.terms = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.qIdx = 0;
    this.wrongs = 0;
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.showNext();
  }

  private newQuestion() {
    const maxStart = MAX_START[Math.min(this.levelIndex, MAX_START.length - 1)];
    this.start = Math.floor(Math.random() * (maxStart + 1));
    this.step = Math.random() < 0.5 ? 3 : 4;
    this.seq = Array.from({ length: this.terms }, (_, i) => this.start + i * this.step);
    this.correct = this.start + this.terms * this.step;
    // off-by-one/off-by-two distractors reward true skip-counting
    const dist = shuffle([this.correct + 1, this.correct - 1, this.correct + 2, this.correct - 2].filter((v) => v >= 0));
    this.options = [this.correct];
    for (const v of dist) {
      if (this.options.length >= 3) break;
      if (!this.options.includes(v)) this.options.push(v);
    }
    this.options = shuffle(this.options);
  }

  private showNext() {
    if (this.qIdx >= 4) {
      this.finishRound();
      return;
    }
    this.qIdx++;
    this.newQuestion();
    this.seqText.setText(`${this.seq.join(" · ")} · ___`);
    for (let i = 0; i < 3; i++) {
      const api = this.optionBtns[i].getData("nv-btn") as { setLabel: (s: string) => void } | undefined;
      api?.setLabel(String(this.options[i]));
    }
    this.drawLine();
    speak(this.seq.join(", "), { lang: "en" });
  }

  /** Green dots for reached terms, pulsing "?" at the blank position. */
  private drawLine() {
    const { width, height } = this.scale;
    for (const lbl of this.dotLabels) lbl.destroy();
    this.dotLabels = [];
    this.blankText?.destroy();
    const y = height * 0.5;
    const pad = 34;
    const x0 = pad;
    const x1 = width - pad;
    const from = this.start;
    const to = this.start + this.terms * this.step;
    const total = Math.max(1, to - from);
    const px = (v: number) => x0 + ((v - from) / total) * (x1 - x0);
    const g = this.lineG;
    g.clear();
    g.lineStyle(4, 0xffffff, 0.9);
    g.lineBetween(x0, y, x1, y);
    // integer ticks (fine-grained when the span is small)
    const tickEvery = total <= 20 ? 1 : this.step;
    g.lineStyle(2, 0xffffff, 0.45);
    for (let v = from; v <= to; v += tickEvery) g.lineBetween(px(v), y - 6, px(v), y + 6);
    // reached terms: green dots + labels
    for (let i = 0; i < this.seq.length; i++) {
      const v = this.seq[i];
      g.fillStyle(0x4ade80, 1);
      g.fillCircle(px(v), y, 8);
      const lbl = this.add
        .text(px(v), y - 28, String(v), txt(17, "#d1fae5", { bold: true, outline: true }))
        .setOrigin(0.5);
      this.dotLabels.push(lbl);
    }
    // blank position: orange dot + pulsing "?"
    const bx = px(this.correct);
    g.fillStyle(0xffd166, 1);
    g.fillCircle(bx, y, 8);
    this.blankText = this.add
      .text(bx, y - 28, "?", txt(22, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: this.blankText, scale: 1.25, duration: 420, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  private tap(i: number) {
    if (this.locked) return;
    const picked = this.options[i];
    if (picked === this.correct) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.seqText.setText(`${this.seq.join(" · ")} · ${picked}`);
      this.blankText?.destroy();
      this.floatMsg(t("scGreat"), 0x4ade80);
      speak(`${this.seq.join(", ")}, ${picked}`, { lang: "en" });
      this.starBurst();
      (this.optionBtns[i].getData("nv-btn") as { setCorrect: () => void } | undefined)?.setCorrect();
      this.time.delayedCall(1400, () => {
        this.showNext();
      });
    } else {
      this.wrongs++;
      bad();
      speak(t("scGentle"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.floatMsg(t("scGentle"), 0xf87171);
      this.tweens.add({ targets: this.optionBtns[i], x: this.optionBtns[i].x - 8, duration: 60, yoyo: true, repeat: 2 });
    }
  }

  private starBurst() {
    const { width, height } = this.scale;
    for (let i = 0; i < 6; i++) {
      const s = this.add
        .text(width / 2, height * 0.33, i % 2 === 0 ? "✨" : "⭐", txt(22, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(40);
      this.tweens.add({
        targets: s,
        x: width / 2 + (i % 2 === 0 ? -1 : 1) * (30 + i * 18),
        y: height * 0.33 - 26 - i * 12,
        alpha: 0,
        duration: 800 + i * 60,
        ease: "Sine.easeOut",
        onComplete: () => s.destroy(),
      });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(t("scDone"), 0xffd166);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.wrongs === 0, ms, this.levelIndex + 1);
    this.time.delayedCall(1500, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.6, text, txt(24, "#ffffff", { bold: true, outline: true, wrap: 320 }))
      .setColor(color === 0xffd166 ? NV_GOLD : color === 0x4ade80 ? NV_GREEN : NV_RED)
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 22, alpha: 0, duration: 1300, onComplete: () => m.destroy() });
  }
}

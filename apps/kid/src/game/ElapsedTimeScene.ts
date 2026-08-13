import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-elapsed")?.difficultyLevels ?? [4, 5, 6, 8, 8, 10];
const ROUNDS_TO_FINISH = 3;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ১ ২ ৩, English kids 1 2 3. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

/** hh:mm with padded minutes — 2:45, 12:05 (Bangla digits when bn). */
function fmtTime(h: number, m: number): string {
  const mm = m < 10 ? `${digit(0)}${digit(m)}` : `${digit(Math.floor(m / 10))}${digit(m % 10)}`;
  return `${digit(h)}:${mm}`;
}

/**
 * Elapsed time — "how long until …?" (#200).
 * Band 3: an analog clock shows the START time; a digital chip shows the TARGET
 * ("until 2:45"). The kid finds how many minutes until then and taps the count
 * (30 min). On correct the clock hands sweep forward to the target — the elapsed
 * arc IS the answer.
 *  · lvl 1–2: deltas in 5s (5,10,15,20,30), starts on 5-min marks.
 *  · lvl 3:   deltas 5..45 in 5s.
 *  · lvl 4+:  any 1–59 minute delta.
 */
export class ElapsedTimeScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private startH = 9;
  private startM = 0;
  private delta = 30;
  private targetH = 10;
  private targetM = 0;
  private lastDelta = -1;
  private buttons: { sprite: Phaser.GameObjects.Container; val: string; correct: boolean }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private chipText!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private faceG!: Phaser.GameObjects.Graphics;
  private numLayer!: Phaser.GameObjects.Container;
  private hourHand!: Phaser.GameObjects.Graphics;
  private minuteHand!: Phaser.GameObjects.Graphics;

  constructor() {
    super("ElapsedTime");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "night");
    this.titleText = this.add
      .text(0, 0, t("titleElapsed"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.chipText = this.add
      .text(0, 0, "", txt(30, "#ffd166", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.faceG = this.add.graphics().setDepth(4);
    this.numLayer = this.add.container(0, 0).setDepth(5);
    this.hourHand = this.add.graphics().setDepth(6);
    this.minuteHand = this.add.graphics().setDepth(6);

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private clockGeo() {
    const { width, height } = this.scale;
    return { cx: width / 2, cy: height * 0.42, r: Math.min(width * 0.22, 84) };
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.15);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.chipText.setPosition(width / 2, height * 0.24);
    this.tallyText.setPosition(width / 2, height * 0.56);
    this.drawClock(this.startH, this.startM, false);
  }

  private startRound() {
    this.clearButtons();
    this.locked = false;
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.qIndex = 0;
    this.lastDelta = -1;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askQuestion();
  }

  private deltaPool(lvl: number): number[] {
    if (lvl < 2) return [5, 10, 15, 20, 30];
    if (lvl < 4) return [5, 10, 15, 20, 25, 30, 35, 40, 45];
    const out: number[] = [];
    for (let d = 1; d <= 59; d++) out.push(d);
    return out;
  }

  private askQuestion() {
    this.clearButtons();
    this.locked = false;
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    const pool = this.deltaPool(lvl);
    let guard = 0;
    do {
      this.delta = pool[Phaser.Math.Between(0, pool.length - 1)];
      guard++;
    } while (this.delta === this.lastDelta && guard < 40);
    this.lastDelta = this.delta;
    this.startH = Phaser.Math.Between(1, 12);
    this.startM = lvl < 4 ? Phaser.Math.Between(0, 11) * 5 : Phaser.Math.Between(0, 59);
    const total = ((this.startH % 12) * 60 + this.startM + this.delta) % 720;
    this.targetH = Math.floor(total / 60) === 0 ? 12 : Math.floor(total / 60);
    this.targetM = total % 60;

    const tStr = fmtTime(this.targetH, this.targetM);
    this.prompt.setText(t("etQ", { t: tStr }));
    this.chipText.setText(t("etUntil", { t: tStr }));
    this.drawClock(this.startH, this.startM, false);

    const cands = pool.filter((d) => d !== this.delta);
    cands.sort(() => Math.random() - 0.5);
    const lbl = (d: number) => t("etMin", { n: digit(d) });
    const opts = [lbl(this.delta), lbl(cands[0]), lbl(cands[1]), lbl(cands[2])].sort(() => Math.random() - 0.5);

    const gl = gridLayout(this, {
      cols: 2,
      rows: 2,
      preferredW: 170,
      minW: 110,
      widthPad: 16,
      topPad: this.scale.height * 0.62,
      bottomY: this.scale.height - 24 - SAB(),
      cardH: 66,
    });
    opts.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tile = modernCardButton(this, gl.startX + col * gl.spacingX, gl.cy + row * gl.spacingY, gl.cardW, 66, s, BTN_NEUTRAL, 28);
      const isCorrect = s === lbl(this.delta);
      tile.on("pointerdown", () => this.tap(tile, s, isCorrect));
      this.buttons.push({ sprite: tile, val: s, correct: isCorrect });
    });
  }

  private drawClock(h: number, m: number, animate: boolean) {
    const { cx, cy, r } = this.clockGeo();
    const g = this.faceG;
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx, cy, r);
    g.lineStyle(6, 0x0b2545, 1);
    g.strokeCircle(cx, cy, r);
    g.lineStyle(3, 0xffb703, 1);
    g.strokeCircle(cx, cy, r - 5);
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 * Math.PI) / 180;
      g.lineStyle(i % 3 === 0 ? 5 : 3, 0x0b2545, 1);
      g.lineBetween(cx + r * 0.86 * Math.sin(a), cy - r * 0.86 * Math.cos(a), cx + r * 0.95 * Math.sin(a), cy - r * 0.95 * Math.cos(a));
    }
    this.numLayer.removeAll(true);
    for (let i = 1; i <= 12; i++) {
      const a = (i * 30 * Math.PI) / 180;
      const rr = r * 0.74;
      const n = this.add
        .text(cx + rr * Math.sin(a), cy - rr * Math.cos(a), digit(i), txt(16, "#0b2545", { bold: true, shadow: false }))
        .setOrigin(0.5);
      this.numLayer.add(n);
    }
    g.fillStyle(0xffb703, 1);
    g.fillCircle(cx, cy, 6);
    const ma = m * 6;
    const ha = ((h % 12) + m / 60) * 30;
    this.hourHand.clear();
    this.hourHand.lineStyle(9, 0x0b2545, 1);
    this.hourHand.lineBetween(0, 0, 0, -r * 0.5);
    this.hourHand.setPosition(cx, cy);
    this.minuteHand.clear();
    this.minuteHand.lineStyle(5, 0x2ec4b6, 1);
    this.minuteHand.lineBetween(0, 0, 0, -r * 0.72);
    this.minuteHand.setPosition(cx, cy);
    if (animate) {
      this.tweens.add({ targets: this.minuteHand, angle: ma, duration: 800, ease: "Quad.easeOut" });
      this.tweens.add({ targets: this.hourHand, angle: ha, duration: 800, ease: "Quad.easeOut" });
    } else {
      this.tweens.killTweensOf(this.hourHand);
      this.tweens.killTweensOf(this.minuteHand);
      this.hourHand.setAngle(ha);
      this.minuteHand.setAngle(ma);
    }
  }

  private tap(tile: Phaser.GameObjects.Container, str: string, isCorrect: boolean) {
    if (this.locked) return;
    if (isCorrect) {
      this.locked = true;
      pop();
      win();
      this.correct++;
      this.floatMsg(t("etGreat"));
      speak(t("etSpeak", { n: digit(this.delta) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.tweens.add({ targets: tile, scale: 1.1, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.drawClock(this.targetH, this.targetM, true);
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    hintWrongLocal(this, tile, () => t("etMin", { n: digit(this.delta) }));
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
    this.floatMsg(`${t("etDone")}  ${digit(this.correct)}/${digit(this.total)}`);
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
      .text(this.scale.width / 2, this.scale.height * 0.42, text, txt(28, "#ffd166", { bold: true, outline: true, wrap: 320 }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }

  private clearButtons() {
    this.buttons.forEach((o) => o.sprite.destroy());
    this.buttons = [];
  }
}

/** Wrong-answer feedback without hintWrong's "keep on wrong" retirement. */
function hintWrongLocal(scene: Phaser.Scene, tile: Phaser.GameObjects.Container, correct: () => string) {
  scene.tweens.add({ targets: tile, scale: 0.9, duration: 90, yoyo: true, ease: "Sine.easeInOut" });
  tile.setAlpha(0.4);
  tile.disableInteractive();
  const m = scene.add
    .text(tile.x, tile.y - 40, correct(), txt(20, "#4ade80", { bold: true, outline: true }))
    .setOrigin(0.5)
    .setDepth(40);
  scene.tweens.add({ targets: m, y: m.y - 20, alpha: 0, duration: 700, onComplete: () => m.destroy() });
}

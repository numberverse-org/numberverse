import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak, bnNumber, enNumber } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, BTN_PRIMARY, ringCorrect, roundMeter, type RoundMeterApi, NV_GOLD, NV_NAVY } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-clock")?.difficultyLevels ?? [1, 2, 3, 4, 5, 6];
const ROUNDS_TO_FINISH = 3;
const BN_D = "০১২৩৪৫৬৭৮৯";

function bdDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => BN_D[Number(d)]);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Phaser.Math.Between(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** minute pattern per level (1 → o'clock, 2 → half, 3 → quarter, 4 → five-min
 *  skipping the easy marks, 5 → any five-min, 6 → any minute). */
const MODES: (number | "any" | number[])[] = [
  0,
  30,
  [15, 45],
  [5, 10, 20, 25, 35, 40, 50, 55],
  [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
  "any",
];

interface DigitalTime {
  h: number;
  m: number;
}

/**
 * Clock Time — read the analog clock, tap the digital time.
 * Band 3 (ages 6–8, math). A big friendly clock draws the hands in front of
 * the kid; o'clock → half → quarter → five-minute → any-minute as levels rise.
 */
export class ClockTimeScene extends Phaser.Scene {
  private levels = LEVELS;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private curTime: DigitalTime = { h: 12, m: 0 };
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private faceG!: Phaser.GameObjects.Graphics;
  private hourHand!: Phaser.GameObjects.Graphics;
  private minuteHand!: Phaser.GameObjects.Graphics;
  private numLayer!: Phaser.GameObjects.Container;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("ClockTime");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; levels?: number[] }) {
    this.onRoundDone = data.onRoundDone;
    // #1170 — the skill's own ladder (dataLevels, passed by App) picks the
    // minute-pattern range: tell-time (band 3) → [1..6] (o'clock → any minute),
    // clock-minute (band 6) → [5,6] (any 5-min → exact minute).
    this.levels = data.levels?.length ? data.levels : LEVELS;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "sunset");
    this.titleText = this.add
      .text(0, 0, t("titleClock"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.numLayer = this.add.container(0, 0);
    this.faceG = this.add.graphics();
    this.hourHand = this.add.graphics().setDepth(600);
    this.minuteHand = this.add.graphics().setDepth(600);
    onSceneResize(this, () => {
      this.layout();
      this.drawClock(true);
    });
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private clockCenter(): { cx: number; cy: number; r: number } {
    const { width, height } = this.scale;
    return {
      cx: width / 2,
      cy: height * 0.42,
      r: Math.max(80, Math.min(150, width * 0.3, height * 0.26)),
    };
  }

  private startRound() {
    this.clearButtons();
    this.startedAt = this.time.now;
    // #1170 — the skill's own ladder value (1..6 = o'clock..any-minute) picks
    // the MODES entry, so clock-minute (band 6, dataLevels [5,6]) drills only
    // 5-min steps + exact-minute, never re-teaches o'clock.
    const levelVal = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    const mode = MODES[Math.min(Math.max(0, levelVal - 1), MODES.length - 1)];
    const h = Phaser.Math.Between(1, 12);
    let m = 0;
    if (mode === "any") m = Phaser.Math.Between(0, 59);
    else if (Array.isArray(mode)) m = mode[Phaser.Math.Between(0, mode.length - 1)];
    else m = mode;
    this.curTime = { h, m };
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.prompt.set(t("clockAsk"));
    speak(t("clockAsk"));
    this.drawClock(false);
    this.spawnOptions();
  }

  private drawClock(instant: boolean) {
    const { cx, cy, r } = this.clockCenter();
    const g = this.faceG;
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx, cy, r);
    g.lineStyle(6, 0x0b2545, 1);
    g.strokeCircle(cx, cy, r);
    g.lineStyle(3, 0xffb703, 1);
    g.strokeCircle(cx, cy, r - 5);
    // 12 ticks
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 * Math.PI) / 180;
      const r1 = r * 0.86;
      const r2 = r * 0.95;
      g.lineStyle(i % 3 === 0 ? 5 : 3, 0x0b2545, 1);
      g.lineBetween(cx + r1 * Math.sin(a), cy - r1 * Math.cos(a), cx + r2 * Math.sin(a), cy - r2 * Math.cos(a));
    }
    // hour numbers
    this.numLayer.removeAll(true);
    for (let i = 1; i <= 12; i++) {
      const a = (i * 30 * Math.PI) / 180;
      const rr = r * 0.74;
      const label = getAppLang() === "bn" ? bdDigits(i) : String(i);
      const n = this.add
        .text(cx + rr * Math.sin(a), cy - rr * Math.cos(a), label, txt(16, NV_NAVY, { bold: true, shadow: false }))
        .setOrigin(0.5);
      this.numLayer.add(n);
    }
    // center dot
    g.fillStyle(0xffb703, 1);
    g.fillCircle(cx, cy, 6);
    // hands (angle 0 = pointing at 12; tween sweep on new rounds)
    const ma = this.curTime.m * 6;
    const ha = ((this.curTime.h % 12) + this.curTime.m / 60) * 30;
    this.hourHand.clear();
    this.hourHand.lineStyle(9, 0x0b2545, 1);
    this.hourHand.lineBetween(0, 0, 0, -r * 0.5);
    this.hourHand.setPosition(cx, cy);
    this.minuteHand.clear();
    this.minuteHand.lineStyle(5, 0x2ec4b6, 1);
    this.minuteHand.lineBetween(0, 0, 0, -r * 0.72);
    this.minuteHand.setPosition(cx, cy);
    if (instant) {
      this.tweens.killTweensOf(this.hourHand);
      this.tweens.killTweensOf(this.minuteHand);
      this.hourHand.setAngle(ha);
      this.minuteHand.setAngle(ma);
    } else {
      this.hourHand.setAngle(0);
      this.minuteHand.setAngle(0);
      this.tweens.add({ targets: this.hourHand, angle: ha, duration: 380, ease: "Quad.easeOut" });
      this.tweens.add({ targets: this.minuteHand, angle: ma, duration: 380, ease: "Quad.easeOut" });
    }
  }

  private spawnOptions() {
    const opts = this.buildOptions();
    const radius = 56;
    const { width } = this.scale;
    const spacing = radius * 2 + 14;
    const startX = width / 2 - (spacing * (opts.length - 1)) / 2;
    const y = this.answersY;
    opts.forEach((t, i) => {
      const label = this.fmtDigital(t);
      const c = modernAnswerButton(this, startX + i * spacing, y, radius, label, BTN_PRIMARY, { labelSize: 30 });
      c.on("pointerdown", () => this.tap(c, t));
      this.buttons.push({ sprite: c, value: label });
    });
  }

  private buildOptions(): DigitalTime[] {
    const t = this.curTime;
    const cand = [
      { h: t.h === 12 ? 1 : t.h + 1, m: t.m },
      { h: t.h === 1 ? 12 : t.h - 1, m: t.m },
      { h: t.h, m: (t.m + 15) % 60 },
      { h: t.h, m: (t.m + 45) % 60 },
      { h: t.h, m: (t.m + 30) % 60 },
    ];
    const seen = new Set<string>();
    const dist = cand.filter((c) => {
      if (c.h === t.h && c.m === t.m) return false;
      const k = `${c.h}:${c.m}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return shuffle([{ ...t }, ...shuffle(dist).slice(0, 2)]);
  }

  private fmtDigital(t: DigitalTime): string {
    const s = `${t.h}:${String(t.m).padStart(2, "0")}`;
    return getAppLang() === "bn" ? bdDigits(s) : s;
  }

  /** Speak the time in words ("half past three" / "সাড়ে তিনটা"). */
  private timeWords(): string {
    const bn = getAppLang() === "bn";
    const num = (n: number) => (bn ? bnNumber(n) : enNumber(n));
    const h = this.curTime.h;
    const m = this.curTime.m;
    if (m === 0) return t("timeOClock", { h: num(h) });
    if (m === 30) return t("timeHalfPast", { h: num(h) });
    if (m === 15) return t("timeQuarterPast", { h: num(h) });
    if (m === 45) return t("timeQuarterTo", { h: num((h % 12) + 1) });
    // 3:05 → "three oh five" (EN); Bangla template already reads "তিনটা পাঁচ মিনিট"
    const mWord = m < 10 && !bn ? `oh ${num(m)}` : num(m);
    return t("timeExact", { h: num(h), m: mWord });
  }

  private tap(container: Phaser.GameObjects.Container, picked: DigitalTime) {
    const c = this.curTime;
    if (picked.h !== c.h || picked.m !== c.m) {
      hintWrong(this, container, {
        hint: () => "Look at the clock hands and count the ticks!",
        hintBn: () => "ঘড়ির কাটা দেখো এবং ঘরগুলো গুনো!",
        correct: () => this.fmtDigital(c),
        options: () => this.buttons,
      });
      return;
    }
    pop();
    ringCorrect(this, container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    const ms = Math.max(1, this.time.now - this.startedAt);
    speak(this.timeWords(), { lang: getAppLang() === "bn" ? "bn" : "en" });
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    // #1170 — difficulty is the skill's ladder value (1..6), not the index.
    this.onRoundDone?.(true, ms, this.levels[Math.min(this.levelIndex, this.levels.length - 1)]);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
  }
}

import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop, win } from "./audio";
import { speak, bnNumber, enNumber } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { correctCelebrate } from "./celebrate";
import { SAT, SAB } from "./safeArea";

/**
 * ✏️ TRACE — reusable glyph-tracing engine (issue #1144).
 *
 * A large target glyph (digit 0–9 or a capital letter) is drawn as a thin grey
 * outline. The kid drags a finger/mouse across it: pointerdown starts a stroke
 * and pointermove paints GOLD wherever the pointer passes near the template
 * path. Progress is the fraction of the template path covered; when ≥ 90% is
 * covered in ONE continuous-ish stroke the glyph completes (celebrate + win +
 * speak its name) and the next glyph appears.
 *
 * This is TRACING, not grading — there is no wrong state and the glyph can be
 * re-traced as many times as needed. Challenge mode (#1158) adds the standard
 * gold draining bar so a timed trace is possible for the challenge-flagged
 * skills.
 */

const L = (en: string, bn: string) => (getAppLang() === "bn" ? bn : en);

const ROUNDS_TO_FINISH = 5;
const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure
const COMPLETE_AT = 0.9; // fraction of the template path covered in one stroke

const DEFAULT_LEVELS = [1, 2, 3, 4, 5, 6];

type Pt = { x: number; y: number };

/** Digits are defined as simple point arrays (one continuous stroke each),
 *  normalized to a 0–100 box (x → right, y → down). */
const DIGIT_PATHS: Record<string, Pt[]> = {
  "0": [
    { x: 50, y: 8 }, { x: 74, y: 18 }, { x: 86, y: 42 }, { x: 84, y: 68 },
    { x: 66, y: 88 }, { x: 36, y: 88 }, { x: 16, y: 68 }, { x: 14, y: 42 },
    { x: 26, y: 18 }, { x: 50, y: 8 },
  ],
  "1": [
    { x: 28, y: 22 }, { x: 46, y: 8 }, { x: 52, y: 8 }, { x: 52, y: 30 },
    { x: 52, y: 52 }, { x: 52, y: 74 }, { x: 52, y: 90 }, { x: 36, y: 88 },
    { x: 30, y: 86 }, { x: 30, y: 80 },
  ],
  "2": [
    { x: 18, y: 26 }, { x: 34, y: 12 }, { x: 58, y: 10 }, { x: 78, y: 24 },
    { x: 82, y: 42 }, { x: 64, y: 56 }, { x: 40, y: 70 }, { x: 22, y: 82 },
    { x: 20, y: 90 }, { x: 82, y: 90 },
  ],
  "3": [
    { x: 20, y: 22 }, { x: 48, y: 8 }, { x: 76, y: 20 }, { x: 78, y: 40 },
    { x: 52, y: 52 }, { x: 74, y: 64 }, { x: 72, y: 80 }, { x: 44, y: 90 },
    { x: 22, y: 80 }, { x: 20, y: 70 },
  ],
  "4": [
    { x: 64, y: 8 }, { x: 64, y: 20 }, { x: 64, y: 44 }, { x: 44, y: 54 },
    { x: 20, y: 60 }, { x: 44, y: 60 }, { x: 66, y: 60 }, { x: 66, y: 76 },
    { x: 66, y: 90 }, { x: 52, y: 90 },
  ],
  "5": [
    { x: 76, y: 12 }, { x: 30, y: 16 }, { x: 24, y: 30 }, { x: 26, y: 44 },
    { x: 48, y: 50 }, { x: 72, y: 58 }, { x: 74, y: 74 }, { x: 56, y: 90 },
    { x: 26, y: 88 }, { x: 22, y: 80 },
  ],
  "6": [
    { x: 76, y: 12 }, { x: 38, y: 16 }, { x: 20, y: 34 }, { x: 18, y: 60 },
    { x: 34, y: 86 }, { x: 62, y: 90 }, { x: 80, y: 74 }, { x: 80, y: 52 },
    { x: 58, y: 44 }, { x: 30, y: 52 },
  ],
  "7": [
    { x: 22, y: 14 }, { x: 54, y: 14 }, { x: 78, y: 12 }, { x: 64, y: 32 },
    { x: 56, y: 52 }, { x: 48, y: 70 }, { x: 40, y: 84 }, { x: 32, y: 90 },
  ],
  "8": [
    { x: 50, y: 8 }, { x: 72, y: 16 }, { x: 78, y: 36 }, { x: 60, y: 48 },
    { x: 38, y: 46 }, { x: 22, y: 54 }, { x: 22, y: 74 }, { x: 42, y: 90 },
    { x: 68, y: 90 }, { x: 80, y: 74 }, { x: 76, y: 56 }, { x: 58, y: 50 },
    { x: 42, y: 50 },
  ],
  "9": [
    { x: 28, y: 16 }, { x: 52, y: 12 }, { x: 68, y: 22 }, { x: 72, y: 44 },
    { x: 62, y: 62 }, { x: 40, y: 66 }, { x: 26, y: 52 }, { x: 26, y: 34 },
    { x: 38, y: 26 }, { x: 54, y: 28 }, { x: 66, y: 38 }, { x: 66, y: 60 },
    { x: 58, y: 78 }, { x: 56, y: 90 },
  ],
};

const DIGIT_ORDER = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Letters are multi-stroke templates (each stroke is one point array). */
const LETTER_PATHS: Record<string, Pt[][]> = {
  A: [
    [{ x: 14, y: 88 }, { x: 50, y: 8 }, { x: 86, y: 88 }],
    [{ x: 34, y: 60 }, { x: 66, y: 60 }],
  ],
  B: [
    [{ x: 22, y: 10 }, { x: 22, y: 90 }],
    [{ x: 22, y: 12 }, { x: 56, y: 16 }, { x: 66, y: 34 }, { x: 52, y: 48 }, { x: 24, y: 48 }],
    [{ x: 22, y: 50 }, { x: 58, y: 54 }, { x: 70, y: 72 }, { x: 50, y: 88 }, { x: 22, y: 88 }],
  ],
  C: [
    [{ x: 78, y: 18 }, { x: 50, y: 10 }, { x: 24, y: 22 }, { x: 12, y: 44 },
     { x: 14, y: 64 }, { x: 28, y: 82 }, { x: 56, y: 90 }, { x: 80, y: 84 }],
  ],
  D: [
    [{ x: 22, y: 10 }, { x: 22, y: 90 }],
    [{ x: 22, y: 12 }, { x: 52, y: 16 }, { x: 70, y: 36 }, { x: 70, y: 64 }, { x: 52, y: 84 }, { x: 22, y: 88 }],
  ],
  E: [
    [{ x: 24, y: 10 }, { x: 24, y: 90 }],
    [{ x: 24, y: 12 }, { x: 76, y: 12 }],
    [{ x: 24, y: 50 }, { x: 64, y: 50 }],
    [{ x: 24, y: 88 }, { x: 78, y: 88 }],
  ],
  F: [
    [{ x: 24, y: 10 }, { x: 24, y: 90 }],
    [{ x: 24, y: 12 }, { x: 74, y: 12 }],
    [{ x: 24, y: 50 }, { x: 62, y: 50 }],
  ],
  M: [
    [{ x: 12, y: 88 }, { x: 12, y: 18 }, { x: 40, y: 56 }, { x: 66, y: 18 }, { x: 88, y: 88 }],
  ],
  N: [
    [{ x: 14, y: 88 }, { x: 14, y: 14 }, { x: 86, y: 86 }, { x: 86, y: 14 }],
  ],
  O: [
    [{ x: 50, y: 8 }, { x: 74, y: 20 }, { x: 86, y: 46 }, { x: 82, y: 72 },
     { x: 62, y: 88 }, { x: 36, y: 88 }, { x: 16, y: 70 }, { x: 12, y: 44 },
     { x: 24, y: 20 }, { x: 50, y: 8 }],
  ],
  S: [
    [{ x: 74, y: 16 }, { x: 46, y: 12 }, { x: 22, y: 24 }, { x: 18, y: 44 },
     { x: 36, y: 56 }, { x: 64, y: 64 }, { x: 80, y: 76 }, { x: 76, y: 88 },
     { x: 50, y: 92 }, { x: 24, y: 84 }],
  ],
  T: [
    [{ x: 12, y: 14 }, { x: 88, y: 14 }],
    [{ x: 50, y: 14 }, { x: 50, y: 90 }],
  ],
};

const LETTER_ORDER = ["A", "B", "C", "D", "E", "F", "M", "N", "O", "S", "T"];

/** Bangla letter NAMES for the English capitals (how a Bangla speaker says them). */
const LETTER_BN: Record<string, string> = {
  A: "এ", B: "বি", C: "সি", D: "ডি", E: "ই", F: "এফ",
  M: "এম", N: "এন", O: "ও", S: "এস", T: "টি",
};

const TRACE_COLOR = 0xffd166; // sunshine gold (NV_GOLD) for the painted stroke
const TEMPLATE_COLOR = 0x9ca3af; // thin grey outline

export class TraceScene extends Phaser.Scene {
  private skillId = "";
  private mode: "digits" | "letters" = "digits";
  private lang: "en" | "bn" = "en";
  private levels: number[] = DEFAULT_LEVELS;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private glyphCursor = 0;
  private challenge = false;
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;

  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  private templateG!: Phaser.GameObjects.Graphics;
  private traceG!: Phaser.GameObjects.Graphics;
  private progressTrack!: Phaser.GameObjects.Rectangle;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private progressText!: Phaser.GameObjects.Text;

  private currentLabel = "0";
  private displayPts: Pt[] = [];
  private sampleStroke: number[] = [];
  private covered: boolean[] = [];
  private coveredCount = 0;
  private nearDist = 20;
  private goldWidth = 14;

  private glyphCenter = { x: 0, y: 0 };
  private glyphSize = 260;
  private progressWidth = 260;

  private stroking = false;
  private completing = false;
  private activePointerId: number | null = null;
  private lastP = { x: 0, y: 0 };

  constructor() {
    super("Trace");
  }

  create(data: {
    onRoundDone: (correct: boolean, ms: number, difficulty: number) => void;
    startLevelIndex?: number;
    levels?: number[];
    challenge?: boolean;
    skill?: string;
  }) {
    this.onRoundDone = data.onRoundDone;
    this.levels = data.levels?.length ? data.levels : DEFAULT_LEVELS;
    this.levelIndex = data.startLevelIndex ?? 0;
    // The scene may be restarted in-place with different data — always reset
    // the challenge state so a stale bar/timer never survives a mode change.
    if (this.challengeTimer) this.challengeTimer.remove(false);
    this.challengeTimer = undefined;
    this.challengeBar = undefined;
    this.skillId = data.skill ?? "";
    this.mode = this.skillId === "trace-letters" ? "letters" : "digits";
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    const order = this.mode === "digits" ? DIGIT_ORDER : LETTER_ORDER;
    this.glyphCursor = Math.max(0, this.levelIndex) % order.length;
    this.challenge = !!data.challenge;

    gameBackground(this, "night");
    this.titleText = this.add
      .text(0, 0, this.titleLabel(), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.hintText = this.add
      .text(0, 0, "", txt(18, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);

    this.templateG = this.add.graphics();
    this.traceG = this.add.graphics();
    this.progressTrack = this.add.rectangle(0, 0, 260, 12, 0xffffff, 0.22).setOrigin(0, 0.5);
    this.progressFill = this.add.rectangle(0, 0, 0, 12, TRACE_COLOR).setOrigin(0, 0.5);
    this.progressText = this.add
      .text(0, 0, "0%", txt(16, "#ffffff", { bold: true }))
      .setOrigin(0.5);

    if (this.challenge) {
      this.challengeBar = this.add
        .rectangle(0, 122, 0, 6, CHALLENGE_BAR)
        .setOrigin(0, 0.5)
        .setAlpha(0);
    }

    this.spawnTracing();
    onSceneResize(this, () => this.layout());
    this.startRound();
  }

  private titleLabel(): string {
    return this.mode === "letters"
      ? L("Trace letters", "ইংরেজি অক্ষর আঁকি")
      : L("Trace numbers", "সংখ্যা আঁকি");
  }

  private instructionText(): string {
    if (this.mode === "digits") {
      const n = Number(this.currentLabel);
      return this.lang === "bn"
        ? `${bnNumber(n)} সংখ্যাটি আঙুল দিয়ে আঁকো`
        : `Trace the number ${this.currentLabel}`;
    }
    return this.lang === "bn"
      ? `${LETTER_BN[this.currentLabel]} অক্ষরটি আঙুল দিয়ে আঁকো`
      : `Trace the letter ${this.currentLabel}`;
  }

  private spokenGlyphName(): string {
    if (this.mode === "digits") {
      const n = Number(this.currentLabel);
      return this.lang === "bn" ? bnNumber(n) : enNumber(n);
    }
    return this.lang === "bn" ? LETTER_BN[this.currentLabel] : this.currentLabel;
  }

  private speakInstruction() {
    const name = this.spokenGlyphName();
    if (this.mode === "digits") {
      speak(this.lang === "bn" ? `${name} সংখ্যাটি আঙুল দিয়ে আঁকো` : `Trace the number ${name}`);
    } else {
      speak(this.lang === "bn" ? `${name} অক্ষরটি আঙুল দিয়ে আঁকো` : `Trace the letter ${name}`);
    }
  }

  private spawnTracing() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (this.completing) return;
    // Ignore a second finger mid-stroke so multi-touch never resets coverage.
    if (this.activePointerId !== null && p.id !== this.activePointerId) return;
    this.activePointerId = p.id;
    this.stroking = true;
    this.lastP = { x: p.x, y: p.y };
    this.resetStrokeCoverage();
    this.paintSegment(p.x, p.y, p.x, p.y);
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (this.completing || this.activePointerId !== p.id || !this.stroking || !p.isDown) return;
    this.paintSegment(this.lastP.x, this.lastP.y, p.x, p.y);
    this.lastP = { x: p.x, y: p.y };
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.completing || this.activePointerId !== p.id) return;
    this.activePointerId = null;
    this.stroking = false;
    const total = this.displayPts.length || 1;
    if (this.coveredCount / total >= COMPLETE_AT) this.completeGlyph();
  }

  private paintSegment(x0: number, y0: number, x1: number, y1: number) {
    const dist = Phaser.Math.Distance.Between(x0, y0, x1, y1);
    const steps = Math.max(1, Math.ceil(dist / 5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.markNear(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }

  private markNear(x: number, y: number) {
    let changed = false;
    const nearSq = this.nearDist * this.nearDist;
    for (let i = 0; i < this.displayPts.length; i++) {
      if (this.covered[i]) continue;
      const dx = this.displayPts[i].x - x;
      const dy = this.displayPts[i].y - y;
      if (dx * dx + dy * dy <= nearSq) {
        this.covered[i] = true;
        this.coveredCount++;
        changed = true;
      }
    }
    if (changed) {
      this.redrawGold();
      this.updateProgress();
    }
  }

  private redrawGold() {
    this.traceG.clear();
    if (!this.displayPts.length) return;
    this.traceG.lineStyle(this.goldWidth, TRACE_COLOR, 1);
    let pen = false;
    for (let i = 0; i < this.displayPts.length; i++) {
      const on = this.covered[i];
      const connect = on && i > 0 && this.covered[i - 1] && this.sampleStroke[i] === this.sampleStroke[i - 1];
      if (connect) {
        if (!pen) {
          this.traceG.beginPath();
          this.traceG.moveTo(this.displayPts[i - 1].x, this.displayPts[i - 1].y);
          pen = true;
        }
        this.traceG.lineTo(this.displayPts[i].x, this.displayPts[i].y);
      } else if (on) {
        if (pen) {
          this.traceG.strokePath();
          pen = false;
        }
        this.traceG.fillStyle(TRACE_COLOR, 1);
        this.traceG.fillCircle(this.displayPts[i].x, this.displayPts[i].y, this.goldWidth / 2);
      } else if (pen) {
        this.traceG.strokePath();
        pen = false;
      }
    }
    if (pen) this.traceG.strokePath();
  }

  private resetStrokeCoverage() {
    this.covered = new Array<boolean>(this.displayPts.length).fill(false);
    this.coveredCount = 0;
    this.traceG.clear();
    this.updateProgress();
  }

  private updateProgress() {
    const total = this.displayPts.length || 1;
    const p = this.coveredCount / total;
    this.progressFill.setSize(Math.max(0, this.progressWidth * p), 12);
    this.progressText.setText(`${Math.round(p * 100)}%`);
  }

  private completeGlyph() {
    if (this.completing) return;
    this.completing = true;
    this.stroking = false;
    this.activePointerId = null;
    this.challengeDone = true;
    this.disarmChallenge();
    pop();
    correctCelebrate(this, this.glyphCenter.x, this.glyphCenter.y, { difficulty: this.currentLevel() });
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    const ms = Math.max(1, this.time.now - this.startedAt);
    const level = this.currentLevel();
    // #1002 — tracing is correct-by-design once the glyph is covered enough;
    // report the real coverage condition that triggered completion.
    this.onRoundDone?.(this.coveredCount / (this.displayPts.length || 1) >= COMPLETE_AT, ms, level);
    speak(this.spokenGlyphName());
    this.time.delayedCall(900, () => {
      this.completing = false;
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private startRound() {
    this.disarmChallenge();
    this.completing = false;
    this.stroking = false;
    this.activePointerId = null;
    this.advanceGlyph();
    this.startedAt = this.time.now;
    this.roundText.setText(`Round ${this.levelIndex + 1}`);
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.hintText.setText(this.instructionText());
    this.layout();
    this.speakInstruction();
    this.armChallenge();
  }

  private advanceGlyph() {
    const order = this.mode === "digits" ? DIGIT_ORDER : LETTER_ORDER;
    this.currentLabel = order[this.glyphCursor % order.length];
    this.glyphCursor++;
  }

  private currentLevel(): number {
    return this.levels[Math.min(this.levelIndex, this.levels.length - 1)] ?? 1;
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.hintText.setPosition(width / 2, 140);

    const progressY = height - 74 - SAB();
    this.progressWidth = Math.min(width - 80, 260);
    this.progressTrack.setSize(this.progressWidth, 12).setPosition(width / 2 - this.progressWidth / 2, progressY);
    this.progressFill.setPosition(width / 2 - this.progressWidth / 2, progressY);
    this.progressText.setPosition(width / 2, progressY + 22);

    const topY = 168;
    const bottomY = progressY - 34;
    const availH = Math.max(120, bottomY - topY);
    this.glyphSize = Math.min(width - 64, availH, 330);
    this.glyphCenter = { x: width / 2, y: topY + availH / 2 };

    if (this.challengeBar) {
      this.challengeBar.setPosition(20, 122).setSize(Math.min(width - 40, 320), 6);
    }

    this.drawGlyph();
  }

  private drawGlyph() {
    this.templateG.clear();
    this.traceG.clear();
    const strokes = this.currentStrokes();
    const scale = this.glyphSize / 100;
    const ox = this.glyphCenter.x - this.glyphSize / 2;
    const oy = this.glyphCenter.y - this.glyphSize / 2;
    const toDisplay = (p: Pt): Pt => ({ x: ox + p.x * scale, y: oy + p.y * scale });

    this.displayPts = [];
    this.sampleStroke = [];
    this.templateG.lineStyle(3, TEMPLATE_COLOR, 0.9);
    for (let si = 0; si < strokes.length; si++) {
      const stroke = strokes[si];
      this.templateG.beginPath();
      for (let i = 0; i < stroke.length; i++) {
        const d = toDisplay(stroke[i]);
        if (i === 0) this.templateG.moveTo(d.x, d.y);
        else this.templateG.lineTo(d.x, d.y);
      }
      this.templateG.strokePath();

      for (let i = 0; i < stroke.length - 1; i++) {
        const a = toDisplay(stroke[i]);
        const b = toDisplay(stroke[i + 1]);
        const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        const n = Math.max(1, Math.round(dist / 4));
        for (let j = 0; j < n; j++) {
          const t = j / n;
          this.displayPts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          this.sampleStroke.push(si);
        }
      }
      const last = toDisplay(stroke[stroke.length - 1]);
      this.displayPts.push({ x: last.x, y: last.y });
      this.sampleStroke.push(si);
    }

    this.nearDist = Math.max(16, this.glyphSize * 0.12);
    this.goldWidth = Math.max(10, this.glyphSize * 0.07);
    this.resetStrokeCoverage();
  }

  private currentStrokes(): Pt[][] {
    if (this.mode === "digits") return [DIGIT_PATHS[this.currentLabel]];
    return LETTER_PATHS[this.currentLabel];
  }

  /* ── challenge countdown (#1158 — same contract as MathSolve/Percent) ── */
  private armChallenge() {
    if (!this.challenge) return;
    if (this.challengeTimer) this.challengeTimer.remove(false);
    this.challengeDone = false;
    const bar = this.challengeBar;
    if (bar) {
      this.tweens.killTweensOf(bar);
      bar.setPosition(20, 122).setSize(Math.min(this.scale.width - 40, 320), 6).setScale(1, 1).setAlpha(1);
      this.tweens.add({ targets: bar, scaleX: 0, duration: CHALLENGE_SECONDS * 1000, ease: "Linear.easeNone" });
    }
    this.challengeTimer = this.time.delayedCall(CHALLENGE_SECONDS * 1000, () => {
      if (this.challengeDone) return;
      this.challengeDone = true;
      this.roundsDone++;
      this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.onRoundDone?.(false, CHALLENGE_SECONDS * 1000, this.currentLevel());
      this.levelIndex++;
      this.startRound();
    });
  }

  private disarmChallenge() {
    if (this.challengeTimer) {
      this.challengeTimer.remove(false);
      this.challengeTimer = undefined;
    }
    if (this.challengeBar) {
      this.tweens.killTweensOf(this.challengeBar);
      this.challengeBar.setAlpha(0);
    }
  }
}

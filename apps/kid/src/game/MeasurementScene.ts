import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak, bnNumber, enNumber } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, ringCorrect, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-measure")?.difficultyLevels ?? [10, 20, 50, 100, 3, 5];
/** Same-unit gap per level — higher levels compare closer values. */
const GAPS = [3, 3, 2, 2];
const ROUNDS_TO_FINISH = 3;
/** Level 4+ switches to cross-unit: 1 m vs 80 cm, 2 kg vs 600 g, 1 L vs 700 mL. */
const CROSS_FROM_LEVEL = 4;
const MODES = ["length", "weight", "capacity"] as const;
type MeasureMode = (typeof MODES)[number];
type Side = "left" | "right";

/**
 * Measurement — "Which is longer / heavier / holds more?"
 * Band 3 (ages 6–8, math). Three rotating modes:
 *   length   → two ruler bars, compare cm (later m vs cm)
 *   weight   → two boxes on a balance, compare kg (later kg vs g)
 *   capacity → two jugs, compare L (later L vs mL)
 * Levels start far apart and narrow the gap; level 4+ adds unit-mixing so a
 * kid learns 1 m = 100 cm, 1 kg = 1000 g, 1 L = 1000 mL by seeing the big
 * unit beat the small one. Every state is spoken in EN or BN (#746 style).
 */
export class MeasurementScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private mode: MeasureMode = "length";
  private cross = false;
  private leftBase = 0;
  private rightBase = 0;
  private leftDisplay = 0;
  private rightDisplay = 0;
  private leftUnitKey = "cmUnit";
  private rightUnitKey = "cmUnit";
  private leftLabel = "";
  private rightLabel = "";
  private answerSide: Side = "left";
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;
  private visual!: Phaser.GameObjects.Container;
  private scaleContainer!: Phaser.GameObjects.Container;
  private leftObj!: Phaser.GameObjects.Container;
  private rightObj!: Phaser.GameObjects.Container;

  constructor() {
    super("Measurement");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "forest");
    this.titleText = this.add
      .text(0, 0, t("titleMeasure"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    onSceneResize(this, () => {
      this.layout();
      this.buildVisual();
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

  /** Shrinks the whole visual on short/landscape screens so nothing clips. */
  private get compact() {
    return Math.max(0.62, Math.min(1, (this.scale.height - 230) / 470));
  }

  private get visualCY() {
    return Math.min(this.scale.height * 0.52, this.scale.height - 210 - SAB());
  }

  private startRound() {
    this.startedAt = this.time.now;
    this.mode = MODES[this.levelIndex % MODES.length];
    this.pickValues();
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.prompt.set(t(this.askKey()));
    this.buildVisual();
    // Spoken (#746): read both amounts, then the question — a band-3 kid who
    // can't read yet still hears "এক মিটার, ৮০ সেন্টিমিটার — কোনটা লম্বা?".
    this.time.delayedCall(350, () => {
      if (!this.scene.isActive()) return;
      speak(this.spokenLabel(this.leftDisplay, this.leftUnitKey), { cancel: false });
      speak(this.spokenLabel(this.rightDisplay, this.rightUnitKey), { cancel: false });
      speak(t(this.askKey()), { cancel: false });
    });
  }

  private askKey(): string {
    if (this.mode === "length") return "measureLengthAsk";
    if (this.mode === "weight") return "measureWeightAsk";
    return "measureCapacityAsk";
  }

  private correctKey(): string {
    if (this.mode === "length") return "measureLonger";
    if (this.mode === "weight") return "measureHeavier";
    return "measureMore";
  }

  private hintKey(): string {
    if (this.mode === "length") return "measureLengthHint";
    if (this.mode === "weight") return "measureWeightHint";
    return "measureCapacityHint";
  }

  private unitKey(mode: MeasureMode, isBig: boolean): string {
    if (mode === "length") return isBig ? "mUnit" : "cmUnit";
    if (mode === "weight") return isBig ? "kgUnit" : "gUnit";
    return isBig ? "lUnit" : "mlUnit";
  }

  private pickValues() {
    const li = Math.min(this.levelIndex, LEVELS.length - 1);
    const max = LEVELS[li];
    const gap = GAPS[Math.min(li, GAPS.length - 1)];
    this.cross = li >= CROSS_FROM_LEVEL;
    let bigBase: number, smallBase: number, bigDisplay: number, smallDisplay: number;
    if (!this.cross) {
      // Same unit on both sides — only the amount differs.
      const bigger = Phaser.Math.Between(gap + 1, max);
      const smaller = bigger - gap;
      bigDisplay = bigger;
      smallDisplay = smaller;
      bigBase = bigger;
      smallBase = smaller;
    } else {
      // Big unit vs small unit: 1–3 m vs cm (level 4), 1–5 m vs cm (level 5).
      const bigUnit = Phaser.Math.Between(1, max);
      const small = Phaser.Math.Between(Math.floor((bigUnit * 100) / 3), bigUnit * 100 - 10);
      bigDisplay = bigUnit;
      smallDisplay = small;
      bigBase = bigUnit * 100;
      smallBase = small;
    }
    const bigLeft = Math.random() < 0.5;
    this.leftBase = bigLeft ? bigBase : smallBase;
    this.rightBase = bigLeft ? smallBase : bigBase;
    this.leftDisplay = bigLeft ? bigDisplay : smallDisplay;
    this.rightDisplay = bigLeft ? smallDisplay : bigDisplay;
    this.answerSide = bigLeft ? "left" : "right";
    this.leftUnitKey = this.unitKey(this.mode, bigLeft);
    this.rightUnitKey = this.unitKey(this.mode, !bigLeft);
    this.leftLabel = this.displayLabel(this.leftDisplay, this.leftUnitKey);
    this.rightLabel = this.displayLabel(this.rightDisplay, this.rightUnitKey);
  }

  private displayLabel(value: number, unitKey: string): string {
    const bn = getAppLang() === "bn";
    const num = bn ? digit(value) : String(value);
    return `${num} ${t(unitKey)}`;
  }

  /** Spoken amount — number words + the local unit word ("এক মিটার", "eighty cm"). */
  private spokenLabel(value: number, unitKey: string): string {
    const bn = getAppLang() === "bn";
    const num = bn ? bnNumber(value) : enNumber(value);
    return `${num} ${t(unitKey)}`;
  }

  private buildVisual() {
    if (this.visual) this.visual.destroy();
    this.background.clear();
    this.visual = this.add.container(0, 0);
    if (this.mode === "length") this.buildLength();
    else if (this.mode === "weight") this.buildWeight();
    else this.buildCapacity();
  }

  /** Height-safe horizontal positions for the two comparison objects. */
  private objectX(): [number, number] {
    const { width } = this.scale;
    const spread = Math.min(250, width * 0.33);
    return [width / 2 - spread, width / 2 + spread];
  }

  /* ─────────────────────── LENGTH — two ruler bars ─────────────────────── */

  private buildLength() {
    const [lx, rx] = this.objectX();
    const baseY = this.visualCY + 34;
    const maxW = Math.min(300, this.scale.width * 0.36);
    const c = this.compact;
    // shared baseline so the comparison reads left-aligned like a real ruler
    const bl = this.add.graphics();
    bl.lineStyle(3, 0xffffff, 0.45);
    bl.lineBetween(lx - maxW / 2 - 14, baseY + 6, rx + maxW / 2 + 14, baseY + 6);
    this.visual.add(bl);
    const bigger = Math.max(this.leftBase, this.rightBase);
    this.leftObj = this.makeBar(lx, baseY, maxW, this.leftBase, bigger, this.leftLabel, c);
    this.rightObj = this.makeBar(rx, baseY, maxW, this.rightBase, bigger, this.rightLabel, c);
    this.visual.add([this.leftObj, this.rightObj]);
    this.leftObj.on("pointerdown", () => this.tap(this.leftObj, "left"));
    this.rightObj.on("pointerdown", () => this.tap(this.rightObj, "right"));
  }

  private makeBar(cx: number, baseY: number, maxW: number, val: number, bigger: number, label: string, c: number): Phaser.GameObjects.Container {
    const box = this.add.container(cx, baseY);
    const w = Math.max(34, Math.round(maxW * (val / bigger)));
    const h = Math.round(40 * c);
    const g = this.add.graphics();
    g.fillStyle(0x2ec4b6, 1);
    g.fillRoundedRect(-maxW / 2, -h, w, h, 10);
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeRoundedRect(-maxW / 2, -h, w, h, 10);
    // ruler ticks
    for (let x = 0; x <= w; x += Math.max(9, w / 8)) {
      g.lineStyle(1.5, 0xffffff, 0.65);
      g.lineBetween(-maxW / 2 + x, -h + 5, -maxW / 2 + x, -h + 13);
    }
    const lbl = this.add
      .text(0, 24, label, txt(Math.round(24 * c), "#ffffff", { bold: true, outline: true, shadow: false }))
      .setOrigin(0.5);
    box.add([g, lbl]);
    box.setSize(maxW, h + 42);
    box.setInteractive({ useHandCursor: true });
    return box;
  }

  /* ─────────────────────── WEIGHT — boxes on a balance ─────────────────────── */

  private buildWeight() {
    const cx = this.scale.width / 2;
    const beamY = this.visualCY - 30;
    const halfL = Math.min(230, this.scale.width * 0.33);
    const c = this.compact;
    // pivot + ground (static layer, doesn't tilt)
    this.background.fillStyle(0x0b2545, 1);
    this.background.fillTriangle(cx - 18, beamY + 18, cx + 18, beamY + 18, cx, beamY + 2);
    this.background.lineStyle(4, 0xffffff, 0.5);
    this.background.lineBetween(cx - 120, beamY + 34, cx + 120, beamY + 34);
    this.background.lineStyle(2, 0x2ec4b6, 0.9);
    this.background.lineBetween(cx - 120, beamY + 30, cx + 120, beamY + 30);
    // tilting layer: beam + strings + boxes
    this.scaleContainer = this.add.container(cx, beamY);
    const g = this.add.graphics();
    g.lineStyle(6, 0xb07d4f, 1);
    g.lineBetween(-halfL, 0, halfL, 0);
    g.lineStyle(2, 0xffffff, 0.6);
    g.lineBetween(-halfL, 0, -halfL, 56);
    g.lineBetween(halfL, 0, halfL, 56);
    this.scaleContainer.add(g);
    const bigger = Math.max(this.leftBase, this.rightBase);
    this.leftObj = this.makeBox(-halfL, 58, this.leftBase, bigger, this.leftLabel, c);
    this.rightObj = this.makeBox(halfL, 58, this.rightBase, bigger, this.rightLabel, c);
    this.scaleContainer.add([this.leftObj, this.rightObj]);
    this.visual.add(this.scaleContainer);
    // graded tilt: the heavier side dips, more when the gap is bigger
    const ratio = Math.max(1, bigger / Math.max(1, Math.min(this.leftBase, this.rightBase)));
    const tilt = Math.min(9, Math.max(3, Math.round((ratio - 1) * 14)));
    const dir = this.answerSide === "left" ? tilt : -tilt;
    this.tweens.add({ targets: this.scaleContainer, angle: dir, duration: 380, ease: "Back.easeOut" });
    this.leftObj.on("pointerdown", () => this.tap(this.leftObj, "left"));
    this.rightObj.on("pointerdown", () => this.tap(this.rightObj, "right"));
  }

  private makeBox(x: number, y: number, val: number, bigger: number, label: string, c: number): Phaser.GameObjects.Container {
    const box = this.add.container(x, y);
    const s = 0.62 + 0.48 * (val / bigger);
    const w = Math.round(132 * s * c);
    const h = Math.round(88 * s * c);
    const g = this.add.graphics();
    g.fillStyle(0xf59e0b, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(2, 0xfff3d6, 0.7);
    g.lineBetween(-w / 2, 0, w / 2, 0);
    const lbl = this.add
      .text(0, h / 2 + 26, label, txt(Math.round(22 * c), "#ffffff", { bold: true, outline: true, shadow: false }))
      .setOrigin(0.5);
    box.add([g, lbl]);
    box.setSize(w + 24, h + 48);
    box.setInteractive({ useHandCursor: true });
    return box;
  }

  /* ─────────────────────── CAPACITY — jugs of water ─────────────────────── */

  private buildCapacity() {
    const [lx, rx] = this.objectX();
    const baseY = this.visualCY + 40;
    const c = this.compact;
    const bigger = Math.max(this.leftBase, this.rightBase);
    const pl = this.add.graphics();
    pl.lineStyle(3, 0xffffff, 0.45);
    pl.lineBetween(lx - 70, baseY + 4, rx + 70, baseY + 4);
    this.visual.add(pl);
    this.leftObj = this.makeJug(lx, baseY, this.leftBase, bigger, this.leftLabel, c);
    this.rightObj = this.makeJug(rx, baseY, this.rightBase, bigger, this.rightLabel, c);
    this.visual.add([this.leftObj, this.rightObj]);
    this.leftObj.on("pointerdown", () => this.tap(this.leftObj, "left"));
    this.rightObj.on("pointerdown", () => this.tap(this.rightObj, "right"));
  }

  private makeJug(cx: number, baseY: number, val: number, bigger: number, label: string, c: number): Phaser.GameObjects.Container {
    const jug = this.add.container(cx, baseY);
    const maxH = Math.round(128 * c);
    const h = Math.max(26, Math.round(maxH * (val / bigger)));
    const w = Math.round(88 * c);
    // water (filled from the bottom)
    const fill = this.add.graphics();
    fill.fillStyle(0x38bdf8, 0.95);
    fill.fillRoundedRect(-w / 2, -h, w, h, { tl: 8, tr: 8, bl: 3, br: 3 });
    fill.lineStyle(2, 0x9adcff, 0.8);
    fill.lineBetween(-w / 2 + 3, -h + 2, w / 2 - 3, -h + 2);
    // glass outline + rim
    const glass = this.add.graphics();
    glass.lineStyle(3, 0xffffff, 0.9);
    glass.strokeRoundedRect(-w / 2, -maxH, w, maxH, 8);
    glass.lineStyle(4, 0xffffff, 0.95);
    glass.lineBetween(-w / 2, -maxH, w / 2, -maxH);
    const lbl = this.add
      .text(0, 26, label, txt(Math.round(22 * c), "#ffffff", { bold: true, outline: true, shadow: false }))
      .setOrigin(0.5);
    jug.add([fill, glass, lbl]);
    jug.setSize(w + 24, maxH + 44);
    jug.setInteractive({ useHandCursor: true });
    return jug;
  }

  /* ─────────────────────────── interaction ─────────────────────────── */

  private tap(obj: Phaser.GameObjects.Container, side: Side) {
    if (side !== this.answerSide) {
      if (this.mode === "weight") {
        this.tweens.add({ targets: this.scaleContainer, angle: (this.scaleContainer.angle ?? 0) + (side === "left" ? 4 : -4), duration: 180, ease: "Quad.easeOut", yoyo: true, repeat: 1 });
      } else {
        this.tweens.add({ targets: obj, angle: (obj.angle ?? 0) + 5, duration: 180, ease: "Quad.easeOut", yoyo: true, repeat: 1 });
      }
      hintWrong(this, obj, {
        hint: () => t(this.hintKey()),
        hintBn: () => t(this.hintKey()),
        correct: () => this.answerSide,
        options: () => [
          { sprite: this.leftObj, value: "left" },
          { sprite: this.rightObj, value: "right" },
        ],
      });
      return;
    }
    pop();
    ringCorrect(this, obj);
    this.leftObj.disableInteractive();
    this.rightObj.disableInteractive();
    // winning nudge: the chosen side dips or grows
    if (this.mode === "weight") {
      const dir = side === "left" ? 8 : -8;
      this.tweens.add({ targets: this.scaleContainer, angle: dir, duration: 450, ease: "Back.easeOut" });
    } else {
      this.tweens.add({ targets: obj, scale: 1.08, duration: 300, ease: "Back.easeOut", yoyo: true, repeat: 1 });
    }
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    const bn = getAppLang() === "bn";
    const x = this.spokenLabel(side === "left" ? this.leftDisplay : this.rightDisplay, side === "left" ? this.leftUnitKey : this.rightUnitKey);
    const y = this.spokenLabel(side === "left" ? this.rightDisplay : this.leftDisplay, side === "left" ? this.rightUnitKey : this.leftUnitKey);
    speak(t(this.correctKey(), { x, y }), { lang: bn ? "bn" : "en" });
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(side === this.answerSide, ms, this.levelIndex + 1);
    this.time.delayedCall(950, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }
}

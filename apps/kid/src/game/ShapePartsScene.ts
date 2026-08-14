import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, roundMeter, BTN_PRIMARY, type RoundMeterApi, NV_GOLD } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-shapeparts")?.difficultyLevels ?? [1, 2, 3, 4, 5, 6];
const ROUNDS_TO_FINISH = 3;
const ROUND_LEN = 6;
const BN_D = "০১২৩৪৫৬৭৮৯";

function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface ShapeDef {
  key: string;
  sides: number;
  corners: number;
  nameKey: string;
}

/** Value-distinct side/corner counts across the shape set. */
const SHAPES: ShapeDef[] = [
  { key: "tri", sides: 3, corners: 3, nameKey: "spNameTri" },
  { key: "square", sides: 4, corners: 4, nameKey: "spNameSq" },
  { key: "rect", sides: 4, corners: 4, nameKey: "spNameRect" },
  { key: "pent", sides: 5, corners: 5, nameKey: "spNamePent" },
  { key: "hex", sides: 6, corners: 6, nameKey: "spNameHex" },
  { key: "circle", sides: 0, corners: 0, nameKey: "spNameCircle" },
];

/**
 * 2D shapes — sides & corners (#62).
 * Band 2/3: a polygon (or circle) is drawn; the kid is asked "how many sides?"
 * (or corners), TAPS the shape to count — each tap highlights the next
 * side/corner green and speaks the running count — then picks the total from
 * number buttons. Wrong answers reset the highlights so the kid recounts,
 * keeping the counting VISUAL (never a pure memory guess).
 */
export class ShapePartsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private mode: "sides" | "corners" = "sides";
  private shape!: ShapeDef;
  private bag: number[] = [];
  private pos = 0;
  private answered = 0;
  private total = 0;
  private highlightCount = 0;
  private pts: { x: number; y: number }[] = [];
  private shapeCenter = { x: 0, y: 0 };
  private shapeRadius = 90;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private promptText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private shapeGfx!: Phaser.GameObjects.Graphics;
  private highlightGfx!: Phaser.GameObjects.Graphics;
  private hitArea!: Phaser.GameObjects.Arc;
  private options: Phaser.GameObjects.Container[] = [];
  private optionValues: number[] = [];

  constructor() {
    super("ShapeParts");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "space");
    this.titleText = this.add
      .text(0, 0, t("titleShapeParts"), txt(32, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, "", txt(26, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.nameText = this.add
      .text(0, 0, "", txt(22, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.shapeGfx = this.add.graphics();
    this.highlightGfx = this.add.graphics();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.promptText.setPosition(width / 2, height * 0.13);
    this.promptText.setWordWrapWidth(Math.max(220, width - 60));
    this.nameText.setPosition(width / 2, height * 0.2);
    this.tallyText.setPosition(width / 2, height * 0.76);
    this.shapeRadius = Math.min(110, height * 0.17, width * 0.28);
    this.shapeCenter = { x: width / 2, y: height * 0.46 };
  }

  private currentPool(): ShapeDef[] {
    const l = this.levelIndex;
    if (l === 0) return [SHAPES[0]];
    if (l === 1) return SHAPES.slice(0, 4);
    if (l === 2) return SHAPES.slice(0, 5);
    if (l === 3) return [SHAPES[0]];
    if (l === 4) return SHAPES.slice(0, 5);
    return SHAPES;
  }

  private startRound() {
    const l = this.levelIndex;
    // levels: sides(3/4) → sides(+circle) → sides(+5/6) → corners(3/4) →
    // corners(+5/6+circle) → mixed everything
    this.mode = l < 3 ? "sides" : l === 3 || l === 4 ? "corners" : Math.random() < 0.5 ? "sides" : "corners";
    const pool = this.currentPool();
    const bag: number[] = [];
    for (let i = 0; i < ROUND_LEN; i++) bag.push(i % pool.length);
    this.bag = shuffle(bag);
    this.pos = 0;
    this.answered = 0;
    this.total = ROUND_LEN;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.ask();
  }

  private ask() {
    this.locked = false;
    this.highlightCount = 0;
    this.highlightGfx.clear();
    this.shape = this.currentPool()[this.bag[this.pos % this.bag.length]];
    this.promptText.setText(this.mode === "sides" ? t("spSides") : t("spCorners"));
    this.nameText.setText(t(this.shape.nameKey));
    this.tallyText.setText(t("spCount"));
    this.drawShape();
    this.buildOptions();
  }

  private drawShape() {
    const { x, y } = this.shapeCenter;
    const r = this.shapeRadius;
    this.shapeGfx.clear();
    if (this.hitArea) this.hitArea.destroy();
    if (this.shape.key === "circle") {
      this.shapeGfx.lineStyle(6, 0xffffff, 1);
      this.shapeGfx.strokeCircle(x, y, r);
      this.pts = [];
    } else {
      const n = this.shape.sides;
      const pts: { x: number; y: number }[] = [];
      if (this.shape.key === "rect") {
        const w = r * 2.1;
        const h = r * 1.4;
        pts.push({ x: x - w / 2, y: y - h / 2 });
        pts.push({ x: x + w / 2, y: y - h / 2 });
        pts.push({ x: x + w / 2, y: y + h / 2 });
        pts.push({ x: x - w / 2, y: y + h / 2 });
      } else {
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
          pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
        }
      }
      this.pts = pts;
      this.shapeGfx.lineStyle(6, 0xffffff, 1);
      this.shapeGfx.beginPath();
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % n];
        this.shapeGfx.moveTo(p.x, p.y);
        this.shapeGfx.lineTo(q.x, q.y);
      });
      this.shapeGfx.strokePath();
    }
    this.hitArea = this.add
      .circle(x, y, r + 14, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    this.hitArea.on("pointerdown", () => this.countTap());
  }

  private countTap() {
    if (this.locked) return;
    if (this.shape.key === "circle") {
      // whole outline glows once — there is nothing to count
      this.highlightGfx.clear();
      this.highlightGfx.lineStyle(10, 0x4ade80, 1);
      this.highlightGfx.strokeCircle(this.shapeCenter.x, this.shapeCenter.y, this.shapeRadius);
      this.highlightCount = 1;
      pop();
      speak(digit(0), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.tallyText.setText(t("spZero"));
      return;
    }
    const target = this.mode === "sides" ? this.shape.sides : this.shape.corners;
    if (this.highlightCount >= target) {
      this.highlightCount = 0;
      this.highlightGfx.clear();
    }
    const i = this.highlightCount % target;
    pop();
    if (this.mode === "sides") {
      const p = this.pts[i];
      const q = this.pts[(i + 1) % this.pts.length];
      this.highlightGfx.lineStyle(10, 0x4ade80, 1);
      this.highlightGfx.beginPath();
      this.highlightGfx.moveTo(p.x, p.y);
      this.highlightGfx.lineTo(q.x, q.y);
      this.highlightGfx.strokePath();
    } else {
      this.highlightGfx.fillStyle(0x4ade80, 1);
      this.highlightGfx.fillCircle(this.pts[i].x, this.pts[i].y, 13);
    }
    this.highlightCount++;
    speak(digit(this.highlightCount), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.tallyText.setText(`${this.mode === "sides" ? t("spSide") : t("spCorner")}: ${digit(this.highlightCount)}`);
  }

  private buildOptions() {
    for (const b of this.options) b.destroy();
    this.options = [];
    const target = this.mode === "sides" ? this.shape.sides : this.shape.corners;
    const opts = new Set<number>([target]);
    const deltas = [1, -1, 2, -2, 3];
    let di = 0;
    while (opts.size < 4 && di < deltas.length) {
      const v = target + deltas[di];
      if (v >= 0 && v <= 6 && !opts.has(v)) opts.add(v);
      di++;
    }
    this.optionValues = shuffle([...opts]);
    const { width, height } = this.scale;
    const spacing = 78;
    const x0 = width / 2 - (spacing * (this.optionValues.length - 1)) / 2;
    const y = Math.min(height - 60, height * 0.85);
    this.optionValues.forEach((v, i) => {
      const c = modernAnswerButton(this, x0 + i * spacing, y, 34, digit(v), BTN_PRIMARY, { labelSize: 30 });
      c.on("pointerdown", () => this.tap(v, c));
      this.options.push(c);
    });
  }

  private tap(v: number, c: Phaser.GameObjects.Container) {
    if (this.locked) return;
    const target = this.mode === "sides" ? this.shape.sides : this.shape.corners;
    if (v !== target) {
      bad();
      const face = c.list[0] as Phaser.GameObjects.Image;
      face.setTint(0xff6b6b);
      this.time.delayedCall(400, () => face.setTint(0xffffff));
      // reset the count aid so the kid recounts from zero — counting stays visual
      this.highlightCount = 0;
      this.highlightGfx.clear();
      this.tallyText.setText(t("spHint", { w: this.mode === "sides" ? t("spSide") : t("spCorner") }));
      return;
    }
    this.locked = true;
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    (c.getData("nv-btn") as { setCorrect: () => void } | undefined)?.setCorrect();
    speak(digit(target), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.floatMsg(t("spGreat", { n: digit(target) }));
    this.tallyText.setText(`${t(this.shape.nameKey)} — ${digit(target)} ${this.mode === "sides" ? t("spSide") : t("spCorner")}`);
    this.advance();
  }

  private advance() {
    this.answered++;
    const ms = Math.max(1, this.time.now - this.startedAt);
    if (this.answered < this.total) {
      this.pos++;
      this.time.delayedCall(900, () => this.ask());
      return;
    }
    this.finishRound(ms);
  }

  private finishRound(ms: number) {
    this.floatMsg(t("spDone"));
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(1800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.3, text, txt(26, `#${color.toString(16).padStart(6, "0")}`, { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1500, onComplete: () => m.destroy() });
  }
}

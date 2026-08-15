import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, type RoundMeterApi, NV_GOLD, NV_NAVY } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-comparefrac")?.difficultyLevels ?? [0, 0, 1, 1, 2, 2];
const ROUNDS_TO_FINISH = 3;


interface Frac {
  num: number;
  den: number;
}

function val(f: Frac): number {
  return f.num / f.den;
}
function label(f: Frac): string {
  return `${digit(f.num)}/${digit(f.den)}`;
}
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Every pair/triple is VALUE-DISTINCT so there is always one correct answer.
const UNIT_PAIRS: Frac[][] = [
  [{ num: 1, den: 2 }, { num: 1, den: 3 }],
  [{ num: 1, den: 2 }, { num: 1, den: 4 }],
  [{ num: 1, den: 3 }, { num: 1, den: 4 }],
  [{ num: 1, den: 3 }, { num: 1, den: 5 }],
  [{ num: 1, den: 2 }, { num: 1, den: 5 }],
  [{ num: 1, den: 4 }, { num: 1, den: 5 }],
];
const SAME_DEN_PAIRS: Frac[][] = [
  [{ num: 1, den: 4 }, { num: 3, den: 4 }],
  [{ num: 2, den: 5 }, { num: 3, den: 5 }],
  [{ num: 1, den: 3 }, { num: 2, den: 3 }],
  [{ num: 2, den: 6 }, { num: 5, den: 6 }],
  [{ num: 2, den: 4 }, { num: 3, den: 4 }],
  [{ num: 1, den: 5 }, { num: 4, den: 5 }],
];
const UNLIKE_PAIRS: Frac[][] = [
  [{ num: 2, den: 3 }, { num: 3, den: 4 }],
  [{ num: 1, den: 2 }, { num: 2, den: 3 }],
  [{ num: 1, den: 2 }, { num: 3, den: 4 }],
  [{ num: 2, den: 3 }, { num: 5, den: 6 }],
  [{ num: 3, den: 4 }, { num: 4, den: 5 }],
  [{ num: 1, den: 3 }, { num: 2, den: 5 }],
];
const ORDER_SAME_DEN: Frac[][] = [
  [{ num: 1, den: 4 }, { num: 3, den: 4 }, { num: 2, den: 4 }],
  [{ num: 1, den: 5 }, { num: 4, den: 5 }, { num: 2, den: 5 }],
  [{ num: 2, den: 6 }, { num: 5, den: 6 }, { num: 3, den: 6 }],
];
const ORDER_UNLIKE: Frac[][] = [
  [{ num: 1, den: 2 }, { num: 1, den: 4 }, { num: 3, den: 4 }],
  [{ num: 1, den: 3 }, { num: 2, den: 3 }, { num: 4, den: 5 }],
  [{ num: 1, den: 5 }, { num: 1, den: 2 }, { num: 3, den: 4 }],
];

/**
 * Compare & order fractions (#61).
 * Band 3: two pizzas (or three for ordering) show shaded slices; the kid taps
 * the BIGGER one, then orders 3 from smallest → biggest. Unit fractions first,
 * then same denominators, then unlike denominators — every compare is backed by
 * the real pizza, so "which is bigger" is verifiable by counting shaded slices.
 */
export class CompareFracScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private mode: "compare" | "order" = "compare";
  private pool: Frac[][] = UNIT_PAIRS;
  private bag: number[] = [];
  private pos = 0;
  private answered = 0;
  private correct = 0;
  private total = 0;
  private current: Frac[] = [];
  private biggerIdx = -1;
  private picked: number[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private promptText!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private gfx: Phaser.GameObjects.Graphics[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private hits: Phaser.GameObjects.Arc[] = [];
  private badges: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super("CompareFrac");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "kitchen");
    this.titleText = this.add
      .text(0, 0, t("titleCompareFrac"), txt(32, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, "", txt(26, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.promptText.setPosition(width / 2, height * 0.14);
    this.promptText.setWordWrapWidth(Math.max(220, width - 60));
    this.tallyText.setPosition(width / 2, height * 0.21);
  }

  private startRound() {
    const l = this.levelIndex;
    if (l === 0 || l === 1) { this.mode = "compare"; this.pool = UNIT_PAIRS; }
    else if (l === 2) { this.mode = "compare"; this.pool = SAME_DEN_PAIRS; }
    else if (l === 3) { this.mode = "order"; this.pool = ORDER_SAME_DEN; }
    else if (l === 4) { this.mode = "compare"; this.pool = UNLIKE_PAIRS; }
    else { this.mode = "order"; this.pool = ORDER_UNLIKE; }

    this.bag = shuffle(this.pool.map((_, i) => i));
    this.pos = 0;
    this.answered = 0;
    this.correct = 0;
    this.total = this.bag.length;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.ask();
  }

  private ask() {
    this.locked = false;
    this.clearPizzas();
    this.picked = [];
    const item = this.pool[this.bag[this.pos % this.bag.length]];
    this.current = shuffle(item);
    if (this.mode === "compare") {
      this.biggerIdx = val(this.current[0]) > val(this.current[1]) ? 0 : 1;
      this.promptText.setText(t("cfWhich"));
    } else {
      this.promptText.setText(t("cfOrder"));
    }
    this.placePizzas();
  }

  private placePizzas() {
    const { width, height } = this.scale;
    const n = this.current.length;
    const r = n === 2 ? Math.min(92, width * 0.2) : Math.min(68, width * 0.15);
    const y = height * 0.56;
    const xs = n === 2 ? [width * 0.28, width * 0.72] : [width * 0.17, width * 0.5, width * 0.83];
    const labelY = Math.min(height - 40, y + r + 30);
    for (let i = 0; i < n; i++) {
      const g = this.add.graphics();
      this.drawPizza(g, xs[i], y, r, this.current[i].num, this.current[i].den);
      this.gfx.push(g);
      const lbl = this.add
        .text(xs[i], labelY, label(this.current[i]), txt(30, "#ffffff", { bold: true, outline: true }))
        .setOrigin(0.5);
      this.labels.push(lbl);
      const hit = this.add
        .circle(xs[i], y, r + 10, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.tap(i));
      this.hits.push(hit);
    }
  }

  private drawPizza(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, num: number, den: number) {
    const start = -Math.PI / 2;
    const step = (Math.PI * 2) / den;
    g.fillStyle(0xe9c46a, 1);
    g.slice(x, y, r, 0, Math.PI * 2);
    g.fillPath();
    g.fillStyle(0xf4a261, 1);
    for (let i = 0; i < den; i++) {
      g.slice(x, y, r - 2, start + i * step, start + (i + 1) * step);
      g.fillPath();
    }
    g.fillStyle(0xe76f51, 1);
    for (let i = 0; i < num; i++) {
      g.slice(x, y, r - 2, start + i * step, start + (i + 1) * step);
      g.fillPath();
    }
    g.lineStyle(4, 0x5c2a0e, 1);
    for (let i = 0; i <= den; i++) {
      const a = start + i * step;
      g.lineBetween(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
  }

  private placeBadge(i: number, n: number) {
    const { width, height } = this.scale;
    const r = this.current.length === 2 ? Math.min(92, width * 0.2) : Math.min(68, width * 0.15);
    const y = height * 0.56;
    const xs = this.current.length === 2 ? [width * 0.28, width * 0.72] : [width * 0.17, width * 0.5, width * 0.83];
    const bx = xs[i] + r * 0.68;
    const by = y - r * 0.68;
    const ring = this.add.circle(bx, by, 18, 0xffd166).setDepth(19);
    const num = this.add
      .text(bx, by, digit(n), txt(28, NV_NAVY, { bold: true }))
      .setOrigin(0.5)
      .setDepth(20);
    this.badges.push(ring, num);
  }

  private tap(i: number) {
    if (this.locked) return;
    if (this.mode === "compare") {
      if (i === this.biggerIdx) this.correctCompare(i);
      else this.wrongCompare(i);
      return;
    }
    // order mode — record the pick; check once all three are placed.
    if (this.picked.includes(i)) return;
    this.picked.push(i);
    pop();
    this.placeBadge(i, this.picked.length);
    if (this.picked.length === this.current.length) {
      const sorted = this.current.map((_, idx) => idx).sort((p, q) => val(this.current[p]) - val(this.current[q]));
      if (this.picked.every((v, k) => v === sorted[k])) this.correctOrder();
      else this.wrongOrder();
    }
  }

  private correctCompare(i: number) {
    this.locked = true;
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.correct++;
    this.tweens.add({ targets: this.gfx[i], scale: 1.12, duration: 160, yoyo: true, ease: "Back.easeOut" });
    this.hits[i].setFillStyle(0x4ade80, 0.2);
    this.floatMsg(t("cfGreat"));
    speak(label(this.current[this.biggerIdx]), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.advance();
  }

  private wrongCompare(i: number) {
    bad();
    this.locked = true;
    this.hits[i].setFillStyle(0xff6b6b, 0.2);
    this.hits[this.biggerIdx].setFillStyle(0x4ade80, 0.25);
    this.floatMsg(t("cfHint"), 0x4ade80);
    this.time.delayedCall(1000, () => {
      this.hits[i].setFillStyle(0xffffff, 0.001);
      this.hits[this.biggerIdx].setFillStyle(0xffffff, 0.001);
    });
    this.advance();
  }

  private correctOrder() {
    this.locked = true;
    win();
    this.correct++;
    this.badges.forEach((b) =>
      this.tweens.add({ targets: b, scale: 1.2, duration: 160, yoyo: true, ease: "Back.easeOut" })
    );
    this.floatMsg(t("cfSorted"));
    speak(this.current.map((f) => label(f)).join(", "), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.advance();
  }

  private wrongOrder() {
    bad();
    this.locked = true;
    const sorted = this.current.map((_, idx) => idx).sort((p, q) => val(this.current[p]) - val(this.current[q]));
    this.hits[sorted[0]].setFillStyle(0x4ade80, 0.25);
    this.floatMsg(t("cfAgain"), 0x4ade80);
    this.time.delayedCall(1200, () => this.hits[sorted[0]].setFillStyle(0xffffff, 0.001));
    this.advance();
  }

  private advance() {
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    const ms = Math.max(1, this.time.now - this.startedAt);
    if (this.answered < this.total) {
      this.pos++;
      this.time.delayedCall(900, () => this.ask());
      return;
    }
    this.finishRound(ms);
  }

  private finishRound(ms: number) {
    this.floatMsg(t("cfDone"));
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.correct === this.total, ms, this.levelIndex + 1);
    this.time.delayedCall(1800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.3, text, `#${color.toString(16).padStart(6, "0")}`, 26, -24);
  }

  private clearPizzas() {
    this.gfx.forEach((g) => g.destroy());
    this.labels.forEach((l) => l.destroy());
    this.hits.forEach((h) => h.destroy());
    this.badges.forEach((b) => b.destroy());
    this.gfx = [];
    this.labels = [];
    this.hits = [];
    this.badges = [];
  }
}

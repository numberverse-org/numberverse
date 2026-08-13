import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-alphabet")?.difficultyLevels ?? [4, 4, 5, 5, 6, 6];
const ROUNDS_TO_FINISH = 3;
const CARD_H = 72;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ১ ২ ৩, English kids 1 2 3. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

// ── Levelled word sets ──
// 4 cards: all distinct first letters (band-1 easy). 5 cards: longer, still
// distinct firsts. 6 cards: shared first letters force 2nd/3rd-letter compare.
const SETS_4: string[][] = [
  ["apple", "ball", "cat", "dog"],
  ["ant", "bee", "cow", "fox"],
  ["bag", "car", "duck", "egg"],
  ["bird", "cake", "fish", "hat"],
  ["bear", "cow", "deer", "frog"],
  ["boat", "cup", "drum", "goat"],
  ["book", "cake", "door", "egg"],
  ["bus", "cat", "dog", "ear"],
];
const SETS_5: string[][] = [
  ["apple", "banana", "cherry", "grape", "mango"],
  ["ball", "drum", "kite", "lion", "tree"],
  ["bridge", "castle", "forest", "garden", "river"],
  ["bread", "cheese", "honey", "mango", "rice"],
  ["cow", "duck", "frog", "lion", "tiger"],
  ["green", "orange", "purple", "red", "yellow"],
  ["brother", "father", "mother", "sister", "uncle"],
  ["autumn", "garden", "spring", "summer", "winter"],
];
const SETS_6: string[][] = [
  ["ant", "apple", "ball", "bat", "cat", "dog"],
  ["big", "bird", "book", "bus", "cake", "car"],
  ["bear", "bee", "bird", "boat", "book", "bus"],
  ["cat", "cake", "cap", "dog", "egg", "fish"],
  ["apple", "ant", "ball", "bear", "cat", "cow"],
  ["duck", "dog", "drum", "egg", "fish", "fox"],
  ["hat", "hen", "hill", "sun", "tree", "water"],
  ["ice", "jam", "jump", "kite", "leaf", "moon"],
];
const SETS: Record<number, string[][]> = { 4: SETS_4, 5: SETS_5, 6: SETS_6 };

/**
 * Alphabetical order race (#185).
 * Band 1/2 reading: drag 4-6 word cards into ABC order. Every drop is checked
 * instantly — cards that sit in their correct slot glow green, and the round
 * wins the moment the whole row is home. 24 levelled word sets (8 × 4/5/6).
 */
export class AlphaOrderScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private words: string[] = [];
  private order: number[] = [];
  private cards: Phaser.GameObjects.Container[] = [];
  private slotX: number[] = [];
  private slotCy = 0;
  private fromSlot = -1;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private stepLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("AlphaOrder");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleAlpha"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("alPrompt"));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.input.on("dragstart", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDragStart(p, obj));
    this.input.on("drag", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDrag(p, obj));
    this.input.on("dragend", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDragEnd(p, obj));
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.22);
  }

  private startRound() {
    this.clearRound();
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);

    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const pool = SETS[n];
    let set = pool[Phaser.Math.Between(0, pool.length - 1)];
    if (set === this.words) set = pool[(pool.indexOf(set) + 1) % pool.length];
    this.words = set; // pool array reference — repeat-avoidance by identity
    const sorted = [...set].sort();

    // each card's home slot = its index in the sorted order
    this.order = Array.from({ length: n }, (_, i) => i);
    // shuffle until NOT already alphabetical — every round needs a real move
    while (this.order.every((v, i) => v === i)) {
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Phaser.Math.Between(0, i);
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
    }

    const gl = gridLayout(this, {
      cols: n,
      rows: 1,
      preferredW: n <= 4 ? 180 : 140,
      minW: 52,
      widthPad: 14,
      topPad: this.scale.height * 0.42,
      bottomY: this.scale.height - 50 - SAB(),
      cardH: CARD_H,
    });
    this.slotCy = gl.cy;
    this.slotX = Array.from({ length: n }, (_, i) => gl.startX + i * gl.spacingX);
    const fs = gl.cardW < 72 ? 12 : 16;

    for (let i = 0; i < n; i++) {
      const lbl = this.add
        .text(this.slotX[i], gl.cy - CARD_H / 2 - 20, digit(i + 1), txt(18, "#ffd166", { bold: true, outline: true }))
        .setOrigin(0.5);
      this.stepLabels.push(lbl);
    }

    this.cards = this.order.map((wix, slot) => {
      const card = modernCardButton(this, this.slotX[slot], gl.cy, gl.cardW, CARD_H, sorted[wix], BTN_NEUTRAL, fs, gl.cardW - 8);
      card.setData("wix", wix);
      this.input.setDraggable(card);
      return card;
    });
  }

  private onDragStart(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked) return;
    this.fromSlot = this.cards.indexOf(obj);
    if (this.fromSlot < 0) return;
    obj.setDepth(30);
    this.tweens.add({ targets: obj, scale: 1.1, duration: 90, ease: "Sine.easeOut" });
  }

  private onDrag(p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked || this.fromSlot < 0) return;
    obj.x = Phaser.Math.Clamp(p.x, this.slotX[0] - 40, this.slotX[this.slotX.length - 1] + 40);
    obj.y = this.slotCy;
  }

  private onDragEnd(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked || this.fromSlot < 0) return;
    const from = this.fromSlot;
    this.fromSlot = -1;
    obj.setDepth(10);
    this.tweens.add({ targets: obj, scale: 1, duration: 90, ease: "Sine.easeInOut" });

    let to = 0;
    let best = Infinity;
    this.slotX.forEach((sx, i) => {
      const d = Math.abs(obj.x - sx);
      if (d < best) { best = d; to = i; }
    });

    if (to === from) {
      this.tweens.add({ targets: obj, x: this.slotX[from], duration: 120, ease: "Sine.easeInOut" });
      return;
    }

    [this.order[from], this.order[to]] = [this.order[to], this.order[from]];
    [this.cards[from], this.cards[to]] = [this.cards[to], this.cards[from]];
    this.tweens.add({ targets: obj, x: this.slotX[to], duration: 130, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.cards[from], x: this.slotX[from], duration: 130, ease: "Back.easeOut" });

    // INSTANT CHECK — glow the cards already in their ABC slot
    for (let i = 0; i < this.cards.length; i++) {
      const face = this.cards[i].list[0] as Phaser.GameObjects.Image;
      face.setTint(this.order[i] === i ? 0x4ade80 : 0xffffff);
    }
    if (this.order.every((v, i) => v === i)) this.solve();
  }

  private solve() {
    this.locked = true;
    pop();
    win();
    this.prompt.set(t("alGreat"));
    this.floatMsg(t("alGreat"));
    this.time.delayedCall(300, () => speak(this.words.join(", "), { lang: "en" }));
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(1400, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.floatMsg(t("alDone"));
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.44, text, txt(26, "#ffd166", { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 26, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearRound() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    this.stepLabels.forEach((l) => l.destroy());
    this.stepLabels = [];
    this.slotX = [];
  }
}

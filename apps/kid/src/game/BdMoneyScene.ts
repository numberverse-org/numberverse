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
import { txt, modernAnswerButton, ringCorrect, roundMeter, btnFromColor, BTN_NEUTRAL, gridLayout, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-bdtaka")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
const ROUNDS_TO_FINISH = 3;
const CARD_RADIUS = 48;


/** Real Bangladesh taka — small ones are coins, bigger ones are notes. */
const DENOMS = [
  { taka: 1, kind: "coin", hex: 0xd9a441 },
  { taka: 2, kind: "coin", hex: 0xd9a441 },
  { taka: 5, kind: "coin", hex: 0xd9a441 },
  { taka: 10, kind: "note", hex: 0x2e8b57 },
  { taka: 20, kind: "note", hex: 0x3569c8 },
  { taka: 50, kind: "note", hex: 0x8e44ad },
  { taka: 100, kind: "note", hex: 0xd64541 },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Phaser.Math.Between(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** All 2–3 coin/note combinations summing to a value (denoms 1, 2, 5 = class-1 taka). */
function combosFor(sum: number, maxLen = 3): number[][] {
  const D = [1, 2, 5];
  const out: number[][] = [];
  const rec = (rem: number, start: number, chosen: number[]) => {
    if (rem === 0) {
      if (chosen.length >= 2) out.push([...chosen]);
      return;
    }
    if (chosen.length >= maxLen || rem < 0) return;
    for (let i = start; i < D.length; i++) {
      chosen.push(D[i]);
      rec(rem - D[i], i, chosen); // repeats allowed — two 5-taka coins are real money!
      chosen.pop();
    }
  };
  rec(sum, 0, []);
  return out;
}

/** Every distinct 2–3-coin combo for sums 3–15 (the whole class-1 money ladder). */
const COMBO_POOL: Array<{ sum: number; comps: number[] }> = (() => {
  const out: Array<{ sum: number; comps: number[] }> = [];
  const seen = new Set<string>();
  for (let s = 3; s <= 15; s++) {
    for (const c of combosFor(s)) {
      const key = [...c].sort((a, b) => a - b).join(".");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ sum: s, comps: c });
    }
  }
  return out;
})();

/**
 * Taka Tap — recognize Bangladesh money, make amounts, and give change.
 * Band 2 (ages 4–6, Math): ৳১ ৳২ ৳৫ coins + ৳৫ ৳১০ ৳২০ ৳৫০ ৳১০০ notes.
 *  - Levels 1–3: "which is ৳5?" → tap the right note/coin.
 *  - Levels 4–6: "which makes ৳7?" → tap the coin stack that adds up.
 *  - Levels 7–9: "you paid ৳20 for a ৳14 thing" → tap the correct CHANGE back.
 */
export class BdMoneyScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private mode: "recognize" | "make" | "change" = "recognize";
  private targetTaka = 0;
  private paidTaka = 0;
  private priceTaka = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private amountText!: Phaser.GameObjects.Text;
  private priceText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;

  constructor() {
    super("BdMoney");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleBdMoney"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.amountText = this.add
      .text(0, 0, "", txt(62, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5);
    this.priceText = this.add
      .text(0, 0, "", txt(24, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.amountText.setPosition(width / 2, height * 0.27);
    this.priceText.setPosition(width / 2, height * 0.27 + 42);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private amountWords(n: number): string {
    return getAppLang() === "bn" ? `${bnNumber(n)} টাকা` : `${enNumber(n)} taka`;
  }

  private startRound() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.mode = this.levelIndex < 3 ? "recognize" : this.levelIndex < 6 ? "make" : "change";

    if (this.mode === "recognize") {
      // pool grows with level: 3 → 4 → 5 denominations (৳1/2/5 coins, then ৳10/20/50/100 notes)
      const pool = DENOMS.slice(0, Math.min(3 + this.levelIndex, DENOMS.length));
      const target = pool[Phaser.Math.Between(0, pool.length - 1)];
      this.targetTaka = target.taka;
      this.amountText.setText(`৳${digit(target.taka)}`);
      this.priceText.setText("");
      this.prompt.set(t("tapMoney"));
      speak(this.amountWords(target.taka));
      const tiles = shuffle(pool).slice(0, LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)]);
      this.spawnRecognitionTiles(tiles);
    } else if (this.mode === "make") {
      // make an amount: tap the coin stack that adds up to the shown ৳ total
      const T = Phaser.Math.Between(6, 10 + (this.levelIndex - 3));
      const correctPool = COMBO_POOL.filter((c) => c.sum === T);
      const correct = correctPool[Phaser.Math.Between(0, correctPool.length - 1)];
      this.targetTaka = T;
      this.amountText.setText(`৳${digit(T)}`);
      this.priceText.setText("");
      this.prompt.set(t("moneyMake"));
      speak(this.amountWords(T));
      const need = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
      const dist = shuffle(COMBO_POOL.filter((c) => c.sum !== T)).slice(0, Math.max(0, need - 1));
      const tiles = shuffle([correct, ...dist]);
      this.spawnCompositionTiles(tiles);
    } else {
      this.startChangeRound();
    }
  }

  /**
   * Give change — levels 7–9 (class-1 money: ৳৫ and ৳২০ notes in the flow).
   * You pay a note for a thing; tap the coin stack that IS your change.
   *  - L7: paid ৳5/10/20, change 3–6 (simple stacks)
   *  - L8: paid ৳10/20/50, change 6–9 (two-coin stacks)
   *  - L9: paid ৳20/50, change 9–12 (bigger change, bigger notes)
   */
  private startChangeRound() {
    const paidPools: Record<number, number[]> = { 6: [5, 10, 20], 7: [10, 20, 50], 8: [20, 50] };
    const changeRanges: Record<number, [number, number]> = { 6: [3, 6], 7: [6, 9], 8: [9, 12] };
    const paidPool = paidPools[this.levelIndex] ?? [20];
    const [cLo, cHi] = changeRanges[this.levelIndex] ?? [3, 6];

    // The note you hand over (৳৫ and ৳২০ are real paid-notes here).
    const paid = paidPool[Phaser.Math.Between(0, paidPool.length - 1)];
    // The change must be smaller than what you paid (price ≥ 1) and have a stack.
    const hi = Math.min(cHi, paid - 1);
    const lo = Math.min(cLo, hi);
    const change = Phaser.Math.Between(lo, hi);
    const price = paid - change;

    this.paidTaka = paid;
    this.priceTaka = price;
    this.targetTaka = change; // the change is what we hunt for
    this.amountText.setText(`৳${digit(paid)}`);
    this.priceText.setText(`${t("priceLabel")} · ৳${digit(price)}`);

    const correctPool = COMBO_POOL.filter((c) => c.sum === change);
    const correct = correctPool[Phaser.Math.Between(0, correctPool.length - 1)];
    this.prompt.set(t("moneyChange", { paid: digit(paid), price: digit(price) }));
    const spoken =
      getAppLang() === "bn"
        ? `তুমি ${this.amountWords(paid)} দিয়ে ${this.amountWords(price)} এর জিনিস কিনলে। ফেরত কত টাকা?`
        : `You paid ${this.amountWords(paid)} for a ${this.amountWords(price)} thing. What is your change?`;
    speak(spoken);

    const need = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const dist = shuffle(COMBO_POOL.filter((c) => c.sum !== change)).slice(0, Math.max(0, need - 1));
    const tiles = shuffle([correct, ...dist]);
    this.spawnCompositionTiles(tiles);
  }

  private spawnRecognitionTiles(tiles: Array<{ taka: number; hex: number }>) {
    const n = tiles.length;
    const cols = n <= 3 ? 3 : n <= 4 ? 2 : 3;
    const gl = gridLayout(this, {
      cols,
      rows: Math.ceil(n / cols),
      preferredW: CARD_RADIUS * 2,
      minW: 56,
      widthPad: 40,
      topPad: Math.round(this.scale.height * 0.27 + 68),
      bottomY: this.scale.height - 172 - SAB(),
      gapX: 10,
      gapY: 10,
    });
    tiles.forEach((d, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (Math.ceil(n / cols) - 1) / 2) * gl.spacingY;
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, `৳${digit(d.taka)}`, btnFromColor(d.hex));
      c.setData("val", d.taka);
      c.on("pointerdown", () => this.tap(c, d.taka));
      this.cards.push(c);
    });
  }

  private spawnCompositionTiles(tiles: Array<{ sum: number; comps: number[] }>) {
    const n = tiles.length;
    const cols = 3; // bigger cards so the coin stacks stay tappable
    const gl = gridLayout(this, {
      cols,
      rows: Math.ceil(n / cols),
      preferredW: CARD_RADIUS * 2,
      minW: 56,
      widthPad: 40,
      topPad: Math.round(this.scale.height * 0.27 + 68),
      bottomY: this.scale.height - 172 - SAB(),
      gapX: 10,
      gapY: 10,
    });
    const coinR = Math.max(10, Math.round(gl.cardW * 0.15));
    tiles.forEach((entry, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (Math.ceil(n / cols) - 1) / 2) * gl.spacingY;
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, "", BTN_NEUTRAL);
      // stack the coins — a ৫+২ pair reads as "7 taka" without a word
      const comps = entry.comps;
      const stackH = comps.length * (coinR * 2 + 2) - 2;
      comps.forEach((comp, ci) => {
        const cy = -stackH / 2 + ci * (coinR * 2 + 2) + coinR;
        const coin = this.add.circle(0, cy, coinR, 0xd9a441, 1);
        coin.setStrokeStyle(3, 0xb07920, 1);
        const inner = this.add.circle(0, cy, coinR * 0.66, 0xf5c75c, 1);
        const tx = this.add
          .text(0, cy, digit(comp), txt(Math.round(coinR * 0.95), "#7a4f00", { bold: true }))
          .setOrigin(0.5);
        c.add([coin, inner, tx]);
      });
      c.setData("val", entry.sum);
      c.on("pointerdown", () => this.tap(c, entry.sum));
      this.cards.push(c);
    });
  }

  private tap(container: Phaser.GameObjects.Container, tappedTaka: number) {
    if (tappedTaka !== this.targetTaka) {
      if (this.mode === "change") {
        hintWrong(this, container, {
          hint: () => `Your change is ৳${digit(this.targetTaka)} — tap that many`,
          hintBn: () => `তোমার ফেরত ${digit(this.targetTaka)} টাকা — সেটা বাছো`,
          correct: () => this.targetTaka,
          options: () => this.cards.map((s) => ({ sprite: s, value: s.getData("val") })),
        });
      } else {
        hintWrong(this, container, {
          hint: () => `Look for ৳${digit(this.targetTaka)}`,
          hintBn: () => `${digit(this.targetTaka)} টাকা খুঁজো`,
          correct: () => this.targetTaka,
          options: () => this.cards.map((s) => ({ sprite: s, value: s.getData("val") })),
        });
      }
      return;
    }
    pop();
    ringCorrect(this, container);
    this.cards.forEach((c) => c.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 16; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, 0xffd700);
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-70, 70),
        y: y + Phaser.Math.Between(-70, 70),
        alpha: 0,
        duration: 520,
        onComplete: () => p.destroy(),
      });
    }
  }
}

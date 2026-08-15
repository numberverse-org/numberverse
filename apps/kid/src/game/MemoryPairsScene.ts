import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak, bnNumber, enNumber } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { assetIcon } from "./svgAssets";
import { txt, ringCorrect, gridLayout, roundMeter, type RoundMeterApi, NV_GOLD, NV_NAVY } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-memorypairs")?.difficultyLevels ?? [2, 3, 4, 5, 6, 7];
const ROUNDS_TO_FINISH = 3;
const CARD_COLS = 4;

interface MemCard {
  sprite: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Container;
  front: Phaser.GameObjects.Container;
  value: number;
  kind: "num" | "count";
  flipped: boolean;
  matched: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Phaser.Math.Between(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Memory Pairs — match the numeral to the fruit count.
 * Band 1 (ages 2–4, math). A classic memory game: flip two cards, find the
 * pair where the NUMBER and the fruit COUNT are the same. Every flip speaks
 * the value aloud, so quantity sense builds with every reveal.
 */
export class MemoryPairsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private cards: MemCard[] = [];
  private first: MemCard | null = null;
  private busy = false;
  private matchedCount = 0;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("MemoryPairs");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleMemory"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("memoryIntro"));
    onSceneResize(this, () => {
      this.layout();
      this.reflowGrid();
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

  private get roundPairs(): number {
    return LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
  }

  private gridSpec(pairs: number) {
    const n = pairs * 2;
    const rows = Math.ceil(n / CARD_COLS);
    const gl = gridLayout(this, {
      cols: CARD_COLS,
      rows,
      preferredW: 92,
      minW: 56,
      cardH: 86,
      widthPad: 24,
      topPad: 150,
      bottomY: this.scale.height - 180 - SAB(),
      gapX: 10,
      gapY: 10,
    });
    return { rows, n, gl };
  }

  private startRound() {
    this.clearCards();
    this.first = null;
    this.busy = false;
    this.matchedCount = 0;
    this.startedAt = this.time.now;
    const pairs = this.roundPairs;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    // pick `pairs` numbers from 1..(pairs+1) — counts stay small & friendly
    const nums = shuffle(Array.from({ length: pairs + 1 }, (_, i) => i + 1)).slice(0, pairs);
    const cards: { value: number; kind: "num" | "count" }[] = [];
    for (const v of nums) {
      cards.push({ value: v, kind: "num" });
      cards.push({ value: v, kind: "count" });
    }
    this.spawnCards(shuffle(cards));
  }

  private spawnCards(entries: { value: number; kind: "num" | "count" }[]) {
    const { rows, n, gl } = this.gridSpec(entries.length / 2);
    const gridH = (rows - 1) * gl.spacingY;
    const w = gl.cardW;
    const h = gl.cardH;
    entries.forEach((e, i) => {
      const x = gl.startX + (i % CARD_COLS) * gl.spacingX;
      const y = gl.cy - gridH / 2 + Math.floor(i / CARD_COLS) * gl.spacingY;
      const card = this.makeCard(x, y, w, h, e.value, e.kind);
      card.sprite.setData("idx", i);
      card.sprite.on("pointerdown", () => this.tap(card));
      this.cards.push(card);
    });
  }

  private makeCard(x: number, y: number, w: number, h: number, value: number, kind: "num" | "count"): MemCard {
    const sprite = this.add.container(x, y);
    const back = this.add.container(0, 0);
    const front = this.add.container(0, 0);

    const cardFace = (scene: Phaser.Scene, fill: number, stroke: number) => {
      const g = scene.add.graphics();
      g.fillStyle(fill, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      g.lineStyle(3, stroke, 1);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
      g.lineStyle(2, 0xffffff, 0.7);
      g.strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 11);
      return g;
    };

    back.add(cardFace(this, 0x7c3aed, 0x4c1d95));
    const mark = this.add
      .text(0, 0, "✦", txt(30, "#fdf4ff", { bold: true, shadow: false }))
      .setOrigin(0.5);
    back.add(mark);

    front.add(cardFace(this, 0xffffff, 0x0b2545));
    if (kind === "num") {
      const label = this.add
        .text(0, 0, String(value), txt(34, NV_NAVY, { bold: true, shadow: false }))
        .setOrigin(0.5);
      front.add(label);
    } else {
      // fruit-count card: a row/grid of apple icons
      const iconSize = Math.min(26, Math.round(w / 3));
      const ccols = Math.ceil(Math.sqrt(value));
      const crows = Math.ceil(value / ccols);
      for (let i = 0; i < value; i++) {
        const ix = -((ccols - 1) * (iconSize + 4)) / 2 + (i % ccols) * (iconSize + 4);
        const iy = -((crows - 1) * (iconSize + 2)) / 2 + Math.floor(i / ccols) * (iconSize + 2);
        front.add(assetIcon(this, "apple", iconSize).setPosition(ix, iy));
      }
    }

    front.setVisible(false);
    sprite.add([back, front]);
    sprite.setSize(w, h);
    sprite.setInteractive({ useHandCursor: true });

    return { sprite, back, front, value, kind, flipped: false, matched: false };
  }

  private tap(card: MemCard) {
    if (this.busy || card.flipped || card.matched) return;
    this.flip(card);
    card.flipped = true;
    // say the value aloud — every reveal teaches the number
    const bn = getAppLang() === "bn";
    speak(bn ? bnNumber(card.value) : enNumber(card.value), { cancel: false });
    if (!this.first) {
      this.first = card;
      return;
    }
    const a = this.first;
    this.first = null;
    this.busy = true;
    if (a.value === card.value) {
      this.matchPair(a, card);
    } else {
      this.tweens.add({ targets: a.sprite, y: a.sprite.y - 8, duration: 60, yoyo: true, repeat: 1 });
      this.tweens.add({ targets: card.sprite, y: card.sprite.y - 8, duration: 60, yoyo: true, repeat: 1 });
      this.time.delayedCall(760, () => {
        this.flip(a);
        a.flipped = false;
        this.flip(card);
        card.flipped = false;
        this.busy = false;
      });
    }
  }

  private matchPair(a: MemCard, b: MemCard) {
    pop();
    a.matched = true;
    b.matched = true;
    this.matchedCount++;
    ringCorrect(this, a.sprite);
    ringCorrect(this, b.sprite);
    this.sparkle(a.sprite.x, a.sprite.y);
    this.sparkle(b.sprite.x, b.sprite.y);
    const bn = getAppLang() === "bn";
    speak(t("pairMatched", { word: bn ? bnNumber(a.value) : enNumber(a.value) }), { lang: bn ? "bn" : "en" });
    const totalPairs = this.roundPairs;
    if (this.matchedCount >= totalPairs) {
      const ms = Math.max(1, this.time.now - this.startedAt);
      win();
      this.roundsDone++;
      this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
      this.onRoundDone?.(this.matchedCount >= totalPairs, ms, this.levelIndex + 1);
      this.time.delayedCall(800, () => {
        if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
        this.levelIndex++;
        this.startRound();
      });
    } else {
      this.time.delayedCall(160, () => {
        this.busy = false;
      });
    }
  }

  private flip(card: MemCard) {
    this.tweens.add({
      targets: card.sprite,
      scaleX: 0.05,
      duration: 110,
      ease: "Quad.easeIn",
      onComplete: () => {
        card.front.setVisible(card.flipped);
        card.back.setVisible(!card.flipped);
        this.tweens.add({ targets: card.sprite, scaleX: 1, duration: 130, ease: "Quad.easeOut" });
      },
    });
  }

  private reflowGrid() {
    const { rows, gl } = this.gridSpec(this.roundPairs);
    const gridH = (rows - 1) * gl.spacingY;
    for (const c of this.cards) {
      const i = c.sprite.getData("idx") as number;
      c.sprite.setPosition(gl.startX + (i % CARD_COLS) * gl.spacingX, gl.cy - gridH / 2 + Math.floor(i / CARD_COLS) * gl.spacingY);
    }
  }

  private clearCards() {
    this.cards.forEach((c) => c.sprite.destroy());
    this.cards = [];
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 14; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, this.randomColor());
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-60, 60),
        y: y + Phaser.Math.Between(-60, 60),
        alpha: 0,
        duration: 480,
        onComplete: () => p.destroy(),
      });
    }
  }

  private randomColor(): number {
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255)
    );
  }
}

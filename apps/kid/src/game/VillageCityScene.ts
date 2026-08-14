import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { getAppLang } from "./locale";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-villagecity")?.difficultyLevels ?? [4, 4, 6, 6, 8, 8];
/** Skill seed for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-villagecity")?.skillId ?? "bgs-village-city";
const ROUNDS_TO_FINISH = 3;
const CARD_W = 58;
const CARD_H = 72;

interface Card {
  emoji: string;
  en: string;
  bn: string;
  isVillage: boolean;
}
/* Scene cards — every card carries an emoji + BANGLA + ENGLISH label, so
 * pre-readers sort by icon and older kids learn both words (#235). Easy set
 * is unmistakably village/city; the tricky set (levels 2+) mixes in things
 * like mango trees and trains that need a moment's thought. */
const EASY: Card[] = [
  { emoji: "🐄", en: "cow", bn: "গরু", isVillage: true },
  { emoji: "🌾", en: "paddy", bn: "ধান", isVillage: true },
  { emoji: "🐓", en: "chicken", bn: "মুরগি", isVillage: true },
  { emoji: "🏢", en: "building", bn: "দালান", isVillage: false },
  { emoji: "🚌", en: "bus", bn: "বাস", isVillage: false },
  { emoji: "🚦", en: "signal", bn: "সিগন্যাল", isVillage: false },
];
const TRICKY: Card[] = [
  { emoji: "🐸", en: "frog", bn: "ব্যাঙ", isVillage: true },
  { emoji: "🥭", en: "mango", bn: "আম", isVillage: true },
  { emoji: "🌳", en: "tree", bn: "বটগাছ", isVillage: true },
  { emoji: "🏥", en: "hospital", bn: "হাসপাতাল", isVillage: false },
  { emoji: "🏪", en: "shop", bn: "দোকান", isVillage: false },
  { emoji: "🚉", en: "train", bn: "ট্রেন", isVillage: false },
];

interface CardItem {
  sprite: Phaser.GameObjects.Container;
  card: Card;
  homeX: number;
  homeY: number;
  dragging: boolean;
}

/**
 * Village & City — sort scenes into the right world (#235).
 * Band 2 (ages 4–6, BGS/social). Two zones at the bottom: the village 🏡
 * (left, green) and the city 🏙️ (right, blue). Cards with emoji + Bangla +
 * English labels appear above; the kid drags each into its zone. Wrong drops
 * are gentle — the card floats "try again!" and glides home. Cards per round
 * grow 4 → 6 → 8 and the tricky pool joins at level 2.
 */
export class VillageCityScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private dealt = 0;
  private sorted = 0;
  private cards: CardItem[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private meter!: RoundMeterApi;
  private zones!: Phaser.GameObjects.Graphics;
  private villageLabel!: Phaser.GameObjects.Text;
  private cityLabel!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("VillageCity");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleVillageCity"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.zones = this.add.graphics();
    this.villageLabel = this.add.text(0, 0, "", txt(18, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(2);
    this.cityLabel = this.add.text(0, 0, "", txt(18, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(2);
    onSceneResize(this, () => {
      this.layout();
      this.layoutCards();
    });
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 26);
    this.roundText.setPosition(width / 2, 60);
    this.meter.setPosition(width / 2, 88);
    this.prompt.setPosition(width / 2, height * 0.14);
    // two zones fill the bottom band
    const zTop = height * 0.78;
    const z = this.zones.clear();
    z.fillStyle(0x2f6b37, 1); // village green (left)
    z.fillRoundedRect(8, zTop, width / 2 - 12, height - zTop - 8, 18);
    z.lineStyle(3, 0xa7e39b, 0.9);
    z.strokeRoundedRect(8, zTop, width / 2 - 12, height - zTop - 8, 18);
    z.fillStyle(0x3a5a8c, 1); // city blue (right)
    z.fillRoundedRect(width / 2 + 4, zTop, width / 2 - 12, height - zTop - 8, 18);
    z.lineStyle(3, 0x8ec5ff, 0.9);
    z.strokeRoundedRect(width / 2 + 4, zTop, width / 2 - 12, height - zTop - 8, 18);
    this.villageLabel.setText(`🏡 ${t("villageZone")}`);
    this.cityLabel.setText(`🏙️ ${t("cityZone")}`);
    this.villageLabel.setPosition(width * 0.25, (zTop + height) / 2);
    this.cityLabel.setPosition(width * 0.75, (zTop + height) / 2);
  }

  private startRound() {
    this.clearCards();
    this.dealt = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const pool = this.levelIndex >= 2 ? [...EASY, ...TRICKY] : EASY;
    // A deal must have BOTH a village and a city card — an all-one-side round
    // would be no fun. Randomly re-deal until mixed (bounded; ~0.1% retry).
    let dealt: Card[] = [];
    let guard = 0;
    do {
      dealt = [...pool].sort(() => Math.random() - 0.5).slice(0, this.dealt);
      guard++;
    } while (guard < 10 && (dealt.every((c) => c.isVillage) || dealt.every((c) => !c.isVillage)));
    this.sorted = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.prompt.set(t("whereBelongs"));
    speak(t("whereBelongs"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    dealt.forEach((card) => this.spawnCard(card));
    this.layoutCards();
  }

  private spawnCard(card: Card) {
    const c = this.add.container(0, 0).setDepth(10);
    const g = this.add.graphics();
    g.fillStyle(0x2f4b7c, 1);
    g.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
    g.lineStyle(2, 0x6ee7ff, 1);
    g.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
    c.add(g);
    c.add(this.add.text(0, -21, card.emoji, txt(30, "#ffffff")).setOrigin(0.5));
    c.add(this.add.text(0, 5, card.en, txt(11, "#ffffff", { wrap: CARD_W - 10 })).setOrigin(0.5));
    c.add(this.add.text(0, 19, card.bn, txt(11, "#ffffff", { wrap: CARD_W - 10 })).setOrigin(0.5));
    c.setSize(CARD_W, CARD_H);
    c.setInteractive();
    this.input.setDraggable(c);
    const item: CardItem = { sprite: c, card, homeX: 0, homeY: 0, dragging: false };
    c.on("dragstart", () => {
      item.dragging = true;
    });
    c.on("drag", (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
      c.setPosition(dx, dy);
    });
    c.on("dragend", () => {
      item.dragging = false;
      this.dropCard(item);
    });
    this.cards.push(item);
  }

  private layoutCards() {
    const k = this.cards.length;
    if (!k) return;
    const { width, height } = this.scale;
    if (k <= 6) {
      const gap = width / (k + 1);
      this.cards.forEach((item, i) => {
        item.homeX = gap * (i + 1);
        item.homeY = height * 0.42;
        if (!item.dragging) item.sprite.setPosition(item.homeX, item.homeY);
      });
    } else {
      // 8 cards → two tidy rows of 4
      const gap = width / 5;
      this.cards.forEach((item, i) => {
        const row = i < 4 ? 0 : 1;
        item.homeX = gap * ((i % 4) + 1);
        item.homeY = height * (row === 0 ? 0.34 : 0.52);
        if (!item.dragging) item.sprite.setPosition(item.homeX, item.homeY);
      });
    }
  }

  private dropCard(item: CardItem) {
    const c = item.sprite;
    const { width, height } = this.scale;
    const inZone = c.y > height * 0.78;
    const inLeft = c.x < width / 2;
    if (!inZone || (inLeft && !item.card.isVillage) || (!inLeft && item.card.isVillage)) {
      // dropped outside a zone, or in the WRONG zone — gentle try again
      const msg = this.add.text(c.x, c.y - 46, t("sortTry"), txt(16, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(30);
      this.tweens.add({ targets: msg, y: msg.y - 30, alpha: 0, duration: 700, onComplete: () => msg.destroy() });
      this.tweens.add({ targets: c, x: item.homeX, y: item.homeY, duration: 450, ease: "Sine.easeInOut" });
      return;
    }
    pop();
    c.disableInteractive();
    this.sorted++;
    const zoneX = item.card.isVillage ? width * 0.25 : width * 0.75;
    const zoneY = height * 0.88;
    this.tweens.add({
      targets: c,
      x: zoneX,
      y: zoneY,
      scaleX: 0.4,
      scaleY: 0.4,
      duration: 260,
      ease: "Back.easeIn",
      onComplete: () => {
        this.sparkle(zoneX, zoneY);
        c.destroy();
        this.cards = this.cards.filter((x) => x !== item);
        if (this.sorted >= this.dealt) this.finishRound();
      },
    });
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.45, t("sortWoo"), txt(30, NV_GOLD, { bold: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 32, alpha: 0, duration: 900, onComplete: () => m.destroy() });
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private sparkle(x: number, y: number) {
    const s = this.add.text(x, y, "✨", txt(30, "#ffffff")).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: s, y: y - 26, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 500, onComplete: () => s.destroy() });
  }

  private clearCards() {
    this.cards.forEach((item) => item.sprite.destroy());
    this.cards = [];
  }
}

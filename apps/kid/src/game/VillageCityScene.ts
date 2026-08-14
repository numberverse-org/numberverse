import Phaser from "phaser";
import { DragReorderScene, type DragReorderConfig, type DragCard, type DragTarget } from "./reorder";
import { t } from "./i18n";
import { getAppLang } from "./locale";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { txt, NV_GOLD } from "./ui";

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

const CFG: DragReorderConfig = {
  gameId: "game-villagecity",
  titleKey: "titleVillageCity",
  promptKey: "whereBelongs",
  greatKey: "sortWoo",
  doneKey: "sortWoo",
  background: "sky",
  rounds: 3,
  cardH: CARD_H,
  dragMode: "free",
  dragScale: 1,
  announceDone: false,
};

/**
 * Village & City — sort scenes into the right world (#235).
 * Band 2 (ages 4–6, BGS/social). Two zones at the bottom: the village 🏡
 * (left, green) and the city 🏙️ (right, blue). Cards with emoji + Bangla +
 * English labels appear above; the kid drags each into its zone. Wrong drops
 * are gentle — the card floats "try again!" and glides home. Cards per round
 * grow 4 → 6 → 8 and the tricky pool joins at level 2.
 */
export class VillageCityScene extends DragReorderScene {
  private dealt = 0;
  private sorted = 0;
  private draggingCard: DragCard | null = null;
  private zones!: Phaser.GameObjects.Graphics;
  private villageLabel!: Phaser.GameObjects.Text;
  private cityLabel!: Phaser.GameObjects.Text;

  constructor() {
    super("VillageCity");
  }

  protected cfg(): DragReorderConfig {
    return CFG;
  }

  protected onCreate() {
    this.zones = this.add.graphics();
    this.villageLabel = this.add.text(0, 0, "", txt(18, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(2);
    this.cityLabel = this.add.text(0, 0, "", txt(18, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(2);
  }

  protected layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 26);
    this.roundText.setPosition(width / 2, 60);
    this.meter.setPosition(width / 2, 88);
    if (this.prompt) this.prompt.setPosition(width / 2, height * 0.14);
    this.drawZones();
    this.layoutCards();
  }

  private drawZones() {
    const { width, height } = this.scale;
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
    this.targets = [
      { value: "village", x: width * 0.25, y: (zTop + height) / 2, w: width / 2 - 12, h: height - zTop - 8 },
      { value: "city", x: width * 0.75, y: (zTop + height) / 2, w: width / 2 - 12, h: height - zTop - 8 },
    ];
  }

  protected dealRound() {
    const ladder = this.ladder();
    this.dealt = ladder[Math.min(this.levelIndex, ladder.length - 1)];
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
    if (this.prompt) this.prompt.set(t("whereBelongs"));
    speak(t("whereBelongs"), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.drawZones();
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
    this.cards.push({
      obj: c,
      item: { value: card.isVillage ? "village" : "city", label: card.en, emoji: card.emoji, sub: card.bn },
      homeX: 0,
      homeY: 0,
      slot: -1,
      placed: false,
    });
  }

  private layoutCards() {
    const k = this.cards.length;
    if (!k) return;
    const { width, height } = this.scale;
    if (k <= 6) {
      const gap = width / (k + 1);
      this.cards.forEach((card, i) => {
        card.homeX = gap * (i + 1);
        card.homeY = height * 0.42;
        if (card !== this.draggingCard) card.obj.setPosition(card.homeX, card.homeY);
      });
    } else {
      // 8 cards → two tidy rows of 4
      const gap = width / 5;
      this.cards.forEach((card, i) => {
        const row = i < 4 ? 0 : 1;
        card.homeX = gap * ((i % 4) + 1);
        card.homeY = height * (row === 0 ? 0.34 : 0.52);
        if (card !== this.draggingCard) card.obj.setPosition(card.homeX, card.homeY);
      });
    }
  }

  protected onDragStart(p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    this.draggingCard = this.cardFor(obj) ?? null;
    super.onDragStart(p, obj);
  }

  protected onDragEnd(p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    super.onDragEnd(p, obj);
    this.draggingCard = null;
  }

  protected onDrop(card: DragCard, target: DragTarget | null) {
    const c = card.obj;
    const correct = target !== null && target.value === card.item.value;
    if (!correct) {
      // dropped outside a zone, or in the WRONG zone — gentle try again
      const msg = this.add.text(c.x, c.y - 46, t("sortTry"), txt(16, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(30);
      this.tweens.add({ targets: msg, y: msg.y - 30, alpha: 0, duration: 700, onComplete: () => msg.destroy() });
      this.tweens.add({ targets: c, x: card.homeX, y: card.homeY, duration: 450, ease: "Sine.easeInOut" });
      return;
    }
    pop();
    c.disableInteractive();
    this.sorted++;
    const zoneX = card.item.value === "village" ? this.scale.width * 0.25 : this.scale.width * 0.75;
    const zoneY = this.scale.height * 0.88;
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
        this.cards = this.cards.filter((x) => x !== card);
        if (this.sorted >= this.dealt) this.onSolved();
      },
    });
  }

  protected onSolved() {
    this.locked = true;
    this.markSolved();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.floatMsg(t("sortWoo"));
    this.finishRound(true);
  }

  protected advanceDelay(): number {
    return 900;
  }

  private sparkle(x: number, y: number) {
    const s = this.add.text(x, y, "✨", txt(30, "#ffffff")).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: s, y: y - 26, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 500, onComplete: () => s.destroy() });
  }

  protected floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.45, text, txt(30, NV_GOLD, { bold: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 32, alpha: 0, duration: 900, onComplete: () => m.destroy() });
  }
}

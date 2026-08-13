import Phaser from "phaser";
import { t } from "./i18n";
import { getAppLang } from "./locale";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, correctButton, roundMeter, type RoundMeterApi } from "./ui";

const POOL_SIZES = GAMES.find((g) => g.id === "game-foodchain")?.difficultyLevels ?? [3, 3, 4, 4, 6, 6];
/** Skill seed for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-foodchain")?.skillId ?? "science-food-chain";
const ROUNDS_TO_FINISH = 3;
const CARD_W = 76;

interface Link {
  emoji: string;
  en: string;
  bn: string;
}
interface Chain {
  links: Link[];
}

/* 6 food chains (#232 "5 chains"), easy → tricky. Every chain is
 * producer → plant-eater → meat-eater. Emoji labels are language-neutral;
 * the words in the question/hint localize EN/BN. */
const CHAINS: Chain[] = [
  { links: [{ emoji: "🌱", en: "grass", bn: "ঘাস" }, { emoji: "🦗", en: "grasshopper", bn: "ফড়িং" }, { emoji: "🐸", en: "frog", bn: "ব্যাঙ" }] },
  { links: [{ emoji: "🌱", en: "grass", bn: "ঘাস" }, { emoji: "🐇", en: "rabbit", bn: "খরগোশ" }, { emoji: "🦊", en: "fox", bn: "শিয়াল" }] },
  { links: [{ emoji: "🌱", en: "grass", bn: "ঘাস" }, { emoji: "🐁", en: "mouse", bn: "ইঁদুর" }, { emoji: "🐍", en: "snake", bn: "সাপ" }] },
  { links: [{ emoji: "🌱", en: "grass", bn: "ঘাস" }, { emoji: "🦌", en: "deer", bn: "হরিণ" }, { emoji: "🐅", en: "tiger", bn: "বাঘ" }] },
  { links: [{ emoji: "🌿", en: "seaweed", bn: "শেওলা" }, { emoji: "🐟", en: "fish", bn: "মাছ" }, { emoji: "🦈", en: "shark", bn: "হাঙর" }] },
  { links: [{ emoji: "🌼", en: "flower", bn: "ফুল" }, { emoji: "🐝", en: "bee", bn: "মৌমাছি" }, { emoji: "🐦", en: "bird", bn: "পাখি" }] },
];

const SLOT_YS = 0.48; // slot center (fraction of height)

/**
 * Food Chain — order producer → eater → predator with arrows.
 * Band 2 (ages 4–6, science). The producer is pre-placed; the kid taps who
 * EATS it (the next link) from three shuffled cards. Correct → the card flies
 * into the slot and the "→" arrow lights up between the links. 3 taps build
 * the whole chain.
 */
export class FoodChainScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private chain!: Chain;
  private stepIdx = 0; // 0 → need link[1], 1 → need link[2]
  private cards: { sprite: Phaser.GameObjects.Container; link: Link }[] = [];
  private slots: Phaser.GameObjects.Text[] = [];
  private arrows: Phaser.GameObjects.Text[] = [];
  private slotBg!: Phaser.GameObjects.Graphics;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("FoodChain");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "forest");
    this.titleText = this.add
      .text(0, 0, t("titleFoodChain"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.slotBg = this.add.graphics();
    // chain slots (empty rounded cards) + arrows between them
    for (let i = 0; i < 3; i++) this.slots.push(this.slotCard(i));
    for (let i = 0; i < 2; i++) this.arrows.push(this.add.text(0, 0, "→", txt(30, "#ffd166", { bold: true })).setOrigin(0.5));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private slotCard(i: number): Phaser.GameObjects.Text {
    const s = this.add.text(0, 0, "?", txt(36, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(50);
    return s;
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height * 0.28);
    for (let i = 0; i < 3; i++) this.slots[i].setPosition(this.slotX(i), height * SLOT_YS);
    for (let i = 0; i < 2; i++) this.arrows[i].setPosition((this.slotX(i) + this.slotX(i + 1)) / 2, height * SLOT_YS);
    // slot card backgrounds (rounded rects behind the emoji/?)
    const bg = this.slotBg.clear();
    bg.fillStyle(0x2f4b7c, 1);
    for (let i = 0; i < 3; i++) bg.fillRoundedRect(this.slotX(i) - CARD_W / 2, height * SLOT_YS - 34, CARD_W, 68, 14);
    this.reflowCards();
  }

  private slotX(i: number) {
    return this.scale.width * (0.5 + (i - 1) * 0.32);
  }

  private get cardY() {
    return this.scale.height * 0.78;
  }

  private poolSize() {
    return POOL_SIZES[Math.min(this.levelIndex, POOL_SIZES.length - 1)];
  }

  private word(l: Link) {
    return getAppLang() === "bn" ? l.bn : l.en;
  }

  private startRound() {
    this.clearCards();
    this.startedAt = this.time.now;
    this.chain = CHAINS[Math.floor(Math.random() * this.poolSize())];
    this.stepIdx = 0;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    // pre-place the producer
    this.slots[0].setText(this.chain.links[0].emoji);
    this.slots[1].setText("?");
    this.slots[2].setText("?");
    this.arrows[0].setAlpha(0.25);
    this.arrows[1].setAlpha(0.25);
    this.ask();
    this.spawnCards();
  }

  private ask() {
    const eater = this.chain.links[this.stepIdx + 1];
    const eaten = this.chain.links[this.stepIdx];
    this.prompt.set(t("whoEats", { w: this.word(eaten), e: eater.emoji }));
    const bn = getAppLang() === "bn";
    speak(t("whoEatsSpeak", { w: this.word(eaten), e: eater.emoji }), { lang: bn ? "bn" : "en" });
  }

  private spawnCards() {
    const shuffled = [...this.chain.links].sort(() => Math.random() - 0.5);
    const gap = this.scale.width / (shuffled.length + 1);
    shuffled.forEach((link, i) => {
      const x = gap * (i + 1);
      const c = this.add.container(x, this.cardY);
      const g = this.add.graphics();
      g.fillStyle(0x2f4b7c, 1);
      g.fillRoundedRect(-CARD_W / 2, -34, CARD_W, 68, 14);
      g.lineStyle(2, 0x6ee7ff, 1);
      g.strokeRoundedRect(-CARD_W / 2, -34, CARD_W, 68, 14);
      c.add(g);
      const emoji = this.add.text(0, -8, link.emoji, txt(30, "#ffffff", { align: "center" })).setOrigin(0.5);
      c.add(emoji);
      const label = this.add.text(0, 22, this.word(link), txt(12, "#ffffff", { align: "center" })).setOrigin(0.5);
      c.add(label);
      c.setSize(CARD_W, 68);
      c.setInteractive();
      c.on("pointerdown", () => this.tap(c, link));
      this.cards.push({ sprite: c, link });
    });
  }

  private reflowCards() {
    if (!this.cards.length) return;
    const gap = this.scale.width / (this.cards.length + 1);
    this.cards.forEach((c, i) => c.sprite.setPosition(gap * (i + 1), this.cardY));
  }

  private tap(container: Phaser.GameObjects.Container, link: Link) {
    const expected = this.chain.links[this.stepIdx + 1];
    if (link !== expected) {
      hintWrong(this, container, {
        hint: () => `The ${this.word(this.chain.links[this.stepIdx])} is eaten by the ${this.word(expected)}!`,
        hintBn: () => `${this.word(this.chain.links[this.stepIdx])}কে খায় ${this.word(expected)}!`,
        correct: () => expected.emoji,
        options: () => this.cards.map((c) => ({ sprite: c.sprite, value: c.link.emoji })),
      });
      return;
    }
    pop();
    correctButton(container);
    container.disableInteractive();
    // fly the card into its slot, then light the arrow
    const slotIdx = this.stepIdx + 1;
    this.tweens.add({
      targets: container,
      x: this.slotX(slotIdx),
      y: this.scale.height * SLOT_YS,
      duration: 340,
      ease: "Back.easeOut",
      onComplete: () => {
        this.slots[slotIdx].setText(link.emoji);
        this.arrows[this.stepIdx].setAlpha(1);
        this.stepIdx++;
        if (this.stepIdx >= 2) {
          this.finishRound();
        } else {
          this.ask();
        }
      },
    });
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearCards() {
    this.cards.forEach((c) => c.sprite.destroy());
    this.cards = [];
  }
}

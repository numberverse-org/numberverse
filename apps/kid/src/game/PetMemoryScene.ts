import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { txt, NV_GOLD } from "./ui";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { SAT, SAB } from "./safeArea";
import { prefersReducedMotion } from "./reducedMotion";
import {
  useKidStore,
  defaultNova,
  todayIso,
  NOVA_DAILY_CAP,
  speciesEmoji,
  challengeQualityCoins,
} from "../store";

/**
 * 🃏 PET MEMORY — pet mini-game #611 (docs/plans/104-pet-minigames.md).
 *
 * Memory-match with pet faces; matching a pair shows the species name.
 * Recognition is the bonus; matching is the fun. Small 3×4 grid (6 pairs),
 * no timer, pressure-free. 1 coin on a clean board via novaChallengeReward.
 */

const T = {
  en: {
    title: "🃏 Pet Memory",
    hint: "Flip the cards & match the pets!",
    match: "Match!",
    done: "All matched! +1 🪙 🎉",
    perfect: "Perfect memory! +2 🪙 ⭐",
    cap: "You earned ALL your coins today! 🪙✨",
    close: "✕",
  },
  bn: {
    title: "🃏 পোষা প্রাণী মনে রাখো",
    hint: "কার্ড উল্টাও আর মিল খুঁজে বের করো!",
    match: "মিলেছে!",
    done: "সব মিলেছে! +1 🪙 🎉",
    perfect: "নিখুঁত স্মৃতি! +2 🪙 ⭐",
    cap: "আজ সব কয়েন জিতেছ! 🪙✨",
    close: "✕",
  },
} as const;

// 6 distinct pet faces → 12 cards (two of each)
const FACES = [
  { emoji: "🦉", name: "Owl", nameBn: "প্যাঁচা" },
  { emoji: "🐈", name: "Cat", nameBn: "বিড়াল" },
  { emoji: "🦚", name: "Peacock", nameBn: "ময়ূর" },
  { emoji: "🐉", name: "Dragon", nameBn: "ড্রাগন" },
  { emoji: "🐣", name: "Hatchling", nameBn: "ছানা" },
  { emoji: "🥚", name: "Egg", nameBn: "ডিম" },
] as const;

const COLS = 3;
const ROWS = 4;

interface Card {
  c: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Text;
  back: Phaser.GameObjects.Text;
  faceKey: number;
  revealed: boolean;
  matched: boolean;
}

export class PetMemoryScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private reduced = false;
  private hint!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;

  private cards: Card[] = [];
  private open: Card[] = [];
  private attempts = 0; // #1194 — pair-flip attempts (quality tier)
  private matchedCount = 0;
  private busy = false;

  constructor() {
    super("PetMemory");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    this.reduced = prefersReducedMotion();
    gameBackground(this, "night");
    this.drawHeader();
    this.deal();
    onSceneResize(this, () => this.layout());
  }

  private t() {
    return this.lang === "bn" ? T.bn : T.en;
  }

  private drawHeader() {
    const T = this.t();
    this.add
      .text(this.scale.width / 2, 30 + SAT(), T.title, txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.hint = this.add
      .text(this.scale.width / 2, 74 + SAT(), T.hint, txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.msg = this.add
      .text(this.scale.width / 2, this.scale.height * 0.4, "", txt(18, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(900);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T.close, txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private deal() {
    this.cards = [];
    this.open = [];
    this.matchedCount = 0;
    this.attempts = 0;
    this.busy = false;
    // two of each face, shuffled
    const pairs: number[] = [];
    FACES.forEach((_, i) => {
      pairs.push(i, i);
    });
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Phaser.Math.Between(0, i);
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    const cardW = 84;
    const cardH = 96;
    const gap = 10;
    const totalW = COLS * cardW + (COLS - 1) * gap;
    const totalH = ROWS * cardH + (ROWS - 1) * gap;
    const startX = (this.scale.width - totalW) / 2 + cardW / 2;
    const startY = Math.max(150 + SAT(), (this.scale.height - totalH) / 2);
    pairs.forEach((faceKey, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);
      this.cards.push(this.makeCard(x, y, faceKey));
    });
  }

  private makeCard(x: number, y: number, faceKey: number): Card {
    const c = this.add.container(x, y).setDepth(100);
    // rounded card
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.14);
    g.fillRoundedRect(-42, -48, 84, 96, 12);
    g.lineStyle(2, 0xffffff, 0.4);
    g.strokeRoundedRect(-42, -48, 84, 96, 12);
    const face = this.add
      .text(0, 0, FACES[faceKey].emoji, txt(40, "#ffffff"))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(101);
    const back = this.add.text(0, 0, "❓", txt(34, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(102);
    c.add([g, face, back]);
    c.setSize(84, 96).setInteractive({ useHandCursor: true });
    const card: Card = { c, face, back, faceKey, revealed: false, matched: false };
    c.on("pointerdown", () => this.tapCard(card));
    return card;
  }

  private tapCard(card: Card) {
    if (this.busy || card.matched || card.revealed) return;
    if (this.open.length >= 2) return;
    this.reveal(card);
    this.open.push(card);
    if (this.open.length === 2) {
      this.busy = true;
      this.attempts += 1;
      const [a, b] = this.open;
      if (a.faceKey === b.faceKey) {
        // match!
        pop();
        this.matchedCount += 1;
        a.matched = true;
        b.matched = true;
        speak(this.t().match);
        this.matchGlow(a);
        this.matchGlow(b);
        this.open = [];
        this.busy = false;
        if (this.matchedCount >= FACES.length) {
          this.time.delayedCall(500, () => this.finishRound());
        }
      } else {
        // mismatch — flip back kindly
        const stay = this.reduced ? 700 : 900;
        this.time.delayedCall(stay, () => {
          this.hide(a);
          this.hide(b);
          this.open = [];
          this.busy = false;
        });
      }
    }
  }

  private reveal(card: Card) {
    card.revealed = true;
    this.tweens.add({
      targets: card.c,
      scaleX: 0,
      duration: 110,
      onComplete: () => {
        card.back.setAlpha(0);
        card.face.setAlpha(1);
        this.tweens.add({ targets: card.c, scaleX: 1, duration: 110 });
      },
    });
  }

  private hide(card: Card) {
    card.revealed = false;
    this.tweens.add({
      targets: card.c,
      scaleX: 0,
      duration: 110,
      onComplete: () => {
        card.face.setAlpha(0);
        card.back.setAlpha(1);
        this.tweens.add({ targets: card.c, scaleX: 1, duration: 110 });
      },
    });
  }

  private matchGlow(card: Card) {
    const g = this.add.circle(card.c.x, card.c.y, 52, 0xffd166, 0.35).setDepth(99);
    this.tweens.add({ targets: g, alpha: 0, scale: 1.3, duration: 500, onComplete: () => g.destroy() });
  }

  private finishRound() {
    win();
    // #1194 — quality-tiered: matching every pair on the FIRST try (6 pair
    // flips for 6 faces) is the 2-coin perfect tier; any extra attempt drops
    // to the 1-coin base.
    const perfect = this.attempts <= FACES.length;
    const coins = challengeQualityCoins(perfect ? 1 : 0.5);
    const granted = useKidStore.getState().novaChallengeReward(this.kidId, coins);
    const T = this.t();
    const msgText = granted > 0 ? (perfect ? T.perfect : T.done) : T.cap;
    speak(msgText);
    this.showMsg(msgText, 1700);
    this.time.delayedCall(2100, () => {
      this.cards.forEach((cd) => cd.c.destroy());
      this.deal();
    });
  }

  private showMsg(text: string, ms: number) {
    this.msg.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.msg);
    this.tweens.add({ targets: this.msg, alpha: 0, delay: ms, duration: 300 });
  }

  private layout() {
    if (!this.hint || !this.closeBtn) return;
    const T = this.t();
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.msg.setPosition(this.scale.width / 2, this.scale.height * 0.4);
  }
}

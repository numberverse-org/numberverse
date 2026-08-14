import Phaser from "phaser";
import { pop, bad, win } from "./audio";
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
 * 🧺 SORT THE TREATS — pet mini-game #614 (docs/plans/104-pet-minigames.md).
 *
 * Drag each treat into the right bowl (fruit / veg / sweet) to feed Nova. A
 * wrong bowl pops the treat back with a gentle hint — no shame. Clean sort of
 * all 9 treats = +1 coin via novaChallengeReward. Small set (3 bowls, 9
 * treats), pressure-free.
 */

const T = {
  en: {
    title: "🧺 Sort the Treats",
    hint: "Drag each treat into its bowl!",
    nice: "Nice! 🎉",
    wrong: "That one goes in the other bowl! 🤗",
    reward: "All sorted! Nova is full! +1 🪙 💛",
    perfect: "Perfect sort! Nova is delighted! +2 🪙 ⭐",
    cap: "You earned ALL your coins today! 🪙✨",
    close: "✕",
  },
  bn: {
    title: "🧺 খাবার সাজাও",
    hint: "প্রতিটা খাবার নিজের বাটিতে দাও!",
    nice: "বাহ্! 🎉",
    wrong: "ওটা অন্য বাটিতে যাবে! 🤗",
    reward: "সব সাজানো! নোভার পেট ভরা! +1 🪙 💛",
    perfect: "নিখুঁত সাজানো! নোভা খুব খুশি! +2 🪙 ⭐",
    cap: "আজ সব কয়েন জিতেছ! 🪙✨",
    close: "✕",
  },
} as const;

const TYPES = [
  { key: "fruit", label: "🍎", name: "Fruit", nameBn: "ফল", items: ["🍎", "🍌", "🍇"] },
  { key: "veg", label: "🥕", name: "Veg", nameBn: "সবজি", items: ["🥕", "🥦", "🥒"] },
  { key: "sweet", label: "🍪", name: "Sweet", nameBn: "মিষ্টি", items: ["🍪", "🧁", "🍭"] },
] as const;

interface Bowl {
  key: string;
  x: number;
  y: number;
  g: Phaser.GameObjects.Graphics;
}

export class TreatSortScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private reduced = false;
  private nova!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;

  private bowls: Bowl[] = [];
  private placed = 0;
  private wrongs = 0; // #1194 — wrong-bowl drops (quality tier)
  private roundDone = false;

  constructor() {
    super("TreatSort");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    this.reduced = prefersReducedMotion();
    gameBackground(this, "magic");
    this.drawHeader();
    this.drawNova();
    this.buildBowls();
    this.dealTreats();
    this.wireDrag();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
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
    this.countText = this.add
      .text(this.scale.width / 2, 108 + SAT(), "🧺 0/9", txt(22, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.msg = this.add
      .text(this.scale.width / 2, this.scale.height * 0.34, "", txt(18, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(900);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T.close, txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawNova() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    this.nova = this.add
      .text(this.scale.width - 46, this.scale.height - 46 - SAB(), speciesEmoji(nova.species, nova.petStage), txt(54, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100);
  }

  private buildBowls() {
    this.bowls = [];
    const spacing = Math.min(132, (this.scale.width - 100) / 3);
    const y = this.scale.height - 96 - SAB();
    TYPES.forEach((ty, i) => {
      const x = this.scale.width / 2 + (i - 1) * spacing;
      const g = this.add.graphics().setDepth(150);
      this.drawBowl(g, x, y, ty.label);
      this.bowls.push({ key: ty.key, x, y, g });
    });
  }

  private drawBowl(g: Phaser.GameObjects.Graphics, x: number, y: number, label: string) {
    g.clear();
    // bowl body — filled semicircle (a dish for the treats)
    g.fillStyle(0xf8fafc, 0.92);
    g.fillCircle(x, y, 44);
    g.fillStyle(0x38bdf8, 0.35);
    g.fillEllipse(x, y + 4, 84, 40);
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeEllipse(x, y, 84, 44);
    // label emoji sits in the dish
    g.setDepth(151);
    const lbl = this.add.text(x, y, label, txt(26, "#ffffff", { shadow: false })).setOrigin(0.5).setDepth(152);
    void lbl;
  }

  private dealTreats() {
    // 9 treats, one of each item, shuffled, laid out in a loose grid up top
    const treats: { emoji: string; key: string }[] = [];
    TYPES.forEach((ty) => ty.items.forEach((it) => treats.push({ emoji: it, key: ty.key })));
    // shuffle
    for (let i = treats.length - 1; i > 0; i--) {
      const j = Phaser.Math.Between(0, i);
      [treats[i], treats[j]] = [treats[j], treats[i]];
    }
    const top = 158 + SAT();
    const rowW = Math.min(300, this.scale.width - 80);
    const n = treats.length;
    treats.forEach((t, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = this.scale.width / 2 + (col - 1) * (rowW / 3);
      const y = top + row * 66;
      const tr = this.add
        .text(x, y, t.emoji, txt(36, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(200)
        .setInteractive({ useHandCursor: true, draggable: true });
      tr.setData("key", t.key);
      tr.setData("homex", x);
      tr.setData("homey", y);
      tr.setData("placed", false);
      // gentle idle bob so they look alive
      this.tweens.add({ targets: tr, y: y - 6, duration: 900 + i * 80, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    });
  }

  private wireDrag() {
    this.input.on("drag", (_p: Phaser.Input.Pointer, go: Phaser.GameObjects.Text, dragX: number, dragY: number) => {
      go.x = dragX;
      go.y = dragY;
      go.setScale(1.15);
    });
    this.input.on("dragend", (_p: Phaser.Input.Pointer, go: Phaser.GameObjects.Text) => {
      go.setScale(1);
      this.dropTreat(go);
    });
    this.input.setTopOnly(true);
  }

  private dropTreat(go: Phaser.GameObjects.Text) {
    if (this.roundDone || go.getData("placed")) return;
    const key: string = go.getData("key");
    // nearest bowl within reach
    let best: Bowl | null = null;
    let bestD = 1e9;
    for (const b of this.bowls) {
      const d = Phaser.Math.Distance.Between(go.x, go.y, b.x, b.y);
      if (d < 66 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    const homeX: number = go.getData("homex");
    const homeY: number = go.getData("homey");
    if (best && best.key === key) {
      // correct bowl — drop it in
      go.setData("placed", true);
      go.disableInteractive();
      pop();
      this.tweens.killTweensOf(go);
      this.tweens.add({
        targets: go,
        x: best.x + Phaser.Math.Between(-18, 18),
        y: best.y - 8,
        scale: 0.7,
        duration: 220,
        ease: "Back.easeIn",
      });
      this.placed += 1;
      this.countText.setText(`🧺 ${this.placed}/9`);
      speak(this.t().nice);
      this.bowlPop(best);
      if (this.placed >= 9) {
        this.roundDone = true;
        this.time.delayedCall(500, () => this.finishRound());
      }
    } else {
      // wrong bowl (or dropped elsewhere) — gentle return, no shame
      bad();
      this.wrongs += 1;
      if (best) this.wiggleBowl(best);
      speak(this.t().wrong);
      this.tweens.killTweensOf(go);
      this.tweens.add({
        targets: go,
        x: homeX,
        y: homeY,
        scale: 1,
        duration: this.reduced ? 300 : 200,
        ease: "Back.easeOut",
      });
    }
  }

  private bowlPop(b: Bowl) {
    this.tweens.add({ targets: b.g, scale: 1.12, duration: 90, yoyo: true, repeat: 1 });
  }

  private wiggleBowl(b: Bowl) {
    if (this.reduced) return;
    this.tweens.add({ targets: b.g, x: b.g.x + 5, duration: 60, yoyo: true, repeat: 2 });
  }

  private finishRound() {
    win();
    // #1194 — quality-tiered: a clean sort (zero wrong drops) is the 2-coin
    // perfect tier, any mistake drops to the 1-coin base.
    const perfect = this.wrongs === 0;
    const coins = challengeQualityCoins(perfect ? 1 : 0.5);
    const granted = useKidStore.getState().novaChallengeReward(this.kidId, coins);
    const T = this.t();
    const msgText = granted > 0 ? (perfect ? T.perfect : T.reward) : T.cap;
    speak(msgText);
    this.showMsg(msgText, 1700);
    this.time.delayedCall(2000, () => this.scene.restart({ kidId: this.kidId, onBack: this.onBack }));
  }

  private showMsg(text: string, ms: number) {
    this.msg.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.msg);
    this.tweens.add({ targets: this.msg, alpha: 0, delay: ms, duration: 300 });
  }

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn || !this.countText) return;
    const T = this.t();
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.countText.setPosition(this.scale.width / 2, 108 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.nova.setPosition(this.scale.width - 46, this.scale.height - 46 - SAB());
    this.msg.setPosition(this.scale.width / 2, this.scale.height * 0.34);
  }
}

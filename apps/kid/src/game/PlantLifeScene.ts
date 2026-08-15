import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-plantlife")?.difficultyLevels ?? [4, 4, 5, 5, 5, 5];
const ROUNDS_TO_FINISH = 3;

interface Stage {
  id: string;      // Seed | Sprout | Plant | Flower | Fruit
  emoji: string;
}

/** The 5 stages of the plant life cycle, in the order they must be placed. */
const STAGES: Stage[] = [
  { id: "Seed", emoji: "🫘" },
  { id: "Sprout", emoji: "🌱" },
  { id: "Plant", emoji: "🌿" },
  { id: "Flower", emoji: "🌸" },
  { id: "Fruit", emoji: "🍎" },
];

/** Static i18n keys so the audit scanner sees every literal. */
const NAME_KEY: Record<string, string> = {
  Seed: "lpSeed", Sprout: "lpSprout", Plant: "lpPlant", Flower: "lpFlower", Fruit: "lpFruit",
};

/**
 * Plant life cycle (#205). A band-1/2 science game ordering the stages of a
 * plant's life. The kid taps the shuffled stage cards in the right order;
 * every correct tap makes the plant in the pot GROW (spring-tween pop) and the
 * placed stage lights up on the timeline. Lvl 1–2 sequence seed→flower,
 * lvl 3+ the full seed→sprout→plant→flower→fruit.
 */
export class PlantLifeScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private stages: Stage[] = [];
  private placed = 0;
  private wrongs = 0;
  private busy = false;
  private cards: { c: Phaser.GameObjects.Container; stage: Stage; done: boolean }[] = [];
  private timeline: { key: string; t: Phaser.GameObjects.Text }[] = [];
  private grow!: Phaser.GameObjects.Container;
  private potG!: Phaser.GameObjects.Graphics;
  private growEmoji!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private growGeom = { cx: 0, emojiY: 0, potY: 0 };

  constructor() {
    super("PlantLife");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titlePlant"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);

    this.grow = this.add.container(0, 0).setDepth(10);
    this.potG = this.add.graphics();
    this.growEmoji = this.add.text(0, 0, "", txt(64, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5).setAlpha(0);
    this.grow.add([this.potG, this.growEmoji]);

    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.tallyText.setPosition(width - 42, 100);
    this.prompt.setPosition(width / 2, height * 0.24);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.growGeom = { cx: width / 2, emojiY: height * 0.44, potY: height * 0.62 };
    this.grow.setPosition(width / 2, 0);
    this.drawPot();
    if (this.timeline.length) this.positionTimeline();
    if (this.cards.length) this.positionCards();
  }

  private startRound() {
    this.clearRound();
    const count = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.stages = STAGES.slice(0, Math.max(2, count));
    this.placed = 0;
    this.wrongs = 0;
    this.busy = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.placed)}/${digit(this.stages.length)}`);
    this.buildTimeline();
    this.spawnCards();
    this.showGrow(null);
    this.showQuestion();
  }

  private buildTimeline() {
    this.timeline.forEach((e) => e.t.destroy());
    this.timeline = [];
    const { width } = this.scale;
    const n = this.stages.length;
    const gap = 46;
    const startX = width / 2 - (gap * (n - 1)) / 2;
    this.stages.forEach((st, i) => {
      const tx = this.add
        .text(startX + i * gap, 128, st.emoji, txt(26, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setAlpha(0.22);
      this.timeline.push({ key: st.id, t: tx });
    });
  }

  private positionTimeline() {
    const { width } = this.scale;
    const n = this.stages.length;
    const gap = 46;
    const startX = width / 2 - (gap * (n - 1)) / 2;
    this.timeline.forEach((e, i) => e.t.setPosition(startX + i * gap, 128));
  }

  private spawnCards() {
    this.clearCards();
    const shuffled = [...this.stages].sort(() => Math.random() - 0.5);
    const { width, height } = this.scale;
    const n = shuffled.length;
    const r = Math.max(26, Math.min(34, (width - 8 - (n - 1) * 10) / (2 * n)));
    const spacing = r * 2 + 10;
    const startX = width / 2 - (spacing * (n - 1)) / 2;
    const y = height - 70 - SAB();
    shuffled.forEach((st, i) => {
      const c = this.add.container(startX + i * spacing, y);
      const g = this.add.graphics();
      g.fillStyle(0x16a34a, 1);
      g.fillCircle(0, 0, r);
      g.fillStyle(0x4ade80, 1);
      g.fillCircle(0, -r * 0.18, r * 0.96);
      c.add(g);
      const emoji = this.add.text(0, 0, st.emoji, txt(r * 1.05, "#ffffff", { shadow: false })).setOrigin(0.5);
      c.add(emoji);
      c.setSize(r * 2, r * 2);
      c.setInteractive({ useHandCursor: true });
      const entry = { c, stage: st, done: false };
      c.on("pointerdown", () => this.tap(entry, st));
      this.cards.push(entry);
    });
  }

  private positionCards() {
    const { width, height } = this.scale;
    const n = this.cards.length;
    const r = Math.max(26, Math.min(34, (width - 8 - (n - 1) * 10) / (2 * n)));
    const spacing = r * 2 + 10;
    const startX = width / 2 - (spacing * (n - 1)) / 2;
    const y = height - 70 - SAB();
    this.cards.forEach((card, i) => card.c.setPosition(startX + i * spacing, y));
  }

  private showQuestion() {
    const expected = this.stages[this.placed];
    this.prompt.setText(t("lpQ", { stage: t(NAME_KEY[expected.id]) }));
    speak(t("lpSpeak", { stage: t(NAME_KEY[expected.id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
  }

  private tap(card: { c: Phaser.GameObjects.Container; stage: Stage; done: boolean }, stage: Stage) {
    if (this.busy) return;
    const expected = this.stages[this.placed];
    if (stage.id !== expected.id) {
      this.wrongs++;
      bad();
      this.floatMsg(t("lpQ", { stage: t(NAME_KEY[expected.id]) }), 0xf87171);
      this.tweens.add({ targets: card.c, x: card.c.x + 8, duration: 60, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
      return;
    }
    this.busy = true;
    this.placed++;
    pop();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    card.done = true;
    card.c.disableInteractive();
    this.tweens.add({ targets: card.c, scale: 1.15, duration: 140, yoyo: true, ease: "Back.easeOut" });
    this.tallyText.setText(`${digit(this.placed)}/${digit(this.stages.length)}`);
    const tl = this.timeline.find((e) => e.key === stage.id);
    if (tl) tl.t.setAlpha(1);
    this.floatMsg(t("lpGreat"), 0x4ade80);
    speak(t("lpSpeak", { stage: t(NAME_KEY[stage.id]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.showGrow(stage);
    this.time.delayedCall(500, () => {
      this.busy = false;
      if (this.placed < this.stages.length) this.showQuestion();
      else this.finishRound();
    });
  }

  /** The big "grow" moment: stage emoji springs up out of the pot. */
  private showGrow(stage: Stage | null) {
    if (!stage) {
      this.growEmoji.setAlpha(0);
      this.growEmoji.setScale(1);
      this.drawPot();
      return;
    }
    this.growEmoji.setText(stage.emoji);
    this.growEmoji.setAlpha(1);
    this.growEmoji.setScale(0.3);
    this.growEmoji.setPosition(this.growGeom.cx, this.growGeom.potY - 8);
    this.drawPot();
    this.tweens.add({
      targets: this.growEmoji,
      y: this.growGeom.emojiY,
      scale: 1,
      duration: 500,
      ease: "Back.easeOut",
    });
    // a couple of soil-particles fly up with the sprout
    for (let i = 0; i < 4; i++) {
      const p = this.add
        .text(this.growGeom.cx + (i % 2 === 0 ? -1 : 1) * (10 + i * 8), this.growGeom.potY - 6, i % 2 === 0 ? "🟤" : "🟢", txt(12, "#ffffff", {}))
        .setOrigin(0.5)
        .setDepth(12);
      this.tweens.add({
        targets: p,
        y: p.y - 30 - i * 8,
        x: p.x + (i % 2 === 0 ? -14 : 14),
        alpha: 0,
        duration: 520,
        ease: "Sine.easeOut",
        onComplete: () => p.destroy(),
      });
    }
  }

  /** A little terracotta pot drawn under the growing plant. */
  private drawPot() {
    const { cx, potY } = this.growGeom;
    this.potG.clear();
    const w = 92;
    this.potG.fillStyle(0xc2410c, 1);
    this.potG.fillRoundedRect(cx - w / 2, potY - 10, w, 10, 4); // rim
    this.potG.fillStyle(0x9a3412, 1);
    this.potG.fillTriangle(cx - w / 2, potY, cx + w / 2, potY, cx, potY + 46);
    this.potG.fillStyle(0x92400e, 1);
    this.potG.fillTriangle(cx - w / 2 + 8, potY, cx + w / 2 - 8, potY, cx, potY + 40);
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t("lpDone")}  ${digit(this.placed)}/${digit(this.stages.length)}`, 0xffd166);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.wrongs === 0, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.34, text, `#${color.toString(16).padStart(6, "0")}`, 26, -24);
  }

  private clearCards() {
    this.cards.forEach((o) => o.c.destroy());
    this.cards = [];
  }

  private clearRound() {
    this.clearCards();
    this.timeline.forEach((e) => e.t.destroy());
    this.timeline = [];
  }
}



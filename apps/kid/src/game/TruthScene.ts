import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_CORRECT, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-honesty")?.difficultyLevels ?? [2, 2, 3, 3, 4, 4];
const ROUNDS_TO_FINISH = 3;

interface Scenario {
  id: number;
  emoji: string;
  sitKey: string;
  goodKey: string;
  notKey: string;
}

/** 12 everyday honesty situations — no shame, gentle encouragement only. */
const SCENARIOS: Scenario[] = [
  { id: 1, emoji: "🏺", sitKey: "hnSit1", goodKey: "hnGood1", notKey: "hnNot1" },
  { id: 2, emoji: "📒", sitKey: "hnSit2", goodKey: "hnGood2", notKey: "hnNot2" },
  { id: 3, emoji: "🍫", sitKey: "hnSit3", goodKey: "hnGood3", notKey: "hnNot3" },
  { id: 4, emoji: "🖍️", sitKey: "hnSit4", goodKey: "hnGood4", notKey: "hnNot4" },
  { id: 5, emoji: "⏰", sitKey: "hnSit5", goodKey: "hnGood5", notKey: "hnNot5" },
  { id: 6, emoji: "🎨", sitKey: "hnSit6", goodKey: "hnGood6", notKey: "hnNot6" },
  { id: 7, emoji: "💡", sitKey: "hnSit7", goodKey: "hnGood7", notKey: "hnNot7" },
  { id: 8, emoji: "🥛", sitKey: "hnSit8", goodKey: "hnGood8", notKey: "hnNot8" },
  { id: 9, emoji: "📱", sitKey: "hnSit9", goodKey: "hnGood9", notKey: "hnNot9" },
  { id: 10, emoji: "🧦", sitKey: "hnSit10", goodKey: "hnGood10", notKey: "hnNot10" },
  { id: 11, emoji: "🪙", sitKey: "hnSit11", goodKey: "hnGood11", notKey: "hnNot11" },
  { id: 12, emoji: "🧹", sitKey: "hnSit12", goodKey: "hnGood12", notKey: "hnNot12" },
];

/** Static i18n keys so the audit scanner sees every literal. */
const SIT_KEY = (id: number): string => `hnSit${id}`;
const GOOD_KEY = (id: number): string => `hnGood${id}`;
const NOT_KEY = (id: number): string => `hnNot${id}`;

const PRAISE_KEYS = ["hnPraise1", "hnPraise2", "hnPraise3", "hnPraise4"];

function queueSize(level: number): number {
  return LEVELS[Math.min(level, LEVELS.length - 1)];
}

/**
 * Truth star (#215). A band-2 values game choosing the TRUTHFUL response in
 * everyday situations. Same gentle philosophy as Kind Heart — honest choices
 * are celebrated (star burst + spoken praise); untruthful taps get only a soft
 * "try telling the truth" pulse, never a penalty or shame. 12 scenarios.
 */
export class TruthScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private queue: Scenario[] = [];
  private qIdx = 0;
  private wrongs = 0;
  private locked = false;
  private scenario!: Scenario;
  private praiseIdx = 0;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private emojiText!: Phaser.GameObjects.Text;
  private sitText!: Phaser.GameObjects.Text;
  private goodBtn!: Phaser.GameObjects.Container;
  private notBtn!: Phaser.GameObjects.Container;

  constructor() {
    super("Truth");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "forest");
    this.titleText = this.add
      .text(0, 0, t("titleTruth"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.emojiText = this.add.text(0, 0, "", txt(72, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.sitText = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 360 }))
      .setOrigin(0.5);

    this.goodBtn = modernCardButton(this, 0, 0, 160, 104, "", BTN_CORRECT, 18, 138);
    this.goodBtn.on("pointerdown", () => this.answer(true));
    this.notBtn = modernCardButton(this, 0, 0, 160, 104, "", BTN_NEUTRAL, 18, 138);
    this.notBtn.on("pointerdown", () => this.answer(false));

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.emojiText.setPosition(width / 2, height * 0.26);
    this.sitText.setPosition(width / 2, height * 0.4);
    this.sitText.setWordWrapWidth(Math.max(220, width - 50));
    this.goodBtn.setPosition(width / 2 - 88, height * 0.66);
    this.notBtn.setPosition(width / 2 + 88, height * 0.66);
  }

  private startRound() {
    this.shuffleQueue();
    this.qIdx = 0;
    this.wrongs = 0;
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.showScenario();
  }

  /** Every round shuffles all 12 scenarios so kids meet all of them. */
  private shuffleQueue() {
    this.queue = [...SCENARIOS].sort(() => Math.random() - 0.5);
  }

  private showScenario() {
    this.scenario = this.queue[this.qIdx];
    this.locked = false;
    this.emojiText.setText(this.scenario.emoji);
    this.sitText.setText(t(SIT_KEY(this.scenario.id)));
    const good = this.goodBtn.getData("nv-btn") as { setLabel: (s: string) => void } | undefined;
    const not = this.notBtn.getData("nv-btn") as { setLabel: (s: string) => void } | undefined;
    good?.setLabel(t(GOOD_KEY(this.scenario.id)));
    not?.setLabel(t(NOT_KEY(this.scenario.id)));
    speak(t(SIT_KEY(this.scenario.id)), { lang: getAppLang() === "bn" ? "bn" : "en" });
  }

  private answer(truthful: boolean) {
    if (this.locked) return;
    if (truthful) {
      this.locked = true;
      pop();
      win();
      this.praiseIdx = (this.praiseIdx + 1) % PRAISE_KEYS.length;
      const praise = t(PRAISE_KEYS[this.praiseIdx]);
      this.floatMsg(`${t("hnGreat")}  ${praise}`, 0x4ade80);
      speak(praise, { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.starBurst();
      this.time.delayedCall(1300, () => {
        this.qIdx++;
        if (this.qIdx < this.queue.length) this.showScenario();
        else this.finishRound();
      });
    } else {
      this.wrongs++;
      bad();
      speak(t("hnTruth"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.floatMsg(t("hnTruth"), 0xf87171);
      // gently pulse the TRUTHFUL button so the kid still sees the honest way
      this.tweens.add({ targets: this.goodBtn, scaleX: 1.1, scaleY: 1.1, duration: 300, yoyo: true, ease: "Sine.easeInOut" });
    }
  }

  /** A little burst of stars celebrating the truthful choice. */
  private starBurst() {
    const { width, height } = this.scale;
    for (let i = 0; i < 6; i++) {
      const s = this.add
        .text(width / 2, height * 0.5, i % 2 === 0 ? "⭐" : "✨", txt(26, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(40);
      this.tweens.add({
        targets: s,
        x: width / 2 + (i % 2 === 0 ? -1 : 1) * (40 + i * 22),
        y: height * 0.5 - 30 - i * 18,
        alpha: 0,
        duration: 900 + i * 60,
        ease: "Sine.easeOut",
        onComplete: () => s.destroy(),
      });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t("hnDone")}  ${digit(this.queue.length)}/${digit(this.queue.length)}`, 0xffd166);
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
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.52, text, txt(26, "#ffffff", { bold: true, outline: true, wrap: 320 }))
      .setColor(color === 0xffd166 ? NV_GOLD : color === 0x4ade80 ? NV_GREEN : NV_RED)
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }
}

function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

const BN_D = "০১২৩৪৫৬৭৮৯";

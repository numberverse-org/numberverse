import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_CORRECT, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";

const LEVELS = GAMES.find((g) => g.id === "game-kindness")?.difficultyLevels ?? [2, 2, 3, 3, 4, 4];
const ROUNDS_TO_FINISH = 3;

interface Scenario {
  id: number;
  emoji: string;
  sitKey: string;
  goodKey: string;
  notKey: string;
}

/** 12 everyday kindness scenarios — gentle, non-religious, Bangladesh-friendly. */
const SCENARIOS: Scenario[] = [
  { id: 1, emoji: "🖍️", sitKey: "kdSit1", goodKey: "kdGood1", notKey: "kdNot1" },
  { id: 2, emoji: "👧", sitKey: "kdSit2", goodKey: "kdGood2", notKey: "kdNot2" },
  { id: 3, emoji: "🍪", sitKey: "kdSit3", goodKey: "kdGood3", notKey: "kdNot3" },
  { id: 4, emoji: "🎈", sitKey: "kdSit4", goodKey: "kdGood4", notKey: "kdNot4" },
  { id: 5, emoji: "🥣", sitKey: "kdSit5", goodKey: "kdGood5", notKey: "kdNot5" },
  { id: 6, emoji: "🚌", sitKey: "kdSit6", goodKey: "kdGood6", notKey: "kdNot6" },
  { id: 7, emoji: "🧸", sitKey: "kdSit7", goodKey: "kdGood7", notKey: "kdNot7" },
  { id: 8, emoji: "🎨", sitKey: "kdSit8", goodKey: "kdGood8", notKey: "kdNot8" },
  { id: 9, emoji: "🥭", sitKey: "kdSit9", goodKey: "kdGood9", notKey: "kdNot9" },
  { id: 10, emoji: "📚", sitKey: "kdSit10", goodKey: "kdGood10", notKey: "kdNot10" },
  { id: 11, emoji: "💧", sitKey: "kdSit11", goodKey: "kdGood11", notKey: "kdNot11" },
  { id: 12, emoji: "🐕", sitKey: "kdSit12", goodKey: "kdGood12", notKey: "kdNot12" },
];

/** Static i18n keys so the audit scanner sees every literal. */
const SIT_KEY = (id: number): string => `kdSit${id}`;
const GOOD_KEY = (id: number): string => `kdGood${id}`;
const NOT_KEY = (id: number): string => `kdNot${id}`;

const PRAISE_KEYS = ["kdPraise1", "kdPraise2", "kdPraise3", "kdPraise4"];

function queueSize(level: number): number {
  return LEVELS[Math.min(level, LEVELS.length - 1)];
}

/**
 * Kind heart (#214). A band-1 values game choosing kind responses in everyday
 * situations. A scenario (emoji + spoken situation) appears with two choices —
 * a green kind response and a neutral unkind one. Tapping the KIND choice
 * CELEBRATES it: pop + sparkle hearts + spoken praise. Tapping the unkind
 * choice is never punished — just a gentle "try the kind way" and the green
 * choice pulses so the kid still sees what kindness looks like. 12 scenarios.
 */
export class KindnessScene extends Phaser.Scene {
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
    super("Kindness");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleKind"), txt(34, "#ffffff", { bold: true }))
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

    onSceneResize(this, () => this.layout());
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

  private answer(kind: boolean) {
    if (this.locked) return;
    if (kind) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.praiseIdx = (this.praiseIdx + 1) % PRAISE_KEYS.length;
      const praise = t(PRAISE_KEYS[this.praiseIdx]);
      this.floatMsg(`${t("kdGreat")}  ${praise}`, 0x4ade80);
      speak(praise, { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.heartBurst();
      this.time.delayedCall(1300, () => {
        this.qIdx++;
        if (this.qIdx < this.queue.length) this.showScenario();
        else this.finishRound();
      });
    } else {
      this.wrongs++;
      bad();
      speak(t("kdGentle"), { lang: getAppLang() === "bn" ? "bn" : "en" });
      this.floatMsg(t("kdGentle"), 0xf87171);
      // gently pulse the KIND button so the kid sees the kind way
      this.tweens.add({ targets: this.goodBtn, scaleX: 1.1, scaleY: 1.1, duration: 300, yoyo: true, ease: "Sine.easeInOut" });
    }
  }

  /** A little burst of hearts celebrating the kind choice. */
  private heartBurst() {
    const { width, height } = this.scale;
    for (let i = 0; i < 6; i++) {
      const h = this.add
        .text(width / 2, height * 0.5, "❤️", txt(26, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(40);
      this.tweens.add({
        targets: h,
        x: width / 2 + (i % 2 === 0 ? -1 : 1) * (40 + i * 22),
        y: height * 0.5 - 30 - i * 18,
        alpha: 0,
        duration: 900 + i * 60,
        ease: "Sine.easeOut",
        onComplete: () => h.destroy(),
      });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t("kdDone")}  ${digit(this.queue.length)}/${digit(this.queue.length)}`, 0xffd166);
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
    floatText(this, this.scale.width / 2, this.scale.height * 0.52, text, `#${color.toString(16).padStart(6, "0")}`, 26, -24);
  }
}



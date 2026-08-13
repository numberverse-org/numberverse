import Phaser from "phaser";
import { t } from "./i18n";
import { getAppLang } from "./locale";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, BTN_PRIMARY, BTN_ORANGE, roundMeter, type RoundMeterApi } from "./ui";
import { answerRow } from "./layout";
import { SAB } from "./safeArea";

const POOL_SIZES = GAMES.find((g) => g.id === "game-sinkfloat")?.difficultyLevels ?? [8, 8, 12, 12, 16, 16];
/** Skill seed for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-sinkfloat")?.skillId ?? "science-sink-float";
const ROUNDS_TO_FINISH = 3;
const BUTTON_RADIUS = 56;

interface SinkObj {
  emoji: string;
  en: string;
  bn: string;
  /** true = sinks, false = floats (physically accurate). */
  sink: boolean;
}

/* 16 real-world objects (#231 "15+ objects"), ordered obvious → tricky. The
 * pool grows with level (difficultyLevels = pool size). Word pairs are inline
 * EN/BN like hintWrong — emoji is the language-neutral label. */
const OBJECTS: SinkObj[] = [
  { emoji: "🦆", en: "duck", bn: "হাঁস", sink: false },
  { emoji: "🍃", en: "leaf", bn: "পাতা", sink: false },
  { emoji: "🪨", en: "rock", bn: "পাথর", sink: true },
  { emoji: "🔑", en: "key", bn: "চাবি", sink: true },
  { emoji: "⛵", en: "boat", bn: "নৌকা", sink: false },
  { emoji: "🧱", en: "brick", bn: "ইট", sink: true },
  { emoji: "🎈", en: "balloon", bn: "বেলুন", sink: false },
  { emoji: "🪙", en: "coin", bn: "মুদ্রা", sink: true },
  { emoji: "🪶", en: "feather", bn: "পালক", sink: false },
  { emoji: "🧊", en: "ice cube", bn: "বরফ", sink: false },
  { emoji: "🍎", en: "apple", bn: "আপেল", sink: true },
  { emoji: "🥄", en: "spoon", bn: "চামচ", sink: true },
  { emoji: "🛶", en: "canoe", bn: "ক্যানো", sink: false },
  { emoji: "🚗", en: "toy car", bn: "খেলনা গাড়ি", sink: true },
  { emoji: "🪵", en: "log", bn: "কাঠ", sink: false },
  { emoji: "📱", en: "phone", bn: "মোবাইল", sink: true },
];

/**
 * Sink or Float — predict, then watch the check.
 * Band 2 (ages 4–6, science). The kid sees an object over a water tank and
 * PREDICTS sink vs float; the reveal always shows the object's TRUE behavior
 * (drops to the bottom or bobs at the surface) — so a wrong guess still teaches.
 */
export class SinkFloatScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private obj!: SinkObj;
  private buttons: { sprite: Phaser.GameObjects.Container; sink: boolean }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private objSprite!: Phaser.GameObjects.Text;
  private tank!: Phaser.GameObjects.Graphics;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("SinkFloat");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "ocean");
    this.titleText = this.add
      .text(0, 0, t("titleSinkFloat"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.objSprite = this.add
      .text(0, 0, "", txt(64, "#ffffff", { align: "center" }))
      .setOrigin(0.5)
      .setDepth(100);
    this.tank = this.add.graphics();
    this.meter = roundMeter(this);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height * 0.24);
    this.drawTank();
    if (this.obj) this.objSprite.setPosition(width / 2, this.dropY);
  }

  private get tankW() {
    return Math.min(this.scale.width * 0.7, 340);
  }

  private get waterlineY() {
    return this.scale.height * 0.58;
  }

  private get bottomY() {
    return this.scale.height * 0.80;
  }

  private get dropY() {
    return this.scale.height * 0.42;
  }

  private get answersY() {
    return this.scale.height - 100 - SAB();
  }

  private drawTank() {
    const g = this.tank.clear();
    const cx = this.scale.width / 2;
    const half = this.tankW / 2;
    const top = this.scale.height * 0.34;
    const wl = this.waterlineY;
    const bot = this.bottomY;
    // water
    g.fillStyle(0x3aa6d6, 1);
    g.fillRoundedRect(cx - half, wl, this.tankW, bot - wl, 10);
    // tank glass outline
    g.lineStyle(4, 0xffffff, 0.95);
    g.strokeRoundedRect(cx - half, top, this.tankW, bot - top, 12);
    // water surface line
    g.lineStyle(3, 0xbfe8ff, 0.9);
    g.lineBetween(cx - half + 8, wl, cx + half - 8, wl);
  }

  private poolSize() {
    return POOL_SIZES[Math.min(this.levelIndex, POOL_SIZES.length - 1)];
  }

  private startRound() {
    this.clearButtons();
    this.tweens.killTweensOf(this.objSprite);
    const pool = OBJECTS.slice(0, this.poolSize());
    this.obj = pool[Math.floor(Math.random() * pool.length)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.prompt.set(t("willItSink", { w: this.obj.emoji }));
    const bn = getAppLang() === "bn";
    speak(t("sinkFloatSpeak", { w: bn ? this.obj.bn : this.obj.en }), { lang: bn ? "bn" : "en" });
    this.objSprite.setText(this.obj.emoji);
    this.objSprite.setPosition(this.scale.width / 2, this.dropY);
    this.objSprite.setAlpha(1).setScale(1);
    this.spawnButtons();
  }

  private spawnButtons() {
    const { y, xFor } = answerRow(this, 2, BUTTON_RADIUS, 20);
    const opts = [
      { label: t("sink"), sink: true, color: BTN_PRIMARY },
      { label: t("float"), sink: false, color: BTN_ORANGE },
    ];
    opts.forEach((o, i) => {
      const c = modernAnswerButton(this, xFor(i), y, BUTTON_RADIUS, o.label, o.color, { labelSize: 28 });
      c.on("pointerdown", () => this.reveal(c, o.sink));
      this.buttons.push({ sprite: c, sink: o.sink });
    });
  }

  /** PREDICT-THEN-CHECK: any tap reveals the object's TRUE behavior. */
  private reveal(container: Phaser.GameObjects.Container, predicted: boolean) {
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    const correct = predicted === this.obj.sink;
    const targetY = this.obj.sink ? this.bottomY + 18 : this.waterlineY;
    if (correct) {
      pop();
      correctButton(container);
    } else {
      bad();
    }
    this.tweens.add({
      targets: this.objSprite,
      y: targetY,
      duration: this.obj.sink ? 750 : 520,
      ease: this.obj.sink ? "Quad.easeIn" : "Bounce.easeOut",
      onComplete: () => {
        if (!this.obj.sink) this.bob();
        const key = this.obj.sink
          ? correct ? "itSank" : "itSankWrong"
          : correct ? "itFloats" : "itFloatsWrong";
        this.prompt.set(t(key));
        const bn = getAppLang() === "bn";
        speak(t(this.obj.sink ? "itSankSpeak" : "itFloatsSpeak"), { lang: bn ? "bn" : "en" });
        if (correct) this.sparkle(container.x, container.y);
        const ms = Math.max(1, this.time.now - this.startedAt);
        win();
        this.roundsDone++;
        this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
        this.onRoundDone?.(correct, ms, this.levelIndex + 1);
        this.time.delayedCall(950, () => {
          if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
          this.levelIndex++;
          this.startRound();
        });
      },
    });
  }

  /** A gentle bob at the waterline — the check for "float". */
  private bob() {
    this.tweens.add({
      targets: this.objSprite,
      y: this.waterlineY - 6,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 16; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, Phaser.Display.Color.GetColor(
        Phaser.Math.Between(80, 255),
        Phaser.Math.Between(80, 255),
        Phaser.Math.Between(80, 255)
      ));
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

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
  }
}

import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_CORRECT, BTN_RED, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-yesno")?.difficultyLevels ?? [0, 0, 0, 0, 0, 0];
const ROUNDS_TO_FINISH = 3;

/** One yes/no listening item: spoken statement + spoken question. */
interface YNItem {
  s: string;
  q: string;
  a: boolean; // true → YES
}
/** 22 items (done-when ≥20) — clearly yes or clearly no for a band-1 kid. */
const ITEMS: YNItem[] = [
  { s: "The sky is blue.", q: "Is the sky blue?", a: true },
  { s: "Cats can fly.", q: "Can cats fly?", a: false },
  { s: "Fish live in water.", q: "Do fish live in water?", a: true },
  { s: "A dog has four legs.", q: "Does a dog have four legs?", a: true },
  { s: "Snow is hot.", q: "Is snow hot?", a: false },
  { s: "The sun rises in the morning.", q: "Does the sun rise in the morning?", a: true },
  { s: "Elephants are tiny.", q: "Are elephants tiny?", a: false },
  { s: "We sleep at night.", q: "Do we sleep at night?", a: true },
  { s: "A fish can walk on land.", q: "Can a fish walk on land?", a: false },
  { s: "Milk is white.", q: "Is milk white?", a: true },
  { s: "Pigs can fly.", q: "Can pigs fly?", a: false },
  { s: "The moon is a star.", q: "Is the moon a star?", a: false },
  { s: "We read books.", q: "Do we read books?", a: true },
  { s: "Bananas are yellow.", q: "Are bananas yellow?", a: true },
  { s: "A cow says meow.", q: "Does a cow say meow?", a: false },
  { s: "Water is wet.", q: "Is water wet?", a: true },
  { s: "Rocks can talk.", q: "Can rocks talk?", a: false },
  { s: "The sun is very far away.", q: "Is the sun very far away?", a: true },
  { s: "A mouse is bigger than an elephant.", q: "Is a mouse bigger than an elephant?", a: false },
  { s: "We use our eyes to see.", q: "Do we use our eyes to see?", a: true },
  { s: "Birds swim under the sea.", q: "Do birds swim under the sea?", a: false },
  { s: "Chocolate is sweet.", q: "Is chocolate sweet?", a: true },
];

/**
 * Yes/no listening comprehension (#187).
 * Band 1: hear a statement + a question; tap ✅ YES or ❌ NO. A 🐢 button
 * replays the line slowly (rate 0.7). 22 questions, yes and no balanced.
 */
export class YesNoScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private item!: YNItem;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private lineText!: Phaser.GameObjects.Text;
  private qText!: Phaser.GameObjects.Text;
  private slowBtn!: Phaser.GameObjects.Container;
  private yesBtn!: Phaser.GameObjects.Container;
  private noBtn!: Phaser.GameObjects.Container;
  /** Spoken one-time intro telling the child what the 🐢 button does (#1240). */
  private turtleHinted = false;

  constructor() {
    super("YesNo");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleYesNo"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.lineText = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, wrap: 360 }))
      .setOrigin(0.5);
    this.qText = this.add
      .text(0, 0, "", txt(24, NV_GOLD, { bold: true, wrap: 340 }))
      .setOrigin(0.5);

    // #1240 — a bare turtle is not obviously a "play it again" control; the
    // 🔁 glyph turns it into a visible REPLAY button.
    this.slowBtn = modernCardButton(this, 0, 0, 118, 64, "🐢🔁", BTN_NEUTRAL, 26);
    this.slowBtn.on("pointerdown", () => this.speakLine(0.7));
    this.yesBtn = modernCardButton(this, 0, 0, 150, 96, `✅ ${t("ynYes")}`, BTN_CORRECT, 30);
    this.yesBtn.on("pointerdown", () => this.answer(true));
    this.noBtn = modernCardButton(this, 0, 0, 150, 96, `❌ ${t("ynNo")}`, BTN_RED, 30);
    this.noBtn.on("pointerdown", () => this.answer(false));

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.lineText.setPosition(width / 2, height * 0.24);
    this.lineText.setWordWrapWidth(Math.max(180, width - 40));
    this.qText.setPosition(width / 2, height * 0.36);
    this.qText.setWordWrapWidth(Math.max(160, width - 60));
    this.slowBtn.setPosition(width / 2, height * 0.5);
    this.yesBtn.setPosition(width / 2 - 90, height * 0.68);
    this.noBtn.setPosition(width / 2 + 90, height * 0.68);
  }

  private startRound() {
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);

    let item = ITEMS[Phaser.Math.Between(0, ITEMS.length - 1)];
    if (item === this.item) item = ITEMS[(ITEMS.indexOf(item) + 1) % ITEMS.length];
    this.item = item;
    this.lineText.setText(item.s);
    this.qText.setText(item.q);
    this.speakLine(1);
    // #1240 — one-time intro explaining the 🐢 replay button, QUEUED after the
    // first question so it never interrupts it.
    if (!this.turtleHinted) {
      this.turtleHinted = true;
      speak(t("ynTurtleHint"), { lang: getAppLang() === "bn" ? "bn" : "en", cancel: false });
    }
  }

  private speakLine(rate: number) {
    speak(`${this.item.s} ${this.item.q}`, { lang: "en", rate });
  }

  private answer(v: boolean) {
    if (this.locked) return;
    if (v === this.item.a) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.floatMsg(t("ynGreat"));
      this.time.delayedCall(250, () =>
        speak(v ? `Yes, ${this.item.s.toLowerCase().replace(/\.$/, "")}!` : `No, ${this.item.s.toLowerCase().replace(/\.$/, "")}!`, { lang: "en" })
      );
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.roundsDone++;
      this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
      this.onRoundDone?.(true, ms, this.levelIndex + 1);
      this.time.delayedCall(1400, () => {
        if (this.roundsDone >= ROUNDS_TO_FINISH) this.floatMsg(t("ynDone"));
        if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
        this.levelIndex++;
        this.startRound();
      });
      return;
    }
    hintWrong(this, v ? this.yesBtn : this.noBtn, {
      hint: () => `Listen again: "${this.item.s}" — so the answer is ${this.item.a ? "YES" : "NO"}`,
      hintBn: () => `আবার শোনো: "${this.item.s}" — তাই উত্তর ${this.item.a ? "হ্যাঁ" : "না"}`,
      correct: () => (this.item.a ? "YES" : "NO"),
      options: () => [
        { sprite: this.yesBtn, value: "YES" },
        { sprite: this.noBtn, value: "NO" },
      ].filter((o) => o.sprite !== (v ? this.yesBtn : this.noBtn)),
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.5, text, txt(28, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }
}

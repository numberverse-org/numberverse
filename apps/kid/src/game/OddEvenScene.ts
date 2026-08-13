import Phaser from "phaser";
import { t } from "./i18n";
import { getAppLang } from "./locale";
import { frameText } from "./framing";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, BTN_PRIMARY, BTN_ORANGE, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { answerRow } from "./layout";

const BN_D = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
/** Bangla kids read ৫০; English kids 50 — same numeral, local digits. */
function bdDigits(s: string | number): string {
  return getAppLang() === "bn" ? String(s).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(s);
}

const LEVELS = GAMES.find((g) => g.id === "game-oddeven")?.difficultyLevels ?? [10, 20, 30, 50, 80, 100];
/** Skill seed for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-oddeven")?.skillId ?? "odd-even";
const ROUNDS_TO_FINISH = 3;
const BUTTON_RADIUS = 58;
/** How many dots the pair-aid shows at most. Beyond that the big numeral is
 *  the question and the strip is a representative pairing pattern (same
 *  parity, so the lone-dot lesson never lies). */
const PAIR_CAP = 20;

/**
 * Odd & Even — "Is this number odd or even?"
 * Band 2 (ages 4–6). Shows a number (1..difficulty max) as dots in pairs:
 * even = every dot has a partner; odd = one dot is left alone. The kid taps
 * Odd 🦉 / Even 🥚. Difficulty = how big the number can get (level → max).
 */
export class OddEvenScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private shown = 0;
  private answerEven = false;
  private buttons: { sprite: Phaser.GameObjects.Container; value: string; even: boolean }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private meter!: RoundMeterApi;
  private shownText!: Phaser.GameObjects.Text;
  private pairBox!: Phaser.GameObjects.Container;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("OddEven");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleOddEven"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(frameText("oddEvenPrompt", SKILL_ID, 0));
    this.shownText = this.add
      .text(0, 0, "", txt(64, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5);
    this.pairBox = this.add.container(0, 0);
    this.meter = roundMeter(this);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "floral");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height * 0.26);
    this.shownText.setPosition(width / 2, height * 0.38);
    this.pairBox.setPosition(width / 2, height * 0.56);
  }

  private get answersY() {
    return this.scale.height * 0.8;
  }

  private startRound() {
    this.clearButtons();
    this.pairBox.removeAll(true);
    const max = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    // Early levels stay small so the pair grid is readable; later levels open
    // up to the full 0-100 range (the numeral carries the big ones).
    const hi = this.levelIndex < 2 ? Math.min(9, max) : max;
    this.shown = Phaser.Math.Between(1, Math.max(1, hi));
    this.answerEven = this.shown % 2 === 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.prompt.set(frameText("oddEvenPrompt", SKILL_ID, this.levelIndex));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.shownText.setText(bdDigits(this.shown));
    this.drawPairs();
    this.spawnButtons();
  }

  /** Pair-aid: 2-column dots. Even → every dot has a partner; odd → the last
   *  dot is a lone leftover (highlighted). Representative for n > PAIR_CAP. */
  private drawPairs() {
    const cap = Math.min(this.shown, PAIR_CAP);
    const dots = this.shown > PAIR_CAP ? cap - (cap % 2) + (this.shown % 2) : cap;
    const spacing = dots <= 10 ? 26 : 18;
    const dotR = dots <= 10 ? 9 : 7;
    const rows = Math.ceil(dots / 2);
    const lone = this.shown % 2 === 1;
    for (let i = 0; i < dots; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = (col - 0.5) * spacing;
      const y = (row - (rows - 1) / 2) * spacing;
      const isLone = lone && i === dots - 1;
      const c = this.add.circle(x, y, dotR, isLone ? 0xffb35c : 0x6ee7ff);
      c.setStrokeStyle(2, isLone ? 0xff8a00 : 0x2f7fd6);
      this.pairBox.add(c);
    }
  }

  private spawnButtons() {
    const { y, xFor } = answerRow(this, 2, BUTTON_RADIUS, 16);
    const opts = [
      { label: t("odd"), even: false },
      { label: t("even"), even: true },
    ].sort(() => Math.random() - 0.5);
    opts.forEach((o, i) => {
      const c = modernAnswerButton(this, xFor(i), y, BUTTON_RADIUS, o.label, o.even ? BTN_PRIMARY : BTN_ORANGE, { labelSize: 28 });
      c.on("pointerdown", () => this.tap(c, o.even));
      this.buttons.push({ sprite: c, value: o.label, even: o.even });
    });
  }

  private tap(container: Phaser.GameObjects.Container, even: boolean) {
    if (even !== this.answerEven) {
      hintWrong(this, container, {
        hint: () => "Count the pairs — is one left alone?",
        hintBn: () => "জোড়া গোনো — একটা কি ফেলে রাখা হয়েছে?",
        correct: () => (this.answerEven ? t("even") : t("odd")),
        options: () => this.buttons,
      });
      return;
    }
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.shown);
    this.time.delayedCall(800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
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
}

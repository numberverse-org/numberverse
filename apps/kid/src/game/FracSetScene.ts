import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_CORRECT, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-fracset")?.difficultyLevels ?? [3, 4, 5, 5, 6, 6];
const ROUNDS_TO_FINISH = 3;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ১ ২ ৩, English kids 1 2 3. */
function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

interface Item {
  c: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  selected: boolean;
}

/**
 * Fractions — parts of a set (#196).
 * Band 2/3: a group of fruits (all identical) is shown; the kid TAPS the correct
 * subset (e.g. 1/2 of 8 → tap 4 apples). Tapped fruits get a green ring; tap
 * again to deselect. ✅ checks the count; correct speaks the count and floats
 * "1/2 of 8 = 4".
 */
export class FracSetScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private den = 2;
  private num = 1;
  private groupSize = 0;
  private target = 0;
  private items: Item[] = [];
  private checkBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;

  constructor() {
    super("FracSet");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleFracSet"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 360 }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.checkBtn = modernCardButton(this, 0, 0, 150, 74, "✅", BTN_CORRECT, 30);
    this.checkBtn.on("pointerdown", () => this.checkAnswer());

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.16);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.tallyText.setPosition(width / 2, height * 0.26);
    this.checkBtn.setPosition(width / 2, height - 60 - SAB());
    if (this.items.length === 0) this.buildGroup();
  }

  private startRound() {
    this.clearGroup();
    this.locked = false;
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.qIndex = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearGroup();
    this.locked = false;
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    const dens = lvl < 2 ? [2] : lvl < 4 ? [2, 3] : [2, 3, 4];
    this.den = dens[Phaser.Math.Between(0, dens.length - 1)];
    const mult = Phaser.Math.Between(2, 4);
    this.groupSize = this.den * mult; // total items in the group
    this.num = Phaser.Math.Between(1, this.den - 1);
    this.target = (this.num * this.groupSize) / this.den;
    this.prompt.setText(t("fsTap", { n: digit(this.num), d: digit(this.den), g: digit(this.groupSize) }));
    this.buildGroup();
    this.layoutItems();
  }

  private buildGroup() {
    this.items.forEach((i) => i.c.destroy());
    this.items = [];
    for (let i = 0; i < this.groupSize; i++) {
      const c = this.add.container(0, 0).setDepth(5);
      const ring = this.add.circle(0, 0, 24, 0x4ade80, 0.9).setVisible(false).setDepth(4);
      const emoji = this.add.text(0, 0, "🍎", txt(30, "#ffffff", {})).setOrigin(0.5).setDepth(5);
      c.add(ring);
      c.add(emoji);
      c.setSize(48, 48);
      c.setInteractive({ useHandCursor: true });
      c.on("pointerdown", () => this.toggleItem(i));
      this.items.push({ c, ring, selected: false });
    }
  }

  private layoutItems() {
    const { width, height } = this.scale;
    const cols = 4;
    const gap = 52;
    const rows = Math.ceil(this.groupSize / cols);
    const x0 = width / 2 - (Math.min(cols, this.groupSize) - 1) * gap / 2;
    const y0 = height * 0.4 - (rows - 1) * gap / 2;
    this.items.forEach((it, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      it.c.setPosition(x0 + c * gap, y0 + r * gap);
    });
  }

  private toggleItem(i: number) {
    if (this.locked) return;
    const it = this.items[i];
    it.selected = !it.selected;
    it.ring.setVisible(it.selected);
    pop();
  }

  private checkAnswer() {
    if (this.locked) return;
    const sel = this.items.filter((i) => i.selected).length;
    if (sel === this.target) {
      this.locked = true;
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.correct++;
      this.items.forEach((i) => {
        if (i.selected) this.tweens.add({ targets: i.c, scale: 1.15, duration: 140, yoyo: true, ease: "Back.easeOut" });
      });
      this.floatMsg(`${t("fsGreat")}  ${digit(this.num)}/${digit(this.den)} of ${digit(this.groupSize)} = ${digit(this.target)}`);
      speak(digit(this.target), { lang: getAppLang() === "bn" ? "bn" : "en" });
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    this.floatMsg(t("fsHint", { c: digit(this.target) }), 0x4ade80);
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.advance(ms);
  }

  private advance(ms: number) {
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.qIndex++;
      this.time.delayedCall(1100, () => this.askQuestion());
      return;
    }
    this.finishRound(ms);
  }

  private finishRound(ms: number) {
    this.floatMsg(`${t("fsDone")}  ${digit(this.correct)}/${digit(this.total)}`);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.correct === this.total, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.3, text, txt(24, `#${color.toString(16).padStart(6, "0")}`, { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1500, onComplete: () => m.destroy() });
  }

  private clearGroup() {
    this.items.forEach((i) => i.c.destroy());
    this.items = [];
  }
}

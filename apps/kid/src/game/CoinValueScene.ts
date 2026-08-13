import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_PRIMARY, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-coinvalues")?.difficultyLevels ?? [8, 8, 12, 12, 20, 20];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
/** ৳ denominations + their Bangla names (spoken) + Bangla numerals printed on coins. */
const DENOMS = [
  { v: 1, bn: "এক টাকা", g: "৳১", r: 34 },
  { v: 2, bn: "দুই টাকা", g: "৳২", r: 40 },
  { v: 5, bn: "পাঁচ টাকা", g: "৳৫", r: 46 },
  { v: 10, bn: "দশ টাকা", g: "৳১০", r: 0 }, // 10 = note (rect)
];
const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const bnNum = (n: number) => String(n).split("").map((c) => BN_DIGITS[Number(c)]).join("");

/**
 * Coin values — টাকার চেনা (#170).
 * Band 2: ৳1/৳2/৳5/৳10. Two alternating games —
 * 1) VALUE RECOGNITION: a coin (Bangla numeral printed, ৳৫) or the ৳10 note is
 *    shown; the kid taps its Western value (৳5). Bangla name spoken.
 * 2) COUNT-TO-TOTAL: a ৳ total is shown; the kid taps coins/notes that add up —
 *    under the total keep tapping, equal wins (speaks "আট টাকা"), over clears
 *    the tray gently. Always solvable (any total is reachable with ৳1s).
 */
export class CoinValueScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private mode: "recognize" | "count" = "recognize";
  private target = 1;
  private traySum = 0;
  private tray: Phaser.GameObjects.Container[] = [];
  private coins: { sprite: Phaser.GameObjects.Container; v: number }[] = [];
  private showCoin!: Phaser.GameObjects.Container;
  private totalText!: Phaser.GameObjects.Text;
  private sumText!: Phaser.GameObjects.Text;
  private trayRow!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("CoinValue");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "sunset");
    this.titleText = this.add
      .text(0, 0, t("titleCoinValue"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.showCoin = this.add.container(0, 0).setDepth(3);
    this.totalText = this.add.text(0, 0, "", txt(52, "#ffffff", { bold: true, outline: true })).setOrigin(0.5).setDepth(3);
    this.sumText = this.add.text(0, 0, "", txt(26, NV_GOLD, { bold: true })).setOrigin(0.5).setDepth(3);
    this.trayRow = this.add.container(0, 0).setDepth(4);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.28);
    this.showCoin.setPosition(width / 2, height * 0.4);
    this.totalText.setPosition(width / 2, height * 0.38);
    this.sumText.setPosition(width / 2, height * 0.52);
    this.trayRow.setPosition(width / 2, height * 0.46);
  }

  private startRound() {
    this.clearCoins();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearCoins();
    this.clearTray();
    this.locked = false;
    this.mode = this.qInRound % 2 === 0 ? "recognize" : "count";
    if (this.mode === "recognize") {
      this.prompt.set(t("cvRecognize"));
      this.totalText.setText("");
      const d = DENOMS[Phaser.Math.Between(0, DENOMS.length - 1)];
      this.target = d.v;
      this.renderCoin(this.showCoin, d, 1);
      this.showCoin.setVisible(true);
      const y = this.scale.height - 150 - SAB();
      const gap = this.scale.width / 5;
      DENOMS.forEach((x, i) => {
        const tile = modernCardButton(this, gap * (i + 1), y, 120, 84, "৳" + x.v, BTN_NEUTRAL, 36);
        tile.on("pointerdown", () => this.answerRecognize(tile, x.v));
        this.coins.push({ sprite: tile, v: x.v });
      });
      this.time.delayedCall(400, () => speak(d.bn, { lang: "bn" }));
    } else {
      this.prompt.set(t("cvCount"));
      this.showCoin.setVisible(false);
      this.totalText.setText("৳" + bnNum(this.pickTotal()));
      this.sumText.setText("০");
      this.trayRow.setVisible(true);
      const y = this.scale.height - 150 - SAB();
      const gap = this.scale.width / 5;
      DENOMS.forEach((x, i) => {
        const tile = modernCardButton(this, gap * (i + 1), y, 120, 84, "৳" + x.v, BTN_PRIMARY, 32);
        tile.on("pointerdown", () => this.addToTray(tile, x.v));
        this.coins.push({ sprite: tile, v: x.v });
      });
      this.time.delayedCall(400, () => speak("৳" + bnNum(this.target), { lang: "bn" }));
    }
  }

  private pickTotal(): number {
    // 3..maxT — every value reachable with ৳1s, comfortably few taps.
    // maxT grows with level (8 → 12 → 20) — the difficulty ladder.
    const maxT = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    let T = Phaser.Math.Between(3, maxT);
    if (T === this.target) T = Math.min(maxT, T + 1);
    this.target = T;
    return T;
  }

  /** Draw a coin (gold disc) or the ৳10 note (green rect) with its Bangla value. */
  private renderCoin(container: Phaser.GameObjects.Container, d: (typeof DENOMS)[number], scale: number) {
    container.removeAll(true);
    const g = this.add.graphics();
    if (d.r > 0) {
      g.fillStyle(0xf2c14e, 1);
      g.fillCircle(0, 0, d.r);
      g.lineStyle(3, 0xb8860b, 1);
      g.strokeCircle(0, 0, d.r);
      g.fillStyle(0x7a5200, 1);
      g.fillCircle(0, 0, 6);
    } else {
      g.fillStyle(0x4caf50, 1);
      g.fillRoundedRect(-46, -26, 92, 52, 8);
      g.lineStyle(2, 0x1b5e20, 1);
      g.strokeRoundedRect(-46, -26, 92, 52, 8);
    }
    container.add(g);
    container.add(this.add.text(0, 0, d.g, txt(d.r > 0 ? Math.max(22, d.r * 0.5) : 28, "#ffffff", { bold: true })).setOrigin(0.5));
    container.setScale(scale);
  }

  private answerRecognize(container: Phaser.GameObjects.Container, v: number) {
    if (this.locked) return;
    if (v === this.target) {
      this.locked = true;
      pop();
      win();
      this.tweens.add({ targets: container, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      const d = DENOMS.find((x) => x.v === this.target)!;
      this.time.delayedCall(200, () => speak(d.bn, { lang: "bn" }));
      this.floatMsg(t("cvGreat"));
      this.qInRound++;
      this.time.delayedCall(950, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      return;
    }
    hintWrong(this, container, {
      hint: () => "Look at the Bangla number on the coin!",
      hintBn: () => "কয়েনের গায়ের বাংলা সংখ্যাটা দেখো!",
      correct: () => this.target,
      options: () => this.coins.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.v })),
    });
  }

  private addToTray(container: Phaser.GameObjects.Container, v: number) {
    if (this.locked) return;
    pop();
    const d = DENOMS.find((x) => x.v === v)!;
    const mini = this.add.container(0, 0);
    this.renderCoin(mini, d, 0.55);
    this.trayRow.add(mini);
    this.tray.push(mini);
    // reflow centered in local coordinates
    this.tray.forEach((c, i) => c.setPosition((i - (this.tray.length - 1) / 2) * 64, 0));
    this.traySum += v;
    this.sumText.setText(bnNum(this.traySum));
    if (this.traySum === this.target) {
      this.locked = true;
      win();
      this.floatMsg(t("cvGreat"));
      this.time.delayedCall(200, () => speak("৳" + bnNum(this.target), { lang: "bn" }));
      this.qInRound++;
      this.time.delayedCall(1000, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
    } else if (this.traySum > this.target) {
      this.floatMsg(t("cvTooMuch"));
      this.tweens.add({
        targets: this.trayRow,
        x: this.scale.width / 2 + 8,
        duration: 60,
        yoyo: true,
        repeat: 5,
        onComplete: () => {
          this.trayRow.x = this.scale.width / 2;
          this.clearTray();
        },
      });
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("cvDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.6, text, txt(28, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearTray() {
    this.trayRow.removeAll(true);
    this.tray = [];
    this.traySum = 0;
    this.sumText.setText("০");
  }
  private clearCoins() {
    this.coins.forEach((o) => o.sprite.destroy());
    this.coins = [];
  }
}

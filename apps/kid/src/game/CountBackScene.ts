import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, ringCorrect, roundMeter, BTN_PRIMARY, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-countback")?.difficultyLevels ?? [10, 20, 30, 40, 60, 100];
const ROUNDS_TO_FINISH = 3;
const START = 100;
const BN_D = "০১২৩৪৫৬৭৮৯";

/** Local digits — Bangla kids see ১০০, English kids 100. */
function num(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

/**
 * Count back from 100 (#49).
 * Band 2 counting: a rocket blasts off by counting DOWN from 100 by ones.
 * Each step shows the current number; the kid taps the NEXT lower number
 * from 4 choices. Every tapped number is spoken aloud. When a level's
 * countdown finishes, the rocket flies off with a countdown cheer.
 */
export class CountBackScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private current = START;
  private target = START - 1;
  private doneThisRound = 0;
  private needThisRound = 10;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private currentText!: Phaser.GameObjects.Text;
  private rocket!: Phaser.GameObjects.Text;
  private rocketY0 = 0;
  private answers: { sprite: Phaser.GameObjects.Container; value: number }[] = [];

  constructor() {
    super("CountBack");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "space");
    this.titleText = this.add
      .text(0, 0, t("titleCountBack"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.currentText = this.add
      .text(0, 0, "", txt(92, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.rocket = this.add
      .text(0, 0, "🚀", txt(52, "#ffffff", { bold: true }))
      .setOrigin(0.5).setDepth(2);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height * 0.16);
    this.currentText.setPosition(width / 2, height * 0.4);
    this.rocketY0 = height * 0.78;
    this.rocket.setPosition(width * 0.88, this.rocketY0);
  }

  private startRound() {
    this.clearRound();
    this.locked = false;
    this.startedAt = this.time.now;
    this.current = START;
    this.doneThisRound = 0;
    this.needThisRound = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.prompt.set(t("countBackPrompt"));
    this.rocket.setPosition(this.scale.width * 0.88, this.rocketY0);
    this.rocket.setScale(1);
    speak(num(this.current), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.currentText.setText(num(this.current));
    this.askStep();
  }

  private askStep() {
    this.clearRound();
    this.locked = false;
    this.target = this.current - 1;

    // 3 distractors near the target, no duplicates, all ≥ 0
    const opts = [this.target];
    const candidates = [this.target + 2, this.target + 1, this.target - 1, this.target - 2, this.target - 3];
    for (const c of candidates) {
      if (opts.length >= 4) break;
      if (c >= 0 && !opts.includes(c)) opts.push(c);
    }
    while (opts.length < 4) {
      const c = Phaser.Math.Between(0, this.target + 2);
      if (!opts.includes(c)) opts.push(c);
    }
    const n = opts.length;
    const gap = this.scale.width / (n + 1);
    const bw = Math.min(120, this.scale.width / (n + 0.5) - 14);
    const by = this.scale.height - 84 - SAB();
    opts.sort(() => Math.random() - 0.5).forEach((value, i) => {
      const c = modernAnswerButton(this, gap * (i + 1), by, bw / 2, num(value), BTN_PRIMARY, { labelSize: 26 });
      c.on("pointerdown", () => this.tap(c, value));
      this.answers.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: number) {
    if (this.locked) return;
    if (value !== this.target) {
      bad();
      hintWrong(this, container, {
        hint: () => `One less than ${num(this.current)}.`,
        hintBn: () => `${num(this.current)}-এর আগের সংখ্যা।`,
        correct: () => num(this.target),
        options: () => this.answers.map((o) => ({ sprite: o.sprite, value: num(o.value) })),
      });
      return;
    }
    this.locked = true;
    pop();
    correctButton(container);
    ringCorrect(this, container);
    this.current = this.target;
    this.doneThisRound++;
    this.currentText.setText(num(this.current));
    speak(num(this.current), { lang: getAppLang() === "bn" ? "bn" : "en" });
    // rocket climbs as the countdown progresses
    const p = this.doneThisRound / this.needThisRound;
    this.rocket.y = this.rocketY0 - p * this.scale.height * 0.34;

    this.time.delayedCall(280, () => {
      if (this.doneThisRound >= this.needThisRound) this.blastOff();
      else this.askStep();
    });
  }

  private blastOff() {
    this.locked = true;
    win();
    this.prompt.set(t("countBackBlast"));
    speak(this.target === 0 ? "Blast off!" : "Blast off!", { lang: "en" });
    this.tweens.add({
      targets: this.rocket,
      y: -80,
      angle: -18,
      scale: 1.4,
      duration: 1100,
      ease: "Back.easeIn",
    });
    this.floatMsg("🚀 " + t("countBackBlast"));
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(1500, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.6, text, txt(30, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 900, onComplete: () => m.destroy() });
  }

  private clearRound() {
    this.answers.forEach((o) => o.sprite.destroy());
    this.answers = [];
  }
}

import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speakMath } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { answerRow } from "./layout";

const LEVELS = GAMES.find((g) => g.id === "game-percent")?.difficultyLevels ?? [10, 20, 25, 50, 100, 150];
const BUTTON_RADIUS = 52;
const ROUNDS_TO_FINISH = 3;
const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure

/**
 * Percent Quest — find X% of a number.
 * Band 5 (ages 10–13). Shows "50% of 8 = ?", kid taps the answer.
 * Level = the percentage (10 → 20 → 25 → 50 → 100).
 */
export class PercentScene extends Phaser.Scene {
  private levels = LEVELS;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private challenge = false; // #1158 — band 6-7 independent mode (timed rounds, no reveal)
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private percent = 50;
  private total = 8;
  private answer = 4;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private factText!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Percent");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; levels?: number[]; challenge?: boolean }) {
    this.onRoundDone = data.onRoundDone;
    // #1170 — per-skill ladder: percent-intro (band 5) → [10,20,25,50,100,150],
    // percent-of-number (band 7) → [25,50,100,150] (no trivial 10%).
    this.levels = data.levels?.length ? data.levels : LEVELS;
    this.levelIndex = data.startLevelIndex ?? 0;
    // #1158 — challenge mode: band 6-7 skills (skill.challenge → App passes it)
    // get a per-round countdown bar and no hint/reveal on wrong.
    this.challenge = !!data.challenge;
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titlePercent"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.factText = this.add
      .text(0, 0, "", txt(46, NV_GOLD, {bold: true, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("findPercent"));
    this.meter = roundMeter(this);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "magic");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.factText.setPosition(width / 2, height * 0.44);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.clearButtons();
    this.percent = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    // pick a total that divides cleanly for the percent. 150% (#1869) needs
    // EVEN totals so 1.5× stays a whole percent — it no longer falls through
    // to the [2,4,6,8] catch-all.
    const denominators: Record<number, number[]> = { 10: [10, 20, 30, 40], 20: [5, 10, 15, 20], 25: [4, 8, 12, 16], 50: [2, 4, 6, 8, 10], 100: [3, 5, 7, 9], 150: [2, 4, 6, 8, 10] };
    const opts = denominators[this.percent];
    if (!opts) {
      // fail loudly — a percent rung with no whole-percent total set is a
      // ladder bug (it would silently ask "X% of 10" with a half answer)
      throw new Error(`[PercentScene] no clean total set for percent ${this.percent}`);
    }
    this.total = Phaser.Math.RND.pick(opts);
    this.answer = (this.percent / 100) * this.total;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.factText.setText(t("pctFact", { p: this.percent, t: this.total }));
    speakMath("pct", this.percent, this.total);
    this.spawnButtons();
    this.armChallenge();
  }

  /** #1158 — challenge-mode countdown: a gold bar drains over CHALLENGE_SECONDS;
   *  time-up records a WRONG round (streak breaks, no coin, block does NOT
   *  advance) and deals the next round. No re-teach, no reveal — the older kid
   *  races the clock, and the combo/coin economy feels the miss. */
  private armChallenge() {
    if (!this.challenge) return;
    if (this.challengeTimer) this.challengeTimer.remove(false);
    this.challengeDone = false;
    const bar = this.challengeBar;
    if (bar) {
      this.tweens.killTweensOf(bar);
      bar.setPosition(20, 122).setSize(Math.min(this.scale.width - 40, 320), 6).setScale(1, 1).setAlpha(1);
      this.tweens.add({ targets: bar, scaleX: 0, duration: CHALLENGE_SECONDS * 1000, ease: "Linear.easeNone" });
    }
    this.challengeTimer = this.time.delayedCall(CHALLENGE_SECONDS * 1000, () => {
      if (this.challengeDone) return;
      this.challengeDone = true;
      // A time-up is a completed (failed) round: the App counts it toward the
      // block (roundsDone), the meter reflects it, and a fresh round deals.
      // No open-wrong is recorded (no tap) so a fully-timed-out block still
      // advances the session — the wrong events make BKT drop the tier.
      this.roundsDone++;
      this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.onRoundDone?.(false, CHALLENGE_SECONDS * 1000, this.levelIndex + 1);
      this.levelIndex++;
      this.startRound();
    });
  }

  private disarmChallenge() {
    if (this.challengeTimer) {
      this.challengeTimer.remove(false);
      this.challengeTimer = undefined;
    }
    if (this.challengeBar) {
      this.tweens.killTweensOf(this.challengeBar);
      this.challengeBar.setAlpha(0);
    }
  }

  private spawnButtons() {
    const opts = new Set<number>([this.answer]);
    // Misconception distractors — percent errors: one tenth/quarter/half off,
    // or confusing the percent with the answer (e.g. 50% of 8 → 8 instead of 4).
    const errs = [
      this.answer + 1,
      this.answer - 1,
      this.total,
      Math.round(this.answer + this.answer * 0.1),
      Math.max(0, Math.round(this.answer - this.answer * 0.1)),
    ];
    for (const e of errs) {
      if (opts.size >= 4) break;
      if (e >= 0 && e <= 150 && e !== this.answer) opts.add(e);
    }
    // fall back to ±neighbors only when the error set is exhausted
    let delta = 1;
    while (opts.size < 4) {
      const cand = this.answer + (delta % 2 === 1 ? -delta : delta);
      if (cand >= 0 && cand <= 150 && cand !== this.answer) opts.add(cand);
      delta++;
    }
    const values = [...opts].sort(() => Math.random() - 0.5);
    const { radius, y, xFor } = answerRow(this, values.length, BUTTON_RADIUS);
    values.forEach((value, i) => {
      const c = modernAnswerButton(this, xFor(i), y, radius, String(value));
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: number) {
    if (value !== this.answer) {
      hintWrong(this, container, {
        hint: "Think of the pie — half is 50%, a quarter is 25%",
        hintBn: "পিঠাটা ভাবো — অর্ধেক ৫০%, চতুর্থাংশ ২৫%",
        correct: () => this.answer,
        options: () => this.buttons,
        challenge: this.challenge, // #1158 — no banner/reveal; solve it yourself
      });
      return;
    }
    this.challengeDone = true; // the round is solved — stop the countdown
    this.disarmChallenge();
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(value === this.answer, ms, this.levelIndex + 1);
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
      const p = this.add.circle(x, y, 3 + Math.random() * 3, this.randomColor());
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

  private randomColor(): number {
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255),
      Phaser.Math.Between(80, 255)
    );
  }
}

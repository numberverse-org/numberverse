import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { getAppLang } from "./locale";
import { t } from "./i18n";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, roundMeter, BTN_PRIMARY, type RoundMeterApi, NV_GOLD } from "./ui";
import { answerRow } from "./layout";

const LEVELS = GAMES.find((g) => g.id === "game-negatives")?.difficultyLevels ?? [1, 2, 3, 4, 5, 6];
const ROUNDS_TO_FINISH = 3;
const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure

const L = (en: string, bn: string) => (getAppLang() === "bn" ? bn : en);

interface Round {
  prompt: string;
  fact: string;
  options: string[];
  correct: string;
  hint: string;
  hintBn: string;
  /** The starting value shown as a dot on the number line (add mode). */
  start?: number;
  /** The destination value — arrow animated on correct (add mode). */
  dest?: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Phaser.Math.Between(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function numLabel(n: number): string {
  return String(n);
}

function numericOptions(correct: number, min = -12): number[] {
  const opts = new Set<number>([correct]);
  let delta = 1;
  let guard = 0;
  while (opts.size < 4 && guard++ < 40) {
    const cand = correct + (delta % 2 === 1 ? -delta : delta);
    if (cand >= min && cand !== correct) opts.add(cand);
    delta++;
  }
  return shuffle([...opts]);
}

/** Negative-number line scene for band 6–7. One scene, two skills:
 *  · neg-compare-order — compare two negatives or pick the correctly ordered
 *    list (the number line is the scaffold, never the reveal);
 *  · neg-number-line-add — add a small negative to a positive (or a positive
 *    to a negative) and read the result from the line. */
export class NegativeNumberScene extends Phaser.Scene {
  private levels = LEVELS;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private challenge = false; // #1158 — band 6-7 independent mode (timed rounds, no reveal)
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private skillId = "";
  private round!: Round;
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private factText!: Phaser.GameObjects.Text;
  private lineG!: Phaser.GameObjects.Graphics;
  private markerG!: Phaser.GameObjects.Graphics;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("NegativeNumber");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; levels?: number[]; challenge?: boolean; skill?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levels = data.levels?.length ? data.levels : LEVELS;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.skillId = data.skill ?? "";
    // #1158 — challenge mode: band 6-7 skills (skill.challenge → App passes it)
    // get a per-round countdown bar and no hint/reveal on wrong.
    this.challenge = !!data.challenge;
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    this.background = this.add.graphics();
    this.lineG = this.add.graphics();
    this.markerG = this.add.graphics();
    gameBackground(this, "space");
    this.titleText = this.add
      .text(0, 0, this.titleForSkill(), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.factText = this.add
      .text(0, 0, "", txt(38, NV_GOLD, { bold: true, outline: true, wrap: 360 }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    onSceneResize(this, () => {
      this.layout();
      this.drawNumberLine();
      this.rebuildLabels();
    });
    this.layout();
    this.drawNumberLine();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.factText.setPosition(width / 2, height * 0.34);
    this.prompt.setPosition(width / 2, height - 150);
  }

  private lineSpec() {
    const { width, height } = this.scale;
    const cy = Math.min(height * 0.62, height - 210);
    const unit = Math.max(9, Math.min(20, (width - 40) / 21));
    const cx = width / 2;
    return { cx, cy, unit };
  }

  private xFor(v: number): number {
    const { cx, unit } = this.lineSpec();
    return cx + v * unit;
  }

  private drawNumberLine() {
    this.lineG.clear();
    const { cx, cy, unit } = this.lineSpec();
    // baseline
    this.lineG.lineStyle(4, 0xffffff, 0.9);
    this.lineG.lineBetween(cx - 10 * unit - 6, cy, cx + 10 * unit + 6, cy);
    for (let v = -10; v <= 10; v++) {
      const x = cx + v * unit;
      this.lineG.lineStyle(2, 0xffffff, v === 0 ? 1 : 0.65);
      this.lineG.lineBetween(x, cy - 6, x, cy + 6);
    }
  }

  /** Text labels are drawn separately (Graphics can't draw glyphs). */
  private lineLabels: Phaser.GameObjects.Text[] = [];

  private rebuildLabels() {
    this.lineLabels.forEach((l) => l.destroy());
    this.lineLabels = [];
    const { cx, cy, unit } = this.lineSpec();
    for (let v = -10; v <= 10; v++) {
      if (v !== 0 && Math.abs(v) % 2 !== 0) continue;
      const x = cx + v * unit;
      const lbl = this.add
        .text(x, cy + 18, numLabel(v), txt(15, v === 0 ? NV_GOLD : "#ffffff", { bold: true, shadow: false }))
        .setOrigin(0.5, 0);
      this.lineLabels.push(lbl);
    }
  }

  private drawMarker(value: number) {
    this.markerG.clear();
    const { cy } = this.lineSpec();
    this.markerG.fillStyle(0x4cc9f0, 1);
    this.markerG.fillCircle(this.xFor(value), cy, 10);
    this.markerG.lineStyle(3, 0xffffff, 0.9);
    this.markerG.strokeCircle(this.xFor(value), cy, 10);
  }

  private drawArrow(from: number, to: number) {
    this.markerG.clear();
    const { cy } = this.lineSpec();
    const x0 = this.xFor(from);
    const x1 = this.xFor(to);
    const dir = Math.sign(x1 - x0) || 1;
    this.markerG.lineStyle(5, 0xffd166, 1);
    this.markerG.lineBetween(x0, cy - 2, x1 - dir * 4, cy - 2);
    this.markerG.fillStyle(0xffd166, 1);
    this.markerG.fillTriangle(x1, cy - 2, x1 - dir * 12, cy - 10, x1 - dir * 12, cy + 6);
    this.markerG.fillCircle(x0, cy, 8);
  }

  private clearMarker() {
    this.markerG.clear();
  }

  private startRound() {
    this.clearButtons();
    this.round = this.buildRound();
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.factText.setText(this.round.fact);
    this.prompt.set(this.round.prompt);
    this.rebuildLabels();
    this.clearMarker();
    if (this.round.start !== undefined) this.drawMarker(this.round.start);
    this.spawnButtons();
    this.armChallenge();
  }

  private titleForSkill(): string {
    if (this.skillId === "neg-number-line-add") return L("Negative number line", "ঋণাত্মক সংখ্যারেখা");
    if (this.skillId === "neg-arith") return L("Negative number arithmetic", "ঋণাত্মক সংখ্যার হিসাব");
    return L("Compare negatives", "ঋণাত্মক সংখ্যা তুলনা");
  }

  private buildRound(): Round {
    if (this.skillId === "neg-number-line-add") return this.addRound();
    if (this.skillId === "neg-arith") return this.arithRound();
    return this.compareOrderRound();
  }

  private compareOrderRound(): Round {
    const level = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    if (level <= 2) {
      const a = Phaser.Math.Between(-9, -2);
      let b = Phaser.Math.Between(-9, -1);
      while (b === a) b = Phaser.Math.Between(-9, -1);
      const greater = Math.max(a, b);
      const lesser = Math.min(a, b);
      const askGreater = level === 1;
      const correct = askGreater ? greater : lesser;
      return {
        prompt: askGreater ? L("Which is greater (warmer)?", "কোনটা বড় (উষ্ণ)?") : L("Which is lesser (colder)?", "কোনটা ছোট (ঠান্ডা)?"),
        fact: `${numLabel(a)}  or  ${numLabel(b)}`,
        options: shuffle([numLabel(a), numLabel(b)]),
        correct: numLabel(correct),
        hint: L("On the number line, right is greater", "সংখ্যারেখায় ডান দিক বড়"),
        hintBn: "সংখ্যারেখায় ডান দিক বড়",
      };
    }
    // order — four lists, only one is sorted least → greatest
    const vals = [Phaser.Math.Between(-8, -4), Phaser.Math.Between(-3, 0), Phaser.Math.Between(1, 5)];
    const sorted = [...vals].sort((x, y) => x - y);
    const correct = sorted.map(numLabel).join(", ");
    const opts = new Set<string>([correct]);
    const wrongOrders = [
      [vals[1], vals[0], vals[2]],
      [vals[2], vals[1], vals[0]],
      [vals[0], vals[2], vals[1]],
      [vals[1], vals[2], vals[0]],
    ];
    for (const w of wrongOrders) {
      if (opts.size >= 4) break;
      const label = w.map(numLabel).join(", ");
      if (label !== correct) opts.add(label);
    }
    return {
      prompt: L("Tap the list ordered least to greatest", "ছোট থেকে বড় ক্রমে সাজানো তালিকাটি বাছো"),
      fact: L("Order the numbers", "সংখ্যাগুলো সাজাও"),
      options: shuffle([...opts]),
      correct,
      hint: L("Least = farthest left on the number line", "সবচেয়ে ছোট = সংখ্যারেখায় সবচেয়ে বামে"),
      hintBn: "সবচেয়ে ছোট = সংখ্যারেখায় সবচেয়ে বামে",
    };
  }

  private addRound(): Round {
    const level = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    let a = 0;
    let b = 0;
    if (level <= 1) {
      a = Phaser.Math.Between(3, 9);
      b = -Phaser.Math.Between(1, 3);
    } else if (level === 2) {
      a = Phaser.Math.Between(4, 10);
      b = -Phaser.Math.Between(2, 5);
    } else {
      a = Phaser.Math.Between(-6, -1);
      b = Phaser.Math.Between(2, 7);
    }
    const correct = a + b;
    return {
      prompt: L("Add on the number line", "সংখ্যারেখায় যোগ করো"),
      fact: `${numLabel(a)} + (${numLabel(b)}) = ?`,
      options: numericOptions(correct).map(String),
      correct: String(correct),
      hint: L("Start at the first number, move right for +, left for −", "প্রথম সংখ্যায় শুরু করো — + মানে ডানে, − মানে বামে"),
      hintBn: "প্রথম সংখ্যায় শুরু করো — + মানে ডানে, − মানে বামে",
      start: a,
      dest: correct,
    };
  }

  /** #1164 — band-8 negative arithmetic: add, subtract and multiply signed
   *  numbers. The number line stays on screen as the scaffold (never the
   *  reveal), and the level ramps the operation. */
  private arithRound(): Round {
    const level = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    let fact = "";
    let correct = 0;
    if (level <= 1) {
      const a = -Phaser.Math.Between(3, 9);
      const b = Phaser.Math.Between(4, 12);
      correct = a + b;
      fact = `${numLabel(a)} + ${numLabel(b)} = ?`;
    } else if (level === 2) {
      const a = Phaser.Math.Between(3, 12);
      const b = -Phaser.Math.Between(2, 7);
      correct = a - b;
      fact = `${numLabel(a)} − (${numLabel(b)}) = ?`;
    } else {
      const a = Phaser.Math.Between(2, 5);
      const b = Phaser.Math.Between(3, 6);
      const negate = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
      correct = negate * a * b;
      fact = `(${negate === -1 ? `−${a}` : a}) × ${b} = ?`;
    }
    return {
      prompt: L("Solve it!", "সমাধান করো!"),
      fact,
      options: numericOptions(correct, -30).map(String),
      correct: String(correct),
      hint: L("Move right for +, left for −; unlike signs multiply to a negative", "+ মানে ডানে, − মানে বামে; বিপরীত চিহ্নের গুণফল ঋণাত্মক"),
      hintBn: "+ মানে ডানে, − মানে বামে; বিপরীত চিহ্নের গুণফল ঋণাত্মক",
    };
  }

  /* ── challenge countdown (same contract as Percent/Decimals) ── */
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
    const { options } = this.round;
    const long = options.some((o) => o.length > 5);
    const { radius, y, xFor } = answerRow(this, options.length, long ? 68 : 58);
    options.forEach((value, i) => {
      const c = modernAnswerButton(this, xFor(i), y, radius, value, BTN_PRIMARY, {
        labelSize: long ? 17 : value.length > 4 ? 22 : 28,
        wrap: long ? Math.round(radius * 2 - 12) : undefined,
      });
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: string) {
    if (value !== this.round.correct) {
      hintWrong(this, container, {
        hint: this.round.hint,
        hintBn: this.round.hintBn,
        correct: () => this.round.correct,
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
    if (this.round.start !== undefined && this.round.dest !== undefined) {
      this.drawArrow(this.round.start, this.round.dest);
    }
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(value === this.round.correct, ms, this.levelIndex + 1);
    this.time.delayedCall(950, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
  }
}

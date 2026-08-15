import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, modernAnswerButton, roundMeter, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { UPPERCASE, LOWERCASE } from "./englishLiteracy";

const LEVELS = GAMES.find((g) => g.id === "game-casematch")?.difficultyLevels ?? [4, 4, 4, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 6;
// #1176 — the case strings come from the shared alphabet module.
const UPPER = UPPERCASE;
const LOWER = LOWERCASE;

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Case match (#56).
 * Band 1 alphabet: see a big uppercase letter, tap its lowercase partner.
 * Every letter name is spoken aloud. 26 pairs, shuffled each round; wrong
 * taps shake gently (no fail state — just try again).
 */
export class CaseMatchScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private targetIdx = 0;
  private options: string[] = [];
  private locked = false;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private promptText!: Phaser.GameObjects.Text;
  private upperText!: Phaser.GameObjects.Text;
  private optionBtns: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("CaseMatch");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleCaseMatch"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.promptText = this.add
      .text(0, 0, t("casePrompt"), txt(26, "#fff8e1", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.upperText = this.add
      .text(0, 0, "", txt(110, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.buildOptions();
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 34);
    this.roundText.setPosition(width / 2, 68);
    this.meter.setPosition(width / 2, 92);
    this.promptText.setPosition(width / 2, height * 0.17);
    this.promptText.setWordWrapWidth(Math.max(220, width - 50));
    this.upperText.setPosition(width / 2, height * 0.38);
    const gap = width / (4 + 1);
    const r = Math.min(56, width / (4 + 0.5) / 2 - 8);
    const y = height * 0.72;
    for (let i = 0; i < 4; i++) this.optionBtns[i]?.setPosition(gap * (i + 1), y);
  }

  private buildOptions() {
    const { width, height } = this.scale;
    for (const b of this.optionBtns) b.destroy(true);
    this.optionBtns = [];
    const gap = width / 5;
    const r = Math.min(56, width / 4.5 / 2 - 8);
    const y = height * 0.72;
    for (let i = 0; i < 4; i++) {
      const b = modernAnswerButton(this, gap * (i + 1), y, r, "", BTN_PRIMARY, { labelSize: 34 });
      b.on("pointerdown", () => this.tap(i));
      this.optionBtns.push(b);
    }
  }

  private startRound() {
    this.roundsDone = 0;
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.ask();
  }

  private ask() {
    this.locked = false;
    // #1051 — LEVELS[levelIndex] is the ACTIVE letter-pool size: A–F first, then
    // A–J, A–P, A–V, then the full 26. A smaller pool means visually distinct
    // letters; the full alphabet brings confusable pairs (b/d, p/q, m/w) in as
    // distractors, so difficulty genuinely rises with the level.
    const pool = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.targetIdx = Phaser.Math.Between(0, pool - 1);
    this.upperText.setText(UPPER[this.targetIdx]);
    this.promptText.setText(t("caseWhich"));
    speak(UPPER[this.targetIdx], { lang: "en" });

    const others = shuffle([...LOWER.slice(0, this.targetIdx), ...LOWER.slice(this.targetIdx + 1, pool)]).slice(0, 3);
    this.options = shuffle([LOWER[this.targetIdx], ...others]);
    for (let i = 0; i < 4; i++) {
      const api = this.optionBtns[i].getData("nv-btn") as { setLabel: (t: string) => void } | undefined;
      api?.setLabel(this.options[i]);
      const face = this.optionBtns[i].list[0] as Phaser.GameObjects.Image;
      face.setTint(0xffffff);
    }
  }

  private tap(i: number) {
    if (this.locked) return;
    if (this.options[i] !== LOWER[this.targetIdx]) {
      bad();
      const face = this.optionBtns[i].list[0] as Phaser.GameObjects.Image;
      face.setTint(0xff6b6b);
      this.time.delayedCall(350, () => face.setTint(0xffffff));
      return;
    }
    this.locked = true;
    pop();
    (this.optionBtns[i].getData("nv-btn") as { setCorrect: () => void } | undefined)?.setCorrect();
    speak(`${UPPER[this.targetIdx]} ... ${LOWER[this.targetIdx]}`, { lang: "en" });
    this.qInRound++;
    this.time.delayedCall(650, () => {
      if (this.qInRound >= QUESTIONS_PER_ROUND) this.finishRound();
      else this.ask();
    });
  }

  private finishRound() {
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(400, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }
}

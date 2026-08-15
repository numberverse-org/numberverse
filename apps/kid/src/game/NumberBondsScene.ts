import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { getAppLang } from "./locale";
import { frameText } from "./framing";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speakMath } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { answerRow } from "./layout";

const GAME_10 = "game-bnbonds";
const GAME_20 = "game-bnbonds20";
const SKILL_10 = "number-bonds-10";
const SKILL_20 = "number-bonds-20";
const ROUNDS_TO_FINISH = 3;
const BUTTON_RADIUS = 52;


/**
 * Number Bonds to 10 / 20 — "How many more to make 10 (or 20)?"
 * Band 2 (ages 4–6). Shows a number on a TEN-FRAME — the filled cells are the
 * shown part, the empty cells ARE the missing addend (the answer). The kid taps
 * how many more make the target. The same scene backs both ladders (#227):
 * bonds to 10 (one ten-frame) and bonds to 20 (double ten-frame).
 * Difficulty = how big the shown number can get (level → max shown).
 */
export class NumberBondsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private shown = 0;
  private answer = 0;
  private target = 10;
  private skillId = SKILL_10;
  private levels: number[] = [4, 5, 6, 8, 10, 12];
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private shownText!: Phaser.GameObjects.Text;
  private frameBox!: Phaser.GameObjects.Container;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("NumberBonds");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; skill?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    // #227 — one scene backs BOTH bonds ladders; the App passes the skill id so
    // the target, ladder, framing seed and header all switch together.
    this.skillId = data.skill === SKILL_20 ? SKILL_20 : SKILL_10;
    this.target = this.skillId === SKILL_20 ? 20 : 10;
    const gameId = this.skillId === SKILL_20 ? GAME_20 : GAME_10;
    this.levels = GAMES.find((g) => g.id === gameId)?.difficultyLevels ?? (this.target === 20 ? [10, 12, 14, 16, 18, 20] : [4, 5, 6, 8, 10, 12]);
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t(this.target === 20 ? "titleNumberBonds20" : "titleNumberBonds"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(frameText("howManyMore", this.skillId, 0));
    this.shownText = this.add
      .text(0, 0, "", txt(72, NV_GOLD, {bold: true, outline: true}))
      .setOrigin(0.5);
    this.frameBox = this.add.container(0, 0);
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
    this.shownText.setPosition(width / 2, height * 0.27);
    this.frameBox.setPosition(width / 2, height * 0.48);
    this.prompt.setPosition(width / 2, height * 0.66);
  }

  private get answersY() {
    return this.scale.height * 0.82;
  }

  private startRound() {
    this.clearButtons();
    this.frameBox.removeAll(true);
    const max = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    this.shown = Phaser.Math.Between(1, Math.min(this.target - 1, max - 1));
    this.answer = this.target - this.shown;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.prompt.set(frameText("howManyMore", this.skillId, this.levelIndex));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.shownText.setText(digit(this.shown));
    speakMath("bonds", this.shown, this.target);
    this.drawTenFrame();
    this.spawnButtons();
  }

  /** Ten-frame aid: rows of 5 cells. Filled = the shown part; empty outlined
   *  cells = the missing addend (the answer). Bonds to 20 = double ten-frame. */
  private drawTenFrame() {
    const cells = this.target;
    const cols = 5;
    const rows = cells / cols;
    const cellR = cells === 10 ? 14 : 11;
    const spacing = cells === 10 ? 34 : 27;
    for (let i = 0; i < cells; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = (col - (cols - 1) / 2) * spacing;
      const y = (row - (rows - 1) / 2) * spacing;
      const filled = i < this.shown;
      const c = this.add.circle(x, y, cellR, filled ? 0x6ee7ff : 0x0b2545);
      c.setStrokeStyle(2, filled ? 0x2f7fd6 : 0xffd166);
      this.frameBox.add(c);
    }
  }

  private spawnButtons() {
    const opts = new Set<number>([this.answer]);
    let delta = 1;
    while (opts.size < 4) {
      const cand = this.answer + (delta % 2 === 1 ? -delta : delta);
      if (cand >= 1 && cand <= this.target - 1) opts.add(cand);
      delta++;
    }
    const values = [...opts].sort(() => Math.random() - 0.5);
    const { radius, y, xFor } = answerRow(this, values.length, BUTTON_RADIUS, 14);
    values.forEach((value, i) => {
      const c = modernAnswerButton(this, xFor(i), y, radius, digit(value));
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: number) {
    if (value !== this.answer) {
      hintWrong(this, container, {
        hint: () => `Which number joins ${this.shown} to make ${this.target}?`,
        hintBn: () => `${digit(this.shown)} এর সাথে কত যোগ করলে ${digit(this.target)} হয়?`,
        correct: () => this.answer,
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
    // #1201 — the ten-frame is already the bonds diagram; the shared reward
    // path (correctCelebrate) brings the escalation + streak chip so the
    // prerequisite concept celebrates like the regrouping scenes it feeds.
    correctCelebrate(this, container.x, container.y);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(value === this.answer, ms, this.shown);
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

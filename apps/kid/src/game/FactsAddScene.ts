import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD } from "./ui";
import { hintWrong } from "./hints";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-addfacts")?.difficultyLevels ?? [6, 8, 10, 10, 12, 12];
const ROUNDS_TO_FINISH = 3;
const QUESTION_TIME = 6000; // ms per fact — a real timed drill
const FAST_MS = 2500; // faster than this → ⚡


/**
 * Addition facts to 20 fluency — a timed sprint (#188).
 * Band 1/2 drill: rapid-fire "a + b = ?" with a 6s countdown bar per fact.
 * Tracks SPEED (per-fact ms, ⚡ under 2.5s) + ACCURACY (correct/total), shown
 * on every finish. Fact range grows by level up to the full "to 20" family.
 */
export class FactsAddScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private totalMs = 0;
  private fastCount = 0;
  private qStart = 0;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private timerTween?: Phaser.Tweens.Tween;
  private a = 0;
  private b = 0;
  private tiles: { sprite: Phaser.GameObjects.Container; val: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private tallyText!: Phaser.GameObjects.Text;

  constructor() {
    super("FactsAdd");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "ocean");
    this.titleText = this.add
      .text(0, 0, t("titleFacts20"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.timerBar = this.add.rectangle(0, 0, 0, 10, 0xffd166).setOrigin(0, 0.5).setDepth(5);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.3);
    this.tallyText.setPosition(width / 2, height * 0.44);
    this.timerBar.setPosition(24, height * 0.4).setSize(width - 48, 10);
  }

  private startRound() {
    this.clearTiles();
    this.locked = false;
    this.total = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.answered = 0;
    this.correct = 0;
    this.totalMs = 0;
    this.fastCount = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    this.askFact();
  }

  private factRange(): number {
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    if (lvl < 2) return 5; // sums to 10
    if (lvl < 4) return 8; // sums to 16
    return 10; // full fact family to 20
  }

  private askFact() {
    this.clearTiles();
    this.locked = false;
    const maxA = this.factRange();
    this.a = Phaser.Math.Between(1, maxA);
    this.b = Phaser.Math.Between(1, maxA);
    this.prompt.set(`${digit(this.a)} + ${digit(this.b)} = ?`);

    const ans = this.a + this.b;
    const opts = new Set<number>([ans]);
    while (opts.size < 4) {
      const d = ans + Phaser.Math.Between(-3, 3);
      if (d >= 0 && d <= 20) opts.add(d);
    }
    const bank = [...opts].sort(() => Math.random() - 0.5);

    const gl = gridLayout(this, {
      cols: 4,
      rows: 1,
      preferredW: 120,
      minW: 64,
      widthPad: 16,
      topPad: this.scale.height * 0.56,
      bottomY: this.scale.height - 40 - SAB(),
      cardH: 84,
    });
    bank.forEach((val, i) => {
      const tile = modernCardButton(this, gl.startX + i * gl.spacingX, gl.cy, gl.cardW, 84, digit(val), BTN_NEUTRAL, 34);
      tile.on("pointerdown", () => this.tap(tile, val));
      this.tiles.push({ sprite: tile, val });
    });

    this.qStart = this.time.now;
    this.timerBar.setSize(this.scale.width - 48, 10).setFillStyle(0xffd166).setAlpha(1);
    this.timerTween?.stop();
    this.timerTween = this.tweens.add({
      targets: this.timerBar,
      width: 0,
      duration: QUESTION_TIME,
      ease: "Linear",
      onComplete: () => this.timeout(),
    });
  }

  private tap(tile: Phaser.GameObjects.Container, val: number) {
    if (this.locked) return;
    if (val === this.a + this.b) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      const ms = Math.max(1, this.time.now - this.qStart);
      this.totalMs += ms;
      this.correct++;
      if (ms < FAST_MS) this.fastCount++;
      this.tweens.add({ targets: tile, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.advance();
      return;
    }
    bad();
    this.locked = true;
    this.totalMs += Math.max(1, this.time.now - this.qStart);
    hintWrong(this, tile, {
      hint: () => t("tapTry"),
      hintBn: () => t("tapTry"),
      correct: () => digit(this.a + this.b),
      options: () => this.tiles.map((o) => ({ sprite: o.sprite, value: digit(o.val) })),
    });
    this.advance();
  }

  private timeout() {
    if (this.locked) return;
    this.locked = true;
    this.totalMs += QUESTION_TIME;
    this.floatMsg(t("fgSlow"));
    this.advance();
  }

  private advance() {
    this.timerTween?.stop();
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.time.delayedCall(350, () => this.askFact());
      return;
    }
    this.finishRound();
  }

  private finishRound() {
    const avg = this.totalMs / this.total / 1000;
    this.floatMsg(`${t("fgDone")}  ${t("fgCorr", { n: digit(this.correct) })}  ${t("fgAvg", { s: avg.toFixed(1) })}  ${"⚡".repeat(Math.min(3, this.fastCount))}`);
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.correct === this.total, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.7, text, NV_GOLD, 24, -24);
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}

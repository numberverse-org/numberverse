import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN } from "./ui";
import { hintWrong } from "./hints";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-doubles")?.difficultyLevels ?? [6, 8, 10, 10, 12, 12];
const ROUNDS_TO_FINISH = 3;


/**
 * Doubles & near-doubles strategy (#190).
 * Band 1/2: learn the doubles facts (5+5=10) with a spoken chant + dot-array
 * drill, then transfer to near-doubles (5+6 = double 5 + 1). Free-paced —
 * the "strategy" is taught, not timed: dots show the two equal rows (the extra
 * dot is green for near-doubles) and every correct answer speaks the strategy.
 */
export class DoublesScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private total = 0;
  private answered = 0;
  private correct = 0;
  private qIndex = 0;
  private isDouble = true;
  private base = 0; // the doubled number
  private a = 0;
  private b = 0;
  private tiles: { sprite: Phaser.GameObjects.Container; val: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private tallyText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private songBtn!: Phaser.GameObjects.Container;
  private dotsGfx!: Phaser.GameObjects.Graphics;
  private dotsY = 0;

  constructor() {
    super("Doubles");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleDoubles"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);
    this.hintText = this.add
      .text(0, 0, "", txt(22, NV_GREEN, { bold: true, outline: true, wrap: 320 }))
      .setOrigin(0.5)
      .setVisible(false);
    this.dotsGfx = this.add.graphics().setDepth(4);
    this.songBtn = modernCardButton(this, 0, 0, 110, 44, t("dblSong"), BTN_NEUTRAL, 16);
    this.songBtn.on("pointerdown", () => this.singChant());

    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.songBtn.setPosition(width - 74, 40);
    this.prompt.setPosition(width / 2, height * 0.2);
    this.tallyText.setPosition(width / 2, height * 0.3);
    this.dotsY = height * 0.4;
    this.hintText.setPosition(width / 2, height * 0.52);
    this.hintText.setWordWrapWidth(Math.max(180, width - 60));
    if (this.tiles.length === 0) this.drawDots(this.a, this.b);
  }

  private startRound() {
    this.clearTiles();
    this.locked = false;
    this.data.set("nv:difficulty", this.levelIndex + 1); // #1061 — reward engine sees round hardness
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

  private maxBase(): number {
    const lvl = Math.min(this.levelIndex, LEVELS.length - 1);
    if (lvl < 2) return 5; // doubles up to 10
    if (lvl < 4) return 7; // doubles up to 14
    return 10; // full doubles to 20
  }

  private askQuestion() {
    this.clearTiles();
    this.locked = false;
    // first half of each round = doubles drill, second half = near-doubles transfer
    this.isDouble = this.qIndex < Math.ceil(this.total / 2);
    const maxB = this.maxBase();
    this.base = Phaser.Math.Between(1, this.isDouble ? maxB : Math.max(1, maxB - 1));
    this.a = this.base;
    this.b = this.isDouble ? this.base : this.base + 1;
    const ans = this.a + this.b;
    this.prompt.set(`${digit(this.a)} + ${digit(this.b)} = ?`);
    this.drawDots(this.a, this.b);

    if (!this.isDouble) {
      this.hintText
        .setText(t("dblHint", { d: digit(this.base), dd: digit(this.base * 2), o: digit(1), n: digit(ans) }))
        .setVisible(true);
    } else {
      this.hintText.setVisible(false);
    }

    const opts = new Set<number>([ans]);
    // Misconception distractors — near-doubles ARE the point of the lesson, so
    // always offer the double one less and one more (6+6 → 11 and 13): the kid
    // has to tell the exact double apart from the near-doubles by sight.
    for (const e of [this.base * 2 + 1, this.base * 2 - 1, this.base * 2]) {
      if (opts.size >= 4) break;
      if (e >= 2 && e <= 20 && e !== ans) opts.add(e);
    }
    let d = 1;
    while (opts.size < 4) {
      const c = ans + (d % 2 === 1 ? -d : d);
      if (c >= 2 && c <= 20 && c !== ans) opts.add(c);
      d++;
    }
    const bank = [...opts].sort(() => Math.random() - 0.5);

    const gl = gridLayout(this, {
      cols: 4,
      rows: 1,
      preferredW: 120,
      minW: 64,
      widthPad: 16,
      topPad: this.scale.height * 0.6,
      bottomY: this.scale.height - 40 - SAB(),
      cardH: 84,
    });
    bank.forEach((val, i) => {
      const tile = modernCardButton(this, gl.startX + i * gl.spacingX, gl.cy, gl.cardW, 84, digit(val), BTN_NEUTRAL, 34);
      tile.on("pointerdown", () => this.tap(tile, val));
      this.tiles.push({ sprite: tile, val });
    });
  }

  private drawDots(a: number, b: number) {
    this.dotsGfx.clear();
    const cols = Math.max(a, b);
    const gap = 24;
    const r = 7;
    const x0 = this.scale.width / 2 - ((cols - 1) * gap) / 2;
    const y0 = this.dotsY - 13;
    const baseColor = 0x7dd3fc;
    const extraColor = 0x4ade80;
    for (let i = 0; i < a; i++) {
      this.dotsGfx.fillStyle(baseColor, 1).fillCircle(x0 + i * gap, y0, r);
    }
    for (let i = 0; i < b; i++) {
      const isExtra = !this.isDouble && i === b - 1;
      this.dotsGfx.fillStyle(isExtra ? extraColor : baseColor, 1).fillCircle(x0 + i * gap, y0 + 28, r);
    }
  }

  /** Spoken doubles chant up to the current max base (the "doubles song"). */
  private singChant() {
    const maxB = this.maxBase();
    const lines: string[] = [];
    for (let a = 1; a <= maxB; a++) {
      lines.push(t("dblChant", { a: digit(a), s: digit(a * 2) }));
    }
    speak(lines.join(" "), { lang: getAppLang() === "bn" ? "bn" : "en", rate: 0.85 });
  }

  private tap(tile: Phaser.GameObjects.Container, val: number) {
    if (this.locked) return;
    if (val === this.a + this.b) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, tile.x, tile.y); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.correct++;
      const ms = Math.max(1, this.time.now - this.startedAt);
      this.speakStrategy();
      this.tweens.add({ targets: tile, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.advance(ms);
      return;
    }
    bad();
    this.locked = true;
    hintWrong(this, tile, {
      hint: () => t("tapHint"),
      hintBn: () => t("tapHint"),
      correct: () => digit(this.a + this.b),
      options: () => this.tiles.map((o) => ({ sprite: o.sprite, value: digit(o.val) })),
    });
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.advance(ms);
  }

  private speakStrategy() {
    if (this.isDouble) {
      speak(t("dblWinD", { a: digit(this.base), s: digit(this.base * 2) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    } else {
      speak(t("dblWinN", { x: digit(this.a), y: digit(this.b), d: digit(this.base), o: digit(1), s: digit(this.a + this.b) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    }
  }

  private advance(ms: number) {
    this.answered++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.total)}`);
    if (this.answered < this.total) {
      this.qIndex++;
      this.time.delayedCall(950, () => this.askQuestion());
      return;
    }
    this.finishRound(ms);
  }

  private finishRound(ms: number) {
    this.floatMsg(`${t("dblDone")}  ${digit(this.correct)}/${digit(this.total)}`);
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
    floatText(this, this.scale.width / 2, this.scale.height * 0.68, text, NV_GOLD, 26, -24);
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}

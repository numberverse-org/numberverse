import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, cardPool, roundMeter, gridLayout, BTN_NEUTRAL, type RoundMeterApi, type CardPool, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-compare")?.difficultyLevels ?? [3, 3, 3, 3, 3, 3];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 160;
const CARD_H = 84;
/** Degree forms of a size adjective — the rule taught by the demo strip. */
interface AdjDegrees {
  p: string;
  c: string;
  s: string;
}
const ADJS: AdjDegrees[] = [
  { p: "big", c: "bigger", s: "biggest" },
  { p: "small", c: "smaller", s: "smallest" },
  { p: "tall", c: "taller", s: "tallest" },
  { p: "short", c: "shorter", s: "shortest" },
  { p: "long", c: "longer", s: "longest" },
];
const ITEMS = [
  { e: "🐕", noun: "dog" },
  { e: "🐈", noun: "cat" },
  { e: "🌳", noun: "tree" },
  { e: "🐟", noun: "fish" },
  { e: "🚌", noun: "bus" },
  { e: "✏️", noun: "pencil" },
  { e: "🐍", noun: "snake" },
  { e: "🪱", noun: "worm" },
];

/**
 * Comparatives & superlatives (big → bigger → biggest) (#179).
 * Band 3 grammar: the RULE is taught by a demo strip (three degree chips that
 * pulse + speak in order when the adjective changes), then a PICTURE COMPARE
 * asks the right form — two pictures (small vs big) → comparative, three
 * pictures (small/medium/large) → superlative. Options are the 3 degree forms.
 */
export class CompareScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private adj!: AdjDegrees;
  private item!: { e: string; noun: string };
  private superlative = false;
  /** #1324 — the option-row cards are POOLED (recycled every question) so a
   *  round makes zero new GameObjects after the pool warms up. */
  private tiles: Phaser.GameObjects.Container[] = [];
  private tilePool!: CardPool;
  private pics: Phaser.GameObjects.Text[] = [];
  private chips: Phaser.GameObjects.Container[] = [];
  private chipPool!: CardPool;
  private chipVals: string[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("Compare");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "sunset");
    this.titleText = this.add
      .text(0, 0, t("titleCompare"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("cmPrompt"));
    // #1324 — one pool per fixed geometry (option row + rule-strip chips). The
    // pool grows to the row's high-water mark, then recycles forever.
    this.tilePool = cardPool(this, CARD_W, CARD_H, BTN_NEUTRAL, 30);
    this.chipPool = cardPool(this, 96, 48, BTN_NEUTRAL, 22);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    // rule strip chips sit at top-center under the meter
    const n = this.chips.length;
    this.chips.forEach((c, i) => c.setPosition(width / 2 + (i - (n - 1) / 2) * 120, height * 0.16));
    this.prompt.setPosition(width / 2, height * 0.62);
    // pictures sit between the strip and the prompt
    const picN = this.pics.length;
    const scales = picN === 2 ? [0.85, 1.25] : [0.7, 1.0, 1.35];
    this.pics.forEach((p, i) => {
      p.setPosition(width / 2 + (i - (picN - 1) / 2) * 150, height * 0.38);
      p.setFontSize(40 + scales[i] * 44);
    });
  }

  private startRound() {
    this.clearTiles();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion(true);
  }

  private buildStrip() {
    this.chipPool.releaseAll(this.chips);
    this.chips = [];
    this.chipVals = [this.adj.p, this.adj.c, this.adj.s];
    this.chipVals.forEach((val, i) => {
      const chip = this.chipPool.claim(val, 0, 0, 96, 48);
      chip.disableInteractive();
      this.chips.push(chip);
      // pulse + speak each chip in order — the rule demo
      const delay = i * 650;
      this.time.delayedCall(delay, () => {
        this.tweens.add({ targets: chip, scale: 1.15, duration: 150, yoyo: true });
        speak(val, { lang: "en" });
      });
    });
    this.layout();
  }

  private askQuestion(demoFirst = false) {
    this.clearTiles();
    this.pics.forEach((p) => p.destroy());
    this.pics = [];
    this.locked = false;
    // #1052 — LEVELS[levelIndex] is the active ADJECTIVE-pool size: big/small/tall
    // first, then +short, then +long (bigger/biggest of less-familiar words is
    // genuinely harder). Pick from the pool so difficulty rises with the level.
    const adjCount = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    let adj = ADJS[Phaser.Math.Between(0, adjCount - 1)];
    if (adj.p === this.adj?.p) adj = ADJS[(ADJS.indexOf(adj) + 1) % adjCount];
    const isNewAdj = adj.p !== this.adj?.p;
    this.adj = adj;
    // #1060 — the superlative (3 pictures) ramps in PROBABILISTICALLY instead
    // of a hard level-2 gate: level 0 is only comparative, then a rising chance
    // of the -est form (level 1 ~55%, level 2 ~70%, level 3 ~85%, level 4+ 100%).
    // The -er rule grounds first, but a strong kid sees -est earlier than the
    // old binary switch ever allowed, and every level is a different mix.
    if (this.levelIndex < 1) this.superlative = false;
    else this.superlative = Math.random() < Math.min(1, 0.4 + this.levelIndex * 0.15);
    this.item = ITEMS[Phaser.Math.Between(0, ITEMS.length - 1)];
    const counts = this.superlative ? 3 : 2;
    const scales = this.superlative ? [0.7, 1.0, 1.35] : [0.85, 1.25];
    for (let i = 0; i < counts; i++) {
      const p = this.add.text(0, 0, this.item.e, txt(0, "#ffffff", { outline: true })).setOrigin(0.5).setDepth(2);
      p.setFontSize(40 + scales[i] * 44);
      this.pics.push(p);
    }
    this.layout();
    const correct = this.superlative ? adj.s : adj.c;
    const sentence = this.superlative ? t("cmSupSentence", { noun: this.item.noun }) : t("cmCompSentence", { noun: this.item.noun });
    this.prompt.set(sentence);
    const bank = [adj.p, adj.c, adj.s].sort(() => Math.random() - 0.5);
    const gl = gridLayout(this, {
      cols: 3,
      rows: 1,
      preferredW: CARD_W,
      minW: 110,
      widthPad: 16,
      topPad: this.scale.height * 0.7,
      bottomY: this.scale.height - 88 - SAB(),
      cardH: CARD_H,
    });
    bank.forEach((val, i) => {
      // #1324 — claim a pooled card (same geometry CARD_W × CARD_H): the tap
      // handler is bound ONCE per container and reads the current value from
      // container data, so no listener churn across questions either.
      const tile = this.tilePool.claim(val, gl.startX + i * gl.spacingX, gl.cy, gl.cardW, gl.cardH);
      tile.setData("nv-val", val);
      if (!tile.getData("nv-tile-bound")) {
        tile.setData("nv-tile-bound", true);
        tile.on("pointerdown", () => this.tap(tile, tile.getData("nv-val") as string));
      }
      this.tiles.push(tile);
    });
    if (isNewAdj || demoFirst) this.buildStrip();
    this.time.delayedCall(350, () => speak(correct, { lang: "en" }));
  }

  private tap(container: Phaser.GameObjects.Container, val: string) {
    if (this.locked) return;
    const correct = this.superlative ? this.adj.s : this.adj.c;
    if (val === correct) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.tweens.add({ targets: container, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      // highlight the matching rule-strip chip
      const idx = this.chipVals.indexOf(correct);
      if (idx >= 0) this.tweens.add({ targets: this.chips[idx], scale: 1.25, duration: 150, yoyo: true });
      this.time.delayedCall(200, () => speak(correct, { lang: "en" }));
      this.floatMsg(t("cmGreat"));
      this.qInRound++;
      // #1060 — round length grows a little with the level (5 → 8 questions) so
      // a higher level is a longer chapter, not just the same 5.
      const qTarget = QUESTIONS_PER_ROUND + Math.min(3, Math.floor(this.levelIndex / 3));
      this.time.delayedCall(950, () => (this.qInRound >= qTarget ? this.finishRound() : this.askQuestion()));
      return;
    }
    hintWrong(this, container, {
      hint: () => "Two things → -er, three things → -est!",
      hintBn: () => "দুই জিনিস → -er, তিন জিনিস → -est!",
      correct: () => correct,
      options: () =>
        this.tiles.filter((tile) => tile !== container).map((tile) => ({ sprite: tile, value: tile.getData("nv-val") as string })),
    });
    this.time.delayedCall(500, () => speak(correct, { lang: "en" }));
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    const qTarget = QUESTIONS_PER_ROUND + Math.min(3, Math.floor(this.levelIndex / 3));
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("cmDone"));
    this.onRoundDone?.(this.qInRound >= qTarget, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.55, text, NV_GOLD, 28, -28);
  }

  private clearTiles() {
    // #1324 — release back to the pool (hidden + non-interactive) instead of
    // destroying: the next question reuses these exact containers.
    this.tilePool.releaseAll(this.tiles);
    this.tiles = [];
  }
}

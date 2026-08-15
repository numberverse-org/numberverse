import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD } from "./ui";
import { correctCelebrate , floatText } from "./celebrate";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-lettersound")?.difficultyLevels ?? [2, 2, 3, 3, 4, 4];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 5;
const CARD_W = 116;
const CARD_H = 116;

/** Confusable letter pairs — the heart of discrimination (অ-আ-ক-খ). */
interface Pair { a: string; b: string }
const PAIRS: Pair[] = [
  { a: "ক", b: "খ" },
  { a: "প", b: "ফ" },
  { a: "স", b: "শ" },
  { a: "অ", b: "আ" },
  { a: "ব", b: "ভ" },
  { a: "জ", b: "ঝ" },
  { a: "ত", b: "থ" },
  { a: "দ", b: "ধ" },
  { a: "গ", b: "ঘ" },
  { a: "চ", b: "ছ" },
  { a: "ট", b: "ঠ" },
  { a: "ড", b: "ঢ" },
  { a: "ই", b: "ঈ" },
  { a: "উ", b: "ঊ" },
];
const EASY = PAIRS.slice(0, 5);

/**
 * Bangla Letter vs Sound discrimination — অ-আ-ক-খ (#166).
 * Band 1: a letter sound plays FIRST; the kid picks the matching letter among
 * its confusable twin(s) (ক/খ, প/ফ, স/শ…). A 🔊 replay button re-hears it any
 * time. Wrong taps retire (killOption) with a gentle bilingual "listen again"
 * nudge that re-plays the target sound. Tile count grows 2 → 4 by level.
 */
export class LetterSoundScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private target = "";
  private lastTarget = "";
  private tiles: { sprite: Phaser.GameObjects.Container; letter: string }[] = [];
  private replayBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("LetterSound");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "space");
    this.titleText = this.add
      .text(0, 0, t("titleLetterSound"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("lsPrompt"));
    this.meter = roundMeter(this);
    this.replayBtn = modernCardButton(this, 0, 0, 96, 60, "🔊", BTN_ORANGE, 28);
    this.replayBtn.on("pointerdown", () => this.playSound());
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
    this.replayBtn.setPosition(width - 64, 120);
  }

  private playSound() {
    speak(this.target, { lang: "bn" });
  }

  private startRound() {
    this.clearTiles();
    this.data.set("nv:difficulty", this.levelIndex + 1); // #1061 — reward engine sees round hardness
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearTiles();
    this.locked = false;
    const pool = this.levelIndex < 2 ? EASY : PAIRS;
    let pair = pool[Phaser.Math.Between(0, pool.length - 1)];
    let target = Math.random() < 0.5 ? pair.a : pair.b;
    // Never hand the same sound twice in a row — keep it a real discrimination test.
    if (target === this.lastTarget) {
      pair = pool[(pool.indexOf(pair) + 1) % pool.length];
      target = Math.random() < 0.5 ? pair.a : pair.b;
    }
    this.target = target;
    this.lastTarget = target;
    const twinOf = this.target === pair.a ? pair.b : pair.a;
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const distract = this.pickDistractors(this.target, twinOf, n - 2);
    const bank = [this.target, twinOf, ...distract].sort(() => Math.random() - 0.5);
    const gap = this.scale.width / (bank.length + 1);
    const y = this.scale.height - 180 - SAB();
    bank.forEach((letter, i) => {
      const tile = modernCardButton(this, gap * (i + 1), y, CARD_W, CARD_H, letter, BTN_PRIMARY, 56);
      tile.on("pointerdown", () => this.tap(tile, letter));
      this.tiles.push({ sprite: tile, letter });
    });
    // Sound-first: the sound plays the moment the letters appear.
    this.time.delayedCall(320, () => this.playSound());
  }

  private pickDistractors(target: string, twin: string, count: number): string[] {
    const used = new Set([target, twin]);
    const pool = PAIRS.flatMap((p) => [p.a, p.b])
      .filter((l) => !used.has(l))
      .filter((l, i, a) => a.indexOf(l) === i)
      .sort(() => Math.random() - 0.5);
    return pool.slice(0, Math.max(0, count));
  }

  private tap(container: Phaser.GameObjects.Container, letter: string) {
    if (this.locked) return;
    if (letter === this.target) {
      this.locked = true;
      pop();
      correctCelebrate(this, container.x, container.y);
      this.tweens.add({ targets: container, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.time.delayedCall(200, () => speak(this.target, { lang: "bn" }));
      this.floatMsg(t("lsGreat"));
      this.qInRound++;
      this.time.delayedCall(950, () => (this.qInRound >= QUESTIONS_PER_ROUND ? this.finishRound() : this.askQuestion()));
      return;
    }
    hintWrong(this, container, {
      hint: () => "Listen again — tap the letter you HEARD!",
      hintBn: () => "আবার শোনো — যে বর্ণটা শুনলে, সেটা টিপো!",
      correct: () => this.target,
      options: () => this.tiles.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.letter })),
    });
    this.time.delayedCall(500, () => this.playSound());
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("lsDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.5, text, NV_GOLD, 28, -28);
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}

import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { GRAMMAR_NOUNS, GRAMMAR_VERBS } from "./wordBanks";

const LEVELS = GAMES.find((g) => g.id === "game-grammar")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
// #1171 — the noun/verb columns are STABLE SUBSETS of the shared
// high-frequency word bank, so a curriculum word edit lands in one place.
const WORDS = [
  ...GRAMMAR_NOUNS.map((word) => ({ word, type: "noun" as const })),
  ...GRAMMAR_VERBS.map((word) => ({ word, type: "verb" as const })),
];
const BUTTON_RADIUS = 60;
const ROUNDS_TO_FINISH = 3;

/**
 * Grammar Sort — noun or verb?
 * Band 5 (ages 10–13). Shows a word, kid taps NOUN or VERB.
 */
export class GrammarScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target!: (typeof WORDS)[number];
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private wordText!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("Grammar");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleGrammar"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.wordText = this.add
      .text(0, 0, "", txt(56, NV_GOLD, {bold: true, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("nounOrVerb"));
    this.meter = roundMeter(this);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "candy");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.wordText.setPosition(width / 2, height * 0.42);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.clearButtons();
    // #1054 — LEVELS[levelIndex] is the active WORD-POOL size. Split it evenly
    // across the noun and verb banks so every drill round always has BOTH a noun
    // and a verb candidate (a pure-noun slice would make the sort trivial).
    const poolSize = Math.min(LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)], WORDS.length);
    const nVerbs = Math.floor(poolSize / 2);
    const nNouns = poolSize - nVerbs;
    const active = [
      ...WORDS.filter((w) => w.type === "noun").slice(0, nNouns),
      ...WORDS.filter((w) => w.type === "verb").slice(0, nVerbs),
    ];
    this.target = active[Phaser.Math.Between(0, active.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.wordText.setText(this.target.word);
    speak(this.target.word, { lang: "en" });
    this.spawnButtons();
  }

  private spawnButtons() {
    const values = ["noun", "verb"].sort(() => Math.random() - 0.5);
    const { width } = this.scale;
    const spacing = BUTTON_RADIUS * 2 + 16;
    const startX = width / 2 - (spacing * (values.length - 1)) / 2;
    const y = this.answersY;
    values.forEach((type, i) => {
      const c = modernAnswerButton(this, startX + i * spacing, y, BUTTON_RADIUS, type.toUpperCase(), type === "noun" ? BTN_PRIMARY : BTN_ORANGE, { labelSize: 26 });
      c.on("pointerdown", () => this.tap(c, type));
      this.buttons.push({ sprite: c, value: type });
    });
  }

  private tap(container: Phaser.GameObjects.Container, type: string) {
    if (type !== this.target.type) {
      hintWrong(this, container, {
        hint: () => `Is the word a noun, verb, or adjective? "${this.target.word}"`,
        hintBn: () => `"${this.target.word}" — এটা noun, verb নাকি adjective?`,
        correct: () => this.target.type,
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
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(type === this.target.type, ms, this.levelIndex + 1);
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

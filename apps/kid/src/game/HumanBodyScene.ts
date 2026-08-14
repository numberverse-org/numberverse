import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, BTN_PRIMARY, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-humanbody")?.difficultyLevels ?? [2, 3, 3, 4, 4, 5];
interface Fact {
  q: string;
  options: string[];
  answer: string;
  emoji: string;
  /** 1 = easy organ jobs, 2 = more organs, 3 = body systems — harder later. */
  tier: 1 | 2 | 3;
}
// #757/#760 — bands 6-7 had no science. One fact bank, both skills: tiers 1-2
// are organ → JOB (science-human-body, band 6); tier 3 is organ → SYSTEM
// (science-body-systems, band 7, which starts high on the ladder so only
// systems come up). The 6-tier ladder is real.
const FACTS: Fact[] = [
  // ── organ jobs (tier 1) ──
  { q: "Which organ works like a pump for your whole body?", options: ["Heart ❤️", "Brain 🧠", "Lungs 🫁", "Stomach"], answer: "Heart ❤️", emoji: "❤️", tier: 1 },
  { q: "Which organ helps you think and learn?", options: ["Brain 🧠", "Heart ❤️", "Bones 🦴", "Lungs 🫁"], answer: "Brain 🧠", emoji: "🧠", tier: 1 },
  { q: "Which organs help you breathe?", options: ["Lungs 🫁", "Heart ❤️", "Eyes 👀", "Teeth 🦷"], answer: "Lungs 🫁", emoji: "🫁", tier: 1 },
  { q: "Which organ helps you digest food?", options: ["Stomach", "Brain 🧠", "Bones 🦴", "Heart ❤️"], answer: "Stomach", emoji: "🍲", tier: 1 },
  // ── more organs (tier 2) ──
  { q: "Which organs help you see?", options: ["Eyes 👀", "Ears 👂", "Hands ✋", "Nose 👃"], answer: "Eyes 👀", emoji: "👀", tier: 2 },
  { q: "Which organs help you hear?", options: ["Ears 👂", "Eyes 👀", "Mouth 👄", "Hands ✋"], answer: "Ears 👂", emoji: "👂", tier: 2 },
  { q: "Which part supports you and helps you stand?", options: ["Bones 🦴", "Skin", "Heart ❤️", "Lungs 🫁"], answer: "Bones 🦴", emoji: "🦴", tier: 2 },
  { q: "Which part covers and protects your whole body?", options: ["Skin", "Bones 🦴", "Stomach", "Teeth 🦷"], answer: "Skin", emoji: "🧴", tier: 2 },
  { q: "Which part helps you smell flowers?", options: ["Nose 👃", "Ears 👂", "Eyes 👀", "Tongue 👅"], answer: "Nose 👃", emoji: "👃", tier: 2 },
  // ── body systems (tier 3, band 7) ──
  { q: "The heart belongs to which system?", options: ["Circulatory ♻️", "Digestive", "Respiratory", "Nervous"], answer: "Circulatory ♻️", emoji: "♻️", tier: 3 },
  { q: "The lungs belong to which system?", options: ["Respiratory", "Circulatory ♻️", "Skeletal", "Digestive"], answer: "Respiratory", emoji: "🫁", tier: 3 },
  { q: "The stomach belongs to which system?", options: ["Digestive", "Nervous", "Skeletal", "Circulatory ♻️"], answer: "Digestive", emoji: "🍲", tier: 3 },
  { q: "The brain belongs to which system?", options: ["Nervous", "Skeletal", "Muscular 💪", "Circulatory ♻️"], answer: "Nervous", emoji: "🧠", tier: 3 },
  { q: "The bones belong to which system?", options: ["Skeletal", "Digestive", "Respiratory", "Nervous"], answer: "Skeletal", emoji: "🦴", tier: 3 },
];

const BUTTON_RADIUS = 54;
const ROUNDS_TO_FINISH = 3;

/** Facts that match the current level — organ jobs → systems. */
function factsForLevel(level: number): Fact[] {
  const tier = level >= 4 ? 3 : level >= 2 ? 2 : 1;
  return FACTS.filter((f) => f.tier <= tier);
}

/**
 * Human Body (#757/#760). Bands 6-7 science.
 * Band 6 (science-human-body): match the major organs to their job.
 * Band 7 (science-body-systems): match organs to their body system — the
 * system tier only surfaces at high levels, so a band-7 start sees systems.
 */
export class HumanBodyScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target!: Fact;
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private questionText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;

  constructor() {
    super("HumanBody");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "forest");
    this.titleText = this.add
      .text(0, 0, t("bodyTitle"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.questionText = this.add
      .text(0, 0, "", txt(30, NV_GOLD, { bold: true, align: "center", wrap: 340 }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("tapAnswer"));
    this.meter = roundMeter(this);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.questionText.setPosition(width / 2, height * 0.38);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private startRound() {
    this.clearButtons();
    const pool = factsForLevel(this.levelIndex);
    this.target = pool[Phaser.Math.Between(0, pool.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.questionText.setText(`${this.target.emoji} ${this.target.q}`);
    speak(this.target.q);
    this.spawnButtons();
  }

  private spawnButtons() {
    const opts = [...this.target.options].sort(() => Math.random() - 0.5);
    const { width } = this.scale;
    const radius = opts.length > 3 ? Math.min(BUTTON_RADIUS - 6, (width - 80) / (opts.length * 2)) : BUTTON_RADIUS;
    const spacing = radius * 2 + 8;
    const startX = width / 2 - (spacing * (opts.length - 1)) / 2;
    const y = this.answersY;
    opts.forEach((value, i) => {
      const c = modernAnswerButton(this, startX + i * spacing, y, radius, value, BTN_PRIMARY, { labelSize: Math.max(15, Math.round(radius * 0.44)), wrap: radius * 2 - 12 });
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: string) {
    if (value !== this.target.answer) {
      hintWrong(this, container, {
        hint: "Read the question again and pick the organ it points to",
        hintBn: "প্রশ্নটি আবার পড়ো এবং যে অঙ্গটা বোঝায় সেটি বেছে নাও",
        correct: () => this.target.answer,
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
    correctCelebrate(this, container.x, container.y);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
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

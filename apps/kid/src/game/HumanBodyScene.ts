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

// #1161 — band 6 organ-job depth: more organs (muscles, liver, kidneys,
// intestines, joints) reusing the HumanBody answer-button mechanic.
const FACTS_DEPTH: Fact[] = [
  { q: "Which part moves your arms and legs?", options: ["Muscles 💪", "Teeth 🦷", "Skin", "Hair"], answer: "Muscles 💪", emoji: "💪", tier: 2 },
  { q: "Which organ helps clean your body and stores energy?", options: ["Liver", "Eyes 👀", "Bones 🦴", "Ears 👂"], answer: "Liver", emoji: "🫘", tier: 2 },
  { q: "Which organs make urine and keep your body clean?", options: ["Kidneys", "Lungs 🫁", "Teeth 🦷", "Hair"], answer: "Kidneys", emoji: "🫘", tier: 2 },
  { q: "Which part absorbs the food you eat?", options: ["Intestines", "Heart ❤️", "Eyes 👀", "Bones 🦴"], answer: "Intestines", emoji: "🌀", tier: 2 },
  { q: "Which part lets your arm bend?", options: ["A joint", "A nail", "A tooth", "A hair"], answer: "A joint", emoji: "🦾", tier: 2 },
  { q: "Which part works like a pump for your whole body?", options: ["Heart ❤️", "Liver", "Stomach", "Nose 👃"], answer: "Heart ❤️", emoji: "❤️", tier: 2 },
  { q: "Which part helps you chew food?", options: ["Teeth 🦷", "Lungs 🫁", "Kidneys", "Skin"], answer: "Teeth 🦷", emoji: "🦷", tier: 2 },
  { q: "Which organ controls every move you make?", options: ["Brain 🧠", "Stomach", "Bones 🦴", "Liver"], answer: "Brain 🧠", emoji: "🧠", tier: 2 },
];

// #1161 — band 7 body-system depth: WHAT each system does (not just which
// organ belongs where) — the systems ladder's hardest rung.
const SYSTEM_FACTS: Fact[] = [
  { q: "What does the circulatory system do?", options: ["Carries oxygen and food around the body", "Breaks down food", "Helps you breathe", "Holds you up"], answer: "Carries oxygen and food around the body", emoji: "♻️", tier: 3 },
  { q: "What does the digestive system do?", options: ["Breaks down food", "Brings in air", "Moves your bones", "Makes you see"], answer: "Breaks down food", emoji: "🍲", tier: 3 },
  { q: "What does the respiratory system do?", options: ["Brings in air and oxygen", "Digests food", "Controls thinking", "Fights germs"], answer: "Brings in air and oxygen", emoji: "🫁", tier: 3 },
  { q: "What does the nervous system do?", options: ["Sends messages and controls the body", "Brings in air", "Digests food", "Covers the body"], answer: "Sends messages and controls the body", emoji: "🧠", tier: 3 },
  { q: "What does the skeletal system do?", options: ["Supports and protects the body", "Brings in air", "Breaks down food", "Makes you hear"], answer: "Supports and protects the body", emoji: "🦴", tier: 3 },
  { q: "What does the muscular system do?", options: ["Moves the body", "Brings in air", "Makes urine", "Digests food"], answer: "Moves the body", emoji: "💪", tier: 3 },
  { q: "Which system works with the lungs?", options: ["Respiratory", "Skeletal", "Digestive", "Muscular 💪"], answer: "Respiratory", emoji: "🫁", tier: 3 },
  { q: "Which system sends signals from the brain?", options: ["Nervous", "Circulatory ♻️", "Skeletal", "Digestive"], answer: "Nervous", emoji: "🧠", tier: 3 },
];

const BUTTON_RADIUS = 54;
const ROUNDS_TO_FINISH = 3;
const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure

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
  private challenge = false; // #1158 — band 6-7 independent mode (timed rounds, no reveal)
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private target!: Fact;
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private questionText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private skillId = "";

  constructor() {
    super("HumanBody");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; challenge?: boolean; skill?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    // #1161 — band 6/7 depth pools: organ-job depth (science-body-depth) and
    // system functions (science-body-systems-depth).
    this.skillId = data.skill ?? "";
    // #1158 — challenge mode: band 6-7 skills (skill.challenge → App passes it)
    // get a per-round countdown bar and no hint/reveal on wrong.
    this.challenge = !!data.challenge;
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
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
    const pool =
      this.skillId === "science-body-depth"
        ? FACTS_DEPTH
        : this.skillId === "science-body-systems-depth"
          ? SYSTEM_FACTS
          : factsForLevel(this.levelIndex);
    this.target = pool[Phaser.Math.Between(0, pool.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.questionText.setText(`${this.target.emoji} ${this.target.q}`);
    speak(this.target.q);
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

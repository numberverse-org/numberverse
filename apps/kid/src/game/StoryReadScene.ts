import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, correctButton, roundMeter, gridLayout, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-storyread")?.difficultyLevels ?? [3, 3, 3, 4, 4, 4];
const ROUNDS_TO_FINISH = 3;
const STORIES_PER_ROUND = 3;
const BTN_W = 120;
const BTN_H = 96;

interface Story {
  text: string; // 2–3 Bangla sentences
  q: string;    // who/what question
  a: string;    // correct emoji (picture answer)
  d: string[];  // distractor emojis
}
/* 12 graded mini-stories (≥10 required): the first 4 are the easy 2-sentence
 * pool for levels 0–2; levels 3–5 draw from all 12 (2–3 sentences, richer
 * vocabulary). Questions ask who/what/where/when; answers are PICTURES (emoji)
 * so the skill is comprehension, not decoding. */
const STORIES: Story[] = [
  { text: "বিড়ালটি ঘরে ঘুমাচ্ছে। সে নরম বিছানায় ঘুমাচ্ছে।", q: "কী ঘুমাচ্ছে?", a: "🐱", d: ["🐶", "🦁", "🐰"] },
  { text: "বাবা আমাকে একটি বই কিনে দিয়েছেন। বইটি আমার খুব প্রিয়।", q: "বাবা কী কিনেছেন?", a: "📖", d: ["🍎", "🚗", "🧦"] },
  { text: "মেয়েটি বাগানে খেলা করে। সে গোলাপ ফুল খুব পছন্দ করে।", q: "মেয়েটি কোথায় খেলা করে?", a: "🌸", d: ["🏠", "🏫", "🏖️"] },
  { text: "সকালে রোদ উঠলে পাখিটি গান গায়। সে প্রতিদিন গান গায়।", q: "পাখিটি কখন গান গায়?", a: "☀️", d: ["🌙", "☔", "❄️"] },
  { text: "আমাদের স্কুলে আজ নতুন বন্ধু এসেছে। তার নাম রিমা। সে গল্প বলতে ভালোবাসে।", q: "নতুন বন্ধুর নাম কী?", a: "👧", d: ["👦", "👵", "🧒"] },
  { text: "দাদা প্রতিদিন সকালে হাঁটতে যান। তিনি বাজারে গিয়ে তাজা সবজি আনেন।", q: "দাদা কী আনেন?", a: "🥦", d: ["🍭", "🪁", "🍦"] },
  { text: "ভাইয়ের জন্মদিনে আমরা কেক খেয়েছি। সবাই মিলে গান গেয়েছি।", q: "জন্মদিনে আমরা কী খেয়েছি?", a: "🎂", d: ["🍕", "🍚", "🍩"] },
  { text: "বৃষ্টি হচ্ছে, তাই ছেলেটি ছাতা ধরেছে। ছাতাটি লাল রঙের।", q: "ছেলেটি কী ধরেছে?", a: "☔", d: ["🎈", "🎩", "🪀"] },
  { text: "মাছটি নদীর জলে সাঁতার কাটে। সে ছোট পোকা খেয়ে বড় হয়। একদিন সে বড় মাছ হলো।", q: "মাছটি কোথায় সাঁতার কাটে?", a: "🌊", d: ["🏜️", "🗻", "🌋"] },
  { text: "রিমা রোজ স্কুলে যায়। সে মন দিয়ে পড়াশোনা করে। তাই মা তাকে নতুন পেন দিয়েছেন।", q: "রিমা কী পেয়েছে?", a: "🖊️", d: ["🧸", "⚽", "🧢"] },
  { text: "রফিকের কাছে একটি লাল বেলুন ছিল। হঠাৎ বাতাসে বেলুনটি উড়ে গেল। রফিক মন খারাপ করল।", q: "কী উড়ে গেল?", a: "🎈", d: ["🪁", "✈️", "🎏"] },
  { text: "মা রান্নাঘরে মাছ ভাজছেন। ঘরে মাছের গন্ধ ছড়িয়ে গেল। আমরা সবাই খেতে বসলাম।", q: "মা কী ভাজছেন?", a: "🐟", d: ["🥚", "🍞", "🍗"] },
];
const EASY = STORIES.slice(0, 4);

/**
 * Bangla Story Comprehension — ছোট গল্প (#161).
 * Band 3 (ages 6–8): read/listen to a 2–3 sentence mini-story, then answer a
 * who/what question with PICTURE (emoji) answers. Auto-reads aloud in warm
 * Bangla on story show; a 🔊 toggle re-reads anytime. Levels ramp answer
 * options 3 → 4 and draw from the graded pool (easy 2-sentence stories first,
 * then the full 12). Wrong taps are retired gently (hintWrong).
 */
export class StoryReadScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private story!: Story;
  private answer: string[] = [];
  private answers: { sprite: Phaser.GameObjects.Container; emoji: string }[] = [];
  private panel!: Phaser.GameObjects.Graphics;
  private storyText!: Phaser.GameObjects.Text;
  private readBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("StoryRead");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "floral");
    this.titleText = this.add
      .text(0, 0, t("titleStoryRead"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("srPrompt"));
    this.meter = roundMeter(this);
    this.panel = this.add.graphics().setDepth(1);
    this.storyText = this.add
      .text(0, 0, "", txt(24, "#ffffff", { bold: true, align: "center", wrap: Math.min(560, 420) }))
      .setOrigin(0.5)
      .setDepth(2);
    this.readBtn = modernCardButton(this, 0, 0, 84, 60, "🔊", BTN_ORANGE, 32);
    this.readBtn.on("pointerdown", () => {
      speak(`${this.story.text} ${this.story.q}`, { lang: "bn" });
    });
    this.readBtn.setDepth(3);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.4);
    this.readBtn.setPosition(width - 58, 138);
    this.showStory();
  }

  private showStory() {
    if (!this.story) return;
    const maxW = Math.min(this.scale.width * 0.84, 560);
    const s = this.story;
    this.storyText
      .setStyle(txt(24, "#ffffff", { bold: true, align: "center", wrap: maxW - 28 }))
      .setText(s.text);
    const y = this.scale.height * 0.22;
    this.storyText.setPosition(this.scale.width / 2, y);
    const b = this.storyText.getBounds();
    this.panel.clear();
    this.panel.fillStyle(0x123d52, 0.72);
    this.panel.fillRoundedRect(b.x - 22, b.y - 20, b.width + 44, b.height + 40, 22);
  }

  private startRound() {
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askStory();
  }

  private askStory() {
    this.clearAnswers();
    this.locked = false;
    let s = (this.levelIndex < 3 ? EASY : STORIES)[Phaser.Math.Between(0, (this.levelIndex < 3 ? EASY : STORIES).length - 1)];
    if (s === this.story) {
      const pool = this.levelIndex < 3 ? EASY : STORIES;
      s = pool[(pool.indexOf(s) + 1) % pool.length];
    }
    this.story = s;
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const opts = [s.a, ...s.d.slice(0, n - 1)].sort(() => Math.random() - 0.5);
    this.answer = opts;
    speak(`${s.text} ${s.q}`, { lang: "bn" });
    this.showStory();
    this.prompt.set(s.q);
    const cols = n <= 3 ? n : 2;
    const rows = n <= 3 ? 1 : 2;
    const gl = gridLayout(this, {
      cols,
      rows,
      preferredW: BTN_W,
      minW: 76,
      widthPad: 40,
      topPad: this.scale.height * 0.5,
      bottomY: this.scale.height - 100 - SAB(),
      cardH: BTN_H,
    });
    opts.forEach((emoji, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (rows - 1) / 2) * gl.spacingY;
      const c = modernCardButton(this, x, y, gl.cardW, BTN_H, emoji, BTN_NEUTRAL, 48);
      c.on("pointerdown", () => this.tap(c, emoji));
      this.answers.push({ sprite: c, emoji });
    });
  }

  private tap(container: Phaser.GameObjects.Container, emoji: string) {
    if (this.locked) return;
    if (emoji !== this.story.a) {
      hintWrong(this, container, {
        hint: () => "Listen to the story again — who/what is it about?",
        hintBn: () => "গল্পটা আবার শোনো — কার/কী নিয়ে গল্প?",
        correct: () => this.story.a,
        options: () => this.answers.map((o) => ({ sprite: o.sprite, value: o.emoji })),
      });
      return;
    }
    this.locked = true;
    pop();
    correctButton(container);
    this.floatMsg(t("srGreat"));
    this.qInRound++;
    if (this.qInRound >= STORIES_PER_ROUND) {
      this.time.delayedCall(700, () => this.finishRound());
    } else {
      this.time.delayedCall(700, () => this.askStory());
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("srDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.62, text, txt(28, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 30, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearAnswers() {
    this.answers.forEach((o) => o.sprite.destroy());
    this.answers = [];
  }
}

import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-readstory")?.difficultyLevels ?? [3, 3, 3, 4, 4, 4];
const ROUNDS_TO_FINISH = 3; // one per story
const QUESTIONS_PER_STORY = 3;
const CHIP_H = 46;
const CHIP_GAP = 10;
const LINE_GAP = 8;

/** A graded read-along story: tappable word chips (word-by-word audio), then a
 * comprehension quiz. Each question carries its answer emoji, 3+ distractors,
 * and the story sentence that answers it (spoken aloud on a correct tap). */
interface ReadStory {
  title: string;
  s: string[][]; // sentences, each already split into words
  qs: { q: string; a: string; d: string[]; as: string }[];
}
const STORIES: ReadStory[] = [
  {
    title: "সকালের গল্প",
    s: [["সকালে", "সূর্য", "ওঠে।"], ["ছেলেমেয়েরা", "স্কুলে", "যায়।"], ["মা", "ভাত", "রান্না", "করে।"]],
    qs: [
      { q: "সকালে কী ওঠে?", a: "☀️", d: ["🌙", "🐦", "🏠"], as: "সকালে সূর্য ওঠে।" },
      { q: "কে স্কুলে যায়?", a: "🧒", d: ["🐟", "🌳", "🚗"], as: "ছেলেমেয়েরা স্কুলে যায়।" },
      { q: "মা কী রান্না করে?", a: "🍚", d: ["⚽", "🌸", "📚"], as: "মা ভাত রান্না করে।" },
    ],
  },
  {
    title: "ববি কুকুর",
    s: [["রহিমের", "কুকুরের", "নাম", "ববি।"], ["ববি", "প্রতিদিন", "তার", "সঙ্গে", "খেলে।"], ["একদিন", "সে", "হারিয়ে", "গেল,", "বাগানে", "পেল।"]],
    qs: [
      { q: "রহিমের কুকুরের নাম কী?", a: "🐶", d: ["🐱", "🐄", "🐔"], as: "রহিমের কুকুরের নাম ববি।" },
      { q: "ববিকে কোথায় পাওয়া গেল?", a: "🌳", d: ["🏠", "🏫", "🌊"], as: "একদিন সে হারিয়ে গেল, বাগানে পেল।" },
      { q: "ববি প্রতিদিন কী করে?", a: "⚽", d: ["🛌", "🍚", "🪥"], as: "ববি প্রতিদিন তার সঙ্গে খেলে।" },
    ],
  },
  {
    title: "বর্ষার দিন",
    s: [["বর্ষায়", "নদীতে", "পানি", "বাড়ে।"], ["কৃষক", "ভাই", "ধান", "লাগান।"], ["বৃষ্টি", "হলে", "ব্যাঙ", "ডাকে।"], ["শিশুরা", "কাদায়", "খেলে।"]],
    qs: [
      { q: "বর্ষায় নদীতে কী বাড়ে?", a: "🌊", d: ["🌾", "☀️", "🏔️"], as: "বর্ষায় নদীতে পানি বাড়ে।" },
      { q: "বৃষ্টি হলে কে ডাকে?", a: "🐸", d: ["🐶", "🐔", "🦆"], as: "বৃষ্টি হলে ব্যাঙ ডাকে।" },
      { q: "কে কাদায় খেলে?", a: "🧒", d: ["🐟", "🚗", "🐠"], as: "শিশুরা কাদায় খেলে।" },
    ],
  },
];
const stripPunc = (w: string) => w.replace(/[।,!?]/g, "");

/**
 * Graded read-a-story — গল্প পড়ি (#168).
 * Band 2/3: each round is one graded story. Phase 1 READ — the story renders as
 * tappable WORD chips; tapping a word speaks it (word-by-word audio), 🔊 reads
 * the whole story. Phase 2 QUIZ — 3 comprehension questions with emoji answers;
 * a correct tap reads the answering sentence aloud. Stories get longer/harder.
 * Quiz option count = LEVELS (3 → 4).
 */
export class ReadStoryScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private story!: ReadStory;
  private chips: { sprite: Phaser.GameObjects.Container; word: string }[] = [];
  private optionTiles: { sprite: Phaser.GameObjects.Container; emoji: string }[] = [];
  private phase: "read" | "quiz" = "read";
  private qIndex = 0;
  private q!: ReadStory["qs"][number];
  private readAllBtn!: Phaser.GameObjects.Container;
  private doneBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private background!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("ReadStory");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "floral");
    this.titleText = this.add
      .text(0, 0, t("titleReadStory"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    this.readAllBtn = modernCardButton(this, 0, 0, 150, 56, "🔊 " + t("rsReadAll"), BTN_ORANGE, 22, 138);
    this.readAllBtn.on("pointerdown", () => speak(this.story.s.flat().map(stripPunc).join(" "), { lang: "bn" }));
    this.doneBtn = modernCardButton(this, 0, 0, 190, 56, "→ " + t("rsDoneReading"), BTN_PRIMARY, 22, 176);
    this.doneBtn.on("pointerdown", () => this.startQuiz());
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.18);
    this.readAllBtn.setPosition(width / 2 - 105, height - 96 - SAB());
    this.doneBtn.setPosition(width / 2 + 105, height - 96 - SAB());
  }

  private startRound() {
    this.clearChips();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.story = STORIES[Math.min(this.roundsDone, STORIES.length - 1)];
    this.readPhase();
  }

  private readPhase() {
    this.phase = "read";
    this.locked = false;
    this.clearChips();
    this.prompt.set(t("rsTapWords"));
    this.readAllBtn.setVisible(true);
    this.doneBtn.setVisible(true);
    const { width, height } = this.scale;
    const all: string[] = [];
    const chipMap: { word: string; w: number }[] = [];
    const measure = this.story.s
      .flat()
      .map((w) => this.add.text(0, 0, w, txt(24, "#000000", { bold: true })).setOrigin(0.5));
    measure.forEach((m, i) => {
      const word = this.story.s.flat()[i];
      chipMap.push({ word, w: m.width + 24 });
      all.push(word);
    });
    measure.forEach((m) => m.destroy());
    // wrap into centered lines
    const maxW = width - 60;
    const rows: number[][] = [];
    let cur: number[] = [];
    let curW = 0;
    chipMap.forEach((c, i) => {
      if (cur.length && curW + CHIP_GAP + c.w > maxW) {
        rows.push(cur);
        cur = [];
        curW = 0;
      }
      cur.push(i);
      curW += c.w + (cur.length > 1 ? CHIP_GAP : 0);
    });
    if (cur.length) rows.push(cur);
    const lineH = CHIP_H + LINE_GAP;
    const startY = height * 0.28;
    rows.forEach((r, ri) => {
      const rw = r.reduce((s, i) => s + chipMap[i].w + CHIP_GAP, 0) - CHIP_GAP;
      let x = width / 2 - rw / 2;
      const y = startY + ri * lineH;
      r.forEach((i) => {
        const c = chipMap[i];
        const chip = modernCardButton(this, x + c.w / 2, y, c.w, CHIP_H, c.word, BTN_NEUTRAL, 24, c.w - 8);
        chip.on("pointerdown", () => {
          if (this.locked) return;
          pop();
          speak(stripPunc(c.word), { lang: "bn" });
        });
        this.chips.push({ sprite: chip, word: c.word });
        x += c.w + CHIP_GAP;
      });
    });
  }

  private startQuiz() {
    this.phase = "quiz";
    this.locked = false;
    this.clearChips();
    this.readAllBtn.setVisible(false);
    this.doneBtn.setVisible(false);
    this.qIndex = 0;
    this.nextQuestion();
  }

  private nextQuestion() {
    this.clearOptions();
    this.locked = false;
    this.q = this.story.qs[this.qIndex];
    this.prompt.set(this.q.q);
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const distract = this.q.d.slice(0, Math.max(0, n - 1)).sort(() => Math.random() - 0.5);
    const bank = [this.q.a, ...distract].sort(() => Math.random() - 0.5);
    const cols = bank.length <= 4 ? bank.length : 4;
    const rows = bank.length <= 4 ? 1 : Math.ceil(bank.length / 4);
    const gl = gridLayout(this, {
      cols,
      rows,
      preferredW: 96,
      minW: 76,
      widthPad: 24,
      topPad: this.scale.height * 0.5,
      bottomY: this.scale.height - 120 - SAB(),
      cardH: 96,
    });
    bank.forEach((emoji, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tile = modernCardButton(this, gl.startX + col * gl.spacingX, gl.cy + (row - (rows - 1) / 2) * gl.spacingY, gl.cardW, gl.cardH, emoji, BTN_NEUTRAL, 46);
      tile.on("pointerdown", () => this.answer(tile, emoji));
      this.optionTiles.push({ sprite: tile, emoji });
    });
    // read the question aloud — comprehension is sound-first too
    this.time.delayedCall(350, () => speak(this.q.q, { lang: "bn" }));
  }

  private answer(container: Phaser.GameObjects.Container, emoji: string) {
    if (this.locked) return;
    if (emoji === this.q.a) {
      this.locked = true;
      pop();
      win();
      correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
      this.tweens.add({ targets: container, scale: 1.12, duration: 140, yoyo: true, ease: "Back.easeOut" });
      this.time.delayedCall(200, () => speak(this.q.as, { lang: "bn" }));
      this.floatMsg(t("rsGreat"));
      this.qInRound++;
      this.qIndex++;
      if (this.qIndex >= this.story.qs.length) {
        this.time.delayedCall(1300, () => this.finishRound());
      } else {
        this.time.delayedCall(1100, () => this.nextQuestion());
      }
      return;
    }
    hintWrong(this, container, {
      hint: () => "Read the story again in your head — what did it say?",
      hintBn: () => "গল্পটা আবার মনে করো — কী বলা ছিল?",
      correct: () => this.q.a,
      options: () => this.optionTiles.filter((o) => o.sprite !== container).map((o) => ({ sprite: o.sprite, value: o.emoji })),
    });
    this.time.delayedCall(500, () => speak(this.q.q, { lang: "bn" }));
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("rsDone"));
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
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearChips() {
    this.chips.forEach((o) => o.sprite.destroy());
    this.chips = [];
  }
  private clearOptions() {
    this.optionTiles.forEach((o) => o.sprite.destroy());
    this.optionTiles = [];
  }
}

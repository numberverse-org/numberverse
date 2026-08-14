import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, correctButton, ringCorrect, type RoundMeterApi, NV_GOLD, NV_GREEN } from "./ui";
import { SAB } from "./safeArea";
import { BANGLA_KID_WORDS } from "./wordBanks";

const LEVELS = GAMES.find((g) => g.id === "game-bnspelling")?.difficultyLevels ?? [2, 3, 3, 4, 4, 5];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 3;
/** #1140 — production spelling: tier 1-2 tap tiles, tier 3+ type the word. */
const TYPING_THRESHOLD = 3;
const CHALLENGE_SECONDS = 20; // #1158 — per-question countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure
/** Band-1 kid words. #1168 — the SAME canonical bank as the read scene; the
 *  `letters` (base letter + attached matra sign tiles) and emoji come from the
 *  shared entry so a word edit propagates to read + spell + riddles at once. */
const WORDS: { emoji: string; word: string; letters: string[] }[] = BANGLA_KID_WORDS.filter((w) => w.letters).map((w) => ({
  emoji: w.emoji,
  word: w.bn,
  letters: w.letters!,
}));
/** Common Bangla spelling units used as distractors. */
const DISTRACTORS = ["খা", "গো", "চা", "টি", "পো", "যা", "শে", "ড়া", "টি", "ঁ", "।"];
/** #1140 — kid-friendly Latin keyboard map for the production-spelling tier.
 *  Keys are canonical Bangla spellings; values are the English letters the
 *  child types. Aliases stay forgiving (ful/phul, gach/gachh…). */
const ROMAN: Record<string, string[]> = {
  "মাছ": ["mach", "machh"],
  "বাঘ": ["bagh"],
  "কলা": ["kola"],
  "হাঁস": ["hash", "haas"],
  "ফুল": ["phul", "ful"],
  "হাতি": ["hati"],
  "বই": ["boi"],
  "ভাত": ["bhat", "vat"],
  "আম": ["am", "aam"],
  "মা": ["ma"],
  "ডিম": ["dim"],
  "বাড়ি": ["bari"],
  "রেল": ["rel", "rail"],
  "গাছ": ["gach", "gachh"],
  "ঘুড়ি": ["ghuri"],
  "বৃষ্টি": ["brishti"],
  "রোদ": ["rod"],
  "পাহাড়": ["pahar"],
  "তরমুজ": ["tormuj", "tormuz"],
  "নৌকা": ["nouka"],
  "মধু": ["modhu"],
  "ঝিনুক": ["jhinuk"],
};
/** On-screen QWERTY rows for touch typing. Backspace corrects, Enter checks. */
const QWERTY_ROWS: string[][] = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["Backspace", "z", "x", "c", "v", "b", "n", "m", "Enter"],
];

/**
 * Bangla spelling builder (#44).
 * Band 1: hear a kid word (Nova speaks it), then tap its spelling units from
 * a letter-tile tray in order. Each correct tap fills the next slot; wrong
 * taps get a gentle hintWrong nudge. Levels control how many distractor tiles
 * are mixed in (2 → 4).
 */
export class BanglaSpellScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private typing = false; // #1140 — production spelling for this skill
  private typingActive = false; // true for THIS question when tier ≥ threshold
  private typed = "";
  private targetRoman = "";
  private targetRomans: string[] = [];
  private levels: number[] = LEVELS;
  private challenge = false; // #1158 — timed rounds, no hint/reveal
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private roundCorrect = true;
  private target!: { emoji: string; word: string; letters: string[] };
  private solvedCount = 0;
  private slots: Phaser.GameObjects.Container[] = [];
  private tiles: { sprite: Phaser.GameObjects.Container; letter: string }[] = [];
  private keyboardKeys: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private emojiText!: Phaser.GameObjects.Text;
  private typingText!: Phaser.GameObjects.Text;

  constructor() {
    super("BanglaSpell");
  }

  private keyHandler = (event: KeyboardEvent) => this.handleKeyDown(event);

  create(data: {
    onRoundDone: (correct: boolean, ms: number, difficulty: number) => void;
    startLevelIndex?: number;
    levels?: number[];
    challenge?: boolean;
    typing?: boolean;
  }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.levels = data.levels ?? LEVELS;
    this.challenge = !!data.challenge;
    this.typing = !!data.typing;
    gameBackground(this, "floral");
    this.titleText = this.add
      .text(0, 0, t("titleBnSpell"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.emojiText = this.add
      .text(0, 0, "", txt(72, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(2);
    this.typingText = this.add
      .text(0, 0, "", txt(34, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(5).setVisible(false);
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    this.input.keyboard?.on("keydown", this.keyHandler);
    this.events.once("shutdown", () => this.input.keyboard?.off("keydown", this.keyHandler));
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height * 0.16);
    this.emojiText.setPosition(width / 2, height * 0.32);
    this.typingText.setPosition(width / 2, height * 0.58);
  }

  private startRound() {
    this.clearRound();
    this.roundCorrect = true;
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private isTypingLevel() {
    return this.typing && this.levelIndex + 1 >= TYPING_THRESHOLD;
  }

  private askQuestion() {
    this.clearRound();
    this.locked = false;
    this.solvedCount = 0;
    // pick a word, avoid repeating the previous target
    let w = WORDS[Phaser.Math.Between(0, WORDS.length - 1)];
    if (this.target && w.word === this.target.word) {
      w = WORDS[(WORDS.indexOf(w) + 1) % WORDS.length];
    }
    this.target = w;
    this.emojiText.setText(w.emoji);
    speak(w.word, { lang: "bn" });

    if (this.isTypingLevel()) {
      this.typingActive = true;
      this.typed = "";
      this.targetRomans = ROMAN[w.word] ?? [w.word];
      this.targetRoman = this.targetRomans[0] ?? w.word;
      this.prompt.set(t("typeSpellPrompt"));
      this.typingText.setText("").setVisible(true);
      this.spawnTypingSlots();
      this.spawnKeyboard();
    } else {
      this.typingActive = false;
      this.typingText.setText("").setVisible(false);
      this.prompt.set(t("spellPrompt"));
      this.spawnTapSlots(w);
    }
    this.armChallenge();
  }

  /** #1140 — tier 1-2 (and the whole bn-spelling skill): the ORIGINAL tap path,
   *  unchanged. Letter slots on top, tile tray below. */
  private spawnTapSlots(w: { emoji: string; word: string; letters: string[] }) {
    const n = w.letters.length;
    const { width, height } = this.scale;
    const slotW = Math.min(96, width / (n + 0.6) - 12);
    const slotY = height * 0.5;
    const gap = width / (n + 1);
    for (let i = 0; i < n; i++) {
      const c = modernCardButton(this, gap * (i + 1), slotY, slotW, 62, "·", BTN_NEUTRAL, 26, slotW - 8);
      this.slots.push(c);
    }

    // tile tray = correct letters + distractor count from level (2..4)
    const distractors = DISTRACTORS.filter((d) => !w.letters.includes(d)).sort(() => Math.random() - 0.5);
    const extra = Math.min(this.levels[Math.min(this.levelIndex, this.levels.length - 1)], 4);
    const tray = [...w.letters, ...distractors.slice(0, extra)].sort(() => Math.random() - 0.5);
    const tw = Math.min(76, width / (tray.length + 0.6) - 10);
    const ty = height - 84 - SAB();
    const tgap = width / (tray.length + 1);
    tray.forEach((letter, i) => {
      const c = modernCardButton(this, tgap * (i + 1), ty, tw, 60, letter, BTN_PRIMARY, 22, tw - 8);
      c.on("pointerdown", () => this.tap(c, letter));
      this.tiles.push({ sprite: c, letter });
    });
  }

  private tap(container: Phaser.GameObjects.Container, letter: string) {
    if (this.locked) return;
    const expected = this.target.letters[this.solvedCount];
    if (letter !== expected) {
      hintWrong(this, container, {
        hint: () => `Which letter comes next in ${this.target.word}?`,
        hintBn: () => `${this.target.word} শব্দে কোন অক্ষরটা পরের?`,
        correct: () => expected,
        options: () => this.tiles.map((o) => ({ sprite: o.sprite, value: o.letter })),
        challenge: this.challenge, // #1158 — no banner/reveal in challenge mode
      });
      return;
    }
    this.challengeDone = true;
    this.disarmChallenge();
    pop();
    correctButton(container);
    ringCorrect(this, container);
    this.tiles = this.tiles.filter((o) => o.sprite !== container);
    container.setAlpha(0.4).setInteractive(false);
    const slot = this.slots[this.solvedCount];
    slot.destroy();
    const label = this.add
      .text(slot.x, slot.y, letter, txt(26, NV_GREEN, { bold: true }))
      .setOrigin(0.5).setDepth(5);
    this.slots[this.solvedCount] = label as unknown as Phaser.GameObjects.Container;
    this.solvedCount++;
    if (this.solvedCount >= this.target.letters.length) {
      this.locked = true;
      win();
      speak(this.target.word, { lang: "bn" });
      this.prompt.set(t("spellGreat", { w: this.target.word }));
      this.floatMsg(this.target.word);
      this.qInRound++;
      this.time.delayedCall(700, () => {
        if (this.qInRound >= QUESTIONS_PER_ROUND) this.finishRound();
        else this.askQuestion();
      });
    }
  }

  /** #1140 — production-spelling tier: one live input slot per English letter,
   *  plus a visible Phaser.Text that echoes the typed word. */
  private spawnTypingSlots() {
    const n = Math.max(1, this.targetRoman.length);
    const { width, height } = this.scale;
    const slotW = Math.min(96, width / (n + 0.6) - 12);
    const slotY = height * 0.5;
    const gap = width / (n + 1);
    for (let i = 0; i < n; i++) {
      const c = modernCardButton(this, gap * (i + 1), slotY, slotW, 62, "·", BTN_NEUTRAL, 26, slotW - 8);
      this.slots.push(c);
    }
  }

  /** On-screen QWERTY for touch devices. Every key routes through the SAME
   *  handler as the physical keyboard (`typeKey`). */
  private spawnKeyboard() {
    this.keyboardKeys.forEach((k) => k.destroy());
    this.keyboardKeys = [];
    const { width, height } = this.scale;
    const keyH = 42;
    const rowGap = keyH + 8;
    const bottomY = height - 20 - SAB();
    QWERTY_ROWS.forEach((row, ri) => {
      const y = bottomY - (QWERTY_ROWS.length - 1 - ri) * rowGap;
      const count = row.length;
      const kw = Math.min(30, (width - 16) / count - 4);
      const gap = width / (count + 1);
      row.forEach((key, i) => {
        const label = key === "Backspace" ? "⌫" : key === "Enter" ? "⏎" : key;
        const isSpecial = key === "Backspace" || key === "Enter";
        const c = modernCardButton(
          this,
          gap * (i + 1),
          y,
          kw,
          keyH,
          label,
          isSpecial ? BTN_ORANGE : BTN_NEUTRAL,
          isSpecial ? 16 : 20,
          kw - 4
        );
        c.on("pointerdown", () => this.typeKey(key));
        this.keyboardKeys.push(c);
      });
    });
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (!this.typingActive || this.locked) return;
    const key = event.key;
    if (key === "Backspace" || key === "Enter") {
      event.preventDefault();
      this.typeKey(key);
      return;
    }
    if (/^[a-zA-Z]$/.test(key)) {
      event.preventDefault();
      this.typeKey(key.toLowerCase());
    }
  }

  private typeKey(key: string) {
    if (this.locked || !this.typingActive) return;
    if (key === "Backspace") {
      this.typed = this.typed.slice(0, -1);
      this.updateTypingUI();
      return;
    }
    if (key === "Enter") {
      this.checkTyped();
      return;
    }
    if (!/^[a-z]$/.test(key)) return;
    if (this.typed.length >= this.targetRoman.length) {
      this.checkTyped();
      return;
    }
    this.typed += key;
    this.updateTypingUI();
    if (this.typed.length >= this.targetRoman.length) {
      this.checkTyped();
    }
  }

  private updateTypingUI() {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const api = slot.getData("nv-btn") as { setLabel(text: string): void } | undefined;
      api?.setLabel(i < this.typed.length ? this.typed[i] : "·");
    }
    this.typingText.setText(this.typed);
  }

  private checkTyped() {
    if (this.locked || !this.typed) return;
    if (this.targetRomans.includes(this.typed)) {
      this.submitTypedCorrect();
      return;
    }
    hintWrong(this, this.slots[0], {
      hint: () => `Type the Bangla word for ${this.target.word} with English letters.`,
      hintBn: () => `${this.target.word} শব্দটা ইংরেজি অক্ষরে টাইপ করো।`,
      correct: () => this.target.word,
      keepOnWrong: true, // live input slots are never retired
      challenge: this.challenge, // #1158 — no reveal in challenge mode
    });
    this.typed = "";
    this.updateTypingUI();
  }

  private submitTypedCorrect() {
    this.locked = true;
    this.challengeDone = true;
    this.disarmChallenge();
    pop();
    const lastSlot = this.slots[Math.max(0, this.typed.length - 1)];
    correctButton(lastSlot);
    ringCorrect(this, lastSlot);
    win();
    speak(this.target.word, { lang: "bn" });
    this.prompt.set(t("spellGreat", { w: this.target.word }));
    this.floatMsg(this.target.word);
    this.qInRound++;
    this.time.delayedCall(700, () => {
      if (this.qInRound >= QUESTIONS_PER_ROUND) this.finishRound();
      else this.askQuestion();
    });
  }

  /** #1158 — challenge-mode countdown: a gold bar drains over CHALLENGE_SECONDS;
   *  time-up marks the round wrong and deals the next question. No re-teach. */
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
    this.challengeTimer = this.time.delayedCall(CHALLENGE_SECONDS * 1000, () => this.onChallengeTimeout());
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

  private onChallengeTimeout() {
    if (this.challengeDone) return;
    this.challengeDone = true;
    this.disarmChallenge();
    this.roundCorrect = false;
    this.locked = true;
    this.typed = "";
    this.updateTypingUI();
    this.qInRound++;
    this.time.delayedCall(450, () => {
      if (this.qInRound >= QUESTIONS_PER_ROUND) this.finishRound();
      else this.askQuestion();
    });
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.roundCorrect, ms, this.levelIndex + 1);
    this.time.delayedCall(400, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.72, text, txt(30, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 800, onComplete: () => m.destroy() });
  }

  private clearRound() {
    this.slots.forEach((s) => s.destroy());
    this.slots = [];
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
    this.keyboardKeys.forEach((k) => k.destroy());
    this.keyboardKeys = [];
    this.typed = "";
    this.typingText?.setText("");
    this.disarmChallenge();
  }
}

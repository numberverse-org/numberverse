import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { win, pop, playNote } from "./audio";
import { speak } from "./speech";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, correctButton, ringCorrect, roundMeter, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-rhymes")?.difficultyLevels ?? [2, 2, 1, 1, 0, 0];
const ROUNDS_TO_FINISH = 3;
/** guide: 2 = ring stays until tapped · 1 = ring fades · 0 = listen only */
const GUIDE = [2, 2, 1, 1, 0, 0];
const RING_MS = [0, 0, 900, 900, 0, 0];
const CHIP_H = 64;
const CHIP_GAP = 12;
const LINE_GAP = 16;
/** Pentatonic ladder — tapping along literally SINGS the rhyme. */
const MELODY = [261.63, 293.66, 329.63, 392.0, 440.0];

interface Rhyme {
  title: string;
  words: string[];
}
/* 5 classic NCTB Bangla nursery rhymes (traditional, public domain). Each is a
 * short 2-line verse split into tappable word chips. */
const RHYMES: Rhyme[] = [
  { title: "হাট্টিমাটিম টিম", words: ["হাট্টিমাটিম", "টিম,", "তুমি", "যেও", "না", "নিম।"] },
  { title: "আয় রে ভাই", words: ["আয়", "রে", "ভাই,", "আয়", "রে", "ভাই,", "এক", "চালে", "যাই।"] },
  { title: "খোকা ঘুমালো", words: ["খোকা", "ঘুমালো,", "পাড়া", "জুড়ালো,", "বর্গি", "এলো", "দেশে।"] },
  { title: "বৃষ্টি পড়ে", words: ["বৃষ্টি", "পড়ে", "টাপুর", "টুপুর,", "নদে", "এলো", "বান।"] },
  { title: "চাঁদ উঠেছে", words: ["আকাশে", "চাঁদ", "উঠেছে,", "জলে", "চাঁদ", "পড়েছে।"] },
];

/**
 * Nova's Rhyme Time — NCTB rhymes tap-along (#162).
 * Band 1 (ages 2–4): Nova "sings" a classic Bangla rhyme word by word. The
 * kid taps along, word by word — every correct tap plays the next note of a
 * pentatonic melody, so tapping along literally builds the song. Words are
 * spoken warmly in Bangla; the full rhyme is recited + a little arpeggio when
 * a verse is complete. Guide levels ramp how much the current word is revealed:
 * level 0-1 strong gold ring, 2-3 ring fades after the word is heard, 4-5
 * listen-only (find the word you heard).
 */
export class RhymeTimeScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private rhyme!: Rhyme;
  private wordIdx = 0;
  private chips: { sprite: Phaser.GameObjects.Container; word: string }[] = [];
  private ringGfx!: Phaser.GameObjects.Graphics;
  private rhymeTitle!: Phaser.GameObjects.Text;
  private readBtn!: Phaser.GameObjects.Container;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("RhymeTime");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, t("titleRhymes"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("ryPrompt"));
    this.meter = roundMeter(this);
    this.rhymeTitle = this.add
      .text(0, 0, "", txt(24, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5);
    this.ringGfx = this.add.graphics().setDepth(6);
    this.readBtn = modernCardButton(this, 0, 0, 84, 60, "🔊", BTN_ORANGE, 32);
    this.readBtn.on("pointerdown", () => this.singWhole());
    this.readBtn.setDepth(3);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, Math.max(168, height * 0.15));
    this.rhymeTitle.setPosition(width / 2, height * 0.21);
    this.readBtn.setPosition(width - 58, 138);
    this.layoutChips();
  }

  private layoutChips() {
    if (!this.rhyme || this.chips.length === 0) return;
    const { width } = this.scale;
    const maxW = Math.min(width * 0.94, 620);
    const measure = this.rhyme.words.map((w) =>
      this.add.text(0, 0, w, txt(30, "#000000", { bold: true })).setOrigin(0.5)
    );
    const sizes = measure.map((m) => ({ w: m.width + 26, h: CHIP_H }));
    const rows: number[][] = [];
    let row: number[] = [];
    let rowW = 0;
    this.rhyme.words.forEach((_, i) => {
      const cw = sizes[i].w;
      if (row.length && rowW + CHIP_GAP + cw > maxW) {
        rows.push(row);
        row = [];
        rowW = 0;
      }
      row.push(i);
      rowW += cw + (row.length > 1 ? CHIP_GAP : 0);
    });
    if (row.length) rows.push(row);
    const startY = this.scale.height * 0.27;
    const lineH = CHIP_H + LINE_GAP;
    let k = 0;
    rows.forEach((r, ri) => {
      const rw = r.reduce((s, i) => s + sizes[i].w + CHIP_GAP, 0) - CHIP_GAP;
      let x = width / 2 - rw / 2;
      r.forEach((i) => {
        const chip = this.chips[k++];
        chip.sprite.setPosition(x + sizes[i].w / 2, startY + ri * lineH + CHIP_H / 2);
        x += sizes[i].w + CHIP_GAP;
      });
    });
    measure.forEach((m) => m.destroy());
  }

  private startRound() {
    this.clearChips();
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.pickRhyme();
    this.layoutChips();
    this.advance(0);
  }

  private pickRhyme() {
    let r = RHYMES[Phaser.Math.Between(0, RHYMES.length - 1)];
    if (r === this.rhyme) r = RHYMES[(RHYMES.indexOf(r) + 1) % RHYMES.length];
    this.rhyme = r;
    this.rhymeTitle.setText(r.title);
    const maxW = Math.min(this.scale.width * 0.94, 620);
    const measure = r.words.map((w) => this.add.text(0, 0, w, txt(30, "#000000", { bold: true })).setOrigin(0.5));
    const sizes = measure.map((m) => ({ w: m.width + 26, h: CHIP_H }));
    measure.forEach((m) => m.destroy());
    r.words.forEach((w, i) => {
      const chip = modernCardButton(this, 0, 0, sizes[i].w, CHIP_H, w, BTN_NEUTRAL, 28, sizes[i].w - 8);
      chip.on("pointerdown", () => this.tap(chip));
      this.chips.push({ sprite: chip, word: w });
    });
  }

  private advance(idx: number) {
    this.wordIdx = idx;
    this.locked = false;
    this.ringGfx.clear();
    if (idx >= this.chips.length) {
      this.finishRhyme();
      return;
    }
    const chip = this.chips[idx].sprite;
    speak(this.chips[idx].word, { lang: "bn" });
    const guide = GUIDE[Math.min(this.levelIndex, GUIDE.length - 1)];
    if (guide >= 2) {
      this.showRing(chip);
    } else if (guide === 1) {
      this.showRing(chip);
      const fade = RING_MS[Math.min(this.levelIndex, RING_MS.length - 1)];
      this.time.delayedCall(fade, () => {
        if (this.wordIdx === idx && !this.locked) this.ringGfx.clear();
      });
    }
  }

  private showRing(chip: Phaser.GameObjects.Container) {
    const w = chip.width;
    const h = chip.height;
    this.ringGfx.clear();
    this.ringGfx.lineStyle(6, 0xffd166, 1);
    this.ringGfx.strokeRoundedRect(chip.x - w / 2, chip.y - h / 2, w, h, 18);
    this.ringGfx.lineStyle(2, 0xffffff, 0.9);
    this.ringGfx.strokeRoundedRect(chip.x - w / 2 - 5, chip.y - h / 2 - 5, w + 10, h + 10, 24);
  }

  private tap(container: Phaser.GameObjects.Container) {
    if (this.locked) return;
    // match by CHIP identity, not word string — a repeated word ("আয় আয়")
    // still has one correct chip at a time.
    if (container !== this.chips[this.wordIdx].sprite) {
      // not the current word — pulse the target + re-speak it, never a fail
      const target = this.chips[this.wordIdx].sprite;
      this.tweens.add({ targets: target, scale: 1.1, duration: 120, yoyo: true });
      this.floatMsg(t("ryAgain"));
      speak(this.chips[this.wordIdx].word, { lang: "bn" });
      return;
    }
    this.locked = true;
    this.ringGfx.clear();
    pop();
    playNote(MELODY[this.wordIdx % MELODY.length], 0.24);
    ringCorrect(this, container);
    speak(this.chips[this.wordIdx].word, { lang: "bn" });
    const idx = this.wordIdx;
    this.time.delayedCall(320, () => {
      if (this.wordIdx === idx) this.advance(idx + 1);
    });
  }

  private singWhole() {
    if (!this.rhyme) return;
    speak(this.rhyme.words.join(" "), { lang: "bn" });
  }

  private finishRhyme() {
    this.locked = true;
    this.singWhole();
    win();
    // little closing arpeggio — the whole verse is the melody
    MELODY.forEach((f, i) => playNote(f, 0.3, "sine", undefined, i * 0.11));
    this.floatMsg(t("ryDone"));
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, Math.max(1, this.time.now - this.startedAt), this.levelIndex + 1);
    this.time.delayedCall(1000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.6, text, txt(26, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 900, onComplete: () => m.destroy() });
  }

  private clearChips() {
    this.chips.forEach((o) => o.sprite.destroy());
    this.chips = [];
    this.ringGfx.clear();
  }
}

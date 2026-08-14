import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, BTN_PRIMARY, BTN_ORANGE, btnFromColor, type BtnStyle, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-sentencebuilder")?.difficultyLevels ?? [1, 1, 2, 2, 2, 2];
const ROUNDS_TO_FINISH = 3;
const SENTENCES_PER_ROUND = 3;
/** levels 0-2 show colored slots (scaffold); 3+ go neutral (pure word order). */
const SLOTS_COLORED = [true, true, true, false, false, false];
const SLOT_H = 76;
const TILE_W = 110;
const TILE_H = 68;

type Role = "subject" | "verb" | "object" | "none";

interface Sentence {
  s: string;
  v: string;
  o: string;
}
/* 12 simple SVO sentence patterns — subjects/verbs/objects a band-2 reader knows.
 * Each role gets a tile color: subject orange, verb teal, object green. */
const SENTENCES: Sentence[] = [
  { s: "আমি", v: "খাই", o: "ভাত" },
  { s: "তুমি", v: "আঁকো", o: "ছবি" },
  { s: "সে", v: "পড়ে", o: "বই" },
  { s: "বাবা", v: "কিনলেন", o: "মাছ" },
  { s: "মা", v: "বানান", o: "রুটি" },
  { s: "নানু", v: "বলে", o: "গল্প" },
  { s: "রফিক", v: "খেলে", o: "ফুটবল" },
  { s: "ছেলেটি", v: "খেলে", o: "বল" },
  { s: "মেয়েটি", v: "গায়", o: "গান" },
  { s: "পাখিটি", v: "উড়ে", o: "আকাশে" },
  { s: "কুকুরটি", v: "খায়", o: "মাংস" },
  { s: "দিদি", v: "পড়ে", o: "গল্প" },
];
const ROLE_STYLE: Record<Role, BtnStyle> = {
  subject: BTN_ORANGE,
  verb: BTN_PRIMARY,
  object: btnFromColor(0x2f9e44),
  none: btnFromColor(0x8a94a6),
};

/**
 * Bangla Sentence Builder (#160).
 * Band 2 (ages 4–6): arrange colored tiles into a correct simple sentence
 * (subject → verb → object). Correct tiles are ROLE-COLORED (orange / teal /
 * green); distractors are grey. Tiles snap into the next empty slot in SVO
 * order — tap out of order and the tile is gently coached back (never killed).
 * Grey distractors are retired. Every placed word is spoken warmly; the full
 * sentence is read aloud when all three slots fill. Levels add distractors
 * (1 → 2) and levels 3+ drop the slot color-scaffold so order comes purely
 * from grammar.
 */
export class SentenceBuilderScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private sentence!: Sentence;
  private filled: (string | null)[] = [null, null, null];
  private tiles: { sprite: Phaser.GameObjects.Container; word: string; role: Role }[] = [];
  private slotX: number[] = [];
  private slotY = 0;
  private slotW = 0;
  private slotGfx!: Phaser.GameObjects.Graphics;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("SentenceBuilder");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleSentenceBuild"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("sbPrompt"));
    this.meter = roundMeter(this);
    this.slotGfx = this.add.graphics().setDepth(1);
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
    this.slotY = height * 0.4;
    this.slotW = Math.min(160, (width - 64) / 3 - 14);
    this.slotX = [0, 1, 2].map((i) => width / 2 + (i - 1) * (this.slotW + 16));
    this.drawSlots();
  }

  private drawSlots() {
    const g = this.slotGfx.clear();
    for (let i = 0; i < 3; i++) {
      const x = this.slotX[i];
      const colored = SLOTS_COLORED[Math.min(this.levelIndex, SLOTS_COLORED.length - 1)];
      if (colored) {
        const hex = i === 0 ? 0xef7a18 : i === 1 ? 0x0c9ce2 : 0x2f9e44;
        g.fillStyle(hex, 0.28);
        g.fillRoundedRect(x - this.slotW / 2, this.slotY - SLOT_H / 2, this.slotW, SLOT_H, 18);
      }
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeRoundedRect(x - this.slotW / 2, this.slotY - SLOT_H / 2, this.slotW, SLOT_H, 18);
    }
  }

  private startRound() {
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.drawSlots();
    this.askSentence();
  }

  private nextRole(): Role {
    return (["subject", "verb", "object"] as Role[])[this.filled.findIndex((f) => f === null)];
  }

  private nextWord(): string {
    const s = this.sentence;
    const next = this.nextRole();
    return next === "subject" ? s.s : next === "verb" ? s.v : s.o;
  }

  private pickDistractors(s: Sentence, n: number): string[] {
    const used = new Set([s.s, s.v, s.o]);
    const pool = SENTENCES.filter((x) => x !== s)
      .flatMap((x) => [x.s, x.v, x.o])
      .filter((w) => !used.has(w) && !w.includes(" ") && w.length <= 8)
      .filter((w, i, a) => a.indexOf(w) === i);
    const out: string[] = [];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    for (const w of shuffled) {
      if (out.length >= n) break;
      out.push(w);
    }
    return out;
  }

  private askSentence() {
    this.clearTiles();
    this.locked = false;
    this.filled = [null, null, null];
    this.drawSlots();
    let s = SENTENCES[Phaser.Math.Between(0, SENTENCES.length - 1)];
    if (SENTENCES.length > 1 && s === this.sentence) {
      s = SENTENCES[(SENTENCES.indexOf(s) + 1) % SENTENCES.length];
    }
    this.sentence = s;
    const correct = [
      { word: s.s, role: "subject" as Role },
      { word: s.v, role: "verb" as Role },
      { word: s.o, role: "object" as Role },
    ];
    const distract = this.pickDistractors(s, LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)]);
    const bank = [...correct, ...distract.map((w) => ({ word: w, role: "none" as Role }))].sort(
      () => Math.random() - 0.5
    );
    const n = bank.length;
    const gap = this.scale.width / (n + 1);
    const y = this.scale.height - 150 - SAB();
    bank.forEach((b, i) => {
      const c = modernCardButton(this, gap * (i + 1), y, TILE_W, TILE_H, b.word, ROLE_STYLE[b.role], 26, TILE_W - 8);
      c.on("pointerdown", () => this.tap(c, b.word, b.role));
      this.tiles.push({ sprite: c, word: b.word, role: b.role });
    });
  }

  private tap(container: Phaser.GameObjects.Container, word: string, role: Role) {
    if (this.locked) return;
    const next = this.nextRole();
    const nextWord = this.nextWord();
    if (role === "none" || word !== nextWord) {
      // Distractor (grey) — retire it. Colored-but-out-of-order — keep it alive.
      hintWrong(this, container, {
        keepOnWrong: role !== "none",
        hint: () => this.hintText(next),
        hintBn: () => this.hintTextBn(next),
        correct: () => nextWord,
        options: () => this.tiles.map((o) => ({ sprite: o.sprite, value: o.word })),
      });
      return;
    }
    this.locked = true;
    const idx = ["subject", "verb", "object"].indexOf(role);
    pop();
    container.disableInteractive();
    container.setDepth(5);
    this.tweens.add({
      targets: container,
      x: this.slotX[idx],
      y: this.slotY,
      scale: 1.05,
      duration: 240,
      ease: "Back.easeOut",
      onComplete: () => {
        speak(word, { lang: "bn" });
        this.filled[idx] = word;
        this.locked = false;
        if (this.filled.every((f) => f !== null)) {
          this.finishSentence();
        }
      },
    });
  }

  private hintText(next: Role): string {
    if (next === "subject") return "Start with WHO — who is doing it!";
    if (next === "verb") return "Now the ACTION — what is happening!";
    return "Finish with the rest of the sentence!";
  }

  private hintTextBn(next: Role): string {
    if (next === "subject") return "কার কথা — কে করছে, তা দিয়ে শুরু করো!";
    if (next === "verb") return "এবার কাজটা — কী ঘটছে!";
    return "শেষ করো বাক্যটার বাকিটা দিয়ে!";
  }

  private finishSentence() {
    const s = this.sentence;
    speak(`${s.s} ${s.v} ${s.o}`, { lang: "bn" });
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.floatMsg(`${s.s} ${s.v} ${s.o}`);
    this.qInRound++;
    if (this.qInRound >= SENTENCES_PER_ROUND) {
      this.time.delayedCall(1100, () => this.finishRound());
    } else {
      this.time.delayedCall(1100, () => this.askSentence());
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.floatMsg(t("sbDone"));
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.62, text, txt(30, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 30, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearTiles() {
    this.tiles.forEach((o) => o.sprite.destroy());
    this.tiles = [];
  }
}

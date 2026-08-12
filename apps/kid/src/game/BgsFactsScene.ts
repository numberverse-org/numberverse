import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-bgs")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
interface Fact {
  q: string;
  options: string[];
  answer: string;
  emoji: string;
  /** 1 = symbols, 2 = geography, 3 = history — harder later. */
  tier: 1 | 2 | 3;
  /** Near-miss distractor added at high levels. */
  trick?: string;
  /** #20 — heritage facts shown only for the bgs-heritage skill (band 7). */
  kind?: "heritage";
}
const FACTS: Fact[] = [
  { q: "Capital of Bangladesh?", options: ["ঢাকা", "চট্টগ্রাম", "খুলনা"], answer: "ঢাকা", emoji: "🏙️", tier: 1 },
  { q: "National flower?", options: ["শাপলা", "গোলাপ", "সূর্যমুখী"], answer: "শাপলা", emoji: "🌸", tier: 1, trick: "শিমুল" },
  { q: "National animal?", options: ["বাঘ", "সিংহ", "হাতি"], answer: "বাঘ", emoji: "🐅", tier: 1 },
  { q: "National bird?", options: ["দোয়েল", "কাক", "ময়ূর"], answer: "দোয়েল", emoji: "🐦", tier: 1, trick: "বুলবুলি" },
  { q: "National fish?", options: ["ইলিশ", "রুই", "কাতলা"], answer: "ইলিশ", emoji: "🐟", tier: 1, trick: "পাবদা" },
  { q: "Longest river?", options: ["পদ্মা", "মেঘনা", "যমুনা"], answer: "পদ্মা", emoji: "🌊", tier: 2 },
  { q: "Largest sea beach?", options: ["কক্সবাজার", "পটুয়াখালী", "সেন্ট মার্টিন"], answer: "কক্সবাজার", emoji: "🏖️", tier: 2 },
  { q: "National fruit?", options: ["কাঁঠাল", "আম", "কলা"], answer: "কাঁঠাল", emoji: "🍈", tier: 2, trick: "লিচু" },
  { q: "National tree?", options: ["আমগাছ", "বটগাছ", "নারকেল"], answer: "আমগাছ", emoji: "🌳", tier: 2, trick: "কদম" },
  { q: "Independence year?", options: ["১৯৭১", "১৯৪৭", "১৯৫২"], answer: "১৯৭১", emoji: "🇧🇩", tier: 3, trick: "১৯৬৯" },
  { q: "What is the national anthem called?", options: ["আমার সোনার বাংলা", "জনগণমন", "ভারত ভাগ্য বিধাতা"], answer: "আমার সোনার বাংলা", emoji: "🎵", tier: 3, trick: "নতুনের গান" },
  { q: "Language Martyrs' Day?", options: ["২১ ফেব্রুয়ারি", "১৬ ডিসেম্বর", "২৬ মার্চ"], answer: "২১ ফেব্রুয়ারি", emoji: "🌺", tier: 3, trick: "১ মার্চ" },
  { q: "National sport?", options: ["হা-ডু-ডু", "ক্রিকেট", "ফুটবল"], answer: "হা-ডু-ডু", emoji: "🏃", tier: 2, trick: "দাবা" },
  { q: "What is our money called?", options: ["টাকা", "রুপি", "ডলার"], answer: "টাকা", emoji: "💵", tier: 2, trick: "পয়সা" },
  { q: "Highest mountain peak?", options: ["তাজিংডং", "কেওক্রাডং", "চিম্বুক"], answer: "তাজিংডং", emoji: "⛰️", tier: 2, trick: "সাজেক" },
  { q: "Victory Day?", options: ["১৬ ডিসেম্বর", "২৬ মার্চ", "২১ ফেব্রুয়ারি"], answer: "১৬ ডিসেম্বর", emoji: "🎉", tier: 3, trick: "১৪ ডিসেম্বর" },
];

/** #20 — Band 7 heritage facts: festivals, crafts, foods, landmarks.
 *  Real, kid-safe, and they keep the tier ladder honest (all tier 3). */
const HERITAGE_FACTS: Fact[] = [
  { q: "Which festival celebrates the Bangla New Year?", options: ["পহেলা বৈশাখ", "দীপাবলি", "ক্রিসমাস"], answer: "পহেলা বৈশাখ", emoji: "🎭", tier: 3, trick: "পহেলা ফাল্গুন", kind: "heritage" },
  { q: "The spring festival of colors is called…?", options: ["পহেলা ফাল্গুন", "শবে বরাত", "ইদের চাঁদ"], answer: "পহেলা ফাল্গুন", emoji: "🌼", tier: 3, trick: "বসন্ত উৎসব", kind: "heritage" },
  { q: "What winter treat is a steamed rice-cake?", options: ["পিঠা", "বিরিয়ানি", "রুটি"], answer: "পিঠা", emoji: "🍥", tier: 3, trick: "পায়েস", kind: "heritage" },
  { q: "Which world-famous fine cloth is from Bengal?", options: ["ঢাকাই মসলিন", "সিল্ক", "ডেনিম"], answer: "ঢাকাই মসলিন", emoji: "🧵", tier: 3, trick: "লেহেঙ্গা", kind: "heritage" },
  { q: "Embroidered quilt stitched by village women is…?", options: ["নকশী কাঁথা", "কম্বল", "তসর"], answer: "নকশী কাঁথা", emoji: "🪡", tier: 3, trick: "দুপাট্টা", kind: "heritage" },
  { q: "The 60-dome mosque is at…?", options: ["বাগেরহাট", "ঢাকা", "সিলেট"], answer: "বাগেরহাট", emoji: "🕌", tier: 3, trick: "পাহাড়পুর", kind: "heritage" },
  { q: "The ancient Buddhist monastery Somapura is in…?", options: ["পাহাড়পুর", "বরিশাল", "কক্সবাজার"], answer: "পাহাড়পুর", emoji: "🏛️", tier: 3, trick: "ময়নামতি", kind: "heritage" },
  { q: "Our national fish is…?", options: ["ইলিশ", "রুই", "কাতলা"], answer: "ইলিশ", emoji: "🐟", tier: 3, trick: "পাবদা", kind: "heritage" },
  { q: "The harvest festival after the rice season is…?", options: ["নবান্ন", "ইদ", "বসন্ত"], answer: "নবান্ন", emoji: "🌾", tier: 3, trick: "পিঠা উৎসব", kind: "heritage" },
  { q: "Pohela Boishakh falls in which month?", options: ["বৈশাখ", "জ্যৈষ্ঠ", "আষাঢ়"], answer: "বৈশাখ", emoji: "📅", tier: 3, trick: "ফাল্গুন", kind: "heritage" },
];
const BUTTON_RADIUS = 54;
const ROUNDS_TO_FINISH = 3;

/** Facts that match the current level — symbols → geography → history.
 *  Heritage mode (bgs-heritage) shows only the band-7 heritage facts. */
function factsForLevel(level: number, heritage: boolean): Fact[] {
  const tier = level >= 4 ? 3 : level >= 2 ? 2 : 1;
  const pool = heritage ? HERITAGE_FACTS : FACTS;
  return pool.filter((f) => f.tier <= tier);
}

/**
 * Bangladesh Facts — learn about the country.
 * Band 5 (ages 10–13, BGS). Multiple-choice national symbols & geography.
 * Level 1–2 symbols, 3–4 + geography, 5–6 + history AND a near-miss trick
 * option so the 6-tier ladder is real.
 */
export class BgsFactsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private heritageMode = false;
  private target!: Fact;
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private questionText!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("BgsFacts");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; skill?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    // #20 — bgs-heritage (band 7) draws only the heritage fact pool.
    this.heritageMode = data.skill === "bgs-heritage";
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleBgs"), txt(32, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", {bold: true}))
      .setOrigin(0.5);
    this.questionText = this.add
      .text(0, 0, "", txt(30, "#ffd166", {bold: true, align: "center", wrap: 340}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("tapAnswer"));
    this.meter = roundMeter(this);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "sunset");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.questionText.setPosition(width / 2, height * 0.38);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.clearButtons();
    const pool = factsForLevel(this.levelIndex, this.heritageMode);
    this.target = pool[Phaser.Math.Between(0, pool.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.questionText.setText(`${this.target.emoji} ${this.target.q}`);
    speak(this.target.q);
    this.spawnButtons();
  }

  private spawnButtons() {
    // High levels add a near-miss "trick" distractor (4 options instead of 3).
    const opts = this.levelIndex >= 4 && this.target.trick
      ? [...this.target.options, this.target.trick].sort(() => Math.random() - 0.5)
      : [...this.target.options].sort(() => Math.random() - 0.5);
    const { width } = this.scale;
    // 4 options need smaller buttons so they fit side-by-side on a phone.
    const radius = opts.length > 3 ? Math.min(BUTTON_RADIUS - 6, (width - 80) / (opts.length * 2)) : BUTTON_RADIUS;
    const spacing = radius * 2 + 8;
    const startX = width / 2 - (spacing * (opts.length - 1)) / 2;
    const y = this.answersY;
    opts.forEach((value, i) => {
      // Bangla answers can be long — wrap inside the button so the text never
      // spills out of the circle and overlaps the neighbouring option.
      const c = modernAnswerButton(this, startX + i * spacing, y, radius, value, BTN_PRIMARY, { labelSize: Math.max(15, Math.round(radius * 0.44)), wrap: radius * 2 - 12 });
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: string) {
    if (value !== this.target.answer) {
      hintWrong(this, container, {
        hint: "Read the fact again and pick the answer it points to",
        hintBn: "তথ্যটি আবার পড়ো এবং যে উত্তরটা বোঝায় সেটি বেছে নাও",
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

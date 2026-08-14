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
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
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
  /** #20 — heritage facts shown only for the bgs-heritage skill (band 7).
   *  #756 — civic facts shown only for the band-4 BGS skills (bgs-our-country /
   *  bgs-good-citizens): class-3/4 geography + civic responsibilities. */
  kind?: "heritage" | "civic";
}
// #1174 — heritage cultural tokens (নকশী কাঁথা, পহেলা বৈশাখ…) come from the ONE
// canonical spelling bank, so the fact drill can never drift from the festival
// sort scene (fcNakshiKantha / fcBoishakh read the same spellings).
import { BANGLA_HERITAGE_TOKENS as H } from "./wordBanks";

/** ONE fact bank, both skills (#1174): plain entries are the band-5 national
 *  facts; `kind: "heritage"` entries are the band-7 heritage-only drill. The
 *  national-fish fact lives ONCE here (its heritage twin was a duplicate), and
 *  shared cultural spellings resolve through H. */
const FACTS: Fact[] = [
  // ── national facts (bgs-bangladesh) ──
  { q: "Capital of Bangladesh?", options: ["ঢাকা", "চট্টগ্রাম", "খুলনা"], answer: "ঢাকা", emoji: "🏙️", tier: 1 },
  { q: "National flower?", options: ["শাপলা", "গোলাপ", "সূর্যমুখী"], answer: "শাপলা", emoji: "🌸", tier: 1, trick: "শিমুল" },
  { q: "National animal?", options: ["বাঘ", "সিংহ", "হাতি"], answer: "বাঘ", emoji: "🐅", tier: 1 },
  { q: "National bird?", options: ["দোয়েল", "কাক", "ময়ূর"], answer: "দোয়েল", emoji: "🐦", tier: 1, trick: "বুলবুলি" },
  { q: "National fish?", options: [H.hilsa, "রুই", "কাতলা"], answer: H.hilsa, emoji: "🐟", tier: 1, trick: "পাবদা" },
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
  // ── heritage facts (bgs-heritage, band 7) — all tier 3 ──
  { q: "Which festival celebrates the Bangla New Year?", options: [H.pohelaBoishakh, "দীপাবলি", "ক্রিসমাস"], answer: H.pohelaBoishakh, emoji: "🎭", tier: 3, trick: H.pohelaFalgun, kind: "heritage" },
  { q: "The spring festival of colors is called…?", options: [H.pohelaFalgun, "শবে বরাত", "ইদের চাঁদ"], answer: H.pohelaFalgun, emoji: "🌼", tier: 3, trick: "বসন্ত উৎসব", kind: "heritage" },
  { q: "What winter treat is a steamed rice-cake?", options: [H.pitha, "বিরিয়ানি", "রুটি"], answer: H.pitha, emoji: "🍥", tier: 3, trick: "পায়েস", kind: "heritage" },
  { q: "Which world-famous fine cloth is from Bengal?", options: [H.dhakaiMuslin, "সিল্ক", "ডেনিম"], answer: H.dhakaiMuslin, emoji: "🧵", tier: 3, trick: "লেহেঙ্গা", kind: "heritage" },
  { q: "Embroidered quilt stitched by village women is…?", options: [H.nakshiKantha, "কম্বল", "তসর"], answer: H.nakshiKantha, emoji: "🪡", tier: 3, trick: "দুপাট্টা", kind: "heritage" },
  { q: "The 60-dome mosque is at…?", options: ["বাগেরহাট", "ঢাকা", "সিলেট"], answer: "বাগেরহাট", emoji: "🕌", tier: 3, trick: "পাহাড়পুর", kind: "heritage" },
  { q: "The ancient Buddhist monastery Somapura is in…?", options: ["পাহাড়পুর", "বরিশাল", "কক্সবাজার"], answer: "পাহাড়পুর", emoji: "🏛️", tier: 3, trick: "ময়নামতি", kind: "heritage" },
  { q: "The harvest festival after the rice season is…?", options: [H.nabanna, "ইদ", "বসন্ত"], answer: H.nabanna, emoji: "🌾", tier: 3, trick: "পিঠা উৎসব", kind: "heritage" },
  { q: "Pohela Boishakh falls in which month?", options: [H.boishakh, "জ্যৈষ্ঠ", "আষাঢ়"], answer: H.boishakh, emoji: "📅", tier: 3, trick: "ফাল্গুন", kind: "heritage" },
];
// #756 — Band-4 BGS (class-3/4) pool: our country (districts, rivers, symbols)
// + civic responsibilities. Both band-4 skills (bgs-our-country, bgs-good-
// citizens) share it; only the `civic` kind appears in this mode, so Sky Castle
// finally has a BGS strand. Questions mirror the national bank's style.
const CIVIC_FACTS: Fact[] = [
  // ── our country ──
  { q: "Which district is the capital of Bangladesh?", options: ["ঢাকা", "চট্টগ্রাম", "রাজশাহী"], answer: "ঢাকা", emoji: "🏙️", tier: 1, kind: "civic" },
  { q: "How many divisions does Bangladesh have?", options: ["৮", "৭", "৬"], answer: "৮", emoji: "🗺️", tier: 1, kind: "civic" },
  { q: "Which river flows through Dhaka?", options: ["বুড়িগঙ্গা", "পদ্মা", "মেঘনা"], answer: "বুড়িগঙ্গা", emoji: "🌊", tier: 1, kind: "civic" },
  { q: "What color is at the center of our flag?", options: ["লাল", "নীল", "সবুজ"], answer: "লাল", emoji: "🚩", tier: 1, kind: "civic" },
  { q: "What is our parliament building called?", options: ["জাতীয় সংসদ ভবন", "লালবাগ কেল্লা", "আহসান মঞ্জিল"], answer: "জাতীয় সংসদ ভবন", emoji: "🏛️", tier: 2, kind: "civic" },
  // ── good citizens ──
  { q: "What should you do before crossing the road?", options: ["দুই দিকে দেখো", "ছুটে পার হও", "চোখ বুজে হাঁটো"], answer: "দুই দিকে দেখো", emoji: "🛣️", tier: 1, kind: "civic" },
  { q: "Where should you throw classroom trash?", options: ["ডাস্টবিনে", "মেঝেতে", "বন্ধুর ডেস্কে"], answer: "ডাস্টবিনে", emoji: "🗑️", tier: 1, kind: "civic" },
  { q: "When an elder enters the room, what should you do?", options: ["সম্মান দেখাও", "চুপ করে থাকো", "ঘর থেকে ছুটে যাও"], answer: "সম্মান দেখাও", emoji: "🙏", tier: 2, kind: "civic" },
  { q: "A friend falls and gets hurt — what should you do?", options: ["সাহায্য করো", "হেসে উঠো", "ছেড়ে চলে যাও"], answer: "সাহায্য করো", emoji: "🤕", tier: 2, kind: "civic" },
  { q: "You find money in the playground — what should you do?", options: ["বড়দের জানাও", "নিজে রেখে দাও", "লুকিয়ে ফেলো"], answer: "বড়দের জানাও", emoji: "🪙", tier: 3, kind: "civic" },
  { q: "How should you talk to your classmates?", options: ["ভদ্রভাবে", "চিৎকার করে", "ঠাট্টা করে"], answer: "ভদ্রভাবে", emoji: "💬", tier: 3, kind: "civic" },
  { q: "When you borrow something, what should you do?", options: ["ফেরত দাও", "রেখে দাও", "ভুলে যাও"], answer: "ফেরত দাও", emoji: "🤲", tier: 3, kind: "civic" },
];
const BUTTON_RADIUS = 54;
const ROUNDS_TO_FINISH = 3;
const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure

/** Facts that match the current level — symbols → geography → history.
 *  Heritage mode (bgs-heritage, band 7) shows ALL the `kind: "heritage"` facts
 *  (every one is tier 3, so a low start level must never empty the pool).
 *  Civic mode (band-4 BGS) shows the `kind: "civic"` pool, tier-graded. */
function factsForLevel(level: number, mode: "national" | "heritage" | "civic"): Fact[] {
  const tier = level >= 4 ? 3 : level >= 2 ? 2 : 1;
  if (mode === "heritage") return FACTS.filter((f) => f.kind === "heritage");
  if (mode === "civic") return CIVIC_FACTS.filter((f) => f.tier <= tier);
  return FACTS.filter((f) => f.tier <= tier && !f.kind);
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
  private civicMode = false;
  private challenge = false; // #1158 — band 6-7 independent mode (timed rounds, no reveal)
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
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

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; skill?: string; mode?: string; challenge?: boolean }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    // #20 — bgs-heritage (band 7) draws only the heritage fact pool.
    this.heritageMode = data.skill === "bgs-heritage";
    // #756 — the band-4 BGS skills (bgs-our-country, bgs-good-citizens) run in
    // civic mode: districts, rivers, national symbols + civic responsibilities.
    this.civicMode = data.mode === "civic";
    // #1158 — challenge mode: band 6-7 skills (skill.challenge → App passes it)
    // get a per-round countdown bar and no hint/reveal on wrong.
    this.challenge = !!data.challenge;
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    this.background = this.add.graphics();
    this.drawBackground();
    const titleKey = this.civicMode
      ? data.skill === "bgs-our-country" ? "titleBgsCountry" : "titleBgsCitizens"
      : "titleBgs";
    this.titleText = this.add
      .text(0, 0, t(titleKey), txt(32, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.questionText = this.add
      .text(0, 0, "", txt(30, NV_GOLD, {bold: true, align: "center", wrap: 340}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("tapAnswer"));
    this.meter = roundMeter(this);
    onSceneResize(this, () => this.layout());
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
    const pool = factsForLevel(this.levelIndex, this.civicMode ? "civic" : this.heritageMode ? "heritage" : "national");
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
    correctCelebrate(this, container.x, container.y); // #1204 — uniform fact-drill celebration
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

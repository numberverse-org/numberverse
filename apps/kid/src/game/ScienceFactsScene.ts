import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, roundMeter, BTN_PRIMARY, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-sciencefacts")?.difficultyLevels ?? [1, 2, 3, 4, 5, 6];
const ROUNDS_TO_FINISH = 3;
const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure

/** Bilingual helper — new scenes are data-first; their UI copy lives here
 *  instead of growing the central i18n table (skill text lives in skills.ts). */
const L = (en: string, bn: string) => (getAppLang() === "bn" ? bn : en);

interface Fact {
  q: string;
  qBn: string;
  options: string[];
  optionsBn: string[];
  /** Index into options/optionsBn of the correct answer. */
  answer: number;
  emoji: string;
  /** 1 = first concepts, 2 = second tier, 3 = hardest — grows with level. */
  tier: number;
  hint: string;
  hintBn: string;
}

// #1161 — band 6 forces & energy (push/pull → gravity → light/heat/sound).
const FORCES_FACTS: Fact[] = [
  { q: "When you move a toy car forward with your hand, you ___ it.", qBn: "হাত দিয়ে খেলনা গাড়ি সামনে সরালে তুমি তাকে ___ করো।", options: ["push", "pull", "lift", "drop"], optionsBn: ["ঠেলো", "টানো", "ওঠাও", "ফেলো"], answer: 0, emoji: "🚗", tier: 1, hint: "A push moves something away from you.", hintBn: "ঠেলা জিনিসকে তোমার কাছ থেকে দূরে সরায়।" },
  { q: "When you drag a wagon toward you, you ___ it.", qBn: "গাড়ি নিজের দিকে টানলে তুমি তাকে ___ করো।", options: ["pull", "push", "kick", "throw"], optionsBn: ["টানো", "ঠেলো", "লাথি মারো", "ছোড়ো"], answer: 0, emoji: "🛒", tier: 1, hint: "A pull moves something toward you.", hintBn: "টান জিনিসকে তোমার দিকে নিয়ে আসে।" },
  { q: "Which one is a pull?", qBn: "কোনটি টান?", options: ["opening a drawer", "kicking a ball", "throwing a stone", "clapping"], optionsBn: ["ড্রয়ার খোলা", "বলে লাথি মারা", "পাথর ছোড়া", "তালি বাজানো"], answer: 0, emoji: "🗄️", tier: 1, hint: "Which action moves something toward you?", hintBn: "কোন কাজ জিনিসকে তোমার দিকে আনে?" },
  { q: "Which one is a push?", qBn: "কোনটি ঠেলা?", options: ["closing a door", "opening a drawer", "dragging a bag", "lifting a bucket"], optionsBn: ["দরজা বন্ধ করা", "ড্রয়ার খোলা", "ব্যাগ টেনে আনা", "বালতি ওঠানো"], answer: 0, emoji: "🚪", tier: 1, hint: "Which action moves something away from you?", hintBn: "কোন কাজ জিনিসকে তোমার কাছ থেকে দূরে নেয়?" },
  { q: "What pulls a ball back down to the ground?", qBn: "বলকে মাটিতে ফিরিয়ে আনে কে?", options: ["gravity", "wind", "water", "sound"], optionsBn: ["মাধ্যাকর্ষণ", "বাতাস", "পানি", "শব্দ"], answer: 0, emoji: "⚽", tier: 2, hint: "It is the invisible pull of the Earth.", hintBn: "এটা পৃথিবীর অদৃশ্য টান।" },
  { q: "Why does a dropped mango fall down?", qBn: "ফেলে দেওয়া আম নিচে পড়ে কেন?", options: ["gravity pulls it", "the wind pushes it", "it is sleepy", "the sky drops it"], optionsBn: ["মাধ্যাকর্ষণ টানে", "বাতাস ঠেলে দেয়", "ওর ঘুম পেয়েছে", "আকাশ ফেলে দেয়"], answer: 0, emoji: "🥭", tier: 2, hint: "Earth's pull works on every object.", hintBn: "পৃথিবীর টান সব বস্তুর ওপর কাজ করে।" },
  { q: "Where does gravity pull everything?", qBn: "মাধ্যাকর্ষণ সবকিছু কোন দিকে টানে?", options: ["toward the Earth", "toward the Sun only", "up into the sky", "to the left"], optionsBn: ["পৃথিবীর দিকে", "কেবল সূর্যের দিকে", "উপরে আকাশে", "বাঁয়ে"], answer: 0, emoji: "🌍", tier: 2, hint: "Gravity pulls toward the ground.", hintBn: "মাধ্যাকর্ষণ মাটির দিকে টানে।" },
  { q: "Which one is caused by gravity?", qBn: "কোনটি মাধ্যাকর্ষণের কারণে হয়?", options: ["an apple falling", "a kite flying high", "a balloon floating up", "a shadow forming"], optionsBn: ["আপেল পড়া", "ঘুড়ি উঁচুতে ওড়া", "বেলুন উপরে ভাসা", "ছায়া পড়া"], answer: 0, emoji: "🍎", tier: 2, hint: "Falling things are pulled by gravity.", hintBn: "পড়ে যাওয়া জিনিস মাধ্যাকর্ষণে টানে।" },
  { q: "The Sun gives us light and ___ .", qBn: "সূর্য আমাদের আলো আর ___ দেয়।", options: ["heat", "cold", "shade", "sleep"], optionsBn: ["তাপ", "ঠান্ডা", "ছায়া", "ঘুম"], answer: 0, emoji: "☀️", tier: 3, hint: "Sunlight warms the Earth.", hintBn: "সূর্যের আলো পৃথিবী গরম করে।" },
  { q: "Which one makes a sound?", qBn: "কোনটি শব্দ করে?", options: ["a drum", "a stone", "a shadow", "a colour"], optionsBn: ["ঢাক", "পাথর", "ছায়া", "রং"], answer: 0, emoji: "🥁", tier: 3, hint: "Hitting it makes the air vibrate.", hintBn: "এতে আঘাত করলে বাতাস কাঁপে।" },
  { q: "Which one gives light?", qBn: "কোনটি আলো দেয়?", options: ["a bulb", "a brick", "a pillow", "a spoon"], optionsBn: ["বাল্ব", "ইট", "বালিশ", "চামচ"], answer: 0, emoji: "💡", tier: 3, hint: "It glows when you switch it on.", hintBn: "চালু করলে এটা জ্বলে ওঠে।" },
  { q: "Light lets us ___ things.", qBn: "আলো দিয়ে আমরা জিনিস ___ করি।", options: ["see", "hear", "smell", "taste"], optionsBn: ["দেখি", "শুনি", "শুঁকি", "স্বাদ নিই"], answer: 0, emoji: "👀", tier: 3, hint: "Our eyes need light to work.", hintBn: "চোখের কাজের জন্য আলো দরকার।" },
];

// #1161 — band 7 energy types & transfer (types → transfers → chains).
const ENERGY_FACTS: Fact[] = [
  { q: "A moving car has ___ energy.", qBn: "চলন্ত গাড়িতে ___ শক্তি থাকে।", options: ["kinetic", "frozen", "dark", "silent"], optionsBn: ["গতি", "জমাট", "অন্ধকার", "নীরব"], answer: 0, emoji: "🚗", tier: 1, hint: "Moving things have kinetic (motion) energy.", hintBn: "চলমান বস্তুতে গতি শক্তি থাকে।" },
  { q: "A stretched rubber band stores ___ energy.", qBn: "টানা রাবার ব্যান্ডে ___ শক্তি জমা থাকে।", options: ["potential", "kinetic", "sound", "smell"], optionsBn: ["স্থিতি", "গতি", "শব্দ", "গন্ধ"], answer: 0, emoji: "🪀", tier: 1, hint: "Stored energy that can be released is potential energy.", hintBn: "জমা থাকা যে শক্তি পরে ছাড়া যায় তা স্থিতি শক্তি।" },
  { q: "The Sun sends us ___ energy.", qBn: "সূর্য আমাদের ___ শক্তি পাঠায়।", options: ["light and heat", "sound and smell", "ice and snow", "push and pull"], optionsBn: ["আলো ও তাপ", "শব্দ ও গন্ধ", "বরফ ও তুষার", "ঠেলা ও টান"], answer: 0, emoji: "☀️", tier: 1, hint: "The Sun shines and warms.", hintBn: "সূর্য আলো দেয় আর গরম করে।" },
  { q: "A ringing bell makes ___ energy.", qBn: "বাজানো ঘণ্টা ___ শক্তি তৈরি করে।", options: ["sound", "light", "chemical", "magnetic"], optionsBn: ["শব্দ", "আলো", "রাসায়নিক", "চৌম্বক"], answer: 0, emoji: "🔔", tier: 1, hint: "You hear it — that is sound energy.", hintBn: "তুমি এটা শোনো — ওটাই শব্দ শক্তি।" },
  { q: "Rubbing your hands together turns motion into ___ .", qBn: "হাত ঘষলে গতি ___ -এ বদলে যায়।", options: ["heat", "cold", "light", "sound"], optionsBn: ["তাপে", "ঠান্ডায়", "আলোতে", "শব্দে"], answer: 0, emoji: "🤲", tier: 2, hint: "Friction warms your hands.", hintBn: "ঘর্ষণে হাত গরম হয়।" },
  { q: "A lit bulb turns electrical energy into ___ .", qBn: "জ্বলন্ত বাল্ব বিদ্যুৎ শক্তিকে ___ -এ বদলায়।", options: ["light", "water", "gravity", "soil"], optionsBn: ["আলোতে", "পানিতে", "মাধ্যাকর্ষণে", "মাটিতে"], answer: 0, emoji: "💡", tier: 2, hint: "The bulb glows.", hintBn: "বাল্ব জ্বলে ওঠে।" },
  { q: "Food stores ___ energy that your body uses.", qBn: "খাবারে ___ শক্তি জমা থাকে যা শরীর কাজে লাগায়।", options: ["chemical", "kinetic", "wind", "electric only"], optionsBn: ["রাসায়নিক", "গতি", "বাতাস", "কেবল বিদ্যুৎ"], answer: 0, emoji: "🍚", tier: 2, hint: "Your body breaks food down for energy.", hintBn: "শরীর শক্তির জন্য খাবার ভাঙে।" },
  { q: "When you speak, your voice box turns energy into ___ .", qBn: "কথা বললে তোমার স্বরযন্ত্র শক্তিকে ___ -এ বদলায়।", options: ["sound", "light", "heat", "gravity"], optionsBn: ["শব্দে", "আলোতে", "তাপে", "মাধ্যাকর্ষণে"], answer: 0, emoji: "🗣️", tier: 2, hint: "People hear your words.", hintBn: "লোকেরা তোমার কথা শোনে।" },
  { q: "In a flashlight, the battery's chemical energy becomes ___ energy.", qBn: "টর্চে ব্যাটারির রাসায়নিক শক্তি ___ শক্তিতে বদলায়।", options: ["electrical then light", "sound then heat", "water then wind", "soil then food"], optionsBn: ["প্রথমে বিদ্যুৎ তারপর আলো", "প্রথমে শব্দ তারপর তাপ", "প্রথমে পানি তারপর বাতাস", "প্রথমে মাটি তারপর খাবার"], answer: 0, emoji: "🔦", tier: 3, hint: "The battery powers the bulb.", hintBn: "ব্যাটারি বাল্ব চালায়।" },
  { q: "A toaster turns electrical energy into ___ .", qBn: "টোস্টার বিদ্যুৎ শক্তিকে ___ -এ বদলায়।", options: ["heat", "sound", "light only", "motion"], optionsBn: ["তাপে", "শব্দে", "কেবল আলোতে", "গতিতে"], answer: 0, emoji: "🍞", tier: 3, hint: "It warms the bread.", hintBn: "এটা রুটি গরম করে।" },
  { q: "Energy can never be destroyed — it only ___ .", qBn: "শক্তি কখনো ধ্বংস হয় না — এটা কেবল ___ ।", options: ["changes form", "disappears", "gets lost forever", "turns into nothing"], optionsBn: ["রূপ বদলায়", "উধাও হয়", "চিরতরে হারিয়ে যায়", "শূন্য হয়ে যায়"], answer: 0, emoji: "⚡", tier: 3, hint: "Energy conservation — it transforms.", hintBn: "শক্তির নিত্যতা — এটা রূপান্তরিত হয়।" },
];

// #1164 — band 8 forces & energy depth: work, friction and simple machines.
const FORCES_DEPTH_FACTS: Fact[] = [
  { q: "You push a box with a force of 2 units for 3 metres. How much work do you do?", qBn: "তুমি ৩ মিটার দূরত্বে ২ একক বল দিয়ে বাক্স ঠেললে কত কাজ করলে?", options: ["6 units", "5 units", "1 unit", "3 units"], optionsBn: ["৬ একক", "৫ একক", "১ একক", "৩ একক"], answer: 0, emoji: "📦", tier: 1, hint: "Work = force × distance.", hintBn: "কাজ = বল × দূরত্ব।" },
  { q: "Which force slows down a toy car sliding across the floor?", qBn: "মেঝেতে চলন্ত খেলনা গাড়িকে কোন বল ধীর করে দেয়?", options: ["friction", "gravity", "magnetism", "sound"], optionsBn: ["ঘর্ষণ", "মাধ্যাকর্ষণ", "চুম্বকত্ব", "শব্দ"], answer: 0, emoji: "🚗", tier: 1, hint: "It happens when two surfaces rub together.", hintBn: "দুটি তল ঘষা খেলেই এটা হয়।" },
  { q: "A seesaw is which kind of simple machine?", qBn: "দোলনা কোন ধরনের সরল যন্ত্র?", options: ["a lever", "a pulley", "a wheel", "a ramp"], optionsBn: ["লিভার", "কপিকল", "চাকা", "ঢালু পথ"], answer: 0, emoji: "⚖️", tier: 1, hint: "It turns around a point in the middle.", hintBn: "এটা মাঝের একটি বিন্দুর চারপাশে ঘোরে।" },
  { q: "A ramp helps move a heavy box upward. A ramp is an example of…", qBn: "ঢালু পথ ভারী বাক্স উপরে তুলতে সাহায্য করে। এটা কোনটির উদাহরণ?", options: ["an inclined plane", "a lever", "a pulley", "a screw"], optionsBn: ["নত তল", "লিভার", "কপিকল", "স্ক্রু"], answer: 0, emoji: "🛝", tier: 1, hint: "It is a flat surface set at an angle.", hintBn: "এটা হেলানো একটি সমতল তল।" },
  { q: "Which simple machine helps lift a bucket from a well?", qBn: "কূপ থেকে বালতি তুলতে কোন সরল যন্ত্র সাহায্য করে?", options: ["a pulley", "a ramp", "a wheel", "a spring"], optionsBn: ["কপিকল", "ঢালু পথ", "চাকা", "স্প্রিং"], answer: 0, emoji: "🪣", tier: 2, hint: "It uses a rope that runs over a wheel.", hintBn: "চাকার ওপর দিয়ে দড়ি চালানো হয়।" },
  { q: "A ball rolls uphill and slows to a stop. Its motion energy turns mostly into…", qBn: "একটি বল উঁচুতে উঠে থেমে যায়। এর গতি শক্তি মূলত কী-তে বদলায়?", options: ["stored (potential) energy", "light", "sound only", "nothing"], optionsBn: ["স্থিতি শক্তি", "আলো", "কেবল শব্দ", "কিছুই না"], answer: 0, emoji: "⚽", tier: 2, hint: "Higher up means more stored energy.", hintBn: "যত উপরে, তত বেশি জমা শক্তি।" },
  { q: "Which surface produces the MOST friction?", qBn: "কোন তলে সবচেয়ে বেশি ঘর্ষণ হয়?", options: ["a rough carpet", "a smooth slide", "wet ice", "polished glass"], optionsBn: ["খসখসে কার্পেট", "মসৃণ ঢালু পথ", "ভেজা বরফ", "পালিশ করা কাচ"], answer: 0, emoji: "🧶", tier: 2, hint: "Rough surfaces grip more.", hintBn: "খসখসে তল বেশি আটকে ধরে।" },
  { q: "Pedalling a bicycle turns your muscle energy mostly into…", qBn: "সাইকেলের প্যাডেল মারলে তোমার পেশির শক্তি মূলত কী-তে বদলায়?", options: ["motion energy", "light energy", "sound energy only", "magnetic energy"], optionsBn: ["গতি শক্তিতে", "আলো শক্তিতে", "কেবল শব্দ শক্তিতে", "চৌম্বক শক্তিতে"], answer: 0, emoji: "🚲", tier: 3, hint: "The wheels start to move.", hintBn: "চাকাগুলো চলতে শুরু করে।" },
  { q: "A machine that makes work easier by changing the force or distance is a…", qBn: "বল বা দূরত্ব বদলে কাজ সহজ করে দেয় এমন যন্ত্রকে কী বলে?", options: ["simple machine", "heat engine", "battery", "mirror"], optionsBn: ["সরল যন্ত্র", "তাপ ইঞ্জিন", "ব্যাটারি", "আয়না"], answer: 0, emoji: "⚙️", tier: 3, hint: "Levers, pulleys and ramps are examples.", hintBn: "লিভার, কপিকল আর ঢালু পথ এর উদাহরণ।" },
  { q: "Oil is put on a door hinge to make the door move smoothly. The oil reduces…", qBn: "দরজা মসৃণভাবে চলতে কব্জায় তেল দেওয়া হয়। তেল কী কমায়?", options: ["friction", "gravity", "weight", "magnetism"], optionsBn: ["ঘর্ষণ", "মাধ্যাকর্ষণ", "ওজন", "চুম্বকত্ব"], answer: 0, emoji: "🚪", tier: 3, hint: "Slippery surfaces rub less.", hintBn: "পিচ্ছিল তল কম ঘষা খায়।" },
];

const BUTTON_RADIUS = 56;

/**
 * ScienceFacts (#1161). Band 6-7 science answer-button scene.
 * Hosts science concepts with no legacy scene: forces & energy (band 6) and
 * energy types & transfer (band 7). The skill id selects the fact bank; the
 * level ramps the tier inside it. Same create/startRound/onRoundDone/
 * questionPanel/modernAnswerButton/meter + #1158 challenge contract as
 * PercentScene/HumanBodyScene.
 */
export class ScienceFactsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private challenge = false;
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private skillId = "";
  private target!: Fact;
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private questionText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;

  constructor() {
    super("ScienceFacts");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; challenge?: boolean; skill?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.skillId = data.skill ?? "";
    // #1158 — challenge mode: band 6-7 skills get a per-round countdown and no
    // hint/reveal on wrong.
    this.challenge = !!data.challenge;
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    gameBackground(this, "space");
    this.titleText = this.add
      .text(0, 0, this.titleForSkill(), txt(32, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.questionText = this.add
      .text(0, 0, "", txt(26, NV_GOLD, { bold: true, align: "center", wrap: 340 }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(L("Tap the right answer", "সঠিক উত্তরটি ট্যাপ করো"));
    this.meter = roundMeter(this);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private titleForSkill(): string {
    if (this.skillId === "science-energy-transfer")
      return L("Energy types & transfer", "শক্তির ধরন ও প্রবাহ");
    if (this.skillId === "science-forces-depth")
      return L("Forces & energy depth", "বল ও শক্তির গভীরতা");
    return L("Forces & energy", "বল ও শক্তি");
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.questionText.setPosition(width / 2, height * 0.4);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private factsForSkill(): Fact[] {
    if (this.skillId === "science-energy-transfer") return ENERGY_FACTS;
    if (this.skillId === "science-forces-depth") return FORCES_DEPTH_FACTS;
    return FORCES_FACTS;
  }

  private factsForLevel(): Fact[] {
    const tier = this.levelIndex < 2 ? 1 : this.levelIndex < 4 ? 2 : 3;
    return this.factsForSkill().filter((f) => f.tier <= tier);
  }

  private startRound() {
    this.clearButtons();
    const pool = this.factsForLevel();
    this.target = pool[Phaser.Math.Between(0, pool.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(`Round ${this.levelIndex + 1}`);
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.questionText.setText(`${this.target.emoji} ${L(this.target.q, this.target.qBn)}`);
    this.spawnButtons();
    this.armChallenge();
  }

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
    const bn = getAppLang() === "bn";
    const opts = (bn ? this.target.optionsBn : this.target.options).slice();
    const shuffled = [...opts].sort(() => Math.random() - 0.5);
    const { width } = this.scale;
    const longLabels = shuffled.some((o) => o.length > 14);
    const radius = longLabels ? Math.max(30, Math.min(BUTTON_RADIUS - 4, (width - 80) / (shuffled.length * 2))) : BUTTON_RADIUS;
    const spacing = radius * 2 + 8;
    const startX = width / 2 - (spacing * (shuffled.length - 1)) / 2;
    const y = this.answersY;
    shuffled.forEach((value, i) => {
      const c = modernAnswerButton(this, startX + i * spacing, y, radius, value, BTN_PRIMARY, {
        labelSize: Math.max(14, Math.round(radius * (longLabels ? 0.34 : 0.44))),
        wrap: radius * 2 - 12,
      });
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: string) {
    const bn = getAppLang() === "bn";
    const correct = (bn ? this.target.optionsBn : this.target.options)[this.target.answer];
    if (value !== correct) {
      hintWrong(this, container, {
        hint: L(this.target.hint, this.target.hintBn),
        hintBn: this.target.hintBn,
        correct: () => correct,
        options: () => this.buttons,
        challenge: this.challenge, // #1158 — no banner/reveal; solve it yourself
      });
      return;
    }
    this.challengeDone = true;
    this.disarmChallenge();
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(value === correct, ms, this.levelIndex + 1);
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

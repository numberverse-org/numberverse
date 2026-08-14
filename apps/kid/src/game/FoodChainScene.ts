import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { getAppLang } from "./locale";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, roundMeter, BTN_PRIMARY, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const POOL_SIZES = GAMES.find((g) => g.id === "game-foodchain")?.difficultyLevels ?? [3, 3, 4, 4, 6, 6];
/** Skill seed for deterministic framing rotation. */
const SKILL_ID = GAMES.find((g) => g.id === "game-foodchain")?.skillId ?? "science-food-chain";
const ROUNDS_TO_FINISH = 3;
const CARD_W = 76;

interface Link {
  emoji: string;
  en: string;
  bn: string;
}
interface Chain {
  links: Link[];
}

/* 6 food chains (#232 "5 chains"), easy → tricky. Every chain is
 * producer → plant-eater → meat-eater. Emoji labels are language-neutral;
 * the words in the question/hint localize EN/BN. */
const CHAINS: Chain[] = [
  { links: [{ emoji: "🌱", en: "grass", bn: "ঘাস" }, { emoji: "🦗", en: "grasshopper", bn: "ফড়িং" }, { emoji: "🐸", en: "frog", bn: "ব্যাঙ" }] },
  { links: [{ emoji: "🌱", en: "grass", bn: "ঘাস" }, { emoji: "🐇", en: "rabbit", bn: "খরগোশ" }, { emoji: "🦊", en: "fox", bn: "শিয়াল" }] },
  { links: [{ emoji: "🌱", en: "grass", bn: "ঘাস" }, { emoji: "🐁", en: "mouse", bn: "ইঁদুর" }, { emoji: "🐍", en: "snake", bn: "সাপ" }] },
  { links: [{ emoji: "🌱", en: "grass", bn: "ঘাস" }, { emoji: "🦌", en: "deer", bn: "হরিণ" }, { emoji: "🐅", en: "tiger", bn: "বাঘ" }] },
  { links: [{ emoji: "🌿", en: "seaweed", bn: "শেওলা" }, { emoji: "🐟", en: "fish", bn: "মাছ" }, { emoji: "🦈", en: "shark", bn: "হাঙর" }] },
  { links: [{ emoji: "🌼", en: "flower", bn: "ফুল" }, { emoji: "🐝", en: "bee", bn: "মৌমাছি" }, { emoji: "🐦", en: "bird", bn: "পাখি" }] },
];

const SLOT_YS = 0.48; // slot center (fraction of height)
const CHALLENGE_SECONDS = 15; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure

/** #1161 — ecosystem roles (band 6): producers, consumers, decomposers. */
interface RoleFact {
  q: string;
  qBn: string;
  options: string[];
  optionsBn: string[];
  answer: number;
  emoji: string;
  tier: number;
  hint: string;
  hintBn: string;
}

const ROLES_FACTS: RoleFact[] = [
  { q: "Which one is a producer?", qBn: "কোনটি উৎপাদক?", options: ["grass", "rabbit", "fox", "mushroom"], optionsBn: ["ঘাস", "খরগোশ", "শিয়াল", "মাশরুম"], answer: 0, emoji: "🌱", tier: 1, hint: "Producers make their own food from sunlight.", hintBn: "উৎপাদক সূর্যের আলো থেকে নিজের খাবার বানায়।" },
  { q: "Which one is a consumer?", qBn: "কোনটি খাদক?", options: ["a rabbit", "grass", "a tree", "a flower"], optionsBn: ["খরগোশ", "ঘাস", "গাছ", "ফুল"], answer: 0, emoji: "🐇", tier: 1, hint: "Consumers eat other living things.", hintBn: "খাদক অন্য জীবকে খায়।" },
  { q: "What does a producer do?", qBn: "উৎপাদক কী করে?", options: ["makes its own food", "eats other animals", "breaks down dead things", "hunts at night"], optionsBn: ["নিজের খাবার বানায়", "অন্য প্রাণী খায়", "মৃত জিনিস ভাঙে", "রাতে শিকার করে"], answer: 0, emoji: "🌿", tier: 1, hint: "Plants use sunlight to make food.", hintBn: "গাছ সূর্যের আলোতে খাবার বানায়।" },
  { q: "Which one breaks down dead plants and animals?", qBn: "কোনটি মৃত গাছ ও প্রাণী ভেঙে ফেলে?", options: ["a decomposer", "a producer", "a predator", "a herbivore"], optionsBn: ["বিয়োজক", "উৎপাদক", "শিকারী", "তৃণভোজী"], answer: 0, emoji: "🍄", tier: 2, hint: "Fungi and bacteria are decomposers.", hintBn: "ছত্রাক আর ব্যাকটেরিয়া বিয়োজক।" },
  { q: "Which one is a decomposer?", qBn: "কোনটি বিয়োজক?", options: ["a mushroom", "a deer", "a tiger", "a mango tree"], optionsBn: ["মাশরুম", "হরিণ", "বাঘ", "আমগাছ"], answer: 0, emoji: "🍄", tier: 2, hint: "Mushrooms feed on dead material.", hintBn: "মাশরুম মৃত জিনিস থেকে খাবার নেয়।" },
  { q: "Who eats the producer in a food chain?", qBn: "খাদ্য শৃঙ্খলে উৎপাদককে কে খায়?", options: ["a primary consumer", "another producer", "the Sun", "the soil"], optionsBn: ["প্রথম খাদক", "আরেক উৎপাদক", "সূর্য", "মাটি"], answer: 0, emoji: "🐛", tier: 2, hint: "Plant-eaters come right after the plants.", hintBn: "গাছের পরপরই আসে গাছখেকো প্রাণী।" },
  { q: "A plant-eater is also called a ___ .", qBn: "গাছখেকো প্রাণীকে ___ বলা হয়।", options: ["herbivore", "carnivore", "decomposer", "producer"], optionsBn: ["তৃণভোজী", "মাংসাশী", "বিয়োজক", "উৎপাদক"], answer: 0, emoji: "🦌", tier: 3, hint: "Herbivores eat plants.", hintBn: "তৃণভোজী গাছ খায়।" },
  { q: "A meat-eater is also called a ___ .", qBn: "মাংসখেকো প্রাণীকে ___ বলা হয়।", options: ["carnivore", "herbivore", "producer", "flower"], optionsBn: ["মাংসাশী", "তৃণভোজী", "উৎপাদক", "ফুল"], answer: 0, emoji: "🐅", tier: 3, hint: "Carnivores eat other animals.", hintBn: "মাংসাশী অন্য প্রাণী খায়।" },
];

// #1161 — ecosystem depth (band 7): food webs, predators, prey, niches.
const WEB_FACTS: RoleFact[] = [
  { q: "In a pond, who is the producer?", qBn: "পুকুরে কে উৎপাদক?", options: ["algae", "a frog", "a fish", "a heron"], optionsBn: ["শৈবাল", "ব্যাঙ", "মাছ", "সারস"], answer: 0, emoji: "🟢", tier: 1, hint: "Algae make food from sunlight like plants.", hintBn: "শৈবাল গাছের মতো সূর্যের আলোতে খাবার বানায়।" },
  { q: "Which animal is a predator?", qBn: "কোন প্রাণী শিকারী?", options: ["a tiger", "a goat", "a cow", "a grasshopper"], optionsBn: ["বাঘ", "ছাগল", "গরু", "ফড়িং"], answer: 0, emoji: "🐅", tier: 1, hint: "Predators hunt other animals.", hintBn: "শিকারী অন্য প্রাণী শিকার করে।" },
  { q: "The animal a predator hunts is its ___ .", qBn: "শিকারী যে প্রাণী শিকার করে সেটি তার ___ ।", options: ["prey", "producer", "shelter", "shadow"], optionsBn: ["শিকার", "উৎপাদক", "আশ্রয়", "ছায়া"], answer: 0, emoji: "🐁", tier: 1, hint: "Predators eat prey.", hintBn: "শিকারী শিকার খায়।" },
  { q: "What is a decomposer's job?", qBn: "বিয়োজকের কাজ কী?", options: ["break down dead things", "hunt live animals", "make food from sunlight", "build nests"], optionsBn: ["মৃত জিনিস ভেঙে ফেলা", "জীবন্ত প্রাণী শিকার করা", "সূর্যের আলোতে খাবার বানানো", "বাসা বানানো"], answer: 0, emoji: "🪱", tier: 2, hint: "Decomposers recycle dead matter into soil.", hintBn: "বিয়োজক মৃত জিনিস মাটিতে ফিরিয়ে দেয়।" },
  { q: "In a food web, arrows show the flow of ___ .", qBn: "খাদ্য জালে তীর চিহ্ন ___ এর প্রবাহ দেখায়।", options: ["energy", "water", "air", "soil"], optionsBn: ["শক্তির", "পানির", "বাতাসের", "মাটির"], answer: 0, emoji: "🔀", tier: 2, hint: "Energy moves from the eaten to the eater.", hintBn: "শক্তি খাওয়া প্রাণী থেকে খাদকের দিকে চলে।" },
  { q: "A food web is ___ .", qBn: "খাদ্য জাল হলো ___ ।", options: ["many connected food chains", "one single animal", "a kind of rock", "a weather map"], optionsBn: ["অনেক খাদ্য শৃঙ্খলের জাল", "একটাই প্রাণী", "এক ধরনের পাথর", "আবহাওয়ার মানচিত্র"], answer: 0, emoji: "🕸️", tier: 2, hint: "Several chains overlap into a web.", hintBn: "অনেক শৃঙ্খল জুড়ে জাল হয়।" },
  { q: "What happens if all producers disappear?", qBn: "সব উৎপাদক হারিয়ে গেলে কী হবে?", options: ["consumers lose their food", "nothing changes", "more rain falls", "the Sun stops"], optionsBn: ["খাদকদের খাবার শেষ হয়ে যায়", "কিছুই বদলায় না", "বেশি বৃষ্টি হয়", "সূর্য থেমে যায়"], answer: 0, emoji: "🌾", tier: 3, hint: "Every chain starts with a producer.", hintBn: "প্রতিটি শৃঙ্খল উৎপাদক দিয়ে শুরু হয়।" },
  { q: "A niche is a living thing's ___ in its home.", qBn: "নিচ হলো জীবের নিজের বাড়িতে তার ___ ।", options: ["role or job", "colour", "shadow", "name"], optionsBn: ["ভূমিকা বা কাজ", "রং", "ছায়া", "নাম"], answer: 0, emoji: "🏠", tier: 3, hint: "A niche is how an organism fits its habitat.", hintBn: "নিচ মানে জীব তার আবাসে কীভাবে খাপ খায়।" },
];


/**
 * Food Chain — order producer → eater → predator with arrows.
 * Band 2 (ages 4–6, science). The producer is pre-placed; the kid taps who
 * EATS it (the next link) from three shuffled cards. Correct → the card flies
 * into the slot and the "→" arrow lights up between the links. 3 taps build
 * the whole chain.
 */
export class FoodChainScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private chain!: Chain;
  private stepIdx = 0; // 0 → need link[1], 1 → need link[2]
  private cards: { sprite: Phaser.GameObjects.Container; link: Link }[] = [];
  private slots: Phaser.GameObjects.Text[] = [];
  private arrows: Phaser.GameObjects.Text[] = [];
  private slotBg!: Phaser.GameObjects.Graphics;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;
  // #1161 — ecosystem roles mode (producers/consumers/decomposers)
  private mode = "";
  private skillId = "";
  private challenge = false;
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private target!: RoleFact;
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private questionText!: Phaser.GameObjects.Text;

  constructor() {
    super("FoodChain");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; mode?: string; skill?: string; challenge?: boolean }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    // #1161 — "roles" mode flips this scene from chain-ordering into an
    // ecosystem roles quiz (producer/consumer/decomposer; webs/niches for band 7).
    this.mode = data.mode ?? "";
    this.skillId = data.skill ?? "";
    this.challenge = !!data.challenge;
    this.background = this.add.graphics();
    gameBackground(this, "forest");
    this.titleText = this.add
      .text(0, 0, this.mode === "roles" ? this.rolesTitle() : t("titleFoodChain"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    if (this.mode === "roles") {
      this.questionText = this.add
        .text(0, 0, "", txt(30, NV_GOLD, { bold: true, align: "center", wrap: 340 }))
        .setOrigin(0.5);
      if (this.challenge) {
        this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
      }
    } else {
      this.slotBg = this.add.graphics();
      // chain slots (empty rounded cards) + arrows between them
      for (let i = 0; i < 3; i++) this.slots.push(this.slotCard(i));
      for (let i = 0; i < 2; i++) this.arrows.push(this.add.text(0, 0, "→", txt(30, NV_GOLD, { bold: true })).setOrigin(0.5));
    }
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private rolesTitle(): string {
    return this.skillId === "science-ecosystems-depth"
      ? getAppLang() === "bn" ? "খাদ্য জাল ও নিচ" : "Food webs & niches"
      : getAppLang() === "bn" ? "বাস্তুতন্ত্র: খাদ্য শৃঙ্খল" : "Ecosystems: food chains";
  }

  private slotCard(i: number): Phaser.GameObjects.Text {
    const s = this.add.text(0, 0, "?", txt(36, "#ffffff", { bold: true })).setOrigin(0.5).setDepth(50);
    return s;
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    if (this.mode === "roles") {
      this.questionText.setPosition(width / 2, height * 0.38);
      this.prompt.setPosition(width / 2, height - 150 - SAB());
      return;
    }
    this.prompt.setPosition(width / 2, height * 0.28);
    for (let i = 0; i < 3; i++) this.slots[i].setPosition(this.slotX(i), height * SLOT_YS);
    for (let i = 0; i < 2; i++) this.arrows[i].setPosition((this.slotX(i) + this.slotX(i + 1)) / 2, height * SLOT_YS);
    // slot card backgrounds (rounded rects behind the emoji/?)
    const bg = this.slotBg.clear();
    bg.fillStyle(0x2f4b7c, 1);
    for (let i = 0; i < 3; i++) bg.fillRoundedRect(this.slotX(i) - CARD_W / 2, height * SLOT_YS - 34, CARD_W, 68, 14);
    this.reflowCards();
  }

  private slotX(i: number) {
    return this.scale.width * (0.5 + (i - 1) * 0.32);
  }

  private get cardY() {
    return this.scale.height * 0.78;
  }

  private poolSize() {
    return POOL_SIZES[Math.min(this.levelIndex, POOL_SIZES.length - 1)];
  }

  private word(l: Link) {
    return getAppLang() === "bn" ? l.bn : l.en;
  }

  private startRound() {
    if (this.mode === "roles") {
      this.startRolesRound();
      return;
    }
    this.clearCards();
    this.startedAt = this.time.now;
    this.chain = CHAINS[Math.floor(Math.random() * this.poolSize())];
    this.stepIdx = 0;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    // pre-place the producer
    this.slots[0].setText(this.chain.links[0].emoji);
    this.slots[1].setText("?");
    this.slots[2].setText("?");
    this.arrows[0].setAlpha(0.25);
    this.arrows[1].setAlpha(0.25);
    this.ask();
    this.spawnCards();
  }

  private get rolesAnswersY() {
    return this.scale.height - 64 - SAB();
  }

  private rolesFacts(): RoleFact[] {
    return this.skillId === "science-ecosystems-depth" ? WEB_FACTS : ROLES_FACTS;
  }

  private rolesFactsForLevel(): RoleFact[] {
    const tier = this.levelIndex < 2 ? 1 : this.levelIndex < 4 ? 2 : 3;
    return this.rolesFacts().filter((f) => f.tier <= tier);
  }

  private startRolesRound() {
    this.clearButtons();
    const pool = this.rolesFactsForLevel();
    this.target = pool[Phaser.Math.Between(0, pool.length - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.questionText.setText(`${this.target.emoji} ${getAppLang() === "bn" ? this.target.qBn : this.target.q}`);
    this.spawnRolesButtons();
    this.armChallenge();
  }

  private spawnRolesButtons() {
    const bn = getAppLang() === "bn";
    const opts = (bn ? this.target.optionsBn : this.target.options).slice();
    const shuffled = [...opts].sort(() => Math.random() - 0.5);
    const { width } = this.scale;
    const longLabels = shuffled.some((o) => o.length > 14);
    const radius = longLabels ? Math.max(30, Math.min(54, (width - 80) / (shuffled.length * 2))) : 54;
    const spacing = radius * 2 + 8;
    const startX = width / 2 - (spacing * (shuffled.length - 1)) / 2;
    const y = this.rolesAnswersY;
    shuffled.forEach((value, i) => {
      const c = modernAnswerButton(this, startX + i * spacing, y, radius, value, BTN_PRIMARY, {
        labelSize: Math.max(14, Math.round(radius * (longLabels ? 0.34 : 0.42))),
        wrap: radius * 2 - 12,
      });
      c.on("pointerdown", () => this.rolesTap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private rolesTap(container: Phaser.GameObjects.Container, value: string) {
    const bn = getAppLang() === "bn";
    const correct = (bn ? this.target.optionsBn : this.target.options)[this.target.answer];
    if (value !== correct) {
      hintWrong(this, container, {
        hint: bn ? this.target.hintBn : this.target.hint,
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

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
  }

  private ask() {
    const eater = this.chain.links[this.stepIdx + 1];
    const eaten = this.chain.links[this.stepIdx];
    this.prompt.set(t("whoEats", { w: this.word(eaten), e: eater.emoji }));
    const bn = getAppLang() === "bn";
    speak(t("whoEatsSpeak", { w: this.word(eaten), e: eater.emoji }), { lang: bn ? "bn" : "en" });
  }

  private spawnCards() {
    const shuffled = [...this.chain.links].sort(() => Math.random() - 0.5);
    const gap = this.scale.width / (shuffled.length + 1);
    shuffled.forEach((link, i) => {
      const x = gap * (i + 1);
      const c = this.add.container(x, this.cardY);
      const g = this.add.graphics();
      g.fillStyle(0x2f4b7c, 1);
      g.fillRoundedRect(-CARD_W / 2, -34, CARD_W, 68, 14);
      g.lineStyle(2, 0x6ee7ff, 1);
      g.strokeRoundedRect(-CARD_W / 2, -34, CARD_W, 68, 14);
      c.add(g);
      const emoji = this.add.text(0, -8, link.emoji, txt(30, "#ffffff", { align: "center" })).setOrigin(0.5);
      c.add(emoji);
      const label = this.add.text(0, 22, this.word(link), txt(12, "#ffffff", { align: "center" })).setOrigin(0.5);
      c.add(label);
      c.setSize(CARD_W, 68);
      c.setInteractive();
      c.on("pointerdown", () => this.tap(c, link));
      this.cards.push({ sprite: c, link });
    });
  }

  private reflowCards() {
    if (!this.cards.length) return;
    const gap = this.scale.width / (this.cards.length + 1);
    this.cards.forEach((c, i) => c.sprite.setPosition(gap * (i + 1), this.cardY));
  }

  private tap(container: Phaser.GameObjects.Container, link: Link) {
    const expected = this.chain.links[this.stepIdx + 1];
    if (link !== expected) {
      hintWrong(this, container, {
        hint: () => `The ${this.word(this.chain.links[this.stepIdx])} is eaten by the ${this.word(expected)}!`,
        hintBn: () => `${this.word(this.chain.links[this.stepIdx])}কে খায় ${this.word(expected)}!`,
        correct: () => expected.emoji,
        options: () => this.cards.map((c) => ({ sprite: c.sprite, value: c.link.emoji })),
      });
      return;
    }
    pop();
    correctButton(container);
    container.disableInteractive();
    // fly the card into its slot, then light the arrow
    const slotIdx = this.stepIdx + 1;
    this.tweens.add({
      targets: container,
      x: this.slotX(slotIdx),
      y: this.scale.height * SLOT_YS,
      duration: 340,
      ease: "Back.easeOut",
      onComplete: () => {
        this.slots[slotIdx].setText(link.emoji);
        this.arrows[this.stepIdx].setAlpha(1);
        this.stepIdx++;
        if (this.stepIdx >= 2) {
          this.finishRound();
        } else {
          this.ask();
        }
      },
    });
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private clearCards() {
    this.cards.forEach((c) => c.sprite.destroy());
    this.cards = [];
  }
}

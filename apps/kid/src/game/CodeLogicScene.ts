import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { getAppLang } from "./locale";
import { t } from "./i18n";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, roundMeter, BTN_PRIMARY, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

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
  tier: number;
  hint: string;
  hintBn: string;
}

// #1161 — band 6 coding logic: read a block and say what it does.
const BLOCK_FACTS: Fact[] = [
  { q: "What does a LOOP block do?", qBn: "লুপ ব্লক কী করে?", options: ["repeats steps", "stops the game", "erases the screen", "turns off the device"], optionsBn: ["ধাপ বারবার চালায়", "খেলা থামায়", "পর্দা মুছে দেয়", "ডিভাইস বন্ধ করে"], answer: 0, emoji: "🔁", tier: 1, hint: "A loop runs the same steps again and again.", hintBn: "লুপ একই ধাপ বারবার চালায়।" },
  { q: "What does a MOVE block do?", qBn: "মুভ ব্লক কী করে?", options: ["moves the character", "sings a song", "draws a circle", "waits for a minute"], optionsBn: ["চরিত্রকে নড়ায়", "গান গায়", "বৃত্ত আঁকে", "এক মিনিট অপেক্ষা করে"], answer: 0, emoji: "➡️", tier: 1, hint: "Move changes where the character is.", hintBn: "মুভ চরিত্রের জায়গা বদলায়।" },
  { q: "What does a PRINT block do?", qBn: "প্রিন্ট ব্লক কী করে?", options: ["shows text on screen", "prints a paper photo", "makes a sound", "closes the app"], optionsBn: ["পর্দায় লেখা দেখায়", "কাগজে ছবি ছাপায়", "শব্দ করে", "অ্যাপ বন্ধ করে"], answer: 0, emoji: "🖨️", tier: 1, hint: "Print shows a message to the user.", hintBn: "প্রিন্ট ব্যবহারকারীকে বার্তা দেখায়।" },
  { q: "What does a WAIT block do?", qBn: "ওয়েট ব্লক কী করে?", options: ["pauses for a moment", "speeds things up", "deletes a sprite", "adds a point"], optionsBn: ["কিছুক্ষণ থামে", "গতি বাড়ায়", "স্প্রাইট মুছে দেয়", "পয়েন্ট যোগ করে"], answer: 0, emoji: "⏸️", tier: 1, hint: "Wait holds before the next step.", hintBn: "ওয়েট পরের ধাপের আগে থামিয়ে রাখে।" },
  { q: "What does a START block do?", qBn: "স্টার্ট ব্লক কী করে?", options: ["begins the program", "ends the program", "saves the game", "mutes the sound"], optionsBn: ["প্রোগ্রাম শুরু করে", "প্রোগ্রাম শেষ করে", "খেলা সংরক্ষণ করে", "শব্দ বন্ধ করে"], answer: 0, emoji: "▶️", tier: 2, hint: "Every program starts from the start block.", hintBn: "প্রতিটি প্রোগ্রাম স্টার্ট ব্লক থেকে শুরু হয়।" },
  { q: "What does an IF block do?", qBn: "ইফ ব্লক কী করে?", options: ["chooses a path", "draws a line", "adds two numbers", "plays music"], optionsBn: ["একটি পথ বেছে নেয়", "রেখা আঁকে", "দুটি সংখ্যা যোগ করে", "গান বাজায়"], answer: 0, emoji: "❓", tier: 2, hint: "If checks a condition and picks what to do.", hintBn: "ইফ শর্ত দেখে সিদ্ধান্ত নেয়।" },
  { q: "What does a STOP block do?", qBn: "স্টপ ব্লক কী করে?", options: ["ends the program", "starts the program", "makes a copy", "turns up the volume"], optionsBn: ["প্রোগ্রাম শেষ করে", "প্রোগ্রাম শুরু করে", "কপি তৈরি করে", "শব্দ বাড়ায়"], answer: 0, emoji: "⏹️", tier: 2, hint: "Stop finishes what is running.", hintBn: "স্টপ চলমান কাজ শেষ করে।" },
  { q: "What does a SOUND block do?", qBn: "সাউন্ড ব্লক কী করে?", options: ["plays a sound", "prints a letter", "moves a sprite", "waits a second"], optionsBn: ["শব্দ বাজায়", "অক্ষর ছাপায়", "স্প্রাইট নড়ায়", "এক সেকেন্ড অপেক্ষা করে"], answer: 0, emoji: "🔊", tier: 2, hint: "Sound makes the device speak or beep.", hintBn: "সাউন্ড ডিভাইসে শব্দ বা বিপ করে।" },
];

// #1161 — band 7 coding logic: order the steps.
const STEPS_FACTS: Fact[] = [
  { q: "To send an email, what comes FIRST?", qBn: "ইমেইল পাঠাতে প্রথমে কী করতে হয়?", options: ["open the email app", "press send", "wait for a reply", "close the laptop"], optionsBn: ["ইমেইল অ্যাপ খোলা", "পাঠাও চাপা", "উত্তরের অপেক্ষা করা", "ল্যাপটপ বন্ধ করা"], answer: 0, emoji: "📧", tier: 1, hint: "You need the app before you can type.", hintBn: "লেখার আগে অ্যাপ খুলতে হয়।" },
  { q: "After writing a message, what is the NEXT step?", qBn: "বার্তা লেখার পরের ধাপ কী?", options: ["press send", "turn off the phone", "erase the address", "take a nap"], optionsBn: ["পাঠাও চাপা", "ফোন বন্ধ করা", "ঠিকানা মুছে ফেলা", "ঘুমিয়ে যাওয়া"], answer: 0, emoji: "✉️", tier: 1, hint: "The message must be sent to reach its reader.", hintBn: "বার্তা পাঠালেই তা পাঠকের কাছে পৌঁছায়।" },
  { q: "To make tea, what comes FIRST?", qBn: "চা বানাতে প্রথমে কী করতে হয়?", options: ["boil water", "pour the tea", "drink it", "wash the cup"], optionsBn: ["পানি ফোটানো", "চা ঢালা", "পান করা", "কাপ ধোয়া"], answer: 0, emoji: "🍵", tier: 1, hint: "Hot water comes before the tea leaves steep.", hintBn: "চা পাতা দেওয়ার আগে গরম পানি দরকার।" },
  { q: "A robot must draw a square. Which step comes FIRST?", qBn: "রোবটকে বর্গ আঁকতে হবে। প্রথম ধাপ কী?", options: ["move forward", "turn and stop", "lift the pen", "take a photo"], optionsBn: ["সামনে এগোনো", "ঘুরে থামা", "কলম তোলা", "ছবি তোলা"], answer: 0, emoji: "🤖", tier: 2, hint: "The first side is drawn by moving forward.", hintBn: "প্রথম বাহু সামনে এগিয়ে আঁকা হয়।" },
  { q: "To repeat a move 5 times, which block helps?", qBn: "একটি কাজ ৫ বার করতে কোন ব্লক সাহায্য করে?", options: ["a loop", "a print", "a wait", "a stop"], optionsBn: ["লুপ", "প্রিন্ট", "ওয়েট", "স্টপ"], answer: 0, emoji: "🔁", tier: 2, hint: "Loops run steps again and again.", hintBn: "লুপ ধাপ বারবার চালায়।" },
  { q: "You made a spelling mistake in code. What should you do?", qBn: "কোডে বানান ভুল হয়েছে। কী করা উচিত?", options: ["find and fix it", "delete everything", "close the app", "ignore it"], optionsBn: ["খুঁজে ঠিক করা", "সব মুছে ফেলা", "অ্যাপ বন্ধ করা", "উপেক্ষা করা"], answer: 0, emoji: "🐞", tier: 2, hint: "Debugging means finding and fixing errors.", hintBn: "ডিবাগিং মানে ভুল খুঁজে ঠিক করা।" },
  { q: "To check a password before opening, which block fits?", qBn: "পাসওয়ার্ড যাচাই করে খুলতে কোন ব্লক মানানসই?", options: ["an IF block", "a SOUND block", "a PRINT block", "a WAIT block"], optionsBn: ["ইফ ব্লক", "সাউন্ড ব্লক", "প্রিন্ট ব্লক", "ওয়েট ব্লক"], answer: 0, emoji: "🔑", tier: 3, hint: "If checks whether the password is right.", hintBn: "ইফ দেখে পাসওয়ার্ড ঠিক কি না।" },
  { q: "A game shows 'You win!' when the score is 10. Which idea is this?", qBn: "স্কোর ১০ হলে খেলা 'তুমি জিতেছ!' দেখায়। এটা কোন ধারণা?", options: ["condition and action", "a spelling rule", "a colour change", "a screen break"], optionsBn: ["শর্ত ও কাজ", "বানানের নিয়ম", "রং বদলানো", "স্ক্রিন বিরতি"], answer: 0, emoji: "🏆", tier: 3, hint: "If score is 10, then show the message.", hintBn: "যদি স্কোর ১০ হয়, তাহলে বার্তা দেখাও।" },
];

// #1164 — band 8 coding-logic depth: find and fix simple bugs.
const DEBUG_FACTS: Fact[] = [
  { q: "Your program should print 'Hello' but prints 'Helo'. What is the bug?", qBn: "তোমার প্রোগ্রামের 'Hello' ছাপার কথা, কিন্তু ছাপে 'Helo'। ভুলটি কী?", options: ["a missing letter", "a missing loop", "too much sound", "a closed app"], optionsBn: ["একটি অক্ষর কম", "লুপ কম", "অতিরিক্ত শব্দ", "অ্যাপ বন্ধ"], answer: 0, emoji: "🐞", tier: 1, hint: "Compare the expected text with what printed.", hintBn: "যা ছাপার কথা আর যা ছাপল তা মেলাও।" },
  { q: "A loop should run 5 times but runs forever. What is probably missing?", qBn: "একটি লুপের ৫ বার চলার কথা, কিন্তু চলে অবিরাম। সম্ভবত কী নেই?", options: ["a stop condition", "a sound", "a colour", "a name"], optionsBn: ["থামার শর্ত", "একটি শব্দ", "একটি রং", "একটি নাম"], answer: 0, emoji: "🔁", tier: 1, hint: "A loop needs a way to know when to stop.", hintBn: "লুপের জানা দরকার কখন থামবে।" },
  { q: "A robot must turn left, but it turns right. Which step needs fixing?", qBn: "রোবটের বাঁয়ে ঘোরার কথা, কিন্তু ঘোরে ডানে। কোন ধাপ ঠিক করতে হবে?", options: ["the turn direction", "the start button", "the battery colour", "the robot's name"], optionsBn: ["ঘোরার দিক", "শুরুর বোতাম", "ব্যাটারির রং", "রোবটের নাম"], answer: 0, emoji: "🤖", tier: 1, hint: "Check which way the robot actually moves.", hintBn: "রোবট আসলে কোন দিকে যায় দেখো।" },
  { q: "What is the FIRST step to fix a bug?", qBn: "ভুল ঠিক করার প্রথম ধাপ কী?", options: ["find where the mistake happens", "delete the whole program", "change the screen colour", "close the laptop"], optionsBn: ["ভুলটা কোথায় হচ্ছে খুঁজে বের করা", "পুরো প্রোগ্রাম মুছে ফেলা", "পর্দার রং বদলানো", "ল্যাপটপ বন্ধ করা"], answer: 0, emoji: "🔍", tier: 2, hint: "You must locate the problem before fixing it.", hintBn: "ঠিক করার আগে সমস্যাটি খুঁজে পেতে হয়।" },
  { q: "Which one is debugging?", qBn: "কোনটি ডিবাগিং?", options: ["finding and fixing mistakes in code", "drawing a picture", "turning up the volume", "saving a file"], optionsBn: ["কোডের ভুল খুঁজে ঠিক করা", "ছবি আঁকা", "শব্দ বাড়ানো", "ফাইল সংরক্ষণ করা"], answer: 0, emoji: "🛠️", tier: 2, hint: "Debugging means finding and fixing errors.", hintBn: "ডিবাগিং মানে ভুল খুঁজে ঠিক করা।" },
  { q: "The score shows 0 even after a goal. What should you check first?", qBn: "গোলের পরও স্কোর ০ দেখায়। আগে কী পরীক্ষা করা উচিত?", options: ["the code that adds points", "the background colour", "the music volume", "the character's hat"], optionsBn: ["পয়েন্ট যোগ করার কোড", "পটভূমির রং", "গানের আওয়াজ", "চরিত্রের টুপি"], answer: 0, emoji: "⚽", tier: 2, hint: "Find the step that should change the score.", hintBn: "যে ধাপে স্কোর বদলানোর কথা তা খুঁজো।" },
  { q: "An IF block runs the wrong action because the condition is backwards. How do you fix it?", qBn: "শর্ত উল্টো থাকায় IF ব্লক ভুল কাজ চালায়। কীভাবে ঠিক করবে?", options: ["reverse the condition", "add more sound", "delete the program", "turn the screen off"], optionsBn: ["শর্তটি উল্টে দাও", "আরও শব্দ যোগ করো", "প্রোগ্রাম মুছে দাও", "পর্দা বন্ধ করো"], answer: 0, emoji: "❓", tier: 3, hint: "The condition decides which path runs.", hintBn: "শর্তই ঠিক করে কোন পথ চলবে।" },
  { q: "Why do programmers test with small examples first?", qBn: "প্রোগ্রামাররা আগে ছোট উদাহরণ দিয়ে পরীক্ষা করে কেন?", options: ["to spot mistakes quickly", "to make the game slower", "to use more battery", "to hide the code"], optionsBn: ["ভুল দ্রুত খুঁজে পেতে", "খেলা ধীর করতে", "ব্যাটারি বেশি খরচ করতে", "কোড লুকাতে"], answer: 0, emoji: "🧪", tier: 3, hint: "Small cases are easy to check by hand.", hintBn: "ছোট উদাহরণ হাতে মেলানো সহজ।" },
];

const BUTTON_RADIUS = 56;

/**
 * CodeLogic (#1161). Band 6-7 ICT answer-button scene.
 * Hosts the coding/logic strand that has no legacy scene: "what does this
 * block do" (band 6) and "order the steps" (band 7). Skill id selects the
 * fact bank; level ramps the tier. Same answer-button + #1158 challenge
 * contract as ScienceFacts/HumanBodyScene.
 */
export class CodeLogicScene extends Phaser.Scene {
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
    super("CodeLogic");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; challenge?: boolean; skill?: string }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.skillId = data.skill ?? "";
    this.challenge = !!data.challenge;
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    gameBackground(this, "candy");
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
    if (this.skillId === "ict-code-steps")
      return L("Order the steps", "ধাপ সাজাই");
    if (this.skillId === "ict-code-debug")
      return L("Code logic: find & fix", "কোড যুক্তি: খুঁজে ঠিক করি");
    return L("What does this block do?", "এই ব্লকটি কী করে?");
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
    if (this.skillId === "ict-code-steps") return STEPS_FACTS;
    if (this.skillId === "ict-code-debug") return DEBUG_FACTS;
    return BLOCK_FACTS;
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
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
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
        challenge: this.challenge,
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

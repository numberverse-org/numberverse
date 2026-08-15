import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, answerFlash } from "./ui";
import { SAB } from "./safeArea";
import { makeDraggableTo } from "./gestures";

const LEVELS = GAMES.find((g) => g.id === "game-animalsmove")?.difficultyLevels ?? [3, 3, 4, 4, 5, 5];
const ROUNDS_TO_FINISH = 3;

type Move = "fly" | "swim" | "crawl" | "walk";

interface Animal {
  id: string;   // i18n name key suffix → anBird etc.
  emoji: string;
  move: Move;
  tier: number;
}

/** 24 animals, each with ONE clear way of moving. Tier = how famous the animal
 *  is (lvl 1–2 show the 10 most famous, lvl 3–4 add 8 more, lvl 5–6 all 24). */
const ANIMALS: Animal[] = [
  // fly
  { id: "Bird", emoji: "🐦", move: "fly", tier: 1 },
  { id: "Butterfly", emoji: "🦋", move: "fly", tier: 1 },
  { id: "Bee", emoji: "🐝", move: "fly", tier: 2 },
  { id: "Eagle", emoji: "🦅", move: "fly", tier: 2 },
  { id: "Ladybug", emoji: "🐞", move: "fly", tier: 3 },
  { id: "Bat", emoji: "🦇", move: "fly", tier: 3 },
  // swim
  { id: "Fish", emoji: "🐟", move: "swim", tier: 1 },
  { id: "Dolphin", emoji: "🐬", move: "swim", tier: 1 },
  { id: "Shark", emoji: "🦈", move: "swim", tier: 2 },
  { id: "Octopus", emoji: "🐙", move: "swim", tier: 2 },
  { id: "Crocodile", emoji: "🐊", move: "swim", tier: 3 },
  { id: "Seal", emoji: "🦭", move: "swim", tier: 3 },
  // crawl
  { id: "Snake", emoji: "🐍", move: "crawl", tier: 1 },
  { id: "Snail", emoji: "🐌", move: "crawl", tier: 1 },
  { id: "Ant", emoji: "🐜", move: "crawl", tier: 1 },
  { id: "Caterpillar", emoji: "🐛", move: "crawl", tier: 2 },
  { id: "Spider", emoji: "🕷️", move: "crawl", tier: 2 },
  { id: "Lizard", emoji: "🦎", move: "crawl", tier: 3 },
  // walk
  { id: "Elephant", emoji: "🐘", move: "walk", tier: 1 },
  { id: "Cow", emoji: "🐄", move: "walk", tier: 1 },
  { id: "Horse", emoji: "🐎", move: "walk", tier: 1 },
  { id: "Chicken", emoji: "🐔", move: "walk", tier: 2 },
  { id: "Giraffe", emoji: "🦒", move: "walk", tier: 2 },
  { id: "Rabbit", emoji: "🐰", move: "walk", tier: 3 },
];

/** Static key names so the audit scanner sees every i18n literal. */
const NAME_KEY: Record<string, string> = {
  Bird: "anBird", Butterfly: "anButterfly", Bee: "anBee", Eagle: "anEagle",
  Ladybug: "anLadybug", Bat: "anBat", Fish: "anFish", Dolphin: "anDolphin",
  Shark: "anShark", Octopus: "anOctopus", Crocodile: "anCrocodile", Seal: "anSeal",
  Snake: "anSnake", Snail: "anSnail", Ant: "anAnt", Caterpillar: "anCaterpillar",
  Spider: "anSpider", Lizard: "anLizard", Elephant: "anElephant", Cow: "anCow",
  Horse: "anHorse", Chicken: "anChicken", Giraffe: "anGiraffe", Rabbit: "anRabbit",
};

const MOVE_BIN: Record<Move, string> = { fly: "anFly", swim: "anSwim", crawl: "anCrawl", walk: "anWalk" };
const MOVE_VERB: Record<Move, string> = { fly: "anFlyV", swim: "anSwimV", crawl: "anCrawlV", walk: "anWalkV" };
const MOVE_ICON: Record<Move, string> = { fly: "🕊️", swim: "🌊", crawl: "🪱", walk: "👣" };

/** Queue size per round by level (tier ladder above caps the animal pool). */
function queueSize(level: number): number {
  return LEVELS[Math.min(level, LEVELS.length - 1)];
}

/**
 * Animal moves (#204). A band-1/2 science game sorting animals by how they
 * move. The kid drags each animal emoji into one of four bins — Fly, Swim,
 * Crawl, Walk. Correct lands the animal with a spoken "{name} {verb}"; wrong
 * returns the animal to its perch and flashes the right bin as a hint.
 */
export class AnimalsMoveScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private queue: Animal[] = [];
  private qIdx = 0;
  private correct = 0; // first-try correct placements
  private wrongThisAnimal = false;
  private busy = false;
  private bins: { c: Phaser.GameObjects.Container; move: Move }[] = [];
  private animalBox!: Phaser.GameObjects.Container;
  private animalEmoji!: Phaser.GameObjects.Text;
  private animalName!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private perch = { x: 0, y: 0 };
  private binGeom = { cardW: 0, cardH: 0, startX: 0, c0: 0, c1: 0 };

  constructor() {
    super("AnimalsMove");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "forest");
    this.titleText = this.add
      .text(0, 0, t("titleAnimals"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);

    this.animalBox = this.add.container(0, 0).setDepth(20).setSize(120, 120);
    this.animalEmoji = this.add.text(0, -16, "🐦", txt(74, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.animalName = this.add.text(0, 44, "", txt(22, "#ffffff", { bold: true, outline: true, shadow: false })).setOrigin(0.5);
    this.animalBox.add([this.animalEmoji, this.animalName]);
    makeDraggableTo(this, this.animalBox, {
      getTargets: () => this.bins.map((b) => b.c),
      onDrop: (target) => {
        if (this.busy) return;
        const hit = this.bins.find((b) => b.c === target);
        this.dropOn(hit?.move ?? null);
      },
    });

    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.tallyText.setPosition(width - 42, 100);
    this.prompt.setPosition(width / 2, height * 0.14);
    this.prompt.setWordWrapWidth(Math.max(200, width - 60));
    this.perch = { x: width / 2, y: height * 0.35 };
    this.animalBox.setPosition(this.perch.x, this.perch.y);

    // 2×2 bins, fit from the bottom up
    const gap = 14;
    const cardW = Math.max(100, Math.min(200, (width - 3 * gap) / 2));
    const cardH = 128;
    const startX = width / 2 - (cardW + gap) / 2;
    const bandTop = height * 0.5;
    const bandBottom = height - 18 - SAB();
    const totalH = 2 * cardH + gap;
    const topY = Math.max(bandTop, bandBottom - totalH);
    const c0 = topY + cardH / 2;
    this.binGeom = { cardW, cardH, startX, c0, c1: c0 + cardH + gap };
    this.bins.forEach((b, i) => {
      b.c.setPosition(i % 2 === 0 ? startX : startX + cardW + gap, i < 2 ? c0 : c0 + cardH + gap);
    });
  }

  private startRound() {
    this.clearRound();
    const pool = ANIMALS.filter((a) => a.tier <= (this.levelIndex < 2 ? 1 : this.levelIndex < 4 ? 2 : 3));
    Phaser.Utils.Array.Shuffle(pool);
    this.queue = pool.slice(0, Math.min(pool.length, queueSize(this.levelIndex)));
    this.qIdx = 0;
    this.correct = 0;
    this.wrongThisAnimal = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    this.spawnBins();
    this.showCurrent();
  }

  private spawnBins() {
    this.clearBins();
    const { cardW, cardH, startX, c0, c1 } = this.binGeom;
    const GAP = 14;
    (["fly", "swim", "crawl", "walk"] as Move[]).forEach((move, i) => {
      const x = i % 2 === 0 ? startX : startX + cardW + GAP;
      const y = i < 2 ? c0 : c1;
      const bin = this.makeBin(x, y, move);
      this.bins.push({ c: bin, move });
    });
  }

  private makeBin(x: number, y: number, move: Move): Phaser.GameObjects.Container {
    const { cardW, cardH } = this.binGeom;
    const bg = this.add.graphics();
    bg.fillStyle(BTN_NEUTRAL.top, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(BTN_NEUTRAL.bottom, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(0x93a3b8, 0.5);
    bg.fillRoundedRect(-cardW / 2, cardH / 2 - 10, cardW, 10, 5);
    const icon = this.add.text(0, -20, MOVE_ICON[move], txt(44, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    const label = this.add.text(0, 28, t(MOVE_BIN[move]), txt(24, "#1e293b", { bold: true, shadow: false })).setOrigin(0.5);
    const c = this.add.container(x, y, [bg, icon, label]);
    c.setSize(cardW, cardH);
    c.setInteractive({ useHandCursor: true });
    return c;
  }

  private showCurrent() {
    const a = this.queue[this.qIdx];
    this.wrongThisAnimal = false;
    this.animalEmoji.setText(a.emoji);
    this.animalName.setText(t(NAME_KEY[a.id]));
    this.animalBox.setPosition(this.perch.x, this.perch.y);
    this.animalBox.setAlpha(1);
    this.animalBox.setScale(1);
    this.prompt.setText(t("anQ", { animal: t(NAME_KEY[a.id]) }));
    speak(
      getAppLang() === "bn"
        ? `${t(NAME_KEY[a.id])} কীভাবে চলে?`
        : `How does the ${t(NAME_KEY[a.id])} move?`,
      { lang: getAppLang() === "bn" ? "bn" : "en" }
    );
  }

  private dropOn(move: Move | null) {
    const a = this.queue[this.qIdx];
    if (move === null) {
      this.flyBack();
      return;
    }
    const bin = this.bins.find((b) => b.move === move)!;
    if (move === a.move) {
      this.correctPlace(a, bin);
      return;
    }
    this.wrongPlace(a, bin);
  }

  private correctPlace(a: Animal, bin: { c: Phaser.GameObjects.Container; move: Move }) {
    this.busy = true;
    if (!this.wrongThisAnimal) this.correct++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    pop();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.floatMsg(t("anGreat"));
    speak(t("anSpeak", { animal: t(NAME_KEY[a.id]), move: t(MOVE_VERB[a.move]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.flashBin(bin, 0x4ade80);
    this.tweens.add({
      targets: this.animalBox,
      x: bin.c.x,
      y: bin.c.y,
      scale: 0.7,
      alpha: 0.6,
      duration: 260,
      ease: "Back.easeIn",
      onComplete: () => this.advance(),
    });
  }

  private wrongPlace(a: Animal, bin: { c: Phaser.GameObjects.Container; move: Move }) {
    this.wrongThisAnimal = true;
    bad();
    this.floatMsg(t("anSpeak", { animal: t(NAME_KEY[a.id]), move: t(MOVE_VERB[a.move]) }));
    this.flashBin(bin, 0xf87171);
    this.tweens.add({ targets: bin.c, x: bin.c.x + 8, duration: 60, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
    // show the RIGHT bin as a green hint, then send the animal home to try again
    const right = this.bins.find((b) => b.move === a.move)!;
    this.flashBin(right, 0x4ade80, 0.45);
    this.flyBack();
  }

  private flyBack() {
    this.animalBox.setPosition(this.perch.x, this.perch.y);
    this.animalBox.setScale(1);
    this.animalBox.setAlpha(1);
  }

  private flashBin(bin: { c: Phaser.GameObjects.Container; move: Move }, color: number, alpha = 0.9) {
    const { cardW, cardH } = this.binGeom;
    // #1364 — pair the green/red rectangle with a ✓/✕ badge so right-vs-wrong
    // is not communicated by color alone.
    answerFlash(this, bin.c, color, {
      w: cardW,
      h: cardH,
      alpha,
      radius: 18,
      glyph: color === 0x4ade80 ? "check" : "cross",
    });
  }

  private advance() {
    this.animalBox.setAlpha(1);
    this.animalBox.setScale(1);
    this.qIdx++;
    if (this.qIdx < this.queue.length) {
      this.busy = false;
      this.time.delayedCall(200, () => this.showCurrent());
      return;
    }
    this.finishRound();
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t("anDone")}  ${digit(this.correct)}/${digit(this.queue.length)}`);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.correct === this.queue.length, ms, this.levelIndex + 1);
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.busy = false;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.28, text, NV_GOLD, 26, -24);
  }

  private clearBins() {
    this.bins.forEach((b) => b.c.destroy());
    this.bins = [];
  }

  private clearRound() {
    this.clearBins();
    this.queue = [];
  }

}



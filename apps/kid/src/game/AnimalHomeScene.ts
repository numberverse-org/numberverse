import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, ringCorrect, roundMeter, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";
import { ensureAssets, assetIcon } from "./svgAssets";
import { makeDraggableTo } from "./gestures";

const LEVELS = GAMES.find((g) => g.id === "game-animalhome")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
interface Animal {
  icon: string;
  home: "Water" | "Land" | "Sky";
  homeIcon: string;
  /** 1 = famous (fish/tiger/eagle), 2 = common, 3 = tricky (crocodile/bat…). */
  tier: 1 | 2 | 3;
}
const ANIMAL_BN: Record<string, string> = {
  bat: "বাদুড়", bird: "পাখি", butterfly: "প্রজাপতি", camel: "উট", crocodile: "কুমির",
  deer: "হরিণ", dolphin: "ডলফিন", eagle: "ঈগল", elephant: "হাতি", fish: "মাছ",
  frog: "ব্যাঙ", lion: "সিংহ", owl: "পেঁচা", parrot: "টিয়া", penguin: "পেঙ্গুইন",
  rhino: "গন্ডার", tiger: "বাঘ", turtle: "কচ্ছপ",
};

const ANIMALS: Animal[] = [
  { icon: "fish", home: "Water", homeIcon: "wave", tier: 1 },
  { icon: "tiger", home: "Land", homeIcon: "tree", tier: 1 },
  { icon: "eagle", home: "Sky", homeIcon: "cloud", tier: 1 },
  { icon: "dolphin", home: "Water", homeIcon: "wave", tier: 1 },
  { icon: "elephant", home: "Land", homeIcon: "tree", tier: 1 },
  { icon: "bird", home: "Sky", homeIcon: "cloud", tier: 1 },
  { icon: "frog", home: "Water", homeIcon: "wave", tier: 2 },
  { icon: "lion", home: "Land", homeIcon: "tree", tier: 2 },
  { icon: "butterfly", home: "Sky", homeIcon: "cloud", tier: 2 },
  { icon: "turtle", home: "Water", homeIcon: "wave", tier: 2 },
  { icon: "deer", home: "Land", homeIcon: "tree", tier: 2 },
  { icon: "owl", home: "Sky", homeIcon: "cloud", tier: 2 },
  { icon: "penguin", home: "Water", homeIcon: "wave", tier: 2 },
  { icon: "rhino", home: "Land", homeIcon: "tree", tier: 3 },
  { icon: "bat", home: "Sky", homeIcon: "cloud", tier: 3 },
  { icon: "crocodile", home: "Water", homeIcon: "wave", tier: 3 },
  { icon: "camel", home: "Land", homeIcon: "tree", tier: 3 },
  { icon: "parrot", home: "Sky", homeIcon: "cloud", tier: 3 },
];
const HOMES = ["Water", "Land", "Sky"] as const;
const HOME_ICON = { Water: "wave", Land: "tree", Sky: "cloud" } as const;
/** Friendly English names for hint sentences (the icon is the visual name). */
const ANIMAL_NAME: Record<string, string> = {
  fish: "fish", tiger: "tiger", eagle: "eagle", dolphin: "dolphin", elephant: "elephant",
  bird: "bird", frog: "frog", lion: "lion", butterfly: "butterfly", turtle: "turtle",
  deer: "deer", owl: "owl", penguin: "penguin", rhino: "rhino", bat: "bat",
  crocodile: "crocodile", camel: "camel", parrot: "parrot",
};
const BUTTON_RADIUS = 54;
const ROUNDS_TO_FINISH = 3;

/** How many animals the kid must match in one round, by level tier. */
function queueSize(level: number): number {
  return level >= 4 ? 3 : level >= 2 ? 2 : 1;
}
/** Which animal pool the level draws from — trickier animals later. */
function poolForLevel(level: number): Animal[] {
  return level >= 4 ? ANIMALS.filter((a) => a.tier <= 3) : level >= 2 ? ANIMALS.filter((a) => a.tier <= 2) : ANIMALS.filter((a) => a.tier === 1);
}

/**
 * Animal Homes — where does this animal live?
 * Band 4 (ages 8–10, Science). Shows an animal emoji, kid taps Water/Land/Sky.
 * Level 1–2: match one famous animal. Level 3–4: match two. Level 5–6: match
 * three (one of each home) from trickier animals.
 */
export class AnimalHomeScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  /** Animals still to match this round (one per home, so hints never collide). */
  private queue: Animal[] = [];
  private qIdx = 0;
  private buttons: { sprite: Phaser.GameObjects.Container; value: string }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private animalBox!: Phaser.GameObjects.Container;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;

  constructor() {
    super("AnimalHome");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    ensureAssets(this);
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleAnimalHome"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", {bold: true}))
      .setOrigin(0.5);
    this.animalBox = this.add.container(0, 0);
    this.meter = roundMeter(this);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("whereLives"));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.layout();
    this.startRound();

    // KID GESTURE — drag-to-home: the classic toddler drag. Grab the animal
    // and drop it on Water / Land / Sky. Swipe-to-answer stands down while
    // the animal is being dragged (it's registered as "nv:dragObj").
    this.animalBox.setSize(150, 150);
    makeDraggableTo(this, this.animalBox, {
      getTargets: () => this.buttons.map((b) => b.sprite),
      onDrop: (target) => {
        // return the animal to its perch (fly back, gently)
        const cx = this.scale.width / 2;
        const cy = this.scale.height * 0.42;
        this.tweens.add({ targets: this.animalBox, x: cx, y: cy, duration: 180, ease: "Back.easeOut" });
        if (!target) return;
        const hit = this.buttons.find((b) => b.sprite === target);
        if (hit) this.tap(hit.sprite, hit.value);
      },
    });
  }

  private drawBackground() {
    gameBackground(this, "forest");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.animalBox.setPosition(width / 2, height * 0.42);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  private startRound() {
    this.clearButtons();
    const size = queueSize(this.levelIndex);
    const pool = poolForLevel(this.levelIndex);
    // pick `size` animals with DISTINCT homes so hint keys never collide mid-round
    const homes: (typeof HOMES)[number][] = [...HOMES].sort(() => Math.random() - 0.5);
    const picks: Animal[] = [];
    for (const home of homes) {
      const cand = pool.filter((a) => a.home === home);
      if (!cand.length) continue;
      picks.push(cand[Phaser.Math.Between(0, cand.length - 1)]);
      if (picks.length >= size) break;
    }
    this.queue = picks;
    this.qIdx = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.showCurrent();
    this.spawnButtons();
  }

  /** Show the next animal to match + a "x of y" nudge. */
  private showCurrent() {
    const a = this.queue[this.qIdx];
    this.animalBox.removeAll(true);
    this.animalBox.add(assetIcon(this, a.icon, 132));
    this.prompt.set(
      this.queue.length > 1
        ? t("whereLivesN", { n: this.qIdx + 1, total: this.queue.length })
        : t("whereLives")
    );
    speak(getAppLang() === "bn"
      ? `${ANIMAL_BN[a.icon] ?? a.icon} কোথায় থাকে?`
      : `Where does the ${a.icon} live?`);
  }

  private spawnButtons() {
    const opts = [...HOMES].sort(() => Math.random() - 0.5);
    const { width } = this.scale;
    const spacing = BUTTON_RADIUS * 2 + 14;
    const startX = width / 2 - (spacing * (opts.length - 1)) / 2;
    const y = this.answersY;
    opts.forEach((home, i) => {
      const c = modernAnswerButton(this, startX + i * spacing, y, BUTTON_RADIUS, "");
      c.add([
        assetIcon(this, HOME_ICON[home as keyof typeof HOME_ICON], 54, { y: -18 }),
        this.add.text(0, 22, home, txt(20, "#052e3f", { bold: true, shadow: false })).setOrigin(0.5),
      ]);
      c.on("pointerdown", () => this.tap(c, home));
      this.buttons.push({ sprite: c, value: home });
    });
  }

  private tap(container: Phaser.GameObjects.Container, home: string) {
    const target = this.queue[this.qIdx];
    if (home !== target.home) {
      hintWrong(this, container, {
        hint: () => `The ${this.animalName(target)} lives in ${target.home} — tap ${target.home}`,
        hintBn: () => `${this.animalName(target)} থাকে ${target.home} — ${target.home} চাপো`,
        correct: () => target.home,
        options: () => this.buttons,
      });
      return;
    }
    pop();
    ringCorrect(this, container);
    this.sparkle(container.x, container.y);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    this.time.delayedCall(260, () => {
      this.qIdx++;
      if (this.qIdx < this.queue.length) {
        // next animal, same home buttons — restore + re-enable
        this.buttons.forEach((b) => {
          b.sprite.setAlpha(1);
          b.sprite.setInteractive();
        });
        this.showCurrent();
      } else {
        const ms = Math.max(1, this.time.now - this.startedAt);
        win();
        this.roundsDone++;
        this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
        this.onRoundDone?.(true, ms, this.levelIndex + 1);
        this.time.delayedCall(500, () => {
          if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
          this.levelIndex++;
          this.startRound();
        });
      }
    });
  }

  private animalName(a: Animal): string {
    return ANIMAL_NAME[a.icon] ?? a.icon;
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

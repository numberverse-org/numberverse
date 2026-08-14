import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, ringCorrect, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
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

/** #1276 — baby→adult pairs (the "animal babies" half of the skill). Baby and
 *  adult must be DISTINCT emojis so a kid can actually tell them apart; the
 *  home field keeps a hint from naming a conflicting home when both round
 *  kinds are mixed. Names are en/bn literals for hint + TTS lines (the emoji
 *  is the visual name, same pattern as ANIMAL_NAME above). */
interface Baby {
  baby: string;    // baby emoji
  adult: string;   // adult emoji
  babyEn: string;
  babyBn: string;
  adultEn: string;
  adultBn: string;
  home: "Water" | "Land" | "Sky";
  tier: 1 | 2 | 3;
}
const BABIES: Baby[] = [
  { baby: "🐣", adult: "🐔", babyEn: "chick", babyBn: "ছানা", adultEn: "chicken", adultBn: "মুরগি", home: "Land", tier: 1 },
  { baby: "🐶", adult: "🐕", babyEn: "puppy", babyBn: "কুকুরছানা", adultEn: "dog", adultBn: "কুকুর", home: "Land", tier: 1 },
  { baby: "🐱", adult: "🐈", babyEn: "kitten", babyBn: "বিড়ালছানা", adultEn: "cat", adultBn: "বিড়াল", home: "Land", tier: 1 },
  { baby: "🐯", adult: "🐅", babyEn: "tiger cub", babyBn: "বাঘছানা", adultEn: "tiger", adultBn: "বাঘ", home: "Land", tier: 2 },
  { baby: "🐤", adult: "🐦", babyEn: "baby bird", babyBn: "পাখির ছানা", adultEn: "bird", adultBn: "পাখি", home: "Sky", tier: 2 },
  { baby: "🐠", adult: "🐟", babyEn: "little fish", babyBn: "ছোট মাছ", adultEn: "fish", adultBn: "মাছ", home: "Water", tier: 3 },
  { baby: "🐇", adult: "🐰", babyEn: "bunny", babyBn: "খরগোশছানা", adultEn: "rabbit", adultBn: "খরগোশ", home: "Land", tier: 2 },
];
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
 * Animal Homes & Babies — where does this animal live? + whose baby is this?
 * Band 4 (ages 8–10, Science). Rounds ALTERNATE between the two:
 *   homes  → show an animal emoji, kid taps Water/Land/Sky (18-animal pool).
 *   babies → show a baby emoji, kid taps its mommy/daddy adult (7 baby pairs).
 * Level 1–2: match one. Level 3–4: match two. Level 5–6: match three from the
 * trickier pool. Same drag-to-answer gesture for both round kinds.
 */
export class AnimalHomeScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  /** Which sub-game this round is (#1276 — homes and babies alternate). */
  private roundKind: "homes" | "babies" = "homes";
  /** Animals still to match this round (one per home, so hints never collide). */
  private queue: Animal[] = [];
  /** Baby pairs still to match this round (distinct adults, so answers never repeat). */
  private babyQueue: Baby[] = [];
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
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.animalBox = this.add.container(0, 0);
    this.meter = roundMeter(this);
        this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("whereLives"));
    onSceneResize(this, () => this.layout());
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
    if (this.roundKind === "babies") {
      this.startBabiesRound();
      return;
    }
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

  /** #1276 — baby round: `size` babies with DISTINCT adults (no repeated answers). */
  private startBabiesRound() {
    const size = queueSize(this.levelIndex);
    const pool = BABIES.filter((b) => b.tier <= (this.levelIndex >= 4 ? 3 : this.levelIndex >= 2 ? 2 : 1));
    const picks: Baby[] = [];
    const adults = new Set<string>();
    for (const b of [...pool].sort(() => Math.random() - 0.5)) {
      if (adults.has(b.adult)) continue;
      picks.push(b);
      adults.add(b.adult);
      if (picks.length >= size) break;
    }
    this.babyQueue = picks;
    this.qIdx = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.showBabyCurrent();
    this.spawnBabyButtons();
  }

  /** Show the next baby + a "x of y" nudge, speak "whose baby is this?". */
  private showBabyCurrent() {
    const b = this.babyQueue[this.qIdx];
    this.animalBox.removeAll(true);
    this.animalBox.add(this.add.text(0, 0, b.baby, txt(150, "#ffffff", { shadow: true })).setOrigin(0.5));
    this.prompt.set(
      this.babyQueue.length > 1
        ? t("animalBabyQN", { n: this.qIdx + 1, total: this.babyQueue.length })
        : t("animalBabyQ")
    );
    speak(getAppLang() === "bn" ? `${b.babyBn} — এটা কার বাচ্চা?` : `Whose baby is the ${b.babyEn}?`);
  }

  /** Answer buttons = adult animals (emoji + name), distinct from the queue. */
  private spawnBabyButtons() {
    const adults = [...new Set(this.babyQueue.map((b) => b.adult))];
    while (adults.length < 3) {
      const extra = BABIES[Phaser.Math.Between(0, BABIES.length - 1)].adult;
      if (!adults.includes(extra)) adults.push(extra);
    }
    const opts = adults.sort(() => Math.random() - 0.5);
    const { width } = this.scale;
    const spacing = BUTTON_RADIUS * 2 + 14;
    const startX = width / 2 - (spacing * (opts.length - 1)) / 2;
    const y = this.answersY;
    opts.forEach((adultEmoji, i) => {
      const row = BABIES.find((b) => b.adult === adultEmoji)!;
      const c = modernAnswerButton(this, startX + i * spacing, y, BUTTON_RADIUS, "");
      c.add([
        this.add.text(0, -12, adultEmoji, txt(44, "#052e3f", { shadow: false })).setOrigin(0.5),
        this.add.text(0, 26, getAppLang() === "bn" ? row.adultBn : row.adultEn, txt(15, "#052e3f", { bold: true, shadow: false })).setOrigin(0.5),
      ]);
      c.on("pointerdown", () => this.tap(c, adultEmoji));
      this.buttons.push({ sprite: c, value: adultEmoji });
    });
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

  private tap(container: Phaser.GameObjects.Container, value: string) {
    if (this.roundKind === "babies") {
      this.tapBaby(container, value);
      return;
    }
    const target = this.queue[this.qIdx];
    if (value !== target.home) {
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
        this.completeRound();
      }
    });
  }

  /** #1276 — baby round tap: match the baby to its adult. */
  private tapBaby(container: Phaser.GameObjects.Container, adultEmoji: string) {
    const target = this.babyQueue[this.qIdx];
    if (adultEmoji !== target.adult) {
      hintWrong(this, container, {
        hint: () => `The ${target.babyEn} grows into the ${target.adultEn} — tap the ${target.adultEn}`,
        hintBn: () => `${target.babyBn} বড় হয়ে ${target.adultBn} হয় — ${target.adultBn} চাপো`,
        correct: () => target.adult,
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
      if (this.qIdx < this.babyQueue.length) {
        this.buttons.forEach((b) => {
          b.sprite.setAlpha(1);
          b.sprite.setInteractive();
        });
        this.showBabyCurrent();
      } else {
        this.completeRound();
      }
    });
  }

  /** Round done (either kind) → advance; next round flips homes ⇄ babies. */
  private completeRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(500, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.roundKind = this.roundKind === "homes" ? "babies" : "homes"; // alternate
      this.levelIndex++;
      this.startRound();
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

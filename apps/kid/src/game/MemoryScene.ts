import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { pop, win } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, ringCorrect, gridLayout, roundMeter, type RoundMeterApi, NV_GOLD, NV_NAVY } from "./ui";
import { correctCelebrate } from "./celebrate";
import { SAB } from "./safeArea";

/** Shared memory-flip engine (#1141). Grid size comes from the skill's own
 *  dataLevels (CARD counts); card faces come from a per-skill `pairs` bank.
 *  This is RECALL, not matching: every card is hidden until flipped. */
const DEFAULT_LEVELS = [6, 8, 12, 16, 20, 20]; // total cards per tier
const ROUNDS_TO_FINISH = 2; // memory is slower than tap games
const CARD_COLS = 4;
const CHALLENGE_SECONDS = 20; // #1158 — per-round countdown in challenge mode
const CHALLENGE_BAR = 0xffb703; // gold; the drained bar = the pressure

/** Bilingual helper — this scene is data-first; UI copy lives here instead of
 *  growing the central i18n table (skill titles live in skills.ts). */
const L = (en: string, bn: string) => (getAppLang() === "bn" ? bn : en);

interface MemPair {
  a: string; // face A
  b: string; // face B
  say: string; // spoken when the pair is matched
}

interface MemCard {
  sprite: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Container;
  front: Phaser.GameObjects.Container;
  pairId: number;
  face: string;
  flipped: boolean;
  matched: boolean;
}

/* ── pair banks (one per knowledge-subject memory skill) ──
 * Each bank is a [faceA, faceB] relationship. Content is reused verbatim from
 * the source scenes that first taught the concept. */

/** English compound words — reuse CompoundEnScene.ts (16 compounds). We take
 *  the 12 whose two parts are all distinct so no face appears in two pairs. */
const EN_COMPOUNDS: Array<[string, string, string]> = [
  ["rain", "bow", "rainbow"],
  ["sun", "flower", "sunflower"],
  ["butter", "fly", "butterfly"],
  ["star", "fish", "starfish"],
  ["cup", "cake", "cupcake"],
  ["tooth", "brush", "toothbrush"],
  ["basket", "ball", "basketball"],
  ["snow", "man", "snowman"],
  ["water", "melon", "watermelon"],
  ["pine", "apple", "pineapple"],
  ["honey", "bee", "honeybee"],
  ["book", "shelf", "bookshelf"],
];

function compoundPairs(): MemPair[] {
  return EN_COMPOUNDS.map(([left, right, full]) => ({
    a: left,
    b: right,
    say: `${left} and ${right} make ${full}`,
  }));
}

/** Bangla matra ↔ example word — reuse MatraMatrixScene.ts MATRA_WORDS (10). */
const MATRA_WORDS: Array<[string, string]> = [
  ["া", "কাটা"],
  ["ি", "মিল"],
  ["ী", "বীজ"],
  ["ু", "ফুল"],
  ["ূ", "দূরে"],
  ["ে", "খেলা"],
  ["ো", "রোদ"],
  ["ৈ", "কৈ"],
  ["ৌ", "নৌকা"],
  ["ৃ", "কৃপণ"],
];

function matraPairs(): MemPair[] {
  return MATRA_WORDS.map(([m, word]) => ({ a: m, b: word, say: word }));
}

/** Number bonds to 10 — reuse NumberBondsScene.ts's shown+answer concept. The
 *  pair cards are the two addends; matched = "these two make 10". The five
 *  UNORDERED decompositions keep every face distinct (1..9 + one 5-pair). */
const BONDS_TO_10: Array<[number, number]> = [
  [1, 9],
  [2, 8],
  [3, 7],
  [4, 6],
  [5, 5],
];

function bondPairs(): MemPair[] {
  const bn = getAppLang() === "bn";
  const target = digit(10);
  return BONDS_TO_10.map(([a, b]) => ({
    a: digit(a),
    b: digit(b),
    say: bn ? `${digit(a)} আর ${digit(b)} মিলে ${target}!` : `${a} and ${b} make 10!`,
  }));
}

/** English word ↔ synonym — reuse SynAntScene.ts SYN (16 pairs). */
const SYNONYM_PAIRS: Array<[string, string]> = [
  ["happy", "glad"],
  ["big", "large"],
  ["small", "tiny"],
  ["quick", "fast"],
  ["sad", "unhappy"],
  ["begin", "start"],
  ["end", "finish"],
  ["pretty", "beautiful"],
  ["angry", "mad"],
  ["clever", "smart"],
  ["easy", "simple"],
  ["hard", "difficult"],
  ["shout", "yell"],
  ["laugh", "giggle"],
  ["look", "watch"],
  ["run", "sprint"],
];

function synonymPairs(): MemPair[] {
  return SYNONYM_PAIRS.map(([a, b]) => ({ a, b, say: `${a} means ${b}` }));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Phaser.Math.Between(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Memory — the shared flip-grid engine (#1141).
 * One scene backs four knowledge-subject memory variants; the App passes the
 * skill id and this scene picks the pair bank (the same pattern as
 * MathSolveScene's skillId switch). Flip two hidden cards; a matched pair stays
 * face-up, a mismatch flips back. Visuals follow MemoryPairsScene.ts.
 */
export class MemoryScene extends Phaser.Scene {
  private skillId = "";
  private levels: number[] = DEFAULT_LEVELS;
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private challenge = false; // #1158 — timed rounds, no mid-round reset
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private pairs: MemPair[] = [];
  private cards: MemCard[] = [];
  private first: MemCard | null = null;
  private busy = false;
  private matchedCount = 0;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("Memory");
  }

  create(data: {
    onRoundDone: (correct: boolean, ms: number, difficulty: number) => void;
    startLevelIndex?: number;
    levels?: number[];
    challenge?: boolean;
    skill?: string;
    skillId?: string;
  }) {
    this.onRoundDone = data.onRoundDone;
    this.skillId = data.skill || data.skillId || "mem-compound-words";
    this.levels = data.levels?.length ? data.levels : DEFAULT_LEVELS;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.challenge = !!data.challenge;
    if (this.challenge) {
      this.challengeBar = this.add.rectangle(0, 122, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);
    }
    if (this.skillId === "mem-bangla-matra") gameBackground(this, "night");
    else if (this.skillId === "mem-number-bonds") gameBackground(this, "magic");
    else gameBackground(this, "candy");
    this.titleText = this.add
      .text(0, 0, this.titleForSkill(), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(20, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(this.promptForSkill());
    onSceneResize(this, () => {
      this.layout();
      this.reflowGrid();
    });
    this.layout();
    this.startRound();
  }

  private titleForSkill(): string {
    switch (this.skillId) {
      case "mem-compound-words":
        return L("Compound memory", "যৌগিক শব্দের স্মৃতি");
      case "mem-bangla-matra":
        return L("Matra memory", "মাত্রার স্মৃতি");
      case "mem-number-bonds":
        return L("Number bond memory", "সংখ্যা জোড়ার স্মৃতি");
      case "mem-synonyms":
        return L("Synonym memory", "সমার্থক শব্দের স্মৃতি");
      default:
        return L("Memory", "স্মৃতি খেলা");
    }
  }

  private promptForSkill(): string {
    switch (this.skillId) {
      case "mem-compound-words":
        return L("Flip two cards — join the parts into one compound word!", "দুটো কার্ড খোলো — অংশ জুড়ে একটি যৌগিক শব্দ বানাও!");
      case "mem-bangla-matra":
        return L("Flip two cards — match each matra to its word!", "দুটো কার্ড খোলো — প্রতিটি মাত্রার সাথে তার শব্দ মেলাও!");
      case "mem-number-bonds":
        return L("Flip two cards that add up to 10!", "দুটো কার্ড খোলো — যেগুলো মিলে ১০ হয়!");
      case "mem-synonyms":
        return L("Flip two cards — match each word to its synonym!", "দুটো কার্ড খোলো — প্রতিটি শব্দের সাথে তার সমার্থক শব্দ মেলাও!");
      default:
        return L("Flip two cards and find the pairs!", "দুটো কার্ড খোলো আর জোড়া খুঁজে বের করো!");
    }
  }

  private conceptLine(): string {
    switch (this.skillId) {
      case "mem-compound-words":
        return L("Compound words!", "যৌগিক শব্দ!");
      case "mem-bangla-matra":
        return L("Matras!", "মাত্রা!");
      case "mem-number-bonds":
        return L("Number bonds to ten!", "দশের জোড়া!");
      case "mem-synonyms":
        return L("Synonyms!", "সমার্থক শব্দ!");
      default:
        return L("Great memory!", "দারুণ স্মৃতি!");
    }
  }

  /** The language each skill's matched-pair concept should be spoken in. */
  private sayLang(): "en" | "bn" {
    switch (this.skillId) {
      case "mem-bangla-matra":
        return "bn";
      case "mem-number-bonds":
        return getAppLang() === "bn" ? "bn" : "en";
      default:
        return "en";
    }
  }

  private buildPairs(): MemPair[] {
    switch (this.skillId) {
      case "mem-compound-words":
        return compoundPairs();
      case "mem-bangla-matra":
        return matraPairs();
      case "mem-number-bonds":
        return bondPairs();
      case "mem-synonyms":
        return synonymPairs();
      default:
        return compoundPairs();
    }
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private gridSpec(pairs: number) {
    const n = pairs * 2;
    const rows = Math.ceil(n / CARD_COLS);
    const gl = gridLayout(this, {
      cols: CARD_COLS,
      rows,
      preferredW: 92,
      minW: 56,
      cardH: 86,
      widthPad: 24,
      topPad: 150,
      bottomY: this.scale.height - 180 - SAB(),
      gapX: 10,
      gapY: 10,
    });
    return { rows, n, gl };
  }

  private startRound() {
    this.clearCards();
    this.first = null;
    this.busy = false;
    this.matchedCount = 0;
    this.startedAt = this.time.now;
    this.data.set("nv:difficulty", this.levelIndex + 1); // #1061 — reward engine sees round hardness
    const cardCount = this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
    const bank = this.buildPairs();
    // Card count is the tier; a smaller bank (number bonds has 5 distinct
    // decompositions) caps the round rather than duplicating faces.
    const wantPairs = Math.max(1, Math.floor(cardCount / 2));
    const pairCount = Math.min(wantPairs, bank.length);
    this.pairs = shuffle(bank).slice(0, pairCount);
    const entries: { pairId: number; face: string }[] = [];
    this.pairs.forEach((p, i) => {
      entries.push({ pairId: i, face: p.a });
      entries.push({ pairId: i, face: p.b });
    });
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.spawnCards(shuffle(entries));
    this.armChallenge();
  }

  private spawnCards(entries: { pairId: number; face: string }[]) {
    const { rows, gl } = this.gridSpec(entries.length / 2);
    const gridH = (rows - 1) * gl.spacingY;
    const w = gl.cardW;
    const h = gl.cardH;
    entries.forEach((e, i) => {
      const x = gl.startX + (i % CARD_COLS) * gl.spacingX;
      const y = gl.cy - gridH / 2 + Math.floor(i / CARD_COLS) * gl.spacingY;
      const card = this.makeCard(x, y, w, h, e.pairId, e.face);
      card.sprite.setData("idx", i);
      card.sprite.on("pointerdown", () => this.tap(card));
      this.cards.push(card);
    });
  }

  private makeCard(x: number, y: number, w: number, h: number, pairId: number, face: string): MemCard {
    const sprite = this.add.container(x, y);
    const back = this.add.container(0, 0);
    const front = this.add.container(0, 0);

    const cardFace = (scene: Phaser.Scene, fill: number, stroke: number) => {
      const g = scene.add.graphics();
      g.fillStyle(fill, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      g.lineStyle(3, stroke, 1);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
      g.lineStyle(2, 0xffffff, 0.7);
      g.strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 11);
      return g;
    };

    back.add(cardFace(this, 0x7c3aed, 0x4c1d95));
    const mark = this.add
      .text(0, 0, "✦", txt(30, "#fdf4ff", { bold: true, shadow: false }))
      .setOrigin(0.5);
    back.add(mark);

    front.add(cardFace(this, 0xffffff, 0x0b2545));
    const label = this.add
      .text(0, 0, face, txt(22, NV_NAVY, { bold: true, shadow: false, wrap: Math.max(50, Math.round(w - 12)) }))
      .setOrigin(0.5);
    // Long single words (sunflower, watermelon) never wrap — scale-to-fit.
    label.setScale(Math.min(1, (w - 10) / Math.max(1, label.width)));
    front.add(label);

    front.setVisible(false);
    sprite.add([back, front]);
    sprite.setSize(w, h);
    sprite.setInteractive({ useHandCursor: true });

    return { sprite, back, front, pairId, face, flipped: false, matched: false };
  }

  private tap(card: MemCard) {
    if (this.busy || card.flipped || card.matched) return;
    this.flip(card);
    card.flipped = true;
    if (!this.first) {
      this.first = card;
      return;
    }
    const a = this.first;
    this.first = null;
    this.busy = true;
    if (a.pairId === card.pairId) {
      this.matchPair(a, card);
    } else {
      this.tweens.add({ targets: a.sprite, y: a.sprite.y - 8, duration: 60, yoyo: true, repeat: 1 });
      this.tweens.add({ targets: card.sprite, y: card.sprite.y - 8, duration: 60, yoyo: true, repeat: 1 });
      this.time.delayedCall(760, () => {
        if (!a.sprite.active || !card.sprite.active) return; // challenge timer may have reset the board
        this.flip(a);
        a.flipped = false;
        this.flip(card);
        card.flipped = false;
        this.busy = false;
      });
    }
  }

  private matchPair(a: MemCard, b: MemCard) {
    pop();
    a.matched = true;
    b.matched = true;
    this.matchedCount++;
    ringCorrect(this, a.sprite);
    ringCorrect(this, b.sprite);
    this.sparkle(a.sprite.x, a.sprite.y);
    this.sparkle(b.sprite.x, b.sprite.y);
    const say = this.pairs[a.pairId]?.say;
    if (say) speak(say, { lang: this.sayLang() });
    if (this.matchedCount >= this.pairs.length) {
      this.challengeDone = true; // round solved — stop the countdown
      this.disarmChallenge();
      const ms = Math.max(1, this.time.now - this.startedAt);
      win();
      correctCelebrate(this, this.scale.width / 2, this.scale.height * 0.4);
      speak(this.conceptLine(), { lang: this.sayLang() });
      this.roundsDone++;
      this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
      this.onRoundDone?.(true, ms, this.levelIndex + 1);
      this.time.delayedCall(800, () => {
        if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
        this.levelIndex++;
        this.startRound();
      });
    } else {
      this.time.delayedCall(160, () => {
        this.busy = false;
      });
    }
  }

  private flip(card: MemCard) {
    this.tweens.add({
      targets: card.sprite,
      scaleX: 0.05,
      duration: 110,
      ease: "Quad.easeIn",
      onComplete: () => {
        card.front.setVisible(card.flipped);
        card.back.setVisible(!card.flipped);
        this.tweens.add({ targets: card.sprite, scaleX: 1, duration: 130, ease: "Quad.easeOut" });
      },
    });
  }

  private reflowGrid() {
    const { rows, gl } = this.gridSpec(this.pairs.length);
    const gridH = (rows - 1) * gl.spacingY;
    for (const c of this.cards) {
      const i = c.sprite.getData("idx") as number;
      c.sprite.setPosition(gl.startX + (i % CARD_COLS) * gl.spacingX, gl.cy - gridH / 2 + Math.floor(i / CARD_COLS) * gl.spacingY);
    }
  }

  private clearCards() {
    this.cards.forEach((c) => c.sprite.destroy());
    this.cards = [];
  }

  /* ── challenge countdown (same contract as MathSolve/Percent) ── */
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

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 14; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, this.randomColor());
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-60, 60),
        y: y + Phaser.Math.Between(-60, 60),
        alpha: 0,
        duration: 480,
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

import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD, NV_GREEN, NV_RED } from "./ui";
import { SAB } from "./safeArea";
import { makeDraggableTo } from "./gestures";

const LEVELS = GAMES.find((g) => g.id === "game-festivals")?.difficultyLevels ?? [4, 4, 5, 5, 6, 6];
const ROUNDS_TO_FINISH = 3;

type Festival = "boishakh" | "eid";

interface Item {
  id: string; // i18n name key suffix → fcPantaBhat etc.
  emoji: string;
  festival: Festival;
  tier: number;
}

/** 16 items — 8 per festival — gentle cultural customs, no religious content. */
const ITEMS: Item[] = [
  // Pohela Boishakh
  { id: "PantaBhat", emoji: "🍚", festival: "boishakh", tier: 1 },
  { id: "HilsaFish", emoji: "🐟", festival: "boishakh", tier: 1 },
  { id: "Alpana", emoji: "🎨", festival: "boishakh", tier: 1 },
  { id: "NewYear", emoji: "🗓️", festival: "boishakh", tier: 1 },
  { id: "NakshiKantha", emoji: "🧵", festival: "boishakh", tier: 2 },
  { id: "Shobhajatra", emoji: "🎭", festival: "boishakh", tier: 2 },
  { id: "BasantiClothes", emoji: "👕", festival: "boishakh", tier: 2 },
  { id: "BoishakhiFlowers", emoji: "🌷", festival: "boishakh", tier: 2 },
  // Eid
  { id: "Semai", emoji: "🍜", festival: "eid", tier: 1 },
  { id: "NewClothes", emoji: "👔", festival: "eid", tier: 1 },
  { id: "Eidi", emoji: "💵", festival: "eid", tier: 1 },
  { id: "Sweets", emoji: "🍬", festival: "eid", tier: 1 },
  { id: "EidCard", emoji: "💌", festival: "eid", tier: 2 },
  { id: "NewShoes", emoji: "👟", festival: "eid", tier: 2 },
  { id: "Khichuri", emoji: "🍛", festival: "eid", tier: 2 },
  { id: "Henna", emoji: "🌿", festival: "eid", tier: 2 },
];

/** Static i18n keys so the audit scanner sees every literal. */
const NAME_KEY: Record<string, string> = {
  PantaBhat: "fcPantaBhat", HilsaFish: "fcHilsaFish", Alpana: "fcAlpana", NewYear: "fcNewYear",
  NakshiKantha: "fcNakshiKantha", Shobhajatra: "fcShobhajatra", BasantiClothes: "fcBasantiClothes",
  BoishakhiFlowers: "fcBoishakhiFlowers", Semai: "fcSemai", NewClothes: "fcNewClothes",
  Eidi: "fcEidi", Sweets: "fcSweets", EidCard: "fcEidCard", NewShoes: "fcNewShoes",
  Khichuri: "fcKhichuri", Henna: "fcHenna",
};
const FESTIVAL_KEY: Record<Festival, string> = { boishakh: "fcBoishakh", eid: "fcEid" };
const FESTIVAL_ICON: Record<Festival, string> = { boishakh: "🎉", eid: "🎊" };

function queueSize(level: number): number {
  return LEVELS[Math.min(level, LEVELS.length - 1)];
}

/**
 * Our festivals (#213). A band-2 civic game sorting gentle cultural customs
 * into two festival bins — Pohela Boishakh 🎉 and Eid 🎊. The kid drags each
 * item into the matching bin; correct drops land with a spoken "{item} for
 * {festival}", wrong drops shake red + flash the right bin. All 16 items are
 * everyday, non-religious-adjacent customs (food, clothes, cards, henna).
 * Bangla + English labels everywhere (i18n).
 */
export class FestivalSortScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private queue: Item[] = [];
  private qIdx = 0;
  private correct = 0;
  private wrongThisItem = false;
  private busy = false;
  private bins: { c: Phaser.GameObjects.Container; festival: Festival }[] = [];
  private itemBox!: Phaser.GameObjects.Container;
  private itemEmoji!: Phaser.GameObjects.Text;
  private itemName!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: Phaser.GameObjects.Text;
  private tallyText!: Phaser.GameObjects.Text;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private perch = { x: 0, y: 0 };
  private binGeom = { cardW: 0, cardH: 0, startX: 0, c0: 0 };

  constructor() {
    super("FestivalSort");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sunset");
    this.titleText = this.add
      .text(0, 0, t("titleFestivals"), txt(34, "#ffffff", { bold: true }))
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

    this.itemBox = this.add.container(0, 0).setDepth(20).setSize(130, 130);
    this.itemEmoji = this.add.text(0, -18, "🍚", txt(72, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.itemName = this.add.text(0, 46, "", txt(22, "#ffffff", { bold: true, outline: true, shadow: false })).setOrigin(0.5);
    this.itemBox.add([this.itemEmoji, this.itemName]);
    makeDraggableTo(this, this.itemBox, {
      getTargets: () => this.bins.map((b) => b.c),
      onDrop: (target) => {
        if (this.busy) return;
        const hit = this.bins.find((b) => b.c === target);
        this.dropOn(hit?.festival ?? null);
      },
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
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
    this.itemBox.setPosition(this.perch.x, this.perch.y);

    const gap = 14;
    const cardW = Math.max(100, Math.min(230, (width - 3 * gap) / 2));
    const cardH = 150;
    const startX = width / 2 - (cardW + gap) / 2;
    const bandTop = height * 0.5;
    const bandBottom = height - 18 - SAB();
    const c0 = Math.max(bandTop + cardH / 2, bandBottom - cardH / 2);
    this.binGeom = { cardW, cardH, startX, c0 };
    this.bins.forEach((b, i) => {
      b.c.setPosition(i === 0 ? startX : startX + cardW + gap, c0);
    });
  }

  private startRound() {
    this.clearRound();
    const pool = ITEMS.filter((it) => it.tier <= (this.levelIndex < 4 ? 1 : 2));
    Phaser.Utils.Array.Shuffle(pool);
    this.queue = pool.slice(0, Math.min(pool.length, queueSize(this.levelIndex)));
    this.qIdx = 0;
    this.correct = 0;
    this.wrongThisItem = false;
    this.busy = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    this.spawnBins();
    this.showCurrent();
  }

  private clearRound() {
    this.clearBins();
  }

  private spawnBins() {
    this.clearBins();
    const { cardW, cardH, startX, c0 } = this.binGeom;
    const GAP = 14;
    (["boishakh", "eid"] as Festival[]).forEach((festival, i) => {
      const x = i === 0 ? startX : startX + cardW + GAP;
      this.bins.push({ c: this.makeBin(x, c0, festival), festival });
    });
  }

  private makeBin(x: number, y: number, festival: Festival): Phaser.GameObjects.Container {
    const { cardW, cardH } = this.binGeom;
    const bg = this.add.graphics();
    bg.fillStyle(BTN_NEUTRAL.top, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(BTN_NEUTRAL.bottom, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(0x93a3b8, 0.5);
    bg.fillRoundedRect(-cardW / 2, cardH / 2 - 12, cardW, 12, 5);
    const icon = this.add.text(0, -24, FESTIVAL_ICON[festival], txt(44, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    const label = this.add.text(0, 30, t(FESTIVAL_KEY[festival]), txt(24, "#1e293b", { bold: true, shadow: false, wrap: cardW - 16 })).setOrigin(0.5);
    const c = this.add.container(x, y, [bg, icon, label]);
    c.setSize(cardW, cardH);
    c.setInteractive({ useHandCursor: true });
    return c;
  }

  private showCurrent() {
    const it = this.queue[this.qIdx];
    this.wrongThisItem = false;
    this.itemEmoji.setText(it.emoji);
    this.itemName.setText(t(NAME_KEY[it.id]));
    this.itemBox.setPosition(this.perch.x, this.perch.y);
    this.itemBox.setAlpha(1);
    this.itemBox.setScale(1);
    this.prompt.setText(t("fcQ", { item: t(NAME_KEY[it.id]) }));
    speak(
      getAppLang() === "bn"
        ? `${t(NAME_KEY[it.id])} কোন উৎসবে?`
        : `Where does the ${t(NAME_KEY[it.id])} belong?`,
      { lang: getAppLang() === "bn" ? "bn" : "en" }
    );
  }

  private dropOn(festival: Festival | null) {
    const it = this.queue[this.qIdx];
    if (festival === null) {
      this.flyBack();
      return;
    }
    const bin = this.bins.find((b) => b.festival === festival)!;
    if (festival === it.festival) this.correctPlace(it, bin);
    else this.wrongPlace(it, bin);
  }

  private correctPlace(it: Item, bin: { c: Phaser.GameObjects.Container; festival: Festival }) {
    this.busy = true;
    if (!this.wrongThisItem) this.correct++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    pop();
    win();
    this.floatMsg(t("fcGreat"));
    speak(t("fcSpeak", { item: t(NAME_KEY[it.id]), festival: t(FESTIVAL_KEY[it.festival]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
    this.flashBin(bin, 0x4ade80);
    this.tweens.add({
      targets: this.itemBox,
      x: bin.c.x,
      y: bin.c.y,
      scale: 0.7,
      alpha: 0.6,
      duration: 260,
      ease: "Back.easeIn",
      onComplete: () => this.advance(),
    });
  }

  private wrongPlace(it: Item, bin: { c: Phaser.GameObjects.Container; festival: Festival }) {
    this.wrongThisItem = true;
    bad();
    this.floatMsg(t("fcSpeak", { item: t(NAME_KEY[it.id]), festival: t(FESTIVAL_KEY[it.festival]) }));
    this.flashBin(bin, 0xef4444);
    this.flashBin(this.bins.find((b) => b.festival === it.festival)!, 0x4ade80);
    this.tweens.add({
      targets: this.itemBox,
      x: this.itemBox.x + 10,
      duration: 70,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });
  }

  private flashBin(bin: { c: Phaser.GameObjects.Container }, color: number) {
    const { cardW, cardH } = this.binGeom;
    const g = this.add.graphics().setDepth(15);
    g.fillStyle(color, 0.6);
    g.fillRoundedRect(bin.c.x - cardW / 2, bin.c.y - cardH / 2, cardW, cardH, 18);
    this.tweens.add({ targets: g, alpha: 0, duration: 500, onComplete: () => g.destroy() });
  }

  private flyBack() {
    this.tweens.add({ targets: this.itemBox, x: this.perch.x, y: this.perch.y, duration: 200, ease: "Sine.easeOut" });
  }

  private advance() {
    this.qIdx++;
    if (this.qIdx < this.queue.length) {
      this.busy = false;
      this.showCurrent();
    } else {
      this.finishRound();
    }
  }

  private finishRound() {
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.floatMsg(`${t("fcDone")}  ${digit(this.correct)}/${digit(this.queue.length)}`, 0xffd166);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(this.wrongsAllZero(), ms, this.levelIndex + 1);
    this.busy = false;
    this.time.delayedCall(2000, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private wrongsAllZero(): boolean {
    return this.correct === this.queue.length;
  }

  private floatMsg(text: string, color = 0xffd166) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.4, text, txt(26, "#ffffff", { bold: true, outline: true, wrap: 320 }))
      .setColor(color === 0xffd166 ? NV_GOLD : color === 0x4ade80 ? NV_GREEN : NV_RED)
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
  }

  private clearBins() {
    this.bins.forEach((b) => b.c.destroy());
    this.bins = [];
  }
}

function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

const BN_D = "০১২৩৪৫৬৭৮৯";

import Phaser from "phaser";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, BTN_NEUTRAL, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";
import { makeDraggableTo } from "./gestures";

const LEVELS = GAMES.find((g) => g.id === "game-seasons")?.difficultyLevels ?? [4, 4, 5, 5, 6, 6];
const ROUNDS_TO_FINISH = 3;

type Season = "summer" | "rainy" | "winter" | "spring";

interface Item {
  id: string;   // i18n name key suffix → wsSunscreen etc.
  emoji: string;
  season: Season;
  tier: number;
}

/** 20 items — 5 per season — that a 5–8yo in Bangladesh clearly associates. */
const ITEMS: Item[] = [
  // summer
  { id: "Sunscreen", emoji: "🧴", season: "summer", tier: 1 },
  { id: "Watermelon", emoji: "🍉", season: "summer", tier: 1 },
  { id: "Tshirt", emoji: "👕", season: "summer", tier: 1 },
  { id: "Sunglasses", emoji: "🕶️", season: "summer", tier: 2 },
  { id: "BeachUmbrella", emoji: "⛱️", season: "summer", tier: 3 },
  // rainy
  { id: "Umbrella", emoji: "☂️", season: "rainy", tier: 1 },
  { id: "Raincoat", emoji: "🧥", season: "rainy", tier: 1 },
  { id: "Rainboots", emoji: "🥾", season: "rainy", tier: 2 },
  { id: "Rainbow", emoji: "🌈", season: "rainy", tier: 2 },
  { id: "Raincloud", emoji: "🌧️", season: "rainy", tier: 3 },
  // winter
  { id: "Scarf", emoji: "🧣", season: "winter", tier: 1 },
  { id: "Gloves", emoji: "🧤", season: "winter", tier: 1 },
  { id: "Snowman", emoji: "⛄", season: "winter", tier: 2 },
  { id: "Cocoa", emoji: "☕", season: "winter", tier: 2 },
  { id: "Woolsocks", emoji: "🧦", season: "winter", tier: 3 },
  // spring
  { id: "Flower", emoji: "🌸", season: "spring", tier: 1 },
  { id: "Kite", emoji: "🪁", season: "spring", tier: 1 },
  { id: "Butterfly", emoji: "🦋", season: "spring", tier: 2 },
  { id: "Chick", emoji: "🐣", season: "spring", tier: 2 },
  { id: "Seedling", emoji: "🌱", season: "spring", tier: 3 },
];

/** Static i18n keys so the audit scanner sees every literal. */
const NAME_KEY: Record<string, string> = {
  Sunscreen: "wsSunscreen", Watermelon: "wsWatermelon", Tshirt: "wsTshirt",
  Sunglasses: "wsSunglasses", BeachUmbrella: "wsBeachUmbrella", Umbrella: "wsUmbrella",
  Raincoat: "wsRaincoat", Rainboots: "wsRainboots", Rainbow: "wsRainbow",
  Raincloud: "wsRaincloud", Scarf: "wsScarf", Gloves: "wsGloves", Snowman: "wsSnowman",
  Cocoa: "wsCocoa", Woolsocks: "wsWoolsocks", Flower: "wsFlower", Kite: "wsKite",
  Butterfly: "wsButterfly", Chick: "wsChick", Seedling: "wsSeedling",
};

const SEASON_KEY: Record<Season, string> = { summer: "wsSummer", rainy: "wsRainy", winter: "wsWinter", spring: "wsSpring" };
const SEASON_ICON: Record<Season, string> = { summer: "☀️", rainy: "🌧️", winter: "❄️", spring: "🌸" };

function queueSize(level: number): number {
  return LEVELS[Math.min(level, LEVELS.length - 1)];
}

/**
 * Weather & seasons (#206). A band-1 science game sorting clothes & activities
 * into the four seasons. The kid drags each item into the matching season bin
 * (Summer ☀️ / Rainy 🌧️ / Winter ❄️ / Spring 🌸); correct drops land with a
 * spoken "{item} for {season}", wrong drops shake red + flash the right bin.
 * Bangla + English labels everywhere (i18n).
 */
export class WeatherSeasonsScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private queue: Item[] = [];
  private qIdx = 0;
  private correct = 0;
  private wrongThisItem = false;
  private busy = false;
  private bins: { c: Phaser.GameObjects.Container; season: Season }[] = [];
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
  private binGeom = { cardW: 0, cardH: 0, startX: 0, c0: 0, c1: 0 };

  constructor() {
    super("WeatherSeasons");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleSeasons"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, "#ffd166", { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = this.add
      .text(0, 0, "", txt(26, "#ffffff", { bold: true, outline: true, wrap: 340 }))
      .setOrigin(0.5);
    this.tallyText = this.add
      .text(0, 0, "", txt(20, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5);

    this.itemBox = this.add.container(0, 0).setDepth(20).setSize(130, 130);
    this.itemEmoji = this.add.text(0, -18, "☂️", txt(72, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.itemName = this.add.text(0, 46, "", txt(22, "#ffffff", { bold: true, outline: true, shadow: false })).setOrigin(0.5);
    this.itemBox.add([this.itemEmoji, this.itemName]);
    makeDraggableTo(this, this.itemBox, {
      getTargets: () => this.bins.map((b) => b.c),
      onDrop: (target) => {
        if (this.busy) return;
        const hit = this.bins.find((b) => b.c === target);
        this.dropOn(hit?.season ?? null);
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
    const pool = ITEMS.filter((it) => it.tier <= (this.levelIndex < 2 ? 1 : this.levelIndex < 4 ? 2 : 3));
    Phaser.Utils.Array.Shuffle(pool);
    this.queue = pool.slice(0, Math.min(pool.length, queueSize(this.levelIndex)));
    this.qIdx = 0;
    this.correct = 0;
    this.wrongThisItem = false;
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
    (["summer", "rainy", "winter", "spring"] as Season[]).forEach((season, i) => {
      const x = i % 2 === 0 ? startX : startX + cardW + GAP;
      const y = i < 2 ? c0 : c1;
      this.bins.push({ c: this.makeBin(x, y, season), season });
    });
  }

  private makeBin(x: number, y: number, season: Season): Phaser.GameObjects.Container {
    const { cardW, cardH } = this.binGeom;
    const bg = this.add.graphics();
    bg.fillStyle(BTN_NEUTRAL.top, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(BTN_NEUTRAL.bottom, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bg.fillStyle(0x93a3b8, 0.5);
    bg.fillRoundedRect(-cardW / 2, cardH / 2 - 10, cardW, 10, 5);
    const icon = this.add.text(0, -22, SEASON_ICON[season], txt(40, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    const label = this.add.text(0, 26, t(SEASON_KEY[season]), txt(24, "#1e293b", { bold: true, shadow: false })).setOrigin(0.5);
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
    this.prompt.setText(t("wsQ", { item: t(NAME_KEY[it.id]) }));
    speak(
      getAppLang() === "bn"
        ? `${t(NAME_KEY[it.id])} কোন ঋতুতে?`
        : `Where does the ${t(NAME_KEY[it.id])} belong?`,
      { lang: getAppLang() === "bn" ? "bn" : "en" }
    );
  }

  private dropOn(season: Season | null) {
    const it = this.queue[this.qIdx];
    if (season === null) {
      this.flyBack();
      return;
    }
    const bin = this.bins.find((b) => b.season === season)!;
    if (season === it.season) this.correctPlace(it, bin);
    else this.wrongPlace(it, bin);
  }

  private correctPlace(it: Item, bin: { c: Phaser.GameObjects.Container; season: Season }) {
    this.busy = true;
    if (!this.wrongThisItem) this.correct++;
    this.tallyText.setText(`${digit(this.correct)}/${digit(this.queue.length)}`);
    pop();
    win();
    this.floatMsg(t("wsGreat"));
    speak(t("wsSpeak", { item: t(NAME_KEY[it.id]), season: t(SEASON_KEY[it.season]) }), { lang: getAppLang() === "bn" ? "bn" : "en" });
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

  private wrongPlace(it: Item, bin: { c: Phaser.GameObjects.Container; season: Season }) {
    this.wrongThisItem = true;
    bad();
    this.floatMsg(t("wsSpeak", { item: t(NAME_KEY[it.id]), season: t(SEASON_KEY[it.season]) }));
    this.flashBin(bin, 0xf87171);
    this.tweens.add({ targets: bin.c, x: bin.c.x + 8, duration: 60, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
    const right = this.bins.find((b) => b.season === it.season)!;
    this.flashBin(right, 0x4ade80, 0.45);
    this.flyBack();
  }

  private flyBack() {
    this.itemBox.setPosition(this.perch.x, this.perch.y);
    this.itemBox.setScale(1);
    this.itemBox.setAlpha(1);
  }

  private flashBin(bin: { c: Phaser.GameObjects.Container; season: Season }, color: number, alpha = 0.9) {
    const g = this.add.graphics();
    const { cardW, cardH } = this.binGeom;
    g.lineStyle(5, color, alpha);
    g.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
    bin.c.addAt(g, 0);
    this.time.delayedCall(900, () => g.destroy());
  }

  private advance() {
    this.itemBox.setAlpha(1);
    this.itemBox.setScale(1);
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
    this.floatMsg(`${t("wsDone")}  ${digit(this.correct)}/${digit(this.queue.length)}`);
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
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.28, text, txt(26, "#ffd166", { bold: true, outline: true, wrap: 320 }))
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 1400, onComplete: () => m.destroy() });
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

function digit(n: number): string {
  return getAppLang() === "bn" ? String(n).replace(/[0-9]/g, (d) => BN_D[Number(d)]) : String(n);
}

const BN_D = "০১২৩৪৫৬৭৮৯";

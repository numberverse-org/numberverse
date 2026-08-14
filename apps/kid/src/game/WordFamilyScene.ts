import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { GAMES } from "@numberverse/core";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_NEUTRAL, BTN_ORANGE, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

const LEVELS = GAMES.find((g) => g.id === "game-wordfam")?.difficultyLevels ?? [2, 2, 3, 3, 3, 3];
const ROUNDS_TO_FINISH = 3;
const BUCKET_W = 150;
const BUCKET_ZONE_H = 74;

/** A rhyming family: ending + 4 words (done-when: 8 families × 4 words). */
interface Family {
  end: string;
  words: string[];
}
const FAMILIES: Family[] = [
  { end: "-at", words: ["cat", "hat", "bat", "mat"] },
  { end: "-an", words: ["fan", "pan", "man", "can"] },
  { end: "-ig", words: ["pig", "big", "fig", "wig"] },
  { end: "-op", words: ["top", "hop", "mop", "cop"] },
  { end: "-og", words: ["dog", "log", "frog", "jog"] },
  { end: "-ug", words: ["bug", "rug", "hug", "mug"] },
  { end: "-en", words: ["hen", "pen", "ten", "men"] },
  { end: "-et", words: ["pet", "net", "jet", "wet"] },
];

/**
 * Word families — sort words into rhyming family buckets (#186).
 * Band 1 phonics: drag each word tile to its family bucket (-at, -an, -ig …).
 * Correct drop: the word flies into the bucket and is locked; wrong drop:
 * bounce-back + buzz. 8 families × 4 words; 2 buckets early, 3 later.
 */
export class WordFamilyScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private locked = false;
  private fams: Family[] = [];
  private tiles: { sprite: Phaser.GameObjects.Container; word: string; fam: Family; startX: number; startY: number }[] = [];
  private placed: { fam: Family; n: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;

  constructor() {
    super("WordFamily");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "space");
    this.titleText = this.add
      .text(0, 0, t("titleWordFam"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    onSceneResize(this, () => this.layout());
    this.input.on("dragstart", (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDragStart(obj));
    this.input.on("drag", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => {
      if (this.locked) return;
      obj.x = p.x;
      obj.y = p.y;
    });
    this.input.on("dragend", (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container, dropped: boolean) =>
      this.onDragEnd(obj, dropped)
    );
    this.input.on("drop", (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container, zone: Phaser.GameObjects.Zone) =>
      this.onDrop(zone, obj)
    );
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
  }

  private startRound() {
    this.clearRound();
    this.locked = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);

    const k = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)]; // families per round
    const pool = [...FAMILIES];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Phaser.Math.Between(0, i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let chosen = pool.slice(0, k);
    if (chosen[0] === this.fams[0] && k === this.fams.length) chosen = pool.slice(k, k * 2);
    this.fams = chosen;

    // buckets along the bottom with a drop-zone area under each label
    const { width, height } = this.scale;
    const spacing = Math.min(BUCKET_W + 40, width / k);
    const bx0 = width / 2 - (spacing * (k - 1)) / 2;
    const by = height - 60 - SAB() - BUCKET_ZONE_H;
    this.placed = [];
    this.fams.forEach((fam, i) => {
      const cx = bx0 + i * spacing;
      const label = modernCardButton(this, cx, by - 30, BUCKET_W, 54, fam.end, BTN_ORANGE, 24);
      label.setAlpha(0.95);
      this.placed[i] = { fam, n: 0 };
      const zone = this.add.zone(cx, by + BUCKET_ZONE_H / 2, BUCKET_W, BUCKET_ZONE_H).setRectangleDropZone(BUCKET_W, BUCKET_ZONE_H);
      zone.setData("fam", fam);
    });

    // word tiles in a grid
    const all = this.fams.flatMap((fam) => fam.words.map((word) => ({ word, fam })));
    for (let i = all.length - 1; i > 0; i--) {
      const j = Phaser.Math.Between(0, i);
      [all[i], all[j]] = [all[j], all[i]];
    }
    const total = all.length;
    const cols = 4;
    const rows = Math.ceil(total / cols);
    const gl = gridLayout(this, {
      cols,
      rows,
      preferredW: 120,
      minW: 64,
      widthPad: 16,
      topPad: height * 0.24,
      bottomY: by - 90,
      cardH: 54,
    });
    all.forEach((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (rows - 1) / 2) * gl.spacingY;
      const tile = modernCardButton(this, x, y, gl.cardW, 54, it.word, BTN_NEUTRAL, 20);
      tile.setData("word", it.word);
      tile.setData("fam", it.fam);
      this.input.setDraggable(tile);
      this.tiles.push({ sprite: tile, word: it.word, fam: it.fam, startX: x, startY: y });
    });
  }

  private onDragStart(obj: Phaser.GameObjects.Container) {
    if (this.locked) return;
    obj.setDepth(30);
    this.tweens.add({ targets: obj, scale: 1.12, duration: 90, ease: "Sine.easeOut" });
  }

  private onDragEnd(obj: Phaser.GameObjects.Container, dropped: boolean) {
    if (this.locked) return;
    if (!dropped) {
      const rec = this.tiles.find((x) => x.sprite === obj);
      this.tweens.add({ targets: obj, x: rec?.startX ?? obj.x, y: rec?.startY ?? obj.y, scale: 1, duration: 130, ease: "Back.easeOut" });
      return;
    }
    // dropped on a zone handled below (this path only for no-zone release)
  }

  private onDrop(zone: Phaser.GameObjects.Zone, obj: Phaser.GameObjects.Container) {
    if (this.locked) return;
    const fam = zone.getData("fam") as Family;
    const word = obj.getData("word") as string;
    const famIdx = this.fams.indexOf(fam);
    const rec = this.tiles.find((x) => x.sprite === obj);
    if (!rec) return;

    if (rec.fam === fam) {
      // correct family — fly into the bucket stack
      pop();
      speak(word, { lang: "en" });
      const placedN = this.placed[famIdx].n;
      this.placed[famIdx].n++;
      const zoneCenterX = zone.x;
      const chipX = zoneCenterX - BUCKET_W / 2 + 24 + (placedN % 2) * 42;
      const chipY = zone.y + 12 - Math.floor(placedN / 2) * 26;
      obj.disableInteractive();
      this.tweens.add({
        targets: obj,
        x: chipX,
        y: chipY,
        scale: 0.7,
        alpha: 0.92,
        duration: 220,
        ease: "Back.easeOut",
      });
      obj.setDepth(10);
      const face = obj.list[0] as Phaser.GameObjects.Image;
      face.setTint(0x4ade80);
      if (this.tiles.every((x) => !x.sprite.input?.enabled)) this.solve();
    } else {
      // wrong bucket — bounce back + buzz
      bad();
      this.tweens.add({
        targets: obj,
        x: rec.startX,
        y: rec.startY,
        scale: 1,
        duration: 180,
        ease: "Back.easeOut",
      });
      this.cameras.main.shake(80, 0.002);
    }
  }

  private solve() {
    this.locked = true;
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.floatMsg(t("wfDone"));
    this.fams.forEach((fam) => {
      this.time.delayedCall(300, () => speak(fam.words.join(", "), { lang: "en" }));
    });
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, this.levelIndex + 1);
    this.time.delayedCall(1600, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.5, text, txt(28, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  private clearRound() {
    this.tiles.forEach((x) => x.sprite.destroy());
    this.tiles = [];
    this.placed = [];
  }
}

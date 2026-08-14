import Phaser from "phaser";
import { DragReorderScene, type DragReorderConfig, type DragCard, type DragTarget } from "./reorder";
import { t } from "./i18n";
import { pop, win, bad } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { txt, modernCardButton, gridLayout, BTN_NEUTRAL, BTN_ORANGE, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";

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

const CFG: DragReorderConfig = {
  gameId: "game-wordfam",
  titleKey: "titleWordFam",
  greatKey: "wfDone",
  doneKey: "wfDone",
  background: "space",
  rounds: 3,
  cardH: 54,
  speakLang: "en",
  dragMode: "free",
  announceDone: false,
};

/**
 * Word families — sort words into rhyming family buckets (#186).
 * Band 1 phonics: drag each word tile to its family bucket (-at, -an, -ig …).
 * Correct drop: the word flies into the bucket and is locked; wrong drop:
 * bounce-back + buzz. 8 families × 4 words; 2 buckets early, 3 later.
 */
export class WordFamilyScene extends DragReorderScene {
  private fams: Family[] = [];
  private placed: { fam: Family; n: number }[] = [];
  private bucketLabels: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("WordFamily");
  }

  protected cfg(): DragReorderConfig {
    return CFG;
  }

  protected dealRound() {
    const ladder = this.ladder();
    const k = ladder[Math.min(this.levelIndex, ladder.length - 1)]; // families per round
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
    this.targets = [];
    this.fams.forEach((fam, i) => {
      const cx = bx0 + i * spacing;
      const label = modernCardButton(this, cx, by - 30, BUCKET_W, 54, fam.end, BTN_ORANGE, 24);
      label.setAlpha(0.95);
      this.bucketLabels.push(label);
      this.placed[i] = { fam, n: 0 };
      const zone = this.add.zone(cx, by + BUCKET_ZONE_H / 2, BUCKET_W, BUCKET_ZONE_H).setRectangleDropZone(BUCKET_W, BUCKET_ZONE_H);
      zone.setData("fam", fam);
      this.targets.push({ value: fam.end, x: cx, y: by + BUCKET_ZONE_H / 2, w: BUCKET_W, h: BUCKET_ZONE_H, obj: zone });
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
      this.input.setDraggable(tile);
      this.cards.push({ obj: tile, item: { value: it.fam.end, label: it.word }, homeX: x, homeY: y, slot: -1, placed: false });
    });
  }

  protected onDrop(card: DragCard, target: DragTarget | null) {
    if (!target) {
      this.tweens.add({ targets: card.obj, x: card.homeX, y: card.homeY, scale: 1, duration: 130, ease: "Back.easeOut" });
      return;
    }
    const famIdx = this.targets.indexOf(target);
    if (card.item.value === target.value) {
      // correct family — fly into the bucket stack
      pop();
      speak(card.item.label, { lang: "en" });
      const placedN = this.placed[famIdx].n;
      this.placed[famIdx].n++;
      const chipX = target.x - BUCKET_W / 2 + 24 + (placedN % 2) * 42;
      const chipY = target.y + 12 - Math.floor(placedN / 2) * 26;
      card.obj.disableInteractive();
      this.tweens.add({
        targets: card.obj,
        x: chipX,
        y: chipY,
        scale: 0.7,
        alpha: 0.92,
        duration: 220,
        ease: "Back.easeOut",
      });
      card.obj.setDepth(10);
      const face = card.obj.list[0] as Phaser.GameObjects.Image;
      face.setTint(0x4ade80);
      card.placed = true;
      card.slot = famIdx;
      if (this.cards.every((x) => x.placed)) this.onSolved();
    } else {
      // wrong bucket — bounce back + buzz
      bad();
      this.tweens.add({
        targets: card.obj,
        x: card.homeX,
        y: card.homeY,
        scale: 1,
        duration: 180,
        ease: "Back.easeOut",
      });
      this.cameras.main.shake(80, 0.002);
    }
  }

  protected onSolved() {
    this.locked = true;
    this.markSolved();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    this.floatMsg(t("wfDone"));
    this.fams.forEach((fam) => {
      this.time.delayedCall(300, () => speak(fam.words.join(", "), { lang: "en" }));
    });
    this.finishRound(true);
  }

  protected advanceDelay(): number {
    return 1600;
  }

  protected floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.5, text, txt(28, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: m, y: m.y - 28, alpha: 0, duration: 1000, onComplete: () => m.destroy() });
  }

  protected clearRound() {
    this.bucketLabels.forEach((l) => l.destroy());
    this.bucketLabels = [];
    this.placed = [];
    super.clearRound();
  }
}

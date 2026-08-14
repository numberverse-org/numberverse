import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { txt, modernCardButton, roundMeter, gridLayout, BTN_PRIMARY, BTN_NEUTRAL, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { CVC_BUILD_POOL } from "./wordBanks";

const LEVELS = GAMES.find((g) => g.id === "game-cvcbuild")?.difficultyLevels ?? [0, 0, 0, 1, 1, 1];
const ROUNDS_TO_FINISH = 3;
const QUESTIONS_PER_ROUND = 4;
const SLOT_H = 66;

/** 20 true-CVC words (16 shared with the read scene + 5 builder extras), all
 *  with 3 DISTINCT letters so the drag build is unambiguous. #1167 — derived
 *  from the shared CVC bank instead of a hand-copied second copy. */
const WORDS: { word: string; emoji: string }[] = CVC_BUILD_POOL.map((w) => ({ word: w.word, emoji: w.emoji }));
const EXTRA_LETTERS = ["p", "n", "r", "b", "m", "l", "k"];

/**
 * CVC word builder (#51).
 * Band 1 phonics: see/hear a CVC picture, then DRAG the 3 letters from a
 * tray into the 3 snap slots to spell it. A letter that lands in its correct
 * slot snaps in green; the wrong letter (or the extra distractor) bounces
 * back. When all 3 slots are home, Nova reads the word aloud.
 */
export class CvcBuildScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private qInRound = 0;
  private startedAt = 0;
  private locked = false;
  private target!: { word: string; emoji: string };
  private letters: string[] = []; // correct letter per slot
  private slotContents: (string | null)[] = [];
  private tiles: { card: Phaser.GameObjects.Container; letter: string; homeX: number; homeY: number; placed: boolean }[] = [];
  private slotX: number[] = [];
  private slotCy = 0;
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private prompt!: QuestionPanelApi;
  private emojiText!: Phaser.GameObjects.Text;
  private stepLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("CvcBuild");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    gameBackground(this, "sky");
    this.titleText = this.add
      .text(0, 0, t("titleCvcBuild"), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.prompt = questionPanel(this, 0, 0);
    this.emojiText = this.add
      .text(0, 0, "", txt(80, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(2);
    onSceneResize(this, () => this.layout());
    this.input.on("dragstart", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDragStart(p, obj));
    this.input.on("drag", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDrag(p, obj));
    this.input.on("dragend", (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.onDragEnd(p, obj));
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    this.prompt.setPosition(width / 2, height * 0.14);
    this.emojiText.setPosition(width / 2, height * 0.28);
  }

  private startRound() {
    this.clearRound();
    this.qInRound = 0;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.askQuestion();
  }

  private askQuestion() {
    this.clearRound();
    this.locked = false;
    let w = WORDS[Phaser.Math.Between(0, WORDS.length - 1)];
    if (this.target && w.word === this.target.word) {
      w = WORDS[(WORDS.indexOf(w) + 1) % WORDS.length];
    }
    this.target = w;
    this.emojiText.setText(w.emoji);
    this.prompt.set(t("cvcBuildPrompt"));
    speak(w.word, { lang: "en" });

    this.letters = w.word.split("");
    this.slotContents = [null, null, null];

    // 3 snap slots at mid-screen
    const gl = gridLayout(this, {
      cols: 3,
      rows: 1,
      preferredW: 92,
      minW: 56,
      widthPad: 14,
      topPad: this.scale.height * 0.46,
      bottomY: this.scale.height - 40 - SAB(),
      cardH: SLOT_H,
    });
    this.slotCy = gl.cy;
    this.slotX = Array.from({ length: 3 }, (_, i) => gl.startX + i * gl.spacingX);
    for (let i = 0; i < 3; i++) {
      const lbl = this.add
        .text(this.slotX[i], gl.cy - SLOT_H / 2 - 20, String(i + 1), txt(18, NV_GOLD, { bold: true, outline: true }))
        .setOrigin(0.5);
      this.stepLabels.push(lbl);
      const slot = modernCardButton(this, this.slotX[i], gl.cy, gl.cardW, SLOT_H, "·", BTN_NEUTRAL, 30, gl.cardW - 8);
      this.slotCards.push(slot);
    }

    // 4 letter tiles = the 3 letters + 1 distractor
    const extra = EXTRA_LETTERS.filter((l) => !this.letters.includes(l));
    const tray = [...this.letters, extra[Phaser.Math.Between(0, extra.length - 1)]].sort(() => Math.random() - 0.5);
    const tgap = this.scale.width / (tray.length + 1);
    const tw = Math.min(70, this.scale.width / (tray.length + 0.6) - 10);
    const ty = this.scale.height - 74 - SAB();
    tray.forEach((letter, i) => {
      const c = modernCardButton(this, tgap * (i + 1), ty, tw, 58, letter, BTN_PRIMARY, 26, tw - 8);
      this.input.setDraggable(c);
      this.tiles.push({ card: c, letter, homeX: tgap * (i + 1), homeY: ty, placed: false });
    });
  }

  private onDragStart(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked) return;
    obj.setDepth(30);
    this.tweens.add({ targets: obj, scale: 1.12, duration: 90, ease: "Sine.easeOut" });
  }

  private onDrag(p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked) return;
    obj.x = p.x;
    obj.y = p.y;
  }

  private onDragEnd(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) {
    if (this.locked) return;
    const tile = this.tiles.find((t) => t.card === obj);
    if (!tile) return;
    obj.setDepth(10);
    this.tweens.add({ targets: obj, scale: 1, duration: 90, ease: "Sine.easeInOut" });

    // nearest slot by x
    let slot = -1;
    let best = Infinity;
    this.slotX.forEach((sx, i) => {
      const d = Math.abs(obj.x - sx);
      if (d < best) { best = d; slot = i; }
    });

    const fits = this.slotContents[slot] === null && this.letters[slot] === tile.letter;
    if (fits) {
      this.slotContents[slot] = tile.letter;
      tile.placed = true;
      this.tweens.add({ targets: obj, x: this.slotX[slot], y: this.slotCy, duration: 120, ease: "Back.easeOut" });
      pop();
      const face = obj.list[0] as Phaser.GameObjects.Image;
      face.setTint(0x4ade80);
      obj.setInteractive(false);
      if (this.slotContents.every((c) => c !== null)) this.solve();
    } else {
      // bounce back home
      this.tweens.add({ targets: obj, x: tile.homeX, y: tile.homeY, duration: 130, ease: "Sine.easeInOut" });
    }
  }

  private solve() {
    this.locked = true;
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    speak(this.target.word, { lang: "en" });
    this.prompt.set(t("cvcBuildGreat", { w: this.target.word }));
    this.floatMsg(this.target.word);
    this.qInRound++;
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.time.delayedCall(900, () => {
      this.onRoundDone?.(true, ms, this.levelIndex + 1);
      if (this.qInRound >= QUESTIONS_PER_ROUND) {
        this.roundsDone++;
        this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
        if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
        this.levelIndex++;
        this.startRound();
      } else {
        this.askQuestion();
      }
    });
  }

  private floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.62, text, txt(30, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 900, onComplete: () => m.destroy() });
  }

  private slotCards: Phaser.GameObjects.Container[] = [];

  private clearRound() {
    this.tiles.forEach((t) => t.card.destroy());
    this.tiles = [];
    this.slotCards.forEach((s) => s.destroy());
    this.slotCards = [];
    this.stepLabels.forEach((l) => l.destroy());
    this.stepLabels = [];
    this.slotX = [];
  }
}

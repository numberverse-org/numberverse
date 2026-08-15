import Phaser from "phaser";
import { DragReorderScene, type DragReorderConfig, type DragCard, type DragTarget } from "./reorder";
import { t } from "./i18n";
import { pop, win } from "./audio";
import { correctCelebrate } from "./celebrate";
import { speak } from "./speech";
import { txt, modernCardButton, gridLayout, BTN_PRIMARY, BTN_NEUTRAL, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { CVC_BUILD_POOL } from "./wordBanks";

const QUESTIONS_PER_ROUND = 4;
const SLOT_H = 66;

/** 20 true-CVC words (16 shared with the read scene + 5 builder extras), all
 *  with 3 DISTINCT letters so the drag build is unambiguous. #1167 — derived
 *  from the shared CVC bank instead of a hand-copied second copy. */
const WORDS: { word: string; emoji: string }[] = CVC_BUILD_POOL.map((w) => ({ word: w.word, emoji: w.emoji }));
const EXTRA_LETTERS = ["p", "n", "r", "b", "m", "l", "k"];

const CFG: DragReorderConfig = {
  gameId: "game-cvcbuild",
  titleKey: "titleCvcBuild",
  promptKey: "cvcBuildPrompt",
  greatKey: "cvcBuildGreat",
  doneKey: "cvcBuildGreat",
  background: "sky",
  rounds: 3,
  cardH: SLOT_H,
  speakLang: "en",
  dragMode: "free",
};

/**
 * CVC word builder (#51).
 * Band 1 phonics: see/hear a CVC picture, then DRAG the 3 letters from a
 * tray into the 3 snap slots to spell it. A letter that lands in its correct
 * slot snaps in green; the wrong letter (or the extra distractor) bounces
 * back. When all 3 slots are home, Nova reads the word aloud.
 */
export class CvcBuildScene extends DragReorderScene {
  private qInRound = 0;
  private target!: { word: string; emoji: string };
  private letters: string[] = []; // correct letter per slot
  private slotContents: (string | null)[] = [];
  private emojiText!: Phaser.GameObjects.Text;

  constructor() {
    super("CvcBuild");
  }

  protected cfg(): DragReorderConfig {
    return CFG;
  }

  protected onCreate() {
    this.emojiText = this.add
      .text(0, 0, "", txt(80, "#ffffff", { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(2);
  }

  protected layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 40);
    this.roundText.setPosition(width / 2, 76);
    this.meter.setPosition(width / 2, 100);
    if (this.prompt) this.prompt.setPosition(width / 2, height * 0.14);
    this.emojiText.setPosition(width / 2, height * 0.28);
  }

  protected startRound() {
    this.qInRound = 0;
    super.startRound();
  }

  protected dealRound() {
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
    if (this.prompt) this.prompt.set(t("cvcBuildPrompt"));
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
    this.targets = [];
    for (let i = 0; i < 3; i++) {
      const lbl = this.add
        .text(this.slotX[i], gl.cy - SLOT_H / 2 - 20, String(i + 1), txt(18, NV_GOLD, { bold: true, outline: true }))
        .setOrigin(0.5);
      this.stepLabels.push(lbl);
      const slot = modernCardButton(this, this.slotX[i], gl.cy, gl.cardW, SLOT_H, "·", BTN_NEUTRAL, 30, gl.cardW - 8);
      this.targets.push({ value: String(i), x: this.slotX[i], y: gl.cy, w: gl.cardW, h: SLOT_H, obj: slot });
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
      this.cards.push({ obj: c, item: { value: letter, label: letter }, homeX: tgap * (i + 1), homeY: ty, slot: -1, placed: false });
    });
  }

  protected onDrop(card: DragCard, target: DragTarget | null) {
    if (!target) {
      this.bounceCard(card);
      return;
    }
    const slot = this.targets.indexOf(target);
    const fits = this.slotContents[slot] === null && this.letters[slot] === card.item.value;
    if (fits) {
      this.slotContents[slot] = card.item.value;
      card.placed = true;
      card.slot = slot;
      this.tweens.add({ targets: card.obj, x: target.x, y: target.y, duration: 120, ease: "Back.easeOut" });
      pop();
      const face = card.obj.list[0] as Phaser.GameObjects.Image;
      face.setTint(0x4ade80);
      card.obj.setInteractive(false);
      if (this.slotContents.every((c) => c !== null)) this.onSolved();
    } else {
      // bounce back home
      this.bounceCard(card);
    }
  }

  protected onSolved() {
    this.locked = true;
    this.markSolved();
    win();
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3)); // #1197 — a correct answer deserves the full reward, not an audio blip
    speak(this.target.word, { lang: "en" });
    if (this.prompt) this.prompt.set(t("cvcBuildGreat", { w: this.target.word }));
    this.floatMsg(this.target.word);
    this.qInRound++;
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.time.delayedCall(900, () => {
      this.onRoundDone?.(this.slotContents.every((c) => c !== null), ms, this.levelIndex + 1);
      if (this.qInRound >= QUESTIONS_PER_ROUND) {
        this.roundsDone++;
        this.meter.set(this.roundsDone, this.cfg().rounds);
        if (this.roundsDone >= this.cfg().rounds) this.roundsDone = 0;
        this.levelIndex++;
        this.startRound();
      } else {
        this.askQuestion();
      }
    });
  }

  protected floatMsg(text: string) {
    const m = this.add
      .text(this.scale.width / 2, this.scale.height * 0.62, text, txt(30, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: m, y: m.y - 24, alpha: 0, duration: 900, onComplete: () => m.destroy() });
  }
}

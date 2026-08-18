import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak, bnNumber } from "./speech";
import { getAppLang } from "./locale";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, modernCardButton, correctButton, ringCorrect, BTN_PRIMARY, BTN_NEUTRAL, BTN_ORANGE, btnFromColor, roundMeter, type RoundMeterApi, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { answerRow } from "./layout";

const LEVELS = GAMES.find((g) => g.id === "game-placevalue")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
const PLACES = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands"];
const BN_PLACE: Record<string, string> = {
  ones: "একক", tens: "দশক", hundreds: "শতক", thousands: "হাজার",
  "ten-thousands": "দশ হাজার", "hundred-thousands": "লাখ",
};
const BUTTON_RADIUS = 50;
const ROUNDS_TO_FINISH = 3;

/**
 * Place Value — read the number from base-10 blocks, then find the digit in a
 * given place.
 * Band 3 (ages 8–10). Shows 4,829 as blocks (4 thousand-cubes, 8 hundred-flats,
 * 2 ten-rods, 9 one-units) — the 100-rods idea extended to thousands — and
 * asks "In 4,829, what is the TENS digit?" Kid taps the correct digit button.
 */
export class PlaceValueScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private number = 0;
  private place = "tens";
  private answer = 0;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private factText!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Graphics;
  private blocksRef: Phaser.GameObjects.Container | null = null;

  constructor() {
    super("PlaceValue");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titlePlaceValue"), txt(28, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.factText = this.add
      .text(0, 0, "", txt(26, NV_GOLD, {bold: true, align: "center", wrap: 340, outline: true}))
      .setOrigin(0.5);
        this.prompt = questionPanel(this, 0, 0);
    this.meter = roundMeter(this);
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private drawBackground() {
    gameBackground(this, "desert");
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.factText.setPosition(width / 2, height * 0.34).setWordWrapWidth(Math.max(140, width - 20));
    this.blocksRef?.setPosition(width / 2, height * 0.55);
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  private get answersY() {
    return this.scale.height - 64 - SAB();
  }

  /** Localized place-name key, e.g. "tens" → colTens → "tens"/"দশক". */
  private placeName(p: string): string {
    if (p === "thousands") return t("colThousands");
    if (p === "hundreds") return t("colHundreds");
    if (p === "tens") return t("colTens");
    return t("colOnes");
  }

  private startRound() {
    this.clearButtons();
    this.clearBlocks();
    const digits = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.number = Phaser.Math.Between(Math.pow(10, digits - 1), Math.pow(10, digits) - 1);
    const maxPlace = Math.min(digits - 1, PLACES.length - 1);
    const pi = Phaser.Math.Between(0, maxPlace);
    this.place = PLACES[pi];
    this.answer = Math.floor(this.number / Math.pow(10, pi)) % 10;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    const localPlace = this.placeName(this.place);
    this.factText.setText(t("qPlaceDigit", { n: this.number.toLocaleString(), place: localPlace }));
    this.prompt.set(t("blocksShow", { place: localPlace }));
    this.drawBlocks(this.number);
    speak(
      getAppLang() === "bn"
        ? `${bnNumber(this.number)}-এ ${BN_PLACE[this.place] ?? this.place} ঘরে কোন অঙ্কটি আছে?`
        : `In ${this.number}, what is the ${this.place} digit?`
    );
    this.spawnButtons();
  }

  /** Base-10 blocks — the 100-rods idea extended to thousands. Each place is
   *  ONE block scaled by magnitude (thousands biggest, ones smallest) with its
   *  count + name below, so the kid reads "4 thousands, 8 hundreds, 2 tens,
   *  9 ones" right off the image. The asked place gets a bright highlight. */
  private drawBlocks(n: number) {
    const c = this.add.container(0, 0);
    const places = [
      { key: "thousands", v: Math.floor(n / 1000) % 10, w: 46, h: 46, color: 0x4cc9f0 },
      { key: "hundreds", v: Math.floor(n / 100) % 10, w: 38, h: 38, color: 0xf8961e },
      { key: "tens", v: Math.floor(n / 10) % 10, w: 34, h: 20, color: 0x90be6d },
      { key: "ones", v: n % 10, w: 18, h: 18, color: 0xf9c74f },
    ];
    const shown = places.filter((p) => p.v > 0);
    const gap = 22;
    const totalW = shown.reduce((s, p) => s + Math.max(p.w, 60), 0) + (shown.length - 1) * gap;
    let x = -totalW / 2;
    for (const p of shown) {
      const group = this.add.container(x, 0);
      const isAsk = p.key === this.place;
      const box = this.add.rectangle(0, 0, p.w + 8, p.h + 8, isAsk ? 0xffd166 : 0xffffff, isAsk ? 0.22 : 0.05);
      box.setStrokeStyle(2, isAsk ? 0xffd166 : 0xffffff, isAsk ? 1 : 0.25);
      group.add(box);
      const blk = this.add.rectangle(0, 0, p.w, p.h, p.color, 0.95);
      blk.setStrokeStyle(2, 0xffffff, 0.85);
      blk.setOrigin(0.5, 0.5);
      group.add(blk);
      // magnitude ticks: thousands = 10×10 grid, hundreds = 5×5, tens = 5, ones = none
      if (p.key === "thousands") {
        const g = this.add.graphics();
        g.lineStyle(1, 0xffffff, 0.35);
        for (let i = 1; i < 10; i++) {
          g.lineBetween(-p.w / 2 + (p.w * i) / 10, -p.h / 2, -p.w / 2 + (p.w * i) / 10, p.h / 2);
          g.lineBetween(-p.w / 2, -p.h / 2 + (p.h * i) / 10, p.w / 2, -p.h / 2 + (p.h * i) / 10);
        }
        group.add(g);
      } else if (p.key === "hundreds") {
        const g = this.add.graphics();
        g.lineStyle(1, 0xffffff, 0.3);
        for (let i = 1; i < 5; i++) {
          g.lineBetween(-p.w / 2 + (p.w * i) / 5, -p.h / 2, -p.w / 2 + (p.w * i) / 5, p.h / 2);
          g.lineBetween(-p.w / 2, -p.h / 2 + (p.h * i) / 5, p.w / 2, -p.h / 2 + (p.h * i) / 5);
        }
        group.add(g);
      } else if (p.key === "tens") {
        const g = this.add.graphics();
        g.lineStyle(1, 0xffffff, 0.3);
        for (let i = 1; i < 5; i++) {
          g.lineBetween(-p.w / 2 + (p.w * i) / 5, -p.h / 2, -p.w / 2 + (p.w * i) / 5, p.h / 2);
        }
        group.add(g);
      }
      const label = this.add
        .text(0, p.h / 2 + 14, `${p.v} ${this.placeName(p.key)}`, txt(14, isAsk ? NV_GOLD : "#e9ecef", { bold: isAsk }))
        .setOrigin(0.5, 0);
      group.add(label);
      c.add(group);
      x += Math.max(p.w, 60) + gap;
    }
    c.setPosition(this.scale.width / 2, this.scale.height * 0.55);
    this.blocksRef = c;
  }

  private clearBlocks() {
    if (this.blocksRef) {
      this.blocksRef.destroy();
      this.blocksRef = null;
    }
  }

  private spawnButtons() {
    const opts = new Set<number>([this.answer]);
    // Misconception distractors — a digit the number ACTUALLY contains (the
    // answer is no longer the only digit present), then an off-by-one neighbor.
    const raw = String(this.number).split("").map((c) => Number(c));
    for (const digit of raw) {
      if (opts.size >= 4) break;
      if (digit !== this.answer) opts.add(digit);
    }
    for (const digit of [this.answer + 1, this.answer - 1]) {
      if (opts.size >= 4) break;
      if (digit >= 0 && digit <= 9 && digit !== this.answer) opts.add(digit);
    }
    // bounded fill from 0..9 (terminates; only reached for numbers with few
    // distinct digits, e.g. 2222)
    for (let c = 0; c <= 9 && opts.size < 4; c++) {
      if (c !== this.answer) opts.add(c);
    }
    const values = [...opts].sort(() => Math.random() - 0.5);
    const { radius, y, xFor } = answerRow(this, values.length, BUTTON_RADIUS);
    values.forEach((value, i) => {
      const c = modernAnswerButton(this, xFor(i), y, radius, String(value));
      c.on("pointerdown", () => this.tap(c, value));
      this.buttons.push({ sprite: c, value });
    });
  }

  private tap(container: Phaser.GameObjects.Container, value: number) {
    if (value !== this.answer) {
      hintWrong(this, container, {
        hint: `The glowing ${this.placeName(this.place)} block shows how many. Count it!`,
        hintBn: `চকচকে ${BN_PLACE[this.place] ?? this.place} ব্লকটিতে কতগুলো আছে দেখো। গুনে ফেলো!`,
        correct: () => this.answer,
        options: () => this.buttons,
      });
      return;
    }
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(value === this.answer, ms, this.levelIndex + 1);
    this.time.delayedCall(800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
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

import Phaser from "phaser";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { speak, speakMath, bnNumber, enNumber } from "./speech";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, roundMeter, type RoundMeterApi } from "./ui";
import { SAB } from "./safeArea";
import { answerRow } from "./layout";
import { getAppLang } from "./locale";
import { correctCelebrate } from "./celebrate";

const LEVELS = GAMES.find((g) => g.id === "game-regroup")?.difficultyLevels ?? [2, 3, 4, 5, 6, 8];
/** Per-level generation: digits = columns shown, double = tens column also carries/borrows. */
const LEVEL_CFG = [
  { digits: 2, double: false }, // L0: 2-digit, ones carry/borrow only
  { digits: 2, double: true  }, // L1: 2-digit, full
  { digits: 3, double: false }, // L2: 3-digit, ones carry/borrow
  { digits: 3, double: true  }, // L3: 3-digit, ones + tens
  { digits: 3, double: true  }, // L4: 3-digit, full, larger
  { digits: 3, double: true  }, // L5: 3-digit, full
];
const BUTTON_RADIUS = 46;
const ROUNDS_TO_FINISH = 3;
const COLW = 58;

/** EN spoken number up to 999 (enNumber only does 0–99). */
function enBig(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h > 0 && r === 0) return `${enNumber(h)} hundred`;
  if (h > 0) return `${enNumber(h)} hundred ${enNumber(r)}`;
  return enNumber(r);
}
const word = (x: number): string => (getAppLang() === "bn" ? bnNumber(x) : enBig(x));

/**
 * Column Math — "Carry & Borrow" (3-digit written method with regrouping).
 * Band 3 (ages 6–8). The kid solves a stacked equation ONE COLUMN AT A TIME,
 * right-to-left (ones → tens → hundreds), tapping the digit of each answer
 * column from 4 choices. Regrouping is scaffolded visibly:
 *
 *   CARRY (add)   — when a column sums ≥ 10, after the correct ones digit is
 *                   tapped a "1" chip pops above the next column ("Carry the 1!").
 *   BORROW (sub)  — when the top digit is too small, the top digit is struck
 *                   through and shown as 10+it ("Borrow 1 from the tens!").
 *
 * WORKED DEMO FIRST: `teach:true` (first exposure or mastery-gate remediation)
 * auto-solves a small example with narration before the kid's drills, so the
 * written method is SEEN before it's attempted.
 */
export class RegroupScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private teachMode = false;
  private taught = false;
  private demoing = false;
  private demoToken = 0;
  private mode: "add" | "sub" = "add";
  private digits = 2;
  private aD: number[] = [0, 0, 0];
  private bD: number[] = [0, 0, 0];
  private resultD: number[] = [-1, -1, -1];
  private cur = 0;
  private carry = 0;
  private borrow = 0;
  private borrowedThis = [false, false, false];
  private lentThis = [false, false, false];
  private resultCols = 2;
  private correctDigit = 0;
  private buttons: { sprite: Phaser.GameObjects.Container; value: number }[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;

  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private boardG!: Phaser.GameObjects.Graphics;
  private headerTs: Phaser.GameObjects.Text[] = [];
  private rowAT: Phaser.GameObjects.Text[] = [];
  private rowBT: Phaser.GameObjects.Text[] = [];
  private slotTs: Phaser.GameObjects.Text[] = [];
  private signT!: Phaser.GameObjects.Text;
  private carryT!: Phaser.GameObjects.Text;
  private borrowT!: Phaser.GameObjects.Text;
  private lentT!: Phaser.GameObjects.Text;
  private colX: number[] = [0, 0, 0];
  private boardTop = 0;
  private rowAY = 0;
  private rowBY = 0;
  private lineY = 0;
  private slotCY = 0;

  constructor() {
    super("Regroup");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number; teach?: boolean }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.teachMode = !!data.teach;
    this.boardG = this.add.graphics();
    gameBackground(this, "sky");
    this.titleText = this.add.text(0, 0, t("titleRegroup"), txt(34, "#ffffff", { bold: true })).setOrigin(0.5);
    this.roundText = this.add.text(0, 0, "", txt(18, "#ffd166", { bold: true })).setOrigin(0.5);
    this.meter = roundMeter(this);
    this.signT = this.add.text(0, 0, "+", txt(40, "#ffffff", { bold: true })).setOrigin(0.5);
    for (let i = 0; i < 3; i++) {
      this.headerTs.push(this.add.text(0, 0, "", txt(16, "#8ecae6", { bold: true })).setOrigin(0.5));
      this.rowAT.push(this.add.text(0, 0, "", txt(40, "#ffffff", { bold: true })).setOrigin(0.5));
      this.rowBT.push(this.add.text(0, 0, "", txt(40, "#ffffff", { bold: true })).setOrigin(0.5));
      this.slotTs.push(this.add.text(0, 0, "", txt(36, "#ffd166", { bold: true })).setOrigin(0.5));
    }
    this.carryT = this.add.text(0, 0, "1", txt(20, "#052e3f", { bold: true })).setOrigin(0.5).setAlpha(0);
    this.borrowT = this.add.text(0, 0, "+10", txt(15, "#ff6b6b", { bold: true })).setOrigin(0.5).setAlpha(0);
    this.lentT = this.add.text(0, 0, "", txt(15, "#4ade80", { bold: true })).setOrigin(0.5).setAlpha(0);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("solveIt"));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => { this.layout(); this.drawBoard(); });
    this.layout();
    this.startRound();
  }

  private layout() {
    const { width, height } = this.scale;
    this.titleText.setPosition(width / 2, 42);
    this.roundText.setPosition(width / 2, 80);
    this.meter.setPosition(width / 2, 104);
    this.boardTop = Math.max(150, Math.round(height * 0.2));
    this.rowAY = this.boardTop + 46;
    this.rowBY = this.boardTop + 102;
    this.lineY = this.boardTop + 126;
    this.slotCY = this.boardTop + 150 + 26;
    // Always lay out the full 3-column grid centered, so the board never shifts
    // when a 2-digit add rolls into a new hundreds column.
    const rightX = width / 2 + 58;
    for (let i = 0; i < 3; i++) this.colX[i] = rightX - i * COLW;
    this.prompt.setPosition(width / 2, height - 150 - SAB());
  }

  /** Redraw the whole column board from current state. */
  private drawBoard() {
    this.boardG.clear();
    const show = this.digits;
    const drawCols = Math.max(show, this.resultCols);
    for (let i = 0; i < 3; i++) {
      const onOp = i < show;
      const onSlot = i < drawCols;
      const filled = onSlot && this.resultD[i] >= 0;
      this.headerTs[i].setVisible(onSlot);
      this.rowAT[i].setVisible(onOp).setText(onOp ? String(this.aD[i]) : "");
      this.rowBT[i].setVisible(onOp).setText(onOp ? String(this.bD[i]) : "");
      this.slotTs[i].setVisible(filled).setText(filled ? String(this.resultD[i]) : "");
    }
    // column headers (right → left: ones, tens, hundreds)
    this.headerTs[0].setText(t("hdO")).setPosition(this.colX[0], this.boardTop - 8);
    this.headerTs[1].setText(t("hdT")).setPosition(this.colX[1], this.boardTop - 8);
    this.headerTs[2].setText(t("hdH")).setPosition(this.colX[2], this.boardTop - 8);
    for (let i = 0; i < drawCols; i++) {
      this.rowAT[i].setPosition(this.colX[i], this.rowAY);
      this.rowBT[i].setPosition(this.colX[i], this.rowBY);
      // answer slot: highlight the current column (an input column, never the
      // carried-1 column)
      const sw = 44;
      const active = i === this.cur && !this.demoing && i < show;
      if (active) {
        this.boardG.fillStyle(0xffd166, 0.22);
        this.boardG.fillRoundedRect(this.colX[i] - sw / 2, this.rowBY + 26, sw, 52, 12);
        this.boardG.lineStyle(3, 0xffd166, 1);
      } else {
        this.boardG.fillStyle(0xffffff, 0.1);
        this.boardG.fillRoundedRect(this.colX[i] - sw / 2, this.rowBY + 26, sw, 52, 12);
        this.boardG.lineStyle(2, 0xffffff, 0.4);
      }
      this.boardG.strokeRoundedRect(this.colX[i] - sw / 2, this.rowBY + 26, sw, 52, 12);
      this.slotTs[i].setPosition(this.colX[i], this.rowBY + 26 + 26);
    }
    // sign + line
    this.signT.setText(this.mode === "add" ? "+" : "−").setPosition(this.colX[show - 1] - 36, this.rowBY);
    this.boardG.fillStyle(0xffffff, 0.55);
    this.boardG.fillRect(this.colX[drawCols - 1] - 54, this.lineY, this.colX[0] + 40 - (this.colX[drawCols - 1] - 54), 4);

    // ── regrouping annotations ──
    this.carryT.setAlpha(0);
    this.borrowT.setAlpha(0);
    this.lentT.setAlpha(0);
    // carry chip above the column that will use the carried 1
    if (this.carry > 0 && this.cur < show) {
      const x = this.colX[this.cur];
      this.boardG.fillStyle(0x2ec4b6, 1);
      this.boardG.fillCircle(x, this.rowAY - 30, 15);
      this.carryT.setText(String(this.carry)).setPosition(x, this.rowAY - 30).setAlpha(1);
    }
    for (let i = 0; i < show; i++) {
      if (this.borrowedThis[i]) {
        // strike through the too-small top digit + show it became 10+it
        this.boardG.lineStyle(4, 0xff6b6b, 1);
        this.boardG.lineBetween(this.colX[i] - 16, this.rowAY - 12, this.colX[i] + 16, this.rowAY + 12);
        this.borrowT.setText(`+10`).setPosition(this.colX[i] + 30, this.rowAY).setAlpha(1);
      }
      if (this.lentThis[i]) {
        // this column lent 1 to the column below — show the reduced digit
        this.boardG.lineStyle(4, 0xff6b6b, 1);
        this.boardG.lineBetween(this.colX[i] - 16, this.rowAY - 12, this.colX[i] + 16, this.rowAY + 12);
        this.lentT.setText(String(Math.max(0, this.aD[i] - 1))).setPosition(this.colX[i] - 30, this.rowAY).setAlpha(1);
      }
    }
  }

  private startRound() {
    this.clearRound();
    this.demoing = false;
    ++this.demoToken;
    if (this.teachMode && !this.taught) {
      this.playDemo();
      return;
    }
    this.makeProblem();
    this.cur = 0;
    this.carry = 0;
    this.borrow = 0;
    this.resultD = [-1, -1, -1];
    this.resultCols = this.digits;
    this.borrowedThis = [false, false, false];
    this.lentThis = [false, false, false];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.drawBoard();
    speakMath(this.mode, this.numA(), this.numB());
    this.prepColumn();
  }

  private numA(): number { return this.aD[0] + this.aD[1] * 10 + this.aD[2] * 100; }
  private numB(): number { return this.bD[0] + this.bD[1] * 10 + this.bD[2] * 100; }

  /** Generate an add/sub problem within the level's digit count. Problems are
   *  engineered so the written method ONLY needs the columns we show:
   *   • add — ones ALWAYS carry; tens carries on `double` levels (a 2-digit
   *           double add rolls into a NEW hundreds column, drawn on the board;
   *           a 3-digit add never overflows the hundreds).
   *   • sub — ones ALWAYS borrow; 3-digit `double` ALSO borrows across the tens
   *           (the hundreds pays 1). No negatives, no leading zeros. */
  private makeProblem() {
    const cfg = LEVEL_CFG[Math.min(this.levelIndex, LEVEL_CFG.length - 1)];
    this.digits = cfg.digits;
    this.mode = Math.random() < 0.5 ? "add" : "sub";
    if (this.mode === "add") {
      const ao = Phaser.Math.Between(1, 9);
      const bo = Phaser.Math.Between(10 - ao, 9); // ones ALWAYS carry → ao+bo ∈ [10,18]
      let at: number, bt: number;
      if (cfg.double) {
        at = Phaser.Math.Between(1, 9);
        bt = Phaser.Math.Between(9 - at, 9); // at+bt ≥ 9 → +ones-carry ≥ 10 → tens carries
      } else {
        at = Phaser.Math.Between(0, 8);
        bt = Phaser.Math.Between(0, 8 - at); // at+bt ≤ 8 → +1 ≤ 9 → 2-digit result
      }
      let ah = 0, bh = 0;
      if (cfg.digits === 3) {
        if (cfg.double) {
          ah = Phaser.Math.Between(1, 8);
          bh = Phaser.Math.Between(0, 8 - ah); // +1 from tens ≤ 9 → no 4th digit
        } else {
          ah = Phaser.Math.Between(1, 9);
          bh = Phaser.Math.Between(0, 9 - ah); // no tens carry → ≤ 9
        }
      }
      this.aD = [ao, at, ah];
      this.bD = [bo, bt, bh];
    } else {
      const ao = Phaser.Math.Between(0, 8);
      const bo = Phaser.Math.Between(ao + 1, 9); // ones ALWAYS borrow → ao < bo
      const useTensBorrow = cfg.digits === 3 && cfg.double;
      let at: number, bt: number;
      if (useTensBorrow) {
        // bt ≥ at: after the ones-borrow the tens needs to borrow too — the
        // hundreds column pays the 1 (the cascade).
        at = Phaser.Math.Between(1, 9);
        bt = Phaser.Math.Between(at, 9);
      } else {
        // minuend tens ≥ subtrahend tens + 2: no tens borrow, and the tens
        // answer is never a leading 0. A 2-digit sub can't borrow twice without
        // going negative.
        at = Phaser.Math.Between(2, 9);
        bt = Phaser.Math.Between(0, at - 2);
      }
      let ah = 0, bh = 0;
      if (cfg.digits === 3) {
        if (cfg.double) {
          ah = Phaser.Math.Between(3, 9);
          bh = Phaser.Math.Between(1, ah - 2); // ah ≥ bh+2 → hundreds survives the cascade
        } else {
          ah = Phaser.Math.Between(2, 9);
          bh = Phaser.Math.Between(0, ah - 2); // ah-1 ≥ bh → no hundreds borrow
        }
      }
      this.aD = [ao, at, ah];
      this.bD = [bo, bt, bh];
    }
  }

  /** Prepare the current column: compute its correct digit, set the prompt, spawn buttons. */
  private prepColumn() {
    this.clearButtons();
    const i = this.cur;
    const show = this.digits;
    if (i >= show) { this.finishRound(); return; }
    let correct: number;
    const col = i === 0 ? t("tapOnes") : i === 1 ? t("tapTens") : t("tapHundreds");
    if (this.mode === "add") {
      const sum = this.aD[i] + this.bD[i] + this.carry;
      correct = sum % 10;
    } else {
      const top = this.aD[i] - this.borrow;
      if (top < this.bD[i]) {
        this.borrowedThis[i] = true;
        if (i + 1 < show) this.lentThis[i + 1] = true;
        correct = 10 + top - this.bD[i];
      } else {
        correct = top - this.bD[i];
      }
    }
    this.correctDigit = correct;
    this.prompt.set(col);
    this.drawBoard();
    this.spawnButtons(correct);
  }

  private spawnButtons(correct: number) {
    const opts = new Set<number>([correct]);
    let delta = 1;
    while (opts.size < 4) {
      const cand = correct + (delta % 2 === 1 ? -delta : delta);
      if (cand >= 0 && cand <= 9) opts.add(cand);
      delta++;
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
    if (this.demoing) return;
    if (value !== this.correctDigit) {
      hintWrong(this, container, {
        hint: () => {
          const i = this.cur;
          const cname = i === 0 ? t("colOnes") : i === 1 ? t("colTens") : t("colHundreds");
          if (this.mode === "add") {
            const sum = this.aD[i] + this.bD[i] + this.carry;
            return this.carry > 0
              ? `${this.aD[i]} plus ${this.bD[i]} plus the carried 1 is ${sum} — the ${cname} digit is ${sum % 10}`
              : `${this.aD[i]} plus ${this.bD[i]} is ${sum} — the ${cname} digit is ${sum % 10}`;
          }
          const top = this.aD[i] - this.borrow;
          const tt = top < this.bD[i] ? 10 + top : top;
          return `${tt} minus ${this.bD[i]} is ${tt - this.bD[i]} — that's the ${cname} digit`;
        },
        hintBn: () => {
          const i = this.cur;
          if (this.mode === "add") {
            const sum = this.aD[i] + this.bD[i] + this.carry;
            return this.carry > 0
              ? `${bnNumber(this.aD[i])} + ${bnNumber(this.bD[i])} + সামনের ১ = ${bnNumber(sum)} — ${bnNumber(sum % 10)} হবে`
              : `${bnNumber(this.aD[i])} + ${bnNumber(this.bD[i])} = ${bnNumber(sum)} — ${bnNumber(sum % 10)} হবে`;
          }
          const top = this.aD[i] - this.borrow;
          const tt = top < this.bD[i] ? 10 + top : top;
          return `${bnNumber(tt)} − ${bnNumber(this.bD[i])} = ${bnNumber(tt - this.bD[i])} — এটাই উত্তর`;
        },
        correct: () => this.correctDigit,
        options: () => this.buttons,
      });
      return;
    }
    // correct digit for this column
    pop();
    correctButton(container);
    this.buttons.forEach((b) => b.sprite.disableInteractive());
    const i = this.cur;
    this.resultD[i] = value;
    if (this.mode === "add") {
      const sum = this.aD[i] + this.bD[i] + this.carry;
      if (sum >= 10) {
        this.carry = 1;
        speak(t("carryOne"), { lang: getAppLang() === "bn" ? "bn" : "en", rate: 0.95 });
      } else {
        this.carry = 0;
      }
    } else {
      if (this.borrowedThis[i]) this.borrow = 1;
      else this.borrow = 0;
    }
    this.cur++;
    this.drawBoard();
    this.time.delayedCall(500, () => this.prepColumn());
  }

  private finishRound() {
    this.clearButtons();
    // A 2-digit add that carried in the tens rolls the carried 1 into a fresh
    // hundreds column (e.g. 56+78 = 134). 3-digit adds are generated to never
    // overflow, so this only ever fires at digits=2.
    if (this.mode === "add" && this.carry === 1) {
      this.resultD[this.digits] = 1;
      this.resultCols = this.digits + 1;
    }
    this.drawBoard();
    const ms = Math.max(1, this.time.now - this.startedAt);
    const ans = this.aD[0] + this.aD[1] * 10 + this.aD[2] * 100 + (this.mode === "add" ? 1 : -1) * (this.bD[0] + this.bD[1] * 10 + this.bD[2] * 100);
    const op = this.mode === "add" ? "+" : "−";
    win();
    speak(t("regroupWin", { a: this.numA(), op, b: this.numB(), c: ans }), { rate: 0.92 });
    correctCelebrate(this, this.scale.width / 2, Math.round(this.scale.height * 0.3));
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(true, ms, LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)]);
    this.time.delayedCall(900, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  /** ── THE WORKED DEMO ───────────────────────────────────────────────
   *  teach:true → auto-solve a small 2-digit example step by step with
   *  narration so the kid SEES the written method before attempting it. */
  private playDemo() {
    this.demoing = true;
    this.taught = true;
    const tok = ++this.demoToken;
    this.digits = 2;
    this.resultCols = 2;
    this.mode = Math.random() < 0.5 ? "add" : "sub";
    let ao: number, bo: number, at: number, bt: number;
    if (this.mode === "add") {
      ao = Phaser.Math.Between(1, 9); bo = Phaser.Math.Between(10 - ao, 9);
      at = Phaser.Math.Between(1, 8); bt = Phaser.Math.Between(0, 8 - at);
    } else {
      ao = Phaser.Math.Between(0, 8); bo = Phaser.Math.Between(ao + 1, 9);
      at = Phaser.Math.Between(2, 9); bt = Phaser.Math.Between(0, at - 2);
    }
    this.aD = [ao, at, 0];
    this.bD = [bo, bt, 0];
    this.resultD = [-1, -1, -1];
    this.carry = 0;
    this.borrow = 0;
    this.borrowedThis = [false, false, false];
    this.lentThis = [false, false, false];
    this.cur = 0;
    const bn = getAppLang() === "bn";
    const lang = bn ? "bn" : "en";
    this.roundText.setText(t("letsLearn"));
    this.meter.set(0, ROUNDS_TO_FINISH);
    this.drawBoard();
    speak(t("demoIntro"), { lang, rate: 0.92 });

    let ms = 1500;
    // ones column
    this.time.delayedCall(ms, () => {
      if (tok !== this.demoToken || !this.scene.isActive()) return;
      if (this.mode === "add") {
        speak(`${t("colOnes")}: ${word(ao)} plus ${word(bo)} is ${word(ao + bo)}. Write ${word((ao + bo) % 10)}!`, { lang, rate: 0.92 });
      } else {
        speak(`${t("colOnes")}: ${word(ao)} minus ${word(bo)}? We need more ones!`, { lang, rate: 0.92 });
      }
    });
    ms += 2400;
    this.time.delayedCall(ms, () => {
      if (tok !== this.demoToken || !this.scene.isActive()) return;
      if (this.mode === "add") {
        this.resultD[0] = (ao + bo) % 10;
        this.carry = 1;
      } else {
        this.borrowedThis[0] = true;
        this.lentThis[1] = true;
        this.resultD[0] = 10 + ao - bo;
        this.borrow = 1;
        speak(t("borrowOne", { n: word(ao), newN: word(ao + 10) }), { lang, rate: 0.92 });
      }
      this.cur = 1;
      this.drawBoard();
      pop();
    });
    ms += 1400;
    this.time.delayedCall(ms, () => {
      if (tok !== this.demoToken || !this.scene.isActive()) return;
      if (this.mode === "add") {
        const tsum = at + bt + 1;
        speak(`${t("colTens")}: ${word(at)} plus ${word(bt)} plus the carried 1 is ${word(tsum)}. Write ${word(tsum)}!`, { lang, rate: 0.92 });
      } else {
        const d = (at - 1) - bt;
        speak(`${t("colTens")}: ${word(at - 1)} minus ${word(bt)} is ${word(d)}. Write ${word(d)}!`, { lang, rate: 0.92 });
      }
    });
    ms += 2400;
    this.time.delayedCall(ms, () => {
      if (tok !== this.demoToken || !this.scene.isActive()) return;
      if (this.mode === "add") {
        this.resultD[1] = (at + bt + 1) % 10;
      } else {
        this.resultD[1] = (at - 1) - bt;
      }
      this.cur = 2;
      this.drawBoard();
      const a = at * 10 + ao, b = bt * 10 + bo, c = this.mode === "add" ? a + b : a - b;
      speak(this.mode === "add" ? t("demoDoneAdd", { a: word(a), b: word(b), c: word(c) }) : t("demoDoneSub", { a: word(a), b: word(b), c: word(c) }), { lang, rate: 0.92 });
    });
    ms += 2200;
    this.time.delayedCall(ms, () => {
      if (tok !== this.demoToken || !this.scene.isActive()) return;
      this.demoing = false;
      this.startRound(); // a fresh normal drill follows the demo
    });
  }

  private clearButtons() {
    this.buttons.forEach((b) => b.sprite.destroy());
    this.buttons = [];
  }

  private clearRound() {
    this.clearButtons();
    this.borrowedThis = [false, false, false];
    this.lentThis = [false, false, false];
    this.carryT.setAlpha(0);
    this.borrowT.setAlpha(0);
    this.lentT.setAlpha(0);
  }
}

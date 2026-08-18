import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t } from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { bad, pop, win } from "./audio";
import { speak } from "./speech";
import { confettiBurst } from "./celebrate";
import { prefersReducedMotion } from "./reducedMotion";
import { hintWrong } from "./hints";
import { gameBackground } from "./backgrounds";
import { txt, modernAnswerButton, correctButton, BTN_PRIMARY, BTN_ORANGE, roundMeter, gridLayout, type RoundMeterApi, type GridLayout, NV_GOLD } from "./ui";
import { SAB } from "./safeArea";
import { BANGLA_DIGITS } from "./wordBanks";

const LEVELS = GAMES.find((g) => g.id === "game-bnnumbers")?.difficultyLevels ?? [3, 4, 5, 6, 8, 10];
// #1172 — the digit glyphs + spoken names come from the shared number bank.
const DIGITS = BANGLA_DIGITS;
const CARD_RADIUS = 54;
const ROUNDS_TO_FINISH = 3;

/**
 * Bangla Numbers — hear the number word, tap the matching Bangla digit.
 * Band 1 (ages 2–4). ০–৯ listen-and-tap digit recognition. The big 🔊
 * speaker button re-says the number, so tiny fingers can hear it again
 * without a grown-up. Teaches digit shape ↔ spoken Bangla name.
 */
export class BnNumbersScene extends Phaser.Scene {
  private levelIndex = 0;
  private roundsDone = 0;
  private startedAt = 0;
  private target!: (typeof DIGITS)[number];
  private cards: Phaser.GameObjects.Container[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;
  private roundText!: Phaser.GameObjects.Text;
  private speaker!: Phaser.GameObjects.Container;
  /** #1575 — the 🔊 replay button as a bare container so the win window can
   *  disable it (no overlapping TTS) and startRound can re-arm it. */
  private speakerBtn!: Phaser.GameObjects.Container;
  /** #1575 — the spoken digit shown faintly as a ghost in the question panel,
   *  so a pre-reader who misses the audio still sees the digit shape. */
  private ghost!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private background!: Phaser.GameObjects.Graphics;
  // Pre-read on every resize so spawnCards() doesn't interleave layout reads
  // (scale width/height + getComputedStyle safe-area) with per-card texture writes.
  private viewport = { width: 0, height: 0, sab: 0 };
  private gridLayoutCache: { n: number; gl: GridLayout } | null = null;

  constructor() {
    super("BnNumbers");
  }

  create(data: { onRoundDone: (correct: boolean, ms: number, difficulty: number) => void; startLevelIndex?: number }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    this.background = this.add.graphics();
    this.drawBackground();
    this.titleText = this.add
      .text(0, 0, t("titleBnNumbers"), txt(34, "#ffffff", {bold: true}))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, {bold: true}))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    // Replay button — a big fat 🔊 so the kid can hear the number again.
    this.speaker = this.add.container(0, 0);
    const spk = modernAnswerButton(this, 0, 0, 34, "🔊", BTN_ORANGE, { labelSize: 34 });
    spk.on("pointerdown", () => this.sayNumber());
    this.speaker.add(spk);
    this.speakerBtn = spk;
    this.prompt = questionPanel(this, 0, 0, { tail: "none" });
    // #1575 — a faint ghost of the spoken digit, at home in the question panel.
    this.ghost = this.add
      .text(0, 0, "", txt(40, "#0b2545", { bold: true, shadow: false }))
      .setOrigin(0.5)
      .setAlpha(0.3)
      .setDepth(5200)
      .setVisible(false);
    this.prompt.set(t("listenNumber"));
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private sayNumber() {
    speak(this.target.word);
  }

  private drawBackground() {
    gameBackground(this, "sky");
  }

  private layout() {
    const { width, height } = this.scale;
    const sab = SAB();
    this.viewport = { width, height, sab };
    this.gridLayoutCache = null;
    this.titleText.setPosition(width / 2, 44);
    this.roundText.setPosition(width / 2, 82);
    this.meter.setPosition(width / 2, 104);
    this.speaker.setPosition(width / 2, height - 110 - sab);
    this.prompt.setPosition(width / 2, height - 32 - sab);
    this.ghost.setPosition(width / 2, height - 84 - sab);
    this.reflowCards();
  }

  private startRound() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    // #1576 — the 🔊 speaker comes back once a fresh question is on screen.
    this.speakerBtn.setInteractive({ useHandCursor: true });
    const n = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    this.target = DIGITS[Phaser.Math.Between(0, Math.min(n, DIGITS.length) - 1)];
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.prompt.set(t("listenNumber"));
    // #1575 — the faint ghost echoes the digit Nova is about to say.
    this.ghost.setText(this.target.ch).setVisible(true);
    this.sayNumber();
    this.spawnCards(n);
  }

  private spawnCards(n: number) {
    const grid = n <= 3 ? { cols: 3, rows: 1 } : n <= 4 ? { cols: 2, rows: 2 } : n <= 6 ? { cols: 3, rows: 2 } : { cols: 4, rows: Math.ceil(n / 4) };
    const opts = [this.target, ...DIGITS.filter((d) => d.ch !== this.target.ch)].slice(0, n).sort(() => Math.random() - 0.5);
    const gl = this.gridLayoutCache?.n === n
      ? this.gridLayoutCache.gl
      : gridLayout(this, {
          cols: grid.cols,
          rows: grid.rows,
          preferredW: n <= 6 ? CARD_RADIUS * 2 : CARD_RADIUS * 1.6,
          minW: 56,
          widthPad: 40,
          topPad: 128,
          bottomY: this.viewport.height - 150 - this.viewport.sab,
          width: this.viewport.width,
          height: this.viewport.height,
        });
    if (this.gridLayoutCache?.n !== n) this.gridLayoutCache = { n, gl };
    opts.forEach((digit, i) => {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = gl.startX + col * gl.spacingX;
      const y = gl.cy + (row - (grid.rows - 1) / 2) * gl.spacingY;
      const c = modernAnswerButton(this, x, y, gl.cardW / 2, digit.ch, BTN_PRIMARY, { labelSize: Math.max(28, Math.round(gl.cardW / 1.8)) });
      c.on("pointerdown", () => this.tap(c, digit.ch));
      c.setData("val", digit.ch);
      c.setData("word", digit.word);
      this.cards.push(c);
    });
  }

  private tap(container: Phaser.GameObjects.Container, ch: string) {
    if (ch !== this.target.ch) {
      // #1575 — a missed candidate still teaches: say which digit they tapped.
      const word = container.getData("word") as string | undefined;
      if (word) speak(word);
      hintWrong(this, container, {
        hint: () => "Listen — which number did Nova say?",
        hintBn: () => "শোনো — নোভা কোন সংখ্যাটা বলেছে?",
        correct: () => this.target.ch,
        options: () => this.cards.map((s) => ({ sprite: s, value: s.getData("val") })),
      });
      return;
    }
    pop();
    correctButton(container);
    this.cards.forEach((c) => c.disableInteractive());
    this.speakerBtn.disableInteractive(); // #1576 — no replay during the win window
    this.sparkle(container.x, container.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    win();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(ch === this.target.ch, ms, this.levelIndex + 1);
    // #1571 — the completing round gets its own moment + a beat to land it.
    const completed = this.roundsDone >= ROUNDS_TO_FINISH;
    if (completed) this.celebrateCompletion();
    this.time.delayedCall(completed ? 1600 : 800, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private reflowCards() {
    const { width } = this.scale;
    for (const c of this.cards) c.x = Phaser.Math.Clamp(c.x, 30, width - 30);
  }

  /** #1571 — a distinct "you finished" moment: confetti + a spoken exclamation
   *  so the completing round reads as a finish, not just another correct tap. */
  private celebrateCompletion() {
    confettiBurst(this, this.scale.width / 2, this.scale.height * 0.35, 30);
    speak(t("dwGreat"));
  }

  private sparkle(x: number, y: number) {
    if (prefersReducedMotion()) return; // #1578 — the win still reads via the pop
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

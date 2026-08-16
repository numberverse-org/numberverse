import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { t , digit} from "./i18n";
import { questionPanel, type QuestionPanelApi } from "./question";
import { GAMES } from "@numberverse/core";
import { pop, win } from "./audio";
import { correctCelebrate , floatText } from "./celebrate";
import { gameBackground } from "./backgrounds";
import { txt, roundMeter, type RoundMeterApi, NV_GOLD, NV_NAVY } from "./ui";
import { hintWrong } from "./hints";
import { SAB } from "./safeArea";

/**
 * ArcadeCatch — the FIRST true Phaser ARCADE-physics lesson (#1142).
 * A fact flashes at the top ("6 × 7 = ?") while three answer tokens fall
 * under gravity, drifting as they drop, and three cloud baskets float near
 * the ground. The kid taps the correct falling answer before it lands.
 *
 * The four "fast round" skills (facts-fast-add/sub/mult/div) all share this
 * scene — `skillId` picks the fact generator, so the scene serves the same
 * fact families as FactsAdd/SubFacts/TimesTable/DivisionFacts, but under
 * real time-pressure with the #1158 challenge-bar contract (gold bar draining
 * over 12s). ROUNDS_TO_FINISH = 5; onRoundDone fires every round like the
 * other drill scenes.
 */

type FactType = "add" | "sub" | "mult" | "div";

const GAME_ID = "game-arcadecatch";
const LEVELS = GAMES.find((g) => g.id === GAME_ID)?.difficultyLevels ?? [1, 2, 3, 4, 5, 6];
const ROUNDS_TO_FINISH = 5;
const CHALLENGE_SECONDS = 12; // #1158 — the drained gold bar is the pressure
const CHALLENGE_BAR = 0xffb703;
const TOKEN_SIZE = 96;
const GRAVITY = 60; // gentle fall — the kid reads, then reacts
const TOKEN_KEY = "nv-arcade-token";
const CLOUD_KEY = "nv-arcade-cloud";

interface FallingToken {
  sprite: Phaser.Physics.Arcade.Sprite;
  label: Phaser.GameObjects.Text;
  value: number;
  correct: boolean;
  landed: boolean;
}

export class ArcadeCatchScene extends Phaser.Scene {
  private levelIndex = 0;
  private levels = LEVELS;
  private roundsDone = 0;
  private startedAt = 0;
  private challenge = true;
  private factType: FactType = "add";
  private a = 0; // add/sub/mult operand 1 (or dividend for ÷)
  private b = 0; // add/sub/mult operand 2 (or divisor for ÷)
  private answer = 0;
  private roundOver = false;
  private challengeDone = false;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengeBar?: Phaser.GameObjects.Rectangle;
  private tokens: FallingToken[] = [];
  private baskets: Phaser.Physics.Arcade.Sprite[] = [];
  private basketVx: number[] = [];
  private onRoundDone?: (correct: boolean, ms: number, difficulty: number) => void;
  private titleText!: Phaser.GameObjects.Text;
  private fastText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private meter!: RoundMeterApi;
  private factText!: Phaser.GameObjects.Text;
  private prompt!: QuestionPanelApi;

  constructor() {
    super("ArcadeCatch");
  }

  create(data: {
    onRoundDone: (correct: boolean, ms: number, difficulty: number) => void;
    startLevelIndex?: number;
    levels?: number[];
    challenge?: boolean;
    mode?: string;
    skillId?: string;
    skill?: string;
  }) {
    this.onRoundDone = data.onRoundDone;
    this.levelIndex = data.startLevelIndex ?? 0;
    if (data.levels?.length) this.levels = data.levels;
    this.challenge = data.challenge ?? true;
    // `skillId` is the scene-contract name for the skill; the App host also
    // passes `skill` (step.skillId). Read both so either caller works.
    this.factType = this.factTypeFor(data.skillId ?? data.skill ?? "");

    this.ensureTextures();
    gameBackground(this, "sky");

    this.titleText = this.add
      .text(0, 0, t(this.titleKey()), txt(34, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.fastText = this.add
      .text(0, 0, t("fastRound"), txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.roundText = this.add
      .text(0, 0, "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.meter = roundMeter(this);
    this.factText = this.add
      .text(0, 0, "", txt(48, NV_GOLD, { bold: true, outline: true }))
      .setOrigin(0.5);
    this.prompt = questionPanel(this, 0, 0);
    this.prompt.set(t("fastCatchPrompt"));
    this.challengeBar = this.add.rectangle(0, 144, 0, 6, CHALLENGE_BAR).setOrigin(0, 0.5).setAlpha(0);

    this.createBaskets();
    onSceneResize(this, () => this.layout());
    this.layout();
    this.startRound();
  }

  private factTypeFor(skillId: string): FactType {
    const s = (skillId || "").toLowerCase();
    if (s.includes("add") || s === "factsadd") return "add";
    if (s.includes("sub") || s === "subfacts") return "sub";
    if (s.includes("mult") || s.includes("table") || s === "timestables") return "mult";
    if (s.includes("div") || s === "division") return "div";
    return "add";
  }

  private titleKey(): string {
    switch (this.factType) {
      case "add":
        return "titleFacts20";
      case "sub":
        return "titleSubFacts";
      case "mult":
        return "titleTimesTable";
      default:
        return "titleDivision";
    }
  }

  /* ── physics / textures ── */

  private ensureTextures() {
    if (!this.textures.exists(TOKEN_KEY)) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(TOKEN_SIZE / 2, TOKEN_SIZE / 2, TOKEN_SIZE / 2 - 5);
      g.lineStyle(5, 0x0b2545, 1);
      g.strokeCircle(TOKEN_SIZE / 2, TOKEN_SIZE / 2, TOKEN_SIZE / 2 - 5);
      g.lineStyle(3, 0xffd166, 0.9);
      g.strokeCircle(TOKEN_SIZE / 2, TOKEN_SIZE / 2, TOKEN_SIZE / 2 - 11);
      g.generateTexture(TOKEN_KEY, TOKEN_SIZE, TOKEN_SIZE);
      g.destroy();
    }
    if (!this.textures.exists(CLOUD_KEY)) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 0.96);
      g.fillCircle(36, 42, 20);
      g.fillCircle(58, 30, 26);
      g.fillCircle(82, 44, 18);
      g.fillCircle(58, 48, 20);
      g.generateTexture(CLOUD_KEY, 112, 84);
      g.destroy();
    }
  }

  private floorY(): number {
    return this.scale.height - SAB() - 8;
  }

  private createBaskets() {
    for (let i = 0; i < 3; i++) {
      const cloud = this.physics.add.sprite(0, 0, CLOUD_KEY);
      cloud.setDepth(8);
      cloud.setGravity(0, 0); // baskets float — no gravity
      cloud.setCollideWorldBounds(true);
      cloud.setBounce(1, 0); // they drift side-to-side and bounce off the walls
      this.baskets.push(cloud);
      this.basketVx.push(Phaser.Math.Between(-90, 90));
    }
  }

  private layoutBaskets() {
    const lanes = [0.22, 0.5, 0.78];
    const y = this.floorY() - 48;
    this.baskets.forEach((cloud, i) => {
      const body = cloud.body as Phaser.Physics.Arcade.Body | null;
      const x = this.scale.width * lanes[i];
      if (body) body.reset(x, y);
      else cloud.setPosition(x, y);
      cloud.setVelocity(this.basketVx[i] || 40, 0);
      cloud.setGravity(0, 0);
    });
  }

  private layout() {
    const { width, height } = this.scale;
    this.physics.world.setBounds(0, 0, width, this.floorY());
    this.titleText.setPosition(width / 2, 34);
    this.fastText.setPosition(width / 2, 64);
    this.roundText.setPosition(width / 2, 94);
    this.meter.setPosition(width / 2, 122);
    this.factText.setPosition(width / 2, Math.max(190, Math.round(height * 0.28)));
    this.prompt.setPosition(width / 2, height - 160 - SAB());
    this.layoutBaskets();
  }

  /* ── round lifecycle ── */

  private startRound() {
    this.clearTokens();
    this.roundOver = false;
    this.challengeDone = false;
    this.startedAt = this.time.now;
    this.roundText.setText(t("round", { n: this.levelIndex + 1 }));
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.genFact();
    this.spawnTokens();
    this.armChallenge();
  }

  private level(): number {
    return this.levels[Math.min(this.levelIndex, this.levels.length - 1)];
  }

  /* ── fact generators — the same level-based contracts as the four source
   *    scenes (FactsAdd / SubFacts / TimesTable / DivisionFacts) ── */

  private genFact() {
    const lvl = this.level();
    if (this.factType === "add") {
      const maxA = lvl <= 2 ? 5 : lvl <= 4 ? 8 : 10;
      this.a = Phaser.Math.Between(1, maxA);
      this.b = Phaser.Math.Between(1, maxA);
      this.answer = this.a + this.b;
      this.factText.setText(`${digit(this.a)} + ${digit(this.b)} = ?`);
      return;
    }
    if (this.factType === "sub") {
      const maxA = lvl <= 2 ? 10 : lvl <= 4 ? 16 : 20;
      this.a = Phaser.Math.Between(1, maxA);
      this.b = Phaser.Math.Between(1, this.a);
      this.answer = this.a - this.b;
      this.factText.setText(`${digit(this.a)} − ${digit(this.b)} = ?`);
      return;
    }
    if (this.factType === "mult") {
      const set = this.tableSet(lvl, this.levels[this.levels.length - 1]);
      this.a = Phaser.Math.RND.pick(set);
      this.b = Phaser.Math.Between(2, 10);
      this.answer = this.a * this.b;
      this.factText.setText(`${digit(this.a)} × ${digit(this.b)} = ?`);
      return;
    }
    // division — level is the divisor table (1..6 on the fast-round ladder)
    this.b = lvl;
    const quotient = Phaser.Math.Between(2, 12);
    this.a = this.b * quotient;
    this.answer = quotient;
    this.factText.setText(`${digit(this.a)} ÷ ${digit(this.b)} = ?`);
  }

  /** Reused from TimesTableScene (#1170): single table first, then mixed. */
  private tableSet(v: number, max: number): number[] {
    if (v <= 5) return [v];
    if (v <= 7) return [6, 7];
    return [8, 9, ...(max >= 10 ? [10] : [])];
  }

  private answerBank(): number[] {
    const opts = new Set<number>([this.answer]);
    if (this.factType === "add" || this.factType === "sub") {
      while (opts.size < 3) {
        const d = this.answer + Phaser.Math.Between(-3, 3);
        if (d >= 0 && d <= 20 && !opts.has(d)) opts.add(d);
      }
    } else {
      let delta = 1;
      while (opts.size < 3) {
        const cand = Math.max(0, this.answer + (delta % 2 === 1 ? -delta : delta));
        if (cand !== this.answer) opts.add(cand);
        delta++;
      }
    }
    return [...opts].sort(() => Math.random() - 0.5);
  }

  private spawnY(): number {
    return Math.max(240, Math.round(this.scale.height * 0.36));
  }

  private spawnTokens() {
    const bank = this.answerBank();
    const lanes = [0.22, 0.5, 0.78];
    bank.forEach((value, i) => {
      const x = this.scale.width * lanes[i] + Phaser.Math.Between(-18, 18);
      this.spawnToken(x, this.spawnY(), value, value === this.answer);
    });
  }

  private spawnToken(x: number, y: number, value: number, correct: boolean) {
    const sprite = this.physics.add.sprite(x, y, TOKEN_KEY);
    sprite.setDepth(20);
    sprite.setGravity(0, GRAVITY); // real falling physics — setGravity
    sprite.setVelocity(Phaser.Math.Between(-60, 60), Phaser.Math.Between(6, 26)); // drift + drop
    sprite.setCollideWorldBounds(true);
    sprite.setBounce(0.35, 0);
    sprite.setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x, y, digit(value), txt(34, NV_NAVY, { bold: true }))
      .setOrigin(0.5)
      .setDepth(21);
    const token: FallingToken = { sprite, label, value, correct, landed: false };
    sprite.on("pointerdown", () => this.tapToken(token));
    this.tokens.push(token);
  }

  /* ── #1158 challenge-bar countdown ── */

  private armChallenge() {
    if (this.challengeTimer) this.challengeTimer.remove(false);
    this.challengeDone = false;
    const bar = this.challengeBar;
    if (bar) {
      this.tweens.killTweensOf(bar);
      bar.setPosition(20, 144).setSize(Math.min(this.scale.width - 40, 320), 6).setScale(1, 1).setAlpha(1);
      this.tweens.add({ targets: bar, scaleX: 0, duration: CHALLENGE_SECONDS * 1000, ease: "Linear.easeNone" });
    }
    this.challengeTimer = this.time.delayedCall(CHALLENGE_SECONDS * 1000, () => {
      if (this.challengeDone || this.roundOver) return;
      this.challengeDone = true;
      this.endRound(false, CHALLENGE_SECONDS * 1000);
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

  /* ── tapping + physics resolution ── */

  private tapToken(token: FallingToken) {
    if (this.roundOver) return;
    if (!token.correct) {
      this.wrongToken(token);
      return;
    }
    this.challengeDone = true; // solved — stop the countdown
    this.disarmChallenge();
    pop();
    win();
    correctCelebrate(this, token.sprite.x, token.sprite.y, { difficulty: this.level() });
    this.sparkle(token.sprite.x, token.sprite.y);
    const ms = Math.max(1, this.time.now - this.startedAt);
    this.endRound(true, ms);
  }

  private wrongToken(token: FallingToken) {
    // The tapped wrong token stops in place (so the hint shake reads clearly)
    // while the other two keep falling — the kid can still catch the right one.
    token.sprite.setVelocity(0, 0);
    const body = token.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.allowGravity = false;
      body.moves = false;
    }
    hintWrong(
      this,
      token.sprite as unknown as Phaser.GameObjects.Container,
      {
        hint: () => this.hintLine(),
        hintBn: () => this.hintLine(),
        correct: () => this.answer,
        options: () =>
          this.tokens.map((t) => ({
            sprite: t.sprite as unknown as Phaser.GameObjects.Container,
            value: t.value,
          })),
        challenge: this.challenge, // #1158 — no banner/reveal; solve it yourself
      }
    );
  }

  private hintLine(): string {
    switch (this.factType) {
      case "add":
        return t("qAdd", { a: digit(this.a), b: digit(this.b) });
      case "sub":
        return t("qSub", { a: digit(this.a), b: digit(this.b) });
      case "mult":
        return t("qMul", { a: digit(this.a), b: digit(this.b) });
      default:
        return t("qDiv", { a: digit(this.a), b: digit(this.b) });
    }
  }

  private onTokenLand(token: FallingToken) {
    if (this.roundOver || !token.correct) return;
    // The correct answer reached the ground — that is a miss, just like a
    // drained challenge bar.
    this.floatMsg(t("fastMiss"));
    this.endRound(false, Math.max(1, this.time.now - this.startedAt));
  }

  private endRound(correct: boolean, ms: number) {
    if (this.roundOver) return;
    this.roundOver = true;
    this.disarmChallenge();
    this.freezeTokens();
    this.roundsDone++;
    this.meter.set(this.roundsDone, ROUNDS_TO_FINISH);
    this.onRoundDone?.(correct, ms, this.levelIndex + 1);
    this.time.delayedCall(correct ? 900 : 700, () => {
      if (this.roundsDone >= ROUNDS_TO_FINISH) this.roundsDone = 0;
      this.levelIndex++;
      this.startRound();
    });
  }

  private freezeTokens() {
    for (const token of this.tokens) {
      if (!token.sprite.active) continue;
      token.sprite.setVelocity(0, 0);
      const body = token.sprite.body as Phaser.Physics.Arcade.Body | null;
      if (body) {
        body.allowGravity = false;
        body.moves = false;
      }
    }
  }

  private clearTokens() {
    for (const token of this.tokens) {
      if (token.sprite.active) token.sprite.destroy();
      if (token.label.active) token.label.destroy();
    }
    this.tokens = [];
  }

  /* ── small polish helpers ── */

  private floatMsg(text: string) {
    floatText(this, this.scale.width / 2, this.scale.height * 0.6, text, NV_GOLD, 24, -24);
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, [0xffd166, 0x4cc9f0, 0x4ade80][i % 3]);
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

  update() {
    for (const token of this.tokens) {
      if (!token.sprite.active) continue;
      token.label.setPosition(token.sprite.x, token.sprite.y);
      if (!token.landed) {
        const body = token.sprite.body as Phaser.Physics.Arcade.Body | null;
        if (body && body.blocked.down) {
          token.landed = true;
          this.onTokenLand(token);
        }
      }
    }
  }
}

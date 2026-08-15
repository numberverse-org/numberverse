import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop, bad, win } from "./audio";
import { speak } from "./speech";
import { txt, NV_GOLD } from "./ui";
import { getAppLang } from "./locale";
import { t as tr } from "./i18n";
import { gameBackground } from "./backgrounds";
import { SAT, SAB } from "./safeArea";
import { prefersReducedMotion } from "./reducedMotion";
import {
  useKidStore,
  defaultNova,
  todayIso,
  NOVA_DAILY_CAP,
  speciesEmoji,
  challengeQualityCoins,
} from "../store";

/**
 * 🗣️ NOVA SAYS — pet mini-game #607 (docs/plans/104-pet-minigames.md).
 *
 * Simon-style: Nova does a short action sequence; the kid taps the SAME
 * sequence to repeat it. Escalates one move at a time; mistakes replay the
 * sequence kindly (never punish). Sequences cap at 6 for young kids. 1-2 coins
 * on a completed round via challengeQualityCoins (anti-grind cap aware).
 */



const MOVES = ["🕺", "🌀", "🦘", "✨", "💃", "👋"] as const;
const MAX_SEQ = 6;
const ROUNDS_TARGET = 3;

export class NovaSaysScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private nova!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;

  private seq: number[] = [];
  private step = 0;
  private playing = false;
  private rounds = 0;
  private perfect = true;
  private wrongs = 0;
  private stepIdx = 0;


  private get reduced(): boolean {
    return prefersReducedMotion();
  }
  constructor() {
    super("NovaSays");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    gameBackground(this, "night");
    this.drawHeader();
    this.drawNova();
    this.nextRound();
    onSceneResize(this, () => this.layout());
  }



  private drawHeader() {
    const T = tr;
    this.add
      .text(this.scale.width / 2, 30 + SAT(), T("novaSaysTitle"), txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.hint = this.add
      .text(this.scale.width / 2, 74 + SAT(), T("novaSaysHint"), txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.status = this.add
      .text(this.scale.width / 2, this.scale.height * 0.4, T("novaSaysWatch"), txt(20, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setDepth(900);
    this.roundText = this.add
      .text(this.scale.width / 2, 108 + SAT(), "", txt(18, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T("petClose"), txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawNova() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    this.nova = this.add
      .text(this.scale.width / 2, this.scale.height - 70 - SAB(), speciesEmoji(nova.species, nova.petStage), txt(120, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100);
  }

  private nextRound() {
    this.rounds += 1;
    this.step = Math.min(this.rounds, MAX_SEQ);
    this.seq = Array.from({ length: this.step }, () => Phaser.Math.Between(0, MOVES.length - 1));
    this.stepIdx = 0;
    this.perfect = this.wrongs === 0;
    this.roundText.setText(`📋 ${this.step}`);
    this.playSequence();
  }

  private playSequence() {
    this.playing = true;
    this.status.setText(tr("novaSaysWatch"));
    let i = 0;
    const step = () => {
      if (i >= this.seq.length) {
        this.playing = false;
        this.status.setText(tr("novaSaysYourTurn"));
        return;
      }
      const move = this.seq[i];
      this.flashMove(move, () => {
        i += 1;
        this.time.delayedCall(this.reduced ? 600 : 450, step);
      });
    };
    step();
  }

  /** Show a move button light-up on the grid + speak the move name. */
  private flashMove(moveIdx: number, done: () => void) {
    pop();
    speak(MOVES[moveIdx], { lang: "en" });
    this.spawnMove(MOVES[moveIdx], true);
    done();
  }

  private spawnMove(emoji: string, isNova: boolean) {
    const x = Phaser.Math.Between(50, this.scale.width - 50);
    const y = Phaser.Math.Between(this.scale.height * 0.42, this.scale.height * 0.62);
    const m = this.add
      .text(x, y, emoji, txt(isNova ? 44 : 30, "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setDepth(300);
    this.tweens.add({
      targets: m,
      y: m.y - 40,
      alpha: 0,
      duration: 500,
      onComplete: () => m.destroy(),
    });
  }

  private tap(moveIdx: number) {
    if (this.playing) return;
    const expected = this.seq[this.stepIdx];
    if (moveIdx === expected) {
      pop();
      this.spawnMove(MOVES[moveIdx], false);
      this.stepIdx += 1;
      if (this.stepIdx >= this.seq.length) this.finishRound();
    } else {
      bad();
      this.wrongs += 1;
      this.perfect = false;
      speak(tr("novaSaysAgain"));
      this.time.delayedCall(1200, () => this.playSequence());
    }
  }

  private finishRound() {
    this.playing = true;
    win();
    const granted = useKidStore.getState().novaChallengeReward(this.kidId, challengeQualityCoins(this.perfect ? 1 : 0.5));
    speak(granted > 0 ? (this.perfect ? tr("novaSaysPerfect") : tr("novaSaysReward")) : tr("petCap"));
    this.time.delayedCall(1800, () => {
      if (this.rounds >= ROUNDS_TARGET) {
        this.rounds = 0;
        this.wrongs = 0;
      }
      this.nextRound();
    });
  }

  // a simple tap grid of the 6 moves, bottom half
  private grid!: Phaser.GameObjects.Text[];

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn || !this.status) return;
    const T = tr;
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.roundText.setPosition(this.scale.width / 2, 108 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.status.setPosition(this.scale.width / 2, this.scale.height * 0.4);
    this.nova.setPosition(this.scale.width / 2, this.scale.height - 70 - SAB());
    this.dealGrid();
  }

  private dealGrid() {
    if (this.grid) this.grid.forEach((t) => t.destroy());
    const W = this.scale.width;
    const H = this.scale.height;
    const cols = 3;
    const rows = 2;
    const bw = Math.min(86, (W - 40) / cols - 8);
    const y0 = H * 0.78;
    this.grid = [];
    MOVES.forEach((emoji, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = W / 2 + (col - (cols - 1) / 2) * (bw + 10);
      const y = y0 + (row - (rows - 1) / 2) * (bw + 10);
      const b = this.add
        .text(x, y, emoji, txt(38, "#ffffff"))
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      b.setData("idx", i);
      b.on("pointerdown", () => this.tap(i));
      this.grid.push(b);
    });
  }
}

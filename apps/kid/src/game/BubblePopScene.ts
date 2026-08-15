import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop, win } from "./audio";
import { speak, bnNumber, enNumber, cancelSpeech } from "./speech";
import { txt, NV_GOLD } from "./ui";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { SAT, SAB } from "./safeArea";
import { prefersReducedMotion } from "./reducedMotion";
import {
  useKidStore,
  defaultNova,
  todayIso,
  NOVA_DAILY_CAP,
  speciesEmoji,
} from "../store";

/**
 * 🫧 BUBBLE POP — pet mini-game #605 (docs/plans/104-pet-minigames.md).
 *
 * Nova blows bubbles; the kid pops them and the counter counts ALONG (speak on
 * every pop, EN/BN words). Counting is the side effect; popping is the fun.
 * Numbers stay ≤20 and band-appropriate. One coin per round via
 * novaChallengeReward (cap-aware). Muted device → the counter is still visual.
 *
 * Bubbles are DRAWN circles (no emoji-render risk), rise with a gentle wobble.
 */

const T = {
  en: {
    title: "🫧 Bubble Pop",
    hint: "Pop the bubbles & count with Nova!",
    pop: ["Pop! 💥", "Bubble! 🫧", "Pop-pop! ✨", "Got one! 🎈"],
    reward: "You counted to TEN! +1 🪙 💛",
    cap: "You earned ALL your coins today! 🪙✨",
    close: "✕",
  },
  bn: {
    title: "🫧 বুদবুদ ফুটাও",
    hint: "বুদবুদ ফুটাও আর নোভার সাথে গুনো!",
    pop: ["ফুট! 💥", "বুদবুদ! 🫧", "ফুটফুট! ✨", "পেয়েছি! 🎈"],
    reward: "দশ পর্যন্ত গুনলে! +1 🪙 💛",
    cap: "আজ সব কয়েন জিতেছ! 🪙✨",
    close: "✕",
  },
} as const;

const ROUND_POPS = 10; // pop this many to finish a round (counts to ten)
const RISE_SPEED = 150; // px/second (reduced-motion slows it)

interface Bubble {
  c: Phaser.GameObjects.Container;
  baseX: number;
  y: number;
  start: number; // ms when spawned, for the wobble phase
}

export class BubblePopScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private nova!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;

  private count = 0;
  private roundDone = false;
  private bubble: Bubble | null = null;
  private spawnBusy = false;


  private get reduced(): boolean {
    return prefersReducedMotion();
  }
  constructor() {
    super("BubblePop");
  }

  // #1003 archetype: challenge
  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    gameBackground(this, "candy");
    this.drawHeader();
    this.drawNova();
    this.startRound();
    onSceneResize(this, () => this.layout());
  }

  private t() {
    return this.lang === "bn" ? T.bn : T.en;
  }

  private drawHeader() {
    const T = this.t();
    this.add
      .text(this.scale.width / 2, 30 + SAT(), T.title, txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.hint = this.add
      .text(this.scale.width / 2, 74 + SAT(), T.hint, txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.countText = this.add
      .text(this.scale.width / 2, 108 + SAT(), "💥 0", txt(24, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.msg = this.add
      .text(this.scale.width / 2, this.scale.height * 0.42, "", txt(18, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(900);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T.close, txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawNova() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    this.nova = this.add
      .text(this.scale.width / 2, this.scale.height - 60 - SAB(), speciesEmoji(nova.species, nova.petStage), txt(80, "#ffffff"))
      .setOrigin(0.5, 1);
  }

  private startRound() {
    this.count = 0;
    this.roundDone = false;
    this.bubble = null;
    this.spawnBusy = false;
    this.updateCount();
    this.spawnBubble();
  }

  private bubbleOriginY() {
    return this.nova.y - 96;
  }

  private spawnBubble() {
    if (this.roundDone || this.bubble || this.spawnBusy) return;
    const baseX = Phaser.Math.Between(80, this.scale.width - 80);
    const c = this.add.container(baseX, this.bubbleOriginY());
    const body = this.add.circle(0, 0, 26, 0xcfe8ff, 0.55).setStrokeStyle(2, 0xffffff, 0.9);
    const shine = this.add.circle(-9, -10, 7, 0xffffff, 0.75);
    const hit = this.add.circle(0, 0, 36, 0xffffff, 0.01).setInteractive({ useHandCursor: true });
    c.add([body, shine, hit]);
    c.setDepth(200);
    const b: Bubble = { c, baseX, y: this.bubbleOriginY(), start: this.time.now };
    hit.on("pointerdown", () => this.popBubble(b));
    this.bubble = b;
  }

  update(_time: number, delta: number) {
    if (this.roundDone || !this.bubble) return;
    const dt = Math.min(100, delta) / 1000;
    const b = this.bubble;
    const rise = RISE_SPEED * (this.reduced ? 0.6 : 1);
    b.y -= rise * dt;
    b.c.y = b.y;
    const wobble = Math.sin((this.time.now - b.start) * 0.007) * 15;
    b.c.x = b.baseX + wobble;
    if (b.y < -60) this.escapeBubble();
  }

  private popBubble(b: Bubble) {
    if (this.roundDone) return;
    this.bubble = null;
    b.c.destroy();
    const T = this.t();
    pop();
    this.count += 1;
    this.updateCount();
    // count aloud — the point of the game
    cancelSpeech();
    speak(this.lang === "bn" ? bnNumber(this.count) : enNumber(this.count));
    speak(T.pop[Phaser.Math.Between(0, T.pop.length - 1)], { cancel: false });
    this.burstRing(b.c.x, b.c.y);
    if (this.count >= ROUND_POPS) {
      this.roundDone = true;
      this.time.delayedCall(350, () => this.finishRound());
    } else {
      this.spawnBusy = true;
      this.time.delayedCall(300, () => {
        this.spawnBusy = false;
        this.spawnBubble();
      });
    }
  }

  private escapeBubble() {
    // a bubble that drifts away just vanishes — no penalty, respawn
    if (!this.bubble) return;
    this.bubble.c.destroy();
    this.bubble = null;
    this.spawnBusy = true;
    this.time.delayedCall(300, () => {
      this.spawnBusy = false;
      this.spawnBubble();
    });
  }

  private burstRing(x: number, y: number) {
    const ring = this.add.circle(x, y, 12, 0xffffff, 0.9).setDepth(300);
    this.tweens.add({
      targets: ring,
      radius: 34,
      alpha: 0,
      duration: 300,
      onComplete: () => ring.destroy(),
    });
  }

  private updateCount() {
    this.countText.setText(`💥 ${this.count}`);
  }

  private showMsg(text: string, ms: number) {
    this.msg.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.msg);
    this.tweens.add({ targets: this.msg, alpha: 0, delay: ms, duration: 300 });
  }

  private finishRound() {
    win();
    const granted = useKidStore.getState().novaChallengeReward(this.kidId, 1);
    const T = this.t();
    if (granted > 0) {
      speak(T.reward);
      this.showMsg(T.reward, 1600);
    } else {
      speak(T.cap);
      this.showMsg(T.cap, 1600);
    }
    this.time.delayedCall(1800, () => this.startRound());
  }

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn || !this.countText) return;
    const T = this.t();
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.countText.setPosition(this.scale.width / 2, 108 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.nova.setPosition(this.scale.width / 2, this.scale.height - 60 - SAB());
    this.msg.setPosition(this.scale.width / 2, this.scale.height * 0.42);
    if (this.bubble) {
      this.bubble.baseX = Phaser.Math.Clamp(this.bubble.baseX, 80, this.scale.width - 80);
    }
  }
}

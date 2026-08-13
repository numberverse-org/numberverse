import Phaser from "phaser";
import { pop, win } from "./audio";
import { speak } from "./speech";
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
 * 🛁 BATH TIME — pet mini-game #600 (docs/plans/104-pet-minigames.md).
 *
 * Bubbles float around a soapy Nova; the kid pops them to wash her clean. A
 * clean-meter fills; when full, Nova sparkles + win(). Bubbles respawn until
 * clean — there is no way to lose. One coin per clean via novaChallengeReward.
 * Distinct from the ACTIVITIES["bath"] animation: this is a goal-based scene.
 */

const T = {
  en: {
    title: "🛁 Bath Time",
    hint: "Pop the bubbles to wash Nova clean!",
    clean: "Clean! ✨",
    sparkle: "So fresh & sparkly! +1 🪙 🧼",
    cap: "You earned ALL your coins today! 🪙✨",
    close: "✕",
  },
  bn: {
    title: "🛁 গোসলের সময়",
    hint: "বুদবুদ ফুটিয়ে নোভাকে ধুইয়ে দাও!",
    clean: "পরিষ্কার! ✨",
    sparkle: "কী ঝকঝকে! +1 🪙 🧼",
    cap: "আজ সব কয়েন জিতেছ! 🪙✨",
    close: "✕",
  },
} as const;

const CLEAN_NEEDED = 12; // pops to get Nova fully clean
const MAX_BUBBLES = 8; // concurrent bubbles on screen

interface Bubble {
  c: Phaser.GameObjects.Container;
  baseX: number;
  y: number;
  start: number;
}

export class BathNovaScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private reduced = false;
  private nova!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private meter!: Phaser.GameObjects.Graphics;
  private msg!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;

  private clean = 0;
  private roundDone = false;
  private bubbles: Bubble[] = [];
  private spawnTimer?: Phaser.Time.TimerEvent;
  private soap!: Phaser.GameObjects.Text;

  constructor() {
    super("BathNova");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    this.reduced = prefersReducedMotion();
    gameBackground(this, "kitchen");
    this.drawHeader();
    this.drawNova();
    this.startRound();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
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
    this.meter = this.add.graphics().setDepth(50);
    this.drawMeter();
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

  private drawMeter() {
    const T = this.t();
    const x = this.scale.width / 2;
    const y = 134 + SAT();
    const w = Math.min(220, this.scale.width - 120);
    this.meter.clear();
    // track
    this.meter.fillStyle(0xffffff, 0.18);
    this.meter.fillRoundedRect(x - w / 2, y - 7, w, 14, 7);
    // fill (soap bubbles — the cleaner, the fuller)
    const frac = this.clean / CLEAN_NEEDED;
    if (frac > 0) {
      this.meter.fillStyle(0x7dd3fc, 1);
      this.meter.fillRoundedRect(x - w / 2, y - 7, w * frac, 14, 7);
    }
    this.meter.fillStyle(0xffffff, 0.85);
    for (let i = 0; i < 3; i++) {
      const fx = x - w / 2 + w * Math.max(0.08, frac * (0.3 + i * 0.25));
      this.meter.fillCircle(fx, y, 3);
    }
  }

  private drawNova() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    this.nova = this.add
      .text(this.scale.width / 2, this.scale.height - 60 - SAB(), speciesEmoji(nova.species, nova.petStage), txt(88, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100);
    // a foam cap while still soapy
    this.soap = this.add
      .text(this.nova.x, this.nova.y - 74, "🧼", txt(40, "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setDepth(101)
      .setAngle(-12);
  }

  private startRound() {
    this.clean = 0;
    this.roundDone = false;
    this.drawMeter();
    this.bubbles = [];
    this.spawnTimer?.remove();
    this.spawnTimer = this.time.addEvent({
      delay: 550,
      loop: true,
      callback: () => {
        if (this.bubbles.length < MAX_BUBBLES) this.spawnBubble();
      },
    });
    // start with a few on screen
    for (let i = 0; i < 4; i++) this.spawnBubble();
  }

  private spawnBubble() {
    if (this.roundDone) return;
    const r = Phaser.Math.Between(16, 26);
    const baseX = Phaser.Math.Between(70, this.scale.width - 70);
    const y0 = this.nova.y - Phaser.Math.Between(40, 160);
    const c = this.add.container(baseX, y0);
    const body = this.add.circle(0, 0, r, 0xcfe8ff, 0.5).setStrokeStyle(2, 0xffffff, 0.85);
    const shine = this.add.circle(-r * 0.35, -r * 0.38, Math.max(4, r * 0.26), 0xffffff, 0.7);
    const hit = this.add.circle(0, 0, r + 10, 0xffffff, 0.01).setInteractive({ useHandCursor: true });
    c.add([body, shine, hit]);
    c.setDepth(200);
    const b: Bubble = { c, baseX, y: y0, start: this.time.now };
    hit.on("pointerdown", () => this.popBubble(b));
    this.bubbles.push(b);
  }

  update(_time: number, delta: number) {
    if (this.roundDone) return;
    const dt = Math.min(100, delta) / 1000;
    const drift = this.reduced ? 18 : 34; // px/s slow drift
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.y -= drift * dt;
      b.c.y = b.y;
      b.c.x = b.baseX + Math.sin((this.time.now - b.start) * 0.006) * 10;
      if (b.y < -70) {
        this.bubbles.splice(i, 1);
        b.c.destroy();
      }
    }
  }

  private popBubble(b: Bubble) {
    if (this.roundDone) return;
    this.bubbles = this.bubbles.filter((x) => x !== b);
    b.c.destroy();
    pop();
    this.clean += 1;
    this.drawMeter();
    this.burst(b.c.x, b.c.y);
    if (this.clean >= CLEAN_NEEDED) {
      this.roundDone = true;
      this.time.delayedCall(300, () => this.finishRound());
    } else if (this.clean % 4 === 0) {
      speak(this.t().clean);
    }
  }

  private burst(x: number, y: number) {
    const ring = this.add.circle(x, y, 10, 0xffffff, 0.9).setDepth(300);
    this.tweens.add({ targets: ring, radius: 30, alpha: 0, duration: 280, onComplete: () => ring.destroy() });
  }

  private finishRound() {
    this.spawnTimer?.remove();
    win();
    // Nova sparkles + loses the soap cap
    this.soap.setVisible(false);
    this.burstHearts();
    const granted = useKidStore.getState().novaChallengeReward(this.kidId, 1);
    const T = this.t();
    if (granted > 0) {
      speak(T.sparkle);
      this.showMsg(T.sparkle, 1600);
    } else {
      speak(T.cap);
      this.showMsg(T.cap, 1600);
    }
    this.time.delayedCall(1900, () => {
      this.soap.setVisible(true);
      this.startRound();
    });
  }

  private burstHearts() {
    const sparks = ["✨", "🌟", "💛", "🫧"];
    for (let i = 0; i < 10; i++) {
      const s = this.add
        .text(this.nova.x, this.nova.y - 60, sparks[i % sparks.length], txt(26, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(400);
      this.tweens.add({
        targets: s,
        x: s.x + Phaser.Math.Between(-80, 80),
        y: s.y - Phaser.Math.Between(30, 120),
        alpha: 0,
        angle: Phaser.Math.Between(-40, 40),
        duration: 800 + Phaser.Math.Between(0, 400),
        delay: i * 60,
        onComplete: () => s.destroy(),
      });
    }
    this.tweens.add({ targets: this.nova, scale: 1.12, duration: 120, yoyo: true, repeat: 2 });
  }

  private showMsg(text: string, ms: number) {
    this.msg.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.msg);
    this.tweens.add({ targets: this.msg, alpha: 0, delay: ms, duration: 300 });
  }

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn) return;
    const T = this.t();
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.nova.setPosition(this.scale.width / 2, this.scale.height - 60 - SAB());
    this.soap.setPosition(this.nova.x, this.nova.y - 74);
    this.msg.setPosition(this.scale.width / 2, this.scale.height * 0.42);
    this.drawMeter();
  }
}

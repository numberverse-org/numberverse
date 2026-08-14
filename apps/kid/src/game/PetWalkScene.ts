import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
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
  challengeQualityCoins,
} from "../store";

/**
 * 🚶 PET WALK — pet mini-game #608 (docs/plans/104-pet-minigames.md).
 *
 * Tap a path to walk Nova across a short scene, collecting coins along the
 * way. No obstacles to fail on — a relaxed stroll. Collected coins feed
 * novaChallengeReward at the end (anti-grind cap aware). Nova always reaches
 * the end; the coins are 'extra', never required.
 */

const T = {
  en: {
    title: "🚶 Pet Walk",
    hint: "Tap to walk Nova along the path!",
    coin: "+1 🪙",
    reward: "What a walk! +1 🪙 for the stroll! 💛",
    perfect: "All the coins! +2 🪙 ⭐",
    cap: "You earned ALL your coins today! 🪙✨",
    close: "✕",
  },
  bn: {
    title: "🚶 পোষা ভ্রমণ",
    hint: "নোভাকে পথ ধরে হাঁটাতে ছোঁও!",
    coin: "+1 🪙",
    reward: "কী হাঁটা! +1 🪙 💛",
    perfect: "সব কয়েন! +2 🪙 ⭐",
    cap: "আজ সব কয়েন জিতেছ! 🪙✨",
    close: "✕",
  },
} as const;

const STEP_DX = 46; // px per tap along the path
const COIN_EVERY = 3; // a coin every Nth step
const COIN_SPOTS = 5; // total coins on the path
const PATH_Y = 0.55; // fraction of height for the walk line

export class PetWalkScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private reduced = false;
  private nova!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;

  private startX = 0;
  private walkY = 0;
  private endX = 0;
  private targetX = 0;
  private coinsGot = 0;
  private coinSpots: number[] = [];
  private walking = false;
  private arrived = false;

  constructor() {
    super("PetWalk");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    this.reduced = prefersReducedMotion();
    gameBackground(this, "forest");
    this.drawHeader();
    this.setupPath();
    this.drawNova();
    this.drawCoins();
    this.input.on("pointerdown", () => this.tapWalk());
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
    this.coinText = this.add
      .text(this.scale.width / 2, 108 + SAT(), "🪙 0", txt(24, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T.close, txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private setupPath() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.startX = 40;
    this.walkY = Math.max(168 + SAT(), H * PATH_Y);
    this.endX = W - 40;
    this.targetX = this.startX;
  }

  private drawNova() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    this.nova = this.add
      .text(this.startX, this.walkY, speciesEmoji(nova.species, nova.petStage), txt(64, "#ffffff"))
      .setOrigin(0.5)
      .setDepth(100);
  }

  private drawCoins() {
    this.coinSpots = [];
    const n = Math.min(COIN_SPOTS, Math.floor((this.endX - this.startX) / (STEP_DX * 2)));
    for (let i = 0; i < n; i++) {
      const x = this.startX + ((i + 1) * (this.endX - this.startX)) / (n + 1);
      this.coinSpots.push(x);
      const c = this.add
        .text(x, this.walkY - 50, "🪙", txt(30, "#ffffff", { shadow: false }))
        .setOrigin(0.5)
        .setDepth(200);
      c.setData("spot", x);
      this.coinSpotsRef.push(c);
    }
  }
  private coinSpotsRef: Phaser.GameObjects.Text[] = [];

  private tapWalk() {
    if (this.arrived || this.walking) return;
    if (this.nova.x >= this.endX - 4) {
      this.finishWalk();
      return;
    }
    pop();
    // advance one step along the path (always forward)
    this.targetX = Math.min(this.endX, this.nova.x + STEP_DX);
    this.walking = true;
    const dur = this.reduced ? 500 : 320;
    this.tweens.add({
      targets: this.nova,
      x: this.targetX,
      duration: dur,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.walking = false;
        // collect any coin at this spot
        const got = this.coinSpotsRef.find((c) => !c.getData("taken") && Math.abs(c.x - this.nova.x) < STEP_DX * 0.7);
        if (got) {
          got.setData("taken", true);
          this.coinsGot += 1;
          this.coinText.setText(`🪙 ${this.coinsGot}`);
          this.tweens.add({ targets: got, y: got.y - 40, alpha: 0, duration: 300, onComplete: () => got.destroy() });
          speak(this.t().coin);
        }
        if (this.nova.x >= this.endX - 4) this.finishWalk();
      },
    });
  }

  private finishWalk() {
    this.arrived = true;
    win();
    const perfect = this.coinsGot === this.coinSpots.length && this.coinSpots.length > 0;
    const granted = useKidStore.getState().novaChallengeReward(this.kidId, challengeQualityCoins(perfect ? 1 : 0.5));
    speak(granted > 0 ? (perfect ? this.t().perfect : this.t().reward) : this.t().cap);
    this.time.delayedCall(2000, () => this.resetWalk());
  }

  private resetWalk() {
    this.nova.setX(this.startX);
    this.arrived = false;
    this.coinsGot = 0;
    this.coinText.setText("🪙 0");
    this.coinSpotsRef.forEach((c) => c.destroy());
    this.coinSpotsRef = [];
    this.drawCoins();
  }

  private layout() {
    if (!this.nova || !this.hint || !this.closeBtn) return;
    const T = this.t();
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.coinText.setPosition(this.scale.width / 2, 108 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    const H = this.scale.height;
    const W = this.scale.width;
    this.setupPath();
    this.nova.setY(this.walkY);
    if (!this.arrived) this.nova.setX(Math.max(this.startX, this.nova.x));
  }
}

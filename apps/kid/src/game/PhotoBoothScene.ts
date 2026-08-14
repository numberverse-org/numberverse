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
  speciesEmoji,
  speciesById,
} from "../store";
import { renderShareCard, canvasToBlob, sharePng, waTextUrl, type ShareCardData } from "./shareImage";

/**
 * 📸 PHOTO BOOTH — pet mini-game #616 (docs/plans/104-pet-minigames.md).
 *
 * Pose Nova (tap to cycle poses), snap a 'photo', and reuse the share-card
 * PNG (shareImage.ts) to generate a card for WhatsApp — ties the pet into the
 * existing share loop. Sharing is optional; a kid can snap without sharing.
 * PNG metadata stays zero (respects test-png-metadata.mjs).
 */

const T = {
  en: {
    title: "📸 Photo Booth",
    hint: "Tap to change Nova's pose, then snap!",
    pose: "Pose",
    snap: "📸 Snap!",
    sharing: "Making your card…",
    share: "📲 Share",
    again: "🔄 Snap again",
    shareReward: "Shared Nova's photo! +5 🪙 🎉",
    cap: "You earned ALL your share reward today! 🪙✨",
    close: "✕",
  },
  bn: {
    title: "📸 ফটো বুথ",
    hint: "নোভার ভঙ্গি বদলাতে ছোঁও, তারপর ছবি তোলো!",
    pose: "ভঙ্গি",
    snap: "📸 ছবি!",
    sharing: "কার্ড তৈরি হচ্ছে…",
    share: "📲 শেয়ার",
    again: "🔄 আবার ছবি",
    shareReward: "নোভার ছবি শেয়ার করেছ! +5 🪙 🎉",
    cap: "আজ শেয়ার রিওয়ার্ড সব পেয়েছ! 🪙✨",
    close: "✕",
  },
} as const;

const POSES = ["🙂", "😄", "🥳", "😉", "🤩", "😜"] as const;

export class PhotoBoothScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private reduced = false;
  private hint!: Phaser.GameObjects.Text;
  private poseBtn!: Phaser.GameObjects.Text;
  private snapBtn!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;
  private frame!: Phaser.GameObjects.Graphics;
  private nova!: Phaser.GameObjects.Text;
  private poseIdx = 0;

  constructor() {
    super("PhotoBooth");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    this.reduced = prefersReducedMotion();
    gameBackground(this, "candy");
    this.drawHeader();
    this.drawFrame();
    this.drawNova();
    this.drawButtons();
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
    this.status = this.add
      .text(this.scale.width / 2, 108 + SAT(), "", txt(16, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T.close, txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawFrame() {
    this.frame = this.add.graphics();
    this.drawFrameBox();
  }

  private drawFrameBox() {
    this.frame.clear();
    const { width, height } = this.scale;
    const w = Math.min(340, width - 40);
    const h = Math.min(300, height * 0.42);
    const x = (width - w) / 2;
    const y = Math.max(150 + SAT(), height * 0.36 - h / 2);
    this.frame.lineStyle(4, 0xffffff, 0.95);
    this.frame.strokeRoundedRect(x, y, w, h, 22);
    this.frame.lineStyle(2, 0xffd166, 0.6);
    this.frame.strokeRoundedRect(x + 8, y + 8, w - 16, h - 16, 18);
  }

  private drawNova() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    const species = speciesById(nova.species);
    const stageEmoji = speciesEmoji(nova.species, nova.petStage);
    this.nova = this.add
      .text(0, 0, `${stageEmoji} ${POSES[0]}`, txt(64, "#ffffff"))
      .setOrigin(0.5)
      .setDepth(100);
  }

  private drawButtons() {
    const T = this.t();
    this.poseBtn = this.add
      .text(0, 0, `🎭 ${T.pose}`, txt(20, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.changePose());
    this.snapBtn = this.add
      .text(0, 0, T.snap, txt(22, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.snap());
  }

  private changePose() {
    pop();
    this.poseIdx = (this.poseIdx + 1) % POSES.length;
    this.updateNovaText();
    this.tweens.add({ targets: this.nova, scale: 1.12, duration: 120, yoyo: true });
  }

  private updateNovaText() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    const stageEmoji = speciesEmoji(nova.species, nova.petStage);
    this.nova.setText(`${stageEmoji} ${POSES[this.poseIdx]}`);
  }

  private async snap() {
    if (this.status.getData("busy")) return;
    this.status.setData("busy", true);
    pop();
    win();
    this.status.setText(this.t().sharing);
    const T = this.t();
    try {
      // build a pet share card (reuses the exact share-card PNG path)
      const st = useKidStore.getState();
      const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
      const species = speciesById(nova.species);
      const name = this.lang === "bn" ? species.nameBn : species.name;
      const data: ShareCardData = {
        title: T.title,
        name,
        avatar: `${speciesEmoji(nova.species, nova.petStage)} ${POSES[this.poseIdx]}`,
        stars: nova.petStage,
        score: nova.affection,
        sessions: Math.max(1, nova.days.length),
        statsLabels: ["Growth", "Love", "Days"],
        worlds: [],
        worldsTitle: "",
        footer: "Numberverse 💛",
      };
      const canvas = renderShareCard(document.createElement("canvas"), data);
      const blob = await canvasToBlob(canvas);
      const caption = this.lang === "bn" ? "নোভার ছবি 📸" : "Nova's photo 📸";
      const res = await sharePng(blob, "numberverse-nova-photo.png", caption, waTextUrl(caption));
      if (res === "unsupported") {
        this.status.setText("…");
        return;
      }
      // once-per-day share reward (same loop as parent panel)
      const granted = useKidStore.getState().novaShareReward(this.kidId);
      if (granted) speak(T.shareReward);
      this.status.setText(res === "shared" ? T.share : T.again);
    } finally {
      this.time.delayedCall(1600, () => this.status.setData("busy", false));
    }
  }

  private layout() {
    if (!this.hint || !this.closeBtn || !this.nova) return;
    const T = this.t();
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.status.setPosition(this.scale.width / 2, 108 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.drawFrameBox();
    const { width, height } = this.scale;
    const fx = (width - Math.min(340, width - 40)) / 2;
    const fy = Math.max(150 + SAT(), height * 0.36 - Math.min(300, height * 0.42) / 2);
    this.nova.setPosition(fx + Math.min(340, width - 40) / 2, fy + Math.min(300, height * 0.42) / 2);
    this.poseBtn.setPosition(width / 2, height * 0.68);
    this.snapBtn.setPosition(width / 2, height * 0.76);
  }
}

import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop, win } from "./audio";
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
  NOVA_OUTFITS,
  speciesEmoji,
  type NovaOutfit,
} from "../store";

/**
 * 🎩 DRESS-UP NOVA — pet mini-game #613 (docs/plans/104-pet-minigames.md).
 *
 * Tap hats/scarves/glasses to dress Nova up. Cosmetic-only, no purchases or
 * unlocks — the kid plays with what they own (equip/unequip via novaEquip,
 * which persists to nova.outfit). Free-only items respect the 'no dark
 * patterns' principle. No coin.
 */



export class DressUpScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private hint!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;
  private nova!: Phaser.GameObjects.Text;
  private wearBadge!: Phaser.GameObjects.Text;

  private outfits: NovaOutfit[] = [];


  private get reduced(): boolean {
    return prefersReducedMotion();
  }
  constructor() {
    super("DressUp");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    gameBackground(this, "candy");
    this.drawHeader();
    this.drawNova();
    this.drawOutfits();
    onSceneResize(this, () => this.layout());
  }



  private drawHeader() {
    const T = tr;
    this.add
      .text(this.scale.width / 2, 30 + SAT(), T("dressUpTitle"), txt(30, "#ffffff", { bold: true }))
      .setOrigin(0.5);
    this.hint = this.add
      .text(this.scale.width / 2, 74 + SAT(), T("dressUpHint"), txt(16, NV_GOLD, { bold: true }))
      .setOrigin(0.5);
    this.status = this.add
      .text(this.scale.width / 2, 108 + SAT(), T("dressUpNone"), txt(18, "#ffffff", { bold: true }))
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
      .text(this.scale.width / 2, this.scale.height - 100 - SAB(), speciesEmoji(nova.species, nova.petStage), txt(120, "#ffffff"))
      .setOrigin(0.5, 1)
      .setDepth(100);
    this.wearBadge = this.add
      .text(this.scale.width / 2, this.scale.height - 230 - SAB(), "", txt(52, "#ffffff", { shadow: false }))
      .setOrigin(0.5)
      .setDepth(200);
  }

  private drawOutfits() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    // only owned outfits (free-to-play, no dark patterns)
    this.outfits = NOVA_OUTFITS.filter((o) => nova.owned.includes(o.id));
    this.renderOutfitRow();
    this.updateBadge();
  }

  private renderOutfitRow() {
    const existing = this.children.list.filter((c) => c.getData("outfit-btn"));
    existing.forEach((c) => c.destroy());
    const n = this.outfits.length;
    if (n === 0) return;
    const cols = Math.min(n, 4);
    const bw = Math.min(76, (this.scale.width - 40) / cols - 10);
    this.outfits.forEach((o, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = this.scale.width / 2 + (col - (cols - 1) / 2) * (bw + 12);
      const y = this.scale.height * 0.74 + row * (bw + 14);
      const label = this.lang === "bn" ? o.nameBn : o.name;
      const btn = this.add.container(x, y).setSize(bw, bw + 22).setData("outfit-btn", true).setDepth(100);
      btn.setInteractive({ useHandCursor: true });
      const emoji = this.add.text(0, -6, o.emoji, txt(38, "#ffffff", { shadow: false })).setOrigin(0.5);
      const name = this.add.text(0, 34, label, txt(11, "#ffffff", { bold: true, wrap: bw })).setOrigin(0.5);
      btn.add([emoji, name]);
      btn.on("pointerdown", () => this.tapOutfit(o, btn));
    });
  }

  private tapOutfit(o: NovaOutfit, btn: Phaser.GameObjects.Container) {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    // toggle equip/unequip
    if (nova.equipped === o.id) {
      useKidStore.getState().novaEquip(this.kidId, "none");
    } else {
      useKidStore.getState().novaEquip(this.kidId, o.id);
    }
    pop();
    win();
    speak(tr("dressUpEquipped"));
    this.updateBadge();
    if (!this.reduced) this.tweens.add({ targets: btn, scale: 0.92, duration: 90, yoyo: true });
  }

  private updateBadge() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    const wearing = NOVA_OUTFITS.find((o) => o.id === nova.equipped);
    if (wearing) {
      this.wearBadge.setText(wearing.emoji);
      this.status.setText(`${tr("dressUpWearing")}: ${this.lang === "bn" ? wearing.nameBn : wearing.name}`);
    } else {
      this.wearBadge.setText("");
      this.status.setText(tr("dressUpNone"));
    }
  }

  private layout() {
    if (!this.hint || !this.closeBtn || !this.nova) return;
    const T = tr;
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.status.setPosition(this.scale.width / 2, 108 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    this.nova.setPosition(this.scale.width / 2, this.scale.height - 100 - SAB());
    this.wearBadge.setPosition(this.scale.width / 2, this.scale.height - 230 - SAB());
    this.renderOutfitRow();
  }
}

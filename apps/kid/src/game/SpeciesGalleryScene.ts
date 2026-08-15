import Phaser from "phaser";
import { onSceneResize } from "./sceneLifecycle";
import { pop } from "./audio";
import { speak } from "./speech";
import { txt, NV_GOLD } from "./ui";
import { getAppLang } from "./locale";
import { gameBackground } from "./backgrounds";
import { SAT, SAB } from "./safeArea";
import {
  useKidStore,
  defaultNova,
  NOVA_SPECIES,
  speciesEmoji,
  speciesById,
} from "../store";

/**
 * 🐣 SPECIES GALLERY — pet mini-game #610 (docs/plans/104-pet-minigames.md).
 *
 * A gallery of each adopted species' egg→grown evolution; tapping a stage
 * plays its emoji + name. Locked species show a 🔒 silhouette. Empty (no
 * adopted pets) → friendly empty state. Feeds the Zookeeper badge. No coin.
 */

const T = {
  en: {
    title: "🐣 Species Gallery",
    hint: "Tap a stage to see your pet evolve!",
    adopted: "Adopted",
    locked: "Grows to unlock",
    empty: "Adopt a pet to see its evolution here!",
    close: "✕",
  },
  bn: {
    title: "🐣 প্রজাতির গ্যালারি",
    hint: "স্তরে ছুঁয়ে তোমার পোষা প্রাণীর বিবর্তন দেখো!",
    adopted: "অবলম্বিত",
    locked: "বড় করে আনলক করো",
    empty: "এখানে বিবর্তন দেখতে একটি পোষা প্রাণী নাও!",
    close: "✕",
  },
} as const;

export class SpeciesGalleryScene extends Phaser.Scene {
  private kidId = "";
  private onBack?: () => void;
  private lang: "en" | "bn" = "en";
  private hint!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private closeBtn!: Phaser.GameObjects.Text;

  constructor() {
    super("SpeciesGallery");
  }

  create(data: { kidId?: string; onBack?: () => void }) {
    this.kidId = data?.kidId ?? "";
    this.onBack = data?.onBack;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    gameBackground(this, "floral");
    this.drawHeader();
    this.drawGallery();
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
      .text(this.scale.width / 2, this.scale.height * 0.4, "", txt(20, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setDepth(900);
    this.closeBtn = this.add
      .text(26, 30 + SAT(), T.close, txt(24, "#ffffff", { bold: true }))
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.onBack?.());
  }

  private drawGallery() {
    const st = useKidStore.getState();
    const nova = this.kidId ? st.nova[this.kidId] ?? defaultNova() : defaultNova();
    const adopted = nova.adoptedPets ?? [];
    const owned = adopted.length > 0 || nova.species !== "owl" ? new Set([nova.species, ...adopted]) : new Set([nova.species]);
    if (owned.size === 0) {
      this.status.setText(this.t().empty);
      return;
    }
    const species = NOVA_SPECIES.filter((sp) => owned.has(sp.id));
    const cols = Math.min(species.length, 4);
    const bw = Math.min(150, (this.scale.width - 40) / cols - 12);
    species.forEach((sp, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = this.scale.width / 2 + (col - (cols - 1) / 2) * (bw + 12);
      const y = Math.max(168 + SAT(), this.scale.height * 0.42) + (row - 0.5) * 130;
      const label = this.lang === "bn" ? sp.nameBn : sp.name;
      const card = this.add.container(x, y).setSize(bw, 120).setDepth(100);
      card.setInteractive({ useHandCursor: true });
      // stage row: egg → hatchling → young → grown
      sp.stages.forEach((emoji, si) => {
        const sx = (si - 1.5) * 34;
        const e = this.add.text(sx, -20, emoji, txt(30, "#ffffff", { shadow: false })).setOrigin(0.5);
        e.setInteractive({ useHandCursor: true });
        e.on("pointerdown", () => {
          pop();
          speak(this.lang === "bn" ? sp.nameBn : sp.name);
          this.status.setText(`${label}: ${emoji}`);
        });
        card.add(e);
      });
      const name = this.add
        .text(0, 40, label, txt(18, "#ffffff", { bold: true }))
        .setOrigin(0.5);
      const tag = this.add
        .text(0, 64, sp.cost === 0 ? this.t().adopted : this.t().locked, txt(13, NV_GOLD, { bold: true }))
        .setOrigin(0.5);
      card.add([name, tag]);
    });
  }

  private layout() {
    if (!this.hint || !this.closeBtn) return;
    const T = this.t();
    this.hint.setPosition(this.scale.width / 2, 74 + SAT());
    this.closeBtn.setPosition(26, 30 + SAT());
    if (this.status) this.status.setPosition(this.scale.width / 2, this.scale.height * 0.4);
  }
}

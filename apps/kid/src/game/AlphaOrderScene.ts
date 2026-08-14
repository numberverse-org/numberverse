import Phaser from "phaser";
import { DragReorderScene, type DragReorderConfig, type DragReorderItem } from "./reorder";
import { ALPHA_ORDER_SETS } from "./englishLiteracy";

const SETS: Record<number, string[][]> = ALPHA_ORDER_SETS;

const CFG: DragReorderConfig = {
  gameId: "game-alphabet",
  titleKey: "titleAlpha",
  promptKey: "alPrompt",
  greatKey: "alGreat",
  doneKey: "alDone",
  background: "candy",
  rounds: 3,
  cardH: 72,
  speakLang: "en",
  dragScale: 1.1,
};

/**
 * Alphabetical order race (#185).
 * Band 1/2 reading: drag 4-6 word cards into ABC order. Every drop is checked
 * instantly — cards that sit in their correct slot glow green, and the round
 * wins the moment the whole row is home. 24 levelled word sets (8 × 4/5/6).
 * The shared DragReorderScene engine owns the drag/swap/check flow.
 */
export class AlphaOrderScene extends DragReorderScene {
  private lastSet: string[] = [];

  constructor() {
    super("AlphaOrder");
  }

  protected cfg(): DragReorderConfig {
    return CFG;
  }

  protected roundItems(): DragReorderItem[] {
    const ladder = this.ladder();
    const n = ladder[Math.min(this.levelIndex, ladder.length - 1)];
    const pool = SETS[n];
    let set = pool[Phaser.Math.Between(0, pool.length - 1)];
    if (set === this.lastSet) set = pool[(pool.indexOf(set) + 1) % pool.length];
    this.lastSet = set;
    const sorted = [...set].sort();
    return sorted.map((word) => ({ value: word, label: word }));
  }
}

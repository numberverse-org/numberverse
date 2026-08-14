import Phaser from "phaser";
import { DragReorderScene, type DragReorderConfig, type DragReorderItem } from "./reorder";

const CFG: DragReorderConfig = {
  gameId: "game-bndaysmonths",
  titleKey: "titleBdDays",
  promptKey: "bdPrompt",
  greatKey: "bdGreat",
  doneKey: "bdDone",
  background: "candy",
  rounds: 3,
  cardH: 72,
  speakLang: "bn",
  dragScale: 1.1,
  slotPreferredW: (m) => (m <= 5 ? 170 : 132),
  labelSize: (w) => (w < 80 ? 13 : 17),
};

/** The 7 days of the Bangla week, in order (Sunday → Saturday). */
const DAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
/** The 12 Bangla months in order (Boishakh → Chaitra). */
const MONTHS = [
  "বৈশাখ", "জ্যৈষ্ঠ", "আষাঢ়", "শ্রাবণ", "ভাদ্র", "আশ্বিন",
  "কার্তিক", "অগ্রহায়ণ", "পৌষ", "মাঘ", "ফাল্গুন", "চৈত্র",
];

/** Pick a run of n CONSECUTIVE items from a list, starting at a random index (no wrap). */
function pickRun(list: string[], n: number): string[] {
  const maxStart = list.length - n;
  const start = Phaser.Math.Between(0, maxStart);
  return list.slice(start, start + n);
}

/**
 * Days & Months order race (#43).
 * Band 1 calendar literacy: drag 4-7 day / month cards into the correct
 * calendar order. Every drop is checked instantly — cards in their correct
 * slot glow green, and the round wins when the whole row is home. Levels
 * 0-2 run the 7 days; levels 3+ run the 12 Bangla months (picked as a run so
 * kids learn sequence, not brute force).
 */
export class BanglaDaysScene extends DragReorderScene {
  private lastSet: string[] = [];

  constructor() {
    super("BanglaDays");
  }

  protected cfg(): DragReorderConfig {
    return CFG;
  }

  protected roundItems(): DragReorderItem[] {
    const ladder = this.ladder();
    const n = ladder[Math.min(this.levelIndex, ladder.length - 1)];
    // Levels 0-2 = days (≤7); levels 3+ = months (pick a run).
    const pool = this.levelIndex < 3 ? DAYS : MONTHS;
    const runLen = Math.min(n, pool.length);
    let set = pickRun(pool, runLen);
    // Avoid repeating the exact same run twice in a row.
    if (set.length === this.lastSet.length && set.every((w, i) => w === this.lastSet[i])) {
      set = pickRun(pool, runLen);
    }
    this.lastSet = set;
    return set.map((w) => ({ value: w, label: w }));
  }
}

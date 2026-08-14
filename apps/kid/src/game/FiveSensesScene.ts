import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  Rainbow: "seRainbow", Song: "seSong", Flower: "seFlower", Icecream: "seIcecream",
  Blanket: "seBlanket", Star: "seStar", Bell: "seBell", Soap: "seSoap",
  Candy: "seCandy", Sand: "seSand", Moon: "seMoon", Drum: "seDrum",
  Rose: "seRose", Lemon: "seLemon", Snow: "seSnow", Butterfly: "seButterfly",
  Thunder: "seThunder", Coffee: "seCoffee", Ball: "seBall", Bird: "seBird",
  Cloud: "seCloud", Chocolate: "seChocolate", Leaf: "seLeaf", Banana: "seBanana",
};

const CFG: BinSortConfig = {
  gameId: "game-senses",
  titleKey: "seTitle",
  promptKey: "seQ",
  greatKey: "seGreat",
  doneKey: "seDone",
  speakWrongKey: "seWrong",
  background: "floral",
  grid: 5,
  rounds: 3,
  bins: [
    { value: "see", key: "seSee", icon: "👁️", verdictKey: "seVerdictSee" },
    { value: "hear", key: "seHear", icon: "👂", verdictKey: "seVerdictHear" },
    { value: "smell", key: "seSmell", icon: "👃", verdictKey: "seVerdictSmell" },
    { value: "taste", key: "seTaste", icon: "👅", verdictKey: "seVerdictTaste" },
    { value: "touch", key: "seTouch", icon: "✋", verdictKey: "seVerdictTouch" },
  ],
  items: [
    // tier 1 — famous
    { id: "Rainbow", emoji: "🌈", value: "see", tier: 1 },
    { id: "Song", emoji: "🎵", value: "hear", tier: 1 },
    { id: "Flower", emoji: "🌸", value: "smell", tier: 1 },
    { id: "Icecream", emoji: "🍦", value: "taste", tier: 1 },
    { id: "Blanket", emoji: "🧶", value: "touch", tier: 1 },
    { id: "Star", emoji: "⭐", value: "see", tier: 1 },
    { id: "Bell", emoji: "🔔", value: "hear", tier: 1 },
    { id: "Soap", emoji: "🧼", value: "smell", tier: 1 },
    { id: "Candy", emoji: "🍬", value: "taste", tier: 1 },
    { id: "Sand", emoji: "🏖️", value: "touch", tier: 1 },
    // tier 2
    { id: "Moon", emoji: "🌙", value: "see", tier: 2 },
    { id: "Drum", emoji: "🥁", value: "hear", tier: 2 },
    { id: "Rose", emoji: "🌹", value: "smell", tier: 2 },
    { id: "Lemon", emoji: "🍋", value: "taste", tier: 2 },
    { id: "Snow", emoji: "⛄", value: "touch", tier: 2 },
    { id: "Butterfly", emoji: "🦋", value: "see", tier: 2 },
    { id: "Thunder", emoji: "⛈️", value: "hear", tier: 2 },
    { id: "Coffee", emoji: "☕", value: "smell", tier: 2 },
    // tier 3
    { id: "Ball", emoji: "⚽", value: "touch", tier: 3 },
    { id: "Bird", emoji: "🐦", value: "hear", tier: 3 },
    { id: "Cloud", emoji: "☁️", value: "see", tier: 3 },
    { id: "Chocolate", emoji: "🍫", value: "taste", tier: 3 },
    { id: "Leaf", emoji: "🍃", value: "touch", tier: 3 },
    { id: "Banana", emoji: "🍌", value: "taste", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Five senses (#71). A band-1 science sort: drag each picture into the sense
 * bin we use — see 👁️ / hear 👂 / smell 👃 / taste 👅 / touch ✋. Same items the
 * tap version already served, now on the shared BinSortScene drag engine so
 * sorting (the gentlest preschool interaction) reaches this skill too.
 */
export class FiveSensesScene extends BinSortScene {
  constructor() {
    super("FiveSenses");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}

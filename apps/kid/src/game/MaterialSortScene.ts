import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  Chair: "matChair", Pencil: "matPencil", Drum: "matDrum", Door: "matDoor",
  Ruler: "matRuler", Bed: "matBed", Boat: "matBoat", Bridge: "matBridge",
  Spoon: "matSpoon", Key: "matKey", Scissors: "matScissors", Pan: "matPan",
  Coin: "matCoin", Fork: "matFork", Bike: "matBike", Nail: "matNail",
  Bottle: "matBottle", Cup: "matCup", Bucket: "matBucket", Toy: "matToy",
  Toothbrush: "matToothbrush", Bag: "matBag", Kite: "matKite", Ball: "matBall",
  Jar: "matJar", Window: "matWindow", Mirror: "matMirror", Bulb: "matBulb",
  Vase: "matVase", Fishbowl: "matFishbowl", Drink: "matDrink", GBottle: "matGBottle",
};

const CFG: BinSortConfig = {
  gameId: "game-material",
  titleKey: "matTitle",
  promptKey: "matQ",
  greatKey: "matGreat",
  doneKey: "matDone",
  speakWrongKey: "matWrong",
  background: "kitchen",
  grid: 4,
  rounds: 3,
  // #1058 — the shared time ramp: each item has a shrinking countdown that
  // tightens as difficulty rises (4-bin material fluency pays). Generous floor
  // so the wider grid never gets an unfair window.
  timePerItemMs: [14000, 13000, 12000, 11000, 10000, 9000],
  bins: [
    { value: "wood", key: "matBinWood", icon: "🪵", verdictKey: "matVerdictWood" },
    { value: "metal", key: "matBinMetal", icon: "🔩", verdictKey: "matVerdictMetal" },
    { value: "plastic", key: "matBinPlastic", icon: "🧴", verdictKey: "matVerdictPlastic" },
    { value: "glass", key: "matBinGlass", icon: "🫙", verdictKey: "matVerdictGlass" },
  ],
  items: [
    // wood
    { id: "Chair", emoji: "🪑", value: "wood", tier: 1 },
    { id: "Pencil", emoji: "✏️", value: "wood", tier: 1 },
    { id: "Drum", emoji: "🥁", value: "wood", tier: 2 },
    { id: "Door", emoji: "🚪", value: "wood", tier: 2 },
    { id: "Ruler", emoji: "📏", value: "wood", tier: 2 },
    { id: "Bed", emoji: "🛏️", value: "wood", tier: 3 },
    { id: "Boat", emoji: "⛵", value: "wood", tier: 3 },
    { id: "Bridge", emoji: "🌉", value: "wood", tier: 3 },
    // metal
    { id: "Spoon", emoji: "🥄", value: "metal", tier: 1 },
    { id: "Key", emoji: "🔑", value: "metal", tier: 1 },
    { id: "Scissors", emoji: "✂️", value: "metal", tier: 2 },
    { id: "Pan", emoji: "🍳", value: "metal", tier: 2 },
    { id: "Coin", emoji: "🪙", value: "metal", tier: 2 },
    { id: "Fork", emoji: "🍴", value: "metal", tier: 3 },
    { id: "Bike", emoji: "🚲", value: "metal", tier: 3 },
    { id: "Nail", emoji: "📌", value: "metal", tier: 3 },
    // plastic
    { id: "Bottle", emoji: "🍼", value: "plastic", tier: 1 },
    { id: "Cup", emoji: "🥤", value: "plastic", tier: 1 },
    { id: "Bucket", emoji: "🪣", value: "plastic", tier: 2 },
    { id: "Toy", emoji: "🧸", value: "plastic", tier: 2 },
    { id: "Toothbrush", emoji: "🪥", value: "plastic", tier: 2 },
    { id: "Bag", emoji: "🎒", value: "plastic", tier: 3 },
    { id: "Kite", emoji: "🪁", value: "plastic", tier: 3 },
    { id: "Ball", emoji: "⚽", value: "plastic", tier: 3 },
    // glass
    { id: "Jar", emoji: "🫙", value: "glass", tier: 1 },
    { id: "Window", emoji: "🪟", value: "glass", tier: 1 },
    { id: "Mirror", emoji: "🪞", value: "glass", tier: 2 },
    { id: "Bulb", emoji: "💡", value: "glass", tier: 2 },
    { id: "Vase", emoji: "🏺", value: "glass", tier: 2 },
    { id: "Fishbowl", emoji: "🐠", value: "glass", tier: 3 },
    { id: "Drink", emoji: "🥛", value: "glass", tier: 3 },
    { id: "GBottle", emoji: "🍾", value: "glass", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Materials (#73). A band-2 science game sorting 32 household objects by what
 * they are made of — 🪵 wood, 🔩 metal, 🧴 plastic, 🫙 glass.
 */
export class MaterialSortScene extends BinSortScene {
  constructor() {
    super("MaterialSort");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}

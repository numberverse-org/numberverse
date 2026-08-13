import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  Tree: "livTree", Dog: "livDog", Bird: "livBird", Flower: "livFlower",
  Fish: "livFish", Butterfly: "livButterfly", Cat: "livCat", Grass: "livGrass",
  Rabbit: "livRabbit", Child: "livChild", Frog: "livFrog", Cow: "livCow",
  Ant: "livAnt", Sunflower: "livSunflower", Mushroom: "livMushroom", Crab: "livCrab",
  Bee: "livBee", Worm: "livWorm",
  Rock: "livRock", Chair: "livChair", Book: "livBook", Ball: "livBall",
  Car: "livCar", House: "livHouse", Pencil: "livPencil", Phone: "livPhone",
  Water: "livWater", Bed: "livBed", Spoon: "livSpoon", Bag: "livBag",
  Kite: "livKite", Clock: "livClock", Umbrella: "livUmbrella", Cup: "livCup",
  Toy: "livToy", Mirror: "livMirror",
};

const CFG: BinSortConfig = {
  gameId: "game-living",
  titleKey: "livTitle",
  promptKey: "livQ",
  greatKey: "livGreat",
  doneKey: "livDone",
  speakWrongKey: "livWrong",
  background: "forest",
  grid: 2,
  rounds: 3,
  bins: [
    { value: "living", key: "livBinLiving", icon: "🌱", verdictKey: "livVerdictLiving" },
    { value: "not", key: "livBinNot", icon: "🪨", verdictKey: "livVerdictNot" },
  ],
  items: [
    // living — tier 1 famous
    { id: "Tree", emoji: "🌳", value: "living", tier: 1 },
    { id: "Dog", emoji: "🐶", value: "living", tier: 1 },
    { id: "Bird", emoji: "🐦", value: "living", tier: 1 },
    { id: "Flower", emoji: "🌸", value: "living", tier: 1 },
    { id: "Fish", emoji: "🐟", value: "living", tier: 1 },
    { id: "Butterfly", emoji: "🦋", value: "living", tier: 1 },
    { id: "Cat", emoji: "🐱", value: "living", tier: 1 },
    { id: "Grass", emoji: "🌿", value: "living", tier: 1 },
    { id: "Rabbit", emoji: "🐰", value: "living", tier: 1 },
    { id: "Child", emoji: "🧒", value: "living", tier: 1 },
    // living — tier 2
    { id: "Frog", emoji: "🐸", value: "living", tier: 2 },
    { id: "Cow", emoji: "🐄", value: "living", tier: 2 },
    { id: "Ant", emoji: "🐜", value: "living", tier: 2 },
    { id: "Sunflower", emoji: "🌻", value: "living", tier: 2 },
    // living — tier 3
    { id: "Mushroom", emoji: "🍄", value: "living", tier: 3 },
    { id: "Crab", emoji: "🦀", value: "living", tier: 3 },
    { id: "Bee", emoji: "🐝", value: "living", tier: 3 },
    { id: "Worm", emoji: "🪱", value: "living", tier: 3 },
    // non-living — tier 1 famous
    { id: "Rock", emoji: "🪨", value: "not", tier: 1 },
    { id: "Chair", emoji: "🪑", value: "not", tier: 1 },
    { id: "Book", emoji: "📖", value: "not", tier: 1 },
    { id: "Ball", emoji: "⚽", value: "not", tier: 1 },
    { id: "Car", emoji: "🚗", value: "not", tier: 1 },
    { id: "House", emoji: "🏠", value: "not", tier: 1 },
    { id: "Pencil", emoji: "✏️", value: "not", tier: 1 },
    { id: "Phone", emoji: "📱", value: "not", tier: 1 },
    { id: "Water", emoji: "💧", value: "not", tier: 1 },
    { id: "Bed", emoji: "🛏️", value: "not", tier: 1 },
    // non-living — tier 2
    { id: "Spoon", emoji: "🥄", value: "not", tier: 2 },
    { id: "Bag", emoji: "🎒", value: "not", tier: 2 },
    { id: "Kite", emoji: "🪁", value: "not", tier: 2 },
    { id: "Clock", emoji: "⏰", value: "not", tier: 2 },
    // non-living — tier 3
    { id: "Umbrella", emoji: "☔", value: "not", tier: 3 },
    { id: "Cup", emoji: "🥤", value: "not", tier: 3 },
    { id: "Toy", emoji: "🧸", value: "not", tier: 3 },
    { id: "Mirror", emoji: "🪞", value: "not", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Living & non-living (#68). A band-1 science sort: drag each picture into
 * the 🌱 living or 🪨 non-living bin. Speaks every name + verdict in EN/BN.
 */
export class LivingSortScene extends BinSortScene {
  constructor() {
    super("LivingSort");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}

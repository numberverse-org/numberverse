import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  Rose: "paRose", Tree: "paTree", Flower: "paFlower", Grass: "paGrass",
  Sunflower: "paSunflower", Broccoli: "paBroccoli", Cactus: "paCactus",
  Clover: "paClover", Palm: "paPalm", Dog: "paDog", Cat: "paCat",
  Fish: "paFish", Bird: "paBird", Butterfly: "paButterfly", Cow: "paCow",
  Frog: "paFrog", Crab: "paCrab",
};

const CFG: BinSortConfig = {
  gameId: "game-plantanimal",
  titleKey: "paTitle",
  promptKey: "paQ",
  greatKey: "paGreat",
  doneKey: "paDone",
  speakWrongKey: "paWrong",
  background: "forest",
  grid: 2,
  rounds: 3,
  bins: [
    { value: "plant", key: "paPlant", icon: "🌱", verdictKey: "paVerdictPlant" },
    { value: "animal", key: "paAnimal", icon: "🐾", verdictKey: "paVerdictAnimal" },
  ],
  items: [
    // plants
    { id: "Rose", emoji: "🌹", value: "plant", tier: 1 },
    { id: "Tree", emoji: "🌳", value: "plant", tier: 1 },
    { id: "Flower", emoji: "🌸", value: "plant", tier: 1 },
    { id: "Grass", emoji: "🌿", value: "plant", tier: 1 },
    { id: "Sunflower", emoji: "🌻", value: "plant", tier: 2 },
    { id: "Broccoli", emoji: "🥦", value: "plant", tier: 2 },
    { id: "Cactus", emoji: "🌵", value: "plant", tier: 3 },
    { id: "Clover", emoji: "🍀", value: "plant", tier: 3 },
    { id: "Palm", emoji: "🌴", value: "plant", tier: 3 },
    // animals
    { id: "Dog", emoji: "🐶", value: "animal", tier: 1 },
    { id: "Cat", emoji: "🐱", value: "animal", tier: 1 },
    { id: "Fish", emoji: "🐟", value: "animal", tier: 1 },
    { id: "Bird", emoji: "🐦", value: "animal", tier: 1 },
    { id: "Butterfly", emoji: "🦋", value: "animal", tier: 2 },
    { id: "Cow", emoji: "🐄", value: "animal", tier: 2 },
    { id: "Frog", emoji: "🐸", value: "animal", tier: 3 },
    { id: "Crab", emoji: "🦀", value: "animal", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Plant or animal? (#1145). A band-1 science sort: drag living things into the
 * 🌱 plant bin or the 🐾 animal bin. Fills the science sorting slot beside
 * LivingSort (living/non-living) without duplicating that skill.
 */
export class PlantAnimalSortScene extends BinSortScene {
  constructor() {
    super("PlantAnimalSort");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}

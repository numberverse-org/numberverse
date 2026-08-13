import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  Apple: "fosApple", Banana: "fosBanana", Rice: "fosRice", Carrot: "fosCarrot",
  Mango: "fosMango", Bread: "fosBread", Potato: "fosPotato", Tomato: "fosTomato",
  Grapes: "fosGrapes", Corn: "fosCorn", Orange: "fosOrange", Coconut: "fosCoconut",
  Spinach: "fosSpinach", Lemon: "fosLemon", Onion: "fosOnion", Watermelon: "fosWatermelon",
  Egg: "fosEgg", Milk: "fosMilk", Fish: "fosFish", Chicken: "fosChicken",
  Honey: "fosHoney", Cheese: "fosCheese", Beef: "fosBeef", Butter: "fosButter",
  Prawn: "fosPrawn", Curd: "fosCurd", Sausage: "fosSausage", Crab: "fosCrab",
};

const CFG: BinSortConfig = {
  gameId: "game-foodsource",
  titleKey: "fosTitle",
  promptKey: "fosQ",
  greatKey: "fosGreat",
  doneKey: "fosDone",
  speakWrongKey: "fosWrong",
  background: "kitchen",
  grid: 2,
  rounds: 3,
  bins: [
    { value: "plant", key: "fosBinPlant", icon: "🌱", verdictKey: "fosVerdictPlant" },
    { value: "animal", key: "fosBinAnimal", icon: "🐄", verdictKey: "fosVerdictAnimal" },
  ],
  items: [
    // from plants
    { id: "Apple", emoji: "🍎", value: "plant", tier: 1 },
    { id: "Banana", emoji: "🍌", value: "plant", tier: 1 },
    { id: "Rice", emoji: "🍚", value: "plant", tier: 1 },
    { id: "Carrot", emoji: "🥕", value: "plant", tier: 1 },
    { id: "Mango", emoji: "🥭", value: "plant", tier: 1 },
    { id: "Bread", emoji: "🍞", value: "plant", tier: 1 },
    { id: "Potato", emoji: "🥔", value: "plant", tier: 2 },
    { id: "Tomato", emoji: "🍅", value: "plant", tier: 2 },
    { id: "Grapes", emoji: "🍇", value: "plant", tier: 2 },
    { id: "Corn", emoji: "🌽", value: "plant", tier: 2 },
    { id: "Orange", emoji: "🍊", value: "plant", tier: 2 },
    { id: "Coconut", emoji: "🥥", value: "plant", tier: 2 },
    { id: "Spinach", emoji: "🥬", value: "plant", tier: 3 },
    { id: "Lemon", emoji: "🍋", value: "plant", tier: 3 },
    { id: "Onion", emoji: "🧅", value: "plant", tier: 3 },
    { id: "Watermelon", emoji: "🍉", value: "plant", tier: 3 },
    // from animals
    { id: "Egg", emoji: "🥚", value: "animal", tier: 1 },
    { id: "Milk", emoji: "🥛", value: "animal", tier: 1 },
    { id: "Fish", emoji: "🐟", value: "animal", tier: 1 },
    { id: "Chicken", emoji: "🍗", value: "animal", tier: 1 },
    { id: "Honey", emoji: "🍯", value: "animal", tier: 1 },
    { id: "Cheese", emoji: "🧀", value: "animal", tier: 1 },
    { id: "Beef", emoji: "🥩", value: "animal", tier: 2 },
    { id: "Butter", emoji: "🧈", value: "animal", tier: 2 },
    { id: "Prawn", emoji: "🦐", value: "animal", tier: 2 },
    { id: "Curd", emoji: "🥣", value: "animal", tier: 2 },
    { id: "Sausage", emoji: "🌭", value: "animal", tier: 3 },
    { id: "Crab", emoji: "🦀", value: "animal", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Food sources (#72). A band-2 science game sorting foods by where they come
 * from — 🌱 plants or 🐄 animals. 28 food cards, tiered pool, EN/BN speech.
 */
export class FoodSourceScene extends BinSortScene {
  constructor() {
    super("FoodSource");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}

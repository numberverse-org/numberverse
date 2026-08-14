import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  Ice: "smIce", Stone: "smStone", Chair: "smChair", Spoon: "smSpoon", Brick: "smBrick",
  Water: "smWater", Milk: "smMilk", Juice: "smJuice", Rain: "smRain", Oil: "smOil",
  Steam: "smSteam", Air: "smAir", Smoke: "smSmoke", Oxygen: "smOxygen",
  Light: "smLight", Sound: "smSound", Heat: "smHeat", Shadow: "smShadow",
};

const CFG: BinSortConfig = {
  gameId: "game-statematter",
  titleKey: "smTitle",
  promptKey: "smQ",
  greatKey: "smGreat",
  doneKey: "smDone",
  speakWrongKey: "smWrong",
  background: "sunset",
  grid: 4,
  rounds: 3,
  bins: [
    { value: "solid", key: "smBinSolid", icon: "🧊", verdictKey: "smVerdictSolid" },
    { value: "liquid", key: "smBinLiquid", icon: "💧", verdictKey: "smVerdictLiquid" },
    { value: "gas", key: "smBinGas", icon: "💨", verdictKey: "smVerdictGas" },
    { value: "not", key: "smBinNot", icon: "✨", verdictKey: "smVerdictNot" },
  ],
  items: [
    { id: "Ice", emoji: "🧊", value: "solid", tier: 1 },
    { id: "Stone", emoji: "🪨", value: "solid", tier: 1 },
    { id: "Chair", emoji: "🪑", value: "solid", tier: 2 },
    { id: "Spoon", emoji: "🥄", value: "solid", tier: 2 },
    { id: "Brick", emoji: "🧱", value: "solid", tier: 3 },
    { id: "Water", emoji: "💧", value: "liquid", tier: 1 },
    { id: "Milk", emoji: "🥛", value: "liquid", tier: 1 },
    { id: "Juice", emoji: "🧃", value: "liquid", tier: 2 },
    { id: "Rain", emoji: "🌧️", value: "liquid", tier: 2 },
    { id: "Oil", emoji: "🛢️", value: "liquid", tier: 3 },
    { id: "Steam", emoji: "♨️", value: "gas", tier: 1 },
    { id: "Air", emoji: "🎈", value: "gas", tier: 1 },
    { id: "Smoke", emoji: "💨", value: "gas", tier: 2 },
    { id: "Oxygen", emoji: "🌬️", value: "gas", tier: 3 },
    { id: "Light", emoji: "💡", value: "not", tier: 1 },
    { id: "Sound", emoji: "🔊", value: "not", tier: 2 },
    { id: "Heat", emoji: "🔥", value: "not", tier: 2 },
    { id: "Shadow", emoji: "🌚", value: "not", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * States of matter (#761). A band-5 science skill: sort everyday objects into
 * 🧊 solid, 💧 liquid, 💨 gas — and the trick bin ✨ not-matter at all (light,
 * sound, heat are NOT matter), which teaches the concept, not just labels.
 */
export class StatesMatterScene extends BinSortScene {
  constructor() {
    super("StatesMatter");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}

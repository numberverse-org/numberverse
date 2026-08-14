import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  PantaBhat: "fcPantaBhat", HilsaFish: "fcHilsaFish", Alpana: "fcAlpana", NewYear: "fcNewYear",
  NakshiKantha: "fcNakshiKantha", Shobhajatra: "fcShobhajatra", BasantiClothes: "fcBasantiClothes",
  BoishakhiFlowers: "fcBoishakhiFlowers", Semai: "fcSemai", NewClothes: "fcNewClothes",
  Eidi: "fcEidi", Sweets: "fcSweets", EidCard: "fcEidCard", NewShoes: "fcNewShoes",
  Khichuri: "fcKhichuri", Henna: "fcHenna",
};

const CFG: BinSortConfig = {
  gameId: "game-festivals",
  titleKey: "titleFestivals",
  promptKey: "fcQ",
  greatKey: "fcGreat",
  doneKey: "fcDone",
  speakWrongKey: "fcWrong",
  background: "sunset",
  grid: 2,
  rounds: 3,
  bins: [
    { value: "boishakh", key: "fcBoishakh", icon: "🎉", verdictKey: "fcVerdictBoishakh" },
    { value: "eid", key: "fcEid", icon: "🎊", verdictKey: "fcVerdictEid" },
  ],
  items: [
    // Pohela Boishakh
    { id: "PantaBhat", emoji: "🍚", value: "boishakh", tier: 1 },
    { id: "HilsaFish", emoji: "🐟", value: "boishakh", tier: 1 },
    { id: "Alpana", emoji: "🎨", value: "boishakh", tier: 1 },
    { id: "NewYear", emoji: "🗓️", value: "boishakh", tier: 1 },
    { id: "NakshiKantha", emoji: "🧵", value: "boishakh", tier: 2 },
    { id: "Shobhajatra", emoji: "🎭", value: "boishakh", tier: 2 },
    { id: "BasantiClothes", emoji: "👕", value: "boishakh", tier: 2 },
    { id: "BoishakhiFlowers", emoji: "🌷", value: "boishakh", tier: 2 },
    // Eid
    { id: "Semai", emoji: "🍜", value: "eid", tier: 1 },
    { id: "NewClothes", emoji: "👔", value: "eid", tier: 1 },
    { id: "Eidi", emoji: "💵", value: "eid", tier: 1 },
    { id: "Sweets", emoji: "🍬", value: "eid", tier: 1 },
    { id: "EidCard", emoji: "💌", value: "eid", tier: 2 },
    { id: "NewShoes", emoji: "👟", value: "eid", tier: 2 },
    { id: "Khichuri", emoji: "🍛", value: "eid", tier: 2 },
    { id: "Henna", emoji: "🌿", value: "eid", tier: 2 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Our festivals (#213). A band-2 civic game sorting gentle cultural customs
 * into two festival bins — Pohela Boishakh 🎉 and Eid 🎊. The kid drags each
 * item into the matching bin; correct drops land with a spoken "{name} for
 * {festival}", wrong drops shake red + name the right bin. All 16 items are
 * everyday, non-religious-adjacent customs (food, clothes, cards, henna).
 * Bangla + English labels everywhere (i18n). Config-driven via the shared
 * BinSortScene base (#1173) — same engine, zero duplicate game code.
 */
export class FestivalSortScene extends BinSortScene {
  constructor() {
    super("FestivalSort");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}

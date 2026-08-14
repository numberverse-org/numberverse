import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  One: "oeSortOne", Two: "oeSortTwo", Three: "oeSortThree", Four: "oeSortFour",
  Five: "oeSortFive", Six: "oeSortSix", Seven: "oeSortSeven", Eight: "oeSortEight",
  Nine: "oeSortNine", Ten: "oeSortTen", Eleven: "oeSortEleven", Twelve: "oeSortTwelve",
};

const CFG: BinSortConfig = {
  gameId: "game-oddevensort",
  titleKey: "oeSortTitle",
  promptKey: "oeSortQ",
  greatKey: "oeSortGreat",
  doneKey: "oeSortDone",
  speakWrongKey: "oeSortWrong",
  background: "candy",
  grid: 2,
  rounds: 3,
  bins: [
    { value: "odd", key: "oeSortOdd", icon: "🦉", verdictKey: "oeSortVerdictOdd" },
    { value: "even", key: "oeSortEven", icon: "🥚", verdictKey: "oeSortVerdictEven" },
  ],
  items: [
    { id: "One", emoji: "1️⃣", value: "odd", tier: 1 },
    { id: "Two", emoji: "2️⃣", value: "even", tier: 1 },
    { id: "Three", emoji: "3️⃣", value: "odd", tier: 1 },
    { id: "Four", emoji: "4️⃣", value: "even", tier: 1 },
    { id: "Five", emoji: "5️⃣", value: "odd", tier: 1 },
    { id: "Six", emoji: "6️⃣", value: "even", tier: 2 },
    { id: "Seven", emoji: "7️⃣", value: "odd", tier: 2 },
    { id: "Eight", emoji: "8️⃣", value: "even", tier: 2 },
    { id: "Nine", emoji: "9️⃣", value: "odd", tier: 3 },
    { id: "Ten", emoji: "🔟", value: "even", tier: 3 },
    { id: "Eleven", emoji: "11", value: "odd", tier: 3 },
    { id: "Twelve", emoji: "12", value: "even", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Odd & even sort (#1145). A band-1 math drag game: sort number cards into the
 * odd 🦉 or even 🥚 bin. The shared BinSortScene engine gives the earliest band
 * the same gentle drag-and-drop interaction as the other classification games.
 */
export class OddEvenSortScene extends BinSortScene {
  constructor() {
    super("OddEvenSort");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}

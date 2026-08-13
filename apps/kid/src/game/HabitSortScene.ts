import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  Brush: "hbBrush", WashHands: "hbWashHands", Share: "hbShare", Sleep: "hbSleep",
  Exercise: "hbExercise", EatFruit: "hbEatFruit", SayPlease: "hbSayPlease",
  DrinkWater: "hbDrinkWater", ThankYou: "hbThankYou", NeatRoom: "hbNeatRoom",
  CoverMouth: "hbCoverMouth", CombHair: "hbCombHair",
  ThrowFood: "hbThrowFood", Shout: "hbShout", Hit: "hbHit", Litter: "hbLitter",
  SkipBath: "hbSkipBath", BiteNails: "hbBiteNails", EatTooMuch: "hbEatTooMuch",
  KeepMuddy: "hbKeepMuddy",
};

const CFG: BinSortConfig = {
  gameId: "game-habits",
  titleKey: "hbTitle",
  promptKey: "hbQ",
  greatKey: "hbGreat",
  doneKey: "hbDone",
  speakWrongKey: "hbWrong",
  background: "candy",
  grid: 2,
  rounds: 3,
  bins: [
    { value: "good", key: "hbBinGood", icon: "🌟", verdictKey: "hbVerdictGood" },
    { value: "not", key: "hbBinNot", icon: "🙈", verdictKey: "hbVerdictNot" },
  ],
  items: [
    { id: "Brush", emoji: "🪥", value: "good", tier: 1 },
    { id: "WashHands", emoji: "🧼", value: "good", tier: 1 },
    { id: "Share", emoji: "🤝", value: "good", tier: 1 },
    { id: "Sleep", emoji: "😴", value: "good", tier: 1 },
    { id: "Exercise", emoji: "🤸", value: "good", tier: 2 },
    { id: "EatFruit", emoji: "🍎", value: "good", tier: 2 },
    { id: "SayPlease", emoji: "🙏", value: "good", tier: 2 },
    { id: "DrinkWater", emoji: "💧", value: "good", tier: 2 },
    { id: "ThankYou", emoji: "💐", value: "good", tier: 3 },
    { id: "NeatRoom", emoji: "🛏️", value: "good", tier: 3 },
    { id: "CoverMouth", emoji: "😷", value: "good", tier: 3 },
    { id: "CombHair", emoji: "💇", value: "good", tier: 3 },
    { id: "ThrowFood", emoji: "🍽️", value: "not", tier: 1 },
    { id: "Shout", emoji: "📢", value: "not", tier: 1 },
    { id: "Hit", emoji: "👊", value: "not", tier: 2 },
    { id: "Litter", emoji: "🗑️", value: "not", tier: 2 },
    { id: "SkipBath", emoji: "🚿", value: "not", tier: 2 },
    { id: "BiteNails", emoji: "🦷", value: "not", tier: 3 },
    { id: "EatTooMuch", emoji: "🍰", value: "not", tier: 3 },
    { id: "KeepMuddy", emoji: "🥾", value: "not", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Good habits & hygiene (#77). A band-1 BGS values game sorting healthy habits
 * (brush 🪥, wash hands 🧼, share 🤝…) into 🌟 good or 🙈 not-good bins. Gentle
 * encouragement only — no shaming, wrong drops flash the right bin green.
 */
export class HabitSortScene extends BinSortScene {
  constructor() {
    super("HabitSort");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}

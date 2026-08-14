import { BinSortScene, type BinSortConfig } from "./binSort";

/** i18n name keys — double-quoted camelCase literals the audit scanner sees. */
const NAME_KEY: Record<string, string> = {
  Sunscreen: "wsSunscreen", Watermelon: "wsWatermelon", Tshirt: "wsTshirt",
  Sunglasses: "wsSunglasses", BeachUmbrella: "wsBeachUmbrella", Umbrella: "wsUmbrella",
  Raincoat: "wsRaincoat", Rainboots: "wsRainboots", Rainbow: "wsRainbow",
  Raincloud: "wsRaincloud", Scarf: "wsScarf", Gloves: "wsGloves", Snowman: "wsSnowman",
  Cocoa: "wsCocoa", Woolsocks: "wsWoolsocks", Flower: "wsFlower", Kite: "wsKite",
  Butterfly: "wsButterfly", Chick: "wsChick", Seedling: "wsSeedling",
};

const CFG: BinSortConfig = {
  gameId: "game-seasons",
  titleKey: "titleSeasons",
  promptKey: "wsQ",
  greatKey: "wsGreat",
  doneKey: "wsDone",
  speakWrongKey: "wsWrong",
  background: "sky",
  grid: 4,
  rounds: 3,
  bins: [
    { value: "summer", key: "wsSummer", icon: "☀️", verdictKey: "wsVerdictSummer" },
    { value: "rainy", key: "wsRainy", icon: "🌧️", verdictKey: "wsVerdictRainy" },
    { value: "winter", key: "wsWinter", icon: "❄️", verdictKey: "wsVerdictWinter" },
    { value: "spring", key: "wsSpring", icon: "🌸", verdictKey: "wsVerdictSpring" },
  ],
  items: [
    // summer
    { id: "Sunscreen", emoji: "🧴", value: "summer", tier: 1 },
    { id: "Watermelon", emoji: "🍉", value: "summer", tier: 1 },
    { id: "Tshirt", emoji: "👕", value: "summer", tier: 1 },
    { id: "Sunglasses", emoji: "🕶️", value: "summer", tier: 2 },
    { id: "BeachUmbrella", emoji: "⛱️", value: "summer", tier: 3 },
    // rainy
    { id: "Umbrella", emoji: "☂️", value: "rainy", tier: 1 },
    { id: "Raincoat", emoji: "🧥", value: "rainy", tier: 1 },
    { id: "Rainboots", emoji: "🥾", value: "rainy", tier: 2 },
    { id: "Rainbow", emoji: "🌈", value: "rainy", tier: 2 },
    { id: "Raincloud", emoji: "🌧️", value: "rainy", tier: 3 },
    // winter
    { id: "Scarf", emoji: "🧣", value: "winter", tier: 1 },
    { id: "Gloves", emoji: "🧤", value: "winter", tier: 1 },
    { id: "Snowman", emoji: "⛄", value: "winter", tier: 2 },
    { id: "Cocoa", emoji: "☕", value: "winter", tier: 2 },
    { id: "Woolsocks", emoji: "🧦", value: "winter", tier: 3 },
    // spring
    { id: "Flower", emoji: "🌸", value: "spring", tier: 1 },
    { id: "Kite", emoji: "🪁", value: "spring", tier: 1 },
    { id: "Butterfly", emoji: "🦋", value: "spring", tier: 2 },
    { id: "Chick", emoji: "🐣", value: "spring", tier: 2 },
    { id: "Seedling", emoji: "🌱", value: "spring", tier: 3 },
  ],
  nameKeys: NAME_KEY,
};

/**
 * Weather & seasons (#206). A band-1 science game sorting clothes & activities
 * into the four seasons — Summer ☀️ / Rainy 🌧️ / Winter ❄️ / Spring 🌸. The kid
 * drags each item into the matching season bin; correct drops land with a
 * spoken "{name} for {season}", wrong drops shake red + name the right bin.
 * Bangla + English labels everywhere (i18n). Config-driven via the shared
 * BinSortScene base (#1173) — same engine, zero duplicate game code.
 */
export class WeatherSeasonsScene extends BinSortScene {
  constructor() {
    super("WeatherSeasons");
  }
  protected cfg(): BinSortConfig {
    return CFG;
  }
}

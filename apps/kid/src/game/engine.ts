/**
 * The Phaser ENGINE + every game scene — a DYNAMIC chunk (issue #15).
 *
 * Imported only from gameHost.boot() the first time a canvas screen appears
 * (playing / nova / garden), so the MAIN bundle carries zero Phaser bytes:
 * ~2MB → ~500KB first paint, with the engine fetched as a parallel chunk that
 * workbox precaches (offline stays warm).
 *
 * createGame() is the config that used to live in App.tsx's boot effect,
 * moved verbatim so the game boots identically.
 */
import Phaser from "phaser";
import { OddEvenScene } from "./OddEvenScene";
import { CountPopScene } from "./CountPopScene";
import { Count100Scene } from "./Count100Scene";
import { Build999Scene } from "./Build999Scene";
import { FruitAddScene } from "./FruitAddScene";
import { BnLettersScene } from "./BnLettersScene";
import { BnNumbersScene } from "./BnNumbersScene";
import { ShapeCatcherScene } from "./ShapeCatcherScene";
import { EnLettersScene } from "./EnLettersScene";
import { NumberBondsScene } from "./NumberBondsScene";
import { RocketMultScene } from "./RocketMultScene";
import { TimesTableScene } from "./TimesTableScene";
import { PizzaFracScene } from "./PizzaFracScene";
import { BnWordsScene } from "./BnWordsScene";
import { CvcScene } from "./CvcScene";
import { DivisionFactsScene } from "./DivisionFactsScene";
import { FairShareScene } from "./FairShareScene";
import { FractionMatchScene } from "./FractionMatchScene";
import { PlaceValueScene } from "./PlaceValueScene";
import { RoundingScene } from "./RoundingScene";
import { BarChartScene } from "./BarChartScene";
import { SinkFloatScene } from "./SinkFloatScene";
import { FoodChainScene } from "./FoodChainScene";
import { DayNightScene } from "./DayNightScene";
import { CatchBugScene } from "./CatchBugScene";
import { VillageCityScene } from "./VillageCityScene";
import { PatienceScene } from "./PatienceScene";
import { ConjunctFindScene } from "./ConjunctFindScene";
import { BnSightWordsScene } from "./BnSightWordsScene";
import { SentenceBuilderScene } from "./SentenceBuilderScene";
import { StoryReadScene } from "./StoryReadScene";
import { RhymeTimeScene } from "./RhymeTimeScene";
import { WordPairsScene } from "./WordPairsScene";
import { PunctScene } from "./PunctScene";
import { CompoundScene } from "./CompoundScene";
import { LetterSoundScene } from "./LetterSoundScene";
import { MatraMatrixScene } from "./MatraMatrixScene";
import { ReadStoryScene } from "./ReadStoryScene";
import { NumberWordsScene } from "./NumberWordsScene";
import { CoinValueScene } from "./CoinValueScene";
import { TimeWordsScene } from "./TimeWordsScene";
import { DirectionWordsScene } from "./DirectionWordsScene";
import { PoliteScene } from "./PoliteScene";
import { RiddleScene } from "./RiddleScene";
import { RControlledScene } from "./RControlledScene";
import { MagicEScene } from "./MagicEScene";
import { ContractsScene } from "./ContractsScene";
import { CompareScene } from "./CompareScene";
import { PrepositionsScene } from "./PrepositionsScene";
import { QuestionWordsScene } from "./QuestionWordsScene";
import { StoryScene } from "./StoryScene";
import { CompoundEnScene } from "./CompoundEnScene";
import { ReadAloudScene } from "./ReadAloudScene";
import { AlphaOrderScene } from "./AlphaOrderScene";
import { WordFamilyScene } from "./WordFamilyScene";
import { YesNoScene } from "./YesNoScene";
import { BnMatrasScene } from "./BnMatrasScene";
import { SightWordsScene } from "./SightWordsScene";
import { AnimalHomeScene } from "./AnimalHomeScene";
import { DecimalsScene } from "./DecimalsScene";
import { PercentScene } from "./PercentScene";
import { AreaPerimScene } from "./AreaPerimScene";
import { BnSentenceScene } from "./BnSentenceScene";
import { GrammarScene } from "./GrammarScene";
import { BgsFactsScene } from "./BgsFactsScene";
import { BnColorsScene } from "./BnColorsScene";
import { BdMoneyScene } from "./BdMoneyScene";
import { EnPhonicsScene } from "./EnPhonicsScene";
import { AddSub100Scene } from "./AddSub100Scene";
import { RegroupScene } from "./RegroupScene";
import { NovaScene } from "./NovaScene";
import { GrowCountScene } from "./GrowCountScene";
import { FruitTreeScene } from "./FruitTreeScene";
import { GardenScene } from "./GardenScene";
import { FrogHopScene } from "./FrogHopScene";
import { MemoryPairsScene } from "./MemoryPairsScene";
import { BalloonPopScene } from "./BalloonPopScene";
import { FactsAddScene } from "./FactsAddScene";
import { SubFactsScene } from "./SubFactsScene";
import { DoublesScene } from "./DoublesScene";
import { MakeTenScene } from "./MakeTenScene";
import { AddRegroupScene } from "./AddRegroupScene";
import { SubBorrowScene } from "./SubBorrowScene";
import { ArrayMultScene } from "./ArrayMultScene";
import { ShareRemScene } from "./ShareRemScene";
import { ClockTimeScene } from "./ClockTimeScene";
import { BalanceScene } from "./BalanceScene";
import { CountingSongScene } from "./CountingSongScene";
import { ensureAssets } from "./svgAssets";

/**
 * No-op boot scene. Phaser auto-starts the FIRST scene in the `scene:` array on
 * boot WITHOUT any data. If that first scene is a real game (e.g. CountPop), it
 * runs standalone with an undefined onRoundDone and never reports back to React.
 * Putting a blank scene first means every real game is started explicitly via
 * `game.scene.start(key, {startLevelIndex, mode, onRoundDone})`.
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }
  create() {
    // Kick off the SVG → canvas texture loads the moment the game boots, so
    // lessons are already using crisp vector art (no first-round emoji flash).
    ensureAssets(this);
  }
}

/** Create + boot the Phaser game. Mirrors the config previously in App.tsx. */
export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#0b2545",
    scene: [
      BootScene,
      NovaScene,
      GardenScene,
      GrowCountScene, FruitTreeScene,
      OddEvenScene, CountPopScene, Count100Scene, Build999Scene, FruitAddScene, BnLettersScene, BnNumbersScene, ShapeCatcherScene, EnLettersScene, NumberBondsScene,
      RocketMultScene, TimesTableScene, PizzaFracScene, BnWordsScene, CvcScene, DivisionFactsScene, FairShareScene, FractionMatchScene,
      PlaceValueScene, RoundingScene, BarChartScene, BnMatrasScene, SightWordsScene, AnimalHomeScene, DecimalsScene, PercentScene,
      AreaPerimScene, BnSentenceScene, GrammarScene, BgsFactsScene, BnColorsScene, EnPhonicsScene,
      BdMoneyScene,
      AddSub100Scene, RegroupScene,
      FrogHopScene, MemoryPairsScene, BalloonPopScene, FactsAddScene, SubFactsScene, DoublesScene, MakeTenScene, AddRegroupScene, SubBorrowScene, ArrayMultScene, ShareRemScene, ClockTimeScene, BalanceScene,
      SinkFloatScene, FoodChainScene, DayNightScene, CatchBugScene, VillageCityScene, PatienceScene,
      ConjunctFindScene,
      BnSightWordsScene,
      SentenceBuilderScene,
      StoryReadScene,
      RhymeTimeScene,
      WordPairsScene,
      PunctScene,
      CompoundScene,
      LetterSoundScene,
      MatraMatrixScene,
      ReadStoryScene,
      NumberWordsScene,
      CoinValueScene,
      TimeWordsScene,
      DirectionWordsScene,
      PoliteScene,
      RiddleScene,
      RControlledScene,
      MagicEScene,
      ContractsScene,
      CompareScene,
      PrepositionsScene,
      QuestionWordsScene,
      StoryScene,
      CompoundEnScene,
      ReadAloudScene,
      AlphaOrderScene,
      WordFamilyScene,
      YesNoScene,
      CountingSongScene,
    ],
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    input: { activePointers: 3 },
  });
}

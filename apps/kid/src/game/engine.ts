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
import { BanglaDaysScene } from "./BanglaDaysScene";
import { BanglaSpellScene } from "./BanglaSpellScene";
import { PronounScene } from "./PronounScene";
import { CountBackScene } from "./CountBackScene";
import { PluralsScene } from "./PluralsScene";
import { PastEdScene } from "./PastEdScene";
import { CaseMatchScene } from "./CaseMatchScene";
import { CvcBuildScene } from "./CvcBuildScene";
import { CompareFracScene } from "./CompareFracScene";
import { ShapePartsScene } from "./ShapePartsScene";
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
import { ExploreGardenScene } from "./ExploreGardenScene";
import { PetFeedScene } from "./PetFeedScene";
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
import { FracSetScene } from "./FracSetScene";
import { MixedFracScene } from "./MixedFracScene";
import { DecTenthsScene } from "./DecTenthsScene";
import { MakeChangeScene } from "./MakeChangeScene";
import { ElapsedTimeScene } from "./ElapsedTimeScene";
import { PerimFenceScene } from "./PerimFenceScene";
import { SolidMatchScene } from "./SolidMatchScene";
import { SymmetryMirrorScene } from "./SymmetryMirrorScene";
import { AnimalsMoveScene } from "./AnimalsMoveScene";
import { LivingSortScene } from "./LivingSortScene";
import { PlantPartsScene } from "./PlantPartsScene";
import { FiveSensesScene } from "./FiveSensesScene";
import { FoodSourceScene } from "./FoodSourceScene";
import { MaterialSortScene } from "./MaterialSortScene";
import { ComputerSafetyScene } from "./ComputerSafetyScene";
import { HabitSortScene } from "./HabitSortScene";
import { OddEvenSortScene } from "./OddEvenSortScene";
import { VowelConsonantSortScene } from "./VowelConsonantSortScene";
import { ShapeCornerSortScene } from "./ShapeCornerSortScene";
import { PlantAnimalSortScene } from "./PlantAnimalSortScene";
import { PlantLifeScene } from "./PlantLifeScene";
import { WeatherSeasonsScene } from "./WeatherSeasonsScene";
import { ShadowGuessScene } from "./ShadowGuessScene";
import { MagnetPolesScene } from "./MagnetPolesScene";
import { WaterCycleScene } from "./WaterCycleScene";
import { KeyboardExplorerScene } from "./KeyboardExplorerScene";
import { DeviceMannersScene } from "./DeviceMannersScene";
import { ProfessionsMatchScene } from "./ProfessionsMatchScene";
import { FestivalSortScene } from "./FestivalSortScene";
import { KindnessScene } from "./KindnessScene";
import { TruthScene } from "./TruthScene";
import { OrdinalsScene } from "./OrdinalsScene";
import { IdiomsScene } from "./IdiomsScene";
import { VerbGenderScene } from "./VerbGenderScene";
import { ClassifiersScene } from "./ClassifiersScene";
import { DigraphsScene } from "./DigraphsScene";
import { SynAntScene } from "./SynAntScene";
import { IrregularPluralsScene } from "./IrregularPluralsScene";
import { PastTenseScene } from "./PastTenseScene";
import { LongVowelScene } from "./LongVowelScene";
import { SkipCountScene } from "./SkipCountScene";
import { ClockTimeScene } from "./ClockTimeScene";
import { BalanceScene } from "./BalanceScene";
import { MeasurementScene } from "./MeasurementScene";
import { PictoGraphScene } from "./PictoGraphScene";
import { CatchFruitScene } from "./CatchFruitScene";
import { BubblePopScene } from "./BubblePopScene";
import { FetchScene } from "./FetchScene";
import { BathNovaScene } from "./BathNovaScene";
import { PetStrokeScene } from "./PetStrokeScene";
import { TraceScene } from "./TraceScene";
import { TreatSortScene } from "./TreatSortScene";
import { HideSeekScene } from "./HideSeekScene";
import { PetMemoryScene } from "./PetMemoryScene";
import { TuckInScene } from "./TuckInScene";
import { PetDanceScene } from "./PetDanceScene";
import { NovaSaysScene } from "./NovaSaysScene";
import { PetWalkScene } from "./PetWalkScene";
import { EggHatchScene } from "./EggHatchScene";
import { SpeciesGalleryScene } from "./SpeciesGalleryScene";
import { DressUpScene } from "./DressUpScene";
import { PetBirthdayScene } from "./PetBirthdayScene";
import { PhotoBoothScene } from "./PhotoBoothScene";
import { SleepWakeScene } from "./SleepWakeScene";
import { CountingSongScene } from "./CountingSongScene";
import { OnlineSafetyScene } from "./OnlineSafetyScene";
import { StatesMatterScene } from "./StatesMatterScene";
import { HumanBodyScene } from "./HumanBodyScene";
import { MathSolveScene } from "./MathSolveScene";
import { NegativeNumberScene } from "./NegativeNumberScene";
import { ScienceFactsScene } from "./ScienceFactsScene";
import { CodeLogicScene } from "./CodeLogicScene";
import { ArcadeCatchScene } from "./ArcadeCatchScene";
import { MemoryScene } from "./MemoryScene";
import { ensureAssets } from "./svgAssets";
import { NV_NAVY } from "./ui";  // tokenized #591
import { GAME_SCENES } from "@numberverse/core";
import { ACTIVITIES } from "./activities";

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

const SCENE_REGISTRY: Record<string, new () => Phaser.Scene> = {
  Boot: BootScene,
  Nova: NovaScene,
  Garden: GardenScene,
  ExploreGarden: ExploreGardenScene,
  PetFeed: PetFeedScene,
  CatchFruit: CatchFruitScene,
  BubblePop: BubblePopScene,
  Fetch: FetchScene,
  BathNova: BathNovaScene,
  PetStroke: PetStrokeScene,
  Trace: TraceScene,
  TreatSort: TreatSortScene,
  HideSeek: HideSeekScene,
  PetMemory: PetMemoryScene,
  TuckIn: TuckInScene,
  PetDance: PetDanceScene,
  NovaSays: NovaSaysScene,
  PetWalk: PetWalkScene,
  EggHatch: EggHatchScene,
  SpeciesGallery: SpeciesGalleryScene,
  DressUp: DressUpScene,
  PetBirthday: PetBirthdayScene,
  PhotoBooth: PhotoBoothScene,
  SleepWake: SleepWakeScene,
  GrowCount: GrowCountScene,
  FruitTree: FruitTreeScene,
  OddEven: OddEvenScene,
  CountPop: CountPopScene,
  Count100: Count100Scene,
  Build999: Build999Scene,
  FruitAdd: FruitAddScene,
  BnLetters: BnLettersScene,
  BnNumbers: BnNumbersScene,
  ShapeCatcher: ShapeCatcherScene,
  EnLetters: EnLettersScene,
  NumberBonds: NumberBondsScene,
  RocketMult: RocketMultScene,
  TimesTable: TimesTableScene,
  PizzaFrac: PizzaFracScene,
  BnWords: BnWordsScene,
  Cvc: CvcScene,
  DivisionFacts: DivisionFactsScene,
  FairShare: FairShareScene,
  FractionMatch: FractionMatchScene,
  PlaceValue: PlaceValueScene,
  Rounding: RoundingScene,
  BarChart: BarChartScene,
  BnMatras: BnMatrasScene,
  SightWords: SightWordsScene,
  AnimalHome: AnimalHomeScene,
  Decimals: DecimalsScene,
  Percent: PercentScene,
  AreaPerim: AreaPerimScene,
  BnSentence: BnSentenceScene,
  Grammar: GrammarScene,
  BgsFacts: BgsFactsScene,
  BnColors: BnColorsScene,
  EnPhonics: EnPhonicsScene,
  BdMoney: BdMoneyScene,
  AddSub100: AddSub100Scene,
  Regroup: RegroupScene,
  Measurement: MeasurementScene,
  PictoGraph: PictoGraphScene,
  FrogHop: FrogHopScene,
  MemoryPairs: MemoryPairsScene,
  BalloonPop: BalloonPopScene,
  FactsAdd: FactsAddScene,
  SubFacts: SubFactsScene,
  Doubles: DoublesScene,
  MakeTen: MakeTenScene,
  AddRegroup: AddRegroupScene,
  SubBorrow: SubBorrowScene,
  ArrayMult: ArrayMultScene,
  ShareRem: ShareRemScene,
  FracSet: FracSetScene,
  MixedFrac: MixedFracScene,
  DecTenths: DecTenthsScene,
  MakeChange: MakeChangeScene,
  ElapsedTime: ElapsedTimeScene,
  PerimFence: PerimFenceScene,
  SolidMatch: SolidMatchScene,
  SymmetryMirror: SymmetryMirrorScene,
  AnimalsMove: AnimalsMoveScene,
  PlantLife: PlantLifeScene,
  WeatherSeasons: WeatherSeasonsScene,
  ShadowGuess: ShadowGuessScene,
  MagnetPoles: MagnetPolesScene,
  WaterCycle: WaterCycleScene,
  KeyboardExplorer: KeyboardExplorerScene,
  DeviceManners: DeviceMannersScene,
  ProfessionsMatch: ProfessionsMatchScene,
  FestivalSort: FestivalSortScene,
  Kindness: KindnessScene,
  Truth: TruthScene,
  Ordinals: OrdinalsScene,
  Idioms: IdiomsScene,
  VerbGender: VerbGenderScene,
  Classifiers: ClassifiersScene,
  Digraphs: DigraphsScene,
  SynAnt: SynAntScene,
  IrregularPlurals: IrregularPluralsScene,
  PastTense: PastTenseScene,
  LongVowel: LongVowelScene,
  SkipCount: SkipCountScene,
  ClockTime: ClockTimeScene,
  Balance: BalanceScene,
  LivingSort: LivingSortScene,
  PlantParts: PlantPartsScene,
  FiveSenses: FiveSensesScene,
  FoodSource: FoodSourceScene,
  MaterialSort: MaterialSortScene,
  ComputerSafety: ComputerSafetyScene,
  HabitSort: HabitSortScene,
  OddEvenSort: OddEvenSortScene,
  VowelConsonantSort: VowelConsonantSortScene,
  ShapeCornerSort: ShapeCornerSortScene,
  PlantAnimalSort: PlantAnimalSortScene,
  SinkFloat: SinkFloatScene,
  FoodChain: FoodChainScene,
  DayNight: DayNightScene,
  CatchBug: CatchBugScene,
  VillageCity: VillageCityScene,
  Patience: PatienceScene,
  ConjunctFind: ConjunctFindScene,
  BanglaDays: BanglaDaysScene,
  BanglaSpell: BanglaSpellScene,
  Pronoun: PronounScene,
  CountBack: CountBackScene,
  Plurals: PluralsScene,
  PastEd: PastEdScene,
  CaseMatch: CaseMatchScene,
  CvcBuild: CvcBuildScene,
  CompareFrac: CompareFracScene,
  ShapeParts: ShapePartsScene,
  BnSightWords: BnSightWordsScene,
  SentenceBuilder: SentenceBuilderScene,
  StoryRead: StoryReadScene,
  RhymeTime: RhymeTimeScene,
  WordPairs: WordPairsScene,
  Punct: PunctScene,
  Compound: CompoundScene,
  LetterSound: LetterSoundScene,
  MatraMatrix: MatraMatrixScene,
  ReadStory: ReadStoryScene,
  NumberWords: NumberWordsScene,
  CoinValue: CoinValueScene,
  TimeWords: TimeWordsScene,
  DirectionWords: DirectionWordsScene,
  Polite: PoliteScene,
  Riddle: RiddleScene,
  RControlled: RControlledScene,
  MagicE: MagicEScene,
  Contracts: ContractsScene,
  Compare: CompareScene,
  Prepositions: PrepositionsScene,
  QuestionWords: QuestionWordsScene,
  Story: StoryScene,
  CompoundEn: CompoundEnScene,
  ReadAloud: ReadAloudScene,
  AlphaOrder: AlphaOrderScene,
  WordFamily: WordFamilyScene,
  YesNo: YesNoScene,
  CountingSong: CountingSongScene,
  OnlineSafety: OnlineSafetyScene,
  StatesMatter: StatesMatterScene,
  HumanBody: HumanBodyScene,
  MathSolve: MathSolveScene,
  NegativeNumber: NegativeNumberScene,
  ScienceFacts: ScienceFactsScene,
  CodeLogic: CodeLogicScene,
  ArcadeCatch: ArcadeCatchScene,
  Memory: MemoryScene,
};

/** #788 — the registry above is the SINGLE source of truth for every scene the
 * engine can boot. `GAME_SCENES` (gameId → key) and `ACTIVITIES.scene` (pet
 * mini-game key) are metadata maps; this assert keeps them from drifting.
 */
function assertSceneRegistryComplete(): void {
  const required = new Set<string>([
    "Boot",
    "Nova",
    "Garden",
    ...Object.values(GAME_SCENES),
    ...ACTIVITIES.filter((a) => a.scene).map((a) => a.scene as string),
  ]);
  for (const key of required) {
    if (!SCENE_REGISTRY[key]) console.warn(`[engine] scene "${key}" is missing from SCENE_REGISTRY`);
  }
}

/** Create + boot the Phaser game. Mirrors the config previously in App.tsx. */
export function createGame(parent: HTMLElement): Phaser.Game {
  assertSceneRegistryComplete();
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: NV_NAVY,
    scene: Object.values(SCENE_REGISTRY),
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    input: { activePointers: 3 },
  });
}

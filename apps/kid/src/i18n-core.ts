/* i18n-core — locale types + Bangla digit helpers shared by the code-split
 * dictionaries (i18n-en.ts / i18n-bn.ts). Kept separate so game scenes can
 * import bnNum() without pulling the full dictionary loader into the engine
 * chunk (#881). */

export const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export const BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

export function bnNum(n: string | number): string {
  return String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

/* ────────────────────────────── i18n (English / বাংলা) ────────────────────────────── */

export type Lang = "en" | "bn";

export interface Strings {
  /** #1007 — accessible name for the map/journey/worlds view switcher. */
  viewTabs: string;
  /** #1012 — destination-aware back label for icon-only back arrows. */
  backTo: (dest: string) => string;
  /** #1011 — done-screen star summary announced as one image. */
  doneStars: (n: number) => string;
  /** #1009 — accessible name for the Phaser play area. */
  gameAreaA11y: string;
  /** #785/#1005 — keyboard hint for the game canvas. */
  gameKeyHint: string;
  /** #1074 — per-game difficulty/age signal (Bangladesh school class). */
  classLabel: (n: number) => string;
  /* #1567 — the adaptive difficulty rung, kid-spoken */
  hudRung: string;
  rungEasy: string;
  rungJustRight: string;
  rungTricky: string;
  rungUp: (stage: string) => string;
  rungUpSpeak: string;
  /** #1033 — older-kid greeting register (bands 5+, ages ~10+). */
  homeHelloMature: (name: string) => string;
  /** #1033 — older-kid re-entry greeting (bands 5+, ages ~10+). */
  welcomeBackMature: (name: string) => string;
  /** #1037 — older-kid garden register (bands 5+, ages ~10+). */
  gardenTileSumMature: (plants: number, fruits: number) => string;
  gardenTileFreshMature: string;
  gardenTileEmptyMature: string;
  /** #1037 — older-kid garden label (bands 5+, ages ~10+). */
  gardenTileMature: string;
  /* #1038 — older-kid weekly summary register (bands 5+, ages ~10+). */
  recapTitleMature: string;
  recapSubMature: (n: number) => string;
  recapWinMasteredMature: (n: number) => string;
  recapWinStreakMature: (n: number) => string;
  recapHearMature: string;
  recapEmptyMature: string;
  recapSpeakMature: (name: string, days: number, title: string, win: string) => string;
  /* #1039 — older-kid challenge register: a practice duel, not "beat the owl". */
  chTileMature: string;
  chCardMature: string;
  chQuestionMature: string;
  chWinMature: (name: string) => string;
  chTieMature: string;
  chLoseMature: (name: string) => string;
  appTagline: string;
  agesBadge: string;
  play: string;
  playWith: (name: string) => string;
  fullscreen: string;
  fullscreenOff: string;
  syncIdle: string;
  syncOk: string;
  syncSyncing: string;
  syncOffline: string;
  storyQueueNote: (n: number) => string;
  syncError: string;
  pickKid: string;
  switchKid: (avatar: string, name: string) => string;
  /* #22 — sibling co-op: two kids, one device, alternating turns. */
  siblingCoop: string;
  passDevice: string;
  passTo: (name: string) => string;
  nowPlaying: (name: string) => string;
  youBadge: string;
  coopHint: string;
  /* #139 — flashcard QR → mini-game tie-in. */
  scanCard: string;
  /** #1397 — compact visible label for the home scan button. */
  scanShort: string;
  scanTitle: string;
  scanHint: string;
  scanCodePlaceholder: string;
  scanLaunch: string;
  scanNotCard: string;
  scanCameraDenied: string;
  scanClose: string;
  parentZone: string;
  parentNote: string;
  whoPlaying: string;
  pickProfile: string;
  addKid: string;
  addKidSub: string;
  upTo4: string;
  /** #1415 — the 4-kid family cap, shown when the add-kid action is full. */
  kidsFull: string;
  kidsFullSub: string;
  skillsMastered: (n: number) => string;
  worldsOpen: (open: number, total: number) => string;
  worldsOf: (name: string) => string;
  masterSkillsSub: string;
  worldComplete: string;
  /** #1484 — a band with no playable units after a parent subject filter. */
  worldNoLessons: string;
  /** #1483 — warm acknowledge + named goal when a locked land is tapped. */
  mapLockedSpeak: (more: number, prev: string) => string;
  /** #1486 — parent difficulty cap blocks this land regardless of progress. */
  worldLockedCap: string;
  /** Freemium — this land needs Parent Plus (band 3+). */
  premiumLockedSub: string;
  premiumLockedSpeak: string;
  premiumTitle: string;
  premiumSub: string;
  premiumBody: string;
  premiumIncluded: string;
  premiumAskParent: string;
  /* learning journey */
  journey: string;
  worldsLabel: string;
  /* visual map (worlds as islands on a winding road) */
  mapTab: string;
  mapSub: string;
  mapHere: string;
  mapLand: string;
  mapLandProg: (m: number, t: number) => string;
  mapRoadOpen: (world: string) => string;
  journeySub: string;
  journeyProgress: (m: number, t: number) => string;
  journeyLocked: string;
  journeyTapHint: string;
  journeyDone: string;
  masterMoreIn: (n: number, prev: string) => string;
  skillsProg: (m: number, t: number) => string;
  champion: string;
  worldAges: (range: string, m: number, t: number) => string;
  masterMoreToUnlock: (n: number, name: string) => string;
  readyFor: (name: string) => string;
  playNext: (title: string) => string;
  /** Home PLAY screen's "what will we play next" line. */
  nextLesson: (title: string) => string;
  practiceAgain: string;
  /** #1420 — beat-your-best CTA for the recommended next skill / replay. */
  beatYourBest: string;
  /** 🚀 #249 — skip-ahead: the kid already knows the next lesson. */
  skipAhead: string;
  skipAheadHint: (title: string) => string;
  /** #1572 — two-tap confirm before a durable accel-skip. */
  skipConfirm: string;
  skipDone: string;
  skipLogged: (title: string) => string;
  /** #276 — per-land skill tree: mastered nodes glow, tap a leaf to jump in. */
  treeTitle: string;
  treeHint: string;
  /** Journey-first home: Nova greets the kid by name on the path. */
  homeHello: (name: string) => string;
  homePath: string;
  homeViewJourney: string;
  /** Warm re-entry after a missed day (streak kindness — no guilt). */
  welcomeBack: (name: string) => string;
  /** Quest is unreachable today (parent playtime cap) → gentle rest, not frustration. */
  questRest: string;
  /* mastery card album */
  cardsTile: string;
  cardsTitle: string;
  cardsSub: (n: number, total: number) => string;
  cardsWorldChamp: (title: string) => string;
  cardsWorldComplete: (n: number) => string;
  cardsPlayToCollect: string;
  cardsAccuracy: (n: number) => string;
  cardsAttempts: (n: number) => string;
  cardsStreak: (n: number) => string;
  cardsMasteredBy: (name: string) => string;
  /* #1372 — zero-mastery card album gets a first-lesson path instead of
     just a wall of gray locks. */
  cardsEmptyTitle: string;
  cardsEmptyHint: string;
  cardsEmptyCta: string;
  worldChampDone: (title: string) => string;
  /* printable certificate */
  certBtn: string;
  certTitle: string;
  certThisCertifies: string;
  certHasMastered: string;
  certSkillCount: (n: number) => string;
  certWithNova: string;
  certSigned: string;
  certDate: string;
  certPrint: string;
  certBack: string;
  certSpeak: (name: string, world: string) => string;
  /* #1338 — printable worksheet generator (offline PDF via the print sheet). */
  wsTitle: string;
  wsSub: string;
  wsFor: (name: string) => string;
  wsNeedsPractice: string;
  wsUnmastered: string;
  wsAll: string;
  wsSelected: (n: number) => string;
  wsPickHint: string;
  wsNoSkills: string;
  wsPrint: string;
  wsPrintHint: string;
  wsWarmup: string;
  wsSolve: string;
  wsWriteTrace: string;
  wsCount: string;
  wsBack: string;
  /* #1345 — flashcard QR print generator (offline; the scan side shipped in #139). */
  fcTitle: string;
  fcSub: string;
  fcFor: (name: string) => string;
  fcPickHint: string;
  fcSelected: (n: number) => string;
  fcPrint: string;
  fcPrintHint: string;
  fcHow: string;
  fcScanEntry: string;
  fcDrawing: string;
  fcNoSkills: string;
  fcBack: string;
  /** Generic back-button label (aria) used on every `icon-btn` back arrow —
   *  localized so a Bangla screen reader never announces English "Back". */
  back: string;
  /* birthday party */
  birthMonth: string;
  birthDay: string;
  birthdayHello: (name: string) => string;
  birthdayTitle: (name: string) => string;
  birthdayGift: (n: number) => string;
  birthdayClaim: string;
  birthdayClaimed: string;
  /* the pet — an egg that hatches and grows as the kid learns */
  petTitle: string;
  petStage0: string;
  petStage1: string;
  petStage2: string;
  petStage3: string;
  petGrow: (pct: number) => string;
  petFeed: string;
  petFedToday: string;
  petFeedSpeak: string;
  petHatchSpeak: (name: string) => string;
  petName: string;
  petGrewInto: (stage: string) => string;
  /* #1162 — age-graded reward surface: bands 5-7 see a mission bar instead of
   * the nursery pet (streak + badges + achievements + trophy-room entry). */
  missionTitle: string;
  missionSub: string;
  missionStreak: (n: number) => string;
  missionBadges: (n: number) => string;
  missionAchievements: (n: number) => string;
  missionTrophy: string;
  /* name in funny voices — Nova plays with the kid's name */
  funnyTitle: string;
  funnyRobot: string;
  funnyWhisper: string;
  funnyShout: string;
  /* build-a-castle — a tower rises with every mastered world */
  castleTile: string;
  castleTitle: string;
  castleBuilt: (n: number, total: number) => string;
  castleTowerBuilt: (title: string) => string;
  castleTowerToBuild: (title: string) => string;
  castleCrown: string;
  castleBuildCta: (title: string) => string;
  /* seasons — the path changes with the real calendar */
  seasonSnow: string;
  seasonFlowers: string;
  seasonFireflies: string;
  seasonLeaves: string;
  /* festivals — country-based decor, the active one is config (#137) */
  festivalBanner: (name: string, emoji: string) => string;
  fest_boishakh: string;
  fest_eid_fitr: string;
  fest_eid_adha: string;
  fest_christmas: string;
  fest_ramadan: string;
  fest_diwali: string;
  fest_holi: string;
  /* daily quest */
  questTitle: string;
  questTypeRounds: (n: number) => string;
  questTypeStars: (n: number) => string;
  questTypeMaster: (n: number) => string;
  questTypeNewgame: (n: number) => string;
  questProgress: (n: number, target: number) => string;
  questDoneText: string;
  /** #1435 — spoken the moment a quest finishes (before the claim tap). */
  questReadySpeak: string;
  questReward: (n: number) => string;
  questCompleteSpeak: (n: number) => string;
  /* #770 — a 'newgame' quest day names one un-attempted game to try */
  questFreshTry: string;
  questFreshPlay: string;
  questFreshNone: string;
  /* #767 — cap-full "come back tomorrow" names the waiting reward */
  capFullLine: (reward: string) => string;
  capRewardBox: string;
  capRewardCal: string;
  capRewardBoth: string;
  /* #769 — garden teaser on home */
  gardenTileSum: (plants: number, fruits: number) => string;
  gardenTileFresh: string;
  /** #1373 — home teaser CTA before the first plant exists. */
  gardenTileEmpty: string;
  /* #281 — 7-day login calendar */
  calendarTitle: string;
  calendarHint: string;
  calendarDayOf: (d: number) => string;
  calendarClaim: (n: number) => string;
  calendarClaimed: string;
  calendarLocked: string;
  calendarClaimSpeak: (name: string, n: number) => string;
  /** #1473 — gentle cue when a missed day restarts the calendar week. */
  calendarFreshStart: string;
  /* #283 — goal badges */
  badgeTile: string;
  badgeTitle: string;
  badgeSub: (n: number, total: number) => string;
  badgeEarned: string;
  badgeLocked: string;
  badgeNewSpeak: (name: string, title: string) => string;
  /** #1356 — current/target readout for a locked badge (e.g. "3/10"). */
  badgeProgress: (current: number, target: number) => string;
  /** #1371 — first-badge guidance when the book is still all padlocks. */
  badgeFirstTitle: string;
  /* #289 — long-term achievements book */
  achTile: string;
  achTitle: string;
  achSub: (n: number, total: number) => string;
  achUnlocked: string;
  achLocked: string;
  achNewSpeak: (name: string, title: string) => string;
  /* #285 — custom avatar builder */
  avatarTile: string;
  avatarTitle: string;
  avatarSub: string;
  avatarPreview: string;
  avatarFace: string;
  avatarPartsLabels: Record<"hat" | "glasses" | "outfit", string>;
  avatarNone: string;
  avatarSave: string;
  avatarSaveSpeak: (name: string) => string;
  /** #1348 — human-readable names for avatar picker buttons (never raw keys). */
  avatarFaceNames: Record<string, string>;
  avatarPartNames: Record<string, string>;
  /** #1349 — live spoken/announced line after each pick. */
  avatarPicked: (category: string, option: string) => string;
  /** #1347 — unsaved-change confirm on the Customize back arrow. */
  avatarUnsavedTitle: string;
  avatarUnsavedBody: string;
  avatarUnsavedKeep: string;
  avatarUnsavedDiscard: string;
  /* #282 — same-device sibling leaderboard */
  lbTile: string;
  lbTitle: string;
  lbSub: string;
  lbStatMastery: string;
  lbStatRounds: string;
  lbStatStars: string;
  lbYou: string;
  lbEmpty: string;
  lbAddSibling: string;
  lbSpeak: (name: string, rank: number) => string;
  /* #277 — land trophy room */
  trTitle: string;
  trSub: (n: number, total: number) => string;
  trEarned: string;
  trLocked: string;
  trEmpty: string;
  trNewSpeak: (name: string, land: string) => string;
  /* #284 — mastery mystery boxes */
  boxTile: string;
  boxHint: (n: number) => string;
  boxOpen: string;
  boxCapSpeak: string;
  boxRewardSpeak: (name: string, coins: number) => string;
  /* #1196 — HUD chip when today's learning coins hit the anti-grind cap */
  hudCoinsMaxed: string;
  /* #1434 — in-game mastery bar label (ties the HUD to the skill-tree bar) */
  hudMastery: string;
  /* #294 — streak-freeze tokens */
  freezePill: (n: number) => string;
  freezeEarnedSpeak: string;
  freezeSpentSpeak: string;
  /** #1472 — warm line when a held freeze token can't cover N missed days. */
  freezeNotEnough: (n: number) => string;
  /* #288 — kid-friendly voice settings */
  voiceFunTitle: string;
  voiceFunSoft: string;
  voiceFunNormal: string;
  voiceFunLoud: string;
  voiceFunReset: string;
  voiceFunTest: string;
  /* #286 — star-of-the-week recap */
  recapTitle: string;
  recapSub: (n: number) => string;
  recapTopSkill: string;
  recapWinMastered: (n: number) => string;
  recapWinStreak: (n: number) => string;
  recapHear: string;
  recapEmpty: string;
  recapHomeLine: (days: number, title: string) => string;
  recapSpeak: (name: string, days: number, title: string, win: string) => string;
  /* #100 — skill of the week (weekly challenge + Week Warrior badge) */
  weekTitle: string;
  weekSub: string;
  weekDone: string;
  /* #280 — beat-the-owl challenge drill */
  chTile: string;
  chCard: string;
  chStart: string;
  chRound: (n: number, total: number) => string;
  chYou: string;
  chNova: string;
  chLevel: (n: number) => string;
  chQuestion: string;
  chCorrect: string;
  chWrong: string;
  chNovaGot: string;
  chNovaMiss: string;
  chWin: (name: string) => string;
  chTie: string;
  chLose: (name: string) => string;
  chCoins: (n: number) => string;
  chAgain: string;
  chClose: string;
  chSpeakWin: (name: string) => string;
  chSpeakTie: string;
  chSpeakLose: (name: string) => string;
  /* #1164 — intermediate land boss (per-land duel gate) */
  bossBtn: string;
  bossBtnBn: string;
  bossBeaten: string;
  bossBeatenBn: string;
  bossWin: string;
  bossWinBn: string;
  bossLose: string;
  bossTie: string;
  /* #356 — first-play onboarding tour */
  tourTitle: string;
  tourSkip: string;
  tourNext: string;
  tourDone: string;
  tourStep1Title: (name: string) => string;
  tourStep1Sub: string;
  tourStep2Title: string;
  tourStep2Sub: string;
  tourStep3Title: string;
  tourStep3Sub: string;
  tourStep4Title: string;
  tourStep4Sub: string;
  /* offline-first */
  offlineReady: string;
  installBtn: string;
  nextBadge: string;
  amazing: string;
  earned: (avatar: string, name: string, stars: number, score: number, world: string) => string;
  keepGoing: (n: number, world: string) => string;
  greatSession: string;
  completeUnlocked: (world: string, next: string) => string;
  playAgain: string;
  /** The "Next round" button on the done screen — advances to the next stop on
   *  the journey (falls back to Play again when the journey is complete). */
  nextRound: string;
  worldsBtn: string;
  homeBtn: string;
  /** Folded-away "More" menu on the minimal home screen (Worlds/Nova/Garden/
   *  Cards/Castle + Nova's funny-voice name game). */
  moreMenu: string;
  /** Labeled parent-portal door on the home corner — 1 tap → goParent (PIN gate). */
  parentDoor: string;
  /** aria-label for the persistent Nova+Garden "living world" strip on home. */
  wildsLabel: string;
  round: (r: number, total: number) => string;
  pickBuddy: string;
  kidsName: string;
  namePlaceholder: string;
  birthYear: string;
  ageAt: (age: number) => string;
  saveKid: (name: string) => string;
  langLabel: string;
  leaveGame: string;
  /** #1426 — kid-initiated pause (the child's own pause button + card). */
  pauseGame: string;
  kidPauseTitle: string;
  kidPauseBody: string;
  resumeGame: string;
  /* #1566 — soft confirm before leaving a live session */
  leaveConfirmTitle: string;
  leaveConfirmBody: string;
  leaveConfirmYes: string;
  leaveConfirmNo: string;
  parentTitle: string;
  parentSub: string;
  parentWelcome: (name: string) => string;
  parentFamTitle: string;
  parentFamKids: (n: number) => string;
  parentFamStars: (n: number) => string;
  parentFamPoints: (n: number) => string;
  parentFamSessions: (n: number) => string;
  parentFamMastered: (n: number) => string;
  parentPortalTitle: string;
  parentPortalSub: string;
  parentPortalCta: string;
  /* parent gate (first-load sign-in) */
  gateTitle: string;
  gateSub: string;
  gateSignin: string;
  gateSignup: string;
  gateNameLabel: string;
  gateNamePh: string;
  gateEmailLabel: string;
  gateEmailPh: string;
  gatePassLabel: string;
  gatePassPh: string;
  gateShowPass: string;
  gatePassHint: string;
  gatePassOk: string;
  gateSubmitIn: string;
  gateSubmitUp: string;
  gateBusy: string;
  gateErrorInvalid: string;
  gateErrorSignup: string;
  gateGuest: string;
  gateGuestSub: string;
  gatePrivacy: string;
  gateWelcome: (name: string) => string;
  gatePower: string;
  gateContinue: string;
  gateGoogleOr: string;
  gateErrorGoogle: string;
  gateGoogleGone: string;
  /* #1463 — Google sign-in failed because the network dropped. */
  gateGoogleNetwork: string;
  /* #1465 — Google delivered a second credential while one was already in flight. */
  gateGoogleBusy: string;
  /* #1466 — retry + unavailable-here affordances for the Google button. */
  gateGoogleRetry: string;
  gateGoogleUnavailable: string;
  /* first-time welcome (language pick on top, then guest-vs-sign-in) */
  welcomeTitle: string;
  welcomeSub: string;
  welcomeLangLabel: string;
  welcomeEnglish: string;
  welcomeBangla: string;
  /** #1403 — spoken confirmation when the language changes (read in the NEW lang). */
  langSwitched: string;
  welcomeGuest: string;
  /** #1565 — first-run primary CTA: a cheerful start into profile creation. */
  welcomeStart: string;
  welcomeGuestSub: string;
  /** #1565 — sign-in deferred to a subtle "For parents" link on the welcome. */
  welcomeForParents: string;
  welcomeOr: string;
  welcomeSignin: string;
  welcomeSyllabus: string;
  /** #1393 — second-tap confirmation before leaving a parent account as guest. */
  guestConfirm: string;
  /** #1391/#1394 — persistent guest-mode warning + upgrade CTA. */
  guestModeWipe: string;
  guestUpgradeTitle: string;
  guestUpgradeCta: string;
  /* interactive syllabus (what kids learn) */
  syllabusGuestNote: string;
  syllabusTitle: string;
  syllabusSub: string;
  syllabusWhat: string;
  syllabusGame: string;
  syllabusStart: string;
  syllabusFab: string;
  syllabusHow: string;
  syllabusHow1: string;
  syllabusHow2: string;
  syllabusHow3: string;
  syllabusProgress: (done: number, total: number) => string;
  syllabusTap: string;
  syllabusBadge: (band: number) => string;
  syllabusMastered: string;
  syllabusNotStarted: string;
  syllabusDone: string;
  syllabusOpen: string;
  /* #1075 — catalog search + subject filter (world-detail tree + syllabus grid) */
  catalogSearch: string;
  catalogAll: string;
  catalogNoMatch: string;
  catalogSubject: string;
  catalogSubjects: Record<string, string>;
  /* settings screen */
  settingsTitle: string;
  settingsSub: string;
  settingsSyllabus: string;
  /* parent sign-out (Parent panel + kid Settings when a parent is signed in) */
  parentSignoutTitle: string;
  parentSignoutSub: string;
  parentSignoutCta: string;
  parentSignoutConfirm: string;
  /* parent PIN lock (#86) — 4-digit gate on the parent area */
  pinTitle: string;
  pinUnlockSub: string;
  pinSetTitle: string;
  pinSetSub: string;
  pinConfirmTitle: string;
  pinConfirmSub: string;
  pinChangeTitle: string;
  pinChangeSub: string;
  pinNewTitle: string;
  pinWrong: (n: number) => string;
  pinLocked: string;
  pinLockedSub: string;
  pinForgot: string;
  pinForgotSub: string;
  /* #1420 — no Q&A set: recover by verifying the account password, no sign-out. */
  pinForgotNoQaSub: string;
  pinRecoverCta: string;
  pinRecoverWithPassword: string;
  pinResetArmed: string;
  pinResetCta: string;
  pinMismatch: string;
  pinCurrentWrong: string;
  /* #819 — WebCrypto PBKDF2 unavailable (non-secure context). */
  pinCryptoError: string;
  pinKeep: string;
  pinLockCardTitle: string;
  pinLockCardSub: string;
  pinSet: string;
  pinChange: string;
  /* #247 — PIN recovery Q&A */
  secPanelTitle: string;
  secPanelSub: string;
  secPanelSet: string;
  secPanelChange: string;
  secPanelHas: string;
  secPickTitle: string;
  secPickSub: string;
  secAnswerTitle: string;
  secAnswerSub: string;
  secConfirmTitle: string;
  secNext: string;
  secSave: string;
  secSkip: string;
  secCancel: string;
  secAskTitle: string;
  secAskSub: string;
  secQuestion: string;
  secAnswerPlaceholder: string;
  secWrong: string;
  /* #1419 — limited security-answer attempts (3 tries, then password fallback). */
  secWrongTries: (n: number) => string;
  secLocked: string;
  secLockedSub: string;
  secPasswordTitle: string;
  secPasswordSub: string;
  secEmpty: string;
  secRecovered: string;
  secMismatch: string;
  /* #819 — WebCrypto PBKDF2 unavailable (non-secure context). */
  secCryptoError: string;
  /* about / version */
  settingsAboutSub: string;
  settingsVoice: string;
  settingsVoiceOk: (v: string) => string;
  settingsVoiceNone: string;
  settingsVoiceTest: string;
  /* #138 — kid dictation (record own voice + replay, on-device) */
  settingsDictate: string;
  settingsDictateSub: string;
  settingsDictateStart: string;
  settingsDictateStop: string;
  settingsDictateDenied: string;
  settingsDictateUnsupported: string;
  settingsDictateClear: string;
  /* settings screen — grouped sections */
  settingsSecScreen: string;
  projectorToggle: string;
  projectorToggleSub: string;
  projectorOn: string;
  projectorOff: string;
  projectorKeyHint: string;
  /** 🧏 #250 — global accessibility toggles (big text + high contrast). */
  a11yBigText: string;
  a11yBigTextSub: string;
  a11yHighContrast: string;
  a11yHighContrastSub: string;
  a11yBigTextOn: string;
  a11yBigTextOff: string;
  a11yHighContrastOn: string;
  a11yHighContrastOff: string;
  settingsSecParents: string;
  settingsReduceMotion: string;
  settingsReduceMotionSub: string;
  calmButton: string;
  calmTitle: string;
  calmBody: string;
  calmOn: string;
  calmOff: string;
  settingsMusicOff: string;
  settingsParentsHint: string;
  settingsParentsGo: string;
  settingsParentsSignin: string;
  /* #248 — quiet-hours moon badge */
  quietBadge: string;
  quietBadgeOn: string;
  settingsSecSound: string;
  settingsSecLanguage: string;
  /** #1404 — in-game HUD language toggle (aria/title). */
  langSwitch: string;
  settingsSecLearning: string;
  settingsMusicRow: string;
  /* #355 — haptic tap pulses */
  settingsHaptics: string;
  settingsVoiceNeural: (v: string) => string;
  settingsVoiceOff: string;
  settingsReadingOff: string;
  settingsVoiceDownload: (pct: number) => string;
  settingsSyncOk: string;
  settingsSyncWorking: string;
  settingsSyncOffline: string;
  settingsSyncError: string;
  settingsSyncIdle: string;
  starsTotal: (n: number) => string;
  points: (n: number) => string;
  sessions: (n: number) => string;
  parentSkills: string;
  /* Share loop — parent shares progress / certificate to WhatsApp */
  shareProgress: string;
  shareShare: string;
  shareCardTitle: string;
  shareCardFooter: string;
  shareStatsStars: string;
  shareStatsScore: string;
  shareStatsSessions: string;
  shareWorldsTitle: string;
  shareRewardSpeak: (name: string, n: number) => string;
  shareRewardToast: (n: number) => string;
  shareWhatsApp: string;
  shareDone: string;
  shareDownloaded: string;
  shareFail: string;
  shareProgressCaption: (name: string) => string;
  /* 📄 KOTHA weekly digest export */
  digestBtn: string;
  digestEmpty: string;
  digestDone: string;
  digestHeader: (name: string, week: string) => string;
  digestStats: (total: number, solved: number, tricky: number) => string;
  digestSolved: string;
  digestTricky: (n: number) => string;
  digestMoni: (code: string) => string;
  certShare: string;
  certShareFooter: string;
  certShareCaption: (name: string, world: string) => string;
  music: string;
  musicMuted: string;
  install: string;
  /* Voice check (parent panel) */
  voiceTitle: string;
  voicePlatform: (p: string) => string;
  voiceTest: string;
  voiceBnOk: (v: string) => string;
  voiceBnMissing: string;
  voiceEnOk: (v: string) => string;
  voiceNone: string;
  /* On-device neural Bangla voice (Piper VITS) */
  voiceNeuralReady: string;
  voiceNeuralLoading: (pct: number) => string;
  voiceNeuralError: string;
  voiceNeuralIdle: string;
  /* #1318 — retry after a failed model download (visible button + honest text) */
  voiceRetry: string;
  voiceDlFailed: string;
  /* #1319 — honest "no Bangla voice yet" line (device TTS exists but only for
     English → Bangla lines are dropped until the on-device voice lands) */
  settingsVoiceNoBn: string;
  voiceCacheHit: (pct: number) => string;
  /* Bangla voice picker (choose among the model's 16 speakers) */
  voicePickTitle: string;
  voicePickHint: string;
  voicePickFemale: string;
  voicePickKid: string;
  voicePickSoft: string;
  voicePickWarm: string;
  voicePickListen: string;
  mastered: string;
  inProgress: string;
  notStarted: string;
  playLimitReached: string;
  /* #1453 — gentle winding-down cue when the daily cap is close (not a hard stop). */
  capWindDown: (mins: number) => string;
  /* 🎯 #256 — gentle daily goal (parent-set): progress line + at-goal nudge */
  goalLine: (cur: number, goal: number) => string;
  goalNudge: string;
  goalNudgeTakeBreak: string;
  goalNudgeKeepGoing: string;
  /* 📌 #257 — curriculum focus pin (parent-set subject+world leads the journey) */
  focusChip: (label: string, band: number) => string;
  /* wrong-answer ledger — parent panel "needs help" */
  parentHelpTitle: string;
  parentHelpNone: string;
  parentHelpOpen: (n: number) => string;
  parentHelpWrong: (n: number) => string;
  reteachLetTry: string;
  practicePill: string;
  /* 🧠 MONI — the tiny tutor's insight card */
  moniTitle: string;
  moniTag: string;
  /* ❌ #78 wrong-answer history (parent panel) — per-day heatmap + drill-down */
  mistakesTitle: string;
  mistakesSub: string;
  mistakesHeatTitle: string;
  mistakesDayLabel: (date: string, n: number) => string;
  mistakesSkillWrong: (n: number) => string;
  mistakesEmpty: string;
  mistakesNoneDay: string;
  mistakesWeekday: string;
  moniLearnStyle: string;
  moniBestGame: string;
  moniAttention: string;
  moniConfidence: string;
  moniConfidenceGentle: string;
  moniConfidenceSteady: string;
  moniConfidenceChallenging: string;
  moniMisconceptions: string;
  moniMisconceptionsNone: string;
  moniNextMove: string;
  moniTone: string;
  moniSessionLength: string;
  /* #1046 — surface Moni's plan difficulty + focus to the parent */
  moniDifficulty: string;
  moniLevel: (n: number) => string;
  moniSessionHint: (n: number) => string;
  /* #1048 — kid's own "too easy / too hard" feedback on the done screen */
  moniFbQ: string;
  moniFbEasy: string;
  moniFbHard: string;
  moniFbOk: string;
  moniGoals: string;
  moniGoalFocus: string;
  moniGoalWeak: string;
  moniGoalReview: (n: number) => string;
  /* #333 parent-adjustable strictness */
  moniStrictness: string;
  moniStrictnessHelp: string;
  moniStrictnessGentle: string;
  moniStrictnessSteady: string;
  moniStrictnessChallenging: string;
  moniReviewGentle: string;
  moniReviewTap: (n: number) => string;
  breakTitle: (name: string) => string;
  breakBody: string;
  breakRest: string;
  breakKeepGoing: string;
  /** #272 — SAFETY: parent kill-switch paused screen (kid-safe message). */
  pauseTitle: string;
  pauseBody: string;
  pauseBackSoon: string;
  moniWeek: string;
  moniWeekRounds: string;
  moniWeekAcc: string;
  moniWeekPace: string;
  moniWeekStyle: string;
  moniWeekBestGame: string;
  moniWeekPaceUp: string;
  moniWeekPaceDown: string;
  moniWeekPaceFlat: string;
  moniStyleFast: string;
  moniStyleSteady: string;
  moniStyleSocial: string;
  contrastTrigger: (name: string) => string;
  contrastTriggerSub: string;
  contrastRight: string;
  /* #133 — screen-reader live-region announcements */
  a11yRight: string;
  a11yWrong: string;
  a11yMastered: (title: string) => string;
  a11yVoiceOn: string;
  a11yVoiceOff: string;
  a11yMusicOn: string;
  a11yMusicOff: string;
  contrastOops: (correct: string) => string;
  contrastDoneTitle: string;
  contrastDoneBody: string;
  contrastDoneBtn: string;
  contrastProgress: (cur: number, total: number) => string;
  kothaInspector: string;
  kothaInspectorSub: string;
  kothaFilterAll: string;
  kothaFilterWrong: string;
  kothaFilterCorrect: string;
  kothaEmpty: string;
  kothaKindMisconception: string;
  kothaKindGap: string;
  kothaKindFatigue: string;
  kothaKindGuessing: string;
  kothaKindSlip: string;
  kothaAction: string;
  kothaAgo: (ts: number) => string;
  kothaCorrect: string;
  kothaWrong: string;
  moniTrendUp: string;
  moniTrendFlat: string;
  moniTrendDown: string;
  moniSessions: (n: number) => string;
  moniRounds: (n: number) => string;
  /* Nova companion */
  novaTitle: string;
  novaTagline: string;
  novaMeet: string;
  novaTapHint: string;
  novaCoins: (n: number) => string;
  novaStreak: (n: number) => string;
  /** #1474 — streak badge teaser: what tomorrow's calendar tile pays. */
  streakTomorrow: (n: number) => string;
  novaCareFed: string;
  novaCarePlay: string;
  novaShop: string;
  novaEquip: string;
  novaEquipped: string;
  novaNeedCoins: string;
  novaDailyEarned: (n: number) => string;
  novaHello: string;
  novaFeedMsg: string;
  novaPlayMsg: string;
  novaTapMsg: string;
  novaEquipMsg: string;
  novaPlayGames: string;
  rankLabel: string;
  rankNextNeed: (next: string, need: number) => string;
  newSkill: (n: number) => string;
  /** Spoken the INSTANT a skill crosses the mastery bar mid-session (#290). */
  masterySpeak: (title: string) => string;
  /* growth garden */
  gardenTile: string;
  gardenHint: string;
  /* 🦉 3D Nova island (#684) — lazy three.js surface */
  island3dBtn: string;
  islandTitle: string;
  islandLoading: string;
  /* #346 — friendly loading copy for the engine/lazy-screen spinners */
  loadingGame: string;
  /* #1570 — the engine-boot loading card is tappable + re-arms on stall */
  bootAlmostReady: string;
  bootWarmHint: string;
  /* #1377/#1408 — kid-facing game-chunk load failure + recovery */
  gameLoadError: string;
  gameLoadErrorHint: string;
  gameLoadRetry: string;
  /* #1376 — storage-full / QuotaExceeded write warning */
  storageFull: string;
  islandBeta: string;
  islandHint: string;
  islandNoWebgl: string;
  islandBack: string;
  islandPlayGames: string;
  islandBack2d: string;
  /* #687 — 3D home room switcher (prev/next room cycle) */
  islandRoomPrev: string;
  islandRoomNext: string;
  /* #688 — spatial actions palette */
  islandActions: string;
  islandIn2d: string;
  islandDressup: string;
  islandDressupNatural: string;
  islandDressupGold: string;
  islandDressupRosy: string;
  islandDressupMint: string;
  islandWalkHint: string;
  /* #689 — store wiring badges */
  islandCoins: string;
  islandGardenGrew: string;
  /* #980 — parent account deletion (right-to-erasure) */
  deleteAccount: string;
  deleteAccountSub: string;
  deleteAccountCta: string;
  deleteAccountConfirm: string;
  deleteAccountConfirmPh: string;
  deleteAccountPasswordLabel: string;
  deleteAccountDone: (kids: number) => string;
  /* #982 — share link revocation */
  unshareLink: string;
  regenerateLink: string;
  shareLinkRevoked: string;
  /* #985/#986 — birth_year display + age-appropriate band */
  birthYearLabel: string;
  ageBandHint: (age: number, band: number) => string;
  /* #983/#984 — privacy retention info */
  retentionInfo: string;
}

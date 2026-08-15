/* i18n — app language pack (English / বাংলা). Extracted from App.tsx (#589).
 * #289 — declaration-order guard: BN_DIGITS/BN_MONTHS/bnNum live here, evaluated
 * before any importer. ACHIEVEMENTS calls bnNum(BANDS.length) at module-eval time
 * in App.tsx — safe now because ES-module deps init first. (0.27.0 blue-screen: the
 * bundle eval'd ACHIEVEMENTS before BN_DIGITS initialized.)
 *
 * i18n seams: to add a language/country later, extend `Lang`, add a locale block to
 * `STR`, and (for digits) extend `BN_DIGITS`/per-locale digit maps. The kid app is
 * architected so every user-facing string flows through STR.
 */

export const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export const BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

export function bnNum(n: number): string {
  return String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

/* ────────────────────────────── i18n (English / বাংলা) ────────────────────────────── */

export type Lang = "en" | "bn";

export interface Strings {
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
  worldsOpen: (n: number) => string;
  worldsOf: (name: string) => string;
  masterSkillsSub: string;
  worldComplete: string;
  /** #1484 — a band with no playable units after a parent subject filter. */
  worldNoLessons: string;
  /** #1483 — warm acknowledge + named goal when a locked land is tapped. */
  mapLockedSpeak: (more: number, prev: string) => string;
  /** #1486 — parent difficulty cap blocks this land regardless of progress. */
  worldLockedCap: string;
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
  welcomeGuestSub: string;
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
  shareRewardSpeak: (name: string) => string;
  shareRewardToast: string;
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
  moniSessionHint: (n: number) => string;
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
}

export const STR: Record<Lang, Strings> = {
  en: {
    appTagline: "Your kids learn smarter — Bangla, English, Math & more.",
    agesBadge: "Ages 2–13 · no ads, ever",
    play: "▶ Play",
    playWith: (n) => `▶ Play, ${n}!`,
    fullscreen: "⛶ Fullscreen",
    fullscreenOff: "⛶ Exit fullscreen",
    syncIdle: "Waiting to sync…",
    syncOk: "✓ Progress saved to cloud",
    syncSyncing: "Syncing…",
    syncOffline: "Offline — progress saved on device",
    syncError: "Sync hiccup — will retry",
    storyQueueNote: (n) => `${n} learning moments saved on this device — they'll reach the cloud when you're online 📚`,
    pickKid: "👶 Pick your kid",
    switchKid: (a, n) => `${a} ${n} — switch kid`,
    // #22 — sibling co-op: two kids, one device, alternating turns.
    siblingCoop: "Sibling co-op",
    passDevice: "Pass the device",
    passTo: (name) => `Pass to ${name}`,
    nowPlaying: (name) => `${name} is playing now`,
    youBadge: "You",
    coopHint: "Two kids, one device — take turns!",
    // #139 — flashcard QR → mini-game tie-in.
    scanCard: "Scan a card",
    scanShort: "Scan",
    scanTitle: "Scan a flashcard",
    scanHint: "Point the camera at a flashcard QR — or type its code below.",
    scanCodePlaceholder: "NV:skillId (or just skillId)",
    scanLaunch: "Open game",
    scanNotCard: "That code isn't a Numberverse card",
    scanCameraDenied: "Camera unavailable — type the card's code instead",
    scanClose: "Cancel",
    parentZone: "👨‍👩‍👧 Parent Zone",
    parentNote:
      "Worlds unlock by learning progress, not age — master a world's skills to open the next one.",
    whoPlaying: "Who's playing?",
    pickProfile: "Pick a profile or add one",
    addKid: "Add a kid",
    addKidSub: "Worlds unlock by progress, not age",
    upTo4: "up to 4 per family",
    kidsFull: "Family full",
    kidsFullSub: "Up to 4 kids per family",
    skillsMastered: (n) => `${n} skills mastered`,
    worldsOpen: (n) => `${n}/5 worlds open`,
    worldsOf: (name) => `${name}'s worlds`,
    masterSkillsSub: "Master skills to unlock the next world",
    worldComplete: "World complete! 🎉",
    // #1484 — empty band (parent subject filter) must not show a phantom 0/1.
    worldNoLessons: "No lessons in this land right now",
    // #1483 — locked-land tap is acknowledged and the goal is named aloud.
    mapLockedSpeak: (more, prev) => `${prev} is locked for now — master ${more} more ${more === 1 ? "skill" : "skills"} there to open it.`,
    // #1486 — the parent's difficulty cap is the honest reason this stays locked.
    worldLockedCap: "This land is locked by your grown-up's settings",
    journey: "Journey",
    worldsLabel: "Worlds",
    mapTab: "Map",
    mapSub: "A living map — tap a land to play there",
    mapHere: "You're here!",
    mapLand: "Land",
    mapLandProg: (m, t) => `${m}/${t} mastered`,
    mapRoadOpen: (world) => `You opened the road to ${world}! 🎉`,
    journeySub: "Nova walks the path — master a lesson to reach the next dot",
    journeyProgress: (m, t) => `${m} of ${t} lessons mastered`,
    journeyLocked: "Master the lesson above to open this one",
    journeyTapHint: "🦉 Nova is here — tap to play!",
    journeyDone: "🏆 Every lesson mastered — you finished the whole journey!",
    masterMoreIn: (n, prev) => `Master ${n} more in ${prev} to unlock`,
    skillsProg: (m, t) => `${m}/${t} skills mastered`,
    champion: "🏆 Every world mastered — you're a Numberverse champion!",
    worldAges: (range, m, t) => `Ages ${range} · ${m}/${t} skills mastered`,
    masterMoreToUnlock: (n, name) => `Master ${n} more skill${n > 1 ? "s" : ""} to unlock ${name}`,
    readyFor: (name) => `You're ready for ${name}!`,
    playNext: (title) => `▶ Play next: ${title}`,
    nextLesson: (title) => `Next up: ${title}`,
    practiceAgain: "▶ Practice again",
    // #1420 — beat-your-best CTA for the recommended next skill / replay.
    beatYourBest: "▶ Beat your best!",
    // 🚀 #249 — skip-ahead (logged so the parent sees the acceleration plan).
    skipAhead: "⏭ I already know this",
    skipAheadHint: (title) => `Already know "${title}"? Skip it — we'll note it on your progress.`,
    skipDone: "⏭ Skipped!",
    skipLogged: (title) => `Noted — you skipped "${title}". Your parent can see it on the plan.`,
    treeTitle: "🌳 Skill Tree",
    treeHint: "Tap a leaf to jump straight to that lesson",
    homeHello: (name) => `Whoo! Hi ${name}!`,
    homePath: "Your path",
    homeViewJourney: "Full journey ›",
    welcomeBack: (name) => `Welcome back, ${name}! 💛`,
    questRest: "🌙 All done for today — great job! Your quest restarts tomorrow.",
    cardsTile: "My Cards",
    cardsTitle: "Card Album",
    cardsSub: (n, total) => `${n} of ${total} collected`,
    cardsWorldChamp: (title) => `✨ ${title} Champion!`,
    cardsWorldComplete: (n) => `All ${n} skills mastered`,
    cardsPlayToCollect: "Play to collect",
    cardsAccuracy: (n) => `🎯 ${n}% correct`,
    cardsAttempts: (n) => `🔁 ${n} rounds`,
    cardsStreak: (n) => `🔥 best streak ${n}`,
    cardsMasteredBy: (name) => `Mastered by ${name}`,
    cardsEmptyTitle: "No cards yet",
    cardsEmptyHint: "Master your first lesson and it becomes a collectible card.",
    cardsEmptyCta: "Find my first lesson",
    worldChampDone: (title) => `🏆 ${title} complete — a golden card is yours!`,
    certBtn: "🖨️ Certificate",
    certTitle: "Certificate of Achievement",
    certThisCertifies: "This certifies that",
    certHasMastered: "has proudly mastered",
    certSkillCount: (n) => `${n} skills`,
    certWithNova: "in Numberverse, guided by Nova the Owl",
    certSigned: "Nova the Owl",
    certDate: "Date",
    certPrint: "🖨️ Print / Save as PDF",
    certBack: "‹ Back",
    certSpeak: (name, world) => `Certificate! ${name}, you mastered ${world}!`,
    /* #1338 — printable worksheet generator (offline PDF via the print sheet). */
    wsTitle: "Practice worksheets",
    wsSub: "Print a practice sheet from the skills that need it",
    wsFor: (name) => `Practice sheet for ${name}`,
    wsNeedsPractice: "Needs practice",
    wsUnmastered: "Not yet mastered",
    wsAll: "All skills",
    wsSelected: (n) => `${n} selected`,
    wsPickHint: "Tap skills to add them to the sheet",
    wsNoSkills: "Nothing to print here yet",
    wsPrint: "🖨️ Print / Save as PDF",
    wsPrintHint: "Print works fully offline — use your device's Save as PDF.",
    wsWarmup: "Warm-up",
    wsSolve: "Solve",
    wsWriteTrace: "Write / trace",
    wsCount: "Count the stars",
    wsBack: "‹ Back",
    /* #1345 — flashcard QR print generator (offline; the scan side shipped in #139). */
    fcTitle: "Flashcard codes",
    fcSub: "Print QR cards that open a skill's game when scanned",
    fcFor: (name) => `Flashcard deck for ${name}`,
    fcPickHint: "Tap skills to turn them into cards",
    fcSelected: (n) => `${n} cards`,
    fcPrint: "🖨️ Print flashcards",
    fcPrintHint: "Cards are offline — a kid scans one with the 📷 Scan a card button on Home.",
    fcHow: "Print, cut, and scan",
    fcScanEntry: "📷 Scan a card",
    fcDrawing: "Drawing cards…",
    fcNoSkills: "Pick skills to make cards",
    fcBack: "‹ Back",
    back: "Back",
    birthMonth: "Month",
    birthDay: "Day",
    birthdayHello: (name) => `Happy Birthday, ${name}! 🎂`,
    birthdayTitle: (name) => `🎂 ${name}'s Birthday`,
    birthdayGift: (n) => `Nova's gift: +${n} coins 🪙`,
    birthdayClaim: "🎁 Collect!",
    birthdayClaimed: "🎁 Gift collected",
    petTitle: "Your pet",
    petStage0: "Egg",
    petStage1: "Hatchling",
    petStage2: "Young",
    petStage3: "Grown",
    petGrow: (pct) => `${Math.round(pct * 100)}% to grow`,
    petFeed: "🍎 Feed pet",
    petFedToday: "Fed 💖",
    petFeedSpeak: "Yum! That was delicious!",
    petHatchSpeak: (name) => `Wow! ${name}, your pet grew up!`,
    petName: "Pet",
    petGrewInto: (stage) => `Your pet grew into a ${stage}! 🎉`,
    /* #1162 — age-graded reward surface: bands 5-7 see a mission bar instead of
     * the nursery pet (streak + badges + achievements + trophy-room entry). */
    missionTitle: "Mission",
    missionSub: "Your training log",
    missionStreak: (n) => `🔥 ${n}-day streak`,
    missionBadges: (n) => `🏅 ${n} badge${n === 1 ? "" : "s"}`,
    missionAchievements: (n) => `📚 ${n} achievement${n === 1 ? "" : "s"}`,
    missionTrophy: "🏆 Trophy Room",
    funnyTitle: "Nova says your name!",
    funnyRobot: "🤖 Robot",
    funnyWhisper: "🤫 Whisper",
    funnyShout: "📢 Shout",
    castleTile: "🏰 Castle",
    castleTitle: "My Castle",
    castleBuilt: (n, total) => `${n}/${total} towers built`,
    castleTowerBuilt: (title) => `${title} tower built!`,
    castleTowerToBuild: (title) => `Finish ${title} to build`,
    castleCrown: "🏰 The castle is complete! King Nova salutes you! 👑",
    castleBuildCta: (title) => `Build the ${title} tower`,
    seasonSnow: "❄️ Winter",
    seasonFlowers: "🌸 Spring",
    seasonFireflies: "✨ Firefly Summer",
    seasonLeaves: "🍂 Autumn",
    festivalBanner: (name, emoji) => `✨ ${emoji} ${name} is here in Numberverse!`,
    fest_boishakh: "Pohela Boishakh",
    fest_eid_fitr: "Eid al-Fitr",
    fest_eid_adha: "Eid al-Adha",
    fest_christmas: "Christmas",
    fest_ramadan: "Ramadan",
    fest_diwali: "Diwali",
    fest_holi: "Holi",
    /* daily quest */
    questTitle: "🎯 Today's Quest",
    questTypeRounds: (n) => `Play ${n} round${n === 1 ? "" : "s"}`,
    questTypeStars: (n) => `Earn ${n} star${n === 1 ? "" : "s"}`,
    questTypeMaster: (n) => `Master ${n} skill`,
    questTypeNewgame: (n) => `Try ${n} new game`,
    questFreshTry: "Try a brand-new game today:",
    questFreshPlay: "Play",
    questFreshNone: "No new games left — play anything! 🎉",
    questProgress: (n, target) => `${n}/${target}`,
    questDoneText: "✅ Quest complete!",
    questReadySpeak: "Quest complete! Come claim your reward!",
    questReward: (n) => `+${n} 🪙 bonus`,
    questCompleteSpeak: (n) => `Quest complete! You won ${n} bonus coins! 🎉`,
    /* #281 — 7-day login calendar */
    calendarTitle: "📅 Daily Rewards",
    calendarHint: "Play every day — a bigger bonus each day",
    calendarDayOf: (d) => `Day ${d} of 7`,
    calendarClaim: (n) => `Collect +${n} 🪙`,
    calendarClaimed: "✓ Collected",
    calendarLocked: "🔒",
    calendarClaimSpeak: (name, n) => `${name}, daily reward collected — ${n} coins! 🎉`,
    // #1473 — warm fresh-start cue after a missed day (no guilt).
    calendarFreshStart: "🌱 Fresh start — play today to begin a new week",
    /* #283 — goal badges */
    badgeTile: "Badges",
    badgeTitle: "🏅 Badge Book",
    badgeSub: (n, total) => `${n} of ${total} badges earned`,
    badgeEarned: "Earned!",
    badgeLocked: "Keep playing to unlock",
    badgeNewSpeak: (name, title) => `${name}, new badge — ${title}! 🎖️`,
    badgeProgress: (current, target) => `${current}/${target}`,
    badgeFirstTitle: "Start here — your first badge is close!",
    /* #289 — long-term achievements book */
    achTile: "Achievements",
    achTitle: "📚 Achievements",
    achSub: (n, total) => `${n} of ${total} achievements unlocked`,
    achUnlocked: "Unlocked!",
    achLocked: "A long-term goal",
    achNewSpeak: (name, title) => `${name}, achievement unlocked — ${title}! 🏆`,
    /* #285 — custom avatar builder */
    avatarTile: "Customize",
    avatarTitle: "🎨 Build Your Buddy",
    avatarSub: "Mix hair, eyes and clothes to make it yours",
    avatarPreview: "Your buddy",
    avatarFace: "Face",
    avatarPartsLabels: { hat: "Hat / Hair", glasses: "Eyes", outfit: "Clothes" },
    avatarNone: "none",
    avatarSave: "✅ Save my look",
    avatarSaveSpeak: (name) => `${name}, your buddy looks amazing! 🎉`,
    avatarFaceNames: {
      fox: "Fox",
      panda: "Panda",
      lion: "Lion",
      frog: "Frog",
      tiger: "Tiger",
      koala: "Koala",
      knight: "Knight",
      mage: "Mage",
      rogue: "Rogue",
      barbarian: "Barbarian",
      ranger: "Ranger",
    },
    avatarPartNames: {
      "🎩": "Top hat",
      "🧢": "Cap",
      "👑": "Crown",
      "🎀": "Bow",
      "🌼": "Flower",
      "🍄": "Mushroom",
      "👓": "Glasses",
      "🕶️": "Sunglasses",
      "🥽": "Goggles",
      "🤓": "Smarty glasses",
      "✨": "Sparkle",
      "🌈": "Rainbow",
      "👕": "T-shirt",
      "👗": "Dress",
      "🥼": "Lab coat",
      "🦺": "Safety vest",
      "🎽": "Sports top",
      "🧥": "Coat",
    },
    avatarPicked: (category, option) => `${category}: ${option}`,
    avatarUnsavedTitle: "Your new look isn't saved yet",
    avatarUnsavedBody: "If you go back, your changes will be lost.",
    avatarUnsavedKeep: "Keep editing",
    avatarUnsavedDiscard: "Leave without saving",
    /* #282 — same-device sibling leaderboard */
    lbTile: "Leaderboard",
    lbTitle: "🥇 Sibling Leaderboard",
    lbSub: "Same device · no cloud",
    lbStatMastery: "Mastered",
    lbStatRounds: "Rounds",
    lbStatStars: "Stars",
    lbYou: "You",
    lbEmpty: "Add a sibling to start comparing progress!",
    lbAddSibling: "➕ Add sibling",
    lbSpeak: (name, rank) => `${name}, you're #${rank} on this device!`,
    /* #277 — land trophy room */
    trTitle: "🏆 Trophy Room",
    trSub: (n, total) => `${n} of ${total} lands conquered`,
    trEarned: "Earned",
    trLocked: "Master every skill to earn",
    trEmpty: "No trophies yet — master a whole land!",
    trNewSpeak: (name, land) => `${name}, you conquered ${land}! 🏆`,
    /* #284 — mastery mystery boxes */
    boxTile: "🎁 Mystery Box",
    boxHint: (n) => `${n} mystery ${n === 1 ? "box" : "boxes"} waiting to open!`,
    boxOpen: "Open",
    boxCapSpeak: "The box will open tomorrow — the daily reward is full!",
    boxRewardSpeak: (name, coins) => `${name}, you found ${coins} coins in the box! 🎁`,
    /* #767 — cap-full "come back tomorrow" names the waiting reward */
    capFullLine: (reward) => `All of today's coins are earned — your ${reward} waits for tomorrow — come back! 🌙`,
    capRewardBox: "mystery box 🎁",
    capRewardCal: "calendar bonus 🪙",
    capRewardBoth: "mystery box 🎁 and calendar bonus 🪙",
    hudCoinsMaxed: "Coins maxed for today! Keep learning — stars still count 🎯",
    hudMastery: "Skill mastery",
    /* #294 — streak-freeze tokens */
    freezePill: (n) => `🧊 ${n}`,
    freezeEarnedSpeak: "You earned a freeze token — your streak is safe!",
    freezeSpentSpeak: "A freeze token saved your streak — keep going!",
    // #1472 — a held token can't cover 2+ missed days: say it gently.
    freezeNotEnough: (n) => `Your 🧊 covers one missed day, but ${n} days passed — fresh start 🌱`,
    /* #288 — kid-friendly voice settings */
    voiceFunTitle: "🗣️ Nova's Voice",
    voiceFunSoft: "🔉 Soft",
    voiceFunNormal: "🔊 Normal",
    voiceFunLoud: "🔔 Loud",
    voiceFunReset: "🔄",
    voiceFunTest: "Say hi",
    /* #286 — star-of-the-week recap */
    recapTitle: "🌟 Star of the Week",
    recapSub: (n) => `${n} day${n === 1 ? "" : "s"} this week`,
    recapTopSkill: "Top skill",
    recapWinMastered: (n) => `${n} skill${n === 1 ? "" : "s"} mastered this week!`,
    recapWinStreak: (n) => `Best streak: ${n} in a row`,
    recapHear: "🔊 Hear my week",
    recapEmpty: "No play this week — come play!",
    recapHomeLine: (days, title) => `${days} day${days === 1 ? "" : "s"} · ⭐ ${title}`,
    recapSpeak: (name, days, title, win) => `${name}, this week you played ${days} day${days === 1 ? "" : "s"}, your top skill is ${title}. ${win}`,
    weekTitle: "Skill of the Week",
    weekSub: "Complete it to earn the Week Warrior badge 🏅",
    weekDone: "Week Warrior badge earned! 🏅",
    /* #280 — beat-the-owl challenge drill */
    chTile: "⚔️ Beat Nova",
    chCard: "Challenge Nova to a math duel — 5 quick rounds",
    chStart: "Start",
    chRound: (n, total) => `Round ${n}/${total}`,
    chYou: "You",
    chNova: "Nova",
    chLevel: (n) => `Level ${n}`,
    chQuestion: "Math duel",
    chCorrect: "✅ Correct!",
    chWrong: "❌ Not quite",
    chNovaGot: "🦉 Nova got it!",
    chNovaMiss: "🦉 Nova missed it!",
    chWin: (name) => `🎉 You beat Nova, ${name}!`,
    chTie: "😮 It's a tie!",
    chLose: (name) => `💪 So close, ${name}! Try again!`,
    chCoins: (n) => `🪙 +${n} coins`,
    chAgain: "Play again",
    chClose: "Back",
    chSpeakWin: (name) => `${name}, you beat Nova! Amazing!`,
    chSpeakTie: "Wow, it is a tie! So close!",
    chSpeakLose: (name) => `${name}, so close! Try again, you can beat Nova!`,
    /* #1164 — intermediate land boss (per-land duel gate) */
    bossBtn: "⚔️ Land Boss",
    bossBtnBn: "⚔️ ভূখণ্ড বস",
    bossBeaten: "✓ Boss beaten",
    bossBeatenBn: "✓ বস পরাজিত",
    bossWin: "Land Boss beaten! 🏆",
    bossWinBn: "ভূখণ্ড বস হারালো! 🏆",
    bossLose: "💪 So close! Try the land boss again!",
    bossTie: "🤝 It's a tie! Try the land boss once more!",
    /* #356 — first-play onboarding tour */
    tourTitle: "How to play",
    tourSkip: "Skip",
    tourNext: "Next",
    tourDone: "Let's go!",
    tourStep1Title: (name) => `Hi ${name}! Welcome to your home`,
    tourStep1Sub: "Tap the big PLAY button to start a fun round.",
    tourStep2Title: "Your learning path",
    tourStep2Sub: "Play through every world — the more you learn, the more lands you unlock.",
    tourStep3Title: "Your buddy Nova",
    tourStep3Sub: "Nova is your pet owl. Play and learn, and it grows with you!",
    tourStep4Title: "And everything else",
    tourStep4Sub: "Tap More for cards, badges, the garden, fun voices and more.",
    /* offline-first */
    offlineReady: "✓ Works offline",
    installBtn: "📲 Get the app",
    nextBadge: "NEXT",
    amazing: "Amazing!",
    earned: (a, n, stars, score, world) => `${a} ${n} earned ${stars} ⭐ and ${score} points in ${world}.`,
    keepGoing: (n, world) => `🔥 Keep going — ${n} more to master in ${world}`,
    greatSession: "🔥 Great session!",
    completeUnlocked: (world, next) => `🏆 ${world} complete — ${next} is unlocked!`,
    playAgain: "Play again",
    nextRound: "Next round",
    worldsBtn: "Worlds",
    homeBtn: "Home",
    moreMenu: "More",
    parentDoor: "Parents",
    wildsLabel: "Nova & my garden",
    round: (r, total) => `Round ${r}/${total}`,
    pickBuddy: "Pick a buddy",
    kidsName: "Kid's name",
    namePlaceholder: "e.g. Aria",
    birthYear: "Birth year",
    ageAt: (age) => `Age ${age} · starts at Sprout Grove`,
    saveKid: (name) => `✨ Save ${name}`,
    langLabel: "🌐 English",
    leaveGame: "Exit game",
    pauseGame: "Pause game",
    kidPauseTitle: "Taking a little break",
    kidPauseBody: "Your game is paused right here. Ready when you are!",
    resumeGame: "▶ Keep playing",
    parentTitle: "Parent Panel",
    parentSub: "See how each kid is growing, skill by skill",
    parentWelcome: (name) => `Hi ${name} 👋`,
    parentFamTitle: "Family overview",
    parentFamKids: (n) => `${n} kids`,
    parentFamStars: (n) => `${n} stars`,
    parentFamPoints: (n) => `${n} points`,
    parentFamSessions: (n) => `${n} sessions`,
    parentFamMastered: (n) => `${n} mastered`,
    parentPortalTitle: "🖥️ Parent Portal",
    parentPortalSub: "Manage everything from the portal — add & remove kids, set learning limits, see the weekly report, and secure the account.",
    parentPortalCta: "Open Parent Portal",
    gateTitle: "Welcome, parent!",
    gateSub: "Sign in to keep your child's learning safe and see their progress.",
    gateSignin: "Sign in",
    gateSignup: "Create account",
    gateNameLabel: "Your name",
    gateNamePh: "e.g. Aisha",
    gateEmailLabel: "Email",
    gateEmailPh: "you@example.com",
    gatePassLabel: "Password",
    gatePassPh: "at least 6 characters",
    gateShowPass: "Show or hide password",
    gatePassHint: "Use at least 6 characters — a mix of letters and numbers is even stronger.",
    gatePassOk: "Great — that's long enough!",
    gateSubmitIn: "🔓 Sign in",
    gateSubmitUp: "✨ Create account",
    gateBusy: "Working…",
    gateErrorInvalid: "Sign-in failed — check the email and password.",
    gateErrorSignup: "Couldn't create the account — maybe that email is already registered.",
    gateGuest: "Skip for now — guest mode",
    gateGuestSub: "No account? Play instantly. Progress stays on this device, private and ad-free.",
    // #1541 — name the COPPA age range, what IS stored, and the parent's
    // export/delete rights instead of a bare "trust us" line.
    gatePrivacy: "🔒 Ages 2-13. No ads, no tracking, no selling data. We keep only what makes it work — your child's name and progress — and you can export or delete it anytime.",
    gateWelcome: (name) => `Hi ${name} 👋 — here's what your child will learn`,
    gatePower: "You can always return here from Parent Panel → What kids learn.",
    gateContinue: "Start learning →",
    gateGoogleOr: "or continue with email",
    gateErrorGoogle: "Google sign-in didn't work — try email or guest instead.",
    gateGoogleGone: "Google sign-in isn't available right now — email below works too.",
    gateGoogleNetwork: "Google sign-in couldn't reach the internet — check your connection and try again.",
    gateGoogleBusy: "Google sign-in is already underway — one moment…",
    gateGoogleRetry: "Retry",
    gateGoogleUnavailable: "Google sign-in isn't available here — use email below, or open this app over HTTPS.",
    welcomeTitle: "Welcome to Numberverse",
    welcomeSub: "Pick a language — the whole app will speak it. You can change it anytime in Settings.",
    welcomeLangLabel: "Choose your language",
    welcomeEnglish: "🇬🇧 English",
    welcomeBangla: "🇧🇩 বাংলা",
    langSwitched: "English! Hello!",
    welcomeGuest: "🎮 Continue as guest",
    welcomeGuestSub: "No account? Jump straight in — progress stays private on this device.",
    guestConfirm: "Tap again to leave the parent account and play as guest",
    guestModeWipe: "Guest mode — progress lives only on this device. Clearing the browser erases the journey.",
    guestUpgradeTitle: "Keep progress everywhere",
    guestUpgradeCta: "Sign in / create account",
    welcomeOr: "or",
    welcomeSignin: "👨‍👩‍👧 I'm a parent — sign in",
    welcomeSyllabus: "📚 What kids learn — no sign-in needed",
    syllabusGuestNote: "You're browsing as a guest — sign in to keep your child's progress on every device.",
    syllabusTitle: "What kids learn",
    syllabusSub: "One guided path, built the way a child's mind grows — numbers first, then games, then questions.",
    syllabusWhat: "👨‍👩‍👧 Every step your child takes, in order",
    syllabusGame: "🎮 play it",
    syllabusStart: "🚀 Start learning",
    syllabusFab: "Start",
    syllabusHow: "The learning ladder",
    syllabusHow1: "1 · Numbers first — your child meets every number before any calculation.",
    syllabusHow2: "2 · Games teach the idea — apples, sharing, arrays make it real.",
    syllabusHow3: "3 · Questions come last — once the idea is seen, the drill makes it stick.",
    syllabusProgress: (done, total) => `${done}/${total} mastered`,
    syllabusTap: "Tap a world to explore its lessons",
    syllabusBadge: (band) => `Band ${band}`,
    syllabusMastered: "✓ mastered",
    syllabusNotStarted: "not started",
    syllabusDone: "All worlds",
    syllabusOpen: "What kids learn",
    settingsTitle: "Settings",
    settingsSub: "Make it yours",
    settingsSyllabus: "📚 What kids learn",
    parentSignoutTitle: "🚪 Sign out",
    parentSignoutSub: "This device will leave the parent account — local progress stays. Sign back in anytime to keep it everywhere.",
    parentSignoutCta: "Sign out",
    parentSignoutConfirm: "Tap again to confirm",
    /* parent PIN lock (#86) */
    pinTitle: "🔒 Parent PIN",
    pinUnlockSub: "Enter the 4-digit PIN to open the parent area",
    pinSetTitle: "Set a parent PIN",
    pinSetSub: "Choose a 4-digit PIN — you'll need it every time the parent area opens",
    pinConfirmTitle: "Confirm your PIN",
    pinConfirmSub: "Enter the same 4 digits again",
    pinChangeTitle: "Change PIN",
    pinChangeSub: "Enter your current PIN",
    pinNewTitle: "New PIN",
    pinWrong: (n) => (n === 1 ? "Wrong PIN — 1 try left" : `Wrong PIN — ${n} tries left`),
    pinLocked: "PIN pad locked",
    pinLockedSub: "Too many wrong tries. Answer your security question to reset the PIN here.",
    pinForgot: "Forgot PIN?",
    pinForgotSub: "Answer your security question to reset it here — no sign-out needed.",
    pinForgotNoQaSub: "Verify your parent account to reset the PIN here — no sign-out needed.",
    pinRecoverCta: "Verify & reset PIN",
    pinRecoverWithPassword: "Use parent password instead",
    pinResetArmed: "Reset PIN & sign out?",
    pinResetCta: "Reset & sign out",
    pinMismatch: "PINs don't match — start over",
    pinCurrentWrong: "That's not your current PIN",
    pinCryptoError: "This device can't secure a PIN right now — try again in a supported browser.",
    pinKeep: "Never share your PIN with your child",
    pinLockCardTitle: "🔐 PIN lock",
    pinLockCardSub: "The parent area opens with a 4-digit PIN",
    pinSet: "Set PIN",
    pinChange: "Change PIN",
    /* #247 — PIN recovery Q&A */
    secPanelTitle: "🔐 PIN recovery question",
    secPanelSub: "A security question lets you reset a forgotten PIN right here — no sign-out needed.",
    secPanelSet: "Set recovery question",
    secPanelChange: "Change question",
    secPanelHas: "Recovery question set ✓",
    secPickTitle: "Pick a recovery question",
    secPickSub: "You'll answer this to reset the PIN if you ever forget it.",
    secAnswerTitle: "Your answer",
    secAnswerSub: "Type something only you know.",
    secConfirmTitle: "Repeat your answer",
    secNext: "Next",
    secSave: "Save",
    secSkip: "Skip for now",
    secCancel: "Cancel",
    secAskTitle: "Recover your PIN",
    secAskSub: "Answer your security question to reset the PIN on this device.",
    secQuestion: "Your question",
    secAnswerPlaceholder: "Type your answer",
    secWrong: "That doesn't match — try again.",
    secWrongTries: (n) => (n === 1 ? "That doesn't match — 1 try left." : `That doesn't match — ${n} tries left.`),
    secLocked: "Too many wrong answers.",
    secLockedSub: "Use your parent password to reset the PIN instead.",
    secPasswordTitle: "Verify your parent account",
    secPasswordSub: "Enter the email and password for this parent account to reset the PIN here — no sign-out needed.",
    secEmpty: "Type an answer first.",
    secRecovered: "PIN reset — now set a new 4-digit PIN below.",
    secMismatch: "Answers don't match — start over.",
    secCryptoError: "This device can't secure the security answer right now — try again in a supported browser.",
    settingsAboutSub: "Numberverse · built for curious kids, offline & ad-free",
    settingsVoice: "🔊 Voice & reading",
    settingsVoiceOk: (v) => `Voice ready: ${v}`,
    settingsVoiceNone: "No voice found — install a voice in Settings → Accessibility → Spoken Content",
    settingsVoiceTest: "Test voice",
    settingsDictate: "🎙️ Record my voice",
    settingsDictateSub: "Record yourself saying your answer, then replay it. Stays on this device — never sent anywhere.",
    settingsDictateStart: "⏺️ Record",
    settingsDictateStop: "⏹ Stop",
    settingsDictateDenied: "Mic permission was denied — allow the mic in your browser settings.",
    settingsDictateUnsupported: "Recording isn't supported in this browser.",
    settingsDictateClear: "Delete",
    settingsSecSound: "🔊 Sound & voice",
    /* #248 — quiet hours */
    quietBadge: "Quiet time — tap for full sound",
    quietBadgeOn: "Full sound this session — tap to quiet again",
    settingsSecScreen: "🖥️ Screen",
    projectorToggle: "📽️ Classroom projector",
    projectorToggleSub: "Big, bright type for a classroom screen — the parent area is hidden.",
    projectorOn: "Projector is on",
    projectorOff: "Projector is off",
    projectorKeyHint: "Press Enter to play · Esc to exit fullscreen",
    // 🧏 #250 — global accessibility (shared with the parent portal).
    a11yBigText: "🔍 Big text",
    a11yBigTextSub: "Larger type everywhere — also on the parent portal",
    a11yHighContrast: "🎨 High contrast",
    a11yHighContrastSub: "Bolder borders, brighter text, clearer focus",
    a11yBigTextOn: "Big text is on",
    a11yBigTextOff: "Big text is off",
    a11yHighContrastOn: "High contrast is on",
    a11yHighContrastOff: "High contrast is off",
    settingsReduceMotion: "Reduce motion",
    settingsReduceMotionSub: "Fewer moving parts — calmer play",
    // 🦋 #1442 — in-flow calm mode (kid-understandable reduced-motion toggle).
    calmButton: "Calm mode",
    calmTitle: "Calm mode",
    calmBody: "Turn on calm mode to slow the moving parts. You can turn it off anytime.",
    calmOn: "Calm mode on",
    calmOff: "Calm mode off",
    settingsSecLanguage: "🌐 Language",
    langSwitch: "Switch language",
    settingsSecLearning: "📚 My learning",
    settingsSecParents: "👨‍👩‍👧 For parents",
    settingsMusicOff: "A parent turned music off for this profile.",
    settingsHaptics: "Tap vibration",
    settingsParentsHint: "Progress, per-kid controls and the full portal — grown-ups only.",
    settingsParentsGo: "Open parent area",
    settingsParentsSignin: "Sign in as parent",
    settingsMusicRow: "Sound", // #1468 — one kid-facing switch now covers music + SFX
    settingsVoiceNeural: (v) => `Neural Bangla voice — ${v} (offline)`,
    settingsVoiceOff: "Reading is off",
    settingsReadingOff: "A parent turned reading off — ask them to turn it back on.",
    settingsVoiceDownload: (pct) => `Downloading Bangla voice… ${pct}%`,
    settingsSyncOk: "✓ All stories saved on this device",
    settingsSyncWorking: "Saving stories…",
    settingsSyncOffline: "Not connected — stories stay on this device",
    settingsSyncError: "Couldn't save — I'll try again",
    settingsSyncIdle: "Ready — stories save as you play",
    starsTotal: (n) => `${n} stars earned`,
    points: (n) => `${n} points`,
    sessions: (n) => `${n} sessions`,
    parentSkills: "Skills",
    music: "🔊 Music on",
    musicMuted: "🔇 Music off",
    install: "Install app",
    shareProgress: "📤 Share progress",
    shareShare: "Share",
    shareCardTitle: "🎉 Numberverse",
    shareCardFooter: "Made with Numberverse — kids learn math & Bangla, offline, no ads.",
    shareStatsStars: "Stars",
    shareStatsScore: "Points",
    shareStatsSessions: "Sessions",
    shareWorldsTitle: "Worlds",
    shareRewardSpeak: (name) => `${name}'s progress was shared! You earned +5 coins! 🎉`,
    shareRewardToast: "🎉 Shared! +5 coins for your kid",
    shareWhatsApp: "WhatsApp",
    shareDone: "✓ Shared",
    shareDownloaded: "✓ Downloaded — attach it in WhatsApp",
    shareFail: "Couldn't share on this device",
    shareProgressCaption: (name) => `${name} has been playing Numberverse — math & Bangla, offline, no ads! kids.munna-khan.xyz`,
    digestBtn: "📄 Weekly digest",
    digestEmpty: "No stories yet this week — a few games and the digest will fill up.",
    digestDone: "Weekly digest downloaded ✓",
    digestHeader: (name, week) => `Numberverse — weekly learning digest\nKid: ${name}\nWeek: ${week}`,
    digestStats: (total, solved, tricky) => `${total} moments · ${solved} solved · ${tricky} tricky`,
    digestSolved: "solved",
    digestTricky: (n) => `${n} misses`,
    digestMoni: (code) => `Moni spotted: ${code}`,
    certShare: "📤 Share",
    certShareFooter: "Made with Numberverse — kids learn math & Bangla, offline, no ads.",
    certShareCaption: (name, world) => `${name} mastered ${world} in Numberverse! 🏆 kids.munna-khan.xyz`,
    voiceTitle: "🔊 Voice check",
    voicePlatform: (p) => `Device: ${p}`,
    voiceTest: "Play test line",
    voiceBnOk: (v) => `Bangla voice: ${v} ✓`,
    voiceBnMissing: "No Bangla voice installed — open Settings → Text-to-speech and install Bengali.",
    voiceEnOk: (v) => `English voice: ${v}`,
    voiceNone: "Speech not available on this device/browser.",
    voiceNeuralReady: "On-device Bangla neural voice ready — same voice everywhere, works offline ✓",
    voiceNeuralLoading: (pct) => `On-device Bangla neural voice downloading… ${pct}%`,
    voiceNeuralError: "Neural voice unavailable — Bangla falls back to the device voice.",
    voiceNeuralIdle: "On-device Bangla neural voice downloads on first use (once, then offline forever).",
    voiceRetry: "Try again",
    voiceDlFailed: "The Bangla voice download didn't finish — tap to try again, or the device voice reads meanwhile.",
    settingsVoiceNoBn: "No Bangla voice on this device yet — the on-device voice downloads on first use.",
    voiceCacheHit: (pct) => `🎙️ Voice cache: ${pct}% of lines instant (on-device, offline)`,
    voicePickTitle: "🎙️ Bangla voice",
    voicePickHint: "Pick who reads Bangla — all on-device, same on every device.",
    voicePickFemale: "Warm adult (female)",
    voicePickKid: "Kid voice",
    voicePickSoft: "Soft female",
    voicePickWarm: "Friendly male",
    voicePickListen: "Listen",
    mastered: "Mastered",
    playLimitReached: "🦉 Wow, you played so much today! Come back tomorrow 💤",
    capWindDown: (mins) => `🌙 Almost time to rest — about ${mins} more minute${mins === 1 ? "" : "s"} for today.`,
    goalLine: (cur, goal) => `🎯 Daily goal: ${cur}/${goal} min`,
    goalNudge: "🎉 You reached today's goal — amazing! Nova's proud of you. Want a quick break or keep going?",
    goalNudgeTakeBreak: "Take a break",
    goalNudgeKeepGoing: "Keep playing",
    focusChip: (label, band) => `📌 Focus: ${label} · World ${band}`,
    parentHelpTitle: "Needs a little help",
    parentHelpNone: "All caught up! 🎉",
    parentHelpOpen: (n) => `${n} to finish`,
    parentHelpWrong: (n) => `${n} misses`,
    reteachLetTry: "Almost! Let's practice this a different way 💪",
    practicePill: "Practice!",
    inProgress: "In progress",
    notStarted: "Not started",
    /* 🧠 MONI */
    moniTitle: "Moni the Tutor",
    moniTag: "What Moni learned about your child",
    /* ❌ #78 wrong-answer history */
    mistakesTitle: "❌ Wrong answers",
    mistakesSub: "What your child is still working on — per day, per skill",
    mistakesHeatTitle: "Last 28 days",
    mistakesDayLabel: (date, n) => `${date} — ${n} ${n === 1 ? "wrong answer" : "wrong answers"}`,
    mistakesSkillWrong: (n) => `${n} wrong`,
    mistakesEmpty: "No wrong answers in the last 28 days — wonderful! 🎉",
    mistakesNoneDay: "Nothing tricky on this day",
    mistakesWeekday: "S M T W T F S",
    moniLearnStyle: "Learning style",
    moniBestGame: "Loves",
    moniAttention: "Focus",
    moniConfidence: "Confidence",
    moniConfidenceGentle: "gentle — needs kind wins",
    moniConfidenceSteady: "steady — balanced",
    moniConfidenceChallenging: "ready for a challenge",
    moniMisconceptions: "Patterns spotted",
    moniMisconceptionsNone: "None yet — Moni is still watching",
    moniNextMove: "Moni's next move",
    moniTone: "Tone",
    moniSessionLength: "Best session",
    moniSessionHint: (n) => `Moni saw you stay sharp for ~${n} rounds — keep going or take a break, your call 💛`,
    moniGoals: "Moni's 3 next skills",
    moniGoalFocus: "the main focus right now",
    moniGoalWeak: "still needs work",
    moniGoalReview: (n) => `brush up in ${n} day${n === 1 ? "" : "s"}`,
    moniStrictness: "How hard should Moni push?",
    moniStrictnessHelp: "Gentle eases difficulty back, challenging takes it a step up. Changes instantly, offline.",
    moniStrictnessGentle: "Gentle",
    moniStrictnessSteady: "Steady",
    moniStrictnessChallenging: "Challenging",
    moniReviewGentle: "Moni says: a quick review keeps it sharp — no rush!",
    moniReviewTap: (n) => (n === 1 ? "Tap to brush up" : "Tap to brush up"),
    breakTitle: (name) => `Stretch time, ${name}!`,
    breakBody: "Your brain just worked super hard, and Nova is proud. A little break makes the next game even more fun!",
    breakRest: "OK, stretch break",
    breakKeepGoing: "I'm good — keep going!",
    pauseTitle: "😴 A short learning break",
    pauseBody: "Your grown-up paused learning for a little while. Come back soon — Nova will be right here waiting!",
    pauseBackSoon: "⏳ Grown-ups can tap Resume whenever you're ready.",
    moniWeek: "📅 This week",
    moniWeekRounds: "Rounds",
    moniWeekAcc: "Accuracy",
    moniWeekPace: "Pace",
    moniWeekStyle: "Learning style",
    moniWeekBestGame: "Best game",
    moniWeekPaceUp: "Stronger than usual 💪",
    moniWeekPaceDown: "A bit softer this week 🐢",
    moniWeekPaceFlat: "Steady as always ⚖️",
    moniStyleFast: "⚡ Speed Sprinter",
    moniStyleSteady: "🐢 Steady Pal",
    moniStyleSocial: "🦉 Friend of All",
    contrastTrigger: (name) => `Moni spotted a pattern in ${name} — fix it together!`,
    contrastTriggerSub: "A short side-by-side game, no pressure",
    contrastRight: "Correct! You spotted the pattern! 🎉",
    a11yRight: "Nice — that's right!",
    a11yWrong: "Not quite — try again, Nova will help.",
    a11yMastered: (title) => `You mastered ${title}!`,
    a11yVoiceOn: "Reading is on.",
    a11yVoiceOff: "Reading is off.",
    a11yMusicOn: "Sound is on.", // #1468 — covers music + SFX
    a11yMusicOff: "Sound is off.", // #1468 — covers music + SFX
    contrastOops: (correct) => `That's the trick! The answer is ${correct}. Try again!`,
    contrastDoneTitle: "Pattern beaten! 🏆",
    contrastDoneBody: "You looked at them side by side and found the difference. Moni is SO proud — let's keep it sharp!",
    contrastDoneBtn: "Back to the adventure",
    contrastProgress: (cur, total) => `Pattern round ${cur} of ${total}`,
    kothaInspector: "📚 Learning stories",
    kothaInspectorSub: "What was tried, how Moni read it, what we did",
    kothaFilterAll: "All",
    kothaFilterWrong: "Wrong",
    kothaFilterCorrect: "Correct",
    kothaEmpty: "No stories yet — play a round and the story log fills up.",
    kothaKindMisconception: "misconception",
    kothaKindGap: "gap",
    kothaKindFatigue: "fatigue",
    kothaKindGuessing: "guessing",
    kothaKindSlip: "slip",
    kothaAction: "Moni",
    kothaAgo: (ts) => {
      const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (s < 60) return "just now";
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      return `${d}d ago`;
    },
    kothaCorrect: "Correct",
    kothaWrong: "Wrong",
    moniTrendUp: "improving 📈",
    moniTrendFlat: "steady ➖",
    moniTrendDown: "needs support 📉",
    moniSessions: (n) => `${n} sessions`,
    moniRounds: (n) => `${n} rounds`,
    /* Nova companion */
    novaTitle: "Nova the Owl",
    novaTagline: "Earn coins in games — dress up Nova!",
    novaMeet: "Meet Nova",
    novaTapHint: "🦉 Tap Nova!",
    novaCoins: (n) => `${n} coins`,
    novaStreak: (n) => `${n}-day streak`,
    // #1474 — streak badge teaser: names tomorrow's calendar reward.
    streakTomorrow: (n) => `tomorrow +${n} 🪙`,
    novaCareFed: "Feed Nova",
    novaCarePlay: "Play",
    novaShop: "Outfit shop",
    novaEquip: "Wear",
    novaEquipped: "Wearing",
    novaNeedCoins: "Play games to earn more coins! 💪",
    novaDailyEarned: (n) => `${n}/20 coins earned today`,
    novaHello: "Whoo! I'm Nova — let's have fun!",
    novaFeedMsg: "Yummy! Thanks! 🍎",
    novaPlayMsg: "Whee! That was fun! 🎈",
    novaTapMsg: "Whoo-hoo! 😄",
    novaEquipMsg: "Ooh, I love this outfit! 💛",
    novaPlayGames: "Play games & earn coins",
    rankLabel: "Your rank",
    rankNextNeed: (next, need) => `${need} more lesson${need > 1 ? "s" : ""} to become ${next}`,
    newSkill: (n) => (n === 1 ? "🌟 New skill mastered!" : `🌟 ${n} new skills mastered!`),
    masterySpeak: (title) => `Wow! You mastered ${title}! 🎉`,
    gardenTile: "My Garden",
    gardenHint: "Answer right — plants grow!",
    /* #769 — home teaser: plants/fruits + a "new growth!" cue */
    gardenTileSum: (plants, fruits) => `🌱 ${plants} plants · ${fruits} fruitful`,
    gardenTileFresh: "new growth!",
    gardenTileEmpty: "Tap to grow your first plant 🌱",
    /* 🦉 3D Nova island (#684) */
    island3dBtn: "✨ 3D Island",
    islandTitle: "🦉 Nova's 3D Island",
    islandLoading: "Building the island…",
    loadingGame: "Loading game…",
    gameLoadError: "The game couldn't load this time.",
    gameLoadErrorHint: "Check your connection, then tap to try again.",
    gameLoadRetry: "Try again",
    storageFull: "This device can't save progress right now — please ask a grown-up to free some space.",
    islandBeta: "New · beta",
    islandHint: "Drag to look around · pinch to zoom",
    islandNoWebgl: "3D isn't supported on this device — back to 2D Nova!",
    islandBack: "‹ Back",
    islandPlayGames: "🎮 Play games (2D)",
    islandBack2d: "Return to 2D Nova",
    islandRoomPrev: "Previous room",
    islandRoomNext: "Next room",
    islandActions: "Nova's actions",
    islandIn2d: "2D",
    islandDressup: "Dress up",
    islandDressupNatural: "Natural",
    islandDressupGold: "Gold",
    islandDressupRosy: "Rosy",
    islandDressupMint: "Mint",
    islandWalkHint: "Tap the floor to walk Nova",
    islandCoins: "Coins",
    islandGardenGrew: "Your garden grew!",
  },
  bn: {
    appTagline: "আপনার সন্তানরা স্মার্টভাবে শিখুক — বাংলা, ইংরেজি, গণিত ও আরও।",
    agesBadge: "২–১৩ বছর · কোনো বিজ্ঞাপন নেই",
    play: "▶ খেলুন",
    playWith: (n) => `▶ খেলো, ${n}!`,
    fullscreen: "⛶ পূর্ণ পর্দা",
    fullscreenOff: "⛶ পর্দা ছোট করুন",
    syncIdle: "সিঙ্কের অপেক্ষায়…",
    syncOk: "✓ শেখার খবর ক্লাউডে সংরক্ষিত",
    syncSyncing: "সিঙ্ক হচ্ছে…",
    syncOffline: "অফলাইন — শেখার খবর এই ডিভাইসে সংরক্ষিত",
    syncError: "সিঙ্কে সমস্যা — আবার চেষ্টা হবে",
    storyQueueNote: (n) => `${n}টি শেখার মুহূর্ত এই ডিভাইসে সংরক্ষিত — অনলাইন হলে ক্লাউডে পৌঁছে যাবে 📚`,
    pickKid: "👶 বাচ্চা বাছাই করুন",
    switchKid: (a, n) => `${a} ${n} — পরিবর্তন করুন`,
    // #22 — sibling co-op: two kids, one device, alternating turns.
    siblingCoop: "ভাই-বোনের খেলা",
    passDevice: "হাত বদল",
    passTo: (name) => `${name}-কে দাও`,
    nowPlaying: (name) => `এখন খেলছে ${name}`,
    youBadge: "তুমি",
    coopHint: "দুই ভাই-বোন, একটি ডিভাইস — পালা করে খেলো!",
    // #139 — flashcard QR → mini-game tie-in.
    scanCard: "কার্ড স্ক্যান করো",
    scanShort: "স্ক্যান",
    scanTitle: "ফ্ল্যাশকার্ড স্ক্যান করো",
    scanHint: "ফ্ল্যাশকার্ড QR-এর দিকে ক্যামেরা রাখো — অথবা নিচে কোডটি লিখো।",
    scanCodePlaceholder: "NV:skillId (বা শুধু skillId)",
    scanLaunch: "খেলা খুলো",
    scanNotCard: "এই কোডটি নম্বরভার্স কার্ড নয়",
    scanCameraDenied: "ক্যামেরা পাওয়া যায়নি — বদলে কার্ডের কোডটি লিখো",
    scanClose: "বাতিল",
    parentZone: "👨‍👩‍👧 মা-বাবার জায়গা",
    parentNote:
      "দক্ষতা দিয়ে জগৎ খোলে, বয়স দিয়ে নয় — পরের জগৎ খুলতে আগের জগতের দক্ষতা আয়ত্ত করুন।",
    whoPlaying: "কে খেলবে?",
    pickProfile: "প্রোফাইল বাছাই বা নতুন যোগ করুন",
    addKid: "নতুন বাচ্চা",
    addKidSub: "দক্ষতা দিয়ে জগৎ খোলে, বয়স নয়",
    upTo4: "পরিবারে সর্বোচ্চ ৪টি",
    kidsFull: "পরিবার পূর্ণ",
    kidsFullSub: "প্রতি পরিবারে সর্বোচ্চ ৪ জন",
    skillsMastered: (n) => `${n}টি দক্ষতা আয়ত্ত`,
    worldsOpen: (n) => `${n}/৫টি জগৎ খোলা`,
    worldsOf: (name) => `${name} এর জগৎ`,
    masterSkillsSub: "পরের জগৎ খুলতে দক্ষতা আয়ত্ত করুন",
    worldComplete: "জগৎ সম্পন্ন! 🎉",
    // #1484 — খালি জমিতে ভুয়া ০/১ দেখানো যাবে না।
    worldNoLessons: "এই জমিতে এখন কোনো পাঠ নেই",
    // #1483 — বন্ধ জমিতে চাপ দিলে স্বীকার করো + লক্ষ্য বলো।
    mapLockedSpeak: (more, prev) => `${prev} এখনও বন্ধ — এটি খুলতে সেখানে আর ${bnNum(more)}টি দক্ষতা আয়ত্ত করো।`,
    // #1486 — অভিভাবকের অসুবিধার সীমাই এই জমি বন্ধ রাখার আসল কারণ।
    worldLockedCap: "অভিভাবকের সেটিংসে এই জমিটি বন্ধ আছে",
    journey: "যাত্রা",
    worldsLabel: "জগৎ",
    mapTab: "মানচিত্র",
    mapSub: "একটি জীবন্ত মানচিত্র — যে জমিতে খেলতে চাও, সেটিতে চাপ দাও",
    mapHere: "তুমি এখানে!",
    mapLand: "জমি",
    mapLandProg: (m, t) => `${m}/${t} আয়ত্ত`,
    mapRoadOpen: (world) => `${world}-এর পথ খুলে গেছে! 🎉`,
    journeySub: "নোভা পথ ধরে এগোয় — একটি পাঠ আয়ত্ত করলেই পরের ডটে পৌঁছবে",
    journeyProgress: (m, t) => `${m}/${t} পাঠ আয়ত্ত`,
    journeyLocked: "উপরের পাঠটি আয়ত্ত করলে এটা খুলবে",
    journeyTapHint: "🦉 নোভা এখানে — খেলতে চাপ দিন!",
    journeyDone: "🏆 সব পাঠ আয়ত্ত — পুরো যাত্রা শেষ করেছ!",
    masterMoreIn: (n, prev) => `${prev} এ আর ${n}টি আয়ত্ত করলে খুলবে`,
    skillsProg: (m, t) => `${m}/${t} দক্ষতা আয়ত্ত`,
    champion: "🏆 সব জগৎ আয়ত্ত — তুমি Numberverse চ্যাম্পিয়ন!",
    worldAges: (range, m, t) => `${range} বছর · ${m}/${t} দক্ষতা আয়ত্ত`,
    masterMoreToUnlock: (n, name) => `${name} খুলতে আর ${n}টি আয়ত্ত করুন`,
    readyFor: (name) => `${name} এর জন্য তুমি প্রস্তুত!`,
    playNext: (title) => `▶ পরবর্তী: ${title}`,
    nextLesson: (title) => `পরের পাঠ: ${title}`,
    practiceAgain: "▶ আবার অনুশীলন",
    // #1420 — beat-your-best CTA for the recommended next skill / replay.
    beatYourBest: "▶ তোমার সেরাটা ছাড়িয়ে যাও!",
    // 🚀 #249 — skip-ahead (লগ হয়, অভিভাবক অ্যাকসেলারেশন প্ল্যানে দেখতে পাবেন)।
    skipAhead: "⏭ আমি এটা জানি",
    skipAheadHint: (title) => `"${title}" কি জানা আছে? বাদ দাও — আমরা তোমার অগ্রগতিতে লিখে দেব।`,
    skipDone: "⏭ বাদ দেওয়া হয়েছে!",
    skipLogged: (title) => `লেখা হয়েছে — "${title}" তুমি বাদ দিয়েছ। অভিভাবক প্ল্যানে দেখতে পাবেন।`,
    treeTitle: "🌳 দক্ষতা বৃক্ষ",
    treeHint: "সোজা সেই পাঠে যেতে পাতায় চাপ দাও",
    homeHello: (name) => `হু! হাই ${name}!`,
    homePath: "তোমার পথ",
    homeViewJourney: "সম্পূর্ণ যাত্রা ›",
    welcomeBack: (name) => `ফিরে এসো, ${name}! 💛`,
    questRest: "🌙 আজকের খেলা শেষ — দারুণ! কাল আবার মিশন শুরু হবে।",
    cardsTile: "আমার কার্ড",
    cardsTitle: "কার্ড অ্যালবাম",
    cardsSub: (n, total) => `${bnNum(n)}/${bnNum(total)}টি সংগৃহীত`,
    cardsWorldChamp: (title) => `✨ ${title} চ্যাম্পিয়ন!`,
    cardsWorldComplete: (n) => `${bnNum(n)}টি দক্ষতা আয়ত্ত`,
    cardsPlayToCollect: "খেললে পাবে",
    cardsAccuracy: (n) => `🎯 ${bnNum(n)}% সঠিক`,
    cardsAttempts: (n) => `🔁 ${bnNum(n)}টা রাউন্ড`,
    cardsStreak: (n) => `🔥 সর্বোচ্চ ধারা ${bnNum(n)}`,
    cardsMasteredBy: (name) => `${name} আয়ত্ত করেছে`,
    cardsEmptyTitle: "এখনো কোনো কার্ড নেই",
    cardsEmptyHint: "প্রথম পাঠটি আয়ত্ত করো, সেটি সংগ্রহযোগ্য কার্ড হয়ে যাবে।",
    cardsEmptyCta: "আমার প্রথম পাঠ খুঁজি",
    worldChampDone: (title) => `🏆 ${title} শেষ — তোমার সোনালি কার্ড!`,
    certBtn: "🖨️ সনদ",
    certTitle: "অর্জনের সনদ",
    certThisCertifies: "এতে প্রমাণিত হয় যে",
    certHasMastered: "গর্বের সাথে আয়ত্ত করেছে",
    certSkillCount: (n) => `${bnNum(n)}টি দক্ষতা`,
    certWithNova: "Numberverse-এ, নোভা প্যাঁচার সাথে",
    certSigned: "নোভা প্যাঁচা",
    certDate: "তারিখ",
    certPrint: "🖨️ প্রিন্ট / PDF সংরক্ষণ",
    certBack: "‹ ফিরে যাও",
    certSpeak: (name, world) => `সনদ! ${name}, তুমি ${world} আয়ত্ত করেছ!`,
    /* #1338 — printable worksheet generator (offline PDF via the print sheet). */
    wsTitle: "অনুশীলন ওয়ার্কশিট",
    wsSub: "যে দক্ষতায় অনুশীলন দরকার, তার প্রিন্টযোগ্য পাতা",
    wsFor: (name) => `${name}-এর অনুশীলন পাতা`,
    wsNeedsPractice: "অনুশীলন দরকার",
    wsUnmastered: "এখনো আয়ত্ত হয়নি",
    wsAll: "সব দক্ষতা",
    wsSelected: (n) => `${bnNum(n)}টি বাছাই`,
    wsPickHint: "পাতায় যোগ করতে দক্ষতায় ট্যাপ করো",
    wsNoSkills: "এখানে এখনো কিছু নেই",
    wsPrint: "🖨️ প্রিন্ট / PDF সংরক্ষণ",
    wsPrintHint: "প্রিন্ট সম্পূর্ণ অফলাইনে চলে — ডিভাইসের Save as PDF ব্যবহার করো।",
    wsWarmup: "গরম করা",
    wsSolve: "সমাধান করো",
    wsWriteTrace: "লেখো / ধরে লেখো",
    wsCount: "তারা গুনো",
    wsBack: "‹ ফিরে যাও",
    /* #1345 — flashcard QR print generator (offline; the scan side shipped in #139). */
    fcTitle: "ফ্ল্যাশকার্ড কোড",
    fcSub: "QR কার্ড ছাপো — স্ক্যান করলে সেই দক্ষতার খেলা খুলবে",
    fcFor: (name) => `${name}-এর ফ্ল্যাশকার্ড ডেক`,
    fcPickHint: "কার্ড বানাতে দক্ষতায় ট্যাপ করো",
    fcSelected: (n) => `${bnNum(n)}টি কার্ড`,
    fcPrint: "🖨️ ফ্ল্যাশকার্ড ছাপো",
    fcPrintHint: "কার্ড অফলাইনে চলে — বাড়ির পেজের 📷 কার্ড স্ক্যান বাটনে স্ক্যান করলেই খেলা খুলবে।",
    fcHow: "ছাপো, কাটো, আর স্ক্যান করো",
    fcScanEntry: "📷 কার্ড স্ক্যান",
    fcDrawing: "কার্ড আঁকা হচ্ছে…",
    fcNoSkills: "কার্ড বানাতে দক্ষতা বাছাই করো",
    fcBack: "‹ ফিরে যাও",
    back: "ফিরে যাও",
    birthMonth: "মাস",
    birthDay: "দিন",
    birthdayHello: (name) => `জন্মদিনের শুভেচ্ছা, ${name}! 🎂`,
    birthdayTitle: (name) => `🎂 ${name}-এর জন্মদিন`,
    birthdayGift: (n) => `নোভার উপহার: +${bnNum(n)} কয়েন 🪙`,
    birthdayClaim: "🎁 সংগ্রহ করো!",
    birthdayClaimed: "🎁 উপহার সংগৃহীত",
    petTitle: "তোমার পোষা",
    petStage0: "ডিম",
    petStage1: "ছানা",
    petStage2: "ছোট্ট",
    petStage3: "বড়ো",
    petGrow: (pct) => `${bnNum(Math.round(pct * 100))}% বড় হওয়া বাকি`,
    petFeed: "🍎 পোষাকে খাওয়াও",
    petFedToday: "খেয়েছে 💖",
    petFeedSpeak: "মম! কী মজা খাবার!",
    petHatchSpeak: (name) => `বাহ! ${name}, তোমার পোষা বড় হলো!`,
    petName: "পোষা",
    petGrewInto: (stage) => `তোমার পোষা বড় হয়ে হলো ${stage}! 🎉`,
    /* #1162 — বয়স অনুযায়ী পুরস্কার: ব্যান্ড ৫-৭-এ পোষার বদলে মিশন বার। */
    missionTitle: "মিশন",
    missionSub: "তোমার অগ্রগতির খাতা",
    missionStreak: (n) => `🔥 ${bnNum(n)} দিনের ধারা`,
    missionBadges: (n) => `🏅 ${bnNum(n)}টা ব্যাজ`,
    missionAchievements: (n) => `📚 ${bnNum(n)}টা কৃতিত্ব`,
    missionTrophy: "🏆 ট্রফি রুম",
    funnyTitle: "নোভা তোমার নাম বলে!",
    funnyRobot: "🤖 রোবট",
    funnyWhisper: "🤫 ফিসফিস",
    funnyShout: "📢 চিৎকার",
    castleTile: "🏰 দুর্গ",
    castleTitle: "আমার দুর্গ",
    castleBuilt: (n, total) => `${bnNum(n)}/${bnNum(total)} টা টাওয়ার বানানো`,
    castleTowerBuilt: (title) => `${title} টাওয়ার তৈরি!`,
    castleTowerToBuild: (title) => `${title} শেষ করলে তৈরি হবে`,
    castleCrown: "🏰 দুর্গ সম্পূর্ণ! রাজা নোভা তোমাকে স্যালুট করে! 👑",
    castleBuildCta: (title) => `${title} টাওয়ার বানাও`,
    seasonSnow: "❄️ শীত",
    seasonFlowers: "🌸 বসন্ত",
    seasonFireflies: "✨ জোনাকির গ্রীষ্ম",
    seasonLeaves: "🍂 শরৎ",
    festivalBanner: (name, emoji) => `✨ ${emoji} নম্বরভার্সে আজ ${name}!`,
    fest_boishakh: "পহেলা বৈশাখ",
    fest_eid_fitr: "ঈদুল ফিতর",
    fest_eid_adha: "ঈদুল আজহা",
    fest_christmas: "বড়দিন",
    fest_ramadan: "রমজান",
    fest_diwali: "দীপাবলি",
    fest_holi: "হোলি",
    /* daily quest */
    questTitle: "🎯 আজকের মিশন",
    questTypeRounds: (n) => `${bnNum(n)}টা রাউন্ড খেলো`,
    questTypeStars: (n) => `${bnNum(n)}টা তারা জিতো`,
    questTypeMaster: (n) => `${bnNum(n)}টি দক্ষতা আয়ত্ত করো`,
    questTypeNewgame: (n) => `${bnNum(n)}টা নতুন খেলা খেলো`,
    questFreshTry: "আজ একটি একদম নতুন খেলা খেলো:",
    questFreshPlay: "খেলো",
    questFreshNone: "আর নতুন খেলা নেই — যা খুশি খেলো! 🎉",
    questProgress: (n, target) => `${bnNum(n)}/${bnNum(target)}`,
    questDoneText: "✅ মিশন শেষ!",
    questReadySpeak: "মিশন শেষ! তোমার পুরস্কার নিতে এসো!",
    questReward: (n) => `+${n} 🪙 বোনাস`,
    questCompleteSpeak: (n) => `মিশন শেষ! তুমি ${n}টা বোনাস কয়েন জিতেছ! 🎉`,
    /* #281 — 7-day login calendar */
    calendarTitle: "📅 দৈনিক পুরস্কার",
    calendarHint: "প্রতিদিন খেলো — প্রতিদিন বড় বোনাস",
    calendarDayOf: (d) => `৭ এর মধ্যে দিন ${bnNum(d)}`,
    calendarClaim: (n) => `+${n} 🪙 নাও`,
    calendarClaimed: "✓ পাওয়া গেছে",
    calendarLocked: "🔒",
    calendarClaimSpeak: (name, n) => `${name}, দৈনিক পুরস্কার পেয়েছো — ${n} কয়েন! 🎉`,
    // #1473 — warm fresh-start cue after a missed day (no guilt).
    calendarFreshStart: "🌱 নতুন শুরু — আজ খেললে নতুন সপ্তাহ শুরু হবে",
    /* #283 — goal badges */
    badgeTile: "ব্যাজ",
    badgeTitle: "🏅 ব্যাজ বই",
    badgeSub: (n, total) => `${bnNum(n)}/${bnNum(total)}টা ব্যাজ জিতেছো`,
    badgeEarned: "জিতেছো!",
    badgeLocked: "আনলক করতে খেলতে থাকো",
    badgeNewSpeak: (name, title) => `${name}, নতুন ব্যাজ — ${title}! 🎖️`,
    badgeProgress: (current, target) => `${bnNum(current)}/${bnNum(target)}`,
    badgeFirstTitle: "এখান থেকে শুরু করো — তোমার প্রথম ব্যাজ খুব কাছেই!",
    /* #289 — long-term achievements book */
    achTile: "কৃতিত্ব",
    achTitle: "📚 কৃতিত্বের বই",
    achSub: (n, total) => `${bnNum(n)}/${bnNum(total)}টা কৃতিত্ব আনলক করেছো`,
    achUnlocked: "আনলক!",
    achLocked: "দীর্ঘমেয়াদি লক্ষ্য",
    achNewSpeak: (name, title) => `${name}, কৃতিত্ব আনলক হয়েছে — ${title}! 🏆`,
    /* #285 — custom avatar builder */
    avatarTile: "সাজাও",
    avatarTitle: "🎨 তোমার বন্ধু সাজাও",
    avatarSub: "চুল, চোখ আর পোশাক মিলিয়ে তোমার মতো করো",
    avatarPreview: "তোমার বন্ধু",
    avatarFace: "মুখ",
    avatarPartsLabels: { hat: "টুপি / চুল", glasses: "চোখ", outfit: "পোশাক" },
    avatarNone: "কিছু না",
    avatarSave: "✅ আমার সাজানোটা রাখো",
    avatarSaveSpeak: (name) => `${name}, তোমার বন্ধু দারুণ লাগছে! 🎉`,
    avatarFaceNames: {
      fox: "শিয়াল",
      panda: "পান্ডা",
      lion: "সিংহ",
      frog: "ব্যাঙ",
      tiger: "বাঘ",
      koala: "কোয়ালা",
      knight: "নাইট",
      mage: "জাদুকর",
      rogue: "দুরন্ত",
      barbarian: "বীর",
      ranger: "রেঞ্জার",
    },
    avatarPartNames: {
      "🎩": "লম্বা টুপি",
      "🧢": "ক্যাপ",
      "👑": "মুকুট",
      "🎀": "ফিতা",
      "🌼": "ফুল",
      "🍄": "মাশরুম",
      "👓": "চশমা",
      "🕶️": "রোদ চশমা",
      "🥽": "সুরক্ষা চশমা",
      "🤓": "পড়ার চশমা",
      "✨": "ঝিকিমিকি",
      "🌈": "রংধনু",
      "👕": "টি-শার্ট",
      "👗": "ফ্রক",
      "🥼": "ল্যাব কোট",
      "🦺": "নিরাপত্তা জামা",
      "🎽": "খেলার জামা",
      "🧥": "কোট",
    },
    avatarPicked: (category, option) => `${category}: ${option}`,
    avatarUnsavedTitle: "তোমার নতুন সাজটা এখনো জমা হয়নি",
    avatarUnsavedBody: "ফিরে গেলে তোমার বদলগুলো মুছে যাবে।",
    avatarUnsavedKeep: "সাজানো চালিয়ে যাও",
    avatarUnsavedDiscard: "না রেখে চলে যাও",
    /* #282 — same-device sibling leaderboard */
    lbTile: "লিডারবোর্ড",
    lbTitle: "🥇 ভাইবোন লিডারবোর্ড",
    lbSub: "একই ডিভাইস · ক্লাউড ছাড়া",
    lbStatMastery: "আয়ত্ত",
    lbStatRounds: "রাউন্ড",
    lbStatStars: "তারা",
    lbYou: "তুমি",
    lbEmpty: "তুলনা শুরু করতে ভাইবোন যোগ করো!",
    lbAddSibling: "➕ ভাইবোন যোগ করো",
    lbSpeak: (name, rank) => `${name}, এই ডিভাইসে তোমার স্থান #${bnNum(rank)}!`,
    /* #277 — land trophy room */
    trTitle: "🏆 ট্রফি রুম",
    trSub: (n, total) => `${bnNum(n)}/${bnNum(total)} ভূখণ্ড জয় করেছো`,
    trEarned: "জিতেছো",
    trLocked: "আয়ত্ত করলে পাবে",
    trEmpty: "এখনো ট্রফি নেই — পুরো ভূখণ্ড আয়ত্ত করো!",
    trNewSpeak: (name, land) => `${name}, তুমি ${land} জয় করেছ! 🏆`,
    /* #284 — mastery mystery boxes */
    boxTile: "🎁 মিস্ট্রি বক্স",
    boxHint: (n) => `${bnNum(n)}টা মিস্ট্রি বক্স খোলার অপেক্ষায়!`,
    boxOpen: "খোলো",
    boxCapSpeak: "বক্সটা কাল খুলবে — আজকের পুরস্কার ভরে গেছে!",
    boxRewardSpeak: (name, coins) => `${name}, বক্সে ${coins}টা কয়েন পেয়েছো! 🎁`,
    /* #767 — cap-full "come back tomorrow" names the waiting reward */
    capFullLine: (reward) => `আজকের সব কয়েন জিতেছ — তোমার ${reward} কালের জন্য অপেক্ষা করছে — আবার এসো! 🌙`,
    capRewardBox: "মিস্ট্রি বক্স 🎁",
    capRewardCal: "ক্যালেন্ডার বোনাস 🪙",
    capRewardBoth: "মিস্ট্রি বক্স 🎁 আর ক্যালেন্ডার বোনাস 🪙",
    hudCoinsMaxed: "আজকের কয়েন ভরে গেছে! শিখতে থাকো — তারকারা এখনও গুনবে 🎯",
    hudMastery: "দক্ষতার অগ্রগতি",
    /* #294 — streak-freeze tokens */
    freezePill: (n) => `🧊 ${bnNum(n)}`,
    freezeEarnedSpeak: "তুমি ফ্রিজ টোকেন পেয়েছো — তোমার ধারা নিরাপদ!",
    freezeSpentSpeak: "একটা ফ্রিজ টোকেন তোমার ধারা বাঁচিয়েছে — চালিয়ে যাও!",
    // #1472 — a held token can't cover 2+ missed days: say it gently.
    freezeNotEnough: (n) => `তোমার 🧊 একদিন বাঁচায়, কিন্তু ${bnNum(n)} দিন পেরিয়ে গেছে — নতুন শুরু 🌱`,
    /* #288 — kid-friendly voice settings */
    voiceFunTitle: "🗣️ নোভার কণ্ঠ",
    voiceFunSoft: "🔉 নরম",
    voiceFunNormal: "🔊 স্বাভাবিক",
    voiceFunLoud: "🔔 জোরে",
    voiceFunReset: "🔄",
    voiceFunTest: "হাই বলো",
    /* #286 — star-of-the-week recap */
    recapTitle: "🌟 সপ্তাহের তারকা",
    recapSub: (n) => `এই সপ্তাহে ${bnNum(n)} দিন খেলেছ`,
    recapTopSkill: "সেরা দক্ষতা",
    recapWinMastered: (n) => `এই সপ্তাহে ${bnNum(n)}টি দক্ষতা আয়ত্ত করেছ!`,
    recapWinStreak: (n) => `সেরা ধারাবাহিকতা: ${bnNum(n)} দিন`,
    recapHear: "🔊 আমার সপ্তাহ শোনো",
    recapEmpty: "এই সপ্তাহে খেলা হয়নি — এসো খেলি!",
    recapHomeLine: (days, title) => `${bnNum(days)} দিন · ⭐ ${title}`,
    recapSpeak: (name, days, title, win) => `${name}, এই সপ্তাহে তুমি ${bnNum(days)} দিন খেলেছ, তোমার সেরা দক্ষতা ${title}। ${win}`,
    weekTitle: "সপ্তাহের দক্ষতা",
    weekSub: "শেষ করলে পাবে সপ্তাহের যোদ্ধা ব্যাজ 🏅",
    weekDone: "সপ্তাহের যোদ্ধা ব্যাজ জিতেছো! 🏅",
    /* #280 — beat-the-owl challenge drill */
    chTile: "⚔️ নোভাকে হারাও",
    chCard: "গণিতের লড়াইয়ে নোভাকে চ্যালেঞ্জ করো — ৫টা দ্রুত রাউন্ড",
    chStart: "শুরু",
    chRound: (n, total) => `রাউন্ড ${bnNum(n)}/${bnNum(total)}`,
    chYou: "তুমি",
    chNova: "নোভা",
    chLevel: (n) => `লেভেল ${bnNum(n)}`,
    chQuestion: "গণিত লড়াই",
    chCorrect: "✅ সঠিক!",
    chWrong: "❌ ঠিক হয়নি",
    chNovaGot: "🦉 নোভা পেয়েছে!",
    chNovaMiss: "🦉 নোভা মিস করেছে!",
    chWin: (name) => `🎉 ${name}, তুমি নোভাকে হারিয়েছ!`,
    chTie: "😮 সমান সমান!",
    chLose: (name) => `💪 প্রায় পেরেছিলে, ${name}! আবার চেষ্টা করো!`,
    chCoins: (n) => `🪙 +${bnNum(n)} কয়েন`,
    chAgain: "আবার খেলো",
    chClose: "ফিরে যাও",
    chSpeakWin: (name) => `${name}, তুমি নোভাকে হারিয়েছ! অসাধারণ!`,
    chSpeakTie: "বাহ, সমান সমান! প্রায় পেরেছিলে!",
    chSpeakLose: (name) => `${name}, প্রায় পেরেছিলে! আবার চেষ্টা করো, তুমি নোভাকে হারাতে পারবে!`,
    /* #1164 — intermediate land boss (per-land duel gate) */
    bossBtn: "⚔️ ভূখণ্ড বস",
    bossBtnBn: "⚔️ ভূখণ্ড বস",
    bossBeaten: "✓ বস পরাজিত",
    bossBeatenBn: "✓ বস পরাজিত",
    bossWin: "ভূখণ্ড বস হারালো! 🏆",
    bossWinBn: "ভূখণ্ড বস হারালো! 🏆",
    bossLose: "💪 প্রায় পেরেছিলে! ভূখণ্ড বসের সাথে আবার চেষ্টা করো!",
    bossTie: "🤝 সমান সমান! ভূখণ্ড বসের সাথে আরেকবার চেষ্টা করো!",
    /* #356 — first-play onboarding tour */
    tourTitle: "কীভাবে খেলতে হয়",
    tourSkip: "বাদ দাও",
    tourNext: "পরবর্তী",
    tourDone: "চলো খেলি!",
    tourStep1Title: (name) => `হাই ${name}! তোমার বাড়িতে স্বাগতম`,
    tourStep1Sub: "মজার রাউন্ড শুরু করতে বড় PLAY বাটনে চাপ দাও।",
    tourStep2Title: "তোমার শেখার পথ",
    tourStep2Sub: "সব ভূখণ্ডে খেলো — তুমি যত শিখবে, তত নতুন জগৎ খুলবে।",
    tourStep3Title: "তোমার বন্ধু নোভা",
    tourStep3Sub: "নোভা তোমার পোষা প্যাঁচা। খেলে-শিখলে ও তোমার সাথে বড় হবে!",
    tourStep4Title: "আরও অনেক কিছু",
    tourStep4Sub: "More চেপে দেখো কার্ড, ব্যাজ, বাগান, মজার কণ্ঠস্বর আরও অনেক কিছু।",
    /* offline-first */
    offlineReady: "✓ অফলাইনে চলে",
    installBtn: "📲 অ্যাপটি নাও",
    nextBadge: "পরবর্তী",
    amazing: "অসাধারণ!",
    earned: (a, n, stars, score, world) => `${a} ${n} ${world} এ ${stars} ⭐ এবং ${score} পয়েন্ট অর্জন করেছে।`,
    keepGoing: (n, world) => `🔥 চালিয়ে যাও — ${world} এ আর ${n}টি আয়ত্ত করতে হবে`,
    greatSession: "🔥 দারুণ সেশন!",
    completeUnlocked: (world, next) => `🏆 ${world} সম্পন্ন — ${next} খুলে গেছে!`,
    playAgain: "আবার খেলুন",
    nextRound: "পরের ধাপ",
    worldsBtn: "জগৎ",
    homeBtn: "হোম",
    moreMenu: "আরও",
    parentDoor: "অভিভাবক",
    wildsLabel: "নোভা ও আমার বাগান",
    round: (r, total) => `রাউন্ড ${r}/${total}`,
    pickBuddy: "বন্ধু বাছাই করুন",
    kidsName: "বাচ্চার নাম",
    namePlaceholder: "যেমন: আরিয়া",
    birthYear: "জন্মসাল",
    ageAt: (age) => `বয়স ${age} · স্প্রাউট গ্রোভ থেকে শুরু`,
    saveKid: (name) => `✨ সংরক্ষণ করুন ${name}`,
    langLabel: "🌐 বাংলা",
    leaveGame: "খেলা থেকে ফিরুন",
    pauseGame: "খেলা থামাও",
    kidPauseTitle: "একটু বিরতি নিচ্ছি",
    kidPauseBody: "তোমার খেলা এখানেই থেমে আছে। প্রস্তুত হলে আবার খেলো!",
    resumeGame: "▶ খেলা চালিয়ে যাও",
    parentTitle: "মা-বাবার প্যানেল",
    parentSub: "দেখুন প্রতিটি বাচ্চা কীভাবে শিখছে",
    parentWelcome: (name) => `হ্যালো, ${name} 👋`,
    parentFamTitle: "পরিবারের এক ঝলক",
    parentFamKids: (n) => `${n} জন বাচ্চা`,
    parentFamStars: (n) => `${n}টি তারা`,
    parentFamPoints: (n) => `${n} পয়েন্ট`,
    parentFamSessions: (n) => `${n}টি সেশন`,
    parentFamMastered: (n) => `${n}টি আয়ত্ত`,
    parentPortalTitle: "🖥️ মা-বাবার পোর্টাল",
    parentPortalSub: "পোর্টাল থেকে সবকিছু করুন — বাচ্চা যোগ/মুছুন, শেখার সময় বেঁধে দিন, সাপ্তাহিক রিপোর্ট দেখুন, অ্যাকাউন্ট সুরক্ষিত রাখুন।",
    parentPortalCta: "মা-বাবার পোর্টাল খুলুন",
    gateTitle: "স্বাগতম, মা-বাবা!",
    gateSub: "বাচ্চার শেখা নিরাপদ রাখতে ও কতটা শিখছে দেখতে সাইন ইন করুন।",
    gateSignin: "সাইন ইন",
    gateSignup: "অ্যাকাউন্ট খুলুন",
    gateNameLabel: "আপনার নাম",
    gateNamePh: "যেমন: ঐশী",
    gateEmailLabel: "ইমেইল",
    gateEmailPh: "you@example.com",
    gatePassLabel: "পাসওয়ার্ড",
    gatePassPh: "অন্তত ৬ অক্ষর",
    gateShowPass: "পাসওয়ার্ড দেখান বা লুকান",
    gatePassHint: "অন্তত ৬ অক্ষর ব্যবহার করুন — অক্ষর আর সংখ্যা মিলালে আরও শক্তিশালী হবে।",
    gatePassOk: "দারুণ — এতটুকুই যথেষ্ট!",
    gateSubmitIn: "🔓 সাইন ইন",
    gateSubmitUp: "✨ অ্যাকাউন্ট খুলুন",
    gateBusy: "চলছে…",
    gateErrorInvalid: "সাইন ইন ব্যর্থ — ইমেইল ও পাসওয়ার্ড যাচাই করুন।",
    gateErrorSignup: "অ্যাকাউন্ট তৈরি করা যায়নি — সম্ভবত ইমেইলটি ইতিমধ্যে নিবন্ধিত।",
    gateGuest: "এখনই না — অতিথি মোড",
    gateGuestSub: "অ্যাকাউন্ট নেই? সাথে সাথে খেলুন। শেখার খবর এই ডিভাইসেই থাকে, ব্যক্তিগত ও বিজ্ঞাপনমুক্ত।",
    // #1541 — BN mirror of the COPPA-age + data-location + export/delete copy.
    gatePrivacy: "🔒 বয়স ২–১৩। কোনো বিজ্ঞাপন নেই, ট্র্যাকিং নেই, ডেটা বিক্রি নেই। আমরা শুধু যা কাজের জন্য দরকার তা রাখি — আপনার বাচ্চার নাম ও অগ্রগতি — আর আপনি যেকোনো সময় এক্সপোর্ট বা মুছে ফেলতে পারেন।",
    gateWelcome: (name) => `হাই ${name} 👋 — আপনার বাচ্চা যা শিখবে`,
    gatePower: "আপনি সবসময় মা-বাবার প্যানেল → বাচ্চারা যা শেখে থেকে ফিরে আসতে পারেন।",
    gateContinue: "শেখা শুরু করুন →",
    gateGoogleOr: "অথবা ইমেইল দিয়ে চালিয়ে যান",
    gateErrorGoogle: "Google সাইন ইন কাজ করেনি — বদলে ইমেইল বা অতিথি চেষ্টা করুন।",
    gateGoogleGone: "Google সাইন ইন এখন পাওয়া যাচ্ছে না — নিচের ইমেইলও ঠিক কাজ করবে।",
    gateGoogleNetwork: "Google সাইন ইন ইন্টারনেটে পৌঁছাতে পারেনি — সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
    gateGoogleBusy: "Google সাইন ইন ইতিমধ্যে চলছে — একটু অপেক্ষা করুন…",
    gateGoogleRetry: "আবার চেষ্টা করুন",
    gateGoogleUnavailable: "Google সাইন ইন এখানে পাওয়া যাচ্ছে না — নিচের ইমেইল ব্যবহার করুন, বা HTTPS-এ অ্যাপ খুলুন।",
    welcomeTitle: "নম্বরভার্সে স্বাগতম",
    welcomeSub: "একটি ভাষা বেছে নিন — পুরো অ্যাপ সেই ভাষাতেই কথা বলবে। যেকোনো সময় সেটিংসে বদলাতে পারবেন।",
    welcomeLangLabel: "আপনার ভাষা চয়ন করুন",
    welcomeEnglish: "🇬🇧 English",
    welcomeBangla: "🇧🇩 বাংলা",
    langSwitched: "বাংলা! হ্যালো!",
    welcomeGuest: "🎮 অতিথি হিসেবে খেলুন",
    welcomeGuestSub: "অ্যাকাউন্ট নেই? সোজা ঢুকে পড়ুন — শেখার খবর এই ডিভাইসেই ব্যক্তিগত থাকে।",
    guestConfirm: "আবার চাপুন প্যারেন্ট অ্যাকাউন্ট ছেড়ে অতিথি হিসেবে খেলতে",
    guestModeWipe: "অতিথি মোড — অগ্রগতি শুধু এই ডিভাইসে থাকে। ব্রাউজার মুছলে সব ইতিহাস হারিয়ে যায়।",
    guestUpgradeTitle: "সব জায়গায় অগ্রগতি রাখুন",
    guestUpgradeCta: "সাইন ইন / অ্যাকাউন্ট তৈরি করুন",
    welcomeOr: "অথবা",
    welcomeSignin: "👨‍👩‍👧 আমি মা-বাবা — সাইন ইন করুন",
    welcomeSyllabus: "📚 বাচ্চারা যা শেখে — সাইন ইন লাগবে না",
    syllabusGuestNote: "আপনি অতিথি হিসেবে দেখছেন — বাচ্চার শেখার খবর সব ডিভাইসে রাখতে সাইন ইন করুন।",
    syllabusTitle: "বাচ্চারা যা শেখে",
    syllabusSub: "একটি সাজানো পথ, যা বাচ্চার মন বড় হওয়ার মতো করে গড়া — আগে সংখ্যা, তারপর খেলা, তারপর প্রশ্ন।",
    syllabusWhat: "👨‍👩‍👧 আপনার সন্তানের প্রতিটি ধাপ, ক্রম অনুযায়ী",
    syllabusGame: "🎮 খেলুন",
    syllabusStart: "🚀 শেখা শুরু করুন",
    syllabusFab: "শুরু",
    syllabusHow: "শেখার সিঁড়ি",
    syllabusHow1: "১ · আগে সংখ্যা — যেকোনো হিসাবের আগে বাচ্চা প্রতিটি সংখ্যার সাথে পরিচিত হয়।",
    syllabusHow2: "২ · খেলা ধারণা শেখায় — আপেল, ভাগাভাগি, সারি এটি বাস্তব করে তোলে।",
    syllabusHow3: "৩ · প্রশ্ন শেষে আসে — ধারণাটি দেখা হলে, অনুশীলন তা মনে গেঁথে দেয়।",
    syllabusProgress: (done, total) => `${done}/${total} আয়ত্ত`,
    syllabusTap: "শিক্ষার স্তর দেখতে একটি জগৎ ট্যাপ করুন",
    syllabusBadge: (band) => `স্তর ${band}`,
    syllabusMastered: "✓ আয়ত্ত",
    syllabusNotStarted: "শুরু হয়নি",
    syllabusDone: "সব জগৎ",
    syllabusOpen: "বাচ্চারা যা শেখে",
    settingsTitle: "সেটিংস",
    settingsSub: "তোমার মতো করে বানাও",
    settingsSyllabus: "📚 বাচ্চারা যা শেখে",
    parentSignoutTitle: "🚪 সাইন আউট",
    parentSignoutSub: "এই ডিভাইসটি মা-বাবার অ্যাকাউন্ট ছেড়ে যাবে — এই ডিভাইসের শেখার খবর থাকে। যেকোনো সময় আবার সাইন ইন করুন।",
    parentSignoutCta: "সাইন আউট",
    parentSignoutConfirm: "নিশ্চিত করতে আবার চাপুন",
    /* parent PIN lock (#86) */
    pinTitle: "🔒 মা-বাবার পিন",
    pinUnlockSub: "মা-বাবার অংশ খুলতে ৪ অঙ্কের পিন লিখুন",
    pinSetTitle: "মা-বাবার পিন সেট করুন",
    pinSetSub: "৪ অঙ্কের একটি পিন বেছে নিন — প্রতিবার মা-বাবার অংশ খুলতে এটা লাগবে",
    pinConfirmTitle: "পিন নিশ্চিত করুন",
    pinConfirmSub: "আবার একই ৪ অঙ্ক লিখুন",
    pinChangeTitle: "পিন পরিবর্তন করুন",
    pinChangeSub: "আপনার বর্তমান পিন লিখুন",
    pinNewTitle: "নতুন পিন",
    pinWrong: (n) => (n === 1 ? "ভুল পিন — ১ বার চেষ্টা বাকি" : `ভুল পিন — ${n} বার চেষ্টা বাকি`),
    pinLocked: "পিন প্যাড লক হয়ে গেছে",
    pinLockedSub: "অনেকবার ভুল পিন। নিরাপত্তা প্রশ্নের উত্তর দিয়ে এখানে পিন রিসেট করুন।",
    pinForgot: "পিন ভুলে গেছেন?",
    pinForgotSub: "নিরাপত্তা প্রশ্নের উত্তর দিয়ে এখানেই রিসেট করুন — সাইন আউট লাগবে না।",
    pinForgotNoQaSub: "মা-বাবার অ্যাকাউন্ট যাচাই করে এখানেই পিন রিসেট করুন — সাইন আউট লাগবে না।",
    pinRecoverCta: "যাচাই করে পিন রিসেট করুন",
    pinRecoverWithPassword: "বদলে মা-বাবার পাসওয়ার্ড ব্যবহার করুন",
    pinResetArmed: "পিন রিসেট করে সাইন আউট করবেন?",
    pinResetCta: "রিসেট ও সাইন আউট",
    pinMismatch: "পিন মেলেনি — আবার শুরু করুন",
    pinCurrentWrong: "এটা আপনার বর্তমান পিন নয়",
    pinCryptoError: "এই ডিভাইসে এখন পিন সুরক্ষিত করা যাচ্ছে না — একটি সমর্থিত ব্রাউজারে আবার চেষ্টা করুন।",
    pinKeep: "আপনার সন্তানকে পিন কখনো বলবেন না",
    pinLockCardTitle: "🔐 পিন লক",
    pinLockCardSub: "মা-বাবার অংশ ৪ অঙ্কের পিন দিয়ে খোলে",
    pinSet: "পিন সেট করুন",
    pinChange: "পিন পরিবর্তন করুন",
    /* #247 — PIN recovery Q&A */
    secPanelTitle: "🔐 পিন পুনরুদ্ধারের প্রশ্ন",
    secPanelSub: "নিরাপত্তা প্রশ্ন দিয়ে ভুলে যাওয়া পিন এখানেই রিসেট করতে পারবেন — সাইন আউট লাগবে না।",
    secPanelSet: "পুনরুদ্ধারের প্রশ্ন সেট করুন",
    secPanelChange: "প্রশ্ন পরিবর্তন করুন",
    secPanelHas: "পুনরুদ্ধারের প্রশ্ন সেট আছে ✓",
    secPickTitle: "একটি পুনরুদ্ধারের প্রশ্ন বেছে নিন",
    secPickSub: "পিন ভুলে গেলে এই প্রশ্নের উত্তর দিয়ে রিসেট করতে পারবেন।",
    secAnswerTitle: "আপনার উত্তর",
    secAnswerSub: "শুধু আপনি জানেন এমন কিছু লিখুন।",
    secConfirmTitle: "উত্তরটি আবার লিখুন",
    secNext: "পরবর্তী",
    secSave: "সংরক্ষণ",
    secSkip: "এখন বাদ দিন",
    secCancel: "বাতিল",
    secAskTitle: "পিন পুনরুদ্ধার করুন",
    secAskSub: "নিরাপত্তা প্রশ্নের উত্তর দিয়ে এই ডিভাইসে পিন রিসেট করুন।",
    secQuestion: "আপনার প্রশ্ন",
    secAnswerPlaceholder: "আপনার উত্তর লিখুন",
    secWrong: "উত্তর মেলেনি — আবার চেষ্টা করুন।",
    secWrongTries: (n) => (n === 1 ? "উত্তর মেলেনি — ১ বার চেষ্টা বাকি।" : `উত্তর মেলেনি — ${n} বার চেষ্টা বাকি।`),
    secLocked: "অনেকবার ভুল উত্তর দেওয়া হয়েছে।",
    secLockedSub: "বদলে মা-বাবার পাসওয়ার্ড দিয়ে পিন রিসেট করুন।",
    secPasswordTitle: "মা-বাবার অ্যাকাউন্ট যাচাই করুন",
    secPasswordSub: "এই মা-বাবার অ্যাকাউন্টের ইমেইল ও পাসওয়ার্ড দিয়ে এখানেই পিন রিসেট করুন — সাইন আউট লাগবে না।",
    secEmpty: "আগে উত্তর লিখুন।",
    secRecovered: "পিন রিসেট হয়েছে — নিচে নতুন ৪ অঙ্কের পিন সেট করুন।",
    secMismatch: "উত্তর দুটি মেলেনি — আবার শুরু করুন।",
    secCryptoError: "এই ডিভাইসে এখন নিরাপত্তা উত্তর সুরক্ষিত করা যাচ্ছে না — একটি সমর্থিত ব্রাউজারে আবার চেষ্টা করুন।",
    settingsAboutSub: "নম্বরভার্স · কৌতূহলী বাচ্চাদের জন্য, অফলাইনে ও বিজ্ঞাপনমুক্ত",
    settingsVoice: "🔊 ভয়েস ও পড়া",
    settingsVoiceOk: (v) => `ভয়েস প্রস্তুত: ${v}`,
    settingsVoiceNone: "কোনো ভয়েস পাওয়া যায়নি — সেটিংস → অ্যাক্সেসিবিলিটি → স্পোকেন কনটেন্ট-এ ভয়েস ইনস্টল করুন",
    settingsVoiceTest: "ভয়েস পরীক্ষা",
    settingsDictate: "🎙️ নিজের কণ্ঠ রেকর্ড করো",
    settingsDictateSub: "নিজের উত্তর বলো আর রেকর্ড করে শোনো। শুধু এই ডিভাইসেই থাকে — কোথাও পাঠানো হয় না।",
    settingsDictateStart: "⏺️ রেকর্ড",
    settingsDictateStop: "⏹ থামাও",
    settingsDictateDenied: "মাইক অনুমতি দেওয়া হয়নি — ব্রাউজার সেটিংসে মাইক অনুমতি দিন।",
    settingsDictateUnsupported: "এই ব্রাউজারে রেকর্ডিং সমর্থিত নয়।",
    settingsDictateClear: "মুছে ফেলো",
    settingsSecSound: "🔊 শব্দ ও ভয়েস",
    /* #248 — quiet hours */
    quietBadge: "শান্ত সময় — পূর্ণ শব্দে ট্যাপ করুন",
    quietBadgeOn: "এই সেশনে পূর্ণ শব্দ — আবার শান্ত করতে ট্যাপ করুন",
    settingsSecScreen: "🖥️ স্ক্রিন",
    projectorToggle: "📽️ ক্লাসরুম প্রজেক্টর",
    projectorToggleSub: "ক্লাসরুমের জন্য বড়, উজ্জ্বল লেখা — বাবা-মার অংশ লুকানো থাকে।",
    projectorOn: "প্রজেক্টর চালু",
    projectorOff: "প্রজেক্টর বন্ধ",
    projectorKeyHint: "খেলতে Enter চাপুন · ফুলস্ক্রিন বন্ধে Esc",
    // 🧏 #250 — global accessibility (বাবা-মার পোর্টালেও প্রযোজ্য)।
    a11yBigText: "🔍 বড় লেখা",
    a11yBigTextSub: "সব জায়গায় বড় লেখা — মা-বাবার পোর্টালেও",
    a11yHighContrast: "🎨 উচ্চ কনট্রাস্ট",
    a11yHighContrastSub: "গাঢ় বর্ডার, উজ্জ্বল লেখা, স্পষ্ট ফোকাস",
    a11yBigTextOn: "বড় লেখা চালু",
    a11yBigTextOff: "বড় লেখা বন্ধ",
    a11yHighContrastOn: "উচ্চ কনট্রাস্ট চালু",
    a11yHighContrastOff: "উচ্চ কনট্রাস্ট বন্ধ",
    settingsReduceMotion: "কম গতি",
    settingsReduceMotionSub: "কম নড়াচড়া — শান্ত খেলা",
    // 🦋 #1442 — in-flow calm mode (kid-understandable reduced-motion toggle).
    calmButton: "শান্ত মোড",
    calmTitle: "শান্ত মোড",
    calmBody: "শান্ত মোড চালু করলে চলমান অংশগুলো ধীর হয়ে যায়। যে কোনো সময় বন্ধ করতে পারো।",
    calmOn: "শান্ত মোড চালু",
    calmOff: "শান্ত মোড বন্ধ",
    settingsSecLanguage: "🌐 ভাষা",
    langSwitch: "ভাষা বদলাও",
    settingsSecLearning: "📚 আমার শেখা",
    settingsSecParents: "👨‍👩‍👧 মা-বাবার জন্য",
    settingsMusicOff: "মা-বাবা এই প্রোফাইলের জন্য মিউজিক বন্ধ করে দিয়েছেন।",
    settingsHaptics: "ট্যাপে কম্পন",
    settingsParentsHint: "শেখার খবর, নিয়ন্ত্রণ ও পূর্ণ পোর্টাল — শুধু বড়দের জন্য।",
    settingsParentsGo: "মা-বাবার অংশ খুলুন",
    settingsParentsSignin: "মা-বাবা হিসেবে সাইন ইন করুন",
    settingsMusicRow: "শব্দ", // #1468 — one kid-facing switch now covers music + SFX
    settingsVoiceNeural: (v) => `বাংলা ভয়েস — ${v} (অফলাইন)`,
    settingsVoiceOff: "পড়া বন্ধ",
    settingsReadingOff: "মা-বাবা পড়া বন্ধ করে দিয়েছেন — আবার চালাতে তাদের বলুন।",
    settingsVoiceDownload: (pct) => `বাংলা ভয়েস ডাউনলোড হচ্ছে… ${pct}%`,
    settingsSyncOk: "✓ সব শেখার খবর এই ডিভাইসে সংরক্ষিত",
    settingsSyncWorking: "শেখার খবর সংরক্ষণ হচ্ছে…",
    settingsSyncOffline: "নেট সংযোগ নেই — শেখার খবর এই ডিভাইসেই থাকবে",
    settingsSyncError: "সংরক্ষণ করা যায়নি — আবার চেষ্টা করব",
    settingsSyncIdle: "প্রস্তুত — খেললেই শেখার খবর সংরক্ষিত হবে",
    starsTotal: (n) => `${n}টি তারা অর্জন`,
    points: (n) => `${n} পয়েন্ট`,
    sessions: (n) => `${n}টি সেশন`,
    parentSkills: "দক্ষতা",
    music: "🔊 মিউজিক চালু",
    musicMuted: "🔇 মিউজিক বন্ধ",
    install: "অ্যাপ ইনস্টল করুন",
    shareProgress: "📤 শেখার খবর শেয়ার করুন",
    shareShare: "শেয়ার",
    shareCardTitle: "🎉 Numberverse",
    shareCardFooter: "Numberverse দিয়ে তৈরি — বাচ্চারা গণিত ও বাংলা শেখে, অফলাইনেও, কোনো বিজ্ঞাপন নেই।",
    shareStatsStars: "তারা",
    shareStatsScore: "পয়েন্ট",
    shareStatsSessions: "সেশন",
    shareWorldsTitle: "জগৎ",
    shareRewardSpeak: (name) => `${name}-এর শেখার খবর শেয়ার হয়েছে! তুমি +৫ কয়েন পেয়েছ! 🎉`,
    shareRewardToast: "🎉 শেয়ার হয়েছে! আপনার সন্তানের জন্য +৫ কয়েন",
    shareWhatsApp: "WhatsApp",
    shareDone: "✓ শেয়ার হয়েছে",
    shareDownloaded: "✓ ডাউনলোড হয়েছে — WhatsApp-এ যোগ করো",
    shareFail: "এই ডিভাইসে শেয়ার করা যায়নি",
    shareProgressCaption: (name) => `${name} Numberverse-এ খেলছে — গণিত ও বাংলা, অফলাইনেও, কোনো বিজ্ঞাপন নেই! kids.munna-khan.xyz`,
    digestBtn: "📄 সাপ্তাহিক ডাইজেস্ট",
    digestEmpty: "এই সপ্তাহে এখনো কোনো গল্প নেই — কিছু খেলা খেলুন, ডাইজেস্ট ভরে উঠবে।",
    digestDone: "সাপ্তাহিক ডাইজেস্ট ডাউনলোড হয়েছে ✓",
    digestHeader: (name, week) => `Numberverse — সাপ্তাহিক শেখার ডাইজেস্ট\nবাচ্চা: ${name}\nসপ্তাহ: ${week}`,
    digestStats: (total, solved, tricky) => `${total}টি মুহূর্ত · ${solved}টি সমাধান · ${tricky}টি কঠিন`,
    digestSolved: "সমাধান",
    digestTricky: (n) => `${n}টি ভুল`,
    digestMoni: (code) => `মনি ধরেছে: ${code}`,
    certShare: "📤 শেয়ার",
    certShareFooter: "Numberverse দিয়ে তৈরি — বাচ্চারা গণিত ও বাংলা শেখে, অফলাইনেও, কোনো বিজ্ঞাপন নেই।",
    certShareCaption: (name, world) => `${name} Numberverse-এ ${world} আয়ত্ত করেছে! 🏆 Numberverse দিয়ে তৈরি। kids.munna-khan.xyz`,
    voiceTitle: "🔊 ভয়েস পরীক্ষা",
    voicePlatform: (p) => `ডিভাইস: ${p}`,
    voiceTest: "টেস্ট লাইন বাজান",
    voiceBnOk: (v) => `বাংলা ভয়েস: ${v} ✓`,
    voiceBnMissing: "কোনো বাংলা ভয়েস নেই — Settings → Text-to-speech → বাংলা ইনস্টল করুন।",
    voiceEnOk: (v) => `ইংরেজি ভয়েস: ${v}`,
    voiceNone: "এই ডিভাইস/ব্রাউজারে স্পিচ পাওয়া যায়নি।",
    voiceNeuralReady: "ডিভাইসে বাংলা নিউরাল ভয়েস প্রস্তুত — সব ডিভাইসে একই ভয়েস, অফলাইনে কাজ করে ✓",
    voiceNeuralLoading: (pct) => `ডিভাইসে বাংলা নিউরাল ভয়েস ডাউনলোড হচ্ছে… ${pct}%`,
    voiceNeuralError: "নিউরাল ভয়েস পাওয়া যায়নি — বাংলা ডিভাইসের ভয়েসে পড়ে।",
    voiceNeuralIdle: "ডিভাইসে বাংলা নিউরাল ভয়েস প্রথম ব্যবহারে ডাউনলোড হয় (একবার, তারপর চিরকাল অফলাইন)।",
    voiceRetry: "আবার চেষ্টা করো",
    voiceDlFailed: "বাংলা ভয়েস ডাউনলোড শেষ হয়নি — আবার চেষ্টা করতে ট্যাপ করো, না হলে ডিভাইসের ভয়েস পড়বে।",
    settingsVoiceNoBn: "এই ডিভাইসে এখনো বাংলা ভয়েস নেই — প্রথম ব্যবহারে ডিভাইসের বাংলা ভয়েস ডাউনলোড হয়।",
    voiceCacheHit: (pct) => `🎙️ ভয়েস ক্যাশ: ${pct}% লাইন তাৎক্ষণিক (ডিভাইসে, অফলাইনে)`,
    voicePickTitle: "🎙️ বাংলা ভয়েস",
    voicePickHint: "বাংলা পড়বে কে বাছো — সব ডিভাইসে একই, সব অফলাইন।",
    voicePickFemale: "উষ্ণ প্রাপ্তবয়স্ক (মেয়ে)",
    voicePickKid: "বাচ্চার ভয়েস",
    voicePickSoft: "নরম মেয়ে",
    voicePickWarm: "বন্ধুত্বপূর্ণ ছেলে",
    voicePickListen: "শোনো",
    mastered: "আয়ত্ত",
    playLimitReached: "🦉 বাহ, আজ তুমি অনেক খেলেছ! কাল আবার এসো 💤",
    capWindDown: (mins) => `🌙 বিশ্রামের প্রায় সময় — আজকের জন্য আর প্রায় ${bnNum(mins)} মিনিট বাকি।`,
    goalLine: (cur, goal) => `🎯 দৈনিক লক্ষ্য: ${bnNum(cur)}/${bnNum(goal)} মিনিট`,
    goalNudge: "🎉 আজকের লক্ষ্যে পৌঁছে গেছ! দারুণ! একটু বিরতি চাও নাকি খেলা চালিয়ে যাবে?",
    goalNudgeTakeBreak: "বিরতি নিই",
    goalNudgeKeepGoing: "খেলা চালাই",
    focusChip: (label, band) => `📌 ফোকাস: ${label} · বিশ্ব ${bnNum(band)}`,
    parentHelpTitle: "একটু সাহায্য দরকার",
    parentHelpNone: "সব ঠিক আছে! 🎉",
    parentHelpOpen: (n) => `শেষ করতে ${n}টা বাকি`,
    parentHelpWrong: (n) => `${n}টা ভুল`,
    reteachLetTry: "প্রায়! চলো এটা আরেকভাবে অনুশীলন করি 💪",
    practicePill: "অনুশীলন!",
    /* 🧠 MONI */
    moniTitle: "মনি টিউটর",
    moniTag: "মনি আপনার সন্তান সম্পর্কে যা শিখেছে",
    /* ❌ #78 ভুল উত্তরের ইতিহাস */
    mistakesTitle: "❌ ভুল উত্তর",
    mistakesSub: "আপনার সন্তান এখনো কী নিয়ে কাজ করছে — প্রতিদিন, প্রতি দক্ষতায়",
    mistakesHeatTitle: "সর্বশেষ ২৮ দিন",
    mistakesDayLabel: (date, n) => `${date} — ${n}টি ভুল উত্তর`,
    mistakesSkillWrong: (n) => `${n}টি ভুল`,
    mistakesEmpty: "সর্বশেষ ২৮ দিনে কোনো ভুল উত্তর নেই — চমৎকার! 🎉",
    mistakesNoneDay: "এই দিনে কিছুই কঠিন ছিল না",
    mistakesWeekday: "র সো ম বু বৃ শু শ",
    moniLearnStyle: "শেখার ধরন",
    moniBestGame: "ভালোবাসে",
    moniAttention: "মনোযোগ",
    moniConfidence: "আত্মবিশ্বাস",
    moniConfidenceGentle: "ভদ্র — দরকার জয়ের আস্থা",
    moniConfidenceSteady: "স্থির — ভারসাম্যপূর্ণ",
    moniConfidenceChallenging: "চ্যালেঞ্জের জন্য প্রস্তুত",
    moniMisconceptions: "ধরার ভুল",
    moniMisconceptionsNone: "এখনো কিছু নেই — মনি দেখছে",
    moniNextMove: "মনির পরবর্তী পদক্ষেপ",
    moniTone: "ভাষা",
    moniSessionLength: "সেরা সেশন",
    moniSessionHint: (n) => `মণি দেখল ~${n} রাউন্ড পর্যন্ত তোমার মনোযোগ ছিল — চালিয়ে যাও বা বিরতি নাও, তোমার পছন্দ 💛`,
    moniGoals: "মনির পরবর্তী ৩ দক্ষতা",
    moniGoalFocus: "এখনকার প্রধান লক্ষ্য",
    moniGoalWeak: "এখনো অনুশীলন দরকার",
    moniGoalReview: (n) => `${n} দিনে একবার ঝালাই`,
    moniStrictness: "মনি কতটা চাপ দেবে?",
    moniStrictnessHelp: "নরম = ধাপ পিছিয়ে নেয়, চ্যালেঞ্জিং = ধাপ উপরে তোলে। সাথে সাথে বদলায়, অফলাইনেও।",
    moniStrictnessGentle: "নরম",
    moniStrictnessSteady: "সাধারণ",
    moniStrictnessChallenging: "চ্যালেঞ্জিং",
    moniReviewGentle: "মণি বলে: একটু ঝালাই করলে দারুণ লাগবে — তাড়াহুড়ো নেই!",
    moniReviewTap: (n) => (n === 1 ? "খুলে ঝালাই করো" : "খুলে ঝালাই করো"),
    breakTitle: (name) => `বিশ্রাম নাও, ${name}!`,
    breakBody: "তোমার মস্তিষ্ক অনেক পরিশ্রম করেছে, আর নোভা খুব গর্বিত। একটু বিশ্রাম নিলে পরের খেলাটা আরও মজার হবে!",
    breakRest: "ঠিক আছে, একটু বিশ্রাম",
    breakKeepGoing: "আমি ফ্রেশ — চলো, খেলি!",
    pauseTitle: "😴 একটু শেখার বিরতি",
    pauseBody: "বড়রা একটু বিরতির জন্য শেখা থামিয়ে দিয়েছেন। শীঘ্রই ফিরে এসো — নোভা এখানেই অপেক্ষা করবে!",
    pauseBackSoon: "⏳ প্রস্তুত হলে বড়রা Resume চেপে আবার চালু করে দেবেন।",
    moniWeek: "📅 এই সপ্তাহে",
    moniWeekRounds: "রাউন্ড",
    moniWeekAcc: "নির্ভুলতা",
    moniWeekPace: "গতি",
    moniWeekStyle: "শেখার ধারা",
    moniWeekBestGame: "সেরা খেলা",
    moniWeekPaceUp: "সাধারণের চেয়ে জোরদার 💪",
    moniWeekPaceDown: "এই সপ্তাহে কিছুটা নরম 🐢",
    moniWeekPaceFlat: "সবসময়ের মতো স্থির ⚖️",
    moniStyleFast: "⚡ দ্রুত তারা",
    moniStyleSteady: "🐢 ধীরে সুস্থে",
    moniStyleSocial: "🦉 সবার বন্ধু",
    contrastTrigger: (name) => `মণি ${name}-এ একটা প্যাটার্ন ধরেছে — একসাথে ঠিক করি!`,
    contrastTriggerSub: "পাশাপাশি খেলা, কোনো চাপ নেই",
    contrastRight: "ঠিক! তুমি প্যাটার্নটা চিনে ফেললে! 🎉",
    a11yRight: "দারুণ — ঠিক আছে!",
    a11yWrong: "মোটামুটি — আবার চেষ্টা করো, নোভা সাহায্য করবে।",
    a11yMastered: (title) => `তুমি ${title} আয়ত্ত করেছ!`,
    a11yVoiceOn: "পড়া চালু আছে।",
    a11yVoiceOff: "পড়া বন্ধ আছে।",
    a11yMusicOn: "শব্দ চালু আছে।", // #1468 — covers music + SFX
    a11yMusicOff: "শব্দ বন্ধ আছে।", // #1468 — covers music + SFX
    contrastOops: (correct) => `এইটাই কৌশল! উত্তর হলো ${correct}। আবার চেষ্টা করো!`,
    contrastDoneTitle: "প্যাটার্ন জয় করেছ! 🏆",
    contrastDoneBody: "পাশাপাশি দেখে তুমি পার্থক্যটা খুঁজে পেয়েছ। মণি খুব গর্বিত — ধার ধরে রাখো!",
    contrastDoneBtn: "ফিরে যাই অভিযানে",
    contrastProgress: (cur, total) => `প্যাটার্ন রাউন্ড ${cur}/${total}`,
    kothaInspector: "📚 শেখার গল্প",
    kothaInspectorSub: "কী চেষ্টা হলো, মণি কী দেখল, কী করলাম",
    kothaFilterAll: "সব",
    kothaFilterWrong: "ভুল",
    kothaFilterCorrect: "ঠিক",
    kothaEmpty: "এখনও কোনো গল্প নেই — এক রাউন্ড খেলো, গল্পের খাতা ভরে যাবে।",
    kothaKindMisconception: "ভুল ধারণা",
    kothaKindGap: "ফাঁক",
    kothaKindFatigue: "ক্লান্তি",
    kothaKindGuessing: "অনুমান",
    kothaKindSlip: "অমনোযোগ",
    kothaAction: "মণি",
    kothaAgo: (ts) => {
      const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (s < 60) return "এইমাত্র";
      const m = Math.floor(s / 60);
      if (m < 60) return `${m} মিনিট আগে`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h} ঘণ্টা আগে`;
      const d = Math.floor(h / 24);
      return `${d} দিন আগে`;
    },
    kothaCorrect: "ঠিক",
    kothaWrong: "ভুল",
    moniTrendUp: "উন্নতি 📈",
    moniTrendFlat: "স্থির ➖",
    moniTrendDown: "সাহায্য দরকার 📉",
    moniSessions: (n) => `${n}টা সেশন`,
    moniRounds: (n) => `${n}টা রাউন্ড`,
    inProgress: "চলমান",
    notStarted: "শুরু হয়নি",
    /* Nova companion */
    novaTitle: "নোভা প্যাঁচা",
    novaTagline: "খেলায় কয়েন জিতো — নোভাকে সাজাও!",
    novaMeet: "নোভার সাথে দেখা",
    novaTapHint: "🦉 নোভা চাপো!",
    novaCoins: (n) => `${n} কয়েন`,
    novaStreak: (n) => `${n} দিনের ধারা`,
    // #1474 — streak badge teaser: names tomorrow's calendar reward.
    streakTomorrow: (n) => `আগামীকাল +${bnNum(n)} 🪙`,
    novaCareFed: "নোভাকে খাওয়াও",
    novaCarePlay: "খেলাও",
    novaShop: "পোশাকের দোকান",
    novaEquip: "পরো",
    novaEquipped: "পরে আছি",
    novaNeedCoins: "আরও কয়েন পেতে খেলা খেলো! 💪",
    novaDailyEarned: (n) => `আজ ${n}/২০ কয়েন অর্জিত`,
    novaHello: "হু! আমি নোভা — মজা করি চলো!",
    novaFeedMsg: "মমম! ধন্যবাদ! 🍎",
    novaPlayMsg: "উহু! দারুণ মজা! 🎈",
    novaTapMsg: "হু-হু! 😄",
    novaEquipMsg: "ওহ্, পোশাকটা আমার খুব পছন্দ! 💛",
    novaPlayGames: "খেলা খেলো এবং কয়েন জিতো",
    rankLabel: "তোমার পদবি",
    rankNextNeed: (next, need) => `${next} হতে আর ${need}টি পাঠ আয়ত্ত করো`,
    newSkill: (n) => (n === 1 ? "🌟 নতুন দক্ষতা আয়ত্ত করেছো!" : `🌟 ${n}টি নতুন দক্ষতা আয়ত্ত করেছো!`),
    masterySpeak: (title) => `বাহ! তুমি ${title} আয়ত্ত করেছ! 🎉`,
    gardenTile: "আমার বাগান",
    gardenHint: "ঠিক উত্তর দাও — গাছ বাড়বে!",
    /* #769 — home teaser: plants/fruits + a "new growth!" cue */
    gardenTileSum: (plants, fruits) => `🌱 ${bnNum(plants)}টা গাছ · ${bnNum(fruits)}টা ফল`,
    gardenTileFresh: "নতুন চারা!",
    gardenTileEmpty: "প্রথম গাছটি বাড়াতে ট্যাপ করো 🌱",
    /* 🦉 3D Nova island (#684) */
    island3dBtn: "✨ ৩ডি দ্বীপ",
    islandTitle: "🦉 নোভার ৩ডি দ্বীপ",
    islandLoading: "দ্বীপ তৈরি হচ্ছে…",
    loadingGame: "খেলা লোড হচ্ছে…",
    gameLoadError: "এবার খেলাটি লোড করা যায়নি।",
    gameLoadErrorHint: "ইন্টারনেট দেখে আবার চেষ্টা করতে ট্যাপ করো।",
    gameLoadRetry: "আবার চেষ্টা করো",
    storageFull: "এই ডিভাইসে এখন খেলার অগ্রগতি জমা হচ্ছে না — একজন বড়োকে জায়গা খালি করতে বলো।",
    islandBeta: "নতুন · বিটা",
    islandHint: "ঘুরাতে টেনে ধরো · জুম করতে চিমটি",
    islandNoWebgl: "এই ডিভাইসে ৩ডি নেই — ২ডি নোভায় ফিরে গেছি!",
    islandBack: "‹ ফিরে",
    islandPlayGames: "🎮 খেলা করো (২ডি)",
    islandBack2d: "২ডি নোভায় ফিরে যাও",
    islandRoomPrev: "আগের ঘর",
    islandRoomNext: "পরের ঘর",
    islandActions: "নোভার কাজগুলো",
    islandIn2d: "২ডি",
    islandDressup: "সাজাও",
    islandDressupNatural: "স্বাভাবিক",
    islandDressupGold: "সোনালি",
    islandDressupRosy: "গোলাপি",
    islandDressupMint: "পুদিনা",
    islandWalkHint: "নোভাকে হাঁটাতে মেঝেতে টোকা দাও",
    islandCoins: "মুদ্রা",
    islandGardenGrew: "তোমার বাগান বড় হয়েছে!",
  },
};

/** 📚 #330 — misconception codes → parent-friendly labels (EN + BN). Plain
 *  strings on purpose (not t()) so the class-insights card stays readable
 *  without bloating the i18n table with a full code dictionary. */
export const MISCONCEPTION_LABELS: Record<string, { en: string; bn: string }> = {
  "overcount-1": { en: "Counts one too many", bn: "এক বেশি গুনে" },
  "undercount-1": { en: "Counts one too few", bn: "এক কম গুনে" },
  "off-by-ten": { en: "Off by ten — tens/ones mix-up", bn: "দশের ঘরের গোলমাল" },
  "off-by-hundred": { en: "Off by one hundred — place mix-up", bn: "শতকের ঘরের গোলমাল" },
  double: { en: "Doubles the number", bn: "সংখ্যা দ্বিগুণ করে" },
  half: { en: "Halves the number", bn: "সংখ্যা অর্ধেক করে" },
  reversal: { en: "Writes the digit backwards", bn: "অঙ্ক উল্টে লেখে" },
  "repeated-error": { en: "Same mistake keeps repeating", bn: "একই ভুল বারবার হয়" },
};

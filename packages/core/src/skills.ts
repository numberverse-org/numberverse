import type { Band, GameConfig, Skill } from './types.js';

export const BANDS: Band[] = [
  // titleBn = REAL natural Bangla (what people say), NOT phonetic English:
  // Sprout Grove → কুঁড়ির বাগান, Cottage Fields → মাঠের কুটির, River Town →
  // নদীর শহর, Sky Castle → আকাশের দুর্গ, Star Academy → তারার পাঠশালা.
  { id: 1, key: 'sprout-grove', title: 'Sprout Grove', titleBn: 'কুঁড়ির বাগান', ageRange: '2–4' },
  { id: 2, key: 'cottage-fields', title: 'Cottage Fields', titleBn: 'মাঠের কুটির', ageRange: '4–6' },
  { id: 3, key: 'river-town', title: 'River Town', titleBn: 'নদীর শহর', ageRange: '6–8' },
  { id: 4, key: 'sky-castle', title: 'Sky Castle', titleBn: 'আকাশের দুর্গ', ageRange: '8–10' },
  { id: 5, key: 'star-academy', title: 'Star Academy', titleBn: 'তারার পাঠশালা', ageRange: '10–13' },
  // #20 — two more lands on the "living map" (journey breadth, not age-split):
  // the road keeps going past Star Academy into the deep jungle and the arctic.
  { id: 6, key: 'jungle-canopy', title: 'Jungle Canopy', titleBn: 'জঙ্গলের চাঁদোয়া', ageRange: '11–14' },
  { id: 7, key: 'polar-peaks', title: 'Polar Peaks', titleBn: 'মেরু শৃঙ্গ', ageRange: '12–15' },
  // #1164 — the map keeps going past Polar Peaks: a class-8 land for the
  // oldest cohort (ages 13–16), unlocked by progress through band 7.
  { id: 8, key: 'summit-peaks', title: 'Summit Peaks', titleBn: 'শিখর শৃঙ্গ', ageRange: '13–16' },
];

/** A SKILL FAMILY = ONE learnable concept. Several skill ids may be tiers of
 *  the same family (concrete → abstract → timed, or a band-ceiling bump of the
 *  same scene). The child's "I can do X" mastery counts ONCE per family, so
 *  overlapping ids stop fragmenting the mastery number (issues #1207-#1216).
 *
 *  i18n: the EN/BN title pair lives HERE (the central table) — per the product
 *  rule "EN first, then any language later (like Bengali)", adding a locale
 *  means extending this table, never the skill objects. */
export interface SkillFamily {
  id: string;
  title: string; // EN
  titleBn: string; // BN
  /** One short EN label per tier (universal numbers/words — "to 10", "1/4",
   *  "10%" — chosen so they read fine in any locale without translation). */
  tiers: string[];
}

export const SKILL_FAMILIES: SkillFamily[] = [
  { id: 'count', title: 'Count & build numbers', titleBn: 'গণনা ও সংখ্যা গঠন', tiers: ['to 10', 'to 20', 'to 50', 'to 100', 'to 999', 'count back'] },
  { id: 'add-within-20', title: 'Add to 20', titleBn: '২০-এর মধ্যে যোগ', tiers: ['fruit tree', 'apples', 'balloons', 'timed'] },
  { id: 'sub-within-20', title: 'Subtract within 20', titleBn: '২০-এর মধ্যে বিয়োগ', tiers: ['apples', 'timed'] },
  { id: 'mult-facts', title: 'Times tables', titleBn: 'নামতা', tiers: ['arrays', '2/5/10', '2–10', '6–9 fluency'] },
  { id: 'fair-share', title: 'Fair shares', titleBn: 'সমান ভাগ', tiers: ['share', 'remainders'] },
  { id: 'division-facts', title: 'Division facts', titleBn: 'ভাগ করা', tiers: ['÷2 & ÷3', 'within 100', 'fluency'] },
  { id: 'fractions-read', title: 'Read fractions', titleBn: 'ভগ্নাংশ পড়া', tiers: ['1/2 1/4', 'to 8 parts'] },
  { id: 'money', title: 'Bangladeshi money', titleBn: 'টাকা-পয়সা', tiers: ['recognize', 'count', 'change'] },
  { id: 'percent', title: 'Percent of a number', titleBn: 'সংখ্যার শতকরা', tiers: ['10/25/50%', '+75%'] },
  { id: 'decimals', title: 'Decimals', titleBn: 'দশমিক', tiers: ['tenths strip', 'compare/order', 'place value'] },
  { id: 'clock', title: 'Tell time', titleBn: 'ঘড়ি পড়া', tiers: ['hour/half', 'minute'] },
  // ── band 4+ families (added 2026-08-16 — SKILLS referenced these 17 ids
  //    before SKILL_FAMILIES defined them; getFamily() returned undefined so
  //    family cards fell back to the skill title and unit gates had no tier).
  { id: 'algebra', title: 'Algebra', titleBn: 'বীজগণিত', tiers: ['missing number', 'one step', 'two step'] },
  { id: 'negatives', title: 'Negative numbers', titleBn: 'ঋণাত্মক সংখ্যা', tiers: ['compare/order', 'number line', 'arithmetic'] },
  { id: 'ratio', title: 'Ratio & proportion', titleBn: 'অনুপাত', tiers: ['simplify', 'equivalent', 'unit rate'] },
  { id: 'probability', title: 'Probability', titleBn: 'সম্ভাবনা', tiers: ['words'] },
  { id: 'statistics', title: 'Statistics', titleBn: 'পরিসংখ্যান', tiers: ['mean/mode', 'larger sets'] },
  { id: 'geometry', title: 'Geometry', titleBn: 'জ্যামিতি', tiers: ['volume', 'angles'] },
  { id: 'forces-energy', title: 'Forces & energy', titleBn: 'বল ও শক্তি', tiers: ['motion', 'energy transfer', 'depth'] },
  { id: 'ecosystems', title: 'Ecosystems', titleBn: 'বাস্তুতন্ত্র', tiers: ['habitats', 'cycles', 'food webs'] },
  { id: 'human-body', title: 'The human body', titleBn: 'মানবদেহ', tiers: ['systems', 'depth', 'grade 8'] },
  { id: 'bgs-economics', title: 'Economics & society', titleBn: 'অর্থনীতি ও সমাজ', tiers: ['economics'] },
  { id: 'grammar-parts', title: 'Grammar: parts of speech', titleBn: 'ব্যাকরণ: পদ', tiers: ['adjectives/adverbs'] },
  { id: 'grammar-past', title: 'Grammar: past tense', titleBn: 'ব্যাকরণ: অতীতকাল', tiers: ['regular', 'irregular'] },
  { id: 'grammar-plurals', title: 'Grammar: plurals', titleBn: 'ব্যাকরণ: বহুবচন', tiers: ['irregulars'] },
  { id: 'reading-comp', title: 'Reading comprehension', titleBn: 'পাঠবোধ', tiers: ['inference', 'critical', 'evaluate'] },
  { id: 'writing-order', title: 'Writing order', titleBn: 'লেখার ক্রম', tiers: ['paragraph'] },
  { id: 'digital-literacy', title: 'Digital literacy', titleBn: 'ডিজিটাল দক্ষতা', tiers: ['basics', 'citizenship'] },
  { id: 'coding-logic', title: 'Coding & logic', titleBn: 'কোডিং ও যুক্তি', tiers: ['blocks', 'steps', 'debug'] },
];

export const SKILLS: Skill[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // BRAIN-ALIGNED SEQUENCE (issue #61)
  // The index follows how a child's mind actually builds mathematics:
  //   1. NUMBERS FIRST  — know quantities (count 1→10→20→50→100) BEFORE any
  //      calculation. A kid who has never counted to 50 should never be asked
  //      to add.
  //   2. CONCRETE → ABSTRACT  — every operation is introduced by a GAME that
  //      SHOWS the meaning (apples on a tree, sharing into baskets, arrays),
  //      and only then does the abstract question appear. Division: fair-share
  //      before "÷" facts. Addition: fruit tree / apple games before balloon
  //      sums. Regrouping: place value first, then carry/borrow.
  //   3. EN/BN MIRRORED  — Bangla and English hit the SAME reading stage at
  //      the SAME band: letters → sounds → first words → decoding → sentences.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Band 1 — Sprout Grove (ages 2–4): NUMBER SENSE ──
  // Learn the numbers themselves, as a song and as objects — no arithmetic.
  { id: 'count-1-10', band: 1, subject: 'math', title: 'Count to 10', titleBn: '১ থেকে ১০ গুনি', description: 'Count objects 1 to 10 in sequence', descriptionBn: '১ থেকে ১০ পর্যন্ত বস্তু ক্রমান্বয়ে গুনি', commonCore: ['K.CC.1', 'K.CC.2'], nctbCode: 'c1-math-1', classNumber: 1, game: 'game-countpop', family: 'count', tier: 1 },
  { id: 'number-song', band: 1, subject: 'math', title: 'Number song', titleBn: 'সংখ্যার গান', description: 'Sing and play the counting melody with Nova', descriptionBn: 'নোভার সাথে গুনতির গান গাই ও বাজাই', commonCore: ['K.CC.1', 'K.CC.4'], nctbCode: 'c1-math-7', classNumber: 1, game: 'game-countsong' },
  { id: 'grow-count', band: 1, subject: 'math', title: 'Plant & count', titleBn: 'বপন ও গণনা', description: 'Plant seeds and watch a sprout grow — counting with a living reward', descriptionBn: 'বীজ বপন করি আর চারা বাড়তে দেখি — গুনলে জীবন্ত পুরস্কার', commonCore: ['K.CC.4', 'K.CC.5'], nctbCode: 'c1-math-8', classNumber: 1, game: 'game-growcount' },
  { id: 'quantity-match', band: 1, subject: 'math', title: 'Match numbers', titleBn: 'সংখ্যা মেলানো', description: 'Match numerals to fruit counts in a memory game', descriptionBn: 'স্মৃতি খেলায় সংখ্যা আর ফলের পরিমাণ মেলাই', commonCore: ['K.CC.4', 'K.CC.5'], nctbCode: 'c1-math-9', classNumber: 1, game: 'game-memorypairs' },
  { id: 'count-1-20', band: 1, subject: 'math', title: 'Count to 20', titleBn: '১ থেকে ২০ গুনি', description: 'Count objects up to 20', descriptionBn: '২০ পর্যন্ত বস্তু গুনি', commonCore: ['K.CC.1'], nctbCode: 'c1-math-10', classNumber: 1, game: 'game-countpop20', family: 'count', tier: 2 },
  { id: 'number-line', band: 1, subject: 'math', title: 'Number line hops', titleBn: 'সংখ্যা রেখা', description: 'Hop a frog along the number line to the target number', descriptionBn: 'সংখ্যা রেখা ধরে ব্যাঙ লাফিয়ে লক্ষ্য সংখ্যায় যাই', commonCore: ['K.CC.4', '1.NBT.1'], nctbCode: 'c1-math-2', classNumber: 1, game: 'game-froghop' },
  { id: 'shapes', band: 1, subject: 'math', title: 'Recognize shapes', titleBn: 'আকার চিনি', description: 'Identify circle, square, triangle, star', descriptionBn: 'বৃত্ত, বর্গ, ত্রিভুজ, তারা চিনি', commonCore: ['K.G.2'], nctbCode: 'c1-math-3', classNumber: 1, game: 'game-shapecatcher' },
  // #1143 — a NO-PRESSURE free-play garden break between tap-heavy lessons.
  // Deliberately unscored: no challenge flag, no rounds, no right/wrong.
  { id: 'math-explore-garden', band: 1, subject: 'math', title: 'Explore garden', titleBn: 'বাগান সাজাই', description: 'Free-play counting and shape garden — plant and explore with no pressure', descriptionBn: 'গুনে ও আকারে সাজানো মুক্ত বাগান — কোনো চাপ ছাড়াই লাগাই আর খেলি', commonCore: ['K.CC.1', 'K.G.2'], nctbCode: 'c1-math-19', classNumber: 1, game: 'game-exploregarden' },
  // #1144 — glyph-tracing engine: the first handwriting step for numerals.
  { id: 'trace-digits', band: 1, subject: 'math', title: 'Trace numbers', titleBn: 'সংখ্যা আঁকি', description: 'Trace digits 0–9 with a finger — the first step to writing numbers', descriptionBn: 'আঙুল দিয়ে ০–৯ সংখ্যা আঁকি — সংখ্যা লেখার প্রথম ধাপ', commonCore: ['K.CC.3'], nctbCode: 'c1-math-20', classNumber: 1, game: 'game-trace', challenge: true, dataLevels: [1, 2, 3, 4, 5, 6] },
  // #1145 — parity + geometry join the shared drag-sort engine.
  { id: 'odd-even-sort', band: 1, subject: 'math', title: 'Odd & even sort', titleBn: 'জোড়-বিজোড় সাজাই', description: 'Drag number cards into the odd or even bin', descriptionBn: 'সংখ্যার কার্ড টেনে জোড় বা বিজোড় ঘরে ফেলি', commonCore: ['2.OA.3'], nctbCode: 'c1-math-21', classNumber: 1, game: 'game-oddevensort', challenge: true, dataLevels: [4, 4, 6, 6, 8, 8] },
  { id: 'shape-corner-sort', band: 1, subject: 'math', title: 'Corners or not?', titleBn: 'কোণ আছে নাকি নেই?', description: 'Drag flat shapes into has-corners or no-corners bins', descriptionBn: 'আকার টেনে কোণ-আছে বা কোণ-নেই ঘরে ফেলি', commonCore: ['K.G.4'], nctbCode: 'c1-math-22', classNumber: 1, game: 'game-shapecorner', challenge: true, dataLevels: [4, 4, 6, 6, 8, 8] },
  // Language — STAGE 1: first letters (both tracks, mirrored)
  { id: 'bn-swaroborno', band: 1, subject: 'bangla', title: 'Bangla vowels', titleBn: 'স্বরবর্ণ', description: 'Recognize Bangla vowel letters অ আ ই ঈ উ ঊ', descriptionBn: 'বাংলা স্বরবর্ণ অ আ ই ঈ উ ঊ চিনি', commonCore: ['RF.K.1d'], nctbCode: 'c1-bangla-1', classNumber: 1, game: 'game-bnletters', dataMode: 'vowels' },
  // #1145 — the same letter knowledge as a drag-and-drop classification.
  { id: 'vowel-consonant-sort', band: 1, subject: 'bangla', title: 'Vowels & consonants sort', titleBn: 'স্বরবর্ণ ও ব্যঞ্জনবর্ণ সাজাই', description: 'Drag Bangla letters into the vowel or consonant bin', descriptionBn: 'বাংলা বর্ণ টেনে স্বরবর্ণ বা ব্যঞ্জনবর্ণ ঘরে ফেলি', commonCore: ['RF.K.1d'], nctbCode: 'c1-bangla-13', classNumber: 1, game: 'game-vowelconsonant', challenge: true, dataLevels: [4, 4, 6, 6, 8, 8] },
  { id: 'bn-rhymes', band: 1, subject: 'bangla', title: 'Nursery rhymes', titleBn: 'ছড়ার গান', description: 'Recite classic NCTB Bangla rhymes, tapping along word by word', descriptionBn: 'নোভার সাথে ছড়া গাই, শব্দ ধরে টিপে টিপে', commonCore: ['RF.K.2a'], nctbCode: 'c1-bangla-5', classNumber: 1, game: 'game-rhymes' },
  // Language — letter vs sound discrimination: hear a sound, pick the matching letter among confusable twins (ক/খ, প/ফ, স/শ).
  { id: 'bn-lettersound', band: 1, subject: 'bangla', title: 'Letter sounds', titleBn: 'বর্ণের ধ্বনি', description: 'Hear a letter sound, tap the matching Bangla letter (ক/খ, প/ফ, স/শ)', descriptionBn: 'বর্ণের ধ্বনি শুনে সঠিক বর্ণ টিপি (ক/খ, প/ফ, স/শ)', commonCore: ['RF.K.3a'], nctbCode: 'c1-bangla-3', classNumber: 1, game: 'game-lettersound' },
  // Language — time words: order yesterday/today/tomorrow on a calendar timeline (কাল-আজ-আগামীকাল).
  { id: 'bn-time-words', band: 1, subject: 'bangla', title: 'Time words', titleBn: 'কাল-আজ-আগামীকাল', description: 'Order গতকাল → আজ → আগামীকাল on a calendar timeline', descriptionBn: 'গতকাল → আজ → আগামীকাল ক্যালেন্ডারে সাজাই', commonCore: ['SL.K.6'], nctbCode: 'c1-bangla-6', classNumber: 1, game: 'game-timewords' },
  // Language — direction words: follow spoken directions to move on a grid (উপরে-নিচে-ডানে-বামে).
  { id: 'bn-direction-words', band: 1, subject: 'bangla', title: 'Direction words', titleBn: 'দিকের শব্দ', description: 'Follow spoken direction words to move a character on a grid', descriptionBn: 'দিকের শব্দ শুনে গ্রিডে নায়ককে সরাই (উপরে-নিচে-বামে-ডানে)', commonCore: ['L.K.5d'], nctbCode: 'c1-bangla-7', classNumber: 1, game: 'game-directionwords' },
  // Values — polite words: pick ধন্যবাদ / দয়া করে / দুঃখিত in everyday scenarios (শিষ্টাচার).
  { id: 'bn-polite-words', band: 1, subject: 'bangla', title: 'Polite words', titleBn: 'শিষ্টাচার', description: 'Tap the polite reply (ধন্যবাদ, দয়া করে, দুঃখিত) for everyday scenarios', descriptionBn: 'প্রতিদিনের পরিস্থিতিতে ভদ্র শব্দ টিপি (ধন্যবাদ, দয়া করে, দুঃখিত)', commonCore: ['SL.K.6'], nctbCode: 'c1-bangla-8', classNumber: 1, game: 'game-polite' },
  { id: 'en-abcs', band: 1, subject: 'english', title: 'ABCs', titleBn: 'ইংরেজি বর্ণমালা', description: 'Recognize uppercase letters A–F', descriptionBn: 'বড় হাতের ইংরেজি অক্ষর A–F চিনি', commonCore: ['RF.K.1d'], nctbCode: 'c1-english-1', classNumber: 1, game: 'game-enletters' },
  // #1144 — glyph-tracing engine: the first handwriting step for capitals.
  { id: 'trace-letters', band: 1, subject: 'english', title: 'Trace letters', titleBn: 'ইংরেজি অক্ষর আঁকি', description: 'Trace capital letters with a finger — the first step to handwriting', descriptionBn: 'আঙুল দিয়ে ইংরেজি বড় হাতের অক্ষর আঁকি — হাতের লেখার প্রথম ধাপ', commonCore: ['RF.K.1d'], nctbCode: 'c1-english-8', classNumber: 1, game: 'game-trace', challenge: true, dataLevels: [1, 2, 3, 4, 5, 6] },
  // STAGE 1 vocabulary — first number/word names in each language
  { id: 'bn-numbers', band: 1, subject: 'bangla', title: 'Bangla numbers', titleBn: 'বাংলা সংখ্যা', description: 'Hear and recognize Bangla numerals ০–৯', descriptionBn: 'বাংলা সংখ্যা ০–৯ শুনে চিনি', commonCore: ['K.CC.1'], nctbCode: 'c1-bangla-2', classNumber: 1, game: 'game-bnnumbers' },
  { id: 'en-shapes', band: 1, subject: 'english', title: 'Shape names', titleBn: 'আকৃতির নাম', description: 'English names of shapes (circle, square, triangle)', descriptionBn: 'আকৃতির ইংরেজি নাম (বৃত্ত, বর্গ, ত্রিভুজ)', commonCore: ['L.K.5c'], nctbCode: 'c1-english-3', classNumber: 1, game: 'game-shapenames' },
  { id: 'en-wordfamilies', band: 1, subject: 'english', title: 'Word families', titleBn: 'শব্দ পরিবার', description: 'Sort words into rhyming families (-at, -an, -ig, -op)', descriptionBn: 'মিলিয়ে লেখা শব্দগুলো পরিবারে সাজাও (-at, -an, -ig, -op)', commonCore: ['RF.K.3d'], nctbCode: 'c1-english-4', classNumber: 1, game: 'game-wordfam' },
  { id: 'en-yesno', band: 1, subject: 'english', title: 'Yes or no?', titleBn: 'হ্যাঁ নাকি না?', description: 'Hear a sentence and a question; tap YES or NO (slow-replay button)', descriptionBn: 'একটা বাক্য ও প্রশ্ন শোনো; হ্যাঁ বা না চাপো (ধীরে শোনার বোতাম)', commonCore: ['SL.K.2'], nctbCode: 'c1-english-5', classNumber: 1, game: 'game-yesno' },
  // ICT — fine tap/drag motor skills (band 1 foundational, #234)
  { id: 'ict-tap-drag', band: 1, subject: 'ict', title: 'Tap & drag accuracy', titleBn: 'টিপা-টানা অনুশীলন', description: 'Tap the bugs, drag the butterfly into the net', descriptionBn: 'পোকা টিপি, প্রজাপতি নেটে নিই', commonCore: [], nctbCode: 'c1-ict-1', classNumber: 1, game: 'game-tapdrag' },
  { id: 'ict-keyboard', band: 1, subject: 'ict', title: 'Keyboard explorer', titleBn: 'কীবোর্ড এক্সপ্লোরার', description: 'Find letters and numbers on a friendly on-screen keyboard', descriptionBn: 'কার্টুন কীবোর্ডে বর্ণ ও সংখ্যা খুঁজি', commonCore: [], nctbCode: 'c1-ict-2', classNumber: 1, game: 'game-keyboard' },
  { id: 'ict-device-manners', band: 1, subject: 'ict', title: 'Device manners', titleBn: 'ডিভাইসের আদব', description: 'Turn a device on and off safely and wait patiently', descriptionBn: 'ডিভাইস চালু-বন্ধ করি আর ধৈর্য ধরি', commonCore: [], nctbCode: 'c1-ict-3', classNumber: 1, game: 'game-device' },
  // ICT — computer parts & safe offline habits: tap the part, sort safe/unsafe.
  { id: 'ict-computer-safety', band: 3, subject: 'ict', title: 'Computer parts & safety', titleBn: 'কম্পিউটার ও নিরাপদ অভ্যাস', description: 'Tap computer parts and sort safe, offline-first habits', descriptionBn: 'কম্পিউটারের যন্ত্রাংশ চেনো আর নিরাপদ অভ্যাস সাজাও — সম্পূর্ণ অফলাইন', commonCore: [], nctbCode: 'c3-ict-1', classNumber: 3, game: 'game-computer' },
  { id: 'bgs-professions', band: 2, subject: 'bgs', title: 'Community helpers', titleBn: 'সমাজের সাহায্যকারী', description: 'Match 12 community helpers to their tools', descriptionBn: '১২ জন সাহায্যকারীকে তাঁদের সরঞ্জামের সঙ্গে মেলাই', commonCore: [], nctbCode: 'c2-bgs-2', classNumber: 2, game: 'game-professions' },
  { id: 'bgs-festivals', band: 2, subject: 'bgs', title: 'Our festivals', titleBn: 'আমাদের উৎসব', description: 'Sort Pohela Boishakh and Eid customs and items', descriptionBn: 'পহেলা বৈশাখ ও ঈদের রীতিনীতি সাজাই', commonCore: [], nctbCode: 'c2-bgs-3', classNumber: 2, game: 'game-festivals' },
  { id: 'bgs-kindness', band: 1, subject: 'bgs', title: 'Kind heart', titleBn: 'দয়ালু হৃদয়', description: 'Choose kind responses in everyday situations', descriptionBn: 'দৈনন্দিন পরিস্থিতিতে দয়ালু উত্তর বাছাই', commonCore: [], nctbCode: 'c1-bgs-2', classNumber: 1, game: 'game-kindness' },
  { id: 'bgs-honesty', band: 2, subject: 'bgs', title: 'Truth star', titleBn: 'সত্যের তারকা', description: 'Choose the truthful response in everyday situations — no shame, just soft encouragement', descriptionBn: 'দৈনন্দিন পরিস্থিতিতে সত্যিকারের উত্তর বাছাই — লজ্জা নয়, কেবল আন্তরিক উৎসাহ', commonCore: [], nctbCode: 'c2-bgs-4', classNumber: 2, game: 'game-honesty' },
  // Values — patience & waiting (band 1, BGS moral/values strand).
  { id: 'bgs-patience', band: 1, subject: 'bgs', title: 'Patience & waiting', titleBn: 'ধৈর্য ও অপেক্ষা', description: 'Wait for the reward — patience pays', descriptionBn: 'পুরস্কার পেতে অপেক্ষা করি — ধৈর্যের ফসল', commonCore: [], nctbCode: 'c1-bgs-1', classNumber: 1, game: 'game-patience' },
  // Values — good habits & hygiene: sort good/healthy habits with gentle, no-shame feedback.
  { id: 'bgs-habits', band: 1, subject: 'bgs', title: 'Good habits & hygiene', titleBn: 'ভালো অভ্যাস ও পরিচ্ছন্নতা', description: 'Sort healthy habits — brushing, washing hands, sharing — with gentle encouragement', descriptionBn: 'ভালো অভ্যাস সাজাই — দাঁত মাজা, হাত ধোয়া, ভাগ করে খেলা — আন্তরিক উৎসাহে', commonCore: [], nctbCode: 'c1-bgs-3', classNumber: 1, game: 'game-habits' },

  // ── Band 2 — Cottage Fields (ages 4–6): FINISH NUMBERS, THEN CALCULATE ──
  // The counting ladder first (a kid must KNOW numbers before adding them) …
  { id: 'count-to-50', band: 2, subject: 'math', title: 'Count to 50', titleBn: '৫০ পর্যন্ত গুনি', description: 'Count objects up to 50', descriptionBn: '৫০ পর্যন্ত বস্তু গুনি', commonCore: ['1.NBT.1'], nctbCode: 'c1-math-11', classNumber: 1, game: 'game-countpop50', family: 'count', tier: 3 },
  { id: 'count-to-100', band: 2, subject: 'math', title: 'Count to 100', titleBn: '১০০ পর্যন্ত গুনি', description: 'Build numbers to 100 by bundling ten-rods and ones', descriptionBn: 'দশের ছড় আর একক জুড়ে ১০০ পর্যন্ত সংখ্যা গঠন করি', commonCore: ['1.NBT.1', '2.NBT.1'], nctbCode: 'c1-math-12', classNumber: 1, game: 'game-count100', family: 'count', tier: 4 },
  { id: 'count-to-999', band: 2, subject: 'math', title: 'Build to 999', titleBn: '৯৯৯ পর্যন্ত গঠন', description: 'Build three-digit numbers with hundred-flats, ten-rods and ones', descriptionBn: 'শতক, দশক আর একক দিয়ে তিন-অঙ্কের সংখ্যা গঠন করি', commonCore: ['2.NBT.1', '2.NBT.3'], nctbCode: 'c2-math-1', classNumber: 2, game: 'game-build999', family: 'count', tier: 5 },
  // Number PROPERTIES — odd/even (parity) rides the count ladder: pair the dots,
  // spot the lone one. Common Core puts it with 2.OA.3 (parity of groups).
  { id: 'odd-even', band: 2, subject: 'math', title: 'Odd & even', titleBn: 'জোড় ও বিজোড়', description: 'Sort numbers into odd and even by pairing the dots', descriptionBn: 'জোড়া বানিয়ে সংখ্যাকে জোড়-বিজোড়ে ভাগ করি', commonCore: ['2.OA.3'], nctbCode: 'c2-math-2', classNumber: 2, game: 'game-oddeven' },
  // Geometry — shapes by sides & corners: tap the drawn polygon to count each
  // side/corner highlighted green, then pick the total (K.G.4 / 1.G.1).
  { id: 'shapes-parts', band: 2, subject: 'math', title: 'Shapes: sides & corners', titleBn: 'আকার: বাহু ও কোণ', description: 'Count sides and corners of drawn shapes (triangle 3, square 4, rectangle 4, pentagon 5, hexagon 6, circle 0)', descriptionBn: 'আঁকা আকারের বাহু-কোণ গুনি (ত্রিভুজ ৩, বর্গ ৪, আয়তক্ষেত্র ৪, পঞ্চভুজ ৫, ষড়ভুজ ৬, বৃত্ত ০)', commonCore: ['1.G.1'], nctbCode: 'c2-math-6', classNumber: 2, game: 'game-shapeparts' },
  // …then addition, CONCRETE GAME FIRST, abstract drill LAST:
  { id: 'fruit-tree-add', band: 2, subject: 'math', title: 'Fruit tree addition', titleBn: 'ফলের গাছ যোগ', description: 'Grow fruit on a tree as you add — see addition happen (tier 1 of Add to 20)', descriptionBn: 'যোগ করলে গাছে ফল জন্মায় — যোগ করা চোখে দেখা যায় (২০-এর মধ্যে যোগের ধাপ ১)', commonCore: ['1.OA.6'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-fruittree', family: 'add-within-20', tier: 1 },
  { id: 'add-within-10', band: 2, subject: 'math', title: 'Add within 10', titleBn: '১০-এর মধ্যে যোগ', description: 'Addition facts with sums to 10 (apples shown)', descriptionBn: 'যোগফল ১০-এর মধ্যে (আপেল দেখিয়ে)', commonCore: ['1.OA.6'], nctbCode: 'c1-math-13', classNumber: 1, game: 'game-fruitadd-10', dataMode: 'add' },
  { id: 'sub-within-10', band: 2, subject: 'math', title: 'Subtract within 10', titleBn: '১০-এর মধ্যে বিয়োগ', description: 'Subtraction facts within 10 (apples shown)', descriptionBn: '১০-এর মধ্যে বিয়োগ (আপেল দেখিয়ে)', commonCore: ['1.OA.6'], nctbCode: 'c1-math-5', classNumber: 1, game: 'game-fruitsub-10', dataMode: 'sub' },
  { id: 'number-bonds-10', band: 2, subject: 'math', title: 'Number bonds to 10', titleBn: '১০-এর জোড়া সংখ্যা', description: 'Partition numbers to 10 — the backbone of add & sub', descriptionBn: '১০-এর ভাঙা সংখ্যা — যোগ-বিয়োগের ভিত্তি', commonCore: ['K.OA.3', '1.OA.6'], nctbCode: 'c1-math-14', classNumber: 1, game: 'game-bnbonds' },
  { id: 'number-bonds-20', band: 2, subject: 'math', title: 'Number bonds to 20', titleBn: '২০-এর জোড়া সংখ্যা', description: 'Partition numbers to 20 with double ten-frames', descriptionBn: 'দুই দশ-ফ্রেমে ২০-এর ভাঙা সংখ্যা', commonCore: ['1.OA.6', '2.OA.2'], nctbCode: 'c1-math-15', classNumber: 1, game: 'game-bnbonds20' },
  // #1141 — shared memory-flip engine: recall the two addends that make 10.
  { id: 'mem-number-bonds', band: 2, subject: 'math', title: 'Number bond memory', titleBn: 'সংখ্যা জোড়ার স্মৃতি', description: 'Flip hidden cards to recall the two numbers that make 10 (3 + 7)', descriptionBn: 'লুকানো কার্ড খুলে ১০-এর জোড়ার দুটো সংখ্যা মনে করে মেলাই (৩ + ৭)', commonCore: ['K.OA.3', '1.OA.6'], nctbCode: 'c2-math-16', classNumber: 2, game: 'game-memory', challenge: true, dataLevels: [6, 8, 12, 16, 20, 20] },
  { id: 'add-within-20', band: 2, subject: 'math', title: 'Add within 20', titleBn: '২০-এর মধ্যে যোগ', description: 'Addition facts with sums to 20 (apples shown)', descriptionBn: 'যোগফল ২০-এর মধ্যে (আপেল দেখিয়ে)', commonCore: ['1.OA.6', '2.OA.2'], nctbCode: 'c1-math-16', classNumber: 1, game: 'game-fruitadd-20', family: 'add-within-20', tier: 2, dataMode: 'add' },
  { id: 'sub-within-20', band: 2, subject: 'math', title: 'Subtract within 20', titleBn: '২০-এর মধ্যে বিয়োগ', description: 'Subtraction facts within 20 (apples shown)', descriptionBn: '২০-এর মধ্যে বিয়োগ (আপেল দেখিয়ে)', commonCore: ['1.OA.6', '2.OA.2'], nctbCode: 'c1-math-18', classNumber: 1, game: 'game-fruitsub-20', family: 'sub-within-20', tier: 1, dataMode: 'sub' },
  { id: 'add-to-20', band: 2, subject: 'math', title: 'Balloon sums to 20', titleBn: 'বেলুন ফুটিয়ে যোগ', description: 'Pop balloons with the right sums — abstract speed drill', descriptionBn: 'সঠিক যোগফলের বেলুন ফুটাই — দ্রুত অনুশীলন', commonCore: ['1.OA.6', '2.OA.2'], nctbCode: 'c1-math-17', classNumber: 1, game: 'game-balloonpop', family: 'add-within-20', tier: 3 },
  // Math — addition facts fluency: rapid-fire timed drill to 20 with speed ⚡ + accuracy tally.
  { id: 'en-addfacts', band: 2, subject: 'math', title: 'Add facts to 20', titleBn: '২০-এর মধ্যে যোগ অনুশীলন', description: 'Rapid-fire addition facts to 20 with speed + accuracy tracking (top tier of Add to 20)', descriptionBn: 'দ্রুত-দ্রুত ২০-এর মধ্যে যোগ, গতি ও নির্ভুলতা দেখা হয় (২০-এর মধ্যে যোগের শেষ ধাপ)', commonCore: ['1.OA.C.6'], nctbCode: 'c2-math-15', classNumber: 2, game: 'game-addfacts', family: 'add-within-20', tier: 4 },
  // Math — subtraction facts fluency: timed drill to 20 with a number-line aid (the minus twin).
  { id: 'en-subfacts', band: 2, subject: 'math', title: 'Subtract facts to 20', titleBn: '২০-এর মধ্যে বিয়োগ অনুশীলন', description: 'Rapid-fire subtraction facts to 20 with a number-line hop and speed + accuracy tracking (timed tier of Subtract within 20)', descriptionBn: 'দ্রুত-দ্রুত ২০-এর মধ্যে বিয়োগ, সংখ্যারেখায় লাফিয়ে গতি ও নির্ভুলতা দেখা হয় (২০-এর মধ্যে বিয়োগের দ্রুত ধাপ)', commonCore: ['1.OA.C.6'], nctbCode: 'c2-math-7', classNumber: 2, game: 'game-subfacts', family: 'sub-within-20', tier: 2 },
  // Math — doubles strategy: chant the doubles, then transfer to near-doubles (+1) with dot arrays.
  { id: 'en-doubles', band: 2, subject: 'math', title: 'Doubles & near-doubles', titleBn: 'দ্বিগুণ ও প্রায় দ্বিগুণ', description: 'Learn doubles facts with a spoken chant and dot arrays, then solve near-doubles as double + 1', descriptionBn: 'গান ও বিন্দু দিয়ে দ্বিগুণ শিখি, তারপর দ্বিগুণ + ১ দিয়ে প্রায় দ্বিগুণ করি', commonCore: ['1.OA.C.6', '2.OA.B.2'], nctbCode: 'c2-math-8', classNumber: 2, game: 'game-doubles' },
  // Math — making ten: fill a ten-frame and bridge to the teens (8+5 = 8+2+3 = 10+3).
  { id: 'en-maketen', band: 2, subject: 'math', title: 'Making ten', titleBn: 'দশ বানাই', description: 'Compose ten inside ten-frames, then bridge to teen sums with the leftover', descriptionBn: 'দশ-ফ্রেমে দশ বানাই, তারপর বাকি দিয়ে কিশোর সংখ্যা করি', commonCore: ['1.OA.C.6'], nctbCode: 'c2-math-9', classNumber: 2, game: 'game-maketen' },
  // Math — 2-digit written method: scaffolded carry addition with base-10 block visuals.
  { id: 'en-addregroup', band: 2, subject: 'math', title: 'Carry addition (visual)', titleBn: 'ক্যারি যোগ (দৃশ্য)', description: 'Add two 2-digit numbers step by step with base-10 blocks and a regroup animation', descriptionBn: 'দশক-একক যোগ করি ধাপে ধাপে, ব্লক দেখে ক্যারি অ্যানিমেশনসহ', commonCore: ['2.NBT.B.5', '2.NBT.B.6'], nctbCode: 'c2-math-10', classNumber: 2, game: 'game-addregroup' },
  // Math — 2-digit written method: scaffolded borrowing with base-10 block visuals.
  { id: 'en-subborrow', band: 2, subject: 'math', title: 'Borrow subtraction (visual)', titleBn: 'ধার বিয়োগ (দৃশ্য)', description: 'Subtract two 2-digit numbers step by step with base-10 blocks and a borrow animation', descriptionBn: 'দুই অঙ্কের বিয়োগ করি ধাপে ধাপে, ব্লক দেখে ধার অ্যানিমেশনসহ', commonCore: ['2.NBT.B.5'], nctbCode: 'c2-math-11', classNumber: 2, game: 'game-subborrow' },
  // Math — multiplication arrays: countable dot arrays teach tables 2-5 before numbers.
  { id: 'en-array-mult', band: 2, subject: 'math', title: 'Array times tables', titleBn: 'বিন্যাসে গুণ', description: 'Match a dot array (rows × columns) to its equation — tables 2 to 5 (the concrete array intro to the times tables)', descriptionBn: 'বিন্দুর বিন্যাস (সারি × কলাম) মিলিয়ে গুণের সমীকরণ — ২ থেকে ৫ এর নামতা (নামতার চাক্ষুষ শুরু)', commonCore: ['2.OA.C.4', '3.OA.A.1'], nctbCode: 'c2-math-12', classNumber: 2, game: 'game-array-mult', family: 'mult-facts', tier: 1 },
  { id: 'skipcount', band: 2, subject: 'math', title: 'Skip count!', titleBn: 'ধাপে ধাপে!', description: 'Continue +3 and +4 sequences on a number line — tap the next number', descriptionBn: 'সংখ্যা রেখায় +৩ ও +৪ এর ধারা এগোই — পরের সংখ্যাটি টিপি', commonCore: ['2.NBT.A.2'], nctbCode: 'c2-math-13', classNumber: 2, game: 'game-skipcount' },
  // Math — division as sharing lvl 2: fair shares extended to the remainder concept.
  { id: 'en-shares2', band: 3, subject: 'math', title: 'Fair shares 2 (remainders)', titleBn: 'সমান ভাগ ২ (ভাগশেষ)', description: 'Watch candies share round-robin into plates, then find each share and the leftover (tier 2 of Fair shares)', descriptionBn: 'ক্যান্ডি ঘুরে ঘুরে ভাগ হয় দেখি, তারপর প্রত্যেকের ভাগ আর বাকি খুঁজি (সমান ভাগের ধাপ ২)', commonCore: ['3.OA.A.2', '3.OA.C.7'], nctbCode: 'c3-math-8', classNumber: 3, game: 'game-shares2', family: 'fair-share', tier: 2 },
  // Math — fractions of a set: tap the correct subset of a group (1/2 of 8 → 4).
  { id: 'en-fracset', band: 3, subject: 'math', title: 'Fractions of a set', titleBn: 'সমষ্টির ভগ্নাংশ', description: 'Find a fraction of a group by tapping the right number of fruits (1/2 of 8)', descriptionBn: 'গুচ্ছের ভগ্নাংশ খুঁজি — সঠিক সংখ্যক ফল তাপ করে (৮-এর ১/২)', commonCore: ['3.NF.A.1'], nctbCode: 'c3-math-9', classNumber: 3, game: 'game-fracset' },
  // Math — mixed numbers & improper fractions: bar + number line show 1½ = 3/2 (convert visually).
  { id: 'en-mixedfrac', band: 3, subject: 'math', title: 'Mixed numbers & improper fractions', titleBn: 'মিশ্র সংখ্যা ও অপ্রকৃত ভগ্নাংশ', description: 'See 1½ on a bar and a number line, then match it to its improper fraction 3/2', descriptionBn: 'বার আর সংখ্যা রেখায় ১½ দেখি, তারপর মিশিয়ে খুঁজি সমান ভগ্নাংশ ৩/২', commonCore: ['3.NF.A.3c'], nctbCode: 'c3-math-10', classNumber: 3, game: 'game-mixedfrac' },
  // Math — decimals to tenths: shade/read a 10-cell strip in 0.1 steps (place-value speech).
  { id: 'en-dectenths', band: 3, subject: 'math', title: 'Decimal tenths', titleBn: 'দশমিকের দশক', description: 'Read a shaded 10-cell strip as a decimal (0.3) and build one by shading cells (tenths — tier 1 of Decimals)', descriptionBn: 'ছাপানো ১০ ঘরের দশমিক পড়ি (০.৩) আর ঘর ছাপিয়ে বানাই (দশমাংশ — দশমিকের ধাপ ১)', commonCore: ['4.NF.C.6'], nctbCode: 'c3-math-11', classNumber: 3, game: 'game-dectenths', family: 'decimals', tier: 1 },
  // Math — making change with ৳ notes: pay with ৳50/৳100, compute the change; tap notes to make exact amounts.
  { id: 'en-makechange', band: 3, subject: 'math', title: 'Making change (৳ notes)', titleBn: 'টাকা ফেরত (নোট)', description: 'Pay with a ৳50/৳100 note and compute the change, then make exact amounts by tapping ৳5/10/20/50 (top tier of Money)', descriptionBn: '৳৫০/৳১০০ নোট দিয়ে দাম দিয়ে ফেরত বের করি, তারপর নোট ছাপিয়ে ঠিক অংক বানাই (টাকা-পয়সার শেষ ধাপ)', commonCore: ['2.MD.C.8'], nctbCode: 'c3-math-12', classNumber: 3, game: 'game-makechange', family: 'money', tier: 3 },
  // Math — elapsed time: an analog clock + a digital target, "how many minutes until …?".
  { id: 'en-elapsed', band: 3, subject: 'math', title: 'Elapsed time (how long until…)', titleBn: 'সময়ের হিসাব (কতক্ষণ পরে…)', description: 'Watch an analog clock and find how many minutes until the digital target time', descriptionBn: 'ঘড়ি দেখে খুঁজি ডিজিটাল সময় পর্যন্ত কত মিনিট বাকি', commonCore: ['2.MD.C.7', '3.MD.A.1'], nctbCode: 'c3-math-13', classNumber: 3, game: 'game-elapsed' },
  // Math — measurement: compare length (cm/m), weight (kg/g) and capacity (L/mL).
  // NCTB class-3 math has a measurement unit (মাপজোক); the scene also teaches
  // 1 m = 100 cm, 1 kg = 1000 g, 1 L = 1000 mL by mixing units at higher levels.
  { id: 'math-measure', band: 3, subject: 'math', title: 'Measurement (compare)', titleBn: 'মাপজোক (তুলনা)', description: 'Tap the longer, heavier or larger — comparing cm/m, kg/g and L/mL', descriptionBn: 'লম্বা, ভারী বা বেশি কোনটা — ট্যাপ করে তুলনা করি, সেমি/মিটার, কেজি/গ্রাম আর লিটার/মিলি মেপে', commonCore: ['1.MD.1', '1.MD.2', '3.MD.2'], nctbCode: 'c3-math-16', classNumber: 3, game: 'game-measure' },
  // Math — perimeter intro: add the side lengths around a fence, unit cubes along every edge.
  { id: 'en-perim', band: 3, subject: 'math', title: 'Perimeter intro', titleBn: 'পরিসীমা শুরু', description: 'Count/add the unit-cube fence around a rectangle (4 sides) or right triangle (3 sides)', descriptionBn: 'আয়তক্ষেত্র (৪ বাহু) বা সমকোণী ত্রিভুজ (৩ বাহু) ঘিরে একক ঘনক বেড়া গুনি/যোগ করি', commonCore: ['3.MD.D.8'], nctbCode: 'c3-math-14', classNumber: 3, game: 'game-perim' },
  // Math — 2D → 3D shape pairing: match flat faces (square→cube) to rotating solids.
  { id: 'en-solidmatch', band: 3, subject: 'math', title: 'Flat faces & solids', titleBn: 'ভাঁজ ও ঘনবস্তু', description: 'Match flat faces to their solid — square→cube, rectangle→cuboid, circle→cylinder, triangle→pyramid — on rotating 3D previews', descriptionBn: 'ভাঁজ মিলিয়ে ঘনবস্তু খুঁজি — বর্গ→ঘনক, আয়তক্ষেত্র→আয়তঘন, বৃত্ত→বেলন, ত্রিভুজ→পিরামিড — ঘোরানো প্রিভিউ দেখে', commonCore: ['2.G.A.1'], nctbCode: 'c3-math-15', classNumber: 3, game: 'game-solidmatch' },
  // Math — symmetry: complete the mirror half of a picture across the fold line.
  { id: 'en-symmetry', band: 2, subject: 'math', title: 'Symmetry mirror', titleBn: 'আয়নার প্রতিসাম্য', description: 'Complete the mirror half of a picture across the fold line (heart, tree, butterfly, house…)', descriptionBn: 'ভাঁজ রেখা বরাবর ছবির আয়নার অর্ধেকটি পূরণ করি (হৃদয়, গাছ, প্রজাপতি, বাড়ি…)', commonCore: ['2.G.A.1'], nctbCode: 'c3-math-18', classNumber: 3, game: 'game-symmetry' },
  // Science — animal moves: sort 24 animals into fly / swim / crawl / walk bins.
  { id: 'en-animals-move', band: 2, subject: 'science', title: 'Animal moves', titleBn: 'প্রাণীর চলাফেরা', description: 'Sort animals by how they move — fly, swim, crawl, walk (bee, fish, snake, elephant…)', descriptionBn: 'প্রাণীকে তার চলাফেরা অনুযায়ী সাজাই — উড়ে, সাঁতার, হামাগুড়ি, হেঁটে (মৌমাছি, মাছ, সাপ, হাতি…)', commonCore: ['1.LS.1'], nctbCode: 'c2-science-6', classNumber: 2, game: 'game-animalsmove' },
  // Science — plant life cycle: order seed → sprout → plant → flower → fruit with a growing pot.
  { id: 'en-plant-life', band: 2, subject: 'science', title: 'Plant life cycle', titleBn: 'গাছের জীবনচক্র', description: 'Order the plant life cycle — seed, sprout, plant, flower, fruit — and watch it grow in a pot', descriptionBn: 'গাছের জীবনচক্র সাজাই — বীজ, চারা, গাছ, ফুল, ফল — আর পাত্রে বাড়তে দেখি', commonCore: ['1.LS.1'], nctbCode: 'c2-science-7', classNumber: 2, game: 'game-plantlife' },
  // Science — plants parts & needs: tap the part (root/stem/leaf/flower) and
  // sort what a plant needs (water/sun/soil/air) — a seed grows as you answer.
  { id: 'science-plants', band: 2, subject: 'science', title: 'Plants: parts & needs', titleBn: 'গাছ: অঙ্গ ও প্রয়োজন', description: 'Tap the plant part and pick what a plant needs to grow', descriptionBn: 'গাছের অঙ্গ চেপে দেখাই আর গাছের কী দরকার বাছাই করি', commonCore: ['1.LS.1'], nctbCode: 'c2-science-11', classNumber: 2, game: 'game-plants' },
  // Science — weather & seasons: sort clothes/activities into summer/rainy/winter/spring bins.
  { id: 'en-weather-seasons', band: 1, subject: 'science', title: 'Weather & seasons', titleBn: 'আবহাওয়া ও ঋতু', description: 'Sort clothes and activities by season — sunscreen for summer, umbrella for rainy, scarf for winter, kite for spring', descriptionBn: 'ঋতু অনুযায়ী পোশাক-কাজ সাজাই — গ্রীষ্মে সানস্ক্রিন, বর্ষায় ছাতা, শীতে স্কার্ফ, বসন্তে ঘুড়ি', commonCore: ['K.ESS.2'], nctbCode: 'c1-science-2', classNumber: 1, game: 'game-seasons' },
  // Science — living & non-living: sort 36 pictures into জীব (living) / জড় (non-living).
  { id: 'science-living', band: 1, subject: 'science', title: 'Living & non-living', titleBn: 'জীব ও জড়', description: 'Sort pictures into living (grows, breathes) or non-living things', descriptionBn: 'ছবি সাজাই জীব (বাঁচে, বাড়ে) নাকি জড়', commonCore: ['1.LS.1'], nctbCode: 'c1-science-3', classNumber: 1, game: 'game-living' },
  // #1145 — plant/animal sort fills the science slot beside living/non-living.
  { id: 'plant-animal-sort', band: 1, subject: 'science', title: 'Plant or animal?', titleBn: 'গাছ নাকি প্রাণী?', description: 'Drag living things into the plant or animal bin', descriptionBn: 'জীবন্ত জিনিস টেনে গাছ বা প্রাণী ঘরে ফেলি', commonCore: ['1.LS.1'], nctbCode: 'c1-science-5', classNumber: 1, game: 'game-plantanimal', challenge: true, dataLevels: [4, 4, 6, 6, 8, 8] },
  // Science — five senses: which sense do we use for each sound/smell/taste/picture.
  { id: 'science-senses', band: 1, subject: 'science', title: 'Five senses', titleBn: 'পাঁচ ইন্দ্রিয়', description: 'Drag each picture into the sense we use — see, hear, smell, taste, touch', descriptionBn: 'প্রতিটি ছবি টেনে সঠিক ইন্দ্রিয়ের ঘরে ফেলি — দেখা, শোনা, গন্ধ, স্বাদ, স্পর্শ', commonCore: ['1.LS.1'], nctbCode: 'c1-science-4', classNumber: 1, game: 'game-senses' },
  // Science — light & shadows: predict where the shadow falls as the light moves.
  { id: 'en-light-shadows', band: 2, subject: 'science', title: 'Light & shadows', titleBn: 'আলো ও ছায়া', description: 'Predict the shadow — it falls opposite the light; low light makes a long shadow, high light a short one', descriptionBn: 'ছায়া কোথায় পড়বে ভবিষ্যদ্বাণী করি — আলোর বিপরীতে; নিচু আলো লম্বা ছায়া, উঁচু আলো ছোট ছায়া', commonCore: ['1.PS.3'], nctbCode: 'c2-science-8', classNumber: 2, game: 'game-shadows' },
  // Science — magnets: predict attract/repel from the facing poles, then try it.
  { id: 'en-magnets', band: 2, subject: 'science', title: 'Magnets', titleBn: 'চুম্বক', description: 'Predict whether magnets attract or repel — opposite poles attract, same poles repel — then try it', descriptionBn: 'চুম্বক টানবে নাকি ঠেলবে ভবিষ্যদ্বাণী করি — বিপরীত মেরু টানে, একই মেরু ঠেলে দেয় — তারপর চেষ্টা করি', commonCore: ['3.PS.2'], nctbCode: 'c2-science-9', classNumber: 2, game: 'game-magnets' },
  // Science — water cycle: order water → vapor → cloud → rain with a cartoon scene.
  { id: 'en-water-cycle', band: 2, subject: 'science', title: 'Water cycle', titleBn: 'পানিচক্র', description: 'Order the water cycle — water, vapor, cloud, rain — and watch the cartoon sun, pond, cloud and rain bring it to life', descriptionBn: 'পানিচক্র সাজাই — পানি, বাষ্প, মেঘ, বৃষ্টি — আর কার্টুন সূর্য-পুকুর-মেঘ-বৃষ্টিতে দেখি', commonCore: ['2.ESS.2'], nctbCode: 'c2-science-10', classNumber: 2, game: 'game-watercycle' },
  { id: 'bd-taka', band: 2, subject: 'math', title: 'Taka notes & change', titleBn: 'টাকার নোট ও ফেরত', description: 'Recognize taka coins and notes, make amounts, and give change', descriptionBn: 'টাকার কয়েন ও নোট চিনি, অংক বানাই, আর ফেরত দিই', commonCore: ['2.MD.8'], nctbCode: 'c1-math-6', classNumber: 1, game: 'game-bdtaka', family: 'money', tier: 1 },
  // Math — coin values: ৳1/৳2/৳5 coin recognition + count-to-total, names spoken (পয়সা চেনা).
  { id: 'bn-coin-values', band: 2, subject: 'math', title: 'Coin values', titleBn: 'পয়সা চিনি', description: 'Recognize ৳1/৳2/৳5 coins and count small totals (tier 2 of Money)', descriptionBn: '৳১/৳২/৳৫ পয়সা চিনি আর ছোট অংক গুনি (টাকা-পয়সার ধাপ ২)', commonCore: ['2.MD.8'], nctbCode: 'c2-math-5', classNumber: 2, game: 'game-coinvalues', family: 'money', tier: 2 },
  // Language — STAGE 2: more letters + sounds (mirrored)
  { id: 'bn-benjonborno', band: 2, subject: 'bangla', title: 'Bangla consonants', titleBn: 'ব্যঞ্জনবর্ণ', description: 'Recognize Bangla consonant letters ক খ গ ঘ', descriptionBn: 'বাংলা ব্যঞ্জনবর্ণ ক খ গ ঘ চিনি', commonCore: ['RF.K.1d'], nctbCode: 'c1-bangla-11', classNumber: 1, game: 'game-bnconsonants', dataMode: 'consonants' },
  { id: 'bn-colors', band: 2, subject: 'bangla', title: 'Bangla colors', titleBn: 'রঙ চিনি', description: 'Name colors in Bangla (লাল, নীল, সবুজ)', descriptionBn: 'বাংলায় রঙের নাম বলি (লাল, নীল, সবুজ)', commonCore: ['L.K.5a'], nctbCode: 'c1-bangla-4', classNumber: 1, game: 'game-bncolors' },
  // Language — sight words: whole-word recall of short high-frequency words (দেখে বলো).
  { id: 'bn-sightwords', band: 2, subject: 'bangla', title: 'Bangla sight words', titleBn: 'দেখে বলো শব্দ', description: 'Read short high-frequency Bangla words on sight (আমি, তুমি, সে, না)', descriptionBn: 'দেখেই বাংলা শব্দ পড়ি (আমি, তুমি, সে, না)', commonCore: ['RF.2.3g'], nctbCode: 'c2-bangla-5', classNumber: 2, game: 'game-bnsightwords' },
  // Language — sentence building: SVO word-order grammar with role-colored tiles.
  { id: 'bn-sentence-builder', band: 2, subject: 'bangla', title: 'Sentence builder', titleBn: 'বাক্য সাজাই', description: 'Arrange colored tiles into a simple subject-verb-object sentence', descriptionBn: 'রঙিন টাইল সাজিয়ে সহজ বাক্য বানাই (কর্তা-ক্রিয়া-কর্ম)', commonCore: ['L.2.1'], nctbCode: 'c2-bangla-6', classNumber: 2, game: 'game-sentencebuilder' },
  { id: 'bn-word-pairs', band: 2, subject: 'bangla', title: 'Word pairs', titleBn: 'বিপরীত ও সমার্থক', description: 'Match opposite (বিপরীত) and same-meaning (সমার্থক) Bangla words', descriptionBn: 'বিপরীত ও সমার্থক শব্দের জুটি মেলাই', commonCore: ['L.2.5'], nctbCode: 'c2-bangla-7', classNumber: 2, game: 'game-wordpairs' },
  // Language — compound building: two small words join to make one new word (যোগে যোগে শব্দ).
  { id: 'bn-compounds', band: 2, subject: 'bangla', title: 'Bangla compound words', titleBn: 'যোগে যোগে শব্দ', description: 'Tap the two small words that join to make a new Bangla word (গোলাপ + ফুল = গোলাপফুল)', descriptionBn: 'দুটি ছোট শব্দ মিলিয়ে নতুন শব্দ বানাই (গোলাপ + ফুল = গোলাপফুল)', commonCore: ['RF.2.3d'], nctbCode: 'c2-bangla-8', classNumber: 2, game: 'game-compounds' },
  // Language — matra matrix: mixed matras inside real words (মাত্রা মিশ্রণ).
  { id: 'bn-matra-matrix', band: 2, subject: 'bangla', title: 'Matra matrix', titleBn: 'মাত্রা মিশ্রণ', description: 'Complete real words by picking the right matra (ক + ◻ + টা = কাটা)', descriptionBn: 'সঠিক মাত্রা দিয়ে শব্দ শেষ করি (ক + ◻ + টা = কাটা)', commonCore: ['RF.2.3c'], nctbCode: 'c2-bangla-9', classNumber: 2, game: 'game-matramatrix' },
  // Language — number words 1-100: map the Bangla word to its digit and back.
  { id: 'bn-number-words', band: 2, subject: 'bangla', title: 'Number words', titleBn: 'সংখ্যা শব্দ', description: 'Match Bangla number words to digits 1-100 (একুশ → 21)', descriptionBn: 'সংখ্যার শব্দ আর অঙ্ক মেলাই ১-১০০ (একুশ → ২১)', commonCore: ['RF.2.3e'], nctbCode: 'c2-bangla-10', classNumber: 2, game: 'game-numberwords' },
  // Language — riddles: spoken clue + picture answer, hint ladder (ধাঁধা).
  { id: 'bn-riddle', band: 2, subject: 'bangla', title: 'Riddle time', titleBn: 'ধাঁধা', description: 'Solve short spoken riddles by tapping the picture answer (কলা, কুকুর, রংধনু…)', descriptionBn: 'ছোট ধাঁধা শুনে ছবির উত্তর টিপি (কলা, কুকুর, রংধনু…)', commonCore: ['SL.2.3'], nctbCode: 'c2-bangla-11', classNumber: 2, game: 'game-riddle' },
  { id: 'bn-ordinals', band: 2, subject: 'bangla', title: 'Ordinal words', titleBn: 'ক্রমবাচক শব্দ', description: 'Tap the runner in the position named by the Bangla ordinal word (প্রথম, দ্বিতীয়, তৃতীয়…)', descriptionBn: 'ক্রমবাচক শব্দ (প্রথম, দ্বিতীয়, তৃতীয়…) বলে দৌড়বিদকে টিপি', commonCore: ['L.2.1e'], nctbCode: 'c2-bangla-12', classNumber: 2, game: 'game-ordinals' },
  { id: 'en-phonics', band: 2, subject: 'english', title: 'First letter sounds', titleBn: 'বর্ণের উচ্চারণ', description: 'First letter sounds (A, B, C)', descriptionBn: 'প্রথম অক্ষরের উচ্চারণ (A, B, C)', commonCore: ['RF.K.3a'], nctbCode: 'c1-english-2', classNumber: 1, game: 'game-enphonics' },
  // Phonics — bossy-R vowels: hear the word, pick its spelling among ar/er/ir/or/ur word families.
  { id: 'en-rcontrolled', band: 2, subject: 'english', title: 'Bossy R', titleBn: 'bossy-R', description: 'Hear car/turn/bird, pick the right bossy-R spelling (ar er ir or ur)', descriptionBn: 'car/turn/bird শুনে সঠিক bossy-R বানান টিপি (ar er ir or ur)', commonCore: ['RF.1.3b'], nctbCode: 'c2-english-4', classNumber: 2, game: 'game-rcontrolled' },
  // Phonics — silent-e magic: add the magic e to flip a short vowel long (cap → cape).
  { id: 'en-magic-e', band: 2, subject: 'english', title: 'Magic E', titleBn: 'জাদুর e', description: 'Add the magic e to flip short vowels long (cap → cape, kit → kite)', descriptionBn: 'জাদুর e যোগ করে ছোট স্বর লম্বা করি (cap → cape, kit → kite)', commonCore: ['RF.1.3c'], nctbCode: 'c2-english-5', classNumber: 2, game: 'game-magice' },
  // Science — heavier / lighter (direct comparison)
  { id: 'heavy-light', band: 2, subject: 'science', title: 'Heavy or light', titleBn: 'ভারী না হালকা', description: 'Which side of the seesaw is heavier?', descriptionBn: 'দোলনার কোন দিক ভারী?', commonCore: ['K.MD.2'], nctbCode: 'c1-science-1', classNumber: 1, game: 'game-balance' },
  // Science — sink vs float: predict, then watch the object's TRUE behavior.
  // NCTB class-2 science has a water unit (ডুব ও ভাসা).
  { id: 'science-sink-float', band: 2, subject: 'science', title: 'Sink or float', titleBn: 'ডুব না ভাসা', description: 'Predict whether objects sink or float, then check in water', descriptionBn: 'ডুববে নাকি ভাসবে ভবিষ্যদ্বাণী করি, তারপর জলে দেখি', commonCore: [], nctbCode: 'c2-science-3', classNumber: 2, game: 'game-sinkfloat' },
  // Science — food chains: who-eats-whom, ordered producer → eater → predator.
  { id: 'science-food-chain', band: 2, subject: 'science', title: 'Food chains', titleBn: 'খাদ্য শৃঙ্খল', description: 'Order simple food chains — who eats whom', descriptionBn: 'সহজ খাদ্য শৃঙ্খল সাজাই — কে কাকে খায়', commonCore: [], nctbCode: 'c2-science-4', classNumber: 2, game: 'game-foodchain' },
  // Science — food sources: sort 28 foods into from-plants / from-animals.
  { id: 'science-food-source', band: 2, subject: 'science', title: 'Food from plants & animals', titleBn: 'খাবারের উৎস', description: 'Sort foods by where they come from — plants or animals', descriptionBn: 'খাবার সাজাই কোথা থেকে আসে — গাছ নাকি প্রাণী', commonCore: [], nctbCode: 'c2-science-12', classNumber: 2, game: 'game-foodsource' },
  // Science — materials: sort 32 household objects into wood/metal/plastic/glass.
  { id: 'science-materials', band: 2, subject: 'science', title: 'Materials', titleBn: 'বস্তুর উপাদান', description: 'Sort everyday objects by material — wood, metal, plastic, glass', descriptionBn: 'দৈনন্দিন জিনিস সাজাই উপাদান অনুযায়ী — কাঠ, ধাতু, প্লাস্টিক, কাচ', commonCore: [], nctbCode: 'c2-science-13', classNumber: 2, game: 'game-material' },
  // Science — day & night: earth rotation makes day and night.
  { id: 'science-day-night', band: 2, subject: 'science', title: 'Day & night', titleBn: 'দিন ও রাত', description: 'Spin the Earth and see why day and night happen', descriptionBn: 'পৃথিবী ঘুরিয়ে দেখি কীভাবে দিন-রাত হয়', commonCore: [], nctbCode: 'c2-science-5', classNumber: 2, game: 'game-daynight' },
  // BGS — village vs city life: sort everyday scenes into their world.
  { id: 'bgs-village-city', band: 2, subject: 'bgs', title: 'Village & city life', titleBn: 'গ্রাম ও শহরের জীবন', description: 'Sort scenes — village or city?', descriptionBn: 'দৃশ্য সাজাই — গ্রাম নাকি শহর?', commonCore: [], nctbCode: 'c2-bgs-1', classNumber: 2, game: 'game-villagecity' },

  // ── Band 3 — River Town (ages 6–8, class 2–3): EXTEND ARITHMETIC ──
  // Two-digit add/sub (extends band-2 facts) → mult (repeated add) → division
  // (concrete sharing FIRST, abstract facts AFTER) → fractions → time →
  // PLACE VALUE (prerequisite) → regrouping (the written method).
  { id: 'add-sub-100', band: 3, subject: 'math', title: 'Add & subtract to 100', titleBn: '১০০-এর মধ্যে যোগ-বিয়োগ', description: 'Two-digit addition and subtraction', descriptionBn: 'দুই-অঙ্কের যোগ ও বিয়োগ', commonCore: ['2.NBT.5', '3.NBT.2'], nctbCode: 'c2-math-4', classNumber: 2, game: 'game-addsub100' },
  { id: 'mult-facts-2-5-10', band: 3, subject: 'math', title: 'Times tables 2, 5, 10', titleBn: '২, ৫, ১০ এর নামতা', description: 'Multiplication facts for 2, 5, 10 (first fact tier of the times-table ladder)', descriptionBn: '২, ৫, ১০ এর গুণের সত্যি (নামতার প্রথম ধাপ)', commonCore: ['3.OA.7'], nctbCode: 'c3-math-2', classNumber: 3, game: 'game-rocketmult', family: 'mult-facts', tier: 2 },
  { id: 'mult-facts-2-10', band: 3, subject: 'math', title: 'Times tables 2–10', titleBn: '২–১০ এর নামতা', description: 'Multiplication facts 2×…10× taught with concrete arrays first', descriptionBn: '২×…১০× গুণন, আগে বস্তুর সারি দেখিয়ে শেখাই', commonCore: ['3.OA.7'], nctbCode: 'c3-math-19', classNumber: 3, game: 'game-multable', family: 'mult-facts', tier: 3, dataLevels: [2, 3, 4, 5, 7, 9, 10] },
  { id: 'div-facts-fair-share', band: 3, subject: 'math', title: 'Fair shares', titleBn: 'সমান ভাগ', description: 'Division taught by fair-sharing (12 ÷ 3 = share 12 into 3)', descriptionBn: 'সমান ভাগের মাধ্যমে ভাগ শিখি (১২ ÷ ৩ = ১২ কে ৩ ভাগ)', commonCore: ['3.OA.7'], nctbCode: 'c3-math-4', classNumber: 3, game: 'game-share', family: 'fair-share', tier: 1 },
  { id: 'div-facts-by-2-3', band: 3, subject: 'math', title: 'Divide by 2 and 3', titleBn: '২ ও ৩ দিয়ে ভাগ', description: 'Division facts with divisors 2 and 3 (first tier of Division facts)', descriptionBn: 'ভাজক ২ ও ৩ দিয়ে ভাগ (ভাগ করার প্রথম ধাপ)', commonCore: ['3.OA.7'], nctbCode: 'c3-math-21', classNumber: 3, game: 'game-div-23', family: 'division-facts', tier: 1 },
  { id: 'fractions-intro', band: 3, subject: 'math', title: 'Halves and quarters', titleBn: 'অর্ধেক ও চতুর্থাংশ', description: 'Recognize ½, ¼, ¾ of a whole, then read shaded fractions to 8 parts', descriptionBn: 'পুরোটার ½, ¼, ¾ চিনি, তারপর ৮ ভাগ পর্যন্ত ছায়া-ভগ্নাংশ পড়ি', commonCore: ['3.NF.1'], nctbCode: 'c3-math-3', classNumber: 3, game: 'game-pizzafrac', family: 'fractions-read', tier: 1 },
  { id: 'fractions-compare', band: 3, subject: 'math', title: 'Compare & order fractions', titleBn: 'ভগ্নাংশ তুলনা ও সাজানো', description: 'Tap the bigger pizza, then order three from smallest to biggest', descriptionBn: 'বড় পিজ্জাটা টিপো, তারপর ছোট থেকে বড় তিনটা সাজাও', commonCore: ['3.NF.A.3d'], nctbCode: 'c3-math-17', classNumber: 3, game: 'game-comparefrac' },
  { id: 'tell-time', band: 3, subject: 'math', title: 'Tell time', titleBn: 'ঘড়ি পড়া', description: 'Read an analog clock — hour, half, 5-minute steps, then to the exact minute', descriptionBn: 'ঘড়ি পড়ি — ঘণ্টা, আধাঘণ্টা, ৫ মিনিটের ধাপ, তারপর ঠিক মিনিট', commonCore: ['1.MD.3', '2.MD.7'], nctbCode: 'c2-math-3', classNumber: 2, game: 'game-clock', family: 'clock', tier: 1 },
  { id: 'place-value-1000', band: 3, subject: 'math', title: 'Place value to 9,999', titleBn: 'স্থানীয় মান', description: 'Thousands, hundreds, tens and ones up to 9,999 — read the number from its blocks', descriptionBn: '৯৯৯৯ পর্যন্ত হাজার, শতক, দশক, একক — ব্লক দেখে সংখ্যা পড়া', commonCore: ['2.NBT.1', '3.NBT.1', '4.NBT.2'], nctbCode: 'c3-math-1', classNumber: 3, game: 'game-placevalue' },
  // Rounding rides place value: read how many tens/hundreds, then jump the number
  // to the nearer fence-post. 3.NBT.1 (round to nearest 10 or 100).
  { id: 'round-nearest-10-100', band: 3, subject: 'math', title: 'Round to 10 & 100', titleBn: 'নিকটতম দশ/শতকে পূর্ণ', description: 'Round numbers to the nearest ten or hundred with a number-line jump', descriptionBn: 'সংখ্যারেখায় লাফিয়ে সংখ্যাকে নিকটতম দশ/শতকে পূর্ণ করি', commonCore: ['3.NBT.1'], nctbCode: 'c3-math-20', classNumber: 3, game: 'game-round' },
  // Data — read bar charts: tallest → a given count → a given category.
  // NCTB class-3 has a "data" strand; CC 2.MD.10 / 3.MD.3.
  { id: 'data-barchart', band: 3, subject: 'math', title: 'Bar chart reading', titleBn: 'বার চার্ট পড়ি', description: 'Answer how-many questions by tapping bars on a chart', descriptionBn: 'চার্টের বার দেখে কতগুলো, ট্যাপ করে উত্তর দিই', commonCore: ['2.MD.10', '3.MD.3'], nctbCode: 'c3-math-6', classNumber: 3, game: 'game-barchart' },
  // Data — pictographs: ONE picture = 2/5/10, count pictures × key.
  // NCTB class-3 "data" strand; CC 2.MD.10 / 3.MD.3 (same as bar charts).
  { id: 'data-picto', band: 3, subject: 'math', title: 'Picture charts', titleBn: 'ছবির চার্ট', description: 'Read pictographs where one picture = 2, 5 or 10 and answer how-many questions', descriptionBn: 'ছবির চার্ট পড়ি — ১টা ছবি = ২/৫/১০, ছবি দেখে কতগুলো বলি', commonCore: ['2.MD.10', '3.MD.3'], nctbCode: 'c3-math-7', classNumber: 3, game: 'game-picto' },
  { id: 'add-sub-regroup', band: 3, subject: 'math', title: 'Carry & Borrow', titleBn: 'ক্যারি ও ধার', description: '3-digit addition and subtraction with carrying and borrowing (written method)', descriptionBn: '৩-অঙ্কের যোগ-বিয়োগ ক্যারি ও ধারসহ (লিখিত পদ্ধতি)', commonCore: ['2.NBT.7', '3.NBT.2'], nctbCode: 'c3-math-5', classNumber: 3, game: 'game-regroup' },
  // Language — STAGE 3: first words (mirrored: BN words then EN CVC)
  { id: 'bn-words', band: 3, subject: 'bangla', title: 'Bangla words', titleBn: 'শব্দ পড়ি', description: 'Read simple Bangla words (মাছ, বাঘ, কলা)', descriptionBn: 'সহজ বাংলা শব্দ পড়ি (মাছ, বাঘ, কলা)', commonCore: ['RF.2.4'], nctbCode: 'c2-bangla-3', classNumber: 2, game: 'game-bnwords' },
  { id: 'bn-conjunct-find', band: 3, subject: 'bangla', title: 'Conjunct speed drill', titleBn: 'যুক্তবর্ণ দ্রুত অনুশীলন', description: 'Find common conjuncts in real words (ক্ষ, ঞ্জ, ঙ্ক)', descriptionBn: 'বাস্তব শব্দে যুক্তবর্ণ খুঁজি (ক্ষ, ঞ্জ, ঙ্ক)', commonCore: ['RF.3.3'], nctbCode: 'c3-bangla-3', classNumber: 3, game: 'game-conjunctfind' },
  // #759 — the band-3 decoding bridge between band-2 matra-matrix and band-4
  // bn-matras: join syllables WITH matras into whole words (কা + টা = কাটা).
  // Same combine mechanic as BnMatras, but the two parts are SYLLABLES of a
  // real word — the matra→words→decode ladder finally has its missing rung.
  { id: 'bn-matra-words', band: 3, subject: 'bangla', title: 'Matra words', titleBn: 'কার মিশ্রণ', description: 'Join syllables with matras into whole words (কা + টা = কাটা)', descriptionBn: 'কার দিয়ে অক্ষর জুড়ে শব্দ বানাই (কা + টা = কাটা)', commonCore: ['RF.3.3'], nctbCode: 'c3-bangla-1', classNumber: 3, game: 'game-bnmatra-words', dataMode: 'words' },
  // #1141 — shared memory-flip engine: recall matra sign ↔ example word.
  { id: 'mem-bangla-matra', band: 3, subject: 'bangla', title: 'Matra memory', titleBn: 'মাত্রার স্মৃতি', description: 'Flip hidden cards to match each matra sign with its example word (ি ↔ মিল)', descriptionBn: 'লুকানো কার্ড খুলে প্রতিটি মাত্রা চিহ্নের সাথে তার উদাহরণ শব্দ মনে করে মেলাই (ি ↔ মিল)', commonCore: ['RF.3.3'], nctbCode: 'c3-bangla-11', classNumber: 3, game: 'game-memory', challenge: true, dataLevels: [6, 8, 12, 16, 20, 20] },
  { id: 'bn-family-words', band: 3, subject: 'bangla', title: 'Family words', titleBn: 'পরিবারের শব্দ', description: 'Read Bangla family words (মা, বাবা, ভাই)', descriptionBn: 'পরিবারের বাংলা শব্দ পড়ি (মা, বাবা, ভাই)', commonCore: ['RF.2.4'], nctbCode: 'c2-bangla-4', classNumber: 2, game: 'game-bnwords', dataMode: 'family' },
  { id: 'bn-story-read', band: 3, subject: 'bangla', title: 'Story comprehension', titleBn: 'ছোট গল্প পড়ি', description: 'Read a mini-story, then answer a who/what question with pictures', descriptionBn: 'ছোট গল্প পড়ে ছবি দিয়ে উত্তর দিই (কে/কী)', commonCore: ['RL.2.1', 'RL.2.10'], nctbCode: 'c3-bangla-4', classNumber: 3, game: 'game-storyread' },
  { id: 'bn-punctuation', band: 3, subject: 'bangla', title: 'Punctuation', titleBn: 'যতি চিহ্ন', description: 'Tap the right punctuation to end each sentence (। ? !)', descriptionBn: 'বাক্য শেষ করার সঠিক যতি চিহ্ন টিপি (। ? !)', commonCore: ['L.3.2c'], nctbCode: 'c3-bangla-5', classNumber: 3, game: 'game-punct' },
  // Language — graded read-a-story: tap-to-hear-word, comprehension quiz at the end.
  { id: 'bn-read-story', band: 3, subject: 'bangla', title: 'Read a story', titleBn: 'গল্প পড়ি', description: 'Read 3 graded stories, tap any word to hear it, answer the quiz', descriptionBn: '৩টি গল্প পড়ি, শব্দ টিপলে শুনি, শেষে প্রশ্নের উত্তর দিই', commonCore: ['RL.2.10', 'RL.3.10'], nctbCode: 'c3-bangla-6', classNumber: 3, game: 'game-readstory' },
  { id: 'bn-idioms', band: 3, subject: 'bangla', title: 'Simple idioms', titleBn: 'সহজ বাগধারা', description: 'Match simple Bangla idioms to kid-friendly meanings (তালগাছে কুমড়ো → অসম্ভব)', descriptionBn: 'সহজ বাংলা বাগধারার মানে মেলাই (তালগাছে কুমড়ো → অসম্ভব)', commonCore: ['L.3.5'], nctbCode: 'c3-bangla-7', classNumber: 3, game: 'game-idioms' },
  { id: 'bn-verbgender', band: 3, subject: 'bangla', title: 'Verb match', titleBn: 'ক্রিয়া মেলাই', description: 'Pick the verb form that agrees with a pictured subject (ছেলেটি খেলছে, রাজা যান, মা রান্না করেন)', descriptionBn: 'ছবির বিষয়ের সঙ্গে মানানসই ক্রিয়া বাছাই (ছেলেটি খেলছে, রাজা যান, মা রান্না করেন)', commonCore: ['L.3.1f'], nctbCode: 'c3-bangla-8', classNumber: 3, game: 'game-verbgender' },
  { id: 'bn-classifiers', band: 3, subject: 'bangla', title: 'Word fit', titleBn: 'শব্দ বসাও', description: 'Insert the right classifier or postposition into a sentence (বইটি, ঝুড়ির ভিতরে, মায়ের জন্য)', descriptionBn: 'বাক্যে সঠিক শ্রেণীবাচক শব্দ বা অনুসর্গ বসাই (বইটি, ঝুড়ির ভিতরে, মায়ের জন্য)', commonCore: ['L.3.1'], nctbCode: 'c3-bangla-9', classNumber: 3, game: 'game-classifiers' },
  { id: 'en-cvc', band: 3, subject: 'english', title: 'CVC words', titleBn: 'ইংরেজি শব্দ', description: 'Read cat, dog, sun, hat', descriptionBn: 'cat, dog, sun, hat পড়ি', commonCore: ['RF.2.3'], nctbCode: 'c2-english-3', classNumber: 2, game: 'game-cvc' },
  // Grammar — contractions: match I'm→I am, don't→do not, can't→cannot.
  { id: 'en-contractions', band: 3, subject: 'english', title: 'Contractions', titleBn: 'সংকোচন শব্দ', description: 'Match contractions to their two-word forms (I\x27m → I am, don\x27t → do not)', descriptionBn: 'সংকোচন শব্দের সঠিক জোড়া মেলাই (I\x27m → I am, don\x27t → do not)', commonCore: ['L.2.2c'], nctbCode: 'c3-english-4', classNumber: 3, game: 'game-contracts' },
  // Grammar — degrees of comparison: big → bigger → biggest with picture compare.
  { id: 'en-compare', band: 3, subject: 'english', title: 'Big, Bigger, Biggest', titleBn: 'বড়, বড়ো, সবচেয়ে বড়', description: 'Pick the right degree form for 2-picture (bigger) and 3-picture (biggest) compares', descriptionBn: '২ ছবিতে bigger, ৩ ছবিতে biggest — সঠিক তুলনার রূপ বাছো', commonCore: ['L.3.1g'], nctbCode: 'c3-english-5', classNumber: 3, game: 'game-compare' },
  { id: 'en-synant', band: 3, subject: 'english', title: 'Same or opposite?', titleBn: 'একই নাকি বিপরীত?', description: 'Match synonyms (happy → glad) and antonyms (big → small) with a picture hint', descriptionBn: 'সমার্থক (happy → glad) ও বিপরীতার্থক (big → small) শব্দ মেলাই — ছবির ইঙ্গিতসহ', commonCore: ['L.3.5c'], nctbCode: 'c3-english-6', classNumber: 3, game: 'game-synant' },
  { id: 'en-irregulars', band: 3, subject: 'english', title: 'Make it plural!', titleBn: 'বহুবচন বানাও!', description: 'One foot 🦶 → two ___? Pick the irregular plural (feet, teeth, mice, children…)', descriptionBn: 'একটা foot 🦶 → দুটো ___? অনিয়মিত বহুবচন বাছো (feet, teeth, mice, children…)', commonCore: ['L.3.1b'], nctbCode: 'c3-english-7', classNumber: 3, game: 'game-irregulars' },
  { id: 'en-pasttense', band: 3, subject: 'english', title: 'Past time!', titleBn: 'অতীত কাল!', description: 'Today I go 🚶 → Yesterday I ___ to school. Pick the irregular past (went, saw, ate…)', descriptionBn: 'আজ আমি go 🚶 → গতকাল আমি ___ স্কুলে। অনিয়মিত অতীত বাছো (went, saw, ate…)', commonCore: ['L.3.1d'], nctbCode: 'c3-english-8', classNumber: 3, game: 'game-past' },
  // #1141 — shared memory-flip engine: recall the two parts that fuse into one compound.
  { id: 'mem-compound-words', band: 3, subject: 'english', title: 'Compound memory', titleBn: 'যৌগিক শব্দের স্মৃতি', description: 'Flip hidden cards to recall the two parts that build a compound word (sun + flower → sunflower)', descriptionBn: 'লুকানো কার্ড খুলে যৌগিক শব্দের দুটো অংশ মনে করে মেলাই (sun + flower → sunflower)', commonCore: ['L.1.4c'], nctbCode: 'c3-english-10', classNumber: 3, game: 'game-memory', challenge: true, dataLevels: [6, 8, 12, 16, 20, 20] },
  // Grammar — prepositions: drag the object to the spoken place (in/on/under/behind…).
  { id: 'en-prepositions', band: 2, subject: 'english', title: 'Prepositions', titleBn: 'অব্যয়', description: 'Drag an object to the spoken place: in, on, under, behind, in front of, next to, above, between', descriptionBn: 'বলে দেওয়া জায়গায় জিনিসটা টেনে রাখি: in, on, under, behind, in front of, next to, above, between', commonCore: ['L.1.1i'], nctbCode: 'c2-english-6', classNumber: 2, game: 'game-prepositions' },
  // Grammar — question words: fill the ___ in a picture-context question (who/what/where…).
  { id: 'en-qwords', band: 2, subject: 'english', title: 'Question words', titleBn: 'প্রশ্নবোধক শব্দ', description: 'Fill the blank with the right question word (who, what, where, when, why, how, whose)', descriptionBn: 'সঠিক প্রশ্নবোধক শব্দ দিয়ে শূন্যস্থান পূরণ করি (who, what, where, when, why, how, whose)', commonCore: ['L.1.1j'], nctbCode: 'c2-english-7', classNumber: 2, game: 'game-qwords' },
  // Reading — story sequencing: drag 3-4 picture cards into first→then→last order.
  { id: 'en-story', band: 2, subject: 'english', title: 'Story sequencing', titleBn: 'গল্প সাজানো', description: 'Drag the picture cards into story order (first, then, last)', descriptionBn: 'ছবির কার্ডগুলো গল্পের ক্রমে সাজাও (প্রথম, তারপর, শেষে)', commonCore: ['RL.1.2'], nctbCode: 'c2-english-8', classNumber: 2, game: 'game-story' },
  // Vocabulary — compounds: tap the two halves that build the word (rain+bow=rainbow).
  { id: 'en-compounds', band: 2, subject: 'english', title: 'Compound words', titleBn: 'যৌগিক শব্দ', description: 'Tap the two halves that build the compound word (rain + bow = rainbow)', descriptionBn: 'যৌগিক শব্দ বানাতে দুটো অংশ চাপো (rain + bow = rainbow)', commonCore: ['L.1.4c'], nctbCode: 'c2-english-9', classNumber: 2, game: 'game-compounds-en' },
  // Reading — read-aloud comprehension lvl 2: 5-7 word sentence → picture answer.
  { id: 'en-readaloud', band: 2, subject: 'english', title: 'Read & answer', titleBn: 'পড়ে উত্তর দাও', description: 'Read a short sentence aloud, then tap the picture that answers the question', descriptionBn: 'ছোট বাক্যটা পড়ো, তারপর প্রশ্নের সঠিক ছবিটা চাপো', commonCore: ['RF.1.4a'], nctbCode: 'c2-english-10', classNumber: 2, game: 'game-readaloud' },
  // Reading — alphabetical order: drag 4-6 words into ABC order (instant check).
  { id: 'en-alphabet', band: 2, subject: 'english', title: 'Alphabet order', titleBn: 'বর্ণানুক্রম', description: 'Drag the words into alphabetical (ABC) order — each card glows green when it is home', descriptionBn: 'শব্দগুলো ABC ক্রমে সাজাও — সঠিক জায়গায় গেলে কার্ড সবুজ হয়ে যায়', commonCore: ['RF.1.1d'], nctbCode: 'c2-english-11', classNumber: 2, game: 'game-alphabet' },
  { id: 'en-digraphs', band: 2, subject: 'english', title: 'Digraph review', titleBn: 'ডাইগ্রাফ পর্যালোচনা', description: 'Hear ship/chair/three/whale/phone and tap the digraph that makes the word (sh ch th wh ph)', descriptionBn: 'ship/chair/three/whale/phone শুনে শব্দটি তৈরি করা ডাইগ্রাফ টিপি (sh ch th wh ph)', commonCore: ['RF.1.3a'], nctbCode: 'c2-english-12', classNumber: 2, game: 'game-digraphs' },
  { id: 'en-longvowels', band: 2, subject: 'english', title: 'Vowel teams', titleBn: 'স্বর দল', description: 'Hear rain/play/tree/sea/boat/snow/pie/night and tap the long-vowel team that makes the word (ai ay ee ea oa ow ie igh)', descriptionBn: 'rain/play/tree/sea/boat/snow/pie/night শুনে শব্দটি তৈরি করা স্বর দল টিপি (ai ay ee ea oa ow ie igh)', commonCore: ['RF.1.3c'], nctbCode: 'c2-english-13', classNumber: 2, game: 'game-longvowels' },

  // ── Band 4 — Sky Castle (ages 8–10, class 3–4): ADVANCED OPERATIONS ──
  { id: 'division-facts', band: 4, subject: 'math', title: 'Division facts', titleBn: 'ভাগ করা', description: 'Division facts within 100 (24÷3, 45÷5)', descriptionBn: '১০০-এর মধ্যে ভাগের সত্যি (২৪÷৩, ৪৫÷৫)', commonCore: ['3.OA.7'], nctbCode: 'c4-math-1', classNumber: 4, game: 'game-division', family: 'division-facts', tier: 2 },
  { id: 'fractions-equiv', band: 4, subject: 'math', title: 'Equivalent fractions', titleBn: 'সমান ভগ্নাংশ', description: 'Recognize ½ = 2⁄4 = 3⁄6', descriptionBn: 'বুঝি ½ = ২⁄৪ = ৩⁄৬', commonCore: ['3.NF.3'], nctbCode: 'c4-math-2', classNumber: 4, game: 'game-fracmatch' },
  // Language — STAGE 4: decoding (mirrored: BN matras ↔ EN sight words)
  { id: 'bn-matras', band: 4, subject: 'bangla', title: 'Bangla matras', titleBn: 'কার', description: 'Combine letters with matras (ক + া = কা)', descriptionBn: 'অক্ষরের সাথে কার যোগ করি (ক + া = কা)', commonCore: ['RF.3.4'], nctbCode: 'c3-bangla-2', classNumber: 3, game: 'game-bnmatras' },
  { id: 'en-sightwords', band: 4, subject: 'english', title: 'Sight words', titleBn: 'দেখা-শব্দ', description: 'Read the, and, you, that, with', descriptionBn: 'the, and, you, that, with পড়ি', commonCore: ['RF.3.4'], nctbCode: 'c3-english-3', classNumber: 3, game: 'game-sightwords' },
  // #1141 — shared memory-flip engine: recall word ↔ synonym.
  { id: 'mem-synonyms', band: 4, subject: 'english', title: 'Synonym memory', titleBn: 'সমার্থক শব্দের স্মৃতি', description: 'Flip hidden cards to recall each word and its synonym (happy ↔ glad)', descriptionBn: 'লুকানো কার্ড খুলে প্রতিটি শব্দের সাথে তার সমার্থক শব্দ মনে করে মেলাই (happy ↔ glad)', commonCore: ['L.4.5c'], nctbCode: 'c4-english-1', classNumber: 4, game: 'game-memory', challenge: true, dataLevels: [6, 8, 12, 16, 20, 20] },
  // Science — animals
  { id: 'science-animals', band: 4, subject: 'science', title: 'Animal homes', titleBn: 'প্রাণী ও আবাস', description: 'Where animals live (water, land, sky)', descriptionBn: 'প্রাণীরা কোথায় থাকে (পানি, ডাঙা, আকাশ)', commonCore: ['2.LS.4'], nctbCode: 'c3-science-1', classNumber: 3, game: 'game-animalhome' },
  // #756 — Band 4 BGS (class-3/4): Sky Castle had ZERO bgs. Both skills reuse
  // the BgsFacts fact scene with the `civic` fact pool (our country + civic
  // responsibilities) — the NCTB class-3/4 strand is no longer empty.
  { id: 'bgs-our-country', band: 4, subject: 'bgs', title: 'Our country', titleBn: 'আমাদের দেশ', description: 'Districts, rivers and national symbols of Bangladesh', descriptionBn: 'বাংলাদেশের বিভাগ, নদনদী ও জাতীয় প্রতীক', commonCore: [], nctbCode: 'c4-bgs-1', classNumber: 4, game: 'game-bgs-country', dataMode: 'civic' },
  { id: 'bgs-good-citizens', band: 4, subject: 'bgs', title: 'Good citizens', titleBn: 'ভালো নাগরিক', description: 'Civic responsibilities — helping, respecting, road safety', descriptionBn: 'নাগরিক দায়িত্ব — সাহায্য, সম্মান, রাস্তার নিরাপত্তা', commonCore: [], nctbCode: 'c4-bgs-2', classNumber: 4, game: 'game-bgs-civics', dataMode: 'civic' },

  // ── Band 5 — Star Academy (ages 10–13, class 5–8) ──
  { id: 'decimals-intro', band: 5, subject: 'math', title: 'Decimals', titleBn: 'দশমিক', description: 'Compare and order decimals (0.5 vs 0.45)', descriptionBn: 'দশমিক তুলনা ও সাজাই (০.৫ বনাম ০.৪৫)', commonCore: ['5.NBT.3'], nctbCode: 'c5-math-3', classNumber: 5, game: 'game-decimals', family: 'decimals', tier: 2 },
  { id: 'percent-intro', band: 5, subject: 'math', title: 'Find percent', titleBn: 'শতকরা বের করি', description: 'Find 10%, 25%, 50%, then 75% of a number', descriptionBn: 'সংখ্যার ১০%, ২৫%, ৫০%, তারপর ৭৫% বের করি', commonCore: ['6.RP.3'], nctbCode: 'c6-math-2', classNumber: 6, game: 'game-percent', family: 'percent', tier: 1 },
  { id: 'area-perimeter', band: 5, subject: 'math', title: 'Area & perimeter', titleBn: 'ক্ষেত্রফল ও পরিসীমা', description: 'Area of rectangles and squares', descriptionBn: 'আয়তক্ষেত্র ও বর্গের ক্ষেত্রফল', commonCore: ['4.MD.3'], nctbCode: 'c5-math-5', classNumber: 5, game: 'game-area' },
  // Language — STAGE 5: sentences & grammar (mirrored)
  { id: 'bn-sentences', band: 5, subject: 'bangla', title: 'Bangla sentences', titleBn: 'বাক্য গঠন', description: 'Build simple Bangla sentences', descriptionBn: 'সহজ বাংলা বাক্য গঠন করি', commonCore: ['RF.5.4'], nctbCode: 'c5-bangla-4', classNumber: 5, game: 'game-bnsentence' },
  { id: 'en-grammar', band: 5, subject: 'english', title: 'Nouns & verbs', titleBn: 'বিশেষ্য ও ক্রিয়া', description: 'Sort words into nouns and verbs', descriptionBn: 'শব্দকে বিশেষ্য ও ক্রিয়ায় ভাগ করি', commonCore: ['L.5.1'], nctbCode: 'c5-english-3', classNumber: 5, game: 'game-grammar' },
  // BGS — Bangladesh & the world
  { id: 'bgs-bangladesh', band: 5, subject: 'bgs', title: 'Bangladesh facts', titleBn: 'বাংলাদেশ পরিচিতি', description: 'Capital, national symbols, rivers', descriptionBn: 'রাজধানী, জাতীয় প্রতীক, নদনদী', commonCore: [], nctbCode: 'c5-bgs-1', classNumber: 5, game: 'game-bgs' },
  // #761 — Band 5 breadth: ICT returns (online habits, building on band-3
  // computer safety), science returns (states of matter), and the English
  // track gets its first paragraph-comprehension rung. Star Academy grows
  // from 6 to 9 skills — no more subject collapse after the dense early bands.
  { id: 'ict-online-safety', band: 5, subject: 'ict', title: 'Online safety', titleBn: 'অনলাইন নিরাপত্তা', description: 'Safe online habits — keep passwords and personal info private', descriptionBn: 'অনলাইনে নিরাপদ অভ্যাস — পাসওয়ার্ড ও ব্যক্তিগত তথ্য গোপন রাখি', commonCore: [], nctbCode: 'c5-ict-1', classNumber: 5, game: 'game-onlinesafety' },
  { id: 'science-states-matter', band: 5, subject: 'science', title: 'States of matter', titleBn: 'পদার্থের অবস্থা', description: 'Sort objects into solid, liquid, gas — or not matter at all', descriptionBn: 'বস্তু সাজাই — কঠিন, তরল, গ্যাস, আর পদার্থ নয়', commonCore: [], nctbCode: 'c5-science-1', classNumber: 5, game: 'game-statematter' },
  { id: 'en-comprehension', band: 5, subject: 'english', title: 'Read & understand', titleBn: 'পড়ে বুঝি', description: 'Read a short paragraph and answer a question about it', descriptionBn: 'ছোট অনুচ্ছেদ পড়ে প্রশ্নের উত্তর দিই', commonCore: ['RF.5.4'], nctbCode: 'c5-english-4', classNumber: 5, game: 'game-encomprehension', dataMode: 'paragraph' },

  // ── Band 6 — Jungle Canopy (ages 11–14, class 5–6): FLUENCY ──
  // Deeper practice of the band 3–5 operations at higher difficulty; each
  // skill reuses a proven scene (TimesTable, DivisionFacts, PizzaFrac, Clock).
  { id: 'mult-fluency-6-9', band: 6, subject: 'math', title: 'Times tables 6–9', titleBn: '৬–৯ এর নামতা', description: 'Multiplication tables 6, 7, 8, 9 — the fluency top tier of the times-table ladder', descriptionBn: '৬, ৭, ৮, ৯ এর নামতা — নামতার সিড়ির শেষ ধাপ', commonCore: ['3.OA.7'], nctbCode: 'c6-math-1', classNumber: 6, game: 'game-multable', family: 'mult-facts', tier: 4, dataLevels: [6, 7, 8, 9], challenge: true },
  { id: 'divide-within-100', band: 6, subject: 'math', title: 'Divide within 100', titleBn: '১০০-এর মধ্যে ভাগ', description: 'Division facts within 100 (72÷8) — the fluency top tier of Division facts', descriptionBn: '১০০-এর মধ্যে ভাগ (৭২÷৮) — ভাগ করার শেষ ধাপ', commonCore: ['3.OA.7'], nctbCode: 'c6-math-4', classNumber: 6, game: 'game-division', family: 'division-facts', tier: 3, dataLevels: [6, 8, 10, 12], challenge: true },
  { id: 'fraction-read', band: 6, subject: 'math', title: 'Read fractions', titleBn: 'ভগ্নাংশ পড়ি', description: 'Read shaded fractions to 8 parts (top tier of Read fractions)', descriptionBn: '৮ ভাগ পর্যন্ত ছায়া-ভগ্নাংশ পড়ি (ভগ্নাংশ পড়ার শেষ ধাপ)', commonCore: ['3.NF.1'], nctbCode: 'c6-math-3', classNumber: 6, game: 'game-pizzafrac', family: 'fractions-read', tier: 2, dataLevels: [4, 5, 6, 8], challenge: true },
  { id: 'clock-minute', band: 6, subject: 'math', title: 'Tell time to the minute', titleBn: 'মিনিট ধরে ঘড়ি পড়ি', description: 'Read any time to the exact minute (top tier of Tell time)', descriptionBn: 'মিনিট ধরে সঠিক সময় পড়ি (ঘড়ি পড়ার শেষ ধাপ)', commonCore: ['2.MD.7'], nctbCode: 'c6-math-6', classNumber: 6, game: 'game-clock', family: 'clock', tier: 2, dataLevels: [5, 6], challenge: true },
  // Language — Bangla conjuncts (যুক্তবর্ণ): the tricky two-letter blends kids
  // meet in class 6 Bangla reading (ক্ষ ঞ্জ ঙ্ক ণ্ড). Reuses BnMatras' combine
  // mechanic with a conjuncts mode.
  { id: 'bn-conjuncts', band: 6, subject: 'bangla', title: 'Bangla conjuncts', titleBn: 'যুক্তবর্ণ', description: 'Combine letters into conjuncts ক্ষ ঞ্জ ঙ্ক ণ্ড', descriptionBn: 'অক্ষর জুড়ে যুক্তবর্ণ তৈরি করি (ক্ষ ঞ্জ ঙ্ক ণ্ড)', commonCore: ['RF.5.3'], nctbCode: 'c6-bangla-2', classNumber: 6, game: 'game-bnmatras', dataMode: 'conjuncts', challenge: true },
  // #757/#760 — bands 6-7 were math-only (plus one bangla/bgs); English and
  // science now continue past band 5/4 so the app's oldest cohort keeps a
  // full reading + science progression. English: paragraph comprehension
  // (band 6, ReadAloud paragraph mode) — the fluency step above band-5
  // en-comprehension. Science: human body organ jobs (HumanBody scene).
  { id: 'en-paragraph', band: 6, subject: 'english', title: 'Paragraph power', titleBn: 'অনুচ্ছেদ পড়ি', description: 'Comprehend longer paragraphs — read, understand, answer', descriptionBn: 'লম্বা অনুচ্ছেদ পড়ি, বুঝি, উত্তর দিই', commonCore: ['RF.6.4'], nctbCode: 'c6-english-1', classNumber: 6, game: 'game-enparagraph', dataMode: 'paragraph', challenge: true },
  { id: 'science-human-body', band: 6, subject: 'science', title: 'Human body', titleBn: 'মানবদেহ', description: 'Match the major organs — heart, brain, lungs, stomach', descriptionBn: 'প্রধান অঙ্গ চিনি — হৃৎপিণ্ড, মস্তিষ্ক, ফুসফুস, পাকস্থলী', commonCore: [], nctbCode: 'c6-science-1', classNumber: 6, game: 'game-humanbody' },
  // #1160 — band 6 math breadth: algebra readiness, negative-number sense,
  // ratio, geometry depth and probability. New skills reuse the shared-scene
  // ladder (game-mathsolve / game-negatives are new answer-button scenes;
  // game-perim reuses the proven fence scene) and flag challenge:true.
  { id: 'alg-missing-number', band: 6, subject: 'math', title: 'Missing numbers', titleBn: 'অজানা সংখ্যা খুঁজি', description: 'Solve number sentences with a missing number — ? + 7 = 15, ? − 9 = 6, 18 − ? = 11', descriptionBn: 'অজানা সংখ্যার বাক্য সমাধান করি — ? + ৭ = ১৫, ? − ৯ = ৬, ১৮ − ? = ১১', commonCore: ['1.OA.8', '6.EE.2'], nctbCode: 'c6-math-5', classNumber: 6, game: 'game-mathsolve', family: 'algebra', tier: 1, dataLevels: [1, 2, 3], challenge: true },
  { id: 'neg-compare-order', band: 6, subject: 'math', title: 'Compare negative numbers', titleBn: 'ঋণাত্মক সংখ্যা তুলনা', description: 'Which negative is greater? Order −5, −2, 0 on the number line', descriptionBn: 'কোন ঋণাত্মক সংখ্যা বড়? সংখ্যারেখায় −৫, −২, ০ সাজাই', commonCore: ['6.NS.7'], nctbCode: 'c6-math-7', classNumber: 6, game: 'game-negatives', family: 'negatives', tier: 1, dataLevels: [1, 2, 3], challenge: true },
  { id: 'ratio-simplify', band: 6, subject: 'math', title: 'Simplify ratios', titleBn: 'অনুপাত ছোট করি', description: 'Reduce ratios to simplest form — 4:8 → 1:2, 6:9 → 2:3', descriptionBn: 'অনুপাতকে সবচেয়ে ছোট আকারে আনি — ৪:৮ → ১:২, ৬:৯ → ২:৩', commonCore: ['6.RP.3'], nctbCode: 'c6-math-8', classNumber: 6, game: 'game-mathsolve', family: 'ratio', tier: 1, dataLevels: [2, 3, 4], challenge: true },
  { id: 'geo-perimeter', band: 6, subject: 'math', title: 'Perimeter: rectangles & triangles', titleBn: 'পরিসীমা: আয়তক্ষেত্র ও ত্রিভুজ', description: 'Add the side lengths around rectangles and right triangles (top tier of Perimeter intro)', descriptionBn: 'আয়তক্ষেত্র ও সমকোণী ত্রিভুজের বাহু যোগ করে পরিসীমা বের করি (পরিসীমা শুরুর শেষ ধাপ)', commonCore: ['3.MD.8', '4.MD.3'], nctbCode: 'c6-math-9', classNumber: 6, game: 'game-perim', dataLevels: [4, 5, 6, 8, 8, 10], challenge: true },
  { id: 'prob-words', band: 6, subject: 'math', title: 'Probability words', titleBn: 'সম্ভাবনার শব্দ', description: 'Label events certain, likely, unlikely or impossible', descriptionBn: 'ঘটনাকে নিশ্চিত, সম্ভবত, অসম্ভাব্য বা অসম্ভব বলি', commonCore: ['7.SP.5'], nctbCode: 'c6-math-10', classNumber: 6, game: 'game-mathsolve', family: 'probability', tier: 1, dataLevels: [1, 2, 3, 4], challenge: true },
  // #1142 — fast-round fact fluency rides the new ArcadeCatch scene. The same
  // fact families as the static fact drills, but now the answer FALLS under
  // real Arcade physics and a 12s gold bar — the first true reaction mode.
  { id: 'facts-fast-add', band: 6, subject: 'math', title: 'Fast add facts', titleBn: 'দ্রুত যোগ', description: 'Catch the falling sum before it lands — rapid-fire addition facts', descriptionBn: 'মাটিতে নামার আগেই সঠিক যোগফল ধরো — দ্রুতগতির যোগের অনুশীলন', commonCore: ['1.OA.C.6', '2.OA.B.2'], nctbCode: 'c6-math-11', classNumber: 6, game: 'game-arcadecatch', dataLevels: [1, 2, 3, 4, 5, 6], challenge: true },
  { id: 'facts-fast-sub', band: 6, subject: 'math', title: 'Fast subtract facts', titleBn: 'দ্রুত বিয়োগ', description: 'Catch the falling difference before it lands — rapid-fire subtraction facts', descriptionBn: 'মাটিতে নামার আগেই সঠিক বিয়োগফল ধরো — দ্রুতগতির বিয়োগের অনুশীলন', commonCore: ['1.OA.C.6', '2.OA.B.2'], nctbCode: 'c6-math-12', classNumber: 6, game: 'game-arcadecatch', dataLevels: [1, 2, 3, 4, 5, 6], challenge: true },
  { id: 'facts-fast-mult', band: 6, subject: 'math', title: 'Fast times tables', titleBn: 'দ্রুত নামতা', description: 'Catch the falling product before it lands — rapid-fire times-table facts', descriptionBn: 'মাটিতে নামার আগেই সঠিক গুণফল ধরো — দ্রুতগতির নামতার অনুশীলন', commonCore: ['3.OA.7'], nctbCode: 'c6-math-13', classNumber: 6, game: 'game-arcadecatch', dataLevels: [1, 2, 3, 4, 5, 6], challenge: true },
  { id: 'facts-fast-div', band: 6, subject: 'math', title: 'Fast division facts', titleBn: 'দ্রুত ভাগ', description: 'Catch the falling quotient before it lands — rapid-fire division facts', descriptionBn: 'মাটিতে নামার আগেই সঠিক ভাগফল ধরো — দ্রুতগতির ভাগের অনুশীলন', commonCore: ['3.OA.7'], nctbCode: 'c6-math-14', classNumber: 6, game: 'game-arcadecatch', dataLevels: [1, 2, 3, 4, 5, 6], challenge: true },
  // #1161 — bands 6-7 science/english/ict breadth: the oldest cohort keeps a
  // full multi-subject mix. Science adds forces/energy (new ScienceFacts scene),
  // ecosystem roles (FoodChain roles mode) and organ depth (HumanBody); English
  // adds inference + critical reading (ReadAloud), grammar depth (PastTense/
  // IrregularPlurals) and paragraph ordering (Story); ICT adds digital literacy
  // (OnlineSafety) and coding logic (new CodeLogic scene). All challenge:true.
  { id: 'science-forces-energy', band: 6, subject: 'science', title: 'Forces & energy', titleBn: 'বল ও শক্তি', description: 'Push, pull, gravity, and light/heat/sound — the forces and energy around us', descriptionBn: 'ঠেলা, টান, মাধ্যাকর্ষণ আর আলো/তাপ/শব্দ — আমাদের চারপাশের বল ও শক্তি', commonCore: [], nctbCode: 'c6-science-2', classNumber: 6, game: 'game-sciencefacts', family: 'forces-energy', tier: 1, challenge: true },
  { id: 'science-ecosystems', band: 6, subject: 'science', title: 'Ecosystems: food chains', titleBn: 'বাস্তুতন্ত্র: খাদ্য শৃঙ্খল', description: 'Producers, consumers and decomposers in food chains', descriptionBn: 'খাদ্য শৃঙ্খলে উৎপাদক, খাদক ও বিয়োজক চিনি', commonCore: [], nctbCode: 'c6-science-3', classNumber: 6, game: 'game-foodchain', family: 'ecosystems', tier: 1, challenge: true },
  { id: 'science-body-depth', band: 6, subject: 'science', title: 'Human body: organ jobs', titleBn: 'মানবদেহ: অঙ্গের কাজ', description: 'Match more organs — muscles, liver, kidneys, intestines — to what they do', descriptionBn: 'আরও অঙ্গ — পেশি, যকৃত, বৃক্ক, অন্ত্র — তাদের কাজের সাথে মেলাই', commonCore: [], nctbCode: 'c6-science-4', classNumber: 6, game: 'game-humanbody', family: 'human-body', tier: 2, challenge: true },
  { id: 'en-read-inference', band: 6, subject: 'english', title: 'Reading: infer & predict', titleBn: 'পড়া: অনুমান ও ভবিষ্যদ্বাণী', description: 'Read between the lines — infer why and predict what happens next', descriptionBn: 'লাইনের মাঝে পড়ি — কেন হলো আর পরে কী হবে অনুমান করি', commonCore: ['RL.6.1'], nctbCode: 'c6-english-2', classNumber: 6, game: 'game-enparagraph', dataMode: 'paragraph', family: 'reading-comp', tier: 1, challenge: true },
  { id: 'en-grammar-past-depth', band: 6, subject: 'english', title: 'Irregular past tense', titleBn: 'অনিয়মিত অতীত কাল', description: 'Deeper irregular past practice — went, saw, ate, took, made', descriptionBn: 'অনিয়মিত অতীতের গভীর অনুশীলন — went, saw, ate, took, made', commonCore: ['L.6.1'], nctbCode: 'c6-english-3', classNumber: 6, game: 'game-past', family: 'grammar-past', tier: 1, dataLevels: [6, 8, 8, 10, 12, 16], challenge: true },
  { id: 'en-paragraph-order', band: 6, subject: 'english', title: 'Order a paragraph', titleBn: 'অনুচ্ছেদ সাজাই', description: 'Put three sentences into a clear paragraph order', descriptionBn: 'তিনটি বাক্য সাজিয়ে পরিষ্কার অনুচ্ছেদ বানাই', commonCore: ['W.6.2c'], nctbCode: 'c6-english-4', classNumber: 6, game: 'game-sentenceorder', dataMode: 'sentences', family: 'writing-order', tier: 1, challenge: true },
  { id: 'ict-digital-literacy', band: 6, subject: 'ict', title: 'Digital literacy', titleBn: 'ডিজিটাল সাক্ষরতা', description: 'Privacy, phishing and screen balance — deeper online safety', descriptionBn: 'গোপনীয়তা, ফিশিং আর স্ক্রিনের ভারসাম্য — গভীর অনলাইন নিরাপত্তা', commonCore: [], nctbCode: 'c6-ict-1', classNumber: 6, game: 'game-onlinesafety', family: 'digital-literacy', tier: 1, dataLevels: [6, 8, 10, 12, 14, 14], challenge: true },
  { id: 'ict-code-blocks', band: 6, subject: 'ict', title: 'What does this block do?', titleBn: 'এই ব্লকটি কী করে?', description: 'Read simple coding blocks — loop, move, print, if — and say what they do', descriptionBn: 'সহজ কোডিং ব্লক — লুপ, চলো, ছাপো, যদি — দেখে বলি এরা কী করে', commonCore: [], nctbCode: 'c6-ict-2', classNumber: 6, game: 'game-codelogic', family: 'coding-logic', tier: 1, challenge: true },

  // ── Band 7 — Polar Peaks (ages 12–15, class 7): REFINEMENT ──
  { id: 'decimals-tenths', band: 7, subject: 'math', title: 'Decimal place value', titleBn: 'দশমিকের স্থানীয় মান', description: 'Place value in decimals (0.5, 0.25, 0.75) — the top tier of the Decimals family', descriptionBn: 'দশমিকের স্থানীয় মান (০.৫, ০.২৫, ০.৭৫) — দশমিক পরিবারের শেষ ধাপ', commonCore: ['5.NBT.3', '4.NF.6'], nctbCode: 'c7-math-3', classNumber: 7, game: 'game-decimals', family: 'decimals', tier: 3, dataLevels: [2, 3, 4, 5, 6], challenge: true },
  { id: 'percent-of-number', band: 7, subject: 'math', title: 'Percent of a number', titleBn: 'সংখ্যার শতকরা', description: 'Find 10%, 25%, 50% and 75% of a number (top tier of Percent)', descriptionBn: 'সংখ্যার ১০%, ২৫%, ৫০%, ৭৫% বের করি (শতকরা-র শেষ ধাপ)', commonCore: ['6.RP.3'], nctbCode: 'c7-math-2', classNumber: 7, game: 'game-percent', family: 'percent', tier: 2, dataLevels: [25, 50, 100, 150], challenge: true },
  { id: 'fraction-simplify', band: 7, subject: 'math', title: 'Simplify fractions', titleBn: 'ভগ্নাংশ ছোট করি', description: 'Reduce fractions to simplest form (4⁄8 → ½)', descriptionBn: 'ভগ্নাংশ ছোট করি (৪⁄৮ → ½)', commonCore: ['3.NF.3', '5.NF.1'], nctbCode: 'c7-math-1', classNumber: 7, game: 'game-fracmatch', dataLevels: [4, 6, 8, 12], challenge: true },
  // BGS — heritage facts (a new, deeper fact tier in the BGS scene)
  { id: 'bgs-heritage', band: 7, subject: 'bgs', title: 'Bangladesh heritage', titleBn: 'বাংলাদেশের ঐতিহ্য', description: 'Festivals, crafts, foods, landmarks', descriptionBn: 'উৎসব, শিল্প, খাবার, ঐতিহাসিক স্থান', commonCore: [], nctbCode: 'c7-bgs-1', classNumber: 7, game: 'game-bgs', challenge: true },
  // #757/#760 — English + science complete the upper bands: band-7 English
  // orders sentences into a clear paragraph (Story scene, sentence-order
  // mode); band-7 science matches organs to their body system (HumanBody
  // scene at system-difficulty levels).
  { id: 'en-sentence-order', band: 7, subject: 'english', title: 'Sentence order', titleBn: 'বাক্য সাজিয়ে অনুচ্ছেদ', description: 'Order sentences into a clear paragraph (topic → detail → end)', descriptionBn: 'বাক্য সাজিয়ে পরিষ্কার অনুচ্ছেদ বানাই (মূল কথা → বিবরণ → শেষ)', commonCore: ['W.6.2c'], nctbCode: 'c7-english-1', classNumber: 7, game: 'game-sentenceorder', dataMode: 'sentences', challenge: true },
  { id: 'science-body-systems', band: 7, subject: 'science', title: 'Body systems', titleBn: 'অঙ্গতন্ত্র', description: 'Match organs to their body system and what it does', descriptionBn: 'অঙ্গকে তার তন্ত্র আর কাজের সাথে মেলাই', commonCore: [], nctbCode: 'c7-science-1', classNumber: 7, game: 'game-body-systems', challenge: true },
  // #1160 — band 7 math breadth: one-step algebra, negative-number addition,
  // ratio/proportion and the data strand (mean/mode/median). New reasoning
  // skills ride game-mathsolve/game-negatives; symmetry reuses game-symmetry.
  { id: 'alg-one-step', band: 7, subject: 'math', title: 'One-step equations', titleBn: 'এক ধাপের সমীকরণ', description: 'Solve x + 3 = 11 and x − 4 = 9 by doing the opposite operation', descriptionBn: 'উল্টো অপারেশন করে x + ৩ = ১১ আর x − ৪ = ৯ সমাধান করি', commonCore: ['6.EE.7'], nctbCode: 'c7-math-4', classNumber: 7, game: 'game-mathsolve', family: 'algebra', tier: 2, dataLevels: [1, 2, 3], challenge: true },
  { id: 'neg-number-line-add', band: 7, subject: 'math', title: 'Add negatives on a number line', titleBn: 'সংখ্যারেখায় ঋণাত্মক যোগ', description: 'Add a small negative to a positive on the number line — 5 + (−3) = 2', descriptionBn: 'সংখ্যারেখায় ধনাত্মকের সাথে ছোট ঋণাত্মক যোগ করি — ৫ + (−৩) = ২', commonCore: ['7.NS.1'], nctbCode: 'c7-math-5', classNumber: 7, game: 'game-negatives', family: 'negatives', tier: 2, dataLevels: [1, 2, 3], challenge: true },
  { id: 'ratio-equivalent', band: 7, subject: 'math', title: 'Equivalent ratios', titleBn: 'সমান অনুপাত', description: 'Match equivalent ratios — 2:3 = 4:6 by scaling both sides', descriptionBn: 'সমান অনুপাত মেলাই — দুই পাশ একসাথে বাড়িয়ে ২:৩ = ৪:৬', commonCore: ['6.RP.3'], nctbCode: 'c7-math-6', classNumber: 7, game: 'game-mathsolve', family: 'ratio', tier: 2, dataLevels: [2, 3, 4], challenge: true },
  { id: 'ratio-unit-rate', band: 7, subject: 'math', title: 'Unit rates', titleBn: 'একক দর', description: 'Find the unit rate — 3 pens cost ৳12, so 1 pen costs ৳4', descriptionBn: 'একক দর বের করি — ৩ কলমের দাম ৳১২, তাই ১ কলমের দাম ৳৪', commonCore: ['6.RP.2'], nctbCode: 'c7-math-7', classNumber: 7, game: 'game-mathsolve', family: 'ratio', tier: 3, dataLevels: [2, 3, 4, 5], challenge: true },
  { id: 'geo-symmetry', band: 7, subject: 'math', title: 'Symmetry practice', titleBn: 'প্রতিসাম্যের অনুশীলন', description: 'Complete the mirror half of a picture across the fold line (top tier of Symmetry)', descriptionBn: 'ভাঁজ রেখা বরাবর ছবির আয়নার অর্ধেকটি পূরণ করি (প্রতিসাম্যের শেষ ধাপ)', commonCore: ['4.G.3'], nctbCode: 'c7-math-8', classNumber: 7, game: 'game-symmetry', dataLevels: [4, 4, 5, 5, 6, 6], challenge: true },
  { id: 'stats-mean-mode', band: 7, subject: 'math', title: 'Mean, mode & median', titleBn: 'গড়, প্রচুরক ও মধ্যমা', description: 'Find the mean, mode and median of small sets — 4, 7, 9 → mean 6', descriptionBn: 'ছোট সংখ্যার সেটের গড়, প্রচুরক ও মধ্যমা বের করি — ৪, ৭, ৯ → গড় ৬', commonCore: ['6.SP.5'], nctbCode: 'c7-math-9', classNumber: 7, game: 'game-mathsolve', family: 'statistics', tier: 1, dataLevels: [1, 2, 3], challenge: true },
  // #1161 — band 7 science/english/ict depth (the band-6 ladders' next rung).
  { id: 'science-energy-transfer', band: 7, subject: 'science', title: 'Energy types & transfer', titleBn: 'শক্তির ধরন ও প্রবাহ', description: 'Kinetic, potential, heat, light and sound — how energy moves and changes', descriptionBn: 'গতি, স্থিতি, তাপ, আলো ও শব্দ শক্তি — শক্তি কীভাবে চলে আর বদলায়', commonCore: [], nctbCode: 'c7-science-2', classNumber: 7, game: 'game-sciencefacts', family: 'forces-energy', tier: 2, challenge: true },
  { id: 'science-ecosystems-depth', band: 7, subject: 'science', title: 'Food webs & niches', titleBn: 'খাদ্য জাল ও নিচ', description: 'Food webs, predators, prey and decomposers — roles in an ecosystem', descriptionBn: 'খাদ্য জাল, শিকারী, শিকার ও বিয়োজক — বাস্তুতন্ত্রের ভূমিকা', commonCore: [], nctbCode: 'c7-science-3', classNumber: 7, game: 'game-foodchain', family: 'ecosystems', tier: 2, challenge: true },
  { id: 'science-body-systems-depth', band: 7, subject: 'science', title: 'Body systems: what they do', titleBn: 'অঙ্গতন্ত্র: এদের কাজ', description: 'What each body system does — circulatory, digestive, respiratory, nervous', descriptionBn: 'প্রতিটি অঙ্গতন্ত্রের কাজ — রক্তসংবহন, পরিপাক, শ্বসন, স্নায়ু', commonCore: [], nctbCode: 'c7-science-4', classNumber: 7, game: 'game-body-systems', family: 'human-body', tier: 3, challenge: true },
  { id: 'en-read-critical', band: 7, subject: 'english', title: 'Reading: main idea', titleBn: 'পড়া: মূল ভাব', description: 'Find the main idea and the author\x27s purpose in longer paragraphs', descriptionBn: 'লম্বা অনুচ্ছেদে মূল ভাব আর লেখকের উদ্দেশ্য খুঁজি', commonCore: ['RI.7.2'], nctbCode: 'c7-english-2', classNumber: 7, game: 'game-enparagraph', dataMode: 'paragraph', family: 'reading-comp', tier: 2, challenge: true },
  { id: 'en-grammar-irregulars-depth', band: 7, subject: 'english', title: 'Irregular plurals', titleBn: 'অনিয়মিত বহুবচন', description: 'Deeper irregular plural practice — feet, teeth, mice, children, oxen', descriptionBn: 'অনিয়মিত বহুবচনের গভীর অনুশীলন — feet, teeth, mice, children, oxen', commonCore: ['L.7.1'], nctbCode: 'c7-english-3', classNumber: 7, game: 'game-irregulars', family: 'grammar-plurals', tier: 1, dataLevels: [6, 8, 10, 12, 14, 14], challenge: true },
  { id: 'ict-digital-citizenship', band: 7, subject: 'ict', title: 'Digital citizenship', titleBn: 'ডিজিটাল নাগরিকত্ব', description: 'Respectful, private, balanced online choices — be a good digital citizen', descriptionBn: 'সম্মানজনক, গোপনীয় আর ভারসাম্যপূর্ণ অনলাইন আচরণ — ভালো ডিজিটাল নাগরিক হই', commonCore: [], nctbCode: 'c7-ict-1', classNumber: 7, game: 'game-onlinesafety', family: 'digital-literacy', tier: 2, dataLevels: [8, 10, 12, 14, 14, 14], challenge: true },
  { id: 'ict-code-steps', band: 7, subject: 'ict', title: 'Order the steps', titleBn: 'ধাপ সাজাই', description: 'Think like a coder — put everyday and coding tasks in the right order', descriptionBn: 'কোডারের মতো ভাবি — দৈনন্দিন আর কোডিং কাজ সঠিক ধারায় সাজাই', commonCore: [], nctbCode: 'c7-ict-2', classNumber: 7, game: 'game-codelogic', family: 'coding-logic', tier: 2, challenge: true },

  // ── Band 8 — Summit Peaks (ages 13–16, class 8): DEEPER PROGRESSION ──
  // #1164 — the map no longer dead-ends at band 7. Each skill reuses a proven
  // scene as the next rung of its ladder (family/tier/dataLevels) and flags
  // challenge:true, exactly like the band 6–7 pattern.
  { id: 'alg-two-step', band: 8, subject: 'math', title: 'Two-step equations', titleBn: 'দুই ধাপের সমীকরণ', description: 'Solve 2x + 3 = 11 and 5x − 2 = 13 by undoing two operations', descriptionBn: 'দুটি অপারেশন উল্টে 2x + 3 = 11 আর 5x − 2 = 13 সমাধান করি', commonCore: ['8.EE.7'], nctbCode: 'c8-math-1', classNumber: 8, game: 'game-mathsolve', family: 'algebra', tier: 3, dataLevels: [1, 2, 3, 4], challenge: true },
  { id: 'neg-arith', band: 8, subject: 'math', title: 'Negative number arithmetic', titleBn: 'ঋণাত্মক সংখ্যার হিসাব', description: 'Add, subtract and multiply with negative numbers — (−3) + 7, 4 − (−2), (−3) × 4', descriptionBn: 'ঋণাত্মক সংখ্যা নিয়ে যোগ, বিয়োগ আর গুণ করি — (−৩) + ৭, ৪ − (−২), (−৩) × ৪', commonCore: ['7.NS.1', '7.NS.2'], nctbCode: 'c8-math-2', classNumber: 8, game: 'game-negatives', family: 'negatives', tier: 3, dataLevels: [1, 2, 3], challenge: true },
  { id: 'percent-change', band: 8, subject: 'math', title: 'Percentage change', titleBn: 'শতকরা পরিবর্তন', description: 'Find the percent increase or decrease — a price moving from ৳40 to ৳50', descriptionBn: 'শতকরা বৃদ্ধি বা হ্রাস বের করি — দাম ৳৪০ থেকে ৳৫০ হলে', commonCore: ['7.RP.3'], nctbCode: 'c8-math-3', classNumber: 8, game: 'game-mathsolve', family: 'percent', tier: 3, dataLevels: [10, 20, 25, 50], challenge: true },
  { id: 'geo-volume-angles', band: 8, subject: 'math', title: 'Angles & volume', titleBn: 'কোণ ও আয়তন', description: 'Pair complementary and supplementary angles, and find the volume of cubes and cuboids', descriptionBn: 'পূরক ও সম্পূরক কোণ জোড়া মেলাই, আর ঘনক ও আয়তঘনের আয়তন বের করি', commonCore: ['7.G.5', '8.G.9'], nctbCode: 'c8-math-4', classNumber: 8, game: 'game-mathsolve', family: 'geometry', tier: 1, dataLevels: [1, 2, 3, 4, 5, 6], challenge: true },
  { id: 'stats-larger-sets', band: 8, subject: 'math', title: 'Statistics: larger sets', titleBn: 'পরিসংখ্যান: বড় সেট', description: 'Find the mean, median and range of larger data sets', descriptionBn: 'বড় ডেটা সেটের গড়, মধ্যমা আর বিস্তার বের করি', commonCore: ['6.SP.5', '7.SP.4'], nctbCode: 'c8-math-5', classNumber: 8, game: 'game-mathsolve', family: 'statistics', tier: 2, dataLevels: [1, 2, 3], challenge: true },
  { id: 'science-forces-depth', band: 8, subject: 'science', title: 'Forces & energy depth', titleBn: 'বল ও শক্তির গভীরতা', description: 'Work, friction and simple machines — deeper forces and energy ideas', descriptionBn: 'কাজ, ঘর্ষণ আর সরল যন্ত্র — বল ও শক্তির গভীর ধারণা', commonCore: [], nctbCode: 'c8-science-1', classNumber: 8, game: 'game-sciencefacts', family: 'forces-energy', tier: 3, challenge: true },
  { id: 'science-ecosystems-8', band: 8, subject: 'science', title: 'Ecosystems: energy & cycles', titleBn: 'বাস্তুতন্ত্র: শক্তি ও চক্র', description: 'Energy pyramids, nutrient cycles and biodiversity — how ecosystems stay balanced', descriptionBn: 'শক্তির পিরামিড, পুষ্টি চক্র আর জীববৈচিত্র্য — বাস্তুতন্ত্র কীভাবে ভারসাম্য রাখে', commonCore: [], nctbCode: 'c8-science-2', classNumber: 8, game: 'game-foodchain', family: 'ecosystems', tier: 3, challenge: true },
  { id: 'science-body-systems-8', band: 8, subject: 'science', title: 'Body systems: working together', titleBn: 'অঙ্গতন্ত্র: একসাথে কাজ', description: 'How body systems work together — lungs bring in oxygen, the heart carries it, muscles use it', descriptionBn: 'অঙ্গতন্ত্রগুলো কীভাবে একসাথে কাজ করে — ফুসফুস অক্সিজেন আনে, হৃৎপিণ্ড তা পৌঁছে দেয়, পেশি তা ব্যবহার করে', commonCore: [], nctbCode: 'c8-science-3', classNumber: 8, game: 'game-body-systems', family: 'human-body', tier: 4, challenge: true },
  { id: 'en-read-evaluate', band: 8, subject: 'english', title: 'Reading: evaluate & compare', titleBn: 'পড়া: মূল্যায়ন ও তুলনা', description: 'Evaluate evidence and compare two viewpoints in longer texts', descriptionBn: 'লম্বা লেখায় প্রমাণ মূল্যায়ন করি আর দুটি মতামত তুলনা করি', commonCore: ['RI.8.8'], nctbCode: 'c8-english-1', classNumber: 8, game: 'game-enparagraph', dataMode: 'paragraph', family: 'reading-comp', tier: 3, challenge: true },
  { id: 'en-grammar-adjectives', band: 8, subject: 'english', title: 'Adjectives & adverbs', titleBn: 'বিশেষণ ও ক্রিয়াবিশেষণ', description: 'Sort describing words — adjectives describe things, adverbs describe actions', descriptionBn: 'বর্ণনাকারী শব্দ সাজাই — বিশেষণ বস্তুকে, ক্রিয়াবিশেষণ কাজকে বর্ণনা করে', commonCore: ['L.8.1'], nctbCode: 'c8-english-2', classNumber: 8, game: 'game-grammar', family: 'grammar-parts', tier: 1, challenge: true },
  { id: 'ict-code-debug', band: 8, subject: 'ict', title: 'Code logic: find & fix', titleBn: 'কোড যুক্তি: খুঁজে ঠিক করি', description: 'Debug logic — spot the wrong step and fix simple algorithms', descriptionBn: 'যুক্তির ভুল ধরি — ভুল ধাপ খুঁজে সহজ অ্যালগরিদম ঠিক করি', commonCore: [], nctbCode: 'c8-ict-1', classNumber: 8, game: 'game-codelogic', family: 'coding-logic', tier: 3, challenge: true },
  { id: 'bgs-economics-8', band: 8, subject: 'bgs', title: 'Bangladesh economy & civics', titleBn: 'বাংলাদেশের অর্থনীতি ও নাগরিকতা', description: 'Trade, taxes, savings and civic duties — how Bangladesh works', descriptionBn: 'বাণিজ্য, কর, সঞ্চয় আর নাগরিক দায়িত্ব — বাংলাদেশ কীভাবে চলে', commonCore: [], nctbCode: 'c8-bgs-1', classNumber: 8, game: 'game-bgs', family: 'bgs-economics', tier: 1, challenge: true },

  // ── Backlog content (#43, #44, #48, #49) — new games built for the 2026 pipeline ──
  // #43 — order the 7 days + 12 Bangla months (band 1 calendar literacy)
  { id: 'bn-days-months', band: 1, subject: 'bangla', title: 'Days & months', titleBn: 'সপ্তাহ ও মাস', description: 'Order the 7 days and the 12 Bangla months', descriptionBn: '৭ দিন আর ১২ বাংলা মাস সঠিক ধারায় সাজাই', commonCore: ['RF.K.1'], nctbCode: 'c1-bangla-9', classNumber: 1, game: 'game-bndaysmonths' },
  // #44 — hear a word, build it from letter tiles (band 1 spelling)
  { id: 'bn-spelling', band: 1, subject: 'bangla', title: 'Bangla spelling', titleBn: 'বানান শিখি', description: 'Hear a word and build it by tapping letter tiles in order', descriptionBn: 'শব্দ শুনে অক্ষরের টালি সঠিক ধারায় টিপে বানান করি', commonCore: ['RF.1.2'], nctbCode: 'c1-bangla-10', classNumber: 1, game: 'game-bnspelling' },
  // #1140 — production spelling: type the heard Bangla word (tier 1-2 taps, tier 3+ types)
  { id: 'bn-spell-type', band: 1, subject: 'bangla', title: 'Spell by typing', titleBn: 'টাইপ করে বানান', description: 'Hear a Bangla word and spell it by typing it with the letter keys', descriptionBn: 'বাংলা শব্দ শুনে অক্ষরের বোতামে টাইপ করে বানান করি', commonCore: ['RF.1.2'], nctbCode: 'c1-bangla-12', classNumber: 1, game: 'game-banglaspell', typing: true, challenge: true, dataLevels: [1, 2, 3, 4, 5, 6] },
  // #48 — pick the right pronoun in a sentence (band 3)
  { id: 'bn-pronouns', band: 3, subject: 'bangla', title: 'Bangla pronouns', titleBn: 'সর্বনাম', description: 'Fill the right pronoun (আমি, তুমি, সে…) into a sentence', descriptionBn: 'বাক্যে সঠিক সর্বনাম বসাই (আমি, তুমি, সে…)', commonCore: ['L.3.1'], nctbCode: 'c3-bangla-10', classNumber: 3, game: 'game-bnpronouns' },
  // #49 — count DOWN from 100 by 1s (rocket blast-off; band 2)
  { id: 'count-back-100', band: 2, subject: 'math', title: 'Count back from 100', titleBn: 'উল্টো গোনা', description: 'Count down from 100 to 1 by ones — a rocket blast-off (reverse mode of the count family)', descriptionBn: '১০০ থেকে ১ পর্যন্ত উল্টো গুনি — রকেট ওড়ে (গণনা পরিবারের উল্টো ভাগ)', commonCore: ['1.NBT.1'], nctbCode: 'c2-math-14', classNumber: 2, game: 'game-countback', family: 'count', tier: 6 },
  // ── 2026 backlog content (#51, #53, #54, #56) — English pack ──
  // #51 — drag 3 letters to build a CVC word (band 1)
  { id: 'en-cvc-build', band: 1, subject: 'english', title: 'Build CVC words', titleBn: 'শব্দ গড়ি', description: 'See a CVC picture, drag its 3 letters into the slots to spell it', descriptionBn: 'ছবি দেখে ৩টা অক্ষর টেনে শব্দ গড়ি (cat, dog, sun)', commonCore: ['RF.1.2b'], nctbCode: 'c1-english-6', classNumber: 1, game: 'game-cvcbuild' },
  // #53 — regular plurals -s / -es / -ies (band 2)
  { id: 'en-plurals-regular', band: 2, subject: 'english', title: 'Plurals: -s -es -ies', titleBn: 'বহুবচন: -s -es -ies', description: 'One cat 🐱 → two cats! Regular plurals with rule demos (add -s, add -es, change y → -ies)', descriptionBn: 'একটা cat 🐱 → দুটো cats! নিয়মসহ নিয়মিত বহুবচন (add -s, add -es, y → -ies)', commonCore: ['L.2.1b'], nctbCode: 'c2-english-14', classNumber: 2, game: 'game-plurals' },
  // #54 — regular past tense -ed (band 3)
  { id: 'en-past-ed', band: 3, subject: 'english', title: 'Past tense: -ed', titleBn: 'অতীত কাল: -ed', description: 'Fill the blank with the -ed form — play → played, jump → jumped (read aloud)', descriptionBn: 'ফাঁকে -ed অতীত বসাও — play → played, jump → jumped (পড়ে শোনানো হয়)', commonCore: ['L.3.1d'], nctbCode: 'c3-english-9', classNumber: 3, game: 'game-pasted' },
  // #56 — uppercase ↔ lowercase match (band 1)
  { id: 'en-case-match', band: 1, subject: 'english', title: 'Big & small letters', titleBn: 'বড়-ছোট অক্ষর', description: 'Match a big letter B to its small partner b — 26 pairs, letter name spoken', descriptionBn: 'বড় অক্ষর B-এর ছোট জুটি b মেলাও — ২৬ জোড়া, অক্ষরের নাম শোনানো হয়', commonCore: ['RF.K.1d'], nctbCode: 'c1-english-7', classNumber: 1, game: 'game-casematch' },
];

/** Game configs (mirrors content_items rows). Levels are ascending — engine picks an index by mastery.
 *  One game per SKILL SCOPE: a shared scene may back several games (CountPop → count-1-10/20,
 *  FruitAdd → add/sub within 10/20), each with its OWN ladder capped at the skill's promise. */
export const GAMES: GameConfig[] = [
  // ── Band 1 number sense (each count skill has its own capped ladder) ──
  { id: 'game-countpop', skillId: 'count-1-10', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-countpop20', skillId: 'count-1-20', difficultyLevels: [10, 12, 14, 16, 18, 20], targetSuccess: 0.8 },
  { id: 'game-countsong', skillId: 'number-song', difficultyLevels: [3, 5, 7, 8, 9, 10], targetSuccess: 0.8 },
  { id: 'game-growcount', skillId: 'grow-count', difficultyLevels: [3, 4, 5, 7, 9, 12], targetSuccess: 0.8 },
  { id: 'game-memorypairs', skillId: 'quantity-match', difficultyLevels: [2, 3, 4, 5, 6, 7], targetSuccess: 0.8 },
  { id: 'game-memory', skillId: 'mem-compound-words', difficultyLevels: [6, 8, 12, 16, 20, 20], targetSuccess: 0.8 },
  { id: 'game-froghop', skillId: 'number-line', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-shapecatcher', skillId: 'shapes', difficultyLevels: [3, 4, 6, 8, 10, 12], targetSuccess: 0.8 },
  // #1143 — unscored free-play garden: a flat ladder is a data placeholder
  // only (the scene never grades), so adaptive code always stays at tier 1.
  { id: 'game-exploregarden', skillId: 'math-explore-garden', difficultyLevels: [1, 1, 1, 1, 1, 1], targetSuccess: 0.8 },
  { id: 'game-shapenames', skillId: 'en-shapes', difficultyLevels: [3, 4, 6, 8, 10, 12], targetSuccess: 0.8 },
  { id: 'game-tapdrag', skillId: 'ict-tap-drag', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-villagecity', skillId: 'bgs-village-city', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-patience', skillId: 'bgs-patience', difficultyLevels: [3, 3, 4, 4, 5, 5], targetSuccess: 0.8 },
  { id: 'game-habits', skillId: 'bgs-habits', difficultyLevels: [3, 3, 4, 4, 4, 5], targetSuccess: 0.8 },
  { id: 'game-bnletters', skillId: 'bn-swaroborno', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bnconsonants', skillId: 'bn-benjonborno', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-enletters', skillId: 'en-abcs', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bnnumbers', skillId: 'bn-numbers', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-trace', skillId: 'trace-digits', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
  // ── Band 2 counting → concrete add/sub → abstract recap ──
  { id: 'game-countpop50', skillId: 'count-to-50', difficultyLevels: [10, 15, 20, 30, 40, 50], targetSuccess: 0.8 },
  { id: 'game-count100', skillId: 'count-to-100', difficultyLevels: [10, 20, 30, 40, 60, 100], targetSuccess: 0.8 },
  { id: 'game-build999', skillId: 'count-to-999', difficultyLevels: [100, 120, 150, 200, 300, 500], targetSuccess: 0.8 },
  { id: 'game-oddeven', skillId: 'odd-even', difficultyLevels: [10, 20, 30, 50, 80, 100], targetSuccess: 0.8 },
  { id: 'game-shapeparts', skillId: 'shapes-parts', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
  { id: 'game-fruittree', skillId: 'fruit-tree-add', difficultyLevels: [4, 6, 8, 10, 12, 15], targetSuccess: 0.8 },
  { id: 'game-fruitadd-10', skillId: 'add-within-10', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-fruitsub-10', skillId: 'sub-within-10', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bnbonds', skillId: 'number-bonds-10', difficultyLevels: [4, 5, 6, 8, 10, 12], targetSuccess: 0.8 },
  { id: 'game-bnbonds20', skillId: 'number-bonds-20', difficultyLevels: [10, 12, 14, 16, 18, 20], targetSuccess: 0.8 },
  { id: 'game-fruitadd-20', skillId: 'add-within-20', difficultyLevels: [6, 8, 10, 12, 15, 20], targetSuccess: 0.8 },
  { id: 'game-fruitsub-20', skillId: 'sub-within-20', difficultyLevels: [6, 8, 10, 12, 15, 20], targetSuccess: 0.8 },
  { id: 'game-balloonpop', skillId: 'add-to-20', difficultyLevels: [10, 12, 14, 16, 18, 20], targetSuccess: 0.8 },
  { id: 'game-addfacts', skillId: 'en-addfacts', difficultyLevels: [6, 8, 10, 10, 12, 12], targetSuccess: 0.8 },
  { id: 'game-subfacts', skillId: 'en-subfacts', difficultyLevels: [6, 8, 10, 10, 12, 12], targetSuccess: 0.8 },
  { id: 'game-doubles', skillId: 'en-doubles', difficultyLevels: [6, 8, 10, 10, 12, 12], targetSuccess: 0.8 },
  { id: 'game-maketen', skillId: 'en-maketen', difficultyLevels: [5, 6, 8, 8, 10, 10], targetSuccess: 0.8 },
  { id: 'game-addregroup', skillId: 'en-addregroup', difficultyLevels: [5, 6, 8, 8, 10, 10], targetSuccess: 0.8 },
  { id: 'game-subborrow', skillId: 'en-subborrow', difficultyLevels: [5, 6, 8, 8, 10, 10], targetSuccess: 0.8 },
  { id: 'game-array-mult', skillId: 'en-array-mult', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-skipcount', skillId: 'skipcount', difficultyLevels: [2, 3, 3, 4, 4, 5], targetSuccess: 0.8 },
  { id: 'game-shares2', skillId: 'en-shares2', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-fracset', skillId: 'en-fracset', difficultyLevels: [3, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-mixedfrac', skillId: 'en-mixedfrac', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-dectenths', skillId: 'en-dectenths', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-makechange', skillId: 'en-makechange', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-elapsed', skillId: 'en-elapsed', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-measure', skillId: 'math-measure', difficultyLevels: [10, 20, 50, 100, 300, 500], targetSuccess: 0.8 },
  { id: 'game-perim', skillId: 'en-perim', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-solidmatch', skillId: 'en-solidmatch', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-symmetry', skillId: 'en-symmetry', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-animalsmove', skillId: 'en-animals-move', difficultyLevels: [3, 3, 4, 4, 5, 5], targetSuccess: 0.8 },
  { id: 'game-plantlife', skillId: 'en-plant-life', difficultyLevels: [4, 4, 5, 5, 5, 5], targetSuccess: 0.8 },
  { id: 'game-plants', skillId: 'science-plants', difficultyLevels: [3, 3, 4, 4, 4, 5], targetSuccess: 0.8 },
  { id: 'game-seasons', skillId: 'en-weather-seasons', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-living', skillId: 'science-living', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-senses', skillId: 'science-senses', difficultyLevels: [3, 3, 4, 4, 5, 5], targetSuccess: 0.8 },
  { id: 'game-shadows', skillId: 'en-light-shadows', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-magnets', skillId: 'en-magnets', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-watercycle', skillId: 'en-water-cycle', difficultyLevels: [3, 4, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-keyboard', skillId: 'ict-keyboard', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-device', skillId: 'ict-device-manners', difficultyLevels: [2200, 2400, 2600, 2800, 3000, 3200], targetSuccess: 0.8 },
  { id: 'game-computer', skillId: 'ict-computer-safety', difficultyLevels: [3, 3, 4, 4, 5, 5], targetSuccess: 0.8 },
  { id: 'game-professions', skillId: 'bgs-professions', difficultyLevels: [3, 3, 4, 4, 5, 5], targetSuccess: 0.8 },
  { id: 'game-festivals', skillId: 'bgs-festivals', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-kindness', skillId: 'bgs-kindness', difficultyLevels: [2, 2, 3, 3, 4, 4], targetSuccess: 0.8 },
  { id: 'game-honesty', skillId: 'bgs-honesty', difficultyLevels: [2, 2, 3, 3, 4, 4], targetSuccess: 0.8 },
  { id: 'game-ordinals', skillId: 'bn-ordinals', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-idioms', skillId: 'bn-idioms', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-verbgender', skillId: 'bn-verbgender', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-classifiers', skillId: 'bn-classifiers', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-digraphs', skillId: 'en-digraphs', difficultyLevels: [10000, 9000, 8000, 7000, 6000, 5000], targetSuccess: 0.8 }, // deliberately descending — timer ms (lower = less time = harder)
  { id: 'game-longvowels', skillId: 'en-longvowels', difficultyLevels: [10000, 9000, 8000, 7000, 6000, 5000], targetSuccess: 0.8 }, // deliberately descending — timer ms (lower = less time = harder)
  { id: 'game-bdtaka', skillId: 'bd-taka', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-coinvalues', skillId: 'bn-coin-values', difficultyLevels: [8, 8, 12, 12, 20, 20], targetSuccess: 0.8 },
  { id: 'game-timewords', skillId: 'bn-time-words', difficultyLevels: [0, 0, 1, 1, 2, 2], targetSuccess: 0.8 },
  { id: 'game-directionwords', skillId: 'bn-direction-words', difficultyLevels: [3, 3, 4, 4, 5, 5], targetSuccess: 0.8 },
  { id: 'game-polite', skillId: 'bn-polite-words', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-bncolors', skillId: 'bn-colors', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bnsightwords', skillId: 'bn-sightwords', difficultyLevels: [6, 6, 8, 8, 9, 9], targetSuccess: 0.8 },
  { id: 'game-sentencebuilder', skillId: 'bn-sentence-builder', difficultyLevels: [1, 1, 2, 2, 2, 2], targetSuccess: 0.8 },
  { id: 'game-storyread', skillId: 'bn-story-read', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-rhymes', skillId: 'bn-rhymes', difficultyLevels: [2, 2, 1, 1, 0, 0], targetSuccess: 0.8 }, // deliberately descending — guide level (0 = listen-only, hardest)
  { id: 'game-wordpairs', skillId: 'bn-word-pairs', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-punct', skillId: 'bn-punctuation', difficultyLevels: [2, 2, 3, 3, 4, 4], targetSuccess: 0.8 },
  { id: 'game-compounds', skillId: 'bn-compounds', difficultyLevels: [2, 2, 2, 3, 3, 3], targetSuccess: 0.8 },
  { id: 'game-lettersound', skillId: 'bn-lettersound', difficultyLevels: [2, 2, 3, 3, 4, 4], targetSuccess: 0.8 },
  { id: 'game-matramatrix', skillId: 'bn-matra-matrix', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-readstory', skillId: 'bn-read-story', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-numberwords', skillId: 'bn-number-words', difficultyLevels: [2, 3, 3, 4, 4, 5], targetSuccess: 0.8 },
  { id: 'game-riddle', skillId: 'bn-riddle', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-enphonics', skillId: 'en-phonics', difficultyLevels: [3, 4, 5, 6, 7, 8], targetSuccess: 0.8 },
  { id: 'game-rcontrolled', skillId: 'en-rcontrolled', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-magice', skillId: 'en-magic-e', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-prepositions', skillId: 'en-prepositions', difficultyLevels: [3, 4, 5, 6, 7, 8], targetSuccess: 0.8 }, // #1055 — active preposition pool grows in/on/under → above/between
  { id: 'game-qwords', skillId: 'en-qwords', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-story', skillId: 'en-story', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-compounds-en', skillId: 'en-compounds', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-readaloud', skillId: 'en-readaloud', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-alphabet', skillId: 'en-alphabet', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-wordfam', skillId: 'en-wordfamilies', difficultyLevels: [2, 2, 3, 3, 3, 3], targetSuccess: 0.8 },
  { id: 'game-yesno', skillId: 'en-yesno', difficultyLevels: [6, 10, 14, 18, 20, 22], targetSuccess: 0.8 }, // #1055 — active listening-item pool grows from the 6 easiest to all 22
  { id: 'game-balance', skillId: 'heavy-light', difficultyLevels: [5, 6, 8, 10, 12, 14], targetSuccess: 0.8 },
  { id: 'game-sinkfloat', skillId: 'science-sink-float', difficultyLevels: [8, 8, 12, 12, 16, 16], targetSuccess: 0.8 },
  { id: 'game-foodchain', skillId: 'science-food-chain', difficultyLevels: [3, 3, 4, 4, 6, 6], targetSuccess: 0.8 },
  { id: 'game-foodsource', skillId: 'science-food-source', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-material', skillId: 'science-materials', difficultyLevels: [4, 4, 8, 8, 12, 12], targetSuccess: 0.8 },
  // #1145 — new binSort classification games (drag-to-bin engine).
  { id: 'game-oddevensort', skillId: 'odd-even-sort', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-vowelconsonant', skillId: 'vowel-consonant-sort', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-shapecorner', skillId: 'shape-corner-sort', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-plantanimal', skillId: 'plant-animal-sort', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-daynight', skillId: 'science-day-night', difficultyLevels: [2, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  // ── Band 3 arithmetic: add-sub-100 → mult → div (share then facts) → fractions → time → place value → regroup ──
  { id: 'game-addsub100', skillId: 'add-sub-100', difficultyLevels: [20, 40, 60, 80, 90, 100], targetSuccess: 0.8 },
  { id: 'game-rocketmult', skillId: 'mult-facts-2-5-10', difficultyLevels: [2, 5, 10, 12, 16, 20], targetSuccess: 0.8 },
  { id: 'game-multable', skillId: 'mult-facts-2-10', difficultyLevels: [2, 3, 4, 5, 7, 9], targetSuccess: 0.8 },
  { id: 'game-share', skillId: 'div-facts-fair-share', difficultyLevels: [2, 3, 4, 5, 6, 8], targetSuccess: 0.8 },
  { id: 'game-div-23', skillId: 'div-facts-by-2-3', difficultyLevels: [2, 2, 3, 3, 3, 3], targetSuccess: 0.8 },
  { id: 'game-pizzafrac', skillId: 'fractions-intro', difficultyLevels: [2, 3, 4, 5, 6, 8], targetSuccess: 0.8 },
  { id: 'game-comparefrac', skillId: 'fractions-compare', difficultyLevels: [0, 0, 1, 1, 2, 2], targetSuccess: 0.8 },
  { id: 'game-clock', skillId: 'tell-time', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
  { id: 'game-placevalue', skillId: 'place-value-1000', difficultyLevels: [3, 4, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-round', skillId: 'round-nearest-10-100', difficultyLevels: [40, 80, 120, 400, 700, 999], targetSuccess: 0.8 },
  { id: 'game-barchart', skillId: 'data-barchart', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-regroup', skillId: 'add-sub-regroup', difficultyLevels: [2, 3, 4, 5, 6, 8], targetSuccess: 0.8 },
  { id: 'game-picto', skillId: 'data-picto', difficultyLevels: [2, 2, 5, 5, 10, 10], targetSuccess: 0.8 },
  { id: 'game-bnwords', skillId: 'bn-words', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-conjunctfind', skillId: 'bn-conjunct-find', difficultyLevels: [12, 11, 10, 9, 8, 7], targetSuccess: 0.8 }, // deliberately descending — timer seconds (lower = less time = harder)
  { id: 'game-cvc', skillId: 'en-cvc', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-contracts', skillId: 'en-contractions', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-compare', skillId: 'en-compare', difficultyLevels: [3, 4, 5, 5, 5, 5], targetSuccess: 0.8 }, // #1052 — active adjective pool grows big/small/tall → +short → +long
  { id: 'game-synant', skillId: 'en-synant', difficultyLevels: [6, 6, 8, 8, 10, 10], targetSuccess: 0.8 },
  { id: 'game-irregulars', skillId: 'en-irregulars', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-past', skillId: 'en-pasttense', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  // ── Band 4 ──
  { id: 'game-division', skillId: 'division-facts', difficultyLevels: [2, 3, 4, 6, 8, 12], targetSuccess: 0.8 },
  { id: 'game-fracmatch', skillId: 'fractions-equiv', difficultyLevels: [2, 3, 4, 6, 8, 12], targetSuccess: 0.8 },
  { id: 'game-bnmatras', skillId: 'bn-matras', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-sightwords', skillId: 'en-sightwords', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-animalhome', skillId: 'science-animals', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  // ── Band 5 ──
  { id: 'game-decimals', skillId: 'decimals-intro', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
  { id: 'game-percent', skillId: 'percent-intro', difficultyLevels: [10, 20, 25, 50, 100, 150], targetSuccess: 0.8 },
  { id: 'game-area', skillId: 'area-perimeter', difficultyLevels: [6, 12, 20, 30, 42, 56], targetSuccess: 0.8 },
  { id: 'game-bnsentence', skillId: 'bn-sentences', difficultyLevels: [3, 4, 5, 6, 7, 8], targetSuccess: 0.8 },
  { id: 'game-grammar', skillId: 'en-grammar', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bgs', skillId: 'bgs-bangladesh', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  // #43/#44/#48/#49 — new 2026 pipeline games
  { id: 'game-bndaysmonths', skillId: 'bn-days-months', difficultyLevels: [4, 5, 6, 7, 7, 7], targetSuccess: 0.8 },
  { id: 'game-bnspelling', skillId: 'bn-spelling', difficultyLevels: [2, 3, 3, 4, 4, 5], targetSuccess: 0.8 },
  { id: 'game-banglaspell', skillId: 'bn-spell-type', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
  { id: 'game-bnpronouns', skillId: 'bn-pronouns', difficultyLevels: [3, 3, 4, 4, 5, 5], targetSuccess: 0.8 },
  { id: 'game-countback', skillId: 'count-back-100', difficultyLevels: [10, 20, 30, 40, 60, 100], targetSuccess: 0.8 },
  // #51/#53/#54/#56 — new 2026 English games
  { id: 'game-cvcbuild', skillId: 'en-cvc-build', difficultyLevels: [0, 0, 0, 1, 1, 1], targetSuccess: 0.8 },
  { id: 'game-plurals', skillId: 'en-plurals-regular', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-pasted', skillId: 'en-past-ed', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-casematch', skillId: 'en-case-match', difficultyLevels: [6, 10, 16, 22, 26, 26], targetSuccess: 0.8 }, // #1051 — active letter pool grows A–F → A–Z (more similar distractors)
  // ── curriculum breadth (#756/#759/#761/#757/#760) ──
  { id: 'game-bnmatra-words', skillId: 'bn-matra-words', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bgs-country', skillId: 'bgs-our-country', difficultyLevels: [2, 3, 4, 5, 6, 8], targetSuccess: 0.8 },
  { id: 'game-bgs-civics', skillId: 'bgs-good-citizens', difficultyLevels: [2, 3, 4, 5, 6, 8], targetSuccess: 0.8 },
  { id: 'game-onlinesafety', skillId: 'ict-online-safety', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-statematter', skillId: 'science-states-matter', difficultyLevels: [3, 3, 4, 4, 5, 5], targetSuccess: 0.8 },
  { id: 'game-encomprehension', skillId: 'en-comprehension', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-enparagraph', skillId: 'en-paragraph', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-humanbody', skillId: 'science-human-body', difficultyLevels: [2, 3, 3, 4, 4, 5], targetSuccess: 0.8 },
  { id: 'game-sentenceorder', skillId: 'en-sentence-order', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-body-systems', skillId: 'science-body-systems', difficultyLevels: [3, 4, 5, 6, 7, 8], targetSuccess: 0.8 },
  // #1160 — new band 6-7 reasoning scenes (answer-button ladder, challenge-ready)
  { id: 'game-mathsolve', skillId: 'alg-missing-number', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
  { id: 'game-negatives', skillId: 'neg-compare-order', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
  // #1161 — new band 6-7 science + ICT answer-button scenes (shared per-skill
  // ladders; the scene branches on the skill id, like game-mathsolve)
  { id: 'game-sciencefacts', skillId: 'science-forces-energy', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
  { id: 'game-codelogic', skillId: 'ict-code-blocks', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
  // #1142 — ArcadeCatch fast rounds: one scene, four fact families.
  { id: 'game-arcadecatch', skillId: 'facts-fast-add', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
];

/** gameId → Phaser scene key. Keeps the kid app and core in sync.
 *  A scene can back MULTIPLE games — each skill's ladder is its own game id.
 *
 *  #1157 — shared-scene ladder map (one scene, several skills). Every shared
 *  game id is INTENTIONAL tier reuse: each skill keeps its own `dataLevels`
 *  ladder (below / #1170) and the app tags every answer event with `skillId`,
 *  so per-code attribution survives scene reuse. Pedagogically unrelated pairs
 *  got their own game ids instead (e.g. game-shapecatcher vs game-shapenames,
 *  game-bnletters vs game-bnconsonants — see #1152/#1156).
 *    game-bnwords   → bn-words (c2-bangla-3) + bn-family-words (c2-bangla-4), dataMode family
 *    game-bnmatras  → bn-matras (c3-bangla-2) + bn-conjuncts (c6-bangla-2), dataMode conjuncts
 *    game-clock     → tell-time (c2-math-3) + clock-minute (c6-math-6), dataLevels clock-minute
 *    game-decimals  → decimals-intro (c5-math-3) + decimals-tenths (c7-math-3)
 *    game-division  → division-facts (c4-math-1) + divide-within-100 (c6-math-4)
 *    game-fracmatch → fractions-equiv (c4-math-2) + fraction-simplify (c7-math-1)
 *    game-multable  → mult-facts-2-10 (c3-math-19) + mult-fluency-6-9 (c6-math-1), dataLevels 6-9 + challenge
 *    game-percent   → percent-intro (c6-math-2) + percent-of-number (c7-math-2)
 *    game-pizzafrac → fractions-intro (c3-math-3) + fraction-read (c6-math-3)
 *    game-bgs       → bgs-bangladesh (c5-bgs-1) + bgs-heritage (c7-bgs-1) */
export const GAME_SCENES: Record<string, string> = {
  'game-cvcbuild': 'CvcBuild',
  'game-plurals': 'Plurals',
  'game-pasted': 'PastEd',
  'game-casematch': 'CaseMatch',
  'game-trace': 'Trace',
  'game-bndaysmonths': 'BanglaDays',
  'game-bnspelling': 'BanglaSpell',
  'game-banglaspell': 'BanglaSpell',
  'game-bnpronouns': 'Pronoun',
  'game-countback': 'CountBack',
  'game-countpop': 'CountPop',
  'game-countpop20': 'CountPop',
  'game-countpop50': 'CountPop',
  'game-count100': 'Count100',
  'game-build999': 'Build999',
  'game-growcount': 'GrowCount',
  'game-fruitadd-10': 'FruitAdd',
  'game-fruitsub-10': 'FruitAdd',
  'game-fruitadd-20': 'FruitAdd',
  'game-fruitsub-20': 'FruitAdd',
  'game-fruittree': 'FruitTree',
  'game-shapecatcher': 'ShapeCatcher',
  'game-shapenames': 'ShapeCatcher',
  'game-tapdrag': 'CatchBug',
  'game-villagecity': 'VillageCity',
  'game-patience': 'Patience',
  'game-froghop': 'FrogHop',
  'game-memorypairs': 'MemoryPairs',
  'game-memory': 'Memory',
  'game-countsong': 'CountingSong',
  'game-bnletters': 'BnLetters',
  'game-bnconsonants': 'BnLetters',
  'game-bnnumbers': 'BnNumbers',
  'game-enletters': 'EnLetters',
  'game-bnbonds': 'NumberBonds',
  'game-bnbonds20': 'NumberBonds',
  'game-oddeven': 'OddEven',
  'game-shapeparts': 'ShapeParts',
  'game-bncolors': 'BnColors',
  'game-bdtaka': 'BdMoney',
  'game-addfacts': 'FactsAdd',
  'game-subfacts': 'SubFacts',
  'game-doubles': 'Doubles',
  'game-maketen': 'MakeTen',
  'game-addregroup': 'AddRegroup',
  'game-subborrow': 'SubBorrow',
  'game-array-mult': 'ArrayMult',
  'game-skipcount': 'SkipCount',
  'game-shares2': 'ShareRem',
  'game-fracset': 'FracSet',
  'game-mixedfrac': 'MixedFrac',
  'game-dectenths': 'DecTenths',
  'game-makechange': 'MakeChange',
  'game-elapsed': 'ElapsedTime',
  'game-measure': 'Measurement',
  'game-perim': 'PerimFence',
  'game-solidmatch': 'SolidMatch',
  'game-symmetry': 'SymmetryMirror',
  'game-animalsmove': 'AnimalsMove',
  'game-plantlife': 'PlantLife',
  'game-plants': 'PlantParts',
  'game-seasons': 'WeatherSeasons',
  'game-living': 'LivingSort',
  'game-senses': 'FiveSenses',
  'game-shadows': 'ShadowGuess',
  'game-magnets': 'MagnetPoles',
  'game-watercycle': 'WaterCycle',
  'game-keyboard': 'KeyboardExplorer',
  'game-device': 'DeviceManners',
  'game-computer': 'ComputerSafety',
  'game-habits': 'HabitSort',
  'game-professions': 'ProfessionsMatch',
  'game-festivals': 'FestivalSort',
  'game-kindness': 'Kindness',
  'game-honesty': 'Truth',
  'game-ordinals': 'Ordinals',
  'game-idioms': 'Idioms',
  'game-verbgender': 'VerbGender',
  'game-classifiers': 'Classifiers',
  'game-digraphs': 'Digraphs',
  'game-longvowels': 'LongVowel',
  'game-coinvalues': 'CoinValue',
  'game-timewords': 'TimeWords',
  'game-directionwords': 'DirectionWords',
  'game-polite': 'Polite',
  'game-enphonics': 'EnPhonics',
  'game-rcontrolled': 'RControlled',
  'game-magice': 'MagicE',
  'game-prepositions': 'Prepositions',
  'game-qwords': 'QuestionWords',
  'game-story': 'Story',
  'game-compounds-en': 'CompoundEn',
  'game-readaloud': 'ReadAloud',
  'game-alphabet': 'AlphaOrder',
  'game-wordfam': 'WordFamily',
  'game-yesno': 'YesNo',
  'game-balloonpop': 'BalloonPop',
  'game-balance': 'Balance',
  'game-sinkfloat': 'SinkFloat',
  'game-foodchain': 'FoodChain',
  'game-foodsource': 'FoodSource',
  'game-material': 'MaterialSort',
  // #1145 — new binSort classification scenes.
  'game-oddevensort': 'OddEvenSort',
  'game-vowelconsonant': 'VowelConsonantSort',
  'game-shapecorner': 'ShapeCornerSort',
  'game-plantanimal': 'PlantAnimalSort',
  'game-daynight': 'DayNight',
  'game-addsub100': 'AddSub100',
  'game-clock': 'ClockTime',
  'game-rocketmult': 'RocketMult',
  'game-multable': 'TimesTable',
  'game-share': 'FairShare',
  'game-div-23': 'DivisionFacts',
  'game-regroup': 'Regroup',
  'game-pizzafrac': 'PizzaFrac',
  'game-comparefrac': 'CompareFrac',
  'game-bnwords': 'BnWords',
  'game-conjunctfind': 'ConjunctFind',
  'game-bnsightwords': 'BnSightWords',
  'game-sentencebuilder': 'SentenceBuilder',
  'game-storyread': 'StoryRead',
  'game-rhymes': 'RhymeTime',
  'game-wordpairs': 'WordPairs',
  'game-punct': 'Punct',
  'game-compounds': 'Compound',
  'game-lettersound': 'LetterSound',
  'game-matramatrix': 'MatraMatrix',
  'game-readstory': 'ReadStory',
  'game-numberwords': 'NumberWords',
  'game-riddle': 'Riddle',
  'game-cvc': 'Cvc',
  'game-contracts': 'Contracts',
  'game-compare': 'Compare',
  'game-synant': 'SynAnt',
  'game-irregulars': 'IrregularPlurals',
  'game-past': 'PastTense',
  'game-division': 'DivisionFacts',
  'game-fracmatch': 'FractionMatch',
  'game-placevalue': 'PlaceValue',
  'game-round': 'Rounding',
  'game-barchart': 'BarChart',
  'game-picto': 'PictoGraph',
  'game-bnmatras': 'BnMatras',
  'game-sightwords': 'SightWords',
  'game-animalhome': 'AnimalHome',
  'game-decimals': 'Decimals',
  'game-percent': 'Percent',
  'game-area': 'AreaPerim',
  'game-bnsentence': 'BnSentence',
  'game-grammar': 'Grammar',
  'game-bgs': 'BgsFacts',
  // ── curriculum breadth (#756/#759/#761/#757/#760) ──
  'game-bnmatra-words': 'BnMatras',
  'game-bgs-country': 'BgsFacts',
  'game-bgs-civics': 'BgsFacts',
  'game-onlinesafety': 'OnlineSafety',
  'game-statematter': 'StatesMatter',
  'game-encomprehension': 'ReadAloud',
  'game-enparagraph': 'ReadAloud',
  'game-humanbody': 'HumanBody',
  'game-body-systems': 'HumanBody',
  'game-sentenceorder': 'Story',
  // #1160 — new band 6-7 reasoning scenes
  'game-mathsolve': 'MathSolve',
  'game-negatives': 'NegativeNumber',
  // #1161 — new band 6-7 science + ICT answer-button scenes
  'game-sciencefacts': 'ScienceFacts',
  'game-codelogic': 'CodeLogic',
  // #1142 — fast-round fact fluency (add/sub/mult/div) on Arcade physics
  'game-arcadecatch': 'ArcadeCatch',
  // #1143 — no-pressure free-play garden break
  'game-exploregarden': 'ExploreGarden',
};

export function getSkill(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

export function getFamily(id: string): SkillFamily | undefined {
  return SKILL_FAMILIES.find((f) => f.id === id);
}

/** All skills that are tiers of one family (in catalog order). */
export function skillsForFamily(family: string): Skill[] {
  return SKILLS.filter((s) => s.family === family);
}

export function skillsForBand(band: number): Skill[] {
  return SKILLS.filter((s) => s.band === band);
}

export function skillsForSubject(subject: string): Skill[] {
  return SKILLS.filter((s) => s.subject === subject);
}

export function getGame(id: string): GameConfig | undefined {
  return GAMES.find((g) => g.id === id);
}

/** World id → first game scene key for that band's primary skill. */
export function defaultSceneForBand(band: number): string {
  const skill = SKILLS.find((s) => s.band === band && s.game);
  return skill?.game ? (GAME_SCENES[skill.game] ?? 'CountPop') : 'CountPop';
}

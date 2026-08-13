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
  { id: 'count-1-10', band: 1, subject: 'math', title: 'Count to 10', titleBn: '১ থেকে ১০ গুনি', description: 'Count objects 1 to 10 in sequence', descriptionBn: '১ থেকে ১০ পর্যন্ত বস্তু ক্রমান্বয়ে গুনি', commonCore: ['K.CC.1', 'K.CC.2'], nctbCode: 'c1-math-1', classNumber: 1, game: 'game-countpop' },
  { id: 'number-song', band: 1, subject: 'math', title: 'Number song', titleBn: 'সংখ্যার গান', description: 'Sing and play the counting melody with Nova', descriptionBn: 'নোভার সাথে গুনতির গান গাই ও বাজাই', commonCore: ['K.CC.1', 'K.CC.4'], nctbCode: 'c1-math-1', classNumber: 1, game: 'game-countsong' },
  { id: 'grow-count', band: 1, subject: 'math', title: 'Plant & count', titleBn: 'বপন ও গণনা', description: 'Plant seeds and watch a sprout grow — counting with a living reward', descriptionBn: 'বীজ বপন করি আর চারা বাড়তে দেখি — গুনলে জীবন্ত পুরস্কার', commonCore: ['K.CC.4', 'K.CC.5'], nctbCode: 'c1-math-1', classNumber: 1, game: 'game-growcount' },
  { id: 'quantity-match', band: 1, subject: 'math', title: 'Match numbers', titleBn: 'সংখ্যা মেলানো', description: 'Match numerals to fruit counts in a memory game', descriptionBn: 'স্মৃতি খেলায় সংখ্যা আর ফলের পরিমাণ মেলাই', commonCore: ['K.CC.4', 'K.CC.5'], nctbCode: 'c1-math-1', classNumber: 1, game: 'game-memorypairs' },
  { id: 'count-1-20', band: 1, subject: 'math', title: 'Count to 20', titleBn: '১ থেকে ২০ গুনি', description: 'Count objects up to 20', descriptionBn: '২০ পর্যন্ত বস্তু গুনি', commonCore: ['K.CC.1'], nctbCode: 'c1-math-1', classNumber: 1, game: 'game-countpop20' },
  { id: 'number-line', band: 1, subject: 'math', title: 'Number line hops', titleBn: 'সংখ্যা রেখা', description: 'Hop a frog along the number line to the target number', descriptionBn: 'সংখ্যা রেখা ধরে ব্যাঙ লাফিয়ে লক্ষ্য সংখ্যায় যাই', commonCore: ['K.CC.4', '1.NBT.1'], nctbCode: 'c1-math-2', classNumber: 1, game: 'game-froghop' },
  { id: 'shapes', band: 1, subject: 'math', title: 'Recognize shapes', titleBn: 'আকার চিনি', description: 'Identify circle, square, triangle, star', descriptionBn: 'বৃত্ত, বর্গ, ত্রিভুজ, তারা চিনি', commonCore: ['K.G.2'], nctbCode: 'c1-math-3', classNumber: 1, game: 'game-shapecatcher' },
  // Language — STAGE 1: first letters (both tracks, mirrored)
  { id: 'bn-swaroborno', band: 1, subject: 'bangla', title: 'Bangla vowels', titleBn: 'স্বরবর্ণ', description: 'Recognize Bangla vowel letters অ আ ই ঈ উ ঊ', descriptionBn: 'বাংলা স্বরবর্ণ অ আ ই ঈ উ ঊ চিনি', commonCore: ['RF.K.1d'], nctbCode: 'c1-bangla-1', classNumber: 1, game: 'game-bnletters' },
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
  // STAGE 1 vocabulary — first number/word names in each language
  { id: 'bn-numbers', band: 1, subject: 'bangla', title: 'Bangla numbers', titleBn: 'বাংলা সংখ্যা', description: 'Hear and recognize Bangla numerals ০–৯', descriptionBn: 'বাংলা সংখ্যা ০–৯ শুনে চিনি', commonCore: ['K.CC.1'], nctbCode: 'c1-bangla-2', classNumber: 1, game: 'game-bnnumbers' },
  { id: 'en-shapes', band: 1, subject: 'english', title: 'Shape names', titleBn: 'আকৃতির নাম', description: 'English names of shapes (circle, square, triangle)', descriptionBn: 'আকৃতির ইংরেজি নাম (বৃত্ত, বর্গ, ত্রিভুজ)', commonCore: ['L.K.5c'], nctbCode: 'c1-english-3', classNumber: 1, game: 'game-shapecatcher' },
  { id: 'en-wordfamilies', band: 1, subject: 'english', title: 'Word families', titleBn: 'শব্দ পরিবার', description: 'Sort words into rhyming families (-at, -an, -ig, -op)', descriptionBn: 'মিলিয়ে লেখা শব্দগুলো পরিবারে সাজাও (-at, -an, -ig, -op)', commonCore: ['RF.K.3d'], nctbCode: 'c1-english-4', classNumber: 1, game: 'game-wordfam' },
  { id: 'en-yesno', band: 1, subject: 'english', title: 'Yes or no?', titleBn: 'হ্যাঁ নাকি না?', description: 'Hear a sentence and a question; tap YES or NO (slow-replay button)', descriptionBn: 'একটা বাক্য ও প্রশ্ন শোনো; হ্যাঁ বা না চাপো (ধীরে শোনার বোতাম)', commonCore: ['SL.K.2'], nctbCode: 'c1-english-5', classNumber: 1, game: 'game-yesno' },
  // ICT — fine tap/drag motor skills (band 1 foundational, #234)
  { id: 'ict-tap-drag', band: 1, subject: 'ict', title: 'Tap & drag accuracy', titleBn: 'টিপা-টানা অনুশীলন', description: 'Tap the bugs, drag the butterfly into the net', descriptionBn: 'পোকা টিপি, প্রজাপতি নেটে নিই', commonCore: [], nctbCode: 'c1-ict-1', classNumber: 1, game: 'game-tapdrag' },
  // Values — patience & waiting (band 1, BGS moral/values strand).
  { id: 'bgs-patience', band: 1, subject: 'bgs', title: 'Patience & waiting', titleBn: 'ধৈর্য ও অপেক্ষা', description: 'Wait for the reward — patience pays', descriptionBn: 'পুরস্কার পেতে অপেক্ষা করি — ধৈর্যের ফসল', commonCore: [], nctbCode: 'c1-bgs-1', classNumber: 1, game: 'game-patience' },

  // ── Band 2 — Cottage Fields (ages 4–6): FINISH NUMBERS, THEN CALCULATE ──
  // The counting ladder first (a kid must KNOW numbers before adding them) …
  { id: 'count-to-50', band: 2, subject: 'math', title: 'Count to 50', titleBn: '৫০ পর্যন্ত গুনি', description: 'Count objects up to 50', descriptionBn: '৫০ পর্যন্ত বস্তু গুনি', commonCore: ['1.NBT.1'], nctbCode: 'c1-math-1', classNumber: 1, game: 'game-countpop50' },
  { id: 'count-to-100', band: 2, subject: 'math', title: 'Count to 100', titleBn: '১০০ পর্যন্ত গুনি', description: 'Build numbers to 100 by bundling ten-rods and ones', descriptionBn: 'দশের ছড় আর একক জুড়ে ১০০ পর্যন্ত সংখ্যা গঠন করি', commonCore: ['1.NBT.1', '2.NBT.1'], nctbCode: 'c1-math-1', classNumber: 1, game: 'game-count100' },
  { id: 'count-to-999', band: 2, subject: 'math', title: 'Build to 999', titleBn: '৯৯৯ পর্যন্ত গঠন', description: 'Build three-digit numbers with hundred-flats, ten-rods and ones', descriptionBn: 'শতক, দশক আর একক দিয়ে তিন-অঙ্কের সংখ্যা গঠন করি', commonCore: ['2.NBT.1', '2.NBT.3'], nctbCode: 'c2-math-1', classNumber: 2, game: 'game-build999' },
  // Number PROPERTIES — odd/even (parity) rides the count ladder: pair the dots,
  // spot the lone one. Common Core puts it with 2.OA.3 (parity of groups).
  { id: 'odd-even', band: 2, subject: 'math', title: 'Odd & even', titleBn: 'জোড় ও বিজোড়', description: 'Sort numbers into odd and even by pairing the dots', descriptionBn: 'জোড়া বানিয়ে সংখ্যাকে জোড়-বিজোড়ে ভাগ করি', commonCore: ['2.OA.3'], nctbCode: 'c2-math-2', classNumber: 2, game: 'game-oddeven' },
  // …then addition, CONCRETE GAME FIRST, abstract drill LAST:
  { id: 'fruit-tree-add', band: 2, subject: 'math', title: 'Fruit tree addition', titleBn: 'ফলের গাছ যোগ', description: 'Grow fruit on a tree as you add — see addition happen', descriptionBn: 'যোগ করলে গাছে ফল জন্মায় — যোগ করা চোখে দেখা যায়', commonCore: ['1.OA.6'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-fruittree' },
  { id: 'add-within-10', band: 2, subject: 'math', title: 'Add within 10', titleBn: '১০-এর মধ্যে যোগ', description: 'Addition facts with sums to 10 (apples shown)', descriptionBn: 'যোগফল ১০-এর মধ্যে (আপেল দেখিয়ে)', commonCore: ['1.OA.6'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-fruitadd-10' },
  { id: 'sub-within-10', band: 2, subject: 'math', title: 'Subtract within 10', titleBn: '১০-এর মধ্যে বিয়োগ', description: 'Subtraction facts within 10 (apples shown)', descriptionBn: '১০-এর মধ্যে বিয়োগ (আপেল দেখিয়ে)', commonCore: ['1.OA.6'], nctbCode: 'c1-math-5', classNumber: 1, game: 'game-fruitsub-10' },
  { id: 'number-bonds-10', band: 2, subject: 'math', title: 'Number bonds to 10', titleBn: '১০-এর জোড়া সংখ্যা', description: 'Partition numbers to 10 — the backbone of add & sub', descriptionBn: '১০-এর ভাঙা সংখ্যা — যোগ-বিয়োগের ভিত্তি', commonCore: ['K.OA.3', '1.OA.6'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-bnbonds' },
  { id: 'number-bonds-20', band: 2, subject: 'math', title: 'Number bonds to 20', titleBn: '২০-এর জোড়া সংখ্যা', description: 'Partition numbers to 20 with double ten-frames', descriptionBn: 'দুই দশ-ফ্রেমে ২০-এর ভাঙা সংখ্যা', commonCore: ['1.OA.6', '2.OA.2'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-bnbonds20' },
  { id: 'add-within-20', band: 2, subject: 'math', title: 'Add within 20', titleBn: '২০-এর মধ্যে যোগ', description: 'Addition facts with sums to 20 (apples shown)', descriptionBn: 'যোগফল ২০-এর মধ্যে (আপেল দেখিয়ে)', commonCore: ['1.OA.6', '2.OA.2'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-fruitadd-20' },
  { id: 'sub-within-20', band: 2, subject: 'math', title: 'Subtract within 20', titleBn: '২০-এর মধ্যে বিয়োগ', description: 'Subtraction facts within 20 (apples shown)', descriptionBn: '২০-এর মধ্যে বিয়োগ (আপেল দেখিয়ে)', commonCore: ['1.OA.6', '2.OA.2'], nctbCode: 'c1-math-5', classNumber: 1, game: 'game-fruitsub-20' },
  { id: 'add-to-20', band: 2, subject: 'math', title: 'Add to 20', titleBn: '২০-এর মধ্যে যোগ', description: 'Pop balloons with the right sums — abstract speed drill', descriptionBn: 'সঠিক যোগফলের বেলুন ফুটাই — দ্রুত অনুশীলন', commonCore: ['1.OA.6', '2.OA.2'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-balloonpop' },
  // Math — addition facts fluency: rapid-fire timed drill to 20 with speed ⚡ + accuracy tally.
  { id: 'en-addfacts', band: 2, subject: 'math', title: 'Add facts to 20', titleBn: '২০-এর মধ্যে যোগ অনুশীলন', description: 'Rapid-fire addition facts to 20 with speed + accuracy tracking', descriptionBn: 'দ্রুত-দ্রুত ২০-এর মধ্যে যোগ, গতি ও নির্ভুলতা দেখা হয়', commonCore: ['1.OA.C.6'], nctbCode: 'c2-math-6', classNumber: 2, game: 'game-addfacts' },
  // Math — subtraction facts fluency: timed drill to 20 with a number-line aid (the minus twin).
  { id: 'en-subfacts', band: 2, subject: 'math', title: 'Subtract facts to 20', titleBn: '২০-এর মধ্যে বিয়োগ অনুশীলন', description: 'Rapid-fire subtraction facts to 20 with a number-line hop and speed + accuracy tracking', descriptionBn: 'দ্রুত-দ্রুত ২০-এর মধ্যে বিয়োগ, সংখ্যারেখায় লাফিয়ে গতি ও নির্ভুলতা দেখা হয়', commonCore: ['1.OA.C.6'], nctbCode: 'c2-math-7', classNumber: 2, game: 'game-subfacts' },
  // Math — doubles strategy: chant the doubles, then transfer to near-doubles (+1) with dot arrays.
  { id: 'en-doubles', band: 2, subject: 'math', title: 'Doubles & near-doubles', titleBn: 'দ্বিগুণ ও প্রায় দ্বিগুণ', description: 'Learn doubles facts with a spoken chant and dot arrays, then solve near-doubles as double + 1', descriptionBn: 'গান ও বিন্দু দিয়ে দ্বিগুণ শিখি, তারপর দ্বিগুণ + ১ দিয়ে প্রায় দ্বিগুণ করি', commonCore: ['1.OA.C.6', '2.OA.B.2'], nctbCode: 'c2-math-8', classNumber: 2, game: 'game-doubles' },
  // Math — making ten: fill a ten-frame and bridge to the teens (8+5 = 8+2+3 = 10+3).
  { id: 'en-maketen', band: 2, subject: 'math', title: 'Making ten', titleBn: 'দশ বানাই', description: 'Compose ten inside ten-frames, then bridge to teen sums with the leftover', descriptionBn: 'দশ-ফ্রেমে দশ বানাই, তারপর বাকি দিয়ে কিশোর সংখ্যা করি', commonCore: ['1.OA.C.6'], nctbCode: 'c2-math-9', classNumber: 2, game: 'game-maketen' },
  // Math — 2-digit written method: scaffolded carry addition with base-10 block visuals.
  { id: 'en-addregroup', band: 2, subject: 'math', title: 'Carry addition (visual)', titleBn: 'ক্যারি যোগ (দৃশ্য)', description: 'Add two 2-digit numbers step by step with base-10 blocks and a regroup animation', descriptionBn: 'দশক-একক যোগ করি ধাপে ধাপে, ব্লক দেখে ক্যারি অ্যানিমেশনসহ', commonCore: ['2.NBT.B.5', '2.NBT.B.6'], nctbCode: 'c2-math-10', classNumber: 2, game: 'game-addregroup' },
  // Math — 2-digit written method: scaffolded borrowing with base-10 block visuals.
  { id: 'en-subborrow', band: 2, subject: 'math', title: 'Borrow subtraction (visual)', titleBn: 'ধার বিয়োগ (দৃশ্য)', description: 'Subtract two 2-digit numbers step by step with base-10 blocks and a borrow animation', descriptionBn: 'দুই অঙ্কের বিয়োগ করি ধাপে ধাপে, ব্লক দেখে ধার অ্যানিমেশনসহ', commonCore: ['2.NBT.B.5'], nctbCode: 'c2-math-11', classNumber: 2, game: 'game-subborrow' },
  // Math — multiplication arrays: countable dot arrays teach tables 2-5 before numbers.
  { id: 'en-array-mult', band: 2, subject: 'math', title: 'Array times tables', titleBn: 'বিন্যাসে গুণ', description: 'Match a dot array (rows × columns) to its equation — tables 2 to 5', descriptionBn: 'বিন্দুর বিন্যাস (সারি × কলাম) মিলিয়ে গুণের সমীকরণ — ২ থেকে ৫ এর নামতা', commonCore: ['2.OA.C.4', '3.OA.A.1'], nctbCode: 'c2-math-12', classNumber: 2, game: 'game-array-mult' },
  // Math — division as sharing lvl 2: fair shares extended to the remainder concept.
  { id: 'en-shares2', band: 3, subject: 'math', title: 'Fair shares 2 (remainders)', titleBn: 'সমান ভাগ ২ (ভাগশেষ)', description: 'Watch candies share round-robin into plates, then find each share and the leftover', descriptionBn: 'ক্যান্ডি ঘুরে ঘুরে ভাগ হয় দেখি, তারপর প্রত্যেকের ভাগ আর বাকি খুঁজি', commonCore: ['3.OA.A.2', '3.OA.C.7'], nctbCode: 'c3-math-7', classNumber: 3, game: 'game-shares2' },
  // Math — fractions of a set: tap the correct subset of a group (1/2 of 8 → 4).
  { id: 'en-fracset', band: 3, subject: 'math', title: 'Fractions of a set', titleBn: 'সমষ্টির ভগ্নাংশ', description: 'Find a fraction of a group by tapping the right number of fruits (1/2 of 8)', descriptionBn: 'গুচ্ছের ভগ্নাংশ খুঁজি — সঠিক সংখ্যক ফল তাপ করে (৮-এর ১/২)', commonCore: ['3.NF.A.1'], nctbCode: 'c3-math-8', classNumber: 3, game: 'game-fracset' },
  // Math — mixed numbers & improper fractions: bar + number line show 1½ = 3/2 (convert visually).
  { id: 'en-mixedfrac', band: 3, subject: 'math', title: 'Mixed numbers & improper fractions', titleBn: 'মিশ্র সংখ্যা ও অপ্রকৃত ভগ্নাংশ', description: 'See 1½ on a bar and a number line, then match it to its improper fraction 3/2', descriptionBn: 'বার আর সংখ্যা রেখায় ১½ দেখি, তারপর মিশিয়ে খুঁজি সমান ভগ্নাংশ ৩/২', commonCore: ['3.NF.A.3c'], nctbCode: 'c3-math-9', classNumber: 3, game: 'game-mixedfrac' },
  // Math — decimals to tenths: shade/read a 10-cell strip in 0.1 steps (place-value speech).
  { id: 'en-dectenths', band: 3, subject: 'math', title: 'Decimal tenths', titleBn: 'দশমিকের দশক', description: 'Read a shaded 10-cell strip as a decimal (0.3) and build one by shading cells (tenths)', descriptionBn: 'ছাপানো ১০ ঘরের দশমিক পড়ি (০.৩) আর ঘর ছাপিয়ে বানাই (দশমাংশ)', commonCore: ['4.NF.C.6'], nctbCode: 'c3-math-10', classNumber: 3, game: 'game-dectenths' },
  // Math — making change with ৳ notes: pay with ৳50/৳100, compute the change; tap notes to make exact amounts.
  { id: 'en-makechange', band: 3, subject: 'math', title: 'Making change (৳ notes)', titleBn: 'টাকা ফেরত (নোট)', description: 'Pay with a ৳50/৳100 note and compute the change, then make exact amounts by tapping ৳5/10/20/50', descriptionBn: '৳৫০/৳১০০ নোট দিয়ে দাম দিয়ে ফেরত বের করি, তারপর নোট ছাপিয়ে ঠিক অংক বানাই', commonCore: ['2.MD.C.8'], nctbCode: 'c3-math-11', classNumber: 3, game: 'game-makechange' },
  // Math — elapsed time: an analog clock + a digital target, "how many minutes until …?".
  { id: 'en-elapsed', band: 3, subject: 'math', title: 'Elapsed time (how long until…)', titleBn: 'সময়ের হিসাব (কতক্ষণ পরে…)', description: 'Watch an analog clock and find how many minutes until the digital target time', descriptionBn: 'ঘড়ি দেখে খুঁজি ডিজিটাল সময় পর্যন্ত কত মিনিট বাকি', commonCore: ['2.MD.C.7', '3.MD.A.1'], nctbCode: 'c3-math-12', classNumber: 3, game: 'game-elapsed' },
  { id: 'bd-taka', band: 2, subject: 'math', title: 'Bangla money', titleBn: 'টাকা চিনি', description: 'Recognize ৳ notes and coins, make amounts, and give change', descriptionBn: '৳ নোট ও কয়েন চিনি, অংক বানাই, ফেরত দিই', commonCore: ['2.MD.8'], nctbCode: 'c1-math-6', classNumber: 1, game: 'game-bdtaka' },
  // Math — coin values: ৳1/৳2/৳5/৳10 recognition + count-to-total, names spoken (টাকার চেনা).
  { id: 'bn-coin-values', band: 2, subject: 'math', title: 'Coin values', titleBn: 'টাকার চেনা', description: 'Recognize ৳1/৳2/৳5/৳10 coins & notes and count to a total', descriptionBn: '৳১/৳২/৳৫/৳১০ চিনি আর মোট টাকার হিসাব করি', commonCore: ['2.MD.8'], nctbCode: 'c2-math-5', classNumber: 2, game: 'game-coinvalues' },
  // Language — STAGE 2: more letters + sounds (mirrored)
  { id: 'bn-benjonborno', band: 2, subject: 'bangla', title: 'Bangla consonants', titleBn: 'ব্যঞ্জনবর্ণ', description: 'Recognize Bangla consonant letters ক খ গ ঘ', descriptionBn: 'বাংলা ব্যঞ্জনবর্ণ ক খ গ ঘ চিনি', commonCore: ['RF.K.1d'], nctbCode: 'c1-bangla-2', classNumber: 1, game: 'game-bnletters' },
  { id: 'bn-colors', band: 2, subject: 'bangla', title: 'Bangla colors', titleBn: 'রঙ চিনি', description: 'Name colors in Bangla (লাল, নীল, সবুজ)', descriptionBn: 'বাংলায় রঙের নাম বলি (লাল, নীল, সবুজ)', commonCore: ['L.K.5a'], nctbCode: 'c1-bangla-4', classNumber: 1, game: 'game-bncolors' },
  // Language — sight words: whole-word recall of short high-frequency words (দেখে বলো).
  { id: 'bn-sightwords', band: 2, subject: 'bangla', title: 'Bangla sight words', titleBn: 'দেখে বলো শব্দ', description: 'Read short high-frequency Bangla words on sight (আমি, তুমি, সে, না)', descriptionBn: 'দেখেই বাংলা শব্দ পড়ি (আমি, তুমি, সে, না)', commonCore: ['RF.2.3g'], nctbCode: 'c2-bangla-5', classNumber: 2, game: 'game-bnsightwords' },
  // Language — sentence building: SVO word-order grammar with role-colored tiles.
  { id: 'bn-sentence-builder', band: 2, subject: 'bangla', title: 'Sentence builder', titleBn: 'বাক্য সাজাই', description: 'Arrange colored tiles into a simple subject-verb-object sentence', descriptionBn: 'রঙিন টাইল সাজিয়ে সহজ বাক্য বানাই (কর্তা-ক্রিয়া-কর্ম)', commonCore: ['L.2.1'], nctbCode: 'c2-bangla-6', classNumber: 2, game: 'game-sentencebuilder' },
  { id: 'bn-word-pairs', band: 2, subject: 'bangla', title: 'Word pairs', titleBn: 'বিপরীত ও সমার্থক', description: 'Match opposite (বিপরীত) and same-meaning (সমার্থক) Bangla words', descriptionBn: 'বিপরীত ও সমার্থক শব্দের জুটি মেলাই', commonCore: ['L.2.5'], nctbCode: 'c2-bangla-7', classNumber: 2, game: 'game-wordpairs' },
  // Language — compound building: two small words join to make one new word (যোগে যোগে শব্দ).
  { id: 'bn-compounds', band: 2, subject: 'bangla', title: 'Compound words', titleBn: 'যোগে যোগে শব্দ', description: 'Tap the two small words that join to make a new Bangla word (গোলাপ + ফুল = গোলাপফুল)', descriptionBn: 'দুটি ছোট শব্দ মিলিয়ে নতুন শব্দ বানাই (গোলাপ + ফুল = গোলাপফুল)', commonCore: ['RF.2.3d'], nctbCode: 'c2-bangla-8', classNumber: 2, game: 'game-compounds' },
  // Language — matra matrix: mixed matras inside real words (মাত্রা মিশ্রণ).
  { id: 'bn-matra-matrix', band: 2, subject: 'bangla', title: 'Matra matrix', titleBn: 'মাত্রা মিশ্রণ', description: 'Complete real words by picking the right matra (ক + ◻ + টা = কাটা)', descriptionBn: 'সঠিক মাত্রা দিয়ে শব্দ শেষ করি (ক + ◻ + টা = কাটা)', commonCore: ['RF.2.3c'], nctbCode: 'c2-bangla-9', classNumber: 2, game: 'game-matramatrix' },
  // Language — number words 1-100: map the Bangla word to its digit and back.
  { id: 'bn-number-words', band: 2, subject: 'bangla', title: 'Number words', titleBn: 'সংখ্যা শব্দ', description: 'Match Bangla number words to digits 1-100 (একুশ → 21)', descriptionBn: 'সংখ্যার শব্দ আর অঙ্ক মেলাই ১-১০০ (একুশ → ২১)', commonCore: ['RF.2.3e'], nctbCode: 'c2-bangla-10', classNumber: 2, game: 'game-numberwords' },
  // Language — riddles: spoken clue + picture answer, hint ladder (ধাঁধা).
  { id: 'bn-riddle', band: 2, subject: 'bangla', title: 'Riddle time', titleBn: 'ধাঁধা', description: 'Solve short spoken riddles by tapping the picture answer (কলা, কুকুর, রংধনু…)', descriptionBn: 'ছোট ধাঁধা শুনে ছবির উত্তর টিপি (কলা, কুকুর, রংধনু…)', commonCore: ['SL.2.3'], nctbCode: 'c2-bangla-11', classNumber: 2, game: 'game-riddle' },
  { id: 'en-phonics', band: 2, subject: 'english', title: 'Letter sounds', titleBn: 'বর্ণের উচ্চারণ', description: 'First letter sounds (A, B, C)', descriptionBn: 'প্রথম অক্ষরের উচ্চারণ (A, B, C)', commonCore: ['RF.K.3a'], nctbCode: 'c1-english-2', classNumber: 1, game: 'game-enphonics' },
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
  // Science — day & night: earth rotation makes day and night.
  { id: 'science-day-night', band: 2, subject: 'science', title: 'Day & night', titleBn: 'দিন ও রাত', description: 'Spin the Earth and see why day and night happen', descriptionBn: 'পৃথিবী ঘুরিয়ে দেখি কীভাবে দিন-রাত হয়', commonCore: [], nctbCode: 'c2-science-5', classNumber: 2, game: 'game-daynight' },
  // BGS — village vs city life: sort everyday scenes into their world.
  { id: 'bgs-village-city', band: 2, subject: 'bgs', title: 'Village & city life', titleBn: 'গ্রাম ও শহরের জীবন', description: 'Sort scenes — village or city?', descriptionBn: 'দৃশ্য সাজাই — গ্রাম নাকি শহর?', commonCore: [], nctbCode: 'c2-bgs-1', classNumber: 2, game: 'game-villagecity' },

  // ── Band 3 — River Town (ages 6–8, class 2–3): EXTEND ARITHMETIC ──
  // Two-digit add/sub (extends band-2 facts) → mult (repeated add) → division
  // (concrete sharing FIRST, abstract facts AFTER) → fractions → time →
  // PLACE VALUE (prerequisite) → regrouping (the written method).
  { id: 'add-sub-100', band: 3, subject: 'math', title: 'Add & subtract to 100', titleBn: '১০০-এর মধ্যে যোগ-বিয়োগ', description: 'Two-digit addition and subtraction', descriptionBn: 'দুই-অঙ্কের যোগ ও বিয়োগ', commonCore: ['2.NBT.5', '3.NBT.2'], nctbCode: 'c2-math-4', classNumber: 2, game: 'game-addsub100' },
  { id: 'mult-facts-2-5-10', band: 3, subject: 'math', title: 'Times tables 2, 5, 10', titleBn: '২, ৫, ১০ এর নামতা', description: 'Multiplication facts for 2, 5, 10', descriptionBn: '২, ৫, ১০ এর গুণের সত্যি', commonCore: ['3.OA.7'], nctbCode: 'c3-math-2', classNumber: 2, game: 'game-rocketmult' },
  { id: 'mult-facts-2-10', band: 3, subject: 'math', title: 'Times tables 2–10', titleBn: '২–১০ এর নামতা', description: 'Multiplication facts 2×…10× taught with concrete arrays first', descriptionBn: '২×…১০× গুণন, আগে বস্তুর সারি দেখিয়ে শেখাই', commonCore: ['3.OA.7'], nctbCode: 'c3-math-2', classNumber: 2, game: 'game-multable' },
  { id: 'div-facts-fair-share', band: 3, subject: 'math', title: 'Fair shares', titleBn: 'সমান ভাগ', description: 'Division taught by fair-sharing (12 ÷ 3 = share 12 into 3)', descriptionBn: 'সমান ভাগের মাধ্যমে ভাগ শিখি (১২ ÷ ৩ = ১২ কে ৩ ভাগ)', commonCore: ['3.OA.7'], nctbCode: 'c3-math-4', classNumber: 2, game: 'game-share' },
  { id: 'div-facts-by-2-3', band: 3, subject: 'math', title: 'Divide by 2 and 3', titleBn: '২ ও ৩ দিয়ে ভাগ', description: 'Division facts with divisors 2 and 3', descriptionBn: 'ভাজক ২ ও ৩ দিয়ে ভাগ', commonCore: ['3.OA.7'], nctbCode: 'c3-math-4', classNumber: 2, game: 'game-div-23' },
  { id: 'fractions-intro', band: 3, subject: 'math', title: 'Halves and quarters', titleBn: 'অর্ধেক ও চতুর্থাংশ', description: 'Recognize ½, ¼, ¾ of a whole', descriptionBn: 'পুরোটার ½, ¼, ¾ চিনি', commonCore: ['3.NF.1'], nctbCode: 'c3-math-3', classNumber: 2, game: 'game-pizzafrac' },
  { id: 'tell-time', band: 3, subject: 'math', title: 'Tell time', titleBn: 'ঘড়ি পড়া', description: 'Read an analog clock', descriptionBn: 'ঘড়ি পড়ি', commonCore: ['1.MD.3', '2.MD.7'], nctbCode: 'c2-math-3', classNumber: 2, game: 'game-clock' },
  { id: 'place-value-1000', band: 3, subject: 'math', title: 'Place value to 9,999', titleBn: 'স্থানীয় মান', description: 'Thousands, hundreds, tens and ones up to 9,999 — read the number from its blocks', descriptionBn: '৯৯৯৯ পর্যন্ত হাজার, শতক, দশক, একক — ব্লক দেখে সংখ্যা পড়া', commonCore: ['2.NBT.1', '3.NBT.1', '4.NBT.2'], nctbCode: 'c3-math-1', classNumber: 3, game: 'game-placevalue' },
  // Rounding rides place value: read how many tens/hundreds, then jump the number
  // to the nearer fence-post. 3.NBT.1 (round to nearest 10 or 100).
  { id: 'round-nearest-10-100', band: 3, subject: 'math', title: 'Round to 10 & 100', titleBn: 'নিকটতম দশ/শতকে পূর্ণ', description: 'Round numbers to the nearest ten or hundred with a number-line jump', descriptionBn: 'সংখ্যারেখায় লাফিয়ে সংখ্যাকে নিকটতম দশ/শতকে পূর্ণ করি', commonCore: ['3.NBT.1'], nctbCode: 'c3-math-2', classNumber: 3, game: 'game-round' },
  // Data — read bar charts: tallest → a given count → a given category.
  // NCTB class-3 has a "data" strand; CC 2.MD.10 / 3.MD.3.
  { id: 'data-barchart', band: 3, subject: 'math', title: 'Bar chart reading', titleBn: 'বার চার্ট পড়ি', description: 'Answer how-many questions by tapping bars on a chart', descriptionBn: 'চার্টের বার দেখে কতগুলো, ট্যাপ করে উত্তর দিই', commonCore: ['2.MD.10', '3.MD.3'], nctbCode: 'c3-math-6', classNumber: 3, game: 'game-barchart' },
  { id: 'add-sub-regroup', band: 3, subject: 'math', title: 'Carry & Borrow', titleBn: 'ক্যারি ও ধার', description: '3-digit addition and subtraction with carrying and borrowing (written method)', descriptionBn: '৩-অঙ্কের যোগ-বিয়োগ ক্যারি ও ধারসহ (লিখিত পদ্ধতি)', commonCore: ['2.NBT.7', '3.NBT.2'], nctbCode: 'c3-math-5', classNumber: 3, game: 'game-regroup' },
  // Language — STAGE 3: first words (mirrored: BN words then EN CVC)
  { id: 'bn-words', band: 3, subject: 'bangla', title: 'Bangla words', titleBn: 'শব্দ পড়ি', description: 'Read simple Bangla words (মাছ, বাঘ, কলা)', descriptionBn: 'সহজ বাংলা শব্দ পড়ি (মাছ, বাঘ, কলা)', commonCore: ['RF.2.4'], nctbCode: 'c2-bangla-3', classNumber: 2, game: 'game-bnwords' },
  { id: 'bn-conjunct-find', band: 3, subject: 'bangla', title: 'Conjunct speed drill', titleBn: 'যুক্তবর্ণ দ্রুত অনুশীলন', description: 'Find common conjuncts in real words (ক্ষ, ঞ্জ, ঙ্ক)', descriptionBn: 'বাস্তব শব্দে যুক্তবর্ণ খুঁজি (ক্ষ, ঞ্জ, ঙ্ক)', commonCore: ['RF.3.3'], nctbCode: 'c3-bangla-3', classNumber: 3, game: 'game-conjunctfind' },
  { id: 'bn-family-words', band: 3, subject: 'bangla', title: 'Family words', titleBn: 'পরিবারের শব্দ', description: 'Read Bangla family words (মা, বাবা, ভাই)', descriptionBn: 'পরিবারের বাংলা শব্দ পড়ি (মা, বাবা, ভাই)', commonCore: ['RF.2.4'], nctbCode: 'c2-bangla-4', classNumber: 2, game: 'game-bnwords' },
  { id: 'bn-story-read', band: 3, subject: 'bangla', title: 'Story comprehension', titleBn: 'ছোট গল্প পড়ি', description: 'Read a mini-story, then answer a who/what question with pictures', descriptionBn: 'ছোট গল্প পড়ে ছবি দিয়ে উত্তর দিই (কে/কী)', commonCore: ['RL.2.1', 'RL.2.10'], nctbCode: 'c3-bangla-4', classNumber: 3, game: 'game-storyread' },
  { id: 'bn-punctuation', band: 3, subject: 'bangla', title: 'Punctuation', titleBn: 'যতি চিহ্ন', description: 'Tap the right punctuation to end each sentence (। ? !)', descriptionBn: 'বাক্য শেষ করার সঠিক যতি চিহ্ন টিপি (। ? !)', commonCore: ['L.3.2c'], nctbCode: 'c3-bangla-5', classNumber: 3, game: 'game-punct' },
  // Language — graded read-a-story: tap-to-hear-word, comprehension quiz at the end.
  { id: 'bn-read-story', band: 3, subject: 'bangla', title: 'Read a story', titleBn: 'গল্প পড়ি', description: 'Read 3 graded stories, tap any word to hear it, answer the quiz', descriptionBn: '৩টি গল্প পড়ি, শব্দ টিপলে শুনি, শেষে প্রশ্নের উত্তর দিই', commonCore: ['RL.2.10', 'RL.3.10'], nctbCode: 'c3-bangla-6', classNumber: 3, game: 'game-readstory' },
  { id: 'en-cvc', band: 3, subject: 'english', title: 'CVC words', titleBn: 'ইংরেজি শব্দ', description: 'Read cat, dog, sun, hat', descriptionBn: 'cat, dog, sun, hat পড়ি', commonCore: ['RF.2.3'], nctbCode: 'c2-english-3', classNumber: 2, game: 'game-cvc' },
  // Grammar — contractions: match I'm→I am, don't→do not, can't→cannot.
  { id: 'en-contractions', band: 3, subject: 'english', title: 'Contractions', titleBn: 'সংকোচন শব্দ', description: 'Match contractions to their two-word forms (I\x27m → I am, don\x27t → do not)', descriptionBn: 'সংকোচন শব্দের সঠিক জোড়া মেলাই (I\x27m → I am, don\x27t → do not)', commonCore: ['L.2.2c'], nctbCode: 'c3-english-4', classNumber: 3, game: 'game-contracts' },
  // Grammar — degrees of comparison: big → bigger → biggest with picture compare.
  { id: 'en-compare', band: 3, subject: 'english', title: 'Big, Bigger, Biggest', titleBn: 'বড়, বড়ো, সবচেয়ে বড়', description: 'Pick the right degree form for 2-picture (bigger) and 3-picture (biggest) compares', descriptionBn: '২ ছবিতে bigger, ৩ ছবিতে biggest — সঠিক তুলনার রূপ বাছো', commonCore: ['L.3.1g'], nctbCode: 'c3-english-5', classNumber: 3, game: 'game-compare' },
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

  // ── Band 4 — Sky Castle (ages 8–10, class 3–4): ADVANCED OPERATIONS ──
  { id: 'division-facts', band: 4, subject: 'math', title: 'Division facts', titleBn: 'ভাগ করা', description: 'Division facts within 100 (24÷3, 45÷5)', descriptionBn: '১০০-এর মধ্যে ভাগের সত্যি (২৪÷৩, ৪৫÷৫)', commonCore: ['3.OA.7'], nctbCode: 'c3-math-4', classNumber: 3, game: 'game-division' },
  { id: 'fractions-equiv', band: 4, subject: 'math', title: 'Equivalent fractions', titleBn: 'সমান ভগ্নাংশ', description: 'Recognize ½ = 2⁄4 = 3⁄6', descriptionBn: 'বুঝি ½ = ২⁄৪ = ৩⁄৬', commonCore: ['3.NF.3'], nctbCode: 'c4-math-3', classNumber: 4, game: 'game-fracmatch' },
  // Language — STAGE 4: decoding (mirrored: BN matras ↔ EN sight words)
  { id: 'bn-matras', band: 4, subject: 'bangla', title: 'Bangla matras', titleBn: 'কার', description: 'Combine letters with matras (ক + া = কা)', descriptionBn: 'অক্ষরের সাথে কার যোগ করি (ক + া = কা)', commonCore: ['RF.3.4'], nctbCode: 'c3-bangla-2', classNumber: 3, game: 'game-bnmatras' },
  { id: 'en-sightwords', band: 4, subject: 'english', title: 'Sight words', titleBn: 'দেখা-শব্দ', description: 'Read the, and, you, that, with', descriptionBn: 'the, and, you, that, with পড়ি', commonCore: ['RF.3.4'], nctbCode: 'c3-english-3', classNumber: 3, game: 'game-sightwords' },
  // Science — animals
  { id: 'science-animals', band: 4, subject: 'science', title: 'Animal homes', titleBn: 'প্রাণী ও আবাস', description: 'Where animals live (water, land, sky)', descriptionBn: 'প্রাণীরা কোথায় থাকে (পানি, ডাঙা, আকাশ)', commonCore: ['2.LS.4'], nctbCode: 'c3-science-1', classNumber: 3, game: 'game-animalhome' },

  // ── Band 5 — Star Academy (ages 10–13, class 5–8) ──
  { id: 'decimals-intro', band: 5, subject: 'math', title: 'Decimals', titleBn: 'দশমিক', description: 'Compare and order decimals (0.5 vs 0.45)', descriptionBn: 'দশমিক তুলনা ও সাজাই (০.৫ বনাম ০.৪৫)', commonCore: ['5.NBT.3'], nctbCode: 'c5-math-3', classNumber: 5, game: 'game-decimals' },
  { id: 'percent-intro', band: 5, subject: 'math', title: 'Percent of a number', titleBn: 'শতকরা', description: 'Find 10%, 25%, 50% of a number', descriptionBn: 'সংখ্যার ১০%, ২৫%, ৫০% বের করি', commonCore: ['6.RP.3'], nctbCode: 'c6-math-2', classNumber: 6, game: 'game-percent' },
  { id: 'area-perimeter', band: 5, subject: 'math', title: 'Area & perimeter', titleBn: 'ক্ষেত্রফল ও পরিসীমা', description: 'Area of rectangles and squares', descriptionBn: 'আয়তক্ষেত্র ও বর্গের ক্ষেত্রফল', commonCore: ['4.MD.3'], nctbCode: 'c5-math-5', classNumber: 5, game: 'game-area' },
  // Language — STAGE 5: sentences & grammar (mirrored)
  { id: 'bn-sentences', band: 5, subject: 'bangla', title: 'Bangla sentences', titleBn: 'বাক্য গঠন', description: 'Build simple Bangla sentences', descriptionBn: 'সহজ বাংলা বাক্য গঠন করি', commonCore: ['RF.5.4'], nctbCode: 'c5-bangla-4', classNumber: 5, game: 'game-bnsentence' },
  { id: 'en-grammar', band: 5, subject: 'english', title: 'Nouns & verbs', titleBn: 'বিশেষ্য ও ক্রিয়া', description: 'Sort words into nouns and verbs', descriptionBn: 'শব্দকে বিশেষ্য ও ক্রিয়ায় ভাগ করি', commonCore: ['L.5.1'], nctbCode: 'c5-english-3', classNumber: 5, game: 'game-grammar' },
  // BGS — Bangladesh & the world
  { id: 'bgs-bangladesh', band: 5, subject: 'bgs', title: 'Bangladesh facts', titleBn: 'বাংলাদেশ পরিচিতি', description: 'Capital, national symbols, rivers', descriptionBn: 'রাজধানী, জাতীয় প্রতীক, নদনদী', commonCore: [], nctbCode: 'c5-bgs-1', classNumber: 5, game: 'game-bgs' },

  // ── Band 6 — Jungle Canopy (ages 11–14, class 5–6): FLUENCY ──
  // Deeper practice of the band 3–5 operations at higher difficulty; each
  // skill reuses a proven scene (TimesTable, DivisionFacts, PizzaFrac, Clock).
  { id: 'mult-fluency-6-9', band: 6, subject: 'math', title: 'Times tables 6–9', titleBn: '৬–৯ এর নামতা', description: 'Multiplication tables 6, 7, 8, 9', descriptionBn: '৬, ৭, ৮, ৯ এর নামতা', commonCore: ['3.OA.7'], nctbCode: 'c5-math-2', classNumber: 5, game: 'game-multable' },
  { id: 'divide-within-100', band: 6, subject: 'math', title: 'Divide within 100', titleBn: '১০০-এর মধ্যে ভাগ', description: 'Division facts within 100 (72÷8)', descriptionBn: '১০০-এর মধ্যে ভাগ (৭২÷৮)', commonCore: ['3.OA.7'], nctbCode: 'c5-math-4', classNumber: 5, game: 'game-division' },
  { id: 'fraction-read', band: 6, subject: 'math', title: 'Read fractions', titleBn: 'ভগ্নাংশ পড়ি', description: 'Read shaded fractions to 8 parts', descriptionBn: '৮ ভাগ পর্যন্ত ছায়া-ভগ্নাংশ পড়ি', commonCore: ['3.NF.1'], nctbCode: 'c5-math-3', classNumber: 5, game: 'game-pizzafrac' },
  { id: 'clock-minute', band: 6, subject: 'math', title: 'Tell time to the minute', titleBn: 'মিনিট ধরে ঘড়ি পড়ি', description: 'Read any time to the exact minute', descriptionBn: 'মিনিট ধরে সঠিক সময় পড়ি', commonCore: ['2.MD.7'], nctbCode: 'c5-math-6', classNumber: 5, game: 'game-clock' },
  // Language — Bangla conjuncts (যুক্তবর্ণ): the tricky two-letter blends kids
  // meet in class 5 Bangla reading (ক্ষ ঞ্জ ঙ্ক ণ্ড). Reuses BnMatras' combine
  // mechanic with a conjuncts mode.
  { id: 'bn-conjuncts', band: 6, subject: 'bangla', title: 'Bangla conjuncts', titleBn: 'যুক্তবর্ণ', description: 'Combine letters into conjuncts ক্ষ ঞ্জ ঙ্ক ণ্ড', descriptionBn: 'অক্ষর জুড়ে যুক্তবর্ণ তৈরি করি (ক্ষ ঞ্জ ঙ্ক ণ্ড)', commonCore: ['RF.5.3'], nctbCode: 'c5-bangla-2', classNumber: 5, game: 'game-bnmatras' },

  // ── Band 7 — Polar Peaks (ages 12–15, class 6–8): REFINEMENT ──
  { id: 'decimals-tenths', band: 7, subject: 'math', title: 'Decimal tenths', titleBn: 'দশমিকের দশক', description: 'Place value in decimals (0.5, 0.25, 0.75)', descriptionBn: 'দশমিকের স্থানীয় মান (০.৫, ০.২৫, ০.৭৫)', commonCore: ['5.NBT.3', '4.NF.6'], nctbCode: 'c6-math-3', classNumber: 6, game: 'game-decimals' },
  { id: 'percent-of-number', band: 7, subject: 'math', title: 'Percent of a number', titleBn: 'সংখ্যার শতকরা', description: 'Find 10%, 25%, 50% and 75% of a number', descriptionBn: 'সংখ্যার ১০%, ২৫%, ৫০%, ৭৫% বের করি', commonCore: ['6.RP.3'], nctbCode: 'c6-math-2', classNumber: 6, game: 'game-percent' },
  { id: 'fraction-simplify', band: 7, subject: 'math', title: 'Simplify fractions', titleBn: 'ভগ্নাংশ ছোট করি', description: 'Reduce fractions to simplest form (4⁄8 → ½)', descriptionBn: 'ভগ্নাংশ ছোট করি (৪⁄৮ → ½)', commonCore: ['3.NF.3', '5.NF.1'], nctbCode: 'c6-math-3', classNumber: 6, game: 'game-fracmatch' },
  // BGS — heritage facts (a new, deeper fact tier in the BGS scene)
  { id: 'bgs-heritage', band: 7, subject: 'bgs', title: 'Bangladesh heritage', titleBn: 'বাংলাদেশের ঐতিহ্য', description: 'Festivals, crafts, foods, landmarks', descriptionBn: 'উৎসব, শিল্প, খাবার, ঐতিহাসিক স্থান', commonCore: [], nctbCode: 'c6-bgs-1', classNumber: 6, game: 'game-bgs' },
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
  { id: 'game-froghop', skillId: 'number-line', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-shapecatcher', skillId: 'shapes', difficultyLevels: [3, 4, 6, 8, 10, 12], targetSuccess: 0.8 },
  { id: 'game-tapdrag', skillId: 'ict-tap-drag', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-villagecity', skillId: 'bgs-village-city', difficultyLevels: [4, 4, 6, 6, 8, 8], targetSuccess: 0.8 },
  { id: 'game-patience', skillId: 'bgs-patience', difficultyLevels: [3, 3, 4, 4, 5, 5], targetSuccess: 0.8 },
  { id: 'game-bnletters', skillId: 'bn-swaroborno', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-enletters', skillId: 'en-abcs', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bnnumbers', skillId: 'bn-numbers', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  // ── Band 2 counting → concrete add/sub → abstract recap ──
  { id: 'game-countpop50', skillId: 'count-to-50', difficultyLevels: [10, 15, 20, 30, 40, 50], targetSuccess: 0.8 },
  { id: 'game-count100', skillId: 'count-to-100', difficultyLevels: [10, 20, 30, 40, 60, 100], targetSuccess: 0.8 },
  { id: 'game-build999', skillId: 'count-to-999', difficultyLevels: [100, 120, 150, 200, 300, 500], targetSuccess: 0.8 },
  { id: 'game-oddeven', skillId: 'odd-even', difficultyLevels: [10, 20, 30, 50, 80, 100], targetSuccess: 0.8 },
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
  { id: 'game-shares2', skillId: 'en-shares2', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-fracset', skillId: 'en-fracset', difficultyLevels: [3, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-mixedfrac', skillId: 'en-mixedfrac', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-dectenths', skillId: 'en-dectenths', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-makechange', skillId: 'en-makechange', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-elapsed', skillId: 'en-elapsed', difficultyLevels: [4, 5, 6, 8, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bdtaka', skillId: 'bd-taka', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-coinvalues', skillId: 'bn-coin-values', difficultyLevels: [8, 8, 12, 12, 20, 20], targetSuccess: 0.8 },
  { id: 'game-timewords', skillId: 'bn-time-words', difficultyLevels: [0, 0, 1, 1, 2, 2], targetSuccess: 0.8 },
  { id: 'game-directionwords', skillId: 'bn-direction-words', difficultyLevels: [3, 3, 4, 4, 5, 5], targetSuccess: 0.8 },
  { id: 'game-polite', skillId: 'bn-polite-words', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-bncolors', skillId: 'bn-colors', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bnsightwords', skillId: 'bn-sightwords', difficultyLevels: [6, 6, 8, 8, 9, 9], targetSuccess: 0.8 },
  { id: 'game-sentencebuilder', skillId: 'bn-sentence-builder', difficultyLevels: [1, 1, 2, 2, 2, 2], targetSuccess: 0.8 },
  { id: 'game-storyread', skillId: 'bn-story-read', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-rhymes', skillId: 'bn-rhymes', difficultyLevels: [2, 2, 1, 1, 0, 0], targetSuccess: 0.8 },
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
  { id: 'game-prepositions', skillId: 'en-prepositions', difficultyLevels: [0, 0, 0, 0, 0, 0], targetSuccess: 0.8 },
  { id: 'game-qwords', skillId: 'en-qwords', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-story', skillId: 'en-story', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-compounds-en', skillId: 'en-compounds', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-readaloud', skillId: 'en-readaloud', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-alphabet', skillId: 'en-alphabet', difficultyLevels: [4, 4, 5, 5, 6, 6], targetSuccess: 0.8 },
  { id: 'game-wordfam', skillId: 'en-wordfamilies', difficultyLevels: [2, 2, 3, 3, 3, 3], targetSuccess: 0.8 },
  { id: 'game-yesno', skillId: 'en-yesno', difficultyLevels: [0, 0, 0, 0, 0, 0], targetSuccess: 0.8 },
  { id: 'game-balance', skillId: 'heavy-light', difficultyLevels: [5, 6, 8, 10, 12, 14], targetSuccess: 0.8 },
  { id: 'game-sinkfloat', skillId: 'science-sink-float', difficultyLevels: [8, 8, 12, 12, 16, 16], targetSuccess: 0.8 },
  { id: 'game-foodchain', skillId: 'science-food-chain', difficultyLevels: [3, 3, 4, 4, 6, 6], targetSuccess: 0.8 },
  { id: 'game-daynight', skillId: 'science-day-night', difficultyLevels: [2, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  // ── Band 3 arithmetic: add-sub-100 → mult → div (share then facts) → fractions → time → place value → regroup ──
  { id: 'game-addsub100', skillId: 'add-sub-100', difficultyLevels: [20, 40, 60, 80, 90, 100], targetSuccess: 0.8 },
  { id: 'game-rocketmult', skillId: 'mult-facts-2-5-10', difficultyLevels: [2, 5, 10, 12, 16, 20], targetSuccess: 0.8 },
  { id: 'game-multable', skillId: 'mult-facts-2-10', difficultyLevels: [2, 3, 4, 5, 7, 9], targetSuccess: 0.8 },
  { id: 'game-share', skillId: 'div-facts-fair-share', difficultyLevels: [2, 3, 4, 5, 6, 8], targetSuccess: 0.8 },
  { id: 'game-div-23', skillId: 'div-facts-by-2-3', difficultyLevels: [2, 2, 3, 3, 3, 3], targetSuccess: 0.8 },
  { id: 'game-pizzafrac', skillId: 'fractions-intro', difficultyLevels: [2, 3, 4, 5, 6, 8], targetSuccess: 0.8 },
  { id: 'game-clock', skillId: 'tell-time', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
  { id: 'game-placevalue', skillId: 'place-value-1000', difficultyLevels: [3, 4, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-round', skillId: 'round-nearest-10-100', difficultyLevels: [40, 80, 120, 400, 700, 999], targetSuccess: 0.8 },
  { id: 'game-barchart', skillId: 'data-barchart', difficultyLevels: [3, 3, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-regroup', skillId: 'add-sub-regroup', difficultyLevels: [2, 3, 4, 5, 6, 8], targetSuccess: 0.8 },
  { id: 'game-bnwords', skillId: 'bn-words', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-conjunctfind', skillId: 'bn-conjunct-find', difficultyLevels: [12, 11, 10, 9, 8, 7], targetSuccess: 0.8 },
  { id: 'game-cvc', skillId: 'en-cvc', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-contracts', skillId: 'en-contractions', difficultyLevels: [3, 3, 3, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-compare', skillId: 'en-compare', difficultyLevels: [3, 3, 3, 3, 3, 3], targetSuccess: 0.8 },
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
];

/** gameId → Phaser scene key. Keeps the kid app and core in sync.
 *  A scene can back MULTIPLE games — each skill's ladder is its own game id. */
export const GAME_SCENES: Record<string, string> = {
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
  'game-tapdrag': 'CatchBug',
  'game-villagecity': 'VillageCity',
  'game-patience': 'Patience',
  'game-froghop': 'FrogHop',
  'game-memorypairs': 'MemoryPairs',
  'game-countsong': 'CountingSong',
  'game-bnletters': 'BnLetters',
  'game-bnnumbers': 'BnNumbers',
  'game-enletters': 'EnLetters',
  'game-bnbonds': 'NumberBonds',
  'game-bnbonds20': 'NumberBonds',
  'game-oddeven': 'OddEven',
  'game-bncolors': 'BnColors',
  'game-bdtaka': 'BdMoney',
  'game-addfacts': 'FactsAdd',
  'game-subfacts': 'SubFacts',
  'game-doubles': 'Doubles',
  'game-maketen': 'MakeTen',
  'game-addregroup': 'AddRegroup',
  'game-subborrow': 'SubBorrow',
  'game-array-mult': 'ArrayMult',
  'game-shares2': 'ShareRem',
  'game-fracset': 'FracSet',
  'game-mixedfrac': 'MixedFrac',
  'game-dectenths': 'DecTenths',
  'game-makechange': 'MakeChange',
  'game-elapsed': 'ElapsedTime',
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
  'game-daynight': 'DayNight',
  'game-addsub100': 'AddSub100',
  'game-clock': 'ClockTime',
  'game-rocketmult': 'RocketMult',
  'game-multable': 'TimesTable',
  'game-share': 'FairShare',
  'game-div-23': 'DivisionFacts',
  'game-regroup': 'Regroup',
  'game-pizzafrac': 'PizzaFrac',
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
  'game-division': 'DivisionFacts',
  'game-fracmatch': 'FractionMatch',
  'game-placevalue': 'PlaceValue',
  'game-round': 'Rounding',
  'game-barchart': 'BarChart',
  'game-bnmatras': 'BnMatras',
  'game-sightwords': 'SightWords',
  'game-animalhome': 'AnimalHome',
  'game-decimals': 'Decimals',
  'game-percent': 'Percent',
  'game-area': 'AreaPerim',
  'game-bnsentence': 'BnSentence',
  'game-grammar': 'Grammar',
  'game-bgs': 'BgsFacts',
};

export function getSkill(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
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

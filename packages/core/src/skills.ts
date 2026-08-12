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
  { id: 'en-abcs', band: 1, subject: 'english', title: 'ABCs', titleBn: 'ইংরেজি বর্ণমালা', description: 'Recognize uppercase letters A–F', descriptionBn: 'বড় হাতের ইংরেজি অক্ষর A–F চিনি', commonCore: ['RF.K.1d'], nctbCode: 'c1-english-1', classNumber: 1, game: 'game-enletters' },
  // STAGE 1 vocabulary — first number/word names in each language
  { id: 'bn-numbers', band: 1, subject: 'bangla', title: 'Bangla numbers', titleBn: 'বাংলা সংখ্যা', description: 'Hear and recognize Bangla numerals ০–৯', descriptionBn: 'বাংলা সংখ্যা ০–৯ শুনে চিনি', commonCore: ['K.CC.1'], nctbCode: 'c1-bangla-2', classNumber: 1, game: 'game-bnnumbers' },
  { id: 'en-shapes', band: 1, subject: 'english', title: 'Shape names', titleBn: 'আকৃতির নাম', description: 'English names of shapes (circle, square, triangle)', descriptionBn: 'আকৃতির ইংরেজি নাম (বৃত্ত, বর্গ, ত্রিভুজ)', commonCore: ['L.K.5c'], nctbCode: 'c1-english-3', classNumber: 1, game: 'game-shapecatcher' },

  // ── Band 2 — Cottage Fields (ages 4–6): FINISH NUMBERS, THEN CALCULATE ──
  // The counting ladder first (a kid must KNOW numbers before adding them) …
  { id: 'count-to-50', band: 2, subject: 'math', title: 'Count to 50', titleBn: '৫০ পর্যন্ত গুনি', description: 'Count objects up to 50', descriptionBn: '৫০ পর্যন্ত বস্তু গুনি', commonCore: ['1.NBT.1'], nctbCode: 'c1-math-1', classNumber: 1, game: 'game-countpop50' },
  { id: 'count-to-100', band: 2, subject: 'math', title: 'Count to 100', titleBn: '১০০ পর্যন্ত গুনি', description: 'Build numbers to 100 by bundling ten-rods and ones', descriptionBn: 'দশের ছড় আর একক জুড়ে ১০০ পর্যন্ত সংখ্যা গঠন করি', commonCore: ['1.NBT.1', '2.NBT.1'], nctbCode: 'c1-math-1', classNumber: 1, game: 'game-count100' },
  { id: 'count-to-999', band: 2, subject: 'math', title: 'Build to 999', titleBn: '৯৯৯ পর্যন্ত গঠন', description: 'Build three-digit numbers with hundred-flats, ten-rods and ones', descriptionBn: 'শতক, দশক আর একক দিয়ে তিন-অঙ্কের সংখ্যা গঠন করি', commonCore: ['2.NBT.1', '2.NBT.3'], nctbCode: 'c2-math-1', classNumber: 2, game: 'game-build999' },
  // …then addition, CONCRETE GAME FIRST, abstract drill LAST:
  { id: 'fruit-tree-add', band: 2, subject: 'math', title: 'Fruit tree addition', titleBn: 'ফলের গাছ যোগ', description: 'Grow fruit on a tree as you add — see addition happen', descriptionBn: 'যোগ করলে গাছে ফল জন্মায় — যোগ করা চোখে দেখা যায়', commonCore: ['1.OA.6'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-fruittree' },
  { id: 'add-within-10', band: 2, subject: 'math', title: 'Add within 10', titleBn: '১০-এর মধ্যে যোগ', description: 'Addition facts with sums to 10 (apples shown)', descriptionBn: 'যোগফল ১০-এর মধ্যে (আপেল দেখিয়ে)', commonCore: ['1.OA.6'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-fruitadd-10' },
  { id: 'sub-within-10', band: 2, subject: 'math', title: 'Subtract within 10', titleBn: '১০-এর মধ্যে বিয়োগ', description: 'Subtraction facts within 10 (apples shown)', descriptionBn: '১০-এর মধ্যে বিয়োগ (আপেল দেখিয়ে)', commonCore: ['1.OA.6'], nctbCode: 'c1-math-5', classNumber: 1, game: 'game-fruitsub-10' },
  { id: 'number-bonds-10', band: 2, subject: 'math', title: 'Number bonds to 10', titleBn: '১০-এর জোড়া সংখ্যা', description: 'Partition numbers to 10 — the backbone of add & sub', descriptionBn: '১০-এর ভাঙা সংখ্যা — যোগ-বিয়োগের ভিত্তি', commonCore: ['K.OA.3', '1.OA.6'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-bnbonds' },
  { id: 'add-within-20', band: 2, subject: 'math', title: 'Add within 20', titleBn: '২০-এর মধ্যে যোগ', description: 'Addition facts with sums to 20 (apples shown)', descriptionBn: 'যোগফল ২০-এর মধ্যে (আপেল দেখিয়ে)', commonCore: ['1.OA.6', '2.OA.2'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-fruitadd-20' },
  { id: 'sub-within-20', band: 2, subject: 'math', title: 'Subtract within 20', titleBn: '২০-এর মধ্যে বিয়োগ', description: 'Subtraction facts within 20 (apples shown)', descriptionBn: '২০-এর মধ্যে বিয়োগ (আপেল দেখিয়ে)', commonCore: ['1.OA.6', '2.OA.2'], nctbCode: 'c1-math-5', classNumber: 1, game: 'game-fruitsub-20' },
  { id: 'add-to-20', band: 2, subject: 'math', title: 'Add to 20', titleBn: '২০-এর মধ্যে যোগ', description: 'Pop balloons with the right sums — abstract speed drill', descriptionBn: 'সঠিক যোগফলের বেলুন ফুটাই — দ্রুত অনুশীলন', commonCore: ['1.OA.6', '2.OA.2'], nctbCode: 'c1-math-4', classNumber: 1, game: 'game-balloonpop' },
  { id: 'bd-taka', band: 2, subject: 'math', title: 'Bangla money', titleBn: 'টাকা চিনি', description: 'Recognize ৳ notes and coins, make amounts, and give change', descriptionBn: '৳ নোট ও কয়েন চিনি, অংক বানাই, ফেরত দিই', commonCore: ['2.MD.8'], nctbCode: 'c1-math-6', classNumber: 1, game: 'game-bdtaka' },
  // Language — STAGE 2: more letters + sounds (mirrored)
  { id: 'bn-benjonborno', band: 2, subject: 'bangla', title: 'Bangla consonants', titleBn: 'ব্যঞ্জনবর্ণ', description: 'Recognize Bangla consonant letters ক খ গ ঘ', descriptionBn: 'বাংলা ব্যঞ্জনবর্ণ ক খ গ ঘ চিনি', commonCore: ['RF.K.1d'], nctbCode: 'c1-bangla-2', classNumber: 1, game: 'game-bnletters' },
  { id: 'bn-colors', band: 2, subject: 'bangla', title: 'Bangla colors', titleBn: 'রঙ চিনি', description: 'Name colors in Bangla (লাল, নীল, সবুজ)', descriptionBn: 'বাংলায় রঙের নাম বলি (লাল, নীল, সবুজ)', commonCore: ['L.K.5a'], nctbCode: 'c1-bangla-4', classNumber: 1, game: 'game-bncolors' },
  { id: 'en-phonics', band: 2, subject: 'english', title: 'Letter sounds', titleBn: 'বর্ণের উচ্চারণ', description: 'First letter sounds (A, B, C)', descriptionBn: 'প্রথম অক্ষরের উচ্চারণ (A, B, C)', commonCore: ['RF.K.3a'], nctbCode: 'c1-english-2', classNumber: 1, game: 'game-enphonics' },
  // Science — heavier / lighter (direct comparison)
  { id: 'heavy-light', band: 2, subject: 'science', title: 'Heavy or light', titleBn: 'ভারী না হালকা', description: 'Which side of the seesaw is heavier?', descriptionBn: 'দোলনার কোন দিক ভারী?', commonCore: ['K.MD.2'], nctbCode: 'c1-science-1', classNumber: 1, game: 'game-balance' },

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
  { id: 'add-sub-regroup', band: 3, subject: 'math', title: 'Carry & Borrow', titleBn: 'ক্যারি ও ধার', description: '3-digit addition and subtraction with carrying and borrowing (written method)', descriptionBn: '৩-অঙ্কের যোগ-বিয়োগ ক্যারি ও ধারসহ (লিখিত পদ্ধতি)', commonCore: ['2.NBT.7', '3.NBT.2'], nctbCode: 'c3-math-5', classNumber: 3, game: 'game-regroup' },
  // Language — STAGE 3: first words (mirrored: BN words then EN CVC)
  { id: 'bn-words', band: 3, subject: 'bangla', title: 'Bangla words', titleBn: 'শব্দ পড়ি', description: 'Read simple Bangla words (মাছ, বাঘ, কলা)', descriptionBn: 'সহজ বাংলা শব্দ পড়ি (মাছ, বাঘ, কলা)', commonCore: ['RF.2.4'], nctbCode: 'c2-bangla-3', classNumber: 2, game: 'game-bnwords' },
  { id: 'bn-family-words', band: 3, subject: 'bangla', title: 'Family words', titleBn: 'পরিবারের শব্দ', description: 'Read Bangla family words (মা, বাবা, ভাই)', descriptionBn: 'পরিবারের বাংলা শব্দ পড়ি (মা, বাবা, ভাই)', commonCore: ['RF.2.4'], nctbCode: 'c2-bangla-4', classNumber: 2, game: 'game-bnwords' },
  { id: 'en-cvc', band: 3, subject: 'english', title: 'CVC words', titleBn: 'ইংরেজি শব্দ', description: 'Read cat, dog, sun, hat', descriptionBn: 'cat, dog, sun, hat পড়ি', commonCore: ['RF.2.3'], nctbCode: 'c2-english-3', classNumber: 2, game: 'game-cvc' },

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
  { id: 'game-bnletters', skillId: 'bn-swaroborno', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-enletters', skillId: 'en-abcs', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bnnumbers', skillId: 'bn-numbers', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  // ── Band 2 counting → concrete add/sub → abstract recap ──
  { id: 'game-countpop50', skillId: 'count-to-50', difficultyLevels: [10, 15, 20, 30, 40, 50], targetSuccess: 0.8 },
  { id: 'game-count100', skillId: 'count-to-100', difficultyLevels: [10, 20, 30, 40, 60, 100], targetSuccess: 0.8 },
  { id: 'game-build999', skillId: 'count-to-999', difficultyLevels: [100, 120, 150, 200, 300, 500], targetSuccess: 0.8 },
  { id: 'game-fruittree', skillId: 'fruit-tree-add', difficultyLevels: [4, 6, 8, 10, 12, 15], targetSuccess: 0.8 },
  { id: 'game-fruitadd-10', skillId: 'add-within-10', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-fruitsub-10', skillId: 'sub-within-10', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bnbonds', skillId: 'number-bonds-10', difficultyLevels: [4, 5, 6, 8, 10, 12], targetSuccess: 0.8 },
  { id: 'game-fruitadd-20', skillId: 'add-within-20', difficultyLevels: [6, 8, 10, 12, 15, 20], targetSuccess: 0.8 },
  { id: 'game-fruitsub-20', skillId: 'sub-within-20', difficultyLevels: [6, 8, 10, 12, 15, 20], targetSuccess: 0.8 },
  { id: 'game-balloonpop', skillId: 'add-to-20', difficultyLevels: [10, 12, 14, 16, 18, 20], targetSuccess: 0.8 },
  { id: 'game-bdtaka', skillId: 'bd-taka', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-bncolors', skillId: 'bn-colors', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-enphonics', skillId: 'en-phonics', difficultyLevels: [3, 4, 5, 6, 7, 8], targetSuccess: 0.8 },
  { id: 'game-balance', skillId: 'heavy-light', difficultyLevels: [5, 6, 8, 10, 12, 14], targetSuccess: 0.8 },
  // ── Band 3 arithmetic: add-sub-100 → mult → div (share then facts) → fractions → time → place value → regroup ──
  { id: 'game-addsub100', skillId: 'add-sub-100', difficultyLevels: [20, 40, 60, 80, 90, 100], targetSuccess: 0.8 },
  { id: 'game-rocketmult', skillId: 'mult-facts-2-5-10', difficultyLevels: [2, 5, 10, 12, 16, 20], targetSuccess: 0.8 },
  { id: 'game-multable', skillId: 'mult-facts-2-10', difficultyLevels: [2, 3, 4, 5, 7, 9], targetSuccess: 0.8 },
  { id: 'game-share', skillId: 'div-facts-fair-share', difficultyLevels: [2, 3, 4, 5, 6, 8], targetSuccess: 0.8 },
  { id: 'game-div-23', skillId: 'div-facts-by-2-3', difficultyLevels: [2, 2, 3, 3, 3, 3], targetSuccess: 0.8 },
  { id: 'game-pizzafrac', skillId: 'fractions-intro', difficultyLevels: [2, 3, 4, 5, 6, 8], targetSuccess: 0.8 },
  { id: 'game-clock', skillId: 'tell-time', difficultyLevels: [1, 2, 3, 4, 5, 6], targetSuccess: 0.8 },
  { id: 'game-placevalue', skillId: 'place-value-1000', difficultyLevels: [3, 4, 4, 4, 4, 4], targetSuccess: 0.8 },
  { id: 'game-regroup', skillId: 'add-sub-regroup', difficultyLevels: [2, 3, 4, 5, 6, 8], targetSuccess: 0.8 },
  { id: 'game-bnwords', skillId: 'bn-words', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
  { id: 'game-cvc', skillId: 'en-cvc', difficultyLevels: [3, 4, 5, 6, 8, 10], targetSuccess: 0.8 },
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
  'game-froghop': 'FrogHop',
  'game-memorypairs': 'MemoryPairs',
  'game-countsong': 'CountingSong',
  'game-bnletters': 'BnLetters',
  'game-bnnumbers': 'BnNumbers',
  'game-enletters': 'EnLetters',
  'game-bnbonds': 'NumberBonds',
  'game-bncolors': 'BnColors',
  'game-bdtaka': 'BdMoney',
  'game-enphonics': 'EnPhonics',
  'game-balloonpop': 'BalloonPop',
  'game-balance': 'Balance',
  'game-addsub100': 'AddSub100',
  'game-clock': 'ClockTime',
  'game-rocketmult': 'RocketMult',
  'game-multable': 'TimesTable',
  'game-share': 'FairShare',
  'game-div-23': 'DivisionFacts',
  'game-regroup': 'Regroup',
  'game-pizzafrac': 'PizzaFrac',
  'game-bnwords': 'BnWords',
  'game-cvc': 'Cvc',
  'game-division': 'DivisionFacts',
  'game-fracmatch': 'FractionMatch',
  'game-placevalue': 'PlaceValue',
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

"""Create tables + seed admin and demo accounts. Runs on API startup."""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import Base, engine, SessionLocal
from .migrations import apply_column_migrations
from .models import Kid, KidSettings, Profile, Skill, Subject, Subscription
from .security import hash_password

log = logging.getLogger("numberverse.seed")

# ── Content catalog (mirrors @numberverse/core SKILLS) ──────────────────────
# The kid app's rounds carry these skill ids. Progress recording enforces a FK
# to `skills`, so the catalog MUST exist or every sync 500s. Idempotent insert:
# nothing is overwritten, entries are only added when missing.
SUBJECTS_SEED = [
    ("math", "Math", "গণিত", 1),
    ("bangla", "Bangla", "বাংলা", 2),
    ("english", "English", "ইংরেজি", 3),
    ("science", "Science", "বিজ্ঞান", 4),
    ("bgs", "Bangladesh & Global Studies", "বাংলাদেশ ও বিশ্বপরিচয়", 5),
    ("ict", "ICT", "আইসিটি", 6),
]

# BRAIN-ALIGNED COURSE INDEX (issue #61) — mirrors @numberverse/core SKILLS.
# Order = sort_order = the kid's learning path. Numbers first (count 1→10→20→
# →50→100), then concrete games, then abstract drills. EN/BN tracks mirrored at
# the same stages (letters → sounds → words → decode → sentences).
SKILLS_SEED: list[tuple[str, int, str, str, str]] = [
    # Band 1 — number sense
    ("count-1-10", 1, "math", "Count to 10", "১ থেকে ১০ গুনি"),
    ("number-song", 1, "math", "Number song", "সংখ্যার গান"),
    ("grow-count", 1, "math", "Plant & count", "বপন ও গণনা"),
    ("quantity-match", 1, "math", "Match numbers", "সংখ্যা মেলানো"),
    ("count-1-20", 1, "math", "Count to 20", "১ থেকে ২০ গুনি"),
    ("number-line", 1, "math", "Number line hops", "সংখ্যা রেখা"),
    ("shapes", 1, "math", "Recognize shapes", "আকার চিনি"),
    ("math-explore-garden", 1, "math", "Explore garden", "বাগান সাজাই"),
    ("trace-digits", 1, "math", "Trace numbers", "সংখ্যা আঁকি"),
    ("odd-even-sort", 1, "math", "Odd & even sort", "জোড়-বিজোড় সাজাই"),
    ("shape-corner-sort", 1, "math", "Corners or not?", "কোণ আছে নাকি নেই?"),
    # Language stage 1 — letters
    ("bn-swaroborno", 1, "bangla", "Bangla vowels", "স্বরবর্ণ"),
    ("vowel-consonant-sort", 1, "bangla", "Vowels & consonants sort", "স্বরবর্ণ ও ব্যঞ্জনবর্ণ সাজাই"),
    ("bn-rhymes", 1, "bangla", "Nursery rhymes", "ছড়ার গান"),
    ("bn-lettersound", 1, "bangla", "Letter sounds", "বর্ণের ধ্বনি"),
    ("bn-time-words", 1, "bangla", "Time words", "কাল-আজ-আগামীকাল"),
    ("bn-direction-words", 1, "bangla", "Direction words", "দিকের শব্দ"),
    ("bn-polite-words", 1, "bangla", "Polite words", "শিষ্টাচার"),
    ("en-abcs", 1, "english", "ABCs", "ইংরেজি বর্ণমালা"),
    ("trace-letters", 1, "english", "Trace letters", "ইংরেজি অক্ষর আঁকি"),
    ("bn-numbers", 1, "bangla", "Bangla numbers", "বাংলা সংখ্যা"),
    ("en-shapes", 1, "english", "Shape names", "আকৃতির নাম"),
    ("en-wordfamilies", 1, "english", "Word families", "শব্দ পরিবার"),
    ("en-yesno", 1, "english", "Yes or no?", "হ্যাঁ নাকি না?"),
    ("ict-tap-drag", 1, "ict", "Tap & drag accuracy", "টিপা-টানা অনুশীলন"),
    ("ict-keyboard", 1, "ict", "Keyboard explorer", "কীবোর্ড এক্সপ্লোরার"),
    ("ict-device-manners", 1, "ict", "Device manners", "ডিভাইসের আদব"),
    ("ict-computer-safety", 3, "ict", "Computer parts & safety", "কম্পিউটার ও নিরাপদ অভ্যাস"),
    ("bgs-professions", 2, "bgs", "Community helpers", "সমাজের সাহায্যকারী"),
    ("bgs-festivals", 2, "bgs", "Our festivals", "আমাদের উৎসব"),
    ("bgs-kindness", 1, "bgs", "Kind heart", "দয়ালু হৃদয়"),
    ("bgs-honesty", 2, "bgs", "Truth star", "সত্যের তারকা"),
    ("bgs-patience", 1, "bgs", "Patience & waiting", "ধৈর্য ও অপেক্ষা"),
    ("bgs-habits", 1, "bgs", "Good habits & hygiene", "ভালো অভ্যাস ও পরিচ্ছন্নতা"),
    # Band 2 — finish numbers, then concrete arithmetic
    ("count-to-50", 2, "math", "Count to 50", "৫০ পর্যন্ত গুনি"),
    ("count-to-100", 2, "math", "Count to 100", "১০০ পর্যন্ত গুনি"),
    ("count-to-999", 2, "math", "Build to 999", "৯৯৯ পর্যন্ত গঠন"),
    ("odd-even", 2, "math", "Odd & even", "জোড় ও বিজোড়"),
    ("shapes-parts", 2, "math", "Shapes: sides & corners", "আকার: বাহু ও কোণ"),
    ("fruit-tree-add", 2, "math", "Fruit tree addition", "ফলের গাছ যোগ"),
    ("add-within-10", 2, "math", "Add within 10", "১০-এর মধ্যে যোগ"),
    ("sub-within-10", 2, "math", "Subtract within 10", "১০-এর মধ্যে বিয়োগ"),
    ("number-bonds-10", 2, "math", "Number bonds to 10", "১০-এর জোড়া সংখ্যা"),
    ("number-bonds-20", 2, "math", "Number bonds to 20", "২০-এর জোড়া সংখ্যা"),
    ("mem-number-bonds", 2, "math", "Number bond memory", "সংখ্যা জোড়ার স্মৃতি"),
    ("add-within-20", 2, "math", "Add within 20", "২০-এর মধ্যে যোগ"),
    ("sub-within-20", 2, "math", "Subtract within 20", "২০-এর মধ্যে বিয়োগ"),
    ("add-to-20", 2, "math", "Add to 20", "২০-এর মধ্যে যোগ"),
    ("en-addfacts", 2, "math", "Add facts to 20", "২০-এর মধ্যে যোগ অনুশীলন"),
    ("en-subfacts", 2, "math", "Subtract facts to 20", "২০-এর মধ্যে বিয়োগ অনুশীলন"),
    ("en-doubles", 2, "math", "Doubles & near-doubles", "দ্বিগুণ ও প্রায় দ্বিগুণ"),
    ("en-maketen", 2, "math", "Making ten", "দশ বানাই"),
    ("en-addregroup", 2, "math", "Carry addition (visual)", "ক্যারি যোগ (দৃশ্য)"),
    ("en-subborrow", 2, "math", "Borrow subtraction (visual)", "ধার বিয়োগ (দৃশ্য)"),
    ("en-array-mult", 2, "math", "Array times tables", "বিন্যাসে গুণ"),
    ("skipcount", 2, "math", "Skip count!", "ধাপে ধাপে!"),
    ("bd-taka", 2, "math", "Bangla money", "টাকা চিনি"),
    ("bn-coin-values", 2, "math", "Coin values", "টাকার চেনা"),
    # Language stage 2 — more letters + sounds
    ("bn-benjonborno", 2, "bangla", "Bangla consonants", "ব্যঞ্জনবর্ণ"),
    ("bn-colors", 2, "bangla", "Bangla colors", "রঙ চিনি"),
    ("bn-sightwords", 2, "bangla", "Bangla sight words", "দেখে বলো শব্দ"),
    ("bn-sentence-builder", 2, "bangla", "Sentence builder", "বাক্য সাজাই"),
    ("bn-word-pairs", 2, "bangla", "Word pairs", "বিপরীত ও সমার্থক"),
    ("bn-compounds", 2, "bangla", "Compound words", "যোগে যোগে শব্দ"),
    ("bn-matra-matrix", 2, "bangla", "Matra matrix", "মাত্রা মিশ্রণ"),
    ("bn-number-words", 2, "bangla", "Number words", "সংখ্যা শব্দ"),
    ("bn-riddle", 2, "bangla", "Riddle time", "ধাঁধা"),
    ("bn-ordinals", 2, "bangla", "Ordinal words", "ক্রমবাচক শব্দ"),
    ("en-phonics", 2, "english", "Letter sounds", "বর্ণের উচ্চারণ"),
    ("en-rcontrolled", 2, "english", "Bossy R", "bossy-R"),
    ("en-magic-e", 2, "english", "Magic E", "জাদুর e"),
    ("en-prepositions", 2, "english", "Prepositions", "অব্যয়"),
    ("en-qwords", 2, "english", "Question words", "প্রশ্নবোধক শব্দ"),
    ("en-story", 2, "english", "Story sequencing", "গল্প সাজানো"),
    ("en-compounds", 2, "english", "Compound words", "যৌগিক শব্দ"),
    ("en-readaloud", 2, "english", "Read & answer", "পড়ে উত্তর দাও"),
    ("en-alphabet", 2, "english", "Alphabet order", "বর্ণানুক্রম"),
    ("data-picto", 3, "math", "Picture charts", "ছবির চার্ট"),
    ("en-digraphs", 2, "english", "Digraph review", "ডাইগ্রাফ পর্যালোচনা"),
    ("en-longvowels", 2, "english", "Vowel teams", "স্বর দল"),
    ("heavy-light", 2, "science", "Heavy or light", "ভারী না হালকা"),
    ("science-sink-float", 2, "science", "Sink or float", "ডুব না ভাসা"),
    ("science-food-chain", 2, "science", "Food chains", "খাদ্য শৃঙ্খল"),
    ("science-food-source", 2, "science", "Food from plants & animals", "খাবারের উৎস"),
    ("science-materials", 2, "science", "Materials", "বস্তুর উপাদান"),
    ("science-day-night", 2, "science", "Day & night", "দিন ও রাত"),
    ("bgs-village-city", 2, "bgs", "Village & city life", "গ্রাম ও শহরের জীবন"),
    # Band 3 — extend arithmetic: two-digit → mult → div (share then facts) → place value → regroup
    ("add-sub-100", 3, "math", "Add & subtract to 100", "১০০-এর মধ্যে যোগ-বিয়োগ"),
    ("mult-facts-2-5-10", 3, "math", "Times tables 2, 5, 10", "২, ৫, ১০ এর নামতা"),
    ("mult-facts-2-10", 3, "math", "Times tables 2–10", "২–১০ এর নামতা"),
    ("div-facts-fair-share", 3, "math", "Fair shares", "সমান ভাগ"),
    ("div-facts-by-2-3", 3, "math", "Divide by 2 and 3", "২ ও ৩ দিয়ে ভাগ"),
    ("en-shares2", 3, "math", "Fair shares 2 (remainders)", "সমান ভাগ ২ (ভাগশেষ)"),
    ("en-fracset", 3, "math", "Fractions of a set", "সমষ্টির ভগ্নাংশ"),
    ("en-mixedfrac", 3, "math", "Mixed numbers & improper fractions", "মিশ্র সংখ্যা ও অপ্রকৃত ভগ্নাংশ"),
    ("en-dectenths", 3, "math", "Decimal tenths", "দশমিকের দশক"),
    ("en-makechange", 3, "math", "Making change (৳ notes)", "টাকা ফেরত (নোট)"),
    ("en-elapsed", 3, "math", "Elapsed time (how long until…)", "সময়ের হিসাব (কতক্ষণ পরে…)"),
    ("math-measure", 3, "math", "Measurement (compare)", "মাপজোক (তুলনা)"),
    ("en-perim", 3, "math", "Perimeter intro", "পরিসীমা শুরু"),
    ("en-solidmatch", 3, "math", "Flat faces & solids", "ভাঁজ ও ঘনবস্তু"),
    ("en-symmetry", 2, "math", "Symmetry mirror", "আয়নার প্রতিসাম্য"),
    ("en-animals-move", 2, "science", "Animal moves", "প্রাণীর চলাফেরা"),
    ("en-plant-life", 2, "science", "Plant life cycle", "গাছের জীবনচক্র"),
    ("science-plants", 2, "science", "Plants: parts & needs", "গাছ: অঙ্গ ও প্রয়োজন"),
    ("en-weather-seasons", 1, "science", "Weather & seasons", "আবহাওয়া ও ঋতু"),
    ("science-living", 1, "science", "Living & non-living", "জীব ও জড়"),
    ("plant-animal-sort", 1, "science", "Plant or animal?", "গাছ নাকি প্রাণী?"),
    ("science-senses", 1, "science", "Five senses", "পাঁচ ইন্দ্রিয়"),
    ("en-light-shadows", 2, "science", "Light & shadows", "আলো ও ছায়া"),
    ("en-magnets", 2, "science", "Magnets", "চুম্বক"),
    ("en-water-cycle", 2, "science", "Water cycle", "পানিচক্র"),
    ("fractions-intro", 3, "math", "Halves and quarters", "অর্ধেক ও চতুর্থাংশ"),
    ("fractions-compare", 3, "math", "Compare & order fractions", "ভগ্নাংশ তুলনা ও সাজানো"),
    ("tell-time", 3, "math", "Tell time", "ঘড়ি পড়া"),
    ("place-value-1000", 3, "math", "Place value to 9,999", "স্থানীয় মান"),
    ("round-nearest-10-100", 3, "math", "Round to 10 & 100", "নিকটতম দশ/শতকে পূর্ণ"),
    ("data-barchart", 3, "math", "Bar chart reading", "বার চার্ট পড়ি"),
    ("add-sub-regroup", 3, "math", "Carry & Borrow", "ক্যারি ও ধার"),
    # Language stage 3 — first words
    ("bn-words", 3, "bangla", "Bangla words", "শব্দ পড়ি"),
    ("bn-conjunct-find", 3, "bangla", "Conjunct speed drill", "যুক্তবর্ণ দ্রুত অনুশীলন"),
    ("bn-matra-words", 3, "bangla", "Matra words", "কার মিশ্রণ"),
    ("mem-bangla-matra", 3, "bangla", "Matra memory", "মাত্রার স্মৃতি"),
    ("bn-family-words", 3, "bangla", "Family words", "পরিবারের শব্দ"),
    ("bn-story-read", 3, "bangla", "Story comprehension", "ছোট গল্প পড়ি"),
    ("bn-punctuation", 3, "bangla", "Punctuation", "যতি চিহ্ন"),
    ("bn-read-story", 3, "bangla", "Read a story", "গল্প পড়ি"),
    ("bn-idioms", 3, "bangla", "Simple idioms", "সহজ বাগধারা"),
    ("bn-verbgender", 3, "bangla", "Verb match", "ক্রিয়া মেলাই"),
    ("bn-classifiers", 3, "bangla", "Word fit", "শব্দ বসাও"),
    ("en-cvc", 3, "english", "CVC words", "ইংরেজি শব্দ"),
    ("en-contractions", 3, "english", "Contractions", "সংকোচন শব্দ"),
    ("en-compare", 3, "english", "Big, Bigger, Biggest", "বড়, বড়ো, সবচেয়ে বড়"),
    ("en-synant", 3, "english", "Same or opposite?", "একই নাকি বিপরীত?"),
    ("en-irregulars", 3, "english", "Make it plural!", "বহুবচন বানাও!"),
    ("en-pasttense", 3, "english", "Past time!", "অতীত কাল!"),
    ("mem-compound-words", 3, "english", "Compound memory", "যৌগিক শব্দের স্মৃতি"),
    # Band 4 — advanced operations
    ("division-facts", 4, "math", "Division facts", "ভাগ করা"),
    ("fractions-equiv", 4, "math", "Equivalent fractions", "সমান ভগ্নাংশ"),
    ("bn-matras", 4, "bangla", "Bangla matras", "কার"),
    ("en-sightwords", 4, "english", "Sight words", "দেখা-শব্দ"),
    ("mem-synonyms", 4, "english", "Synonym memory", "সমার্থক শব্দের স্মৃতি"),
    ("science-animals", 4, "science", "Animal homes", "প্রাণী ও আবাস"),
    ("bgs-our-country", 4, "bgs", "Our country", "আমাদের দেশ"),
    ("bgs-good-citizens", 4, "bgs", "Good citizens", "ভালো নাগরিক"),
    # Band 5
    ("decimals-intro", 5, "math", "Decimals", "দশমিক"),
    ("percent-intro", 5, "math", "Percent of a number", "শতকরা"),
    ("area-perimeter", 5, "math", "Area & perimeter", "ক্ষেত্রফল ও পরিসীমা"),
    ("bn-sentences", 5, "bangla", "Bangla sentences", "বাক্য গঠন"),
    ("en-grammar", 5, "english", "Nouns & verbs", "বিশেষ্য ও ক্রিয়া"),
    ("bgs-bangladesh", 5, "bgs", "Bangladesh facts", "বাংলাদেশ পরিচিতি"),
    ("ict-online-safety", 5, "ict", "Online safety", "অনলাইন নিরাপত্তা"),
    ("science-states-matter", 5, "science", "States of matter", "পদার্থের অবস্থা"),
    ("en-comprehension", 5, "english", "Read & understand", "পড়ে বুঝি"),
    # Band 6 — Jungle Canopy (fluency)
    ("mult-fluency-6-9", 6, "math", "Times tables 6–9", "৬–৯ এর নামতা"),
    ("divide-within-100", 6, "math", "Divide within 100", "১০০-এর মধ্যে ভাগ"),
    ("fraction-read", 6, "math", "Read fractions", "ভগ্নাংশ পড়ি"),
    ("clock-minute", 6, "math", "Tell time to the minute", "মিনিট ধরে ঘড়ি পড়ি"),
    ("bn-conjuncts", 6, "bangla", "Bangla conjuncts", "যুক্তবর্ণ"),
    ("en-paragraph", 6, "english", "Paragraph power", "অনুচ্ছেদ পড়ি"),
    ("science-human-body", 6, "science", "Human body", "মানবদেহ"),
    ("alg-missing-number", 6, "math", "Missing numbers", "অজানা সংখ্যা খুঁজি"),
    ("neg-compare-order", 6, "math", "Compare negative numbers", "ঋণাত্মক সংখ্যা তুলনা"),
    ("ratio-simplify", 6, "math", "Simplify ratios", "অনুপাত ছোট করি"),
    ("geo-perimeter", 6, "math", "Perimeter: rectangles & triangles", "পরিসীমা: আয়তক্ষেত্র ও ত্রিভুজ"),
    ("prob-words", 6, "math", "Probability words", "সম্ভাবনার শব্দ"),
    # #1142 — fast-round fact fluency (ArcadeCatch)
    ("facts-fast-add", 6, "math", "Fast add facts", "দ্রুত যোগ"),
    ("facts-fast-sub", 6, "math", "Fast subtract facts", "দ্রুত বিয়োগ"),
    ("facts-fast-mult", 6, "math", "Fast times tables", "দ্রুত নামতা"),
    ("facts-fast-div", 6, "math", "Fast division facts", "দ্রুত ভাগ"),
    # #1161 — band 6 science/english/ict breadth
    ("science-forces-energy", 6, "science", "Forces & energy", "বল ও শক্তি"),
    ("science-ecosystems", 6, "science", "Ecosystems: food chains", "বাস্তুতন্ত্র: খাদ্য শৃঙ্খল"),
    ("science-body-depth", 6, "science", "Human body: organ jobs", "মানবদেহ: অঙ্গের কাজ"),
    ("en-read-inference", 6, "english", "Reading: infer & predict", "পড়া: অনুমান ও ভবিষ্যদ্বাণী"),
    ("en-grammar-past-depth", 6, "english", "Irregular past tense", "অনিয়মিত অতীত কাল"),
    ("en-paragraph-order", 6, "english", "Order a paragraph", "অনুচ্ছেদ সাজাই"),
    ("ict-digital-literacy", 6, "ict", "Digital literacy", "ডিজিটাল সাক্ষরতা"),
    ("ict-code-blocks", 6, "ict", "What does this block do?", "এই ব্লকটি কী করে?"),
    # Band 7 — Polar Peaks (refinement)
    ("decimals-tenths", 7, "math", "Decimal tenths", "দশমিকের দশক"),
    ("percent-of-number", 7, "math", "Percent of a number", "সংখ্যার শতকরা"),
    ("fraction-simplify", 7, "math", "Simplify fractions", "ভগ্নাংশ ছোট করি"),
    ("bgs-heritage", 7, "bgs", "Bangladesh heritage", "বাংলাদেশের ঐতিহ্য"),
    ("en-sentence-order", 7, "english", "Sentence order", "বাক্য সাজাই"),
    ("science-body-systems", 7, "science", "Body systems", "অঙ্গতন্ত্র"),
    ("alg-one-step", 7, "math", "One-step equations", "এক ধাপের সমীকরণ"),
    ("neg-number-line-add", 7, "math", "Add negatives on a number line", "সংখ্যারেখায় ঋণাত্মক যোগ"),
    ("ratio-equivalent", 7, "math", "Equivalent ratios", "সমান অনুপাত"),
    ("ratio-unit-rate", 7, "math", "Unit rates", "একক দর"),
    ("geo-symmetry", 7, "math", "Symmetry mirror", "আয়নার প্রতিসাম্য"),
    ("stats-mean-mode", 7, "math", "Mean, mode & median", "গড়, প্রচুরক ও মধ্যমা"),
    # #1161 — band 7 science/english/ict depth
    ("science-energy-transfer", 7, "science", "Energy types & transfer", "শক্তির ধরন ও প্রবাহ"),
    ("science-ecosystems-depth", 7, "science", "Food webs & niches", "খাদ্য জাল ও নিচ"),
    ("science-body-systems-depth", 7, "science", "Body systems: what they do", "অঙ্গতন্ত্র: এদের কাজ"),
    ("en-read-critical", 7, "english", "Reading: main idea", "পড়া: মূল ভাব"),
    ("en-grammar-irregulars-depth", 7, "english", "Irregular plurals", "অনিয়মিত বহুবচন"),
    ("ict-digital-citizenship", 7, "ict", "Digital citizenship", "ডিজিটাল নাগরিকত্ব"),
    ("ict-code-steps", 7, "ict", "Order the steps", "ধাপ সাজাই"),
    # Band 8 — Summit Peaks (class 8, ages 13–16)
    ("alg-two-step", 8, "math", "Two-step equations", "দুই ধাপের সমীকরণ"),
    ("neg-arith", 8, "math", "Negative number arithmetic", "ঋণাত্মক সংখ্যার হিসাব"),
    ("percent-change", 8, "math", "Percentage change", "শতকরা পরিবর্তন"),
    ("geo-volume-angles", 8, "math", "Angles & volume", "কোণ ও আয়তন"),
    ("stats-larger-sets", 8, "math", "Statistics: larger sets", "পরিসংখ্যান: বড় সেট"),
    ("science-forces-depth", 8, "science", "Forces & energy depth", "বল ও শক্তির গভীরতা"),
    ("science-ecosystems-8", 8, "science", "Ecosystems: energy & cycles", "বাস্তুতন্ত্র: শক্তি ও চক্র"),
    ("science-body-systems-8", 8, "science", "Body systems: working together", "অঙ্গতন্ত্র: একসাথে কাজ"),
    ("en-read-evaluate", 8, "english", "Reading: evaluate & compare", "পড়া: মূল্যায়ন ও তুলনা"),
    ("en-grammar-adjectives", 8, "english", "Adjectives & adverbs", "বিশেষণ ও ক্রিয়াবিশেষণ"),
    ("ict-code-debug", 8, "ict", "Code logic: find & fix", "কোড যুক্তি: খুঁজে ঠিক করি"),
    ("bgs-economics-8", 8, "bgs", "Bangladesh economy & civics", "বাংলাদেশের অর্থনীতি ও নাগরিকতা"),
    # 2026 backlog content (#43, #44, #48, #49)
    ("bn-days-months", 1, "bangla", "Days & months", "সপ্তাহ ও মাস"),
    ("bn-spelling", 1, "bangla", "Bangla spelling", "বানান শিখি"),
    ("bn-spell-type", 1, "bangla", "Spell by typing", "টাইপ করে বানান"),
    ("bn-pronouns", 3, "bangla", "Bangla pronouns", "সর্বনাম"),
    ("count-back-100", 2, "math", "Count back from 100", "উল্টো গোনা"),
    # 2026 backlog content (#51, #53, #54, #56)
    ("en-cvc-build", 1, "english", "Build CVC words", "শব্দ গড়ি"),
    ("en-plurals-regular", 2, "english", "Plurals: -s -es -ies", "বহুবচন: -s -es -ies"),
    ("en-past-ed", 3, "english", "Past tense: -ed", "অতীত কাল: -ed"),
    ("en-case-match", 1, "english", "Big & small letters", "বড়-ছোট অক্ষর"),
]


async def seed_content(db: AsyncSession) -> None:
    for sid, title_en, title_bn, order in SUBJECTS_SEED:
        if not await db.get(Subject, sid):
            db.add(Subject(id=sid, title_en=title_en, title_bn=title_bn, sort_order=order))
    for order, (sid, band, subject, title, title_bn) in enumerate(SKILLS_SEED, start=1):
        if not await db.get(Skill, sid):
            db.add(
                Skill(
                    id=sid,
                    band=band,
                    subject=subject,
                    title=title,
                    title_bn=title_bn,
                    sort_order=order,
                )
            )
    await db.flush()
    log.info("Content catalog seeded (%d subjects, %d skills)", len(SUBJECTS_SEED), len(SKILLS_SEED))


async def create_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # #388 — create_all never alters an existing table to add a new COLUMN, so
    # a model change silently breaks the API on an old DB (the `aggregate_opt_in`
    # 502 outage). Diff + ADD COLUMN IF NOT EXISTS for anything missing.
    await apply_column_migrations()


async def _ensure_profile(db: AsyncSession, email: str, password: str, display_name: str, is_admin: bool) -> Profile:
    existing = await db.scalar(select(Profile).where(Profile.email == email))
    if existing:
        return existing
    profile = Profile(
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
        is_admin=is_admin,
    )
    db.add(profile)
    await db.flush()
    log.info("Created profile %s (admin=%s)", email, is_admin)
    return profile


async def seed() -> None:
    async with SessionLocal() as db:
        await seed_content(db)

        # #842 — dev-only default admin password. In non-dev environments the
        # config startup guard refuses to boot unless NV_ADMIN_PASSWORD is set,
        # so this default only ever seeds during local dev/test runs. Deliberately
        # NOT a random per-restart password — that would lock the console out.
        admin = await _ensure_profile(
            db, settings.admin_email, settings.admin_password, "Numberverse Admin", True
        )
        demo = await _ensure_profile(db, "demo@numberverse.dev", "demo1234", "Demo Parent", False)

        # Demo kid for the parent portal
        kids = await db.scalars(select(Kid).where(Kid.profile_id == demo.id))
        if not kids.first():
            kid = Kid(profile_id=demo.id, name="Aria", avatar="🦊", birth_year=2021)
            db.add(kid)
            await db.flush()
            log.info("Created demo kid Aria")

        # Demo parent controls — everything on, 30-min daily cap so the portal's
        # settings panel has something real to show.
        demo_kid = await db.scalar(select(Kid).where(Kid.profile_id == demo.id))
        if demo_kid and not await db.get(KidSettings, demo_kid.id):
            db.add(
                KidSettings(
                    kid_id=demo_kid.id,
                    enabled_subjects=None,  # all subjects
                    max_band=None,  # no cap
                    daily_limit_min=30,
                    tts_enabled=True,
                    music_enabled=True,
                )
            )
            log.info("Created demo kid settings (30-min daily cap)")

        # Demo subscription for the demo parent
        subs = await db.scalars(select(Subscription).where(Subscription.profile_id == demo.id))
        if not subs.first():
            db.add(Subscription(profile_id=demo.id, plan="plus", store="web", status="active"))
            log.info("Created demo plus subscription")

        await db.commit()

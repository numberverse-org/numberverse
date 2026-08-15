"""Create tables + seed admin and demo accounts. Runs on API startup."""
import logging

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import Base, engine, SessionLocal
from .migrations import apply_migrations
from .models import Kid, KidSettings, Profile, Skill, Subject, Subscription
from .security import hash_password, verify_password

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
SKILLS_SEED: list[tuple[str, int, str, str, str, str, int, str]] = [
    # Band 1 — number sense
    ("count-1-10", 1, "math", "Count to 10", "১ থেকে ১০ গুনি", "c1-math-1", 1, "Count objects 1 to 10 in sequence"),
    ("number-song", 1, "math", "Number song", "সংখ্যার গান", "c1-math-7", 1, "Sing and play the counting melody with Nova"),
    ("grow-count", 1, "math", "Plant & count", "বপন ও গণনা", "c1-math-8", 1, "Plant seeds and watch a sprout grow — counting with a living reward"),
    ("quantity-match", 1, "math", "Match numbers", "সংখ্যা মেলানো", "c1-math-9", 1, "Match numerals to fruit counts in a memory game"),
    ("count-1-20", 1, "math", "Count to 20", "১ থেকে ২০ গুনি", "c1-math-10", 1, "Count objects up to 20"),
    ("number-line", 1, "math", "Number line hops", "সংখ্যা রেখা", "c1-math-2", 1, "Hop a frog along the number line to the target number"),
    ("shapes", 1, "math", "Recognize shapes", "আকার চিনি", "c1-math-3", 1, "Identify circle, square, triangle, star"),
    ("math-explore-garden", 1, "math", "Explore garden", "বাগান সাজাই", "c1-math-19", 1, "Free-play counting and shape garden — plant and explore with no pressure"),
    ("trace-digits", 1, "math", "Trace numbers", "সংখ্যা আঁকি", "c1-math-20", 1, "Trace digits 0–9 with a finger — the first step to writing numbers"),
    ("odd-even-sort", 1, "math", "Odd & even sort", "জোড়-বিজোড় সাজাই", "c1-math-21", 1, "Drag number cards into the odd or even bin"),
    ("shape-corner-sort", 1, "math", "Corners or not?", "কোণ আছে নাকি নেই?", "c1-math-22", 1, "Drag flat shapes into has-corners or no-corners bins"),
    # Language stage 1 — letters
    ("bn-swaroborno", 1, "bangla", "Bangla vowels", "স্বরবর্ণ", "c1-bangla-1", 1, "Recognize Bangla vowel letters অ আ ই ঈ উ ঊ"),
    ("vowel-consonant-sort", 1, "bangla", "Vowels & consonants sort", "স্বরবর্ণ ও ব্যঞ্জনবর্ণ সাজাই", "c1-bangla-13", 1, "Drag Bangla letters into the vowel or consonant bin"),
    ("bn-rhymes", 1, "bangla", "Nursery rhymes", "ছড়ার গান", "c1-bangla-5", 1, "Recite classic NCTB Bangla rhymes, tapping along word by word"),
    ("bn-lettersound", 1, "bangla", "Letter sounds", "বর্ণের ধ্বনি", "c1-bangla-3", 1, "Hear a letter sound, tap the matching Bangla letter (ক/খ, প/ফ, স/শ)"),
    ("bn-time-words", 1, "bangla", "Time words", "কাল-আজ-আগামীকাল", "c1-bangla-6", 1, "Order গতকাল → আজ → আগামীকাল on a calendar timeline"),
    ("bn-direction-words", 1, "bangla", "Direction words", "দিকের শব্দ", "c1-bangla-7", 1, "Follow spoken direction words to move a character on a grid"),
    ("bn-polite-words", 1, "bangla", "Polite words", "শিষ্টাচার", "c1-bangla-8", 1, "Tap the polite reply (ধন্যবাদ, দয়া করে, দুঃখিত) for everyday scenarios"),
    ("en-abcs", 1, "english", "ABCs", "ইংরেজি বর্ণমালা", "c1-english-1", 1, "Recognize uppercase letters A–F"),
    ("trace-letters", 1, "english", "Trace letters", "ইংরেজি অক্ষর আঁকি", "c1-english-8", 1, "Trace capital letters with a finger — the first step to handwriting"),
    ("bn-numbers", 1, "bangla", "Bangla numbers", "বাংলা সংখ্যা", "c1-bangla-2", 1, "Hear and recognize Bangla numerals ০–৯"),
    ("en-shapes", 1, "english", "Shape names", "আকৃতির নাম", "c1-english-3", 1, "English names of shapes (circle, square, triangle)"),
    ("en-wordfamilies", 1, "english", "Word families", "শব্দ পরিবার", "c1-english-4", 1, "Sort words into rhyming families (-at, -an, -ig, -op)"),
    ("en-yesno", 1, "english", "Yes or no?", "হ্যাঁ নাকি না?", "c1-english-5", 1, "Hear a sentence and a question; tap YES or NO (slow-replay button)"),
    ("ict-tap-drag", 1, "ict", "Tap & drag accuracy", "টিপা-টানা অনুশীলন", "c1-ict-1", 1, "Tap the bugs, drag the butterfly into the net"),
    ("ict-keyboard", 1, "ict", "Keyboard explorer", "কীবোর্ড এক্সপ্লোরার", "c1-ict-2", 1, "Find letters and numbers on a friendly on-screen keyboard"),
    ("ict-device-manners", 1, "ict", "Device manners", "ডিভাইসের আদব", "c1-ict-3", 1, "Turn a device on and off safely and wait patiently"),
    ("ict-computer-safety", 3, "ict", "Computer parts & safety", "কম্পিউটার ও নিরাপদ অভ্যাস", "c3-ict-1", 3, "Tap computer parts and sort safe, offline-first habits"),
    ("bgs-professions", 2, "bgs", "Community helpers", "সমাজের সাহায্যকারী", "c2-bgs-2", 2, "Match 12 community helpers to their tools"),
    ("bgs-festivals", 2, "bgs", "Our festivals", "আমাদের উৎসব", "c2-bgs-3", 2, "Sort Pohela Boishakh and Eid customs and items"),
    ("bgs-kindness", 1, "bgs", "Kind heart", "দয়ালু হৃদয়", "c1-bgs-2", 1, "Choose kind responses in everyday situations"),
    ("bgs-honesty", 2, "bgs", "Truth star", "সত্যের তারকা", "c2-bgs-4", 2, "Choose the truthful response in everyday situations — no shame, just soft encouragement"),
    ("bgs-patience", 1, "bgs", "Patience & waiting", "ধৈর্য ও অপেক্ষা", "c1-bgs-1", 1, "Wait for the reward — patience pays"),
    ("bgs-habits", 1, "bgs", "Good habits & hygiene", "ভালো অভ্যাস ও পরিচ্ছন্নতা", "c1-bgs-3", 1, "Sort healthy habits — brushing, washing hands, sharing — with gentle encouragement"),
    # Band 2 — finish numbers, then concrete arithmetic
    ("count-to-50", 2, "math", "Count to 50", "৫০ পর্যন্ত গুনি", "c1-math-11", 1, "Count objects up to 50"),
    ("count-to-100", 2, "math", "Count to 100", "১০০ পর্যন্ত গুনি", "c1-math-12", 1, "Build numbers to 100 by bundling ten-rods and ones"),
    ("count-to-999", 2, "math", "Build to 999", "৯৯৯ পর্যন্ত গঠন", "c2-math-1", 2, "Build three-digit numbers with hundred-flats, ten-rods and ones"),
    ("odd-even", 2, "math", "Odd & even", "জোড় ও বিজোড়", "c2-math-2", 2, "Sort numbers into odd and even by pairing the dots"),
    ("shapes-parts", 2, "math", "Shapes: sides & corners", "আকার: বাহু ও কোণ", "c2-math-6", 2, "Count sides and corners of drawn shapes (triangle 3, square 4, rectangle 4, pentagon 5, hexagon 6, circle 0)"),
    ("fruit-tree-add", 2, "math", "Fruit tree addition", "ফলের গাছ যোগ", "c1-math-4", 1, "Grow fruit on a tree as you add — see addition happen (tier 1 of Add to 20)"),
    ("add-within-10", 2, "math", "Add within 10", "১০-এর মধ্যে যোগ", "c1-math-13", 1, "Addition facts with sums to 10 (apples shown)"),
    ("sub-within-10", 2, "math", "Subtract within 10", "১০-এর মধ্যে বিয়োগ", "c1-math-5", 1, "Subtraction facts within 10 (apples shown)"),
    ("number-bonds-10", 2, "math", "Number bonds to 10", "১০-এর জোড়া সংখ্যা", "c1-math-14", 1, "Partition numbers to 10 — the backbone of add & sub"),
    ("number-bonds-20", 2, "math", "Number bonds to 20", "২০-এর জোড়া সংখ্যা", "c1-math-15", 1, "Partition numbers to 20 with double ten-frames"),
    ("mem-number-bonds", 2, "math", "Number bond memory", "সংখ্যা জোড়ার স্মৃতি", "c2-math-16", 2, "Flip hidden cards to recall the two numbers that make 10 (3 + 7)"),
    ("add-within-20", 2, "math", "Add within 20", "২০-এর মধ্যে যোগ", "c1-math-16", 1, "Addition facts with sums to 20 (apples shown)"),
    ("sub-within-20", 2, "math", "Subtract within 20", "২০-এর মধ্যে বিয়োগ", "c1-math-18", 1, "Subtraction facts within 20 (apples shown)"),
    ("add-to-20", 2, "math", "Balloon sums to 20", "বেলুন ফুটিয়ে যোগ", "c1-math-17", 1, "Pop balloons with the right sums — abstract speed drill"),
    ("en-addfacts", 2, "math", "Add facts to 20", "২০-এর মধ্যে যোগ অনুশীলন", "c2-math-15", 2, "Rapid-fire addition facts to 20 with speed + accuracy tracking (top tier of Add to 20)"),
    ("en-subfacts", 2, "math", "Subtract facts to 20", "২০-এর মধ্যে বিয়োগ অনুশীলন", "c2-math-7", 2, "Rapid-fire subtraction facts to 20 with a number-line hop and speed + accuracy tracking (timed tier of Subtract within 20)"),
    ("en-doubles", 2, "math", "Doubles & near-doubles", "দ্বিগুণ ও প্রায় দ্বিগুণ", "c2-math-8", 2, "Learn doubles facts with a spoken chant and dot arrays, then solve near-doubles as double + 1"),
    ("en-maketen", 2, "math", "Making ten", "দশ বানাই", "c2-math-9", 2, "Compose ten inside ten-frames, then bridge to teen sums with the leftover"),
    ("en-addregroup", 2, "math", "Carry addition (visual)", "ক্যারি যোগ (দৃশ্য)", "c2-math-10", 2, "Add two 2-digit numbers step by step with base-10 blocks and a regroup animation"),
    ("en-subborrow", 2, "math", "Borrow subtraction (visual)", "ধার বিয়োগ (দৃশ্য)", "c2-math-11", 2, "Subtract two 2-digit numbers step by step with base-10 blocks and a borrow animation"),
    ("en-array-mult", 2, "math", "Array times tables", "বিন্যাসে গুণ", "c2-math-12", 2, "Match a dot array (rows × columns) to its equation — tables 2 to 5 (the concrete array intro to the times tables)"),
    ("skipcount", 2, "math", "Skip count!", "ধাপে ধাপে!", "c2-math-13", 2, "Continue +3 and +4 sequences on a number line — tap the next number"),
    ("bd-taka", 2, "math", "Taka notes & change", "টাকার নোট ও ফেরত", "c1-math-6", 1, "Recognize taka coins and notes, make amounts, and give change"),
    ("bn-coin-values", 2, "math", "Coin values", "পয়সা চিনি", "c2-math-5", 2, "Recognize ৳1/৳2/৳5 coins and count small totals (tier 2 of Money)"),
    # Language stage 2 — more letters + sounds
    ("bn-benjonborno", 2, "bangla", "Bangla consonants", "ব্যঞ্জনবর্ণ", "c1-bangla-11", 1, "Recognize Bangla consonant letters ক খ গ ঘ"),
    ("bn-colors", 2, "bangla", "Bangla colors", "রঙ চিনি", "c1-bangla-4", 1, "Name colors in Bangla (লাল, নীল, সবুজ)"),
    ("bn-sightwords", 2, "bangla", "Bangla sight words", "দেখে বলো শব্দ", "c2-bangla-5", 2, "Read short high-frequency Bangla words on sight (আমি, তুমি, সে, না)"),
    ("bn-sentence-builder", 2, "bangla", "Sentence builder", "বাক্য সাজাই", "c2-bangla-6", 2, "Arrange colored tiles into a simple subject-verb-object sentence"),
    ("bn-word-pairs", 2, "bangla", "Word pairs", "বিপরীত ও সমার্থক", "c2-bangla-7", 2, "Match opposite (বিপরীত) and same-meaning (সমার্থক) Bangla words"),
    ("bn-compounds", 2, "bangla", "Bangla compound words", "যোগে যোগে শব্দ", "c2-bangla-8", 2, "Tap the two small words that join to make a new Bangla word (গোলাপ + ফুল = গোলাপফুল)"),
    ("bn-matra-matrix", 2, "bangla", "Matra matrix", "মাত্রা মিশ্রণ", "c2-bangla-9", 2, "Complete real words by picking the right matra (ক + ◻ + টা = কাটা)"),
    ("bn-number-words", 2, "bangla", "Number words", "সংখ্যা শব্দ", "c2-bangla-10", 2, "Match Bangla number words to digits 1-100 (একুশ → 21)"),
    ("bn-riddle", 2, "bangla", "Riddle time", "ধাঁধা", "c2-bangla-11", 2, "Solve short spoken riddles by tapping the picture answer (কলা, কুকুর, রংধনু…)"),
    ("bn-ordinals", 2, "bangla", "Ordinal words", "ক্রমবাচক শব্দ", "c2-bangla-12", 2, "Tap the runner in the position named by the Bangla ordinal word (প্রথম, দ্বিতীয়, তৃতীয়…)"),
    ("en-phonics", 2, "english", "First letter sounds", "বর্ণের উচ্চারণ", "c1-english-2", 1, "First letter sounds (A, B, C)"),
    ("en-rcontrolled", 2, "english", "Bossy R", "bossy-R", "c2-english-4", 2, "Hear car/turn/bird, pick the right bossy-R spelling (ar er ir or ur)"),
    ("en-magic-e", 2, "english", "Magic E", "জাদুর e", "c2-english-5", 2, "Add the magic e to flip short vowels long (cap → cape, kit → kite)"),
    ("en-prepositions", 2, "english", "Prepositions", "অব্যয়", "c2-english-6", 2, "Drag an object to the spoken place: in, on, under, behind, in front of, next to, above, between"),
    ("en-qwords", 2, "english", "Question words", "প্রশ্নবোধক শব্দ", "c2-english-7", 2, "Fill the blank with the right question word (who, what, where, when, why, how, whose)"),
    ("en-story", 2, "english", "Story sequencing", "গল্প সাজানো", "c2-english-8", 2, "Drag the picture cards into story order (first, then, last)"),
    ("en-compounds", 2, "english", "Compound words", "যৌগিক শব্দ", "c2-english-9", 2, "Tap the two halves that build the compound word (rain + bow = rainbow)"),
    ("en-readaloud", 2, "english", "Read & answer", "পড়ে উত্তর দাও", "c2-english-10", 2, "Read a short sentence aloud, then tap the picture that answers the question"),
    ("en-alphabet", 2, "english", "Alphabet order", "বর্ণানুক্রম", "c2-english-11", 2, "Drag the words into alphabetical (ABC) order — each card glows green when it is home"),
    ("data-picto", 3, "math", "Picture charts", "ছবির চার্ট", "c3-math-7", 3, "Read pictographs where one picture = 2, 5 or 10 and answer how-many questions"),
    ("en-digraphs", 2, "english", "Digraph review", "ডাইগ্রাফ পর্যালোচনা", "c2-english-12", 2, "Hear ship/chair/three/whale/phone and tap the digraph that makes the word (sh ch th wh ph)"),
    ("en-longvowels", 2, "english", "Vowel teams", "স্বর দল", "c2-english-13", 2, "Hear rain/play/tree/sea/boat/snow/pie/night and tap the long-vowel team that makes the word (ai ay ee ea oa ow ie igh)"),
    ("heavy-light", 2, "science", "Heavy or light", "ভারী না হালকা", "c1-science-1", 1, "Which side of the seesaw is heavier?"),
    ("science-sink-float", 2, "science", "Sink or float", "ডুব না ভাসা", "c2-science-3", 2, "Predict whether objects sink or float, then check in water"),
    ("science-food-chain", 2, "science", "Food chains", "খাদ্য শৃঙ্খল", "c2-science-4", 2, "Order simple food chains — who eats whom"),
    ("science-food-source", 2, "science", "Food from plants & animals", "খাবারের উৎস", "c2-science-12", 2, "Sort foods by where they come from — plants or animals"),
    ("science-materials", 2, "science", "Materials", "বস্তুর উপাদান", "c2-science-13", 2, "Sort everyday objects by material — wood, metal, plastic, glass"),
    ("science-day-night", 2, "science", "Day & night", "দিন ও রাত", "c2-science-5", 2, "Spin the Earth and see why day and night happen"),
    ("bgs-village-city", 2, "bgs", "Village & city life", "গ্রাম ও শহরের জীবন", "c2-bgs-1", 2, "Sort scenes — village or city?"),
    # Band 3 — extend arithmetic: two-digit → mult → div (share then facts) → place value → regroup
    ("add-sub-100", 3, "math", "Add & subtract to 100", "১০০-এর মধ্যে যোগ-বিয়োগ", "c2-math-4", 2, "Two-digit addition and subtraction"),
    ("mult-facts-2-5-10", 3, "math", "Times tables 2, 5, 10", "২, ৫, ১০ এর নামতা", "c3-math-2", 3, "Multiplication facts for 2, 5, 10 (first fact tier of the times-table ladder)"),
    ("mult-facts-2-10", 3, "math", "Times tables 2–10", "২–১০ এর নামতা", "c3-math-19", 3, "Multiplication facts 2×…10× taught with concrete arrays first"),
    ("div-facts-fair-share", 3, "math", "Fair shares", "সমান ভাগ", "c3-math-4", 3, "Division taught by fair-sharing (12 ÷ 3 = share 12 into 3)"),
    ("div-facts-by-2-3", 3, "math", "Divide by 2 and 3", "২ ও ৩ দিয়ে ভাগ", "c3-math-21", 3, "Division facts with divisors 2 and 3 (first tier of Division facts)"),
    ("en-shares2", 3, "math", "Fair shares 2 (remainders)", "সমান ভাগ ২ (ভাগশেষ)", "c3-math-8", 3, "Watch candies share round-robin into plates, then find each share and the leftover (tier 2 of Fair shares)"),
    ("en-fracset", 3, "math", "Fractions of a set", "সমষ্টির ভগ্নাংশ", "c3-math-9", 3, "Find a fraction of a group by tapping the right number of fruits (1/2 of 8)"),
    ("en-mixedfrac", 3, "math", "Mixed numbers & improper fractions", "মিশ্র সংখ্যা ও অপ্রকৃত ভগ্নাংশ", "c3-math-10", 3, "See 1½ on a bar and a number line, then match it to its improper fraction 3/2"),
    ("en-dectenths", 3, "math", "Decimal tenths", "দশমিকের দশক", "c3-math-11", 3, "Read a shaded 10-cell strip as a decimal (0.3) and build one by shading cells (tenths — tier 1 of Decimals)"),
    ("en-makechange", 3, "math", "Making change (৳ notes)", "টাকা ফেরত (নোট)", "c3-math-12", 3, "Pay with a ৳50/৳100 note and compute the change, then make exact amounts by tapping ৳5/10/20/50 (top tier of Money)"),
    ("en-elapsed", 3, "math", "Elapsed time (how long until…)", "সময়ের হিসাব (কতক্ষণ পরে…)", "c3-math-13", 3, "Watch an analog clock and find how many minutes until the digital target time"),
    ("math-measure", 3, "math", "Measurement (compare)", "মাপজোক (তুলনা)", "c3-math-16", 3, "Tap the longer, heavier or larger — comparing cm/m, kg/g and L/mL"),
    ("en-perim", 3, "math", "Perimeter intro", "পরিসীমা শুরু", "c3-math-14", 3, "Count/add the unit-cube fence around a rectangle (4 sides) or right triangle (3 sides)"),
    ("en-solidmatch", 3, "math", "Flat faces & solids", "ভাঁজ ও ঘনবস্তু", "c3-math-15", 3, "Match flat faces to their solid — square→cube, rectangle→cuboid, circle→cylinder, triangle→pyramid — on rotating 3D previews"),
    ("en-symmetry", 2, "math", "Symmetry mirror", "আয়নার প্রতিসাম্য", "c3-math-18", 3, "Complete the mirror half of a picture across the fold line (heart, tree, butterfly, house…)"),
    ("en-animals-move", 2, "science", "Animal moves", "প্রাণীর চলাফেরা", "c2-science-6", 2, "Sort animals by how they move — fly, swim, crawl, walk (bee, fish, snake, elephant…)"),
    ("en-plant-life", 2, "science", "Plant life cycle", "গাছের জীবনচক্র", "c2-science-7", 2, "Order the plant life cycle — seed, sprout, plant, flower, fruit — and watch it grow in a pot"),
    ("science-plants", 2, "science", "Plants: parts & needs", "গাছ: অঙ্গ ও প্রয়োজন", "c2-science-11", 2, "Tap the plant part and pick what a plant needs to grow"),
    ("en-weather-seasons", 1, "science", "Weather & seasons", "আবহাওয়া ও ঋতু", "c1-science-2", 1, "Sort clothes and activities by season — sunscreen for summer, umbrella for rainy, scarf for winter, kite for spring"),
    ("science-living", 1, "science", "Living & non-living", "জীব ও জড়", "c1-science-3", 1, "Sort pictures into living (grows, breathes) or non-living things"),
    ("plant-animal-sort", 1, "science", "Plant or animal?", "গাছ নাকি প্রাণী?", "c1-science-5", 1, "Drag living things into the plant or animal bin"),
    ("science-senses", 1, "science", "Five senses", "পাঁচ ইন্দ্রিয়", "c1-science-4", 1, "Drag each picture into the sense we use — see, hear, smell, taste, touch"),
    ("en-light-shadows", 2, "science", "Light & shadows", "আলো ও ছায়া", "c2-science-8", 2, "Predict the shadow — it falls opposite the light; low light makes a long shadow, high light a short one"),
    ("en-magnets", 2, "science", "Magnets", "চুম্বক", "c2-science-9", 2, "Predict whether magnets attract or repel — opposite poles attract, same poles repel — then try it"),
    ("en-water-cycle", 2, "science", "Water cycle", "পানিচক্র", "c2-science-10", 2, "Order the water cycle — water, vapor, cloud, rain — and watch the cartoon sun, pond, cloud and rain bring it to life"),
    ("fractions-intro", 3, "math", "Halves and quarters", "অর্ধেক ও চতুর্থাংশ", "c3-math-3", 3, "Recognize ½, ¼, ¾ of a whole, then read shaded fractions to 8 parts"),
    ("fractions-compare", 3, "math", "Compare & order fractions", "ভগ্নাংশ তুলনা ও সাজানো", "c3-math-17", 3, "Tap the bigger pizza, then order three from smallest to biggest"),
    ("tell-time", 3, "math", "Tell time", "ঘড়ি পড়া", "c2-math-3", 2, "Read an analog clock — hour, half, 5-minute steps, then to the exact minute"),
    ("place-value-1000", 3, "math", "Place value to 9,999", "স্থানীয় মান", "c3-math-1", 3, "Thousands, hundreds, tens and ones up to 9,999 — read the number from its blocks"),
    ("round-nearest-10-100", 3, "math", "Round to 10 & 100", "নিকটতম দশ/শতকে পূর্ণ", "c3-math-20", 3, "Round numbers to the nearest ten or hundred with a number-line jump"),
    ("data-barchart", 3, "math", "Bar chart reading", "বার চার্ট পড়ি", "c3-math-6", 3, "Answer how-many questions by tapping bars on a chart"),
    ("add-sub-regroup", 3, "math", "Carry & Borrow", "ক্যারি ও ধার", "c3-math-5", 3, "3-digit addition and subtraction with carrying and borrowing (written method)"),
    # Language stage 3 — first words
    ("bn-words", 3, "bangla", "Bangla words", "শব্দ পড়ি", "c2-bangla-3", 2, "Read simple Bangla words (মাছ, বাঘ, কলা)"),
    ("bn-conjunct-find", 3, "bangla", "Conjunct speed drill", "যুক্তবর্ণ দ্রুত অনুশীলন", "c3-bangla-3", 3, "Find common conjuncts in real words (ক্ষ, ঞ্জ, ঙ্ক)"),
    ("bn-matra-words", 3, "bangla", "Matra words", "কার মিশ্রণ", "c3-bangla-1", 3, "Join syllables with matras into whole words (কা + টা = কাটা)"),
    ("mem-bangla-matra", 3, "bangla", "Matra memory", "মাত্রার স্মৃতি", "c3-bangla-11", 3, "Flip hidden cards to match each matra sign with its example word (ি ↔ মিল)"),
    ("bn-family-words", 3, "bangla", "Family words", "পরিবারের শব্দ", "c2-bangla-4", 2, "Read Bangla family words (মা, বাবা, ভাই)"),
    ("bn-story-read", 3, "bangla", "Story comprehension", "ছোট গল্প পড়ি", "c3-bangla-4", 3, "Read a mini-story, then answer a who/what question with pictures"),
    ("bn-punctuation", 3, "bangla", "Punctuation", "যতি চিহ্ন", "c3-bangla-5", 3, "Tap the right punctuation to end each sentence (। ? !)"),
    ("bn-read-story", 3, "bangla", "Read a story", "গল্প পড়ি", "c3-bangla-6", 3, "Read 3 graded stories, tap any word to hear it, answer the quiz"),
    ("bn-idioms", 3, "bangla", "Simple idioms", "সহজ বাগধারা", "c3-bangla-7", 3, "Match simple Bangla idioms to kid-friendly meanings (তালগাছে কুমড়ো → অসম্ভব)"),
    ("bn-verbgender", 3, "bangla", "Verb match", "ক্রিয়া মেলাই", "c3-bangla-8", 3, "Pick the verb form that agrees with a pictured subject (ছেলেটি খেলছে, রাজা যান, মা রান্না করেন)"),
    ("bn-classifiers", 3, "bangla", "Word fit", "শব্দ বসাও", "c3-bangla-9", 3, "Insert the right classifier or postposition into a sentence (বইটি, ঝুড়ির ভিতরে, মায়ের জন্য)"),
    ("en-cvc", 3, "english", "CVC words", "ইংরেজি শব্দ", "c2-english-3", 2, "Read cat, dog, sun, hat"),
    ("en-contractions", 3, "english", "Contractions", "সংকোচন শব্দ", "c3-english-4", 3, "Match contractions to their two-word forms (I'm → I am, don't → do not)"),
    ("en-compare", 3, "english", "Big, Bigger, Biggest", "বড়, বড়ো, সবচেয়ে বড়", "c3-english-5", 3, "Pick the right degree form for 2-picture (bigger) and 3-picture (biggest) compares"),
    ("en-synant", 3, "english", "Same or opposite?", "একই নাকি বিপরীত?", "c3-english-6", 3, "Match synonyms (happy → glad) and antonyms (big → small) with a picture hint"),
    ("en-irregulars", 3, "english", "Make it plural!", "বহুবচন বানাও!", "c3-english-7", 3, "One foot 🦶 → two ___? Pick the irregular plural (feet, teeth, mice, children…)"),
    ("en-pasttense", 3, "english", "Past time!", "অতীত কাল!", "c3-english-8", 3, "Today I go 🚶 → Yesterday I ___ to school. Pick the irregular past (went, saw, ate…)"),
    ("mem-compound-words", 3, "english", "Compound memory", "যৌগিক শব্দের স্মৃতি", "c3-english-10", 3, "Flip hidden cards to recall the two parts that build a compound word (sun + flower → sunflower)"),
    # Band 4 — advanced operations
    ("division-facts", 4, "math", "Division facts", "ভাগ করা", "c4-math-1", 4, "Division facts within 100 (24÷3, 45÷5)"),
    ("fractions-equiv", 4, "math", "Equivalent fractions", "সমান ভগ্নাংশ", "c4-math-2", 4, "Recognize ½ = 2⁄4 = 3⁄6"),
    ("bn-matras", 4, "bangla", "Bangla matras", "কার", "c3-bangla-2", 3, "Combine letters with matras (ক + া = কা)"),
    ("en-sightwords", 4, "english", "Sight words", "দেখা-শব্দ", "c3-english-3", 3, "Read the, and, you, that, with"),
    ("mem-synonyms", 4, "english", "Synonym memory", "সমার্থক শব্দের স্মৃতি", "c4-english-1", 4, "Flip hidden cards to recall each word and its synonym (happy ↔ glad)"),
    ("science-animals", 4, "science", "Animal homes", "প্রাণী ও আবাস", "c3-science-1", 3, "Where animals live (water, land, sky)"),
    ("bgs-our-country", 4, "bgs", "Our country", "আমাদের দেশ", "c4-bgs-1", 4, "Districts, rivers and national symbols of Bangladesh"),
    ("bgs-good-citizens", 4, "bgs", "Good citizens", "ভালো নাগরিক", "c4-bgs-2", 4, "Civic responsibilities — helping, respecting, road safety"),
    # Band 5
    ("decimals-intro", 5, "math", "Decimals", "দশমিক", "c5-math-3", 5, "Compare and order decimals (0.5 vs 0.45)"),
    ("percent-intro", 5, "math", "Find percent", "শতকরা বের করি", "c6-math-2", 6, "Find 10%, 25%, 50%, then 75% of a number"),
    ("area-perimeter", 5, "math", "Area & perimeter", "ক্ষেত্রফল ও পরিসীমা", "c5-math-5", 5, "Area of rectangles and squares"),
    ("bn-sentences", 5, "bangla", "Bangla sentences", "বাক্য গঠন", "c5-bangla-4", 5, "Build simple Bangla sentences"),
    ("en-grammar", 5, "english", "Nouns & verbs", "বিশেষ্য ও ক্রিয়া", "c5-english-3", 5, "Sort words into nouns and verbs"),
    ("bgs-bangladesh", 5, "bgs", "Bangladesh facts", "বাংলাদেশ পরিচিতি", "c5-bgs-1", 5, "Capital, national symbols, rivers"),
    ("ict-online-safety", 5, "ict", "Online safety", "অনলাইন নিরাপত্তা", "c5-ict-1", 5, "Safe online habits — keep passwords and personal info private"),
    ("science-states-matter", 5, "science", "States of matter", "পদার্থের অবস্থা", "c5-science-1", 5, "Sort objects into solid, liquid, gas — or not matter at all"),
    ("en-comprehension", 5, "english", "Read & understand", "পড়ে বুঝি", "c5-english-4", 5, "Read a short paragraph and answer a question about it"),
    # Band 6 — Jungle Canopy (fluency)
    ("mult-fluency-6-9", 6, "math", "Times tables 6–9", "৬–৯ এর নামতা", "c6-math-1", 6, "Multiplication tables 6, 7, 8, 9 — the fluency top tier of the times-table ladder"),
    ("divide-within-100", 6, "math", "Divide within 100", "১০০-এর মধ্যে ভাগ", "c6-math-4", 6, "Division facts within 100 (72÷8) — the fluency top tier of Division facts"),
    ("fraction-read", 6, "math", "Read fractions", "ভগ্নাংশ পড়ি", "c6-math-3", 6, "Read shaded fractions to 8 parts (top tier of Read fractions)"),
    ("clock-minute", 6, "math", "Tell time to the minute", "মিনিট ধরে ঘড়ি পড়ি", "c6-math-6", 6, "Read any time to the exact minute (top tier of Tell time)"),
    ("bn-conjuncts", 6, "bangla", "Bangla conjuncts", "যুক্তবর্ণ", "c6-bangla-2", 6, "Combine letters into conjuncts ক্ষ ঞ্জ ঙ্ক ণ্ড"),
    ("en-paragraph", 6, "english", "Paragraph power", "অনুচ্ছেদ পড়ি", "c6-english-1", 6, "Comprehend longer paragraphs — read, understand, answer"),
    ("science-human-body", 6, "science", "Human body", "মানবদেহ", "c6-science-1", 6, "Match the major organs — heart, brain, lungs, stomach"),
    ("alg-missing-number", 6, "math", "Missing numbers", "অজানা সংখ্যা খুঁজি", "c6-math-5", 6, "Solve number sentences with a missing number — ? + 7 = 15, ? − 9 = 6, 18 − ? = 11"),
    ("neg-compare-order", 6, "math", "Compare negative numbers", "ঋণাত্মক সংখ্যা তুলনা", "c6-math-7", 6, "Which negative is greater? Order −5, −2, 0 on the number line"),
    ("ratio-simplify", 6, "math", "Simplify ratios", "অনুপাত ছোট করি", "c6-math-8", 6, "Reduce ratios to simplest form — 4:8 → 1:2, 6:9 → 2:3"),
    ("geo-perimeter", 6, "math", "Perimeter: rectangles & triangles", "পরিসীমা: আয়তক্ষেত্র ও ত্রিভুজ", "c6-math-9", 6, "Add the side lengths around rectangles and right triangles (top tier of Perimeter intro)"),
    ("prob-words", 6, "math", "Probability words", "সম্ভাবনার শব্দ", "c6-math-10", 6, "Label events certain, likely, unlikely or impossible"),
    # #1142 — fast-round fact fluency (ArcadeCatch)
    ("facts-fast-add", 6, "math", "Fast add facts", "দ্রুত যোগ", "c6-math-11", 6, "Catch the falling sum before it lands — rapid-fire addition facts"),
    ("facts-fast-sub", 6, "math", "Fast subtract facts", "দ্রুত বিয়োগ", "c6-math-12", 6, "Catch the falling difference before it lands — rapid-fire subtraction facts"),
    ("facts-fast-mult", 6, "math", "Fast times tables", "দ্রুত নামতা", "c6-math-13", 6, "Catch the falling product before it lands — rapid-fire times-table facts"),
    ("facts-fast-div", 6, "math", "Fast division facts", "দ্রুত ভাগ", "c6-math-14", 6, "Catch the falling quotient before it lands — rapid-fire division facts"),
    # #1161 — band 6 science/english/ict breadth
    ("science-forces-energy", 6, "science", "Forces & energy", "বল ও শক্তি", "c6-science-2", 6, "Push, pull, gravity, and light/heat/sound — the forces and energy around us"),
    ("science-ecosystems", 6, "science", "Ecosystems: food chains", "বাস্তুতন্ত্র: খাদ্য শৃঙ্খল", "c6-science-3", 6, "Producers, consumers and decomposers in food chains"),
    ("science-body-depth", 6, "science", "Human body: organ jobs", "মানবদেহ: অঙ্গের কাজ", "c6-science-4", 6, "Match more organs — muscles, liver, kidneys, intestines — to what they do"),
    ("en-read-inference", 6, "english", "Reading: infer & predict", "পড়া: অনুমান ও ভবিষ্যদ্বাণী", "c6-english-2", 6, "Read between the lines — infer why and predict what happens next"),
    ("en-grammar-past-depth", 6, "english", "Irregular past tense", "অনিয়মিত অতীত কাল", "c6-english-3", 6, "Deeper irregular past practice — went, saw, ate, took, made"),
    ("en-paragraph-order", 6, "english", "Order a paragraph", "অনুচ্ছেদ সাজাই", "c6-english-4", 6, "Put three sentences into a clear paragraph order"),
    ("ict-digital-literacy", 6, "ict", "Digital literacy", "ডিজিটাল সাক্ষরতা", "c6-ict-1", 6, "Privacy, phishing and screen balance — deeper online safety"),
    ("ict-code-blocks", 6, "ict", "What does this block do?", "এই ব্লকটি কী করে?", "c6-ict-2", 6, "Read simple coding blocks — loop, move, print, if — and say what they do"),
    # Band 7 — Polar Peaks (refinement)
    ("decimals-tenths", 7, "math", "Decimal place value", "দশমিকের স্থানীয় মান", "c7-math-3", 7, "Place value in decimals (0.5, 0.25, 0.75) — the top tier of the Decimals family"),
    ("percent-of-number", 7, "math", "Percent of a number", "সংখ্যার শতকরা", "c7-math-2", 7, "Find 10%, 25%, 50% and 75% of a number (top tier of Percent)"),
    ("fraction-simplify", 7, "math", "Simplify fractions", "ভগ্নাংশ ছোট করি", "c7-math-1", 7, "Reduce fractions to simplest form (4⁄8 → ½)"),
    ("bgs-heritage", 7, "bgs", "Bangladesh heritage", "বাংলাদেশের ঐতিহ্য", "c7-bgs-1", 7, "Festivals, crafts, foods, landmarks"),
    ("en-sentence-order", 7, "english", "Sentence order", "বাক্য সাজিয়ে অনুচ্ছেদ", "c7-english-1", 7, "Order sentences into a clear paragraph (topic → detail → end)"),
    ("science-body-systems", 7, "science", "Body systems", "অঙ্গতন্ত্র", "c7-science-1", 7, "Match organs to their body system and what it does"),
    ("alg-one-step", 7, "math", "One-step equations", "এক ধাপের সমীকরণ", "c7-math-4", 7, "Solve x + 3 = 11 and x − 4 = 9 by doing the opposite operation"),
    ("neg-number-line-add", 7, "math", "Add negatives on a number line", "সংখ্যারেখায় ঋণাত্মক যোগ", "c7-math-5", 7, "Add a small negative to a positive on the number line — 5 + (−3) = 2"),
    ("ratio-equivalent", 7, "math", "Equivalent ratios", "সমান অনুপাত", "c7-math-6", 7, "Match equivalent ratios — 2:3 = 4:6 by scaling both sides"),
    ("ratio-unit-rate", 7, "math", "Unit rates", "একক দর", "c7-math-7", 7, "Find the unit rate — 3 pens cost ৳12, so 1 pen costs ৳4"),
    ("geo-symmetry", 7, "math", "Symmetry practice", "প্রতিসাম্যের অনুশীলন", "c7-math-8", 7, "Complete the mirror half of a picture across the fold line (top tier of Symmetry)"),
    ("stats-mean-mode", 7, "math", "Mean, mode & median", "গড়, প্রচুরক ও মধ্যমা", "c7-math-9", 7, "Find the mean, mode and median of small sets — 4, 7, 9 → mean 6"),
    # #1161 — band 7 science/english/ict depth
    ("science-energy-transfer", 7, "science", "Energy types & transfer", "শক্তির ধরন ও প্রবাহ", "c7-science-2", 7, "Kinetic, potential, heat, light and sound — how energy moves and changes"),
    ("science-ecosystems-depth", 7, "science", "Food webs & niches", "খাদ্য জাল ও নিচ", "c7-science-3", 7, "Food webs, predators, prey and decomposers — roles in an ecosystem"),
    ("science-body-systems-depth", 7, "science", "Body systems: what they do", "অঙ্গতন্ত্র: এদের কাজ", "c7-science-4", 7, "What each body system does — circulatory, digestive, respiratory, nervous"),
    ("en-read-critical", 7, "english", "Reading: main idea", "পড়া: মূল ভাব", "c7-english-2", 7, "Find the main idea and the author's purpose in longer paragraphs"),
    ("en-grammar-irregulars-depth", 7, "english", "Irregular plurals", "অনিয়মিত বহুবচন", "c7-english-3", 7, "Deeper irregular plural practice — feet, teeth, mice, children, oxen"),
    ("ict-digital-citizenship", 7, "ict", "Digital citizenship", "ডিজিটাল নাগরিকত্ব", "c7-ict-1", 7, "Respectful, private, balanced online choices — be a good digital citizen"),
    ("ict-code-steps", 7, "ict", "Order the steps", "ধাপ সাজাই", "c7-ict-2", 7, "Think like a coder — put everyday and coding tasks in the right order"),
    # Band 8 — Summit Peaks (class 8, ages 13–16)
    ("alg-two-step", 8, "math", "Two-step equations", "দুই ধাপের সমীকরণ", "c8-math-1", 8, "Solve 2x + 3 = 11 and 5x − 2 = 13 by undoing two operations"),
    ("neg-arith", 8, "math", "Negative number arithmetic", "ঋণাত্মক সংখ্যার হিসাব", "c8-math-2", 8, "Add, subtract and multiply with negative numbers — (−3) + 7, 4 − (−2), (−3) × 4"),
    ("percent-change", 8, "math", "Percentage change", "শতকরা পরিবর্তন", "c8-math-3", 8, "Find the percent increase or decrease — a price moving from ৳40 to ৳50"),
    ("geo-volume-angles", 8, "math", "Angles & volume", "কোণ ও আয়তন", "c8-math-4", 8, "Pair complementary and supplementary angles, and find the volume of cubes and cuboids"),
    ("stats-larger-sets", 8, "math", "Statistics: larger sets", "পরিসংখ্যান: বড় সেট", "c8-math-5", 8, "Find the mean, median and range of larger data sets"),
    ("science-forces-depth", 8, "science", "Forces & energy depth", "বল ও শক্তির গভীরতা", "c8-science-1", 8, "Work, friction and simple machines — deeper forces and energy ideas"),
    ("science-ecosystems-8", 8, "science", "Ecosystems: energy & cycles", "বাস্তুতন্ত্র: শক্তি ও চক্র", "c8-science-2", 8, "Energy pyramids, nutrient cycles and biodiversity — how ecosystems stay balanced"),
    ("science-body-systems-8", 8, "science", "Body systems: working together", "অঙ্গতন্ত্র: একসাথে কাজ", "c8-science-3", 8, "How body systems work together — lungs bring in oxygen, the heart carries it, muscles use it"),
    ("en-read-evaluate", 8, "english", "Reading: evaluate & compare", "পড়া: মূল্যায়ন ও তুলনা", "c8-english-1", 8, "Evaluate evidence and compare two viewpoints in longer texts"),
    ("en-grammar-adjectives", 8, "english", "Adjectives & adverbs", "বিশেষণ ও ক্রিয়াবিশেষণ", "c8-english-2", 8, "Sort describing words — adjectives describe things, adverbs describe actions"),
    ("ict-code-debug", 8, "ict", "Code logic: find & fix", "কোড যুক্তি: খুঁজে ঠিক করি", "c8-ict-1", 8, "Debug logic — spot the wrong step and fix simple algorithms"),
    ("bgs-economics-8", 8, "bgs", "Bangladesh economy & civics", "বাংলাদেশের অর্থনীতি ও নাগরিকতা", "c8-bgs-1", 8, "Trade, taxes, savings and civic duties — how Bangladesh works"),
    # 2026 backlog content (#43, #44, #48, #49)
    ("bn-days-months", 1, "bangla", "Days & months", "সপ্তাহ ও মাস", "c1-bangla-9", 1, "Order the 7 days and the 12 Bangla months"),
    ("bn-spelling", 1, "bangla", "Bangla spelling", "বানান শিখি", "c1-bangla-10", 1, "Hear a word and build it by tapping letter tiles in order"),
    ("bn-spell-type", 1, "bangla", "Spell by typing", "টাইপ করে বানান", "c1-bangla-12", 1, "Hear a Bangla word and spell it by typing it with the letter keys"),
    ("bn-pronouns", 3, "bangla", "Bangla pronouns", "সর্বনাম", "c3-bangla-10", 3, "Fill the right pronoun (আমি, তুমি, সে…) into a sentence"),
    ("count-back-100", 2, "math", "Count back from 100", "উল্টো গোনা", "c2-math-14", 2, "Count down from 100 to 1 by ones — a rocket blast-off (reverse mode of the count family)"),
    # 2026 backlog content (#51, #53, #54, #56)
    ("en-cvc-build", 1, "english", "Build CVC words", "শব্দ গড়ি", "c1-english-6", 1, "See a CVC picture, drag its 3 letters into the slots to spell it"),
    ("en-plurals-regular", 2, "english", "Plurals: -s -es -ies", "বহুবচন: -s -es -ies", "c2-english-14", 2, "One cat 🐱 → two cats! Regular plurals with rule demos (add -s, add -es, change y → -ies)"),
    ("en-past-ed", 3, "english", "Past tense: -ed", "অতীত কাল: -ed", "c3-english-9", 3, "Fill the blank with the -ed form — play → played, jump → jumped (read aloud)"),
    ("en-case-match", 1, "english", "Big & small letters", "বড়-ছোট অক্ষর", "c1-english-7", 1, "Match a big letter B to its small partner b — 26 pairs, letter name spoken"),
]


async def seed_content(db: AsyncSession) -> None:
    for sid, title_en, title_bn, order in SUBJECTS_SEED:
        if not await db.get(Subject, sid):
            db.add(Subject(id=sid, title_en=title_en, title_bn=title_bn, sort_order=order))
    for order, (sid, band, subject, title, title_bn, nctb_code, class_number, description) in enumerate(SKILLS_SEED, start=1):
        if not await db.get(Skill, sid):
            db.add(
                Skill(
                    id=sid,
                    band=band,
                    subject=subject,
                    title=title,
                    title_bn=title_bn,
                    nctb_code=nctb_code,
                    class_number=class_number,
                    description=description,
                    sort_order=order,
                )
            )
    await db.flush()
    log.info("Content catalog seeded (%d subjects, %d skills)", len(SUBJECTS_SEED), len(SKILLS_SEED))


async def create_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # #388/#910 — create_all never alters an existing table to add a new column,
    # index, constraint, or column type, so a model change silently breaks the
    # API on an old DB (the `aggregate_opt_in` 502 outage). Diff the live schema
    # and apply columns, types, constraints, indexes, and data backfills.
    await apply_migrations()


async def _ensure_profile(
    db: AsyncSession,
    email: str,
    password: str,
    display_name: str,
    is_admin: bool,
    role: str = "user",
    *,
    rotate_password: bool = False,
) -> Profile:
    existing = await db.scalar(select(Profile).where(Profile.email == email))
    if existing:
        # #846 — idempotently backfill the bootstrap admin's role on an existing
        # DB so the pre-role operator account keeps super_admin access going
        # forward (legacy is_admin already grants it, but make the role real).
        if is_admin and existing.is_admin and existing.role != "super_admin":
            existing.role = "super_admin"
        # #842/#800 — the bootstrap admin and demo passwords are owned by the
        # OPERATOR via NV_ADMIN_PASSWORD / NV_DEMO_PASSWORD (non-dev boots
        # refuse the built-in defaults). A pre-rotation row (seeded with the old
        # env value, or the old default) must re-hash to the current env value
        # on every boot so changing either env var is the deterministic rotation
        # path — the seeded account always matches the env, never a stale hash.
        if rotate_password and not verify_password(password, existing.password_hash):
            existing.password_hash = hash_password(password)
            log.info("Rotated %s password to match the configured env value", email)
        return existing
    profile = Profile(
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
        is_admin=is_admin,
        role=role,
    )
    db.add(profile)
    await db.flush()
    log.info("Created profile %s (admin=%s, role=%s)", email, is_admin, role)
    return profile


async def seed() -> None:
    async with SessionLocal() as db:
        await seed_content(db)

        # #842/#800 — dev-only default admin/demo passwords. In non-dev
        # environments the config startup guard refuses to boot unless
        # NV_ADMIN_PASSWORD and NV_DEMO_PASSWORD are set, so the built-in
        # defaults only ever seed during local dev/test runs. Deliberately NOT
        # random per-restart passwords — that would lock the console and demo
        # out. Both seeded accounts rotate to their env value on every boot.
        admin = await _ensure_profile(
            db,
            settings.admin_email,
            settings.admin_password,
            "Numberverse Admin",
            True,
            "super_admin",
            rotate_password=True,
        )
        demo = await _ensure_profile(
            db,
            settings.demo_email,
            settings.demo_password,
            "Demo Parent",
            False,
            rotate_password=True,
        )

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

        # Demo subscription for the demo parent. #909 — the DB has a unique
        # profile_id constraint, so this is an idempotent conflict-no-op insert
        # instead of the old racy Python-if (`select`, then `add`).
        stmt = (
            pg_insert(Subscription)
            .values(profile_id=demo.id, plan="plus", store="web", status="active")
            .on_conflict_do_nothing(index_elements=["profile_id"])
        )
        result = await db.execute(stmt)
        if result.rowcount:
            log.info("Created demo plus subscription")

        await db.commit()

-- ============================================================
-- Numberverse schema v1 — runs once on first Postgres boot
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Parent profiles (account holders, the paying entity) ──
CREATE TABLE profiles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT,
    is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Kids (child profiles, scoped under a parent) ──
CREATE TABLE kids (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    avatar     TEXT,
    birth_year INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kids_profile ON kids(profile_id);

-- ── Subjects (NCTB curriculum: math, bangla, english, science, bgs, ict) ──
CREATE TABLE subjects (
    id          TEXT PRIMARY KEY,        -- 'math', 'bangla', ...
    title_en    TEXT NOT NULL,
    title_bn    TEXT NOT NULL,           -- 'গণিত', 'বাংলা', ...
    sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ── Skills (curriculum items, bands 1–5, NCTB-aligned) ──
CREATE TABLE skills (
    id           TEXT PRIMARY KEY,        -- e.g. 'count-1-10'
    band         INTEGER NOT NULL,        -- 1..5
    subject      TEXT NOT NULL REFERENCES subjects(id),  -- 'math' | 'bangla' | ...
    title        TEXT NOT NULL,
    title_bn     TEXT,                    -- Bangla curriculum title
    description  TEXT,
    common_core  TEXT[],                  -- CCSS codes (mapping)
    nctb_code    TEXT,                    -- e.g. 'c1-math-1' (class-subject-unit)
    class_number INTEGER,                 -- BD school class 1..12
    sort_order   INTEGER NOT NULL DEFAULT 0
);

-- ── Per-kid skill mastery (adaptive engine state) ──
CREATE TABLE skill_mastery (
    kid_id        UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
    skill_id      TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    mastery       FLOAT NOT NULL DEFAULT 0.0,   -- P(mastered), 0..1
    correct       INTEGER NOT NULL DEFAULT 0,
    attempts      INTEGER NOT NULL DEFAULT 0,
    streak        INTEGER NOT NULL DEFAULT 0,
    last_practice TIMESTAMPTZ,
    last_decay    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (kid_id, skill_id)
);

-- ── Raw progress events (answer history → analytics + model) ──
CREATE TABLE progress_events (
    id          BIGSERIAL PRIMARY KEY,
    kid_id      UUID NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
    skill_id    TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    game_id     TEXT NOT NULL,
    correct     BOOLEAN NOT NULL,
    response_ms INTEGER,
    difficulty  FLOAT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_progress_kid ON progress_events(kid_id, skill_id, created_at DESC);

-- ── Subscriptions (billing; store-managed later) ──
CREATE TABLE subscriptions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    plan               TEXT NOT NULL DEFAULT 'free',   -- free | plus | school
    store              TEXT,                            -- apple | google | stripe | web
    store_ref          TEXT,
    status             TEXT NOT NULL DEFAULT 'active',  -- active | trial | canceled | expired
    current_period_end TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_profile ON subscriptions(profile_id);

-- ── Content items (game configs, worlds, seasonal) — admin-editable ──
CREATE TABLE content_items (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,             -- game | world | character | event
    title      TEXT NOT NULL,
    config     JSONB NOT NULL DEFAULT '{}',
    band       INTEGER,
    enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Config / feature flags — admin-editable ──
CREATE TABLE config (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Seed: NCTB subjects (Bangladesh curriculum) ──
INSERT INTO subjects (id, title_en, title_bn, sort_order) VALUES
  ('math',    'Mathematics',    'গণিত', 1),
  ('bangla',  'Bangla',         'বাংলা', 2),
  ('english', 'English',        'ইংরেজি', 3),
  ('science', 'Science',        'বিজ্ঞান', 4),
  ('bgs',     'BGS & Society',  'বাংলাদেশ ও বিশ্বপরিচয়', 5),
  ('ict',     'ICT',            'তথ্য ও যোগাযোগ প্রযুক্তি', 6);

-- ── Seed: Band 1–2 skills (the launch wedge, NCTB-aligned) ──
INSERT INTO skills (id, band, subject, title, title_bn, description, common_core, nctb_code, class_number, sort_order) VALUES
  ('count-1-10', 1, 'math', 'Count to 10', '১ থেকে ১০ গুনি', 'Count objects 1 to 10 in sequence', ARRAY['K.CC.1','K.CC.2'], 'c1-math-1', 1, 1),
  ('count-1-20', 1, 'math', 'Count to 20', '১ থেকে ২০ গুনি', 'Count objects up to 20', ARRAY['K.CC.1'], 'c1-math-1', 1, 2),
  ('shapes', 1, 'math', 'Recognize shapes', 'আকার চিনি', 'Identify circle, square, triangle, star', ARRAY['K.G.2'], 'c1-math-3', 1, 3),
  ('bn-swaroborno', 1, 'bangla', 'Bangla vowels', 'স্বরবর্ণ', 'Recognize Bangla vowel letters অ আ ই ঈ উ ঊ', ARRAY['RF.K.1d'], 'c1-bangla-1', 1, 4),
  ('en-abcs', 1, 'english', 'ABCs', 'ইংরেজি বর্ণমালা', 'Recognize uppercase letters A–F', ARRAY['RF.K.1d'], 'c1-english-1', 1, 5),
  ('add-within-10', 2, 'math', 'Add within 10', '১০-এর মধ্যে যোগ', 'Addition facts with sums to 10', ARRAY['1.OA.6'], 'c1-math-4', 1, 10),
  ('sub-within-10', 2, 'math', 'Subtract within 10', '১০-এর মধ্যে বিয়োগ', 'Subtraction facts within 10', ARRAY['1.OA.6'], 'c1-math-5', 1, 11),
  ('number-bonds-10', 2, 'math', 'Number bonds to 10', '১০-এর জোড়া সংখ্যা', 'Partition numbers to 10', ARRAY['K.OA.3','1.OA.6'], 'c1-math-4', 1, 12),
  ('bn-benjonborno', 2, 'bangla', 'Bangla consonants', 'ব্যঞ্জনবর্ণ', 'Recognize Bangla consonant letters ক খ গ ঘ', ARRAY['RF.K.1d'], 'c1-bangla-2', 1, 13),
  ('bn-colors', 2, 'bangla', 'Bangla colors', 'রঙ চিনি', 'Name colors in Bangla (লাল, নীল, সবুজ)', ARRAY['L.K.5a'], 'c1-bangla-4', 1, 14),
  ('en-phonics', 2, 'english', 'Letter sounds', 'বর্ণের উচ্চারণ', 'First letter sounds (A, B, C)', ARRAY['RF.K.3a'], 'c1-english-2', 1, 15),
  ('mult-facts-2-5-10', 3, 'math', 'Times tables 2, 5, 10', '২, ৫, ১০ এর নামতা', 'Multiplication facts for 2, 5, 10', ARRAY['3.OA.7'], 'c3-math-2', 2, 20),
  ('fractions-intro', 3, 'math', 'Halves and quarters', 'অর্ধেক ও চতুর্থাংশ', 'Recognize ½, ¼, ¾ of a whole', ARRAY['3.NF.1'], 'c3-math-3', 2, 21),
  ('add-sub-100', 3, 'math', 'Add & subtract to 100', '১০০-এর মধ্যে যোগ-বিয়োগ', 'Two-digit addition and subtraction', ARRAY['2.NBT.5','3.NBT.2'], 'c2-math-4', 2, 22),
  ('bn-words', 3, 'bangla', 'Bangla words', 'শব্দ পড়ি', 'Read simple Bangla words (মাছ, বাঘ, কলা)', ARRAY['RF.2.4'], 'c2-bangla-3', 2, 23),
  ('en-cvc', 3, 'english', 'CVC words', 'ইংরেজি শব্দ', 'Read cat, dog, sun, hat', ARRAY['RF.2.3'], 'c2-english-3', 2, 24),
  -- Band 4: Sky Castle (ages 8–10, class 3–4)
  ('division-facts', 4, 'math', 'Division facts', 'ভাগ করা', 'Division facts within 100 (24÷3, 45÷5)', ARRAY['3.OA.7'], 'c3-math-4', 3, 30),
  ('fractions-equiv', 4, 'math', 'Equivalent fractions', 'সমান ভগ্নাংশ', 'Recognize ½ = 2⁄4 = 3⁄6', ARRAY['3.NF.3'], 'c4-math-3', 4, 31),
  ('place-value-1000', 4, 'math', 'Place value to 1,000', 'স্থানীয় মান', 'Hundreds, tens and ones up to 1,000', ARRAY['2.NBT.1','3.NBT.1'], 'c3-math-1', 3, 32),
  ('bn-matras', 4, 'bangla', 'Bangla matras', 'কার', 'Combine letters with matras (ক + া = কা)', ARRAY['RF.3.4'], 'c3-bangla-2', 3, 33),
  ('en-sightwords', 4, 'english', 'Sight words', 'দেখা-শব্দ', 'Read the, and, you, that, with', ARRAY['RF.3.4'], 'c3-english-3', 3, 34),
  ('science-animals', 4, 'science', 'Animal homes', 'প্রাণী ও আবাস', 'Where animals live (water, land, sky)', ARRAY['2.LS.4'], 'c3-science-1', 3, 35),
  -- Band 5: Star Academy (ages 10–13, class 5–8)
  ('decimals-intro', 5, 'math', 'Decimals', 'দশমিক', 'Compare and order decimals (0.5 vs 0.45)', ARRAY['5.NBT.3'], 'c5-math-3', 5, 40),
  ('percent-intro', 5, 'math', 'Percent of a number', 'শতকরা', 'Find 10%, 25%, 50% of a number', ARRAY['6.RP.3'], 'c6-math-2', 6, 41),
  ('area-perimeter', 5, 'math', 'Area & perimeter', 'ক্ষেত্রফল ও পরিসীমা', 'Area of rectangles and squares', ARRAY['4.MD.3'], 'c5-math-5', 5, 42),
  ('bn-sentences', 5, 'bangla', 'Bangla sentences', 'বাক্য গঠন', 'Build simple Bangla sentences', ARRAY['RF.5.4'], 'c5-bangla-4', 5, 43),
  ('en-grammar', 5, 'english', 'Nouns & verbs', 'বিশেষ্য ও ক্রিয়া', 'Sort words into nouns and verbs', ARRAY['L.5.1'], 'c5-english-3', 5, 44),
  ('bgs-bangladesh', 5, 'bgs', 'Bangladesh facts', 'বাংলাদেশ পরিচিতি', 'Capital, national symbols, rivers', ARRAY[], 'c5-bgs-1', 5, 45);

-- ── Seed: content items (game configs) ──
INSERT INTO content_items (id, kind, title, config, band, enabled) VALUES
  ('game-countpop', 'game', 'Count & Pop', '{"difficultyLevels":[3,4,5,7,10],"targetSuccess":0.8}', 1, TRUE),
  ('game-fruitadd', 'game', 'Fruit Addition', '{"difficultyLevels":[5,8,11,15,20],"targetSuccess":0.8}', 2, TRUE),
  ('game-shapecatcher', 'game', 'Shape Catcher', '{"difficultyLevels":[3,4,6,8,10],"targetSuccess":0.8}', 1, TRUE),
  ('game-bnletters', 'game', 'Bangla Letters', '{"difficultyLevels":[3,4,5,6,6],"targetSuccess":0.8}', 1, TRUE),
  ('game-enletters', 'game', 'English Letters', '{"difficultyLevels":[3,4,5,6,6],"targetSuccess":0.8}', 1, TRUE),
  ('game-bnbonds', 'game', 'Number Bonds', '{"difficultyLevels":[4,5,6,8,10],"targetSuccess":0.8}', 2, TRUE),
  ('game-bncolors', 'game', 'Bangla Colors', '{"difficultyLevels":[3,4,5,6,6],"targetSuccess":0.8}', 2, TRUE),
  ('game-enphonics', 'game', 'Letter Sounds', '{"difficultyLevels":[3,3,4,4,5],"targetSuccess":0.8}', 2, TRUE),
  ('game-addsub100', 'game', 'Add & Subtract 100', '{"difficultyLevels":[20,40,60,90,99],"targetSuccess":0.8}', 3, TRUE),
  ('game-rocketmult', 'game', 'Rocket Builder', '{"difficultyLevels":[2,5,10,10,10],"targetSuccess":0.8}', 3, TRUE),
  ('game-pizzafrac', 'game', 'Pizza Fractions', '{"difficultyLevels":[2,3,4,4,4],"targetSuccess":0.8}', 3, TRUE),
  ('game-bnwords', 'game', 'Bangla Words', '{"difficultyLevels":[3,4,5,6,6],"targetSuccess":0.8}', 3, TRUE),
  ('game-cvc', 'game', 'Word Pictures', '{"difficultyLevels":[3,4,5,6,6],"targetSuccess":0.8}', 3, TRUE),
  ('game-division', 'game', 'Castle Division', '{"difficultyLevels":[2,3,4,6,8],"targetSuccess":0.8}', 4, TRUE),
  ('game-fracmatch', 'game', 'Fraction Match', '{"difficultyLevels":[2,3,4,6,8],"targetSuccess":0.8}', 4, TRUE),
  ('game-placevalue', 'game', 'Place Value Tower', '{"difficultyLevels":[3,4,5,6,6],"targetSuccess":0.8}', 4, TRUE),
  ('game-bnmatras', 'game', 'Bangla Matras', '{"difficultyLevels":[3,4,5,6,6],"targetSuccess":0.8}', 4, TRUE),
  ('game-sightwords', 'game', 'Sight Words', '{"difficultyLevels":[3,4,5,6,6],"targetSuccess":0.8}', 4, TRUE),
  ('game-animalhome', 'game', 'Animal Homes', '{"difficultyLevels":[3,4,5,6,6],"targetSuccess":0.8}', 4, TRUE),
  ('game-decimals', 'game', 'Decimal Duel', '{"difficultyLevels":[1,1,2,2,3],"targetSuccess":0.8}', 5, TRUE),
  ('game-percent', 'game', 'Percent Quest', '{"difficultyLevels":[10,20,25,50,100],"targetSuccess":0.8}', 5, TRUE),
  ('game-area', 'game', 'Area Lab', '{"difficultyLevels":[6,12,20,30,42],"targetSuccess":0.8}', 5, TRUE),
  ('game-bnsentence', 'game', 'Sentence Builder', '{"difficultyLevels":[3,4,4,5,5],"targetSuccess":0.8}', 5, TRUE),
  ('game-grammar', 'game', 'Noun or Verb?', '{"difficultyLevels":[3,4,5,6,6],"targetSuccess":0.8}', 5, TRUE),
  ('game-bgs', 'game', 'Bangladesh Facts', '{"difficultyLevels":[3,4,5,6,6],"targetSuccess":0.8}', 5, TRUE);

-- ── Seed: config ──
INSERT INTO config (key, value) VALUES
  ('adaptive', '{"pLearn":0.10,"pGuess":0.15,"pSlip":0.10,"decayPerDay":0.02,"masteryThreshold":0.8}'),
  ('launch', '{"wedge":"bands-1-2"}');

-- NOTE: admin profile is created via the API seed script (password hashing).

/** Shared domain types for Numberverse. */

export interface Band {
  id: number; // 1..5
  key: string;
  title: string;
  /** Bangla name of the world — shown when the app language is বাংলা. */
  titleBn?: string;
  ageRange: string;
}

export interface GameConfig {
  id: string; // e.g. 'game-countpop'
  skillId: string; // e.g. 'count-1-10'
  difficultyLevels: number[]; // ascending — engine picks an index
  targetSuccess: number; // ~0.8
}

export type Subject = "math" | "bangla" | "english" | "science" | "bgs" | "ict";

export interface Skill {
  id: string;
  band: number;
  subject: Subject;
  title: string; // English title
  titleBn?: string; // Bangla title (NCTB curriculum)
  description?: string;
  /** Bangla description — shown when the app language is বাংলা (never mixes
   *  English into the Bangla UI). */
  descriptionBn?: string;
  commonCore?: string[];
  /** NCTB curriculum code, e.g. 'c1-math-1' (class-subject-unit) */
  nctbCode?: string;
  classNumber?: number; // Bangladesh school class 1..12
  game?: string; // primary game id
  /** Skill family (#1207-#1216 skill-overlap cleanup). Skills that are TIERS of
   *  ONE concept — concrete → abstract → timed drills, or a band-ceiling bump
   *  of the same scene (percent 10→75%, fractions 4→8 parts, clock to the
   *  minute, division to 100) — share a family id so the child's "I can do X"
   *  mastery number counts ONCE instead of once per duplicate id. */
  family?: string;
  /** Ladder position inside the family: 1 = concrete/intro … n = abstract/timed. */
  tier?: number;
  /** Per-skill scene variant selector (#1169). When several skills share ONE
   *  scene, this data field picks the exact mode the scene should run in —
   *  e.g. bn-family-words → "family" (vs bn-words' default word list), or
   *  bn-conjuncts → "conjuncts" (vs bn-matras' matra combine). The app's
   *  modeForSkill() reads this INSTEAD of hardcoding skill-id → mode maps,
   *  so a new skill variant is a data entry, not a code branch. */
  dataMode?: "add" | "sub" | "vowels" | "consonants" | "family" | "conjuncts" | "words" | "civic" | "paragraph" | "sentences";
  /** Per-skill content range (#1170). When several skills reuse ONE game-id in
   *  DIFFERENT bands (e.g. mult-facts-2-10 band-3 vs mult-fluency-6-9 band-6
   *  both run TimesTable), this data field carries the skill's OWN difficulty
   *  ladder — the exact tables/denominators/percents the scene must generate —
   *  instead of relying on the shared game's `difficultyLevels` + the adaptive
   *  startLevelIndex to accidentally pick the right band. The app passes
   *  `skill.dataLevels ?? game.difficultyLevels` as the scene's `levels`, so a
   *  band-6 skill reteaches ITS OWN floor (e.g. ×6, not ×2). A new band-pair
   *  range is a data entry, not a scene branch. */
  dataLevels?: number[];
  /** Older-kid challenge mode (#1158 #1166). Band 6-7 skills that reuse a
   *  lower-band scene flag this: the app runs them in "independent mode" — no
   *  forced re-demo on reteach, reteach stays at the current tier (never drops
   *  to the easiest), a HIGHER mastery threshold (0.92 vs 0.8), and the scene
   *  gets `challenge: true` so it enables richer mechanics (timed rounds, no
   *  hint/reveal on a wrong tap). A 13-year-old drilling ×6-9 gets pressure +
   *  autonomy, not a grade-2 re-teach. A new older-band skill is a data entry. */
  challenge?: boolean;
}

/** Per-skill mastery state for one kid (mirrors skill_mastery row). */
export interface SkillState {
  kidId: string;
  skillId: string;
  pMastered: number; // 0..1
  correct: number;
  attempts: number;
  streak: number;
  lastPractice: number | null; // epoch ms
  lastDecay: number; // epoch ms
}

/** A single answer event sent to the backend. */
export interface ProgressEvent {
  kidId: string;
  skillId: string;
  gameId: string;
  correct: boolean;
  responseMs?: number | null;
  difficulty?: number | null;
  timestamp: number; // epoch ms
}

export interface KidProfile {
  id: string;
  name: string;
  avatar?: string | null;
  birthYear?: number | null;
  createdAt: string;
}

export interface ParentProfile {
  id: string;
  email: string;
  displayName?: string | null;
}

export interface MasteryRecord {
  skillId: string;
  mastery: number;
  correct: number;
  attempts: number;
  streak: number;
}

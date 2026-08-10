/** Shared domain types for Numberverse. */

export interface Band {
  id: number; // 1..5
  key: string;
  title: string;
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
  commonCore?: string[];
  /** NCTB curriculum code, e.g. 'c1-math-1' (class-subject-unit) */
  nctbCode?: string;
  classNumber?: number; // Bangladesh school class 1..12
  game?: string; // primary game id
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

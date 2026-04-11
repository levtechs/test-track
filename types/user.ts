import type { Difficulty } from "./question";

export interface SkillStat {
  correct: number;
  total: number;
  lastSeen: number; // timestamp ms
}

export interface SkillElo {
  rating: number;
  questionCount: number;
  correctCount: number;
}

export interface QuestionRepetition {
  easeFactor: number;
  interval: number;
  repetitions: number;
  lastReviewedAt: number;
  nextReviewAt: number;
}

export interface EstimatedScore {
  score: number;
  confidence: number;
  rawAccuracy: number;
  calculatedAt: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string | null;
  englishRating: number;
  mathRating: number;
  totalQuestions: number;
  totalCorrect: number;
  skillStats: Record<string, SkillStat>;
  skillElos?: Record<string, SkillElo>;
  questionRepetitions?: Record<string, QuestionRepetition>;
  createdAt: number;
  updatedAt: number;
  lastModule?: "english" | "math";
  lastEnglishSessionId?: string;
  lastEnglishIndex?: number;
  lastMathSessionId?: string;
  lastMathIndex?: number;
  estimatedEnglish?: EstimatedScore;
  estimatedMath?: EstimatedScore;
  dayStreak: number;
  lastActiveDate: number | null;
}

export interface QueuedQuestion {
  questionId: string;
  answeredAt?: number;
  selectedAnswer?: string;
  isCorrect?: boolean;
  correctAnswer?: string;
  timeSpentMs?: number;
  ratingChange?: number;
}

export type SessionMode = "sandbox" | "custom" | "speed_round" | "review" | "daily";

export interface PracticeFilters {
  modules: ("english" | "math")[];
  difficulties: Difficulty[];
  skills: string[];
  domains: string[];
}

export interface Session {
  sessionId: string;
  userId: string;
  module: "english" | "math";
  mode: SessionMode;
  startedAt: number;
  lastActiveAt: number;
  currentRating: number;
  ratingAtStart: number;
  questionCount: number;
  correctCount: number;
  streak: number;
  bestStreak: number;
  bufferedQuestions: QueuedQuestion[];
  targetedSkills: string[];
  targetedDomains?: string[];
  difficultyBias: "E" | "M" | "H" | null;
  practiceFilters?: PracticeFilters;
  timeLimitMs?: number;
  dateSeed?: string;
  expiresAt?: number;
}

export interface Response {
  userId: string;
  sessionId: string;
  questionId: string;
  selectedAnswer: string; // e.g. "A"
  isCorrect: boolean;
  timeSpentMs: number;
  answeredAt: number;
}

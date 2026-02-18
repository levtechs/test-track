import type { Module } from "@/types";
import type { SkillElo, QuestionRepetition } from "@/types/user";
import {
  USER_K,
  QUESTION_K_MAX,
  QUESTION_K_MIN,
  QUESTION_K_DECAY_COUNT,
  SKILL_K,
  DEFAULT_EASE_FACTOR,
  MIN_EASE_FACTOR,
  MAX_EASE_FACTOR,
  EASE_BONUS_CORRECT,
  EASE_PENALTY_WRONG,
  INTERVAL_FIRST,
  INTERVAL_SECOND,
} from "./constants";

export function expected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateUserRating(
  userRating: number,
  questionElo: number,
  isCorrect: boolean
): number {
  const exp = expected(userRating, questionElo);
  const actual = isCorrect ? 1 : 0;
  return Math.round(userRating + USER_K * (actual - exp));
}

export function updateQuestionElo(
  questionElo: number,
  userRating: number,
  eloAnswerCount: number,
  isCorrect: boolean
): { newElo: number; newAnswerCount: number } {
  const decay = Math.min(eloAnswerCount, QUESTION_K_DECAY_COUNT) / QUESTION_K_DECAY_COUNT;
  const k = Math.max(QUESTION_K_MIN, QUESTION_K_MAX * (1 - decay));
  const exp = expected(questionElo, userRating);
  const actual = isCorrect ? 0 : 1;
  return {
    newElo: Math.round(questionElo + k * (actual - exp)),
    newAnswerCount: eloAnswerCount + 1,
  };
}

export function ratingField(module: Module): "englishRating" | "mathRating" {
  return module === "english" ? "englishRating" : "mathRating";
}

export function updateSkillElo(
  isCorrect: boolean,
  current: SkillElo | undefined,
  questionElo: number
): SkillElo {
  const rating = current?.rating ?? 1100;
  const exp = expected(rating, questionElo);
  
  return {
    rating: Math.round(rating + SKILL_K * ((isCorrect ? 1 : 0) - exp)),
    questionCount: (current?.questionCount ?? 0) + 1,
    correctCount: (current?.correctCount ?? 0) + (isCorrect ? 1 : 0),
  };
}

export const DEFAULT_REPETITION: QuestionRepetition = {
  easeFactor: DEFAULT_EASE_FACTOR,
  interval: 0,
  repetitions: 0,
  lastReviewedAt: 0,
  nextReviewAt: 0,
};

export function updateRepetition(
  isCorrect: boolean,
  current: QuestionRepetition | undefined
): QuestionRepetition {
  const now = Date.now();
  const base = current ?? DEFAULT_REPETITION;
  
  if (isCorrect) {
    let newInterval: number;
    if (base.repetitions === 0) {
      newInterval = INTERVAL_FIRST;
    } else if (base.repetitions === 1) {
      newInterval = INTERVAL_SECOND;
    } else {
      newInterval = Math.round(base.interval * base.easeFactor);
    }
    
    return {
      easeFactor: Math.min(MAX_EASE_FACTOR, base.easeFactor + EASE_BONUS_CORRECT),
      interval: newInterval,
      repetitions: base.repetitions + 1,
      lastReviewedAt: now,
      nextReviewAt: now + newInterval * 24 * 60 * 60 * 1000,
    };
  } else {
    return {
      easeFactor: Math.max(MIN_EASE_FACTOR, base.easeFactor - EASE_PENALTY_WRONG),
      interval: 0,
      repetitions: 0,
      lastReviewedAt: now,
      nextReviewAt: now,
    };
  }
}

export function dynamicUserK(totalAttempts: number): number {
  const expBonus = Math.min(totalAttempts / 50, 1) * 16;
  return Math.max(16, USER_K - expBonus);
}

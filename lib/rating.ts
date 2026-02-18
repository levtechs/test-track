import type { Module } from "@/types";

/**
 * Elo rating calculations for users and questions.
 */

const USER_K = 32;
const QUESTION_K_MAX = 16;
const QUESTION_K_MIN = 4;
const QUESTION_K_DECAY_COUNT = 100;

/** Calculate expected score for player A against player B */
function expected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Update user rating after answering a question */
export function updateUserRating(
  userRating: number,
  questionElo: number,
  isCorrect: boolean
): number {
  const exp = expected(userRating, questionElo);
  const actual = isCorrect ? 1 : 0;
  return Math.round(userRating + USER_K * (actual - exp));
}

/** Update question Elo after a user answers it */
export function updateQuestionElo(
  questionElo: number,
  userRating: number,
  eloAnswerCount: number,
  isCorrect: boolean
): { newElo: number; newAnswerCount: number } {
  const decay = Math.min(eloAnswerCount, QUESTION_K_DECAY_COUNT) / QUESTION_K_DECAY_COUNT;
  const k = Math.max(QUESTION_K_MIN, QUESTION_K_MAX * (1 - decay));
  // From question's perspective: question "wins" if user gets it wrong
  const exp = expected(questionElo, userRating);
  const actual = isCorrect ? 0 : 1;
  return {
    newElo: Math.round(questionElo + k * (actual - exp)),
    newAnswerCount: eloAnswerCount + 1,
  };
}

/** Get the rating field name for a module */
export function ratingField(module: Module): "englishRating" | "mathRating" {
  return module === "english" ? "englishRating" : "mathRating";
}

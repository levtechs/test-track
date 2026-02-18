import type { Question, UserProfile, Session, SkillElo, QuestionRepetition } from "@/types";
import {
  W_DUE,
  W_SKILL_MATCH,
  W_DIFFICULTY,
  W_FRESHNESS,
  W_EXPLORE,
  CALIBRATION_SEQUENCE,
  DEFAULT_TARGET_SUCCESS_RATE,
  TARGET_SUCCESS_STREAK_5,
  TARGET_SUCCESS_STREAK_3,
  TARGET_SUCCESS_STRUGGLING,
  STREAK_THRESHOLD_CHALLENGE,
  STREAK_THRESHOLD_MODERATE,
  STRUGGLING_ACCURACY_THRESHOLD,
  DUE_SCORE_NEW,
  DUE_SCORE_OVERDUE,
  DUE_SCORE_DUE_TODAY,
  DUE_SCORE_NOT_DUE,
  EXPLORE_SCORE_NEW,
  EXPLORE_SCORE_MASTERED,
  EXPLORE_SCORE_LEARNING,
  FRESHNESS_SCORE_NEVER_SEEN,
  FRESHNESS_SCORE_OLD,
  FRESHNESS_STALE_THRESHOLD,
  DIFF_SCORE_MAX_DIFF,
  TOP_CANDIDATES_COUNT,
} from "./constants";

export interface RecommendationInput {
  candidates: Question[];
  userRating: number;
  userProfile: UserProfile | null;
  session: Session;
  skillElos: Record<string, SkillElo>;
  questionRepetitions: Record<string, QuestionRepetition>;
}

export interface ScoredQuestion {
  questionId: string;
  score: number;
}

function expected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function getTargetSuccessRate(
  streak: number,
  correctCount: number,
  questionCount: number
): number {
  if (questionCount === 0) return DEFAULT_TARGET_SUCCESS_RATE;
  
  const recentAccuracy = correctCount / questionCount;
  
  if (streak >= STREAK_THRESHOLD_CHALLENGE) return TARGET_SUCCESS_STREAK_5;
  if (streak >= STREAK_THRESHOLD_MODERATE) return TARGET_SUCCESS_STREAK_3;
  if (recentAccuracy < STRUGGLING_ACCURACY_THRESHOLD) return TARGET_SUCCESS_STRUGGLING;
  return DEFAULT_TARGET_SUCCESS_RATE;
}

export function calcDueScore(
  repetition: QuestionRepetition | undefined,
  now: number
): number {
  if (!repetition || repetition.repetitions === 0) {
    return DUE_SCORE_NEW;
  }
  if (repetition.nextReviewAt <= now) {
    return DUE_SCORE_OVERDUE;
  }
  const oneDay = 24 * 60 * 60 * 1000;
  if (repetition.nextReviewAt - now < oneDay) {
    return DUE_SCORE_DUE_TODAY;
  }
  return DUE_SCORE_NOT_DUE;
}

export function calcSkillMatchScore(
  questionSkill: string,
  skillElos: Record<string, SkillElo>,
  questionElo: number,
  targetSuccessRate: number = DEFAULT_TARGET_SUCCESS_RATE
): number {
  const skillElo = skillElos[questionSkill]?.rating ?? 1100;
  const exp = expected(skillElo, questionElo);
  return 1 - Math.abs(exp - targetSuccessRate);
}

export function calcDifficultyScore(
  userRating: number,
  questionElo: number
): number {
  const diff = Math.abs(userRating - questionElo);
  return 1 - Math.min(1, diff / DIFF_SCORE_MAX_DIFF);
}

export function calcExploreScore(
  questionId: string,
  repetitions: Record<string, QuestionRepetition>
): number {
  const rep = repetitions[questionId];
  if (!rep || rep.repetitions === 0) {
    return EXPLORE_SCORE_NEW;
  }
  if (rep.repetitions >= 3) {
    return EXPLORE_SCORE_MASTERED;
  }
  return EXPLORE_SCORE_LEARNING;
}

export function calcFreshnessScore(
  questionSkill: string,
  sessionSkillCounts: Map<string, number>,
  sessionQuestionCount: number
): number {
  const skillCount = sessionSkillCounts.get(questionSkill) ?? 0;
  if (skillCount === 0) {
    return FRESHNESS_SCORE_NEVER_SEEN;
  }
  if (sessionQuestionCount - skillCount > FRESHNESS_STALE_THRESHOLD) {
    return FRESHNESS_SCORE_OLD;
  }
  return 0.1 * Math.max(1, sessionQuestionCount - skillCount);
}

export function scoreQuestion(
  question: Question,
  userRating: number,
  skillElos: Record<string, SkillElo>,
  questionRepetitions: Record<string, QuestionRepetition>,
  sessionSkillCounts: Map<string, number>,
  sessionQuestionCount: number,
  streak: number = 0,
  correctCount: number = 0
): number {
  const now = Date.now();
  const questionElo = question.elo ?? 1100;
  const skill = question.skill;

  const targetSuccessRate = getTargetSuccessRate(streak, correctCount, sessionQuestionCount);
  const dueScore = calcDueScore(questionRepetitions[question.question_id], now);
  const skillMatchScore = calcSkillMatchScore(skill, skillElos, questionElo, targetSuccessRate);
  const difficultyScore = calcDifficultyScore(userRating, questionElo);
  const exploreScore = calcExploreScore(question.question_id, questionRepetitions);
  const freshnessScore = calcFreshnessScore(skill, sessionSkillCounts, sessionQuestionCount);

  return (
    W_DUE * dueScore +
    W_SKILL_MATCH * skillMatchScore +
    W_DIFFICULTY * difficultyScore +
    W_EXPLORE * exploreScore +
    W_FRESHNESS * freshnessScore
  );
}

export function weightedRandomPick(scored: ScoredQuestion[]): string {
  scored.sort((a, b) => b.score - a.score);
  
  const top = scored.slice(0, TOP_CANDIDATES_COUNT);
  const totalScore = top.reduce((sum, q) => sum + q.score, 0);

  if (totalScore === 0 || top.length === 0) {
    return scored[0]?.questionId ?? "";
  }

  let random = Math.random() * totalScore;
  for (const q of top) {
    random -= q.score;
    if (random <= 0) return q.questionId;
  }
  return top[0].questionId;
}

export function recommendQuestions(
  input: RecommendationInput,
  count: number = 1
): string[] {
  const {
    candidates,
    userRating,
    skillElos,
    questionRepetitions,
    session,
  } = input;

  const excludeSet = new Set(
    session.bufferedQuestions.map((q) => q.questionId)
  );

  let filtered = candidates.filter(
    (q) => q.module === session.module && !excludeSet.has(q.question_id)
  );

  if (filtered.length === 0) {
    filtered = candidates.filter(
      (q) => q.module === session.module
    );
  }

  if (filtered.length === 0) return [];

  if (session.questionCount < CALIBRATION_SEQUENCE.length) {
    const targetDifficulty = CALIBRATION_SEQUENCE[session.questionCount];
    const calibrationCandidates = filtered.filter(
      (q) => q.difficulty === targetDifficulty
    );
    if (calibrationCandidates.length > 0) {
      filtered = calibrationCandidates;
    }
  }

  const sessionSkillCounts = new Map<string, number>();
  session.bufferedQuestions.forEach((q) => {
    const qData = candidates.find((c) => c.question_id === q.questionId);
    if (qData?.skill) {
      sessionSkillCounts.set(
        qData.skill,
        (sessionSkillCounts.get(qData.skill) ?? 0) + 1
      );
    }
  });

  const scored: ScoredQuestion[] = filtered.map((q) => ({
    questionId: q.question_id,
    score: scoreQuestion(
      q,
      userRating,
      skillElos,
      questionRepetitions,
      sessionSkillCounts,
      session.questionCount,
      session.streak,
      session.correctCount
    ),
  }));

  const results: string[] = [];
  const remaining = [...scored];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const picked = weightedRandomPick(remaining);
    if (!picked) break;
    results.push(picked);
    const idx = remaining.findIndex((q) => q.questionId === picked);
    if (idx !== -1) remaining.splice(idx, 1);
  }

  return results;
}

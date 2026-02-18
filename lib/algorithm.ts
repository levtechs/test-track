import type { Question, UserProfile, Session } from "@/types";

/**
 * Question recommendation algorithm.
 * Scores candidates and selects next question for a session.
 */

// Scoring weights
const W_DIFFICULTY = 0.35;
const W_WEAKNESS = 0.25;
const W_PREVIOUSLY_WRONG = 0.15;
const W_FRESHNESS = 0.15;
const W_RANDOM = 0.10;

// Calibration sequence: first 5 questions use fixed difficulties
const CALIBRATION_SEQUENCE: Array<"E" | "M" | "H"> = ["E", "M", "E", "M", "H"];

interface ScoredQuestion {
  questionId: string;
  score: number;
}

/** Score a single candidate question */
function scoreQuestion(
  question: Question,
  userRating: number,
  skillStats: UserProfile["skillStats"],
  wrongQuestionIds: Set<string>,
  correctQuestionIds: Set<string>,
  sessionSkillCounts: Map<string, number>,
  sessionQuestionCount: number
): number {
  // 1. Difficulty match: how close is question elo to user rating
  const eloDiff = Math.abs(userRating - (question.elo || 1100));
  const difficultyScore = 1 - Math.min(1, eloDiff / 500);

  // 2. Skill weakness: Bayesian estimate of skill accuracy (lower = weaker)
  const skill = question.skill;
  const stats = skillStats[skill];
  const weaknessScore = stats
    ? 1 - (stats.correct + 1) / (stats.total + 2)
    : 0.6; // Unknown skill gets moderate priority

  // 3. Previously wrong: reward re-testing failed questions
  let previouslyWrongScore = 0.3; // Never seen
  if (wrongQuestionIds.has(question.question_id)) {
    previouslyWrongScore = 1.0;
  } else if (correctQuestionIds.has(question.question_id)) {
    previouslyWrongScore = 0.0;
  }

  // 4. Skill freshness: prefer skills not recently seen in session
  const skillCount = sessionSkillCounts.get(skill) || 0;
  let freshnessScore: number;
  if (skillCount === 0) {
    freshnessScore = 1.0; // Never in session
  } else if (sessionQuestionCount - skillCount > 5) {
    freshnessScore = 0.7; // Seen but not recently
  } else {
    freshnessScore = 0.1 * Math.max(1, sessionQuestionCount - skillCount);
  }

  // 5. Randomness
  const randomScore = Math.random();

  return (
    W_DIFFICULTY * difficultyScore +
    W_WEAKNESS * weaknessScore +
    W_PREVIOUSLY_WRONG * previouslyWrongScore +
    W_FRESHNESS * freshnessScore +
    W_RANDOM * randomScore
  );
}

/** Select next question from candidates using weighted random from top 5 */
function weightedRandomPick(scored: ScoredQuestion[]): string {
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top 5
  const top = scored.slice(0, 5);
  const totalScore = top.reduce((sum, q) => sum + q.score, 0);

  if (totalScore === 0) {
    return top[0].questionId;
  }

  let random = Math.random() * totalScore;
  for (const q of top) {
    random -= q.score;
    if (random <= 0) return q.questionId;
  }
  return top[0].questionId;
}

export interface RecommendationInput {
  candidates: Question[];
  userRating: number;
  userProfile: UserProfile | null;
  session: Session;
  wrongQuestionIds: Set<string>;
  correctQuestionIds: Set<string>;
}

/** Get the next question(s) to recommend */
export function recommendQuestions(
  input: RecommendationInput,
  count: number = 1
): string[] {
  const {
    candidates,
    userRating,
    userProfile,
    session,
    wrongQuestionIds,
    correctQuestionIds,
  } = input;

  const skillStats = userProfile?.skillStats || {};
  const excludeSet = new Set([
    ...session.bufferedQuestions.map((q) => q.questionId),
  ]);

  // Filter candidates
  let filtered = candidates.filter(
    (q) => q.module === session.module && !excludeSet.has(q.question_id)
  );

  if (filtered.length === 0) {
    // Fallback: allow re-use of questions not in buffer
    filtered = candidates.filter(
      (q) =>
        q.module === session.module &&
        !excludeSet.has(q.question_id)
    );
  }

  if (filtered.length === 0) return [];

  // Calibration phase: first 5 questions use fixed difficulty
  if (session.questionCount < CALIBRATION_SEQUENCE.length) {
    const targetDifficulty = CALIBRATION_SEQUENCE[session.questionCount];
    const calibrationCandidates = filtered.filter(
      (q) => q.difficulty === targetDifficulty
    );
    if (calibrationCandidates.length > 0) {
      // Pick from calibration candidates with skill diversity
      filtered = calibrationCandidates;
    }
  }

  // Build skill count map from session history
  const sessionSkillCounts = new Map<string, number>();
  // We don't have full question data for history, so use what we have
  // This is approximate - in practice the API will track this

  // Score all candidates
  const scored: ScoredQuestion[] = filtered.map((q) => ({
    questionId: q.question_id,
    score: scoreQuestion(
      q,
      userRating,
      skillStats,
      wrongQuestionIds,
      correctQuestionIds,
      sessionSkillCounts,
      session.questionCount
    ),
  }));

  // Pick requested count
  const results: string[] = [];
  const remaining = [...scored];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const picked = weightedRandomPick(remaining);
    results.push(picked);
    const idx = remaining.findIndex((q) => q.questionId === picked);
    if (idx !== -1) remaining.splice(idx, 1);
  }

  return results;
}

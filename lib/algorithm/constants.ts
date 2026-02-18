/**
 * Algorithm Configuration Constants
 * 
 * This file centralizes all tunable parameters for the question recommendation
 * algorithm. Tweak these values to adjust algorithm behavior.
 */

// =============================================================================
// ELO RATING SYSTEM
// =============================================================================

/**
 * K-factor for user rating updates.
 * Higher = faster convergence but more volatility.
 * - 32: Fast convergence for new users
 * - 16: Stable for experienced users
 * @see ALGORITHM.md#Rating-Update-Formula
 */
export const USER_K = 32;

/**
 * Maximum K-factor for question difficulty updates.
 * Questions start with higher K and converge as they get more answers.
 */
export const QUESTION_K_MAX = 16;

/**
 * Minimum K-factor for question difficulty updates.
 * After many responses, question difficulty stabilizes.
 */
export const QUESTION_K_MIN = 4;

/**
 * Number of answers after which question K-factor fully decays.
 * At 100 answers, K reaches QUESTION_K_MIN.
 */
export const QUESTION_K_DECAY_COUNT = 100;

/**
 * K-factor for per-skill Elo updates.
 * Separate from global Elo to track skill-specific ability.
 * @see ALGORITHM.md#Per-Skill-Elo-Tracking
 */
export const SKILL_K = 20;

// -----------------------------------------------------------------------------
// Initial Elo values based on difficulty
// These are starting points - question Elo converges based on user performance
// -----------------------------------------------------------------------------

/** Initial Elo for Easy difficulty questions */
export const ELO_EASY = 900;

/** Initial Elo for Medium difficulty questions */
export const ELO_MEDIUM = 1100;

/** Initial Elo for Hard difficulty questions */
export const ELO_HARD = 1300;

/** Default Elo when question has no defined difficulty */
export const ELO_DEFAULT = 1100;

// =============================================================================
// SPACED REPETITION (SM-2 Algorithm)
// =============================================================================

/**
 * Default ease factor for new questions.
 * Represents how "easy" a question is to remember.
 * Range: 1.3 (hard) to 2.5 (easy).
 * @see ALGORITHM.md#SM-2-Algorithm
 */
export const DEFAULT_EASE_FACTOR = 2.5;

/**
 * Minimum ease factor (floor).
 * Questions that are consistently wrong have their ease reduced.
 */
export const MIN_EASE_FACTOR = 1.3;

/**
 * Maximum ease factor (ceiling).
 * Questions that are consistently correct have their ease increased.
 */
export const MAX_EASE_FACTOR = 2.5;

/**
 * Amount to increase ease factor on correct answer.
 */
export const EASE_BONUS_CORRECT = 0.1;

/**
 * Amount to decrease ease factor on wrong answer.
 */
export const EASE_PENALTY_WRONG = 0.2;

// -----------------------------------------------------------------------------
// Review intervals (in days)
// -----------------------------------------------------------------------------

/** First correct answer: review in 1 day */
export const INTERVAL_FIRST = 1;

/** Second correct answer: review in 3 days */
export const INTERVAL_SECOND = 3;

/**
 * Ease factor multiplier for subsequent correct answers.
 * interval = interval * easeFactor
 */
export const INTERVAL_MULTIPLIER = 2.0;

// =============================================================================
// QUESTION SELECTION WEIGHTS
// =============================================================================

/**
 * How much "due for review" matters when selecting questions.
 * - Due questions (nextReviewAt <= now) get highest priority
 * - Questions due today get medium priority
 * - Questions not yet due get low priority
 * @see ALGORITHM.md#Due-Score
 */
export const W_DUE = 0.25;

/**
 * How much skill-targeting matters.
 * - Targets questions where expected success rate is ~80%
 * - Balances challenge with learning opportunity
 * @see ALGORITHM.md#Skill-Match-Score
 */
export const W_SKILL_MATCH = 0.25;

/**
 * How much difficulty matching matters.
 * - Prefers questions close to user's current ability
 * - Prevents frustration from too-hard questions
 * @see ALGORITHM.md#Difficulty-Score
 */
export const W_DIFFICULTY = 0.15;

/**
 * How much freshness matters.
 * - Prefers skills not seen recently in current session
 * - Prevents getting stuck on one topic
 * @see ALGORITHM.md#Freshness-Score
 */
export const W_FRESHNESS = 0.20;

/**
 * How much "exploration" matters.
 * - Prefers new/unseen questions
 * - Rewards correctly-answered questions less (already mastered)
 * - Penalizes wrong answers (need more practice)
 * @see ALGORITHM.md#Explore-Score
 */
export const W_EXPLORE = 0.15;

// =============================================================================
// FLOW STATE MODULATION
// =============================================================================

/**
 * Default target success rate.
 * Questions are selected where expected success ≈ this value.
 * 80% is optimal for learning (challenging but not frustrating).
 * @see ALGORITHM.md#Flow-State-Modulation
 */
export const DEFAULT_TARGET_SUCCESS_RATE = 0.80;

/**
 * Target success rate when user is on a roll (streak >= 5).
 * Increase challenge - they can handle harder questions.
 */
export const TARGET_SUCCESS_STREAK_5 = 0.70;

/**
 * Minimum streak to trigger challenge mode.
 */
export const STREAK_THRESHOLD_CHALLENGE = 5;

/**
 * Target success rate when user has moderate streak (streak >= 3).
 * Slightly increase challenge.
 */
export const TARGET_SUCCESS_STREAK_3 = 0.75;

/**
 * Minimum streak for moderate challenge.
 */
export const STREAK_THRESHOLD_MODERATE = 3;

/**
 * Target success rate when user is struggling.
 * Build confidence with easier questions.
 */
export const TARGET_SUCCESS_STRUGGLING = 0.85;

/**
 * Recent accuracy threshold below which user is "struggling".
 */
export const STRUGGLING_ACCURACY_THRESHOLD = 0.50;

// =============================================================================
// SCORING HELPERS
// =============================================================================

/**
 * Score when question is new (never seen / no repetition data).
 * Gets moderate priority since we want to learn about new questions.
 */
export const DUE_SCORE_NEW = 0.3;

/**
 * Score when question is overdue (nextReviewAt <= now).
 * Highest priority - must review.
 */
export const DUE_SCORE_OVERDUE = 1.0;

/**
 * Score when question is due today.
 * High but not critical priority.
 */
export const DUE_SCORE_DUE_TODAY = 0.7;

/**
 * Score when question is not yet due.
 * Low priority - skip unless needed.
 */
export const DUE_SCORE_NOT_DUE = 0.2;

/**
 * Score when question has never been seen (for explore score).
 * High priority - need to assess ability.
 */
export const EXPLORE_SCORE_NEW = 0.8;

/**
 * Score when question has been mastered (repetitions >= 3).
 * Low priority - already know this well.
 */
export const EXPLORE_SCORE_MASTERED = 0.2;

/**
 * Score when question is in learning phase.
 * Moderate priority.
 */
export const EXPLORE_SCORE_LEARNING = 0.5;

/**
 * Score when skill has never been seen in session.
 * Highest freshness priority.
 */
export const FRESHNESS_SCORE_NEVER_SEEN = 1.0;

/**
 * Score when skill was seen long ago (>5 questions ago).
 * Moderate freshness.
 */
export const FRESHNESS_SCORE_OLD = 0.7;

/**
 * Number of questions before skill is considered "stale" for freshness.
 * After this many questions since last seeing a skill, freshness increases.
 */
export const FRESHNESS_STALE_THRESHOLD = 5;

// -----------------------------------------------------------------------------
// Difficulty scoring
// -----------------------------------------------------------------------------

/**
 * Elo difference at which difficulty score reaches 0.
 * If user is 500+ points away from question, score is 0.
 */
export const DIFF_SCORE_MAX_DIFF = 500;

// =============================================================================
// CALIBRATION PHASE
// =============================================================================

/**
 * Fixed difficulty sequence for new users.
 * First 5 questions use this pattern to quickly estimate ability.
 * @see ALGORITHM.md#Calibration-Phase
 */
export const CALIBRATION_SEQUENCE: Array<"E" | "M" | "H"> = ["E", "M", "E", "M", "H"];

// =============================================================================
// SELECTION CONSTRAINTS
// =============================================================================

/**
 * Number of top-scored questions to consider for weighted random selection.
 * Prevents always picking the absolute highest-scored question.
 */
export const TOP_CANDIDATES_COUNT = 5;

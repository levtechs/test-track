# SAT Question Recommendation Algorithm

This document explains how the question recommendation algorithm works, including the Elo rating system, spaced repetition, and skill-based targeting.

## Overview

The algorithm selects the next question to present to a user based on multiple factors:

1. **Difficulty matching** - Questions should match the user's current ability
2. **Skill targeting** - Focus on weaker skills while maintaining strengths
3. **Spaced repetition** - Schedule question reviews at optimal intervals
4. **Engagement** - Keep sessions varied and prevent burnout
5. **Exploration** - Introduce new questions to discover gaps

---

## Elo Rating System

### Concept

The Elo rating system, originally designed for chess, models both user ability and question difficulty on the same scale. Higher ratings indicate greater ability/difficulty.

- **User rating**: Starts at 1000, adjusts after each answer
- **Question difficulty**: Starts at 900/1100/1300 based on difficulty (E/M/H), then converges based on user performance
- **Scale**: ~800 (easy) to ~1500 (hard)

### Question Difficulty

Questions start with Elo based on their defined difficulty:

| Difficulty | Initial Elo |
|-----------|-------------|
| E (Easy) | 900 |
| M (Medium) | 1100 |
| H (Hard) | 1300 |

This initial Elo is then adjusted after each user response, converging to a more accurate difficulty based on aggregate performance.

### Rating Update Formula

```
Expected = 1 / (1 + 10^((QuestionElo - UserElo) / 400))

NewUserElo = UserElo + K * (Actual - Expected)
NewQuestionElo = QuestionElo + K * (Expected - Actual)

Where:
- Actual = 1 if correct, 0 if wrong
- K = 32 for users, 4-16 for questions (decays with answer count)
```

### Dynamic K-Factor

New users have higher K (32) for faster convergence. After 50+ questions, K decreases to 16 for stability.

---

## Per-Skill Elo Tracking

### Why Per-Skill?

A user's overall Elo doesn't capture their strengths and weaknesses. A user might be:
- Strong in Algebra (Elo 1300)
- Weak in Geometry (Elo 900)
- Average overall (Elo 1100)

### How It Works

Each user tracks separate Elo ratings for every skill:

```typescript
skillElos: {
  "Inferences": { rating: 1250, questionCount: 20, correctCount: 15 },
  "Linear Equations": { rating: 950, questionCount: 12, correctCount: 6 },
  // ...
}
```

When answering a question tagged with a skill, that skill's Elo updates independently:

```
Question: "Solve for x: 2x + 5 = 15"
Skill: "Linear Equations"

If correct:
- Global Elo: +K * (1 - expected)
- Skill Elo["Linear Equations"]: +K_skill * (1 - expected_skill)
- Question Elo: -K * (1 - expected)  [becomes "easier"]
```

This allows the algorithm to:
1. Present harder Algebra questions to someone strong in Algebra
2. Still show appropriately-difficult questions overall
3. Display skill breakdowns in the profile

---

## Spaced Repetition (SM-2 Algorithm)

### Concept

Questions should be reviewed at optimal intervals to maximize long-term retention. The SuperMemo SM-2 algorithm schedules reviews based on performance:

1. First correct answer → review in 1 day
2. Second correct → review in 3 days
3. Subsequent correct → interval × ease factor
4. Wrong answer → reset to 0, show again soon

### Data Structure

```typescript
questionRepetitions: {
  "question_id_123": {
    easeFactor: 2.5,      // How easy this question is to remember
    interval: 7,          // Days until next review
    repetitions: 3,       // Consecutive correct answers
    lastReviewedAt: 1700000000000,
    nextReviewAt: 1700070000000,  // lastReviewedAt + interval * 86400000
  }
}
```

### Update Rules

**On Correct Answer:**
```
if repetitions == 0: interval = 1
else if repetitions == 1: interval = 3
else: interval = interval * easeFactor

repetitions += 1
easeFactor = min(2.5, easeFactor + 0.1)
```

**On Wrong Answer:**
```
repetitions = 0
interval = 0  // Show again soon
easeFactor = max(1.3, easeFactor - 0.2)
```

---

## Question Selection Algorithm

### Step 1: Categorize Questions

All available questions are sorted into buckets:

| Bucket | Priority | Criteria |
|--------|----------|----------|
| **Due** | Highest | `nextReviewAt <= now` |
| **Learning** | Medium | Wrong 1-2x, not due |
| **New** | Low | Never seen or mastered |

### Step 2: Calculate Scores

Each question receives a weighted score:

```typescript
finalScore =
  W_DUE * dueScore +           // 0.25
  W_SKILL * skillMatchScore +  // 0.25
  W_DIFFICULTY * diffScore +   // 0.15
  W_FRESHNESS * freshness +   // 0.20
  W_EXPLORE * exploreScore     // 0.15
```

#### Due Score
```typescript
if (!repetition) return 0.3;           // New question
if (nextReviewAt <= now) return 1.0;   // Overdue
if (nextReviewAt - now < 1day) return 0.7; // Due today
return 0.2;                            // Not due yet
```

#### Skill Match Score
```typescript
skillElo = userSkillElos[skill]?.rating ?? 1100;
expected = 1 / (1 + 10^((questionElo - skillElo) / 400));

// Target 80% expected success for optimal learning
skillMatchScore = 1 - abs(expected - 0.80);
```

#### Difficulty Score
```typescript
globalDiff = abs(userRating - questionElo);
diffScore = 1 - min(1, globalDiff / 500);
```

#### Freshness Score
```typescript
// Prefer skills not seen recently in session
if (skillCount === 0) return 1.0;
if (sessionQuestionCount - skillCount > 5) return 0.7;
return 0.1;
```

#### Explore Score
```typescript
if (!seenBefore) return 0.8;
if (wasCorrect) return 0.2;
return 0.5;
```

### Step 3: Flow State Modulation

The algorithm adjusts difficulty based on recent performance:

- **Streak ≥ 5 correct**: Target 70% success (challenge)
- **Streak ≥ 3 correct**: Target 75% success
- **Recent accuracy < 50%**: Target 85% success (confidence building)
- **Default**: Target 80% success

### Step 4: Selection with Constraints

After scoring, questions are selected with these constraints:
- Maximum ~60% from any single skill
- No duplicate questions in same session
- Prefer due questions when available

---

## Data Storage

### Authenticated Users (Firestore)

**`users/{uid}`** collection:
```typescript
interface UserProfile {
  uid: string;
  englishRating: number;
  mathRating: number;
  totalQuestions: number;
  totalCorrect: number;
  
  // Skill-based tracking
  skillElos: Record<string, SkillElo>;
  questionRepetitions: Record<string, QuestionRepetition>;
  
  createdAt: number;
  updatedAt: number;
}
```

### Guest Users (localStorage)

Guest data mirrors Firestore structure in localStorage:

```
Key: sat_guest_{module}_data
Value: {
  uid: string;
  englishRating: number;
  mathRating: number;
  skillElos: Record<string, SkillElo>;
  questionRepetitions: Record<string, QuestionRepetition>;
  ...
}
```

On login, guest data is migrated to Firestore.

---

## Skill Hierarchy

Questions are organized into a hierarchy for better profile display:

**English:**
```
English
├── Reading
│   ├── Information and Ideas
│   │   ├── Inferences
│   │   ├── Command of Evidence
│   │   └── Main Idea
│   ├── Craft and Structure
│   │   ├── Cross-Text Connections
│   │   ├── Word Connections
│   │   └── Text Structure
│   └── Expression of Ideas
│       ├── Transitions
│       ├── Verb Tense
│       └── Concision
```

**Math:**
```
Math
├── Algebra
│   ├── Linear Equations
│   ├── Quadratic Equations
│   └── Functions
├── Problem Solving
├── Data Analysis
└── Advanced Math
```

The profile page displays this hierarchy with:
- Color-coded ratings (green > 1200, yellow 900-1200, red < 900)
- Collapsible categories
- Accuracy percentages per skill

---

## Session Flow

1. **Start Session**: Load user's ratings, skill Elos, repetitions
2. **Get Questions**: Algorithm scores candidates, selects top 3
3. **Present Question**: Show question (global Elo displayed only)
4. **Submit Answer**: 
   - Update global Elo
   - Update skill Elo (for question's skill)
   - Update question repetition (SM-2)
   - Update question Elo
5. **Next Question**: Re-score and select
6. **End Session**: Save all updates to Firestore/localStorage

---

## Calibration Phase

For new users (first 5 questions), the algorithm uses fixed difficulty:

```typescript
const CALIBRATION_SEQUENCE = ["E", "M", "E", "M", "H"];
```

This ensures quick ability estimation.

---

## Future Improvements

Potential enhancements:

1. **Glicko-2**: Add rating deviation (uncertainty) for more accurate estimates
2. **Discrimination Parameter**: Some questions better differentiate ability levels
3. **A/B Testing**: Instrument algorithm for online experimentation
4. **Engagement Modeling**: Track which question types users enjoy
5. **Time-Based Scheduling**: Adjust intervals based on time of day

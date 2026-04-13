import type { SkillElo, EstimatedScore } from "@/types";
import { getSkillsByModule, SKILL_HIERARCHY } from "@/lib/skills";

const SAT_CATEGORY_WEIGHTS: Record<string, number> = {
  "Information and Ideas": 0.26,
  "Craft and Structure": 0.28,
  "Expression of Ideas": 0.28,
  "Standard English Conventions": 0.18,
  "Algebra": 0.35,
  "Problem Solving and Data Analysis": 0.15,
  "Advanced Math": 0.35,
  "Geometry and Trigonometry": 0.15,
};

const CONFIDENCE_QUESTIONS_TARGET = 100;

function eloToScaledScore(elo: number): number {
  const estimatedScore = elo / 2;
  const roundedToNearestTen = Math.round(estimatedScore / 10) * 10;

  return Math.max(200, Math.min(800, roundedToNearestTen));
}

function calculateSkillElo(
  skillElos: Record<string, SkillElo>,
  category: string
): { elo: number; questionCount: number; weight: number } {
  const categorySkills = SKILL_HIERARCHY.find((h) => h.category === category);
  if (!categorySkills) {
    return { elo: 1100, questionCount: 0, weight: 0 };
  }

  let totalElo = 0;
  let totalQuestions = 0;
  let skillsWithData = 0;

  for (const skill of categorySkills.skills) {
    const skillData = skillElos[skill];
    if (skillData && skillData.questionCount > 0) {
      totalElo += skillData.rating;
      totalQuestions += skillData.questionCount;
      skillsWithData++;
    }
  }

  const avgElo = skillsWithData > 0 ? totalElo / skillsWithData : 1100;
  const weight = SAT_CATEGORY_WEIGHTS[category] ?? 0.25;

  return { elo: avgElo, questionCount: totalQuestions, weight };
}

export function estimateSectionScore(
  skillElos: Record<string, SkillElo> | undefined,
  module: "english" | "math",
  moduleRating?: number
): EstimatedScore {
  const ratingForEstimate = moduleRating ?? 1000;

  if (!skillElos || Object.keys(skillElos).length === 0) {
    return {
      score: eloToScaledScore(ratingForEstimate),
      confidence: 0.1,
      rawAccuracy: Math.round((1 / (1 + Math.pow(10, (1100 - ratingForEstimate) / 400))) * 100) / 100,
      calculatedAt: Date.now(),
    };
  }

  const hierarchies = getSkillsByModule(module);
  let totalQuestions = 0;

  for (const group of hierarchies) {
    const { questionCount } = calculateSkillElo(
      skillElos,
      group.category
    );
    totalQuestions += questionCount;
  }

  const score = eloToScaledScore(ratingForEstimate);
  const confidence = Math.min(1, totalQuestions / CONFIDENCE_QUESTIONS_TARGET);
  const rawAccuracy = 1 / (1 + Math.pow(10, (1100 - ratingForEstimate) / 400));

  return {
    score,
    confidence: Math.round(confidence * 100) / 100,
    rawAccuracy: Math.round(rawAccuracy * 100) / 100,
    calculatedAt: Date.now(),
  };
}

export function estimateTotalScore(
  skillElos: Record<string, SkillElo> | undefined,
  ratings?: { english?: number; math?: number }
): { total: number; english: EstimatedScore; math: EstimatedScore } {
  const english = estimateSectionScore(skillElos, "english", ratings?.english);
  const math = estimateSectionScore(skillElos, "math", ratings?.math);
  const total = english.score + math.score;

  return { total, english, math };
}

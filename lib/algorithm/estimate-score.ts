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
  const minElo = 700;
  const maxElo = 1500;
  const minScore = 200;
  const maxScore = 800;

  const normalized = Math.max(0, Math.min(1, (elo - minElo) / (maxElo - minElo)));
  const scaled = minScore + (maxScore - minScore) * Math.pow(normalized, 0.8);

  return Math.round(Math.max(200, Math.min(800, scaled)));
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

function calculateModuleConfidence(
  skillElos: Record<string, SkillElo>,
  module: "english" | "math"
): number {
  const hierarchies = getSkillsByModule(module);
  let totalQuestions = 0;

  for (const group of hierarchies) {
    for (const skill of group.skills) {
      totalQuestions += skillElos[skill]?.questionCount ?? 0;
    }
  }

  return Math.min(1, totalQuestions / CONFIDENCE_QUESTIONS_TARGET);
}

export function estimateSectionScore(
  skillElos: Record<string, SkillElo> | undefined,
  module: "english" | "math"
): EstimatedScore {
  if (!skillElos || Object.keys(skillElos).length === 0) {
    return {
      score: 500,
      confidence: 0.1,
      rawAccuracy: 0.5,
      calculatedAt: Date.now(),
    };
  }

  const hierarchies = getSkillsByModule(module);
  let weightedElo = 0;
  let totalWeight = 0;
  let totalQuestions = 0;

  for (const group of hierarchies) {
    const { elo, questionCount, weight } = calculateSkillElo(
      skillElos,
      group.category
    );

    const skillConfidence = Math.min(1, questionCount / 20);
    const effectiveWeight = weight * (0.5 + 0.5 * skillConfidence);

    weightedElo += elo * effectiveWeight;
    totalWeight += effectiveWeight;
    totalQuestions += questionCount;
  }

  const avgElo = totalWeight > 0 ? weightedElo / totalWeight : 1100;
  const score = eloToScaledScore(avgElo);
  const confidence = Math.min(1, totalQuestions / CONFIDENCE_QUESTIONS_TARGET);
  const rawAccuracy = 1 / (1 + Math.pow(10, (1100 - avgElo) / 400));

  return {
    score,
    confidence: Math.round(confidence * 100) / 100,
    rawAccuracy: Math.round(rawAccuracy * 100) / 100,
    calculatedAt: Date.now(),
  };
}

export function estimateTotalScore(
  skillElos: Record<string, SkillElo> | undefined
): { total: number; english: EstimatedScore; math: EstimatedScore } {
  const english = estimateSectionScore(skillElos, "english");
  const math = estimateSectionScore(skillElos, "math");
  const total = english.score + math.score;

  return { total, english, math };
}

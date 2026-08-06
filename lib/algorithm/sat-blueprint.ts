/**
 * Operational counts and weights aligned to the Digital SAT Suite assessment
 * framework (domain percentages; within-domain splits follow SKILL_HIERARCHY).
 */
import type { SkillHierarchy } from "@/lib/skills";
import { SKILL_HIERARCHY } from "@/lib/skills";

/** Scored RW items per section (excluding 4 embedded pretest). */
export const RW_OPERATIONAL_TOTAL = 50;

/** Scored Math items per section (excluding 4 embedded pretest). */
export const MATH_OPERATIONAL_TOTAL = 40;

/** Midpoints of framework ranges: RW 26% / 28% / 20% / 26% of 50. */
const RW_DOMAIN_TOTALS: Record<string, number> = {
  "Information and Ideas": 13,
  "Craft and Structure": 14,
  "Expression of Ideas": 10,
  "Standard English Conventions": 13,
};

/** Midpoints: Math ~35% / 35% / 15% / 15% of 40. */
const MATH_DOMAIN_TOTALS: Record<string, number> = {
  Algebra: 14,
  "Advanced Math": 14,
  "Problem Solving and Data Analysis": 6,
  "Geometry and Trigonometry": 6,
};

function allocateAcrossSkills(total: number, skills: readonly string[]): Record<string, number> {
  if (skills.length === 0 || total <= 0) return {};
  const base = Math.floor(total / skills.length);
  let rem = total % skills.length;
  const out: Record<string, number> = {};
  for (let i = 0; i < skills.length; i++) {
    out[skills[i]] = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
  }
  return out;
}

function blueprintForDomains(
  groups: SkillHierarchy[],
  domainTotals: Record<string, number>
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const g of groups) {
    const t = domainTotals[g.category];
    if (t === undefined || t <= 0) continue;
    const part = allocateAcrossSkills(t, g.skills);
    Object.assign(weights, part);
  }
  return weights;
}

const ENGLISH_GROUPS = SKILL_HIERARCHY.filter((h) => h.module === "english");
const MATH_GROUPS = SKILL_HIERARCHY.filter((h) => h.module === "math");

/** Expected operational counts per tagged skill — sums to RW_OPERATIONAL_TOTAL. */
export const RW_SKILL_WEIGHTS: Record<string, number> = blueprintForDomains(
  ENGLISH_GROUPS,
  RW_DOMAIN_TOTALS
);

/** Expected operational counts per tagged skill — sums to MATH_OPERATIONAL_TOTAL. */
export const MATH_SKILL_WEIGHTS: Record<string, number> = blueprintForDomains(
  MATH_GROUPS,
  MATH_DOMAIN_TOTALS
);

export function getSkillWeights(module: "english" | "math"): Record<string, number> {
  return module === "english" ? RW_SKILL_WEIGHTS : MATH_SKILL_WEIGHTS;
}

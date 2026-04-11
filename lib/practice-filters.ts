import type { Module, Question, Difficulty } from "@/types";
import type { PracticeFilters } from "@/types/user";

const DIFFICULTIES: Difficulty[] = ["E", "M", "H"];
const MODULES: Module[] = ["english", "math"];

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizeModules(modules?: Module[] | null): Module[] {
  return uniqueSorted((modules || []).filter((module): module is Module => MODULES.includes(module))) as Module[];
}

function normalizeDifficulties(difficulties?: Difficulty[] | null): Difficulty[] {
  return uniqueSorted((difficulties || []).filter((difficulty): difficulty is Difficulty => DIFFICULTIES.includes(difficulty))) as Difficulty[];
}

export function normalizePracticeFilters(filters?: Partial<PracticeFilters> | null): PracticeFilters {
  return {
    modules: normalizeModules(filters?.modules),
    difficulties: normalizeDifficulties(filters?.difficulties),
    skills: uniqueSorted((filters?.skills || []).map((skill) => skill.trim()).filter(Boolean)),
    domains: uniqueSorted((filters?.domains || []).map((domain) => domain.trim()).filter(Boolean)),
  };
}

export function hasPracticeFilters(filters?: Partial<PracticeFilters> | null): boolean {
  const normalized = normalizePracticeFilters(filters);
  return normalized.modules.length > 0
    || normalized.difficulties.length > 0
    || normalized.skills.length > 0
    || normalized.domains.length > 0;
}

export function arePracticeFiltersEqual(
  left?: Partial<PracticeFilters> | null,
  right?: Partial<PracticeFilters> | null
): boolean {
  const normalizedLeft = normalizePracticeFilters(left);
  const normalizedRight = normalizePracticeFilters(right);

  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

export function filterQuestionsForPractice(
  questions: Question[],
  module: Module,
  filters?: Partial<PracticeFilters> | null
): Question[] {
  const normalized = normalizePracticeFilters(filters);
  const allowedModules = normalized.modules.length > 0 ? normalized.modules : [module];

  return questions.filter((question) => {
    if (!allowedModules.includes(question.module)) return false;
    if (normalized.difficulties.length > 0 && !normalized.difficulties.includes(question.difficulty)) return false;
    if (normalized.skills.length > 0 && !normalized.skills.includes(question.skill)) return false;
    if (normalized.domains.length > 0 && !normalized.domains.includes(question.domain)) return false;
    return true;
  });
}

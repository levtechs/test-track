export interface SkillHierarchy {
  category: string;
  module: "english" | "math";
  skills: string[];
}

export const SKILL_HIERARCHY: SkillHierarchy[] = [
  // English / Reading & Writing
  {
    category: "Information and Ideas",
    module: "english",
    skills: [
      "Inferences",
      "Command of Evidence",
      "Main Idea",
      "Central Idea",
      "Quantitative Reasoning",
    ],
  },
  {
    category: "Craft and Structure",
    module: "english",
    skills: [
      "Cross-Text Connections",
      "Word Connections",
      "Text Structure and Purpose",
      "Rhetorical Synthesis",
      "Vocabulary",
    ],
  },
  {
    category: "Expression of Ideas",
    module: "english",
    skills: [
      "Transitions",
      "Verb Tense",
      "Pronouns",
      "Modifiers",
      "Concision",
      "Development",
      "Organization",
    ],
  },
  {
    category: "Standard English Conventions",
    module: "english",
    skills: [
      "Sentence Structure",
      "Punctuation",
      "Usage",
      "Agreement",
    ],
  },
  // Math
  {
    category: "Algebra",
    module: "math",
    skills: [
      "Linear Equations",
      "Linear Functions",
      "Inequalities",
      "Systems of Linear Equations",
      "Quadratic Equations",
    ],
  },
  {
    category: "Problem Solving and Data Analysis",
    module: "math",
    skills: [
      "Ratios and Proportions",
      "Percentages",
      "Statistics",
      "Probability",
      "Data Interpretation",
    ],
  },
  {
    category: "Advanced Math",
    module: "math",
    skills: [
      "Non-Linear Equations",
      "Functions",
      "Polynomials",
      "Rational Expressions",
      "Radicals",
    ],
  },
  {
    category: "Geometry and Trigonometry",
    module: "math",
    skills: [
      "Lines and Angles",
      "Triangles",
      "Circles",
      "Polygons",
      "Trigonometry",
      "Complex Numbers",
    ],
  },
];

export function getModuleForSkill(skill: string): "english" | "math" | null {
  for (const group of SKILL_HIERARCHY) {
    if (group.skills.includes(skill)) {
      return group.module;
    }
  }
  return null;
}

export function getCategoryForSkill(skill: string): string | null {
  for (const group of SKILL_HIERARCHY) {
    if (group.skills.includes(skill)) {
      return group.category;
    }
  }
  return null;
}

export function getSkillsByModule(module: "english" | "math"): SkillHierarchy[] {
  return SKILL_HIERARCHY.filter((h) => h.module === module);
}

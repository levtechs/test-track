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
      "Central Ideas and Details",
      "Quantitative Reasoning",
    ],
  },
  {
    category: "Craft and Structure",
    module: "english",
    skills: [
      "Cross-Text Connections",
      "Words in Context",
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
      "Boundaries",
      "Development",
      "Organization",
    ],
  },
  {
    category: "Standard English Conventions",
    module: "english",
    skills: [
      "Form, Structure, and Sense",
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
      "Linear equations in one variable",
      "Linear equations in two variables",
      "Linear functions",
      "Linear inequalities in one or two variables",
      "Systems of two linear equations in two variables",
      "Quadratic Equations",
    ],
  },
  {
    category: "Problem Solving and Data Analysis",
    module: "math",
    skills: [
      "Ratios, rates, proportional relationships, and units",
      "Percentages",
      "One-variable data: Distributions and measures of center and spread",
      "Inference from sample statistics and margin of error ",
      "Evaluating statistical claims: Observational studies and experiments ",
      "Probability and conditional probability",
      "Two-variable data: Models and scatterplots",
    ],
  },
  {
    category: "Advanced Math",
    module: "math",
    skills: [
      "Nonlinear equations in one variable and systems of equations in two variables ",
      "Nonlinear functions",
      "Equivalent expressions",
    ],
  },
  {
    category: "Geometry and Trigonometry",
    module: "math",
    skills: [
      "Lines, angles, and triangles",
      "Area and volume",
      "Circles",
      "Right triangles and trigonometry",
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

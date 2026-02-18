export interface AnswerOption {
  id: string;
  content: string; // HTML
}

export type QuestionType = "mcq" | "fib";

export interface Question {
  question_id: string;
  module: "english" | "math";
  difficulty: "E" | "M" | "H";
  domain: string;
  skill: string;
  skillCategory?: string;
  skillSubcategory?: string;
  question_text: string; // HTML
  stimulus: string | null; // HTML
  answer_options: AnswerOption[]; // Empty for FIB questions
  correct_answer: string[]; // e.g. ["A"] for MCQ, ["27"] for FIB
  rationale: string; // HTML
  question_type: QuestionType;
  external_id: string | null;
  create_date: number | null;
  update_date: number | null;
  images: string[];
  // Elo fields (added by migration)
  elo: number;
  eloAnswerCount: number;
  // Embedding fields (existing)
  embedding: number[];
  embedding_text: string;
  embedding_model: string;
  embedding_dimension: number;
}

// Lightweight version without embeddings for client use
export interface QuestionClient {
  question_id: string;
  module: "english" | "math";
  difficulty: "E" | "M" | "H";
  domain: string;
  skill: string;
  skillCategory?: string;
  skillSubcategory?: string;
  question_text: string;
  stimulus: string | null;
  answer_options: AnswerOption[]; // Empty for FIB questions
  correct_answer: string[]; // e.g. ["A"] for MCQ, ["27"] for FIB
  rationale: string;
  question_type: QuestionType;
  elo: number;
}

export type Module = "english" | "math";
export type Difficulty = "E" | "M" | "H";

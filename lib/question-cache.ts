import { adminDb } from "./firebase-admin";
import type { Question, Module } from "@/types";

/**
 * Server-side question cache.
 * On serverless, this persists per-instance (warm start).
 * Falls back to Firestore query when cold.
 */

interface CacheEntry {
  questions: Question[];
  fetchedAt: number;
}

const cache = new Map<Module, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Fetch all questions for a module, using cache when available */
export async function getQuestionsByModule(
  module: Module
): Promise<Question[]> {
  const entry = cache.get(module);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL) {
    return entry.questions;
  }

  const snapshot = await adminDb
    .collection("questions")
    .where("module", "==", module)
    .select(
      "question_id",
      "module",
      "difficulty",
      "domain",
      "skill",
      "question_text",
      "stimulus",
      "answer_options",
      "correct_answer",
      "rationale",
      "question_type",
      "elo",
      "eloAnswerCount",
      "images"
    )
    .get();

  const questions: Question[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      question_id: data.question_id || doc.id,
      module: data.module,
      difficulty: data.difficulty,
      domain: data.domain,
      skill: data.skill,
      question_text: data.question_text,
      stimulus: data.stimulus || null,
      answer_options: data.answer_options || [],
      correct_answer: data.correct_answer || [],
      rationale: data.rationale || "",
      question_type: data.question_type || "mcq",
      external_id: data.external_id || null,
      create_date: data.create_date || null,
      update_date: data.update_date || null,
      images: data.images || [],
      elo: data.elo || 1100,
      eloAnswerCount: data.eloAnswerCount || 0,
      // Omit embeddings for performance
      embedding: [],
      embedding_text: "",
      embedding_model: "",
      embedding_dimension: 0,
    } as Question;
  });

  cache.set(module, { questions, fetchedAt: Date.now() });
  return questions;
}

/** Get a single question by ID */
export async function getQuestionById(
  questionId: string
): Promise<Question | null> {
  // Check cache first
  for (const [, entry] of cache) {
    if (Date.now() - entry.fetchedAt < CACHE_TTL) {
      const found = entry.questions.find((q) => q.question_id === questionId);
      if (found) return found;
    }
  }

  // Fallback to direct query
  const snapshot = await adminDb
    .collection("questions")
    .where("question_id", "==", questionId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const data = snapshot.docs[0].data();
  return {
    ...data,
    question_id: data.question_id || snapshot.docs[0].id,
    elo: data.elo || 1100,
    eloAnswerCount: data.eloAnswerCount || 0,
  } as Question;
}

/** Invalidate cache for a module */
export function invalidateCache(module?: Module) {
  if (module) {
    cache.delete(module);
  } else {
    cache.clear();
  }
}

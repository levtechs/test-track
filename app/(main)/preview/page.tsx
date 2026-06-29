import type { Metadata } from "next";
import { getQuestionById } from "@/lib/question-cache";
import type { Question, QuestionClient } from "@/types";
import { QuestionPreviewClient } from "./question-preview-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Question Preview",
};

function toQuestionClient(question: Question): QuestionClient {
  return {
    question_id: question.question_id,
    module: question.module,
    difficulty: question.difficulty,
    domain: question.domain,
    skill: question.skill,
    skillCategory: question.skillCategory,
    skillSubcategory: question.skillSubcategory,
    question_text: question.question_text || "",
    stimulus: question.stimulus || null,
    answer_options: question.answer_options || [],
    correct_answer: question.correct_answer || [],
    rationale: question.rationale || "",
    question_type: question.question_type || "mcq",
    elo: question.elo || 1100,
    images: question.images || [],
    exclude: question.exclude,
  };
}

function parseQuestionIds(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value || "";
  const seen = new Set<string>();

  return raw
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

export default async function QuestionPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ questions?: string | string[] }>;
}) {
  const { questions } = await searchParams;
  const questionIds = parseQuestionIds(questions);
  const loadedQuestions = await Promise.all(
    questionIds.map(async (questionId) => ({
      questionId,
      question: await getQuestionById(questionId),
    }))
  );

  return (
    <QuestionPreviewClient
      questions={loadedQuestions.flatMap(({ question }) =>
        question ? [toQuestionClient(question)] : []
      )}
      missingQuestionIds={loadedQuestions.flatMap(({ questionId, question }) =>
        question ? [] : [questionId]
      )}
    />
  );
}

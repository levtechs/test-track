"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoButton, QuestionCard } from "@/components/question/question-card";
import { RationaleView } from "@/components/question/rationale-view";
import { checkFibAnswerCorrect } from "@/lib/utils";
import type { QuestionClient, QueuedQuestion } from "@/types";

interface QuestionPreviewClientProps {
  questions: QuestionClient[];
  missingQuestionIds: string[];
}

interface AnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
}

function getCorrectAnswer(question: QuestionClient): string {
  return question.correct_answer[0] || "";
}

function checkAnswer(question: QuestionClient, selectedAnswer: string): boolean {
  if (question.question_type === "fib") {
    return checkFibAnswerCorrect(selectedAnswer.trim(), question.correct_answer);
  }

  const selectedIndex = question.answer_options.findIndex((option) => option.id === selectedAnswer);
  const selectedLetter = ["A", "B", "C", "D"][selectedIndex];
  return selectedLetter === getCorrectAnswer(question);
}

export function QuestionPreviewClient({
  questions,
  missingQuestionIds,
}: QuestionPreviewClientProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bufferedQuestions, setBufferedQuestions] = useState<QueuedQuestion[]>(() =>
    questions.map((question) => ({ questionId: question.question_id }))
  );

  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.question_id, question])),
    [questions]
  );

  const currentQueuedQuestion = bufferedQuestions[currentIndex] || null;
  const currentQuestion = currentQueuedQuestion
    ? questionById.get(currentQueuedQuestion.questionId) || null
    : null;
  const selectedAnswer = currentQueuedQuestion?.selectedAnswer || null;
  const answerResult: AnswerResult | null = useMemo(() => {
    if (currentQueuedQuestion?.answeredAt === undefined || !currentQueuedQuestion.correctAnswer) {
      return null;
    }

    return {
      isCorrect: currentQueuedQuestion.isCorrect || false,
      correctAnswer: currentQueuedQuestion.correctAnswer,
    };
  }, [currentQueuedQuestion]);
  const showRationale = !!answerResult && !answerResult.isCorrect;

  const loadIndex = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const goBack = useCallback(() => {
    if (currentIndex > 0) loadIndex(currentIndex - 1);
  }, [currentIndex, loadIndex]);

  const goForward = useCallback(() => {
    if (currentIndex < bufferedQuestions.length - 1) loadIndex(currentIndex + 1);
  }, [bufferedQuestions.length, currentIndex, loadIndex]);

  const goToNextUnanswered = useCallback(() => {
    const nextIdx = bufferedQuestions.findIndex(
      (question, index) => index > currentIndex && question.answeredAt === undefined
    );
    if (nextIdx !== -1 && nextIdx !== currentIndex) loadIndex(nextIdx);
  }, [bufferedQuestions, currentIndex, loadIndex]);

  const submitAnswer = useCallback((selected: string) => {
    if (!currentQuestion || selectedAnswer || answerResult) return;

    const currentQueued = bufferedQuestions[currentIndex];

    if (!currentQueued || currentQueued.answeredAt !== undefined) return;

    const isCorrect = checkAnswer(currentQuestion, selected);
    const correctAnswer = getCorrectAnswer(currentQuestion);

    setBufferedQuestions((prev) => {
      const next = [...prev];
      next[currentIndex] = {
        ...next[currentIndex],
        selectedAnswer: selected,
        isCorrect,
        correctAnswer,
        answeredAt: Date.now(),
        timeSpentMs: 0,
      };
      return next;
    });

    if (isCorrect) {
      window.setTimeout(() => {
        setCurrentIndex((index) => Math.min(index + 1, bufferedQuestions.length - 1));
      }, 500);
    }
  }, [answerResult, bufferedQuestions, currentIndex, currentQuestion, selectedAnswer]);

  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < bufferedQuestions.length - 1;
  const answeredCount = bufferedQuestions.filter((question) => question.answeredAt !== undefined).length;
  const correctCount = bufferedQuestions.filter((question) => question.isCorrect).length;
  const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  const moduleLabel = currentQuestion?.module || questions[0]?.module || "preview";
  const currentRating = 1100;

  if (questions.length === 0) {
    return (
      <div className="practice-session mx-auto flex h-full min-h-0 max-w-3xl flex-col items-center justify-center px-2 pb-3 text-center sm:px-4">
        <h1 className="text-xl font-semibold">No preview questions found</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Add question IDs with <span className="font-mono">/preview?questions=id1,id2</span>.
        </p>
        {missingQuestionIds.length > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Missing: {missingQuestionIds.join(", ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="practice-session mx-auto flex h-full min-h-0 max-w-3xl flex-col px-2 pb-3 sm:px-4">
      <div className="flex-none flex items-center justify-between gap-2 py-2 text-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.history.back()}
          className="h-7 px-2 text-muted-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          <span className="capitalize">{moduleLabel}</span>
        </Button>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={!canGoBack}
            className="h-7 px-1"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={goForward}
            disabled={!canGoForward}
            className="h-7 px-1"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-muted-foreground text-sm">
            <span className="font-semibold text-foreground">{currentIndex + 1}</span>
            {" / "}
            <span className="font-semibold text-foreground">{bufferedQuestions.length}</span>
          </span>

          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{accuracy}%</span>
          </span>

          <span className="font-mono font-semibold">{currentRating}</span>

          {(() => {
            if (!currentQuestion?.elo) return null;
            const expectedScore = 1 / (1 + Math.pow(10, (currentQuestion.elo - currentRating) / 400));
            const gain = Math.round(24 * (1 - expectedScore));
            const loss = Math.round(24 * expectedScore);
            return (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-green-500">+{gain}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-red-500">-{loss}</span>
              </div>
            );
          })()}

          {currentQuestion && (
            <InfoButton
              skill={currentQuestion.skill}
              domain={currentQuestion.domain}
              difficulty={currentQuestion.difficulty}
              questionId={currentQuestion.question_id}
              elo={currentQuestion.elo}
              reason="fit"
            />
          )}
        </div>
      </div>

      {missingQuestionIds.length > 0 && (
        <div className="mb-1 flex-none rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Missing question IDs: {missingQuestionIds.join(", ")}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden pt-2">
        <QuestionCard
          question={currentQuestion}
          selectedAnswer={selectedAnswer}
          correctAnswer={answerResult?.correctAnswer || null}
          isCorrect={answerResult?.isCorrect ?? null}
          disabled={!!answerResult}
          onSelectAnswer={submitAnswer}
          loading={false}
          showRationale={showRationale}
          rationale={currentQuestion?.rationale}
          onNext={goToNextUnanswered}
        />
      </div>

      {currentQuestion && showRationale && (
        <RationaleView
          rationale={currentQuestion.rationale}
          onNext={goToNextUnanswered}
          className="question-card__portrait-rationale"
        />
      )}
    </div>
  );
}

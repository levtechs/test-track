"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { HtmlContent } from "./html-content";
import { AnswerOptions } from "./answer-options";
import { RationaleView } from "./rationale-view";
import { Button } from "@/components/ui/button";
import { cleanHtml } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info } from "lucide-react";
import type { QuestionClient, SuggestionReason } from "@/types";

interface QuestionCardProps {
  question: QuestionClient | null;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean | null;
  disabled: boolean;
  onSelectAnswer: (optionId: string) => void;
  loading?: boolean;
  showRationale?: boolean;
  rationale?: string;
  onNext?: () => void;
  ratingChange?: number;
}

export function QuestionCard({
  question,
  selectedAnswer,
  correctAnswer,
  isCorrect,
  disabled,
  onSelectAnswer,
  loading = false,
  showRationale = false,
  rationale,
  onNext,
  ratingChange,
}: QuestionCardProps) {
  if (loading || !question) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-4 overflow-hidden">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="flex-none border-t pt-2">
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="question-card flex h-full flex-col">
      <div className="question-card__prompt min-h-0 overflow-x-hidden overflow-y-auto pb-2">
        {question.stimulus && (
          <div className="rounded-lg bg-muted/50 p-3 border text-sm leading-relaxed">
            <HtmlContent html={cleanHtml(question.stimulus)} />
          </div>
        )}
        {question.images && question.images.length > 0 && (
          <div className="mt-2 space-y-2">
            {question.images
              .filter(img => img && !img.includes('favicon'))
              .map((img, idx) => (
                <img
                  key={idx}
                  src={img.startsWith("http") ? img : `https://sat-7f48c.firebaseapp.com/${img}`}
                  alt={`Question image ${idx + 1}`}
                  className="max-w-full h-auto rounded-lg border"
                />
              ))}
          </div>
        )}
        <div className="question-card__question-prompt mt-2 text-sm leading-relaxed">
          <div className="rounded-lg border bg-card p-3 text-card-foreground">
            <HtmlContent html={question.question_text} />
          </div>
        </div>
      </div>

      <div className="question-card__response flex-1 min-h-[25%] border-t pt-2 flex flex-col justify-end">
        <div className="question-card__question-response mb-2 text-sm leading-relaxed">
          <div className="rounded-lg border bg-card p-3 text-card-foreground">
            <HtmlContent html={question.question_text} />
          </div>
        </div>
        <div className="question-card__answers min-h-0 overflow-y-auto">
          <AnswerOptions
            key={question.question_id}
            options={question.answer_options}
            selectedAnswer={selectedAnswer}
            correctAnswer={correctAnswer}
            isCorrect={isCorrect}
            disabled={disabled}
            onSelect={onSelectAnswer}
            questionType={question.question_type}
          />
        </div>
        {showRationale && rationale && onNext && (
          <RationaleView
            rationale={rationale}
            onNext={onNext}
            ratingChange={ratingChange}
            className="question-card__landscape-rationale hidden"
          />
        )}
      </div>
    </div>
  );
}

interface InfoButtonProps {
  skill: string;
  domain: string;
  difficulty: string;
  questionId: string;
  elo?: number;
  reason?: SuggestionReason;
}

const suggestionReasonLabels: Record<SuggestionReason, string> = {
  review: "Review",
  probing: "Probing",
  novelty: "Novelty",
  challenge: "Challenge",
  fit: "Fit",
  daily: "Daily Challenge",
};

export function InfoButton({ skill, domain, difficulty, questionId, elo, reason }: InfoButtonProps) {
  const difficultyLabel = difficulty === "E" ? "Easy" : difficulty === "M" ? "Medium" : "Hard";
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Info className="h-3.5 w-3.5" />
          <span className="sr-only">Question Details</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52" align="end">
        <div className="flex flex-col gap-2 text-sm">
          <div className="font-medium">{skill}</div>
          <div className="text-muted-foreground text-xs">
            <div>{domain}</div>
            <div>Difficulty: {difficultyLabel}</div>
            {reason && <div>Suggested for: {suggestionReasonLabels[reason]}</div>}
            {elo && <div>Elo: {elo}</div>}
            <div className="truncate">ID: {questionId}</div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

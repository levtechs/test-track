"use client";


import { Skeleton } from "@/components/ui/skeleton";
import { HtmlContent } from "./html-content";
import { AnswerOptions } from "./answer-options";
import { Button } from "@/components/ui/button";
import { cleanHtml } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info } from "lucide-react";
import type { QuestionClient } from "@/types";

interface QuestionCardProps {
  question: QuestionClient | null;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  disabled: boolean;
  onSelectAnswer: (optionId: string) => void;
  loading?: boolean;
}

export function QuestionCard({
  question,
  selectedAnswer,
  correctAnswer,
  disabled,
  onSelectAnswer,
  loading = false,
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
    <div className="flex h-full flex-col">
      <div className="flex-1 max-h-[75%] overflow-y-auto pb-2">
        {question.stimulus && (
          <div className="rounded-lg bg-muted/50 p-3 border text-sm leading-relaxed">
            <HtmlContent html={cleanHtml(question.stimulus)} />
          </div>
        )}
        <div className="text-sm leading-relaxed">
          <HtmlContent html={question.question_text} />
        </div>
      </div>

      <div className="flex-1 max-h-[75%] border-t pt-2 overflow-y-auto">
        <AnswerOptions
          options={question.answer_options}
          selectedAnswer={selectedAnswer}
          correctAnswer={correctAnswer}
          disabled={disabled}
          onSelect={onSelectAnswer}
          questionType={question.question_type}
        />
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
}

export function InfoButton({ skill, domain, difficulty, questionId, elo }: InfoButtonProps) {
  const difficultyLabel = difficulty === "E" ? "Easy" : difficulty === "M" ? "Medium" : "Hard";
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Info className="h-3.5 w-3.5" />
          <span className="sr-only">Question Details</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48" align="end">
        <div className="flex flex-col gap-2 text-sm">
          <div className="font-medium">{skill}</div>
          <div className="text-muted-foreground text-xs">
            <div>{domain}</div>
            <div>Difficulty: {difficultyLabel}</div>
            {elo && <div>Elo: {elo}</div>}
            <div className="truncate">ID: {questionId}</div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

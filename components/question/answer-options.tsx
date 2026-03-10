"use client";

import { useState } from "react";
import { cn, isValidNumericInput, checkAnswerCorrect } from "@/lib/utils";
import { HtmlContent } from "./html-content";
import { Button } from "@/components/ui/button";
import type { AnswerOption, QuestionType } from "@/types";
import { CheckCircle2, XCircle } from "lucide-react";

interface AnswerOptionsProps {
  options: AnswerOption[];
  selectedAnswer: string | null;
  correctAnswer: string | null; // null = not yet submitted
  disabled: boolean;
  onSelect: (optionId: string) => void;
  questionType: QuestionType;
}

const LETTERS = ["A", "B", "C", "D"];

export function AnswerOptions({
  options,
  selectedAnswer,
  correctAnswer,
  disabled,
  onSelect,
  questionType,
}: AnswerOptionsProps) {
  const hasSubmitted = correctAnswer !== null;
  const isFIB = questionType === "fib";

  // FIB state
  const [inputValue, setInputValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // FIB (Fill-in-the-blank) rendering
  if (isFIB) {
    const displayValue = hasSubmitted 
      ? (selectedAnswer ?? correctAnswer ?? "") 
      : (selectedAnswer ?? inputValue);
    
    const handleSubmit = () => {
      const trimmed = inputValue.trim();
      if (!trimmed || disabled) return;
      
      if (!isValidNumericInput(trimmed)) {
        setValidationError("Please enter a valid number (e.g. 27, 3.5, 1/2)");
        return;
      }
      setValidationError(null);
      onSelect(trimmed);
    };

    const isCorrect = hasSubmitted && correctAnswer !== null && checkAnswerCorrect(selectedAnswer ?? "", correctAnswer);
    const isWrong = hasSubmitted && (selectedAnswer ?? "").trim() && !isCorrect;

    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={(e) => {
              if (!hasSubmitted) {
                setInputValue(e.target.value);
                if (validationError) setValidationError(null);
              }
            }}
            disabled={disabled || hasSubmitted}
            placeholder="Enter your answer"
            className={cn(
              "flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all",
              "focus:outline-none focus:ring-2 focus:ring-primary/20",
              !hasSubmitted && !validationError && "border-border bg-card focus:border-primary",
              !hasSubmitted && validationError && "border-red-500 bg-red-500/10",
              hasSubmitted && isCorrect && "border-green-500 bg-green-500/10 text-green-700",
              hasSubmitted && isWrong && "border-red-500 bg-red-500/10 text-red-700",
              disabled && "opacity-60"
            )}
            onKeyDown={(e) => e.key === "Enter" && !hasSubmitted && handleSubmit()}
          />
          {!hasSubmitted && (
            <Button
              onClick={handleSubmit}
              disabled={disabled || !inputValue.trim()}
              className="px-4 h-10"
              size="sm"
            >
              Submit
            </Button>
          )}
        </div>

        {validationError && !hasSubmitted && (
          <p className="text-sm text-red-600 font-medium">{validationError}</p>
        )}
        
        {hasSubmitted && (
          <div className={cn(
            "flex items-center gap-2 rounded-lg p-2 text-sm font-medium",
            isCorrect ? "bg-green-500/10 text-green-700" : "bg-red-500/10 text-red-700"
          )}>
            {isCorrect ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Correct!</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                <span>Correct answer: {correctAnswer}</span>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // MCQ rendering (original)
  return (
    <div className="space-y-2">
      {options.map((option, index) => {
        const letter = LETTERS[index];
        const isSelected = selectedAnswer === option.id;
        const isCorrectOption = hasSubmitted && letter === correctAnswer;
        const isWrongSelection = hasSubmitted && isSelected && !isCorrectOption;

        return (
          <button
            key={option.id}
            onClick={() => !disabled && onSelect(option.id)}
            disabled={disabled}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border-2 p-2.5 text-left transition-all",
              "active:scale-[0.98]",
              // Default state
              !hasSubmitted && !isSelected && "border-border bg-card hover:border-primary/40 hover:bg-primary/5",
              // Selected but not submitted
              !hasSubmitted && isSelected && "border-primary bg-primary/10",
              // Correct answer revealed
              isCorrectOption && "border-green-500 bg-green-500/10",
              // Wrong selection
              isWrongSelection && "border-red-500 bg-red-500/10",
              // Other options after submission
              hasSubmitted && !isCorrectOption && !isWrongSelection && "border-border/50 bg-card/50 opacity-60",
              // Disabled
              disabled && "cursor-default"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                !hasSubmitted && !isSelected && "bg-muted text-muted-foreground",
                !hasSubmitted && isSelected && "bg-primary text-primary-foreground",
                isCorrectOption && "bg-green-500 text-white",
                isWrongSelection && "bg-red-500 text-white",
                hasSubmitted && !isCorrectOption && !isWrongSelection && "bg-muted text-muted-foreground"
              )}
            >
              {letter}
            </span>
            <div className="flex-1 text-sm">
              <HtmlContent html={option.content} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

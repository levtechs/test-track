"use client";

import { Badge } from "@/components/ui/badge";

interface SessionStatsBarProps {
  questionCount: number;
  correctCount: number;
  streak: number;
  currentRating: number;
  ratingAtStart: number;
  questionElo?: number;
}

const K_FACTOR = 24;

function calculatePotentialEloChange(userRating: number, questionElo: number): { gain: number; loss: number } {
  const expectedScore = 1 / (1 + Math.pow(10, (questionElo - userRating) / 400));
  const gain = Math.round(K_FACTOR * (1 - expectedScore));
  const loss = Math.round(K_FACTOR * expectedScore);
  return { gain, loss };
}

export function SessionStatsBar({
  questionCount,
  correctCount,
  streak,
  currentRating,
  ratingAtStart,
  questionElo,
}: SessionStatsBarProps) {
  const accuracy =
    questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : 0;
  const ratingDiff = currentRating - ratingAtStart;

  const potential = questionElo 
    ? calculatePotentialEloChange(currentRating, questionElo)
    : null;

  return (
    <div className="flex items-center justify-between gap-2 px-1 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{questionCount}</span>{" "}
          Qs
        </span>
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{accuracy}%</span>{" "}
          acc
        </span>
        {streak >= 2 && (
          <Badge variant="secondary" className="text-xs">
            {streak} streak
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3">
        {potential && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-green-500">+{potential.gain}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-red-500">-{potential.loss}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="font-mono font-semibold">{currentRating}</span>
          {ratingDiff !== 0 && (
            <span
              className={
                ratingDiff > 0 ? "text-green-500 text-xs" : "text-red-500 text-xs"
              }
            >
              ({ratingDiff > 0 ? "+" : ""}
              {ratingDiff})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

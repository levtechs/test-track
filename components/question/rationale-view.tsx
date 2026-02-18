"use client";

import { useState } from "react";
import { HtmlContent } from "./html-content";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

interface RationaleViewProps {
  rationale: string;
  onNext: () => void;
  ratingChange?: number;
}

export function RationaleView({
  rationale,
  onNext,
  ratingChange,
}: RationaleViewProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mt-4 rounded-lg border-2 border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-destructive">Incorrect</span>
          {ratingChange !== undefined && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                ratingChange >= 0
                  ? "bg-success/20 text-success"
                  : "bg-destructive/20 text-destructive"
              }`}
            >
              {ratingChange >= 0 ? "+" : ""}
              {ratingChange} Elo
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-muted"
        >
          {collapsed ? (
            <>
              Show Explanation
              <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              Hide
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          collapsed ? "max-h-0" : "max-h-[600px]"
        }`}
      >
        <div className="mt-3 border-t pt-2">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Explanation
          </p>
          <HtmlContent html={rationale} className="text-sm" />
        </div>
      </div>

      {!collapsed && (
        <button
          onClick={onNext}
          className="mt-3 w-full rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
        >
          Next Question
          <ArrowRight className="ml-2 inline h-4 w-4" />
        </button>
      )}
    </div>
  );
}

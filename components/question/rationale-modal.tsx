"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HtmlContent } from "./html-content";
import { ArrowRight } from "lucide-react";

interface RationaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rationale: string;
  onNext: () => void;
  ratingChange?: number;
}

export function RationaleModal({
  open,
  onOpenChange,
  rationale,
  onNext,
  ratingChange,
}: RationaleModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            Incorrect
            {ratingChange !== undefined && (
              <span className="text-sm font-normal text-muted-foreground">
                (Rating: {ratingChange > 0 ? "+" : ""}
                {ratingChange})
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Here&apos;s why the answer was wrong:
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 rounded-md bg-muted/50 p-4 text-sm">
          <HtmlContent html={rationale} />
        </div>

        <DialogFooter>
          <Button onClick={onNext} className="w-full sm:w-auto">
            Next Question
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

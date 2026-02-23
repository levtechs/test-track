"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Swords } from "lucide-react";

export default function BattlePage() {
  return (
    <div className="flex flex-col items-center justify-center px-4 pt-20 min-h-full">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center py-12">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Swords className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-lg font-semibold">1v1 Battles</h2>
          <p className="text-center text-sm text-muted-foreground">
            Challenge other players to head-to-head SAT duels. Coming soon!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

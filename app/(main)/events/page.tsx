"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";

export default function EventsPage() {
  return (
    <div className="flex flex-col items-center justify-center px-4 pt-20 min-h-full">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center py-12">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Trophy className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-lg font-semibold">Tournaments</h2>
          <p className="text-center text-sm text-muted-foreground">
            Compete in asynchronous tournaments against other players. Coming soon!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

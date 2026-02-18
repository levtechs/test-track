"use client";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  Calculator,
  Target,
  TrendingUp,
  LogIn,
  LogOut,
} from "lucide-react";

export default function ProfilePage() {
  const { user, userProfile, loading, signInWithGoogle, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user || !userProfile) {
    return (
      <div className="flex flex-col items-center justify-center px-4 pt-20">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <LogIn className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="mb-2 text-xl font-bold">Sign in to view your profile</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground max-w-xs">
          Track your progress, view detailed stats, and compete with others
        </p>
        <Button onClick={signInWithGoogle} size="lg">
          <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </Button>
      </div>
    );
  }

  const accuracy =
    userProfile.totalQuestions > 0
      ? Math.round(
          (userProfile.totalCorrect / userProfile.totalQuestions) * 100
        )
      : 0;

  const ratingChange = (rating: number) => {
    const diff = rating - 1000;
    if (diff === 0) return "";
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  // Get top weak skills (lowest accuracy with enough attempts)
  const skillEntries = Object.entries(userProfile.skillStats || {});
  const weakSkills = skillEntries
    .filter(([, s]) => s.total >= 3)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* User header */}
      <div className="mb-6 flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={userProfile.photoURL || undefined} />
          <AvatarFallback className="text-lg">
            {userProfile.displayName?.charAt(0) || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{userProfile.displayName}</h1>
          <p className="text-sm text-muted-foreground">
            {userProfile.totalQuestions} questions answered
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      {/* Rating cards */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-sm font-medium">English</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">
              {Math.round(userProfile.englishRating)}
            </div>
            <p className="text-xs text-muted-foreground">
              {ratingChange(userProfile.englishRating) || "Starting rating"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-sm font-medium">Math</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">
              {Math.round(userProfile.mathRating)}
            </div>
            <p className="text-xs text-muted-foreground">
              {ratingChange(userProfile.mathRating) || "Starting rating"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Overall stats */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Target className="h-4 w-4" />
            Overall Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">
                {userProfile.totalQuestions}
              </div>
              <div className="text-xs text-muted-foreground">Answered</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {userProfile.totalCorrect}
              </div>
              <div className="text-xs text-muted-foreground">Correct</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{accuracy}%</div>
              <div className="text-xs text-muted-foreground">Accuracy</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weak areas */}
      {weakSkills.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4" />
              Areas to Improve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {weakSkills.map(([skill, stats]) => {
                const pct = Math.round((stats.correct / stats.total) * 100);
                return (
                  <div key={skill}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm">{skill}</span>
                      <Badge
                        variant={pct < 50 ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {pct}%
                      </Badge>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator className="my-4" />
      <p className="text-center text-xs text-muted-foreground">
        Keep practicing to see more detailed stats
      </p>
    </div>
  );
}

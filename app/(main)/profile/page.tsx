"use client";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  Calculator,
  Target,
  LogIn,
  LogOut,
  TrendingUp,
} from "lucide-react";
import type { SkillElo, EstimatedScore } from "@/types";
import { getSkillsByModule } from "@/lib/skills";
import { useState, useEffect } from "react";

interface SkillData {
  rating: number;
  questionCount: number;
  correctCount: number;
}

export default function ProfilePage() {
  const { user, userProfile, loading, signInWithGoogle, signOut, getIdToken } = useAuth();
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    if (!user || !userProfile) return;

    const calculateEstimate = async () => {
      setCalculating(true);
      try {
        const token = await getIdToken();
        if (!token) return;

        await fetch("/api/profile/estimate-score", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        console.error("Failed to calculate estimate:", error);
      } finally {
        setCalculating(false);
      }
    };

    calculateEstimate();
  }, [user, userProfile?.totalQuestions]);

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

  const getSkillData = (skillName: string): SkillData | null => {
    const skillElos = userProfile.skillElos || {};
    const skillStats = userProfile.skillStats || {};

    if (skillElos[skillName]) {
      return skillElos[skillName];
    }

    if (skillStats[skillName]) {
      const stats = skillStats[skillName];
      const acc = stats.total > 0 ? stats.correct / stats.total : 0.5;
      return {
        rating: Math.round(1000 + (acc - 0.5) * 400),
        questionCount: stats.total,
        correctCount: stats.correct,
      };
    }

    return null;
  };

  const getEloColor = (rating: number) => {
    if (rating >= 1200) return "text-green-600";
    if (rating >= 900) return "text-yellow-600";
    return "text-red-600";
  };

  const getEloBadge = (rating: number) => {
    if (rating >= 1200) return "bg-green-500/10 text-green-600 border-green-500/20";
    if (rating >= 900) return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    return "bg-red-500/10 text-red-600 border-red-500/20";
  };

  const calculateCategoryAverage = (skills: string[]): number | null => {
    const ratings = skills
      .map(skill => getSkillData(skill)?.rating)
      .filter((r): r is number => r !== undefined);
    
    if (ratings.length === 0) return null;
    return Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
  };

  const renderModuleSkills = (module: "english" | "math", icon: React.ReactNode, title: string, colorClass: string) => {
    const hierarchies = getSkillsByModule(module);
    const moduleRating = module === "english" ? userProfile.englishRating : userProfile.mathRating;

    const categoriesWithData = hierarchies
      .map(group => ({
        ...group,
        skillsWithData: group.skills
          .map(skill => ({ skill, data: getSkillData(skill) }))
          .filter(s => s.data !== null),
        averageRating: calculateCategoryAverage(group.skills),
      }))
      .filter(group => group.skillsWithData.length > 0);

    if (categoriesWithData.length === 0) {
      return (
        <div className="py-6 text-center text-sm text-muted-foreground">
          Practice {module} questions to see your skill breakdown
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-2 border-b">
          <div className={`flex h-8 w-8 items-center justify-center rounded-md ${colorClass}`}>
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">{title}</h3>
          </div>
          <div className="text-right">
            <span className="font-bold">{Math.round(moduleRating)}</span>
            <span className={`ml-1 text-xs ${moduleRating >= 1000 ? 'text-green-600' : 'text-red-600'}`}>
              {ratingChange(moduleRating)}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {categoriesWithData.map((group) => (
            <div key={group.category} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-muted-foreground">{group.category}</span>
                <span className={`text-xs font-medium ${getEloColor(group.averageRating || 1000)}`}>
                  avg {group.averageRating}
                </span>
              </div>
              
              <div className="space-y-2 pl-3 border-l-2 border-muted">
                {group.skillsWithData.map(({ skill, data }) => {
                  const progress = Math.min(100, Math.max(0, ((data!.rating - 600) / 800) * 100));
                  
                  return (
                    <div key={skill} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{skill}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-medium ${getEloColor(data!.rating)}`}>
                            {data!.rating}
                          </span>
                          {data!.questionCount > 0 && (
                            <Badge className={`text-xs ${getEloBadge(data!.rating)}`}>
                              {Math.round((data!.correctCount / data!.questionCount) * 100)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="h-1 flex-1" />
                        <span className="text-xs text-muted-foreground w-10 text-right">
                          {data!.questionCount}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

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
      <div className="mb-4 grid grid-cols-2 gap-4">
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

      {/* Estimated SAT Score */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4" />
            Estimated SAT Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          {calculating ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : userProfile.estimatedEnglish && userProfile.estimatedMath ? (
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-4xl font-bold">
                  {userProfile.estimatedEnglish.score + userProfile.estimatedMath.score}
                </div>
                <div className="text-xs text-muted-foreground">Total Score</div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <BookOpen className="h-3 w-3 text-blue-500" />
                    <span className="text-sm font-medium">English</span>
                  </div>
                  <div className="text-xl font-bold">{userProfile.estimatedEnglish.score}</div>
                  <div className="text-xs text-muted-foreground">
                    {Math.round(userProfile.estimatedEnglish.confidence * 100)}% confidence
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Calculator className="h-3 w-3 text-emerald-500" />
                    <span className="text-sm font-medium">Math</span>
                  </div>
                  <div className="text-xl font-bold">{userProfile.estimatedMath.score}</div>
                  <div className="text-xs text-muted-foreground">
                    {Math.round(userProfile.estimatedMath.confidence * 100)}% confidence
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Start practicing to see your estimated score
            </div>
          )}
        </CardContent>
      </Card>

      {/* Skill breakdown */}
      <div className="space-y-6">
        {renderModuleSkills("english", <BookOpen className="h-4 w-4" />, "English", "bg-blue-500/10 text-blue-600")}
        {renderModuleSkills("math", <Calculator className="h-4 w-4" />, "Math", "bg-emerald-500/10 text-emerald-600")}
      </div>

      <Separator className="my-6" />
      <p className="text-center text-xs text-muted-foreground">
        Keep practicing to improve your skills and ratings
      </p>
    </div>
  );
}

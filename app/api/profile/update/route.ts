import { NextRequest } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { estimateSectionScore, type ScoreResponseEvent } from "@/lib/algorithm/estimate-score";
import { loadQuestionSkillMeta } from "@/lib/server/load-question-skills";
import type { UserProfile, Response } from "@/types";

function getDateString(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateDayStreak(responses: { answeredAt: number; isCorrect: boolean }[], lastActiveDate: number | null, clientDate: string) {
  const correctResponses = responses.filter(r => r.isCorrect);
  
  if (correctResponses.length === 0) {
    return { streak: 0, lastDate: lastActiveDate || 0 };
  }

  const dates = [...new Set(responses.map(r => getDateString(r.answeredAt)))].sort().reverse();
  const today = clientDate.split("T")[0];
  const yesterday = getDateString(Date.now() - 86400000);

  if (dates[0] !== today && dates[0] !== yesterday) {
    return { streak: 0, lastDate: new Date(dates[0]).getTime() };
  }

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const current = new Date(dates[i - 1]);
    const prev = new Date(dates[i]);
    const diffDays = Math.floor((current.getTime() - prev.getTime()) / 86400000);
    
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return { streak, lastDate: new Date(dates[0]).getTime() };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    let userId: string;

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      userId = decoded.uid;
    } catch {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }

    const userDoc = await adminDb.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const userProfile = userDoc.data() as UserProfile;

    const body = await request.json();
    const clientDate = body.clientDate || new Date().toISOString();

    const [responsesSnap, skillElos] = await Promise.all([
      adminDb.collection("responses").where("userId", "==", userId).get(),
      Promise.resolve(userProfile.skillElos || {}),
    ]);

    const responseRows = responsesSnap.docs.map((d) => d.data() as Response);
    const responses = responseRows.map((r) => ({
      answeredAt: r.answeredAt,
      isCorrect: r.isCorrect,
    }));

    const { streak, lastDate } = calculateDayStreak(responses, userProfile.lastActiveDate || null, clientDate);

    const needSkillLookup = responseRows
      .filter((r) => !r.skill || !r.module)
      .map((r) => r.questionId);

    const questionMeta =
      needSkillLookup.length > 0 ? await loadQuestionSkillMeta(adminDb, needSkillLookup) : new Map<string, { skill: string; module: "english" | "math" }>();

    const scoreResponses: ScoreResponseEvent[] = [];
    for (const r of responseRows) {
      const skill = r.skill ?? questionMeta.get(r.questionId)?.skill;
      const mod = r.module ?? questionMeta.get(r.questionId)?.module;
      if (!skill || !mod) continue;
      scoreResponses.push({
        skill,
        module: mod,
        isCorrect: r.isCorrect,
        answeredAt: r.answeredAt,
      });
    }

    const estimatedEnglish = estimateSectionScore({
      skillElos,
      module: "english",
      moduleRating: userProfile.englishRating,
      responses: scoreResponses,
    });
    const estimatedMath = estimateSectionScore({
      skillElos,
      module: "math",
      moduleRating: userProfile.mathRating,
      responses: scoreResponses,
    });
    const totalScore = estimatedEnglish.score + estimatedMath.score;

    await adminDb.collection("users").doc(userId).update({
      estimatedEnglish,
      estimatedMath,
      dayStreak: streak,
      lastActiveDate: lastDate,
      updatedAt: Date.now(),
    });

    return Response.json({
      total: totalScore,
      english: estimatedEnglish,
      math: estimatedMath,
      dayStreak: streak,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

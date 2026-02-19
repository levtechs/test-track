import { NextRequest } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { estimateSectionScore } from "@/lib/algorithm/estimate-score";
import type { UserProfile } from "@/types";

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

    const responses = responsesSnap.docs.map(d => d.data() as { answeredAt: number; isCorrect: boolean });
    
    console.log("User responses dates:", responses.filter(r => r.isCorrect).map(r => ({
      answeredAt: r.answeredAt,
      date: getDateString(r.answeredAt)
    })));
    
    const { streak, lastDate } = calculateDayStreak(responses, userProfile.lastActiveDate || null, clientDate);
    console.log("Calculated streak:", streak, "lastDate:", lastDate);

    const estimatedEnglish = estimateSectionScore(skillElos, "english");
    const estimatedMath = estimateSectionScore(skillElos, "math");
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

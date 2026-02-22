import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

interface AdminStats {
  totalUsers: number;
  totalSessions: number;
  totalResponses: number;
  activeUsersToday: number;
  activeUsersThisWeek: number;
  averageAccuracy: number;
  averageRating: {
    english: number;
    math: number;
  };
  sessionsByModule: {
    english: number;
    math: number;
  };
  sessionsByMode: Record<string, number>;
  responsesLast7Days: { date: string; count: number }[];
  newUsersLast7Days: { date: string; count: number }[];
}

async function getAdminStats(): Promise<AdminStats> {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const weekAgoMs = weekAgo.getTime();

  const [
    usersSnap,
    sessionsSnap,
    responsesSnap,
    todaySessionsSnap,
    weekSessionsSnap,
    allResponses,
  ] = await Promise.all([
    adminDb.collection("users").count().get(),
    adminDb.collection("sessions").count().get(),
    adminDb.collection("responses").count().get(),
    adminDb
      .collection("sessions")
      .where("lastActiveAt", ">=", todayStartMs)
      .get(),
    adminDb
      .collection("sessions")
      .where("lastActiveAt", ">=", weekAgoMs)
      .get(),
    adminDb.collection("responses").get(),
  ]);

  const uniqueTodayUsers = new Set(todaySessionsSnap.docs.map(d => d.data().userId));
  const uniqueWeekUsers = new Set(weekSessionsSnap.docs.map(d => d.data().userId));
  const activeUsersToday = uniqueTodayUsers.size;
  const activeUsersThisWeek = uniqueWeekUsers.size;

  const totalUsers = usersSnap.data().count;
  const totalSessions = sessionsSnap.data().count;
  const totalResponses = responsesSnap.data().count;

  let correctCount = 0;
  let totalEnglishRating = 0;
  let totalMathRating = 0;
  let englishRatingCount = 0;
  let mathRatingCount = 0;
  let sessionsEnglish = 0;
  let sessionsMath = 0;
  const sessionsByMode: Record<string, number> = {};

  for (const doc of allResponses.docs) {
    const data = doc.data();
    if (data.isCorrect) correctCount++;
  }

  const usersSnap2 = await adminDb.collection("users").get();
  for (const doc of usersSnap2.docs) {
    const data = doc.data();
    if (typeof data.englishRating === "number") {
      totalEnglishRating += data.englishRating;
      englishRatingCount++;
    }
    if (typeof data.mathRating === "number") {
      totalMathRating += data.mathRating;
      mathRatingCount++;
    }
  }

  const sessionsSnap2 = await adminDb.collection("sessions").get();
  for (const doc of sessionsSnap2.docs) {
    const data = doc.data();
    if (data.module === "english") sessionsEnglish++;
    else if (data.module === "math") sessionsMath++;

    const mode = data.mode || "sandbox";
    sessionsByMode[mode] = (sessionsByMode[mode] || 0) + 1;
  }

  const responsesByDate: Record<string, number> = {};
  const usersByDate: Record<string, Set<string>> = {};

  const responsesSnap2 = await adminDb
    .collection("responses")
    .where("answeredAt", ">=", weekAgoMs)
    .get();

  for (const doc of responsesSnap2.docs) {
    const data = doc.data();
    const date = new Date(data.answeredAt).toISOString().split("T")[0];
    responsesByDate[date] = (responsesByDate[date] || 0) + 1;

    if (!usersByDate[date]) usersByDate[date] = new Set();
    usersByDate[date].add(data.userId);
  }

  const responsesLast7Days: { date: string; count: number }[] = [];
  const newUsersLast7Days: { date: string; count: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    responsesLast7Days.push({ date, count: responsesByDate[date] || 0 });
    newUsersLast7Days.push({
      date,
      count: usersByDate[date]?.size || 0,
    });
  }

  return {
    totalUsers,
    totalSessions,
    totalResponses,
    activeUsersToday,
    activeUsersThisWeek,
    averageAccuracy: totalResponses > 0 ? (correctCount / totalResponses) * 100 : 0,
    averageRating: {
      english: englishRatingCount > 0 ? totalEnglishRating / englishRatingCount : 1000,
      math: mathRatingCount > 0 ? totalMathRating / mathRatingCount : 1000,
    },
    sessionsByModule: {
      english: sessionsEnglish,
      math: sessionsMath,
    },
    sessionsByMode,
    responsesLast7Days,
    newUsersLast7Days,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = decoded.uid;
    const userDoc = await adminDb.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userProfile = userDoc.data();
    if (userProfile?.admin !== true) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const stats = await getAdminStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}

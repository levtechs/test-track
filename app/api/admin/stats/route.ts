import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getStats } from "@/lib/stats";

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
  const stats = await getStats();
  
  if (!stats) {
    return {
      totalUsers: 0,
      totalSessions: 0,
      totalResponses: 0,
      activeUsersToday: 0,
      activeUsersThisWeek: 0,
      averageAccuracy: 0,
      averageRating: { english: 1000, math: 1000 },
      sessionsByModule: { english: 0, math: 0 },
      sessionsByMode: {},
      responsesLast7Days: [],
      newUsersLast7Days: [],
    };
  }

  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = todayStart.toISOString().split("T")[0];

  const weekAgo = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const weekAgoStr = weekAgo.toISOString().split("T")[0];

  const responsesLast7Days: { date: string; count: number }[] = [];
  const newUsersLast7Days: { date: string; count: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    responsesLast7Days.push({ 
      date, 
      count: stats.dailyResponses[date] || 0 
    });
    newUsersLast7Days.push({
      date,
      count: stats.dailyActiveUsers[date]?.length || 0,
    });
  }

  const activeUsersToday = stats.dailyActiveUsers[todayStr]?.length || 0;
  
  let activeUsersThisWeek = 0;
  const weekUserIds = new Set<string>();
  for (const [date, users] of Object.entries(stats.dailyActiveUsers)) {
    if (date >= weekAgoStr) {
      users.forEach(id => weekUserIds.add(id));
    }
  }
  activeUsersThisWeek = weekUserIds.size;

  const averageAccuracy = stats.totalResponses > 0 
    ? (stats.correctCount / stats.totalResponses) * 100 
    : 0;

  return {
    totalUsers: stats.totalUsers,
    totalSessions: stats.totalSessions,
    totalResponses: stats.totalResponses,
    activeUsersToday,
    activeUsersThisWeek,
    averageAccuracy,
    averageRating: stats.averageRating,
    sessionsByModule: stats.sessionsByModule,
    sessionsByMode: stats.sessionsByMode,
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

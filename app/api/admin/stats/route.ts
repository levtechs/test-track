import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getGlobalStats, getResponsesLast7Days, getActiveUsersLast7Days } from "@/lib/stats";

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
  const stats = await getGlobalStats();
  
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

  const responsesLast7Days = await getResponsesLast7Days();
  const activeUsersLast7Days = await getActiveUsersLast7Days();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = todayStart.toISOString().split("T")[0];

  const weekAgo = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const weekAgoStr = weekAgo.toISOString().split("T")[0];

  const activeUsersToday = activeUsersLast7Days.find((d: { date: string; count: number }) => d.date === todayStr)?.count || 0;
  
  let activeUsersThisWeek = 0;
  const weekUserIds = new Set<string>();
  for (const day of activeUsersLast7Days) {
    if (day.date >= weekAgoStr) {
      weekUserIds.add(day.date);
    }
  }
  activeUsersThisWeek = weekUserIds.size;

  const totalResponses = stats.totalResponses || 0;
  const correctCount = stats.correctCount || 0;
  const averageAccuracy = totalResponses > 0 
    ? (correctCount / totalResponses) * 100 
    : 0;

  return {
    totalUsers: stats.totalUsers || 0,
    totalSessions: stats.totalSessions || 0,
    totalResponses,
    activeUsersToday,
    activeUsersThisWeek,
    averageAccuracy,
    averageRating: stats.averageRating || { english: 1000, math: 1000 },
    sessionsByModule: stats.sessionsByModule || { english: 0, math: 0 },
    sessionsByMode: stats.sessionsByMode || {},
    responsesLast7Days,
    newUsersLast7Days: activeUsersLast7Days,
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

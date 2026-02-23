import { adminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const GLOBAL_STATS_DOC = "stats/global";
const DAILY_STATS_COLLECTION = "dailyStats";

interface GlobalStats {
  totalUsers: number;
  totalSessions: number;
  totalResponses: number;
  correctCount: number;
  sessionsByModule: { english: number; math: number };
  sessionsByMode: Record<string, number>;
  averageRating: { english: number; math: number };
  ratingsCount: { english: number; math: number };
  lastUpdated: number;
}

interface DailyStats {
  date: string;
  responseCount: number;
  correctCount: number;
  activeUsers: string[];
}

export async function getGlobalStats(): Promise<GlobalStats | null> {
  const doc = await adminDb.doc(GLOBAL_STATS_DOC).get();
  return doc.exists ? (doc.data() as GlobalStats) : null;
}

export async function getDailyStats(date: string): Promise<DailyStats | null> {
  const doc = await adminDb.collection(DAILY_STATS_COLLECTION).doc(date).get();
  return doc.exists ? (doc.data() as DailyStats) : null;
}

export async function getAllDailyStats(): Promise<DailyStats[]> {
  const snapshot = await adminDb.collection(DAILY_STATS_COLLECTION).get();
  return snapshot.docs.map(doc => doc.data() as DailyStats);
}

export async function initializeStats(): Promise<void> {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  console.log("Starting stats initialization...");

  const [usersSnap, sessionsSnap, responsesSnap, allUsers, allSessions, recentResponses] = await Promise.all([
    adminDb.collection("users").count().get(),
    adminDb.collection("sessions").count().get(),
    adminDb.collection("responses").count().get(),
    adminDb.collection("users").get(),
    adminDb.collection("sessions").get(),
    adminDb.collection("responses").where("answeredAt", ">=", thirtyDaysAgo).get(),
  ]);

  let correctCount = 0;
  let totalEnglishRating = 0;
  let totalMathRating = 0;
  let englishRatingCount = 0;
  let mathRatingCount = 0;
  let sessionsEnglish = 0;
  let sessionsMath = 0;
  const sessionsByMode: Record<string, number> = {};
  const dailyStatsMap: Record<string, { responseCount: number; correctCount: number; activeUsers: Set<string> }> = {};

  const allResponses = await adminDb.collection("responses").get();
  for (const doc of allResponses.docs) {
    const data = doc.data();
    if (data.isCorrect) correctCount++;
  }

  for (const doc of allUsers.docs) {
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

  for (const doc of allSessions.docs) {
    const data = doc.data();
    if (data.module === "english") sessionsEnglish++;
    else if (data.module === "math") sessionsMath++;

    const mode = data.mode || "sandbox";
    sessionsByMode[mode] = (sessionsByMode[mode] || 0) + 1;
  }

  for (const doc of recentResponses.docs) {
    const data = doc.data();
    const date = new Date(data.answeredAt).toISOString().split("T")[0];

    if (!dailyStatsMap[date]) {
      dailyStatsMap[date] = { responseCount: 0, correctCount: 0, activeUsers: new Set() };
    }
    dailyStatsMap[date].responseCount++;
    if (data.isCorrect) dailyStatsMap[date].correctCount++;
    dailyStatsMap[date].activeUsers.add(data.userId);
  }

  const globalStats: GlobalStats = {
    totalUsers: usersSnap.data().count,
    totalSessions: sessionsSnap.data().count,
    totalResponses: responsesSnap.data().count,
    correctCount,
    sessionsByModule: { english: sessionsEnglish, math: sessionsMath },
    sessionsByMode,
    averageRating: {
      english: englishRatingCount > 0 ? totalEnglishRating / englishRatingCount : 1000,
      math: mathRatingCount > 0 ? totalMathRating / mathRatingCount : 1000,
    },
    ratingsCount: { english: englishRatingCount, math: mathRatingCount },
    lastUpdated: now,
  };

  await adminDb.doc(GLOBAL_STATS_DOC).set(globalStats);
  console.log("Global stats written:", globalStats);

  const batch = adminDb.batch();
  for (const [date, stats] of Object.entries(dailyStatsMap)) {
    const dailyDoc = adminDb.collection(DAILY_STATS_COLLECTION).doc(date);
    batch.set(dailyDoc, {
      date,
      responseCount: stats.responseCount,
      correctCount: stats.correctCount,
      activeUsers: Array.from(stats.activeUsers),
    });
  }
  await batch.commit();
  console.log("Daily stats written for", Object.keys(dailyStatsMap).length, "days");
}

export async function incrementUser(): Promise<void> {
  await adminDb.doc(GLOBAL_STATS_DOC).update({
    totalUsers: FieldValue.increment(1),
    lastUpdated: Date.now(),
  });
}

export async function incrementSession(module: string, mode: string): Promise<void> {
  const normalizedMode = mode || "sandbox";
  await adminDb.doc(GLOBAL_STATS_DOC).update({
    totalSessions: FieldValue.increment(1),
    [`sessionsByModule.${module}`]: FieldValue.increment(1),
    [`sessionsByMode.${normalizedMode}`]: FieldValue.increment(1),
    lastUpdated: Date.now(),
  });
}

export async function incrementResponse(isCorrect: boolean, userId: string): Promise<void> {
  const todayStr = new Date().toISOString().split("T")[0];
  const dailyDocRef = adminDb.collection(DAILY_STATS_COLLECTION).doc(todayStr);

  const dailyDoc = await dailyDocRef.get();
  if (!dailyDoc.exists) {
    await dailyDocRef.set({
      date: todayStr,
      responseCount: 0,
      correctCount: 0,
      activeUsers: [],
    });
  }

  const updates: Record<string, unknown> = {
    responseCount: FieldValue.increment(1),
    activeUsers: FieldValue.arrayUnion(userId),
    lastUpdated: Date.now(),
  };

  if (isCorrect) {
    updates.correctCount = FieldValue.increment(1);
  }

  await dailyDocRef.update(updates);

  await adminDb.doc(GLOBAL_STATS_DOC).update({
    totalResponses: FieldValue.increment(1),
    lastUpdated: Date.now(),
  });
}

export async function updateUserRating(module: "english" | "math", newRating: number): Promise<void> {
  const statsRef = adminDb.doc(GLOBAL_STATS_DOC);

  await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(statsRef);
    if (!doc.exists) return;

    const stats = doc.data() as GlobalStats;
    const currentAvg = stats.averageRating[module];
    const currentCount = stats.ratingsCount[module];
    const newAvg = ((currentAvg * currentCount) + newRating) / (currentCount + 1);

    transaction.update(statsRef, {
      [`averageRating.${module}`]: newAvg,
      [`ratingsCount.${module}`]: currentCount + 1,
      lastUpdated: Date.now(),
    });
  });
}

export async function getTotalCorrectCount(): Promise<number> {
  const snapshot = await adminDb.collection(DAILY_STATS_COLLECTION)
    .select("correctCount")
    .get();
  
  let total = 0;
  for (const doc of snapshot.docs) {
    total += (doc.data().correctCount as number) || 0;
  }
  return total;
}

export async function getResponsesLast7Days(): Promise<{ date: string; count: number }[]> {
  const now = new Date();
  const result: { date: string; count: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const doc = await adminDb.collection(DAILY_STATS_COLLECTION).doc(dateStr).get();
    const data = doc.exists ? doc.data() : null;
    result.push({
      date: dateStr,
      count: data ? (data.responseCount ?? 0) : 0,
    });
  }

  return result;
}

export async function getActiveUsersLast7Days(): Promise<{ date: string; count: number }[]> {
  const now = new Date();
  const result: { date: string; count: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const doc = await adminDb.collection(DAILY_STATS_COLLECTION).doc(dateStr).get();
    const data = doc.exists ? doc.data() : null;
    const activeUsers = data ? ((data.activeUsers as string[]) || []) : [];
    result.push({
      date: dateStr,
      count: activeUsers.length,
    });
  }

  return result;
}

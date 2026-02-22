import { adminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const STATS_DOC = "stats/global";

export interface AppStats {
  totalUsers: number;
  totalResponses: number;
  correctCount: number;
  totalSessions: number;
  sessionsByModule: { english: number; math: number };
  sessionsByMode: Record<string, number>;
  averageRating: { english: number; math: number };
  ratingsCount: { english: number; math: number };
  dailyResponses: Record<string, number>;
  dailyActiveUsers: Record<string, string[]>;
  lastUpdated: number;
}

export async function getStats(): Promise<AppStats | null> {
  const doc = await adminDb.doc(STATS_DOC).get();
  return doc.exists ? (doc.data() as AppStats) : null;
}

export async function initializeStats(): Promise<void> {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

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
  const dailyResponses: Record<string, number> = {};
  const dailyActiveUsers: Record<string, Set<string>> = {};

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
    
    dailyResponses[date] = (dailyResponses[date] || 0) + 1;

    if (!dailyActiveUsers[date]) {
      dailyActiveUsers[date] = new Set();
    }
    dailyActiveUsers[date].add(data.userId);
  }

  const dailyActiveUsersConverted: Record<string, string[]> = {};
  for (const [date, users] of Object.entries(dailyActiveUsers)) {
    dailyActiveUsersConverted[date] = Array.from(users);
  }

  const stats: AppStats = {
    totalUsers: usersSnap.data().count,
    totalResponses: responsesSnap.data().count,
    correctCount,
    totalSessions: sessionsSnap.data().count,
    sessionsByModule: { english: sessionsEnglish, math: sessionsMath },
    sessionsByMode,
    averageRating: {
      english: englishRatingCount > 0 ? totalEnglishRating / englishRatingCount : 1000,
      math: mathRatingCount > 0 ? totalMathRating / mathRatingCount : 1000,
    },
    ratingsCount: { english: englishRatingCount, math: mathRatingCount },
    dailyResponses,
    dailyActiveUsers: dailyActiveUsersConverted,
    lastUpdated: now,
  };

  await adminDb.doc(STATS_DOC).set(stats);
  console.log("Stats initialized:", stats);
}

export async function incrementUser(): Promise<void> {
  await adminDb.doc(STATS_DOC).update({
    totalUsers: FieldValue.increment(1),
    lastUpdated: Date.now(),
  });
}

export async function incrementSession(module: string, mode: string): Promise<void> {
  const normalizedMode = mode || "sandbox";
  await adminDb.doc(STATS_DOC).update({
    totalSessions: FieldValue.increment(1),
    [`sessionsByModule.${module}`]: FieldValue.increment(1),
    [`sessionsByMode.${normalizedMode}`]: FieldValue.increment(1),
    lastUpdated: Date.now(),
  });
}

export async function incrementResponse(isCorrect: boolean, userId: string): Promise<void> {
  const todayStr = new Date().toISOString().split("T")[0];
  
  const updates: Record<string, unknown> = {
    totalResponses: FieldValue.increment(1),
    [`dailyResponses.${todayStr}`]: FieldValue.increment(1),
    lastUpdated: Date.now(),
  };

  if (isCorrect) {
    updates.correctCount = FieldValue.increment(1);
  }

  await adminDb.doc(STATS_DOC).update(updates);

  const stats = await getStats();
  if (stats) {
    const todayUsers = stats.dailyActiveUsers[todayStr] || [];
    if (!todayUsers.includes(userId)) {
      await adminDb.doc(STATS_DOC).update({
        [`dailyActiveUsers.${todayStr}`]: FieldValue.arrayUnion(userId),
      });
    }
  }
}

export async function updateUserRating(module: "english" | "math", newRating: number): Promise<void> {
  const field = module === "english" ? "averageRating.english" : "averageRating.math";
  const countField = module === "english" ? "ratingsCount.english" : "ratingsCount.math";

  const stats = await getStats();
  if (!stats) return;

  const currentAvg = stats.averageRating[module];
  const currentCount = stats.ratingsCount[module];
  const newAvg = ((currentAvg * currentCount) + newRating) / (currentCount + 1);

  await adminDb.doc(STATS_DOC).update({
    [field]: newAvg,
    [countField]: currentCount + 1,
    lastUpdated: Date.now(),
  });
}

export async function pruneOldDailyData(): Promise<void> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

  const stats = await getStats();
  if (!stats) return;

  const newDailyResponses: Record<string, number> = {};
  const newDailyActiveUsers: Record<string, string[]> = {};

  for (const [date, count] of Object.entries(stats.dailyResponses)) {
    if (date >= cutoff) {
      newDailyResponses[date] = count;
    }
  }

  for (const [date, users] of Object.entries(stats.dailyActiveUsers)) {
    if (date >= cutoff) {
      newDailyActiveUsers[date] = users;
    }
  }

  await adminDb.doc(STATS_DOC).update({
    dailyResponses: newDailyResponses,
    dailyActiveUsers: newDailyActiveUsers,
    lastUpdated: Date.now(),
  });
}

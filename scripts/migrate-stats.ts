import 'dotenv/config';
import { adminDb } from "../lib/firebase-admin";

const GLOBAL_STATS_DOC = "stats/global";
const DAILY_STATS_COLLECTION = "dailyStats";

interface DailyStats {
  responseCount: number;
  correctCount: number;
  activeUsers: string[];
}

async function migrateStats() {
  console.log("Starting stats migration...");

  const now = Date.now();

  console.log("Fetching data from Firestore...");

  const [usersSnap, sessionsSnap, responsesSnap, allUsers, allSessions, allResponses] = await Promise.all([
    adminDb.collection("users").count().get(),
    adminDb.collection("sessions").count().get(),
    adminDb.collection("responses").count().get(),
    adminDb.collection("users").get(),
    adminDb.collection("sessions").get(),
    adminDb.collection("responses").get(),
  ]);

  console.log(`Found ${usersSnap.data().count} users`);
  console.log(`Found ${sessionsSnap.data().count} sessions`);
  console.log(`Found ${responsesSnap.data().count} responses`);

  let correctCount = 0;
  let totalEnglishRating = 0;
  let totalMathRating = 0;
  let englishRatingCount = 0;
  let mathRatingCount = 0;
  let sessionsEnglish = 0;
  let sessionsMath = 0;
  const sessionsByMode: Record<string, number> = {};

  console.log("Processing responses for correct count...");
  for (const doc of allResponses.docs) {
    const data = doc.data();
    if (data.isCorrect) correctCount++;
  }

  console.log("Processing users for average ratings...");
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

  console.log("Processing sessions for module/mode breakdown...");
  for (const doc of allSessions.docs) {
    const data = doc.data();
    if (data.module === "english") sessionsEnglish++;
    else if (data.module === "math") sessionsMath++;

    const mode = data.mode || "sandbox";
    sessionsByMode[mode] = (sessionsByMode[mode] || 0) + 1;
  }

  console.log("Processing responses for daily stats...");
  const dailyStatsMap: Record<string, DailyStats> = {};

  for (const doc of allResponses.docs) {
    const data = doc.data();
    const date = new Date(data.answeredAt).toISOString().split("T")[0];
    
    if (!dailyStatsMap[date]) {
      dailyStatsMap[date] = { responseCount: 0, correctCount: 0, activeUsers: [] };
    }
    dailyStatsMap[date].responseCount++;
    if (data.isCorrect) dailyStatsMap[date].correctCount++;
    if (!dailyStatsMap[date].activeUsers.includes(data.userId)) {
      dailyStatsMap[date].activeUsers.push(data.userId);
    }
  }

  const globalStats = {
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
    lastUpdated: now,
  };

  console.log("Writing global stats to Firestore...");
  await adminDb.doc(GLOBAL_STATS_DOC).set(globalStats);

  console.log(`Writing ${Object.keys(dailyStatsMap).length} daily stats documents...`);
  for (const [date, stats] of Object.entries(dailyStatsMap)) {
    await adminDb.collection(DAILY_STATS_COLLECTION).doc(date).set(stats);
  }

  console.log("Migration complete!");
  console.log("Global Stats:", JSON.stringify(globalStats, null, 2));
  console.log("Daily Stats Dates:", Object.keys(dailyStatsMap).sort());
}

migrateStats().catch(console.error);

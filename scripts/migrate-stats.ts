import 'dotenv/config';
import { adminDb } from "../lib/firebase-admin";

async function migrateStats() {
  console.log("Starting stats migration...");

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  console.log("Fetching data from Firestore...");

  const [
    usersSnap,
    sessionsSnap,
    responsesSnap,
    allUsers,
    allSessions,
    recentResponses,
  ] = await Promise.all([
    adminDb.collection("users").count().get(),
    adminDb.collection("sessions").count().get(),
    adminDb.collection("responses").count().get(),
    adminDb.collection("users").get(),
    adminDb.collection("sessions").get(),
    adminDb.collection("responses").where("answeredAt", ">=", thirtyDaysAgo).get(),
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
  const dailyResponses: Record<string, number> = {};
  const dailyActiveUsers: Record<string, Set<string>> = {};

  console.log("Processing responses for correct count...");
  const allResponses = await adminDb.collection("responses").get();
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

  console.log("Processing recent responses for daily stats...");
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

  const stats = {
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

  console.log("Writing stats to Firestore...");
  await adminDb.doc("stats/global").set(stats);

  console.log("Migration complete!");
  console.log("Stats:", JSON.stringify(stats, null, 2));
}

migrateStats().catch(console.error);

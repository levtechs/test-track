import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getQuestionsByModule } from "@/lib/question-cache";
import { recommendQuestions } from "@/lib/algorithm";
import { ratingField } from "@/lib/rating";
import { verifyAuth } from "@/lib/api-auth";
import type { Session, Module } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { module } = body as { module: Module };

    if (!module || !["english", "math"].includes(module)) {
      return NextResponse.json(
        { error: "Invalid module. Must be 'english' or 'math'" },
        { status: 400 }
      );
    }

    // Authenticate via Authorization header
    const { userId, userProfile } = await verifyAuth(request);

    const currentRating = userProfile
      ? userProfile[ratingField(module)]
      : 1000;

    // Look for an existing session for this user + module
    const existingSnap = await adminDb
      .collection("sessions")
      .where("userId", "==", userId)
      .where("module", "==", module)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      const existingSession = existingDoc.data() as Session;

      // Update lastActiveAt and sync rating from user profile
      const updates: Record<string, unknown> = {
        lastActiveAt: Date.now(),
      };

      // Sync current rating from user profile (may have changed from other contexts)
      if (userProfile) {
        updates.currentRating = currentRating;
      }

      // If buffer is empty, replenish it
      if (existingSession.bufferedQuestions.length === 0) {
        const allQuestions = await getQuestionsByModule(module);

        const wrongQuestionIds = new Set<string>();
        const correctQuestionIds = new Set<string>();

        if (userProfile) {
          const responsesSnap = await adminDb
            .collection("responses")
            .where("userId", "==", userId)
            .where("isCorrect", "==", false)
            .orderBy("answeredAt", "desc")
            .limit(200)
            .get();
          responsesSnap.docs.forEach((doc) => {
            wrongQuestionIds.add(doc.data().questionId);
          });

          const correctSnap = await adminDb
            .collection("responses")
            .where("userId", "==", userId)
            .where("isCorrect", "==", true)
            .orderBy("answeredAt", "desc")
            .limit(200)
            .get();
          correctSnap.docs.forEach((doc) => {
            correctQuestionIds.add(doc.data().questionId);
          });
        }

        const recommendedIds = recommendQuestions(
          {
            candidates: allQuestions,
            userRating: currentRating,
            userProfile,
            session: { ...existingSession, currentRating },
            wrongQuestionIds,
            correctQuestionIds,
          },
          3
        );

        updates.bufferedQuestions = recommendedIds.map((id) => ({ questionId: id }));
      }

      await existingDoc.ref.update(updates);

      return NextResponse.json({
        sessionId: existingSession.sessionId,
        module: existingSession.module,
        currentRating: userProfile ? currentRating : existingSession.currentRating,
        bufferedQuestions: existingSession.bufferedQuestions,
        resumed: true,
      });
    }

    // No existing session — create a new one

    // Fetch questions for this module
    const allQuestions = await getQuestionsByModule(module);

    // Get user's past wrong/correct answers for recommendation
    const wrongQuestionIds = new Set<string>();
    const correctQuestionIds = new Set<string>();

    if (userProfile) {
      const responsesSnap = await adminDb
        .collection("responses")
        .where("userId", "==", userId)
        .where("isCorrect", "==", false)
        .orderBy("answeredAt", "desc")
        .limit(200)
        .get();

      responsesSnap.docs.forEach((doc) => {
        wrongQuestionIds.add(doc.data().questionId);
      });

      const correctSnap = await adminDb
        .collection("responses")
        .where("userId", "==", userId)
        .where("isCorrect", "==", true)
        .orderBy("answeredAt", "desc")
        .limit(200)
        .get();

      correctSnap.docs.forEach((doc) => {
        correctQuestionIds.add(doc.data().questionId);
      });
    }

    // Create session document
    const sessionRef = adminDb.collection("sessions").doc();
    const session: Session = {
      sessionId: sessionRef.id,
      userId,
      module,
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
      currentRating,
      ratingAtStart: currentRating,
      questionCount: 0,
      correctCount: 0,
      streak: 0,
      bestStreak: 0,
      bufferedQuestions: [],
      targetedSkills: [],
      difficultyBias: null,
    };

    // Recommend initial buffer of 3 questions
    const recommendedIds = recommendQuestions(
      {
        candidates: allQuestions,
        userRating: currentRating,
        userProfile,
        session,
        wrongQuestionIds,
        correctQuestionIds,
      },
      3
    );

    session.bufferedQuestions = recommendedIds.map((id) => ({ questionId: id }));

    await sessionRef.set(session);

    return NextResponse.json({
      sessionId: session.sessionId,
      module: session.module,
      currentRating,
      bufferedQuestions: session.bufferedQuestions,
      resumed: false,
    });
  } catch (error) {
    console.error("Session start error:", error);
    return NextResponse.json(
      { error: "Failed to start session" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getQuestionsByModule } from "@/lib/question-cache";
import { recommendQuestions } from "@/lib/algorithm";
import { ratingField } from "@/lib/algorithm/rating";
import { verifyAuth } from "@/lib/api-auth";
import type { Session, Module } from "@/types";
import type { SkillElo, QuestionRepetition } from "@/types/user";

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
    const { userId, userProfile, isGuest } = await verifyAuth(request);

    const currentRating = userProfile
      ? userProfile[ratingField(module)]
      : 1000;

    const skillElos: Record<string, SkillElo> = userProfile?.skillElos || {};
    const questionRepetitions: Record<string, QuestionRepetition> = userProfile?.questionRepetitions || {};

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

        const recommendedIds = recommendQuestions(
          {
            candidates: allQuestions,
            userRating: currentRating,
            userProfile,
            session: { ...existingSession, currentRating },
            skillElos,
            questionRepetitions,
          },
          3
        );

        updates.bufferedQuestions = recommendedIds.map((id: string) => ({ questionId: id }));
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
    const allQuestions = await getQuestionsByModule(module);

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
        skillElos,
        questionRepetitions,
      },
      3
    );

    session.bufferedQuestions = recommendedIds.map((id: string) => ({ questionId: id }));

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

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getQuestionsByModule } from "@/lib/question-cache";
import { recommendQuestions, recommendReviewQuestions, recommendDailyChallenge } from "@/lib/algorithm";
import { ratingField } from "@/lib/algorithm/rating";
import { verifyAuth } from "@/lib/api-auth";
import type { Session, Module } from "@/types";
import type { SkillElo, QuestionRepetition, SessionMode } from "@/types/user";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { module, mode = "sandbox", timeLimitMs } = body as { module: Module; mode: SessionMode; timeLimitMs?: number };

    if (!module || !["english", "math"].includes(module)) {
      return NextResponse.json(
        { error: "Invalid module. Must be 'english' or 'math'" },
        { status: 400 }
      );
    }

    if (!["sandbox", "speed_round", "review", "daily"].includes(mode)) {
      return NextResponse.json(
        { error: "Invalid mode" },
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

    // For speed_round, always start fresh - delete any existing speed_round sessions
    if (mode === "speed_round") {
      const existingSpeedSnap = await adminDb
        .collection("sessions")
        .where("userId", "==", userId)
        .where("module", "==", module)
        .where("mode", "==", "speed_round")
        .get();
      
      const deletePromises = existingSpeedSnap.docs.map((doc) => doc.ref.delete());
      await Promise.all(deletePromises);
    }

    // Look for an existing session for this user + module + mode
    // If mode is sandbox, also match sessions with no mode (legacy sessions)
    const existingSnap = await adminDb
      .collection("sessions")
      .where("userId", "==", userId)
      .where("module", "==", module)
      .where("mode", "==", mode)
      .limit(1)
      .get();

    // If no session with mode found and mode is sandbox, look for session with no mode
    if (existingSnap.empty && mode === "sandbox") {
      const allSessionsSnap = await adminDb
        .collection("sessions")
        .where("userId", "==", userId)
        .where("module", "==", module)
        .limit(10)
        .get();
      
      // Find a session with no mode
      const noModeSession = allSessionsSnap.docs.find((doc) => {
        const data = doc.data() as Session;
        return !data.mode;
      });
      
      if (noModeSession) {
        const existingDoc = noModeSession;
        let existingSession = existingDoc.data() as Session;

        // If session has no mode, treat it as sandbox and update it
        if (!existingSession.mode && mode === "sandbox") {
          existingSession = { ...existingSession, mode: "sandbox" };
          await existingDoc.ref.update({ mode: "sandbox", lastActiveAt: Date.now() });
        }

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
          mode: existingSession.mode,
          currentRating: userProfile ? currentRating : existingSession.currentRating,
          bufferedQuestions: existingSession.bufferedQuestions,
          resumed: true,
        });
      }
    }

    // Handle sessions with a proper mode
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

        let recommendedIds: string[];
        
        if (mode === "review") {
          recommendedIds = recommendReviewQuestions(
            { candidates: allQuestions, module, questionRepetitions, session: { ...existingSession, currentRating } },
            10
          );
        } else if (mode === "daily") {
          recommendedIds = recommendDailyChallenge(
            { candidates: allQuestions, module, dateSeed: new Date().toISOString().split("T")[0], userId },
            10
          );
        } else {
          recommendedIds = recommendQuestions(
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
        }

        updates.bufferedQuestions = recommendedIds.map((id: string) => ({ questionId: id }));
      }

      await existingDoc.ref.update(updates);

      return NextResponse.json({
        sessionId: existingSession.sessionId,
        module: existingSession.module,
        mode: existingSession.mode,
        currentRating: userProfile ? currentRating : existingSession.currentRating,
        bufferedQuestions: existingSession.bufferedQuestions,
        resumed: true,
      });
    }

    // No existing session — create a new one
    const allQuestions = await getQuestionsByModule(module);

    // Mode-specific configuration
    const defaultTimeLimits: Record<SessionMode, number | undefined> = {
      sandbox: undefined,
      speed_round: 3 * 60 * 1000, // 3 minutes default, matching frontend
      review: undefined,
      daily: undefined,
    };
    };

    const effectiveTimeLimit = timeLimitMs ?? defaultTimeLimits[mode];

    const sessionConfig = {
      ...(effectiveTimeLimit !== undefined && { timeLimitMs: effectiveTimeLimit }),
      ...(mode === "daily" && { dateSeed: new Date().toISOString().split("T")[0] }),
      ...(mode === "daily" && { expiresAt: Date.now() + 24 * 60 * 60 * 1000 }),
    };

    // Create session document
    const sessionRef = adminDb.collection("sessions").doc();
    const session: Session = {
      sessionId: sessionRef.id,
      userId,
      module,
      mode,
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
      ...sessionConfig,
    };

    // Recommend questions based on mode
    let recommendedIds: string[];
    
    if (mode === "review") {
      recommendedIds = recommendReviewQuestions(
        { candidates: allQuestions, module, questionRepetitions, session },
        10
      );
    } else if (mode === "daily") {
      recommendedIds = recommendDailyChallenge(
        { candidates: allQuestions, module, dateSeed: sessionConfig.dateSeed!, userId },
        10
      );
    } else {
      // sandbox and speed_round use the adaptive algorithm
      recommendedIds = recommendQuestions(
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
    }

    session.bufferedQuestions = recommendedIds.map((id: string) => ({ questionId: id }));

    await sessionRef.set(session);

    return NextResponse.json({
      sessionId: session.sessionId,
      module: session.module,
      mode: session.mode,
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

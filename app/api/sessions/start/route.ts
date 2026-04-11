import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getQuestionsByModule, getQuestionsByModules } from "@/lib/question-cache";
import { recommendQuestions, recommendReviewQuestions, recommendDailyChallenge } from "@/lib/algorithm";
import { ratingField } from "@/lib/algorithm/rating";
import { verifyAuth } from "@/lib/api-auth";
import { arePracticeFiltersEqual, filterQuestionsForPractice, hasPracticeFilters, normalizePracticeFilters } from "@/lib/practice-filters";
import type { Session, Module } from "@/types";
import type { SkillElo, QuestionRepetition, SessionMode, PracticeFilters } from "@/types/user";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { module, mode = "sandbox", timeLimitMs, practiceFilters } = body as {
      module: Module;
      mode: SessionMode;
      timeLimitMs?: number;
      practiceFilters?: PracticeFilters;
    };

    if (!module || !["english", "math"].includes(module)) {
      return NextResponse.json(
        { error: "Invalid module. Must be 'english' or 'math'" },
        { status: 400 }
      );
    }

    if (!["sandbox", "custom", "speed_round", "review", "daily"].includes(mode)) {
      return NextResponse.json(
        { error: "Invalid mode" },
        { status: 400 }
      );
    }

    // Authenticate via Authorization header
    const { userId, userProfile } = await verifyAuth(request);

    const currentRating = userProfile
      ? userProfile[ratingField(module)]
      : 1000;

    const skillElos: Record<string, SkillElo> = userProfile?.skillElos || {};
    const questionRepetitions: Record<string, QuestionRepetition> = userProfile?.questionRepetitions || {};
    const normalizedPracticeFilters = mode === "custom"
      ? normalizePracticeFilters(practiceFilters)
      : normalizePracticeFilters();
    const customModules = normalizedPracticeFilters.modules.length > 0
      ? normalizedPracticeFilters.modules
      : [module];
    const sessionModule = mode === "custom"
      ? customModules[0] || module
      : module;

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

    // Look for an existing session for this user + module + mode.
    // Sandbox sessions also need the same filter set to resume correctly.
    const existingSnap = await (mode === "custom"
      ? adminDb
          .collection("sessions")
          .where("userId", "==", userId)
          .where("mode", "==", mode)
          .limit(50)
          .get()
      : adminDb
          .collection("sessions")
          .where("userId", "==", userId)
          .where("module", "==", sessionModule)
          .where("mode", "==", mode)
          .limit(1)
          .get());

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
      
      if (noModeSession && arePracticeFiltersEqual(noModeSession.data().practiceFilters, normalizedPracticeFilters)) {
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
          const allQuestions = await getQuestionsByModule(sessionModule);
          const candidatePool = filterQuestionsForPractice(allQuestions, sessionModule, normalizedPracticeFilters);

          if (candidatePool.length === 0) {
            return NextResponse.json(
              { error: "No questions match those practice filters" },
              { status: 400 }
            );
          }

          const recommendedIds = recommendQuestions(
            {
              candidates: candidatePool,
              userRating: currentRating,
              userProfile,
              session: { ...existingSession, currentRating, practiceFilters: normalizedPracticeFilters },
              skillElos,
              questionRepetitions,
            },
            3
          );
          updates.bufferedQuestions = recommendedIds.map((id: string) => ({ questionId: id }));
        }

        await existingDoc.ref.update({
          ...updates,
          targetedSkills: existingSession.targetedSkills,
          targetedDomains: existingSession.targetedDomains || [],
          difficultyBias: existingSession.difficultyBias,
          practiceFilters: normalizedPracticeFilters,
        });

        const nextBufferedQuestions = (updates.bufferedQuestions as Session["bufferedQuestions"] | undefined)
          ?? existingSession.bufferedQuestions;

        return NextResponse.json({
          sessionId: existingSession.sessionId,
          module: existingSession.module,
          mode: existingSession.mode,
          currentRating: userProfile ? currentRating : existingSession.currentRating,
          bufferedQuestions: nextBufferedQuestions,
          resumed: true,
        });
      }
    }

    // Handle sessions with a proper mode
    if (!existingSnap.empty) {
      const existingDoc = mode === "custom"
        ? existingSnap.docs.find((doc) => arePracticeFiltersEqual((doc.data() as Session).practiceFilters, normalizedPracticeFilters))
        : existingSnap.docs[0];

      if (existingDoc) {
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
        const allQuestions = mode === "custom"
          ? await getQuestionsByModules(customModules)
          : await getQuestionsByModule(sessionModule);
        const candidatePool = mode === "custom"
          ? filterQuestionsForPractice(allQuestions, sessionModule, normalizedPracticeFilters)
          : allQuestions;

        if (candidatePool.length === 0) {
          return NextResponse.json(
            { error: "No questions match those practice filters" },
            { status: 400 }
          );
        }

        let recommendedIds: string[];
        
        if (mode === "review") {
          recommendedIds = recommendReviewQuestions(
            { candidates: candidatePool, module, questionRepetitions, session: { ...existingSession, currentRating } },
            10
          );
        } else if (mode === "daily") {
          recommendedIds = recommendDailyChallenge(
            { candidates: candidatePool, module: sessionModule, dateSeed: existingSession.dateSeed || new Date().toISOString().split("T")[0], userId },
            10
          );
        } else {
          recommendedIds = recommendQuestions(
            {
              candidates: candidatePool,
              userRating: currentRating,
              userProfile,
              session: { ...existingSession, currentRating, practiceFilters: normalizedPracticeFilters },
              skillElos,
              questionRepetitions,
            },
            3
          );
        }

        updates.bufferedQuestions = recommendedIds.map((id: string) => ({ questionId: id }));
      }

        await existingDoc.ref.update({
          ...updates,
          targetedSkills: normalizedPracticeFilters.skills.length > 0 ? normalizedPracticeFilters.skills : existingSession.targetedSkills,
          targetedDomains: normalizedPracticeFilters.domains.length > 0 ? normalizedPracticeFilters.domains : existingSession.targetedDomains || [],
          difficultyBias: normalizedPracticeFilters.difficulties.length === 1 ? normalizedPracticeFilters.difficulties[0] : existingSession.difficultyBias,
          practiceFilters: normalizedPracticeFilters,
        });

        const nextBufferedQuestions = (updates.bufferedQuestions as Session["bufferedQuestions"] | undefined)
          ?? existingSession.bufferedQuestions;

        return NextResponse.json({
          sessionId: existingSession.sessionId,
          module: existingSession.module,
          mode: existingSession.mode,
          currentRating: userProfile ? currentRating : existingSession.currentRating,
          bufferedQuestions: nextBufferedQuestions,
          resumed: true,
        });
      }
    }

    // No existing session — create a new one
    const allQuestions = mode === "custom"
      ? await getQuestionsByModules(customModules)
      : await getQuestionsByModule(sessionModule);
    const candidatePool = mode === "custom"
      ? filterQuestionsForPractice(allQuestions, sessionModule, normalizedPracticeFilters)
      : allQuestions;

    if (mode === "custom" && hasPracticeFilters(normalizedPracticeFilters) && candidatePool.length === 0) {
      return NextResponse.json(
        { error: "No questions match those practice filters" },
        { status: 400 }
      );
    }

    // Mode-specific configuration
    const defaultTimeLimits: Record<SessionMode, number | undefined> = {
      sandbox: undefined,
      custom: undefined,
      speed_round: 3 * 60 * 1000, // 3 minutes default, matching frontend
      review: undefined,
      daily: undefined,
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
      module: sessionModule,
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
      targetedSkills: normalizedPracticeFilters.skills,
      targetedDomains: normalizedPracticeFilters.domains,
      difficultyBias: normalizedPracticeFilters.difficulties.length === 1 ? normalizedPracticeFilters.difficulties[0] : null,
      practiceFilters: normalizedPracticeFilters,
      ...sessionConfig,
    };

    // Recommend questions based on mode
    let recommendedIds: string[];
    
    if (mode === "review") {
      recommendedIds = recommendReviewQuestions(
        { candidates: candidatePool, module: sessionModule, questionRepetitions, session },
        10
      );
    } else if (mode === "daily") {
      recommendedIds = recommendDailyChallenge(
        { candidates: candidatePool, module: sessionModule, dateSeed: sessionConfig.dateSeed!, userId },
        10
      );
    } else {
      // sandbox and speed_round use the adaptive algorithm
      recommendedIds = recommendQuestions(
        {
          candidates: candidatePool,
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

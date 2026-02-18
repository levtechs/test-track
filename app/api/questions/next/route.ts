import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getQuestionsByModule } from "@/lib/question-cache";
import { recommendQuestions } from "@/lib/algorithm";
import { updateUserRating, updateQuestionElo, ratingField } from "@/lib/rating";
import { verifyAuth, verifySessionOwnership } from "@/lib/api-auth";
import type { Session, UserProfile, Response } from "@/types";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sessionId,
      questionId,
      selectedAnswer,
      timeSpentMs,
    } = body as {
      sessionId: string;
      questionId: string;
      selectedAnswer: string;
      timeSpentMs: number;
    };

    if (!sessionId || !questionId || !selectedAnswer) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const authResult = await verifyAuth(request);
    const userId = authResult.userId;
    const isGuest = authResult.isGuest;

    const sessionRef = adminDb.collection("sessions").doc(sessionId);

    const result = await adminDb.runTransaction(async (transaction) => {
      const sessionSnap = await transaction.get(sessionRef);

      if (!sessionSnap.exists) {
        throw new Error("Session not found");
      }

      const session = sessionSnap.data() as Session;

      if (!verifySessionOwnership(session.userId, userId, isGuest)) {
        throw new Error("Unauthorized");
      }

      // Find first unanswered question
      const firstUnansweredIndex = session.bufferedQuestions.findIndex(
        (q) => q.answeredAt === undefined
      );

      if (firstUnansweredIndex === -1) {
        throw new Error("No unanswered questions");
      }

      const firstUnanswered = session.bufferedQuestions[firstUnansweredIndex];

      // Race condition check: submitted question must match first unanswered
      if (firstUnanswered.questionId !== questionId) {
        throw new Error("Stale question - already answered");
      }

      // Get the question to check the answer
      const questionSnap = await adminDb
        .collection("questions")
        .where("question_id", "==", questionId)
        .limit(1)
        .get();

      if (questionSnap.empty) {
        throw new Error("Question not found");
      }

      const questionDoc = questionSnap.docs[0];
      const questionData = questionDoc.data();
      const correctAnswer = questionData.correct_answer?.[0] || "";

      // Map selected answer to letter (A, B, C, D)
      const answerIndex = questionData.answer_options?.findIndex(
        (opt: { id: string }) => opt.id === selectedAnswer
      );
      const selectedLetter =
        answerIndex >= 0
          ? String.fromCharCode(65 + answerIndex)
          : selectedAnswer;

      const isCorrect = selectedLetter === correctAnswer || selectedAnswer === correctAnswer;

      // Calculate new rating
      const newUserRating = updateUserRating(
        session.currentRating,
        questionData.elo || 1100,
        isCorrect
      );

      // Update session stats
      const newStreak = isCorrect ? session.streak + 1 : 0;
      const newBestStreak = Math.max(session.bestStreak, newStreak);

      // Get fresh questions for recommendation
      const allQuestions = await getQuestionsByModule(session.module);

      // Get user profile for skill stats
      let userProfile: UserProfile | null = null;
      if (!session.userId.startsWith("guest_")) {
        const userDoc = await adminDb
          .collection("users")
          .doc(session.userId)
          .get();
        if (userDoc.exists) {
          userProfile = userDoc.data() as UserProfile;
        }
      }

      // Build wrong/correct sets from recent responses
      const wrongQuestionIds = new Set<string>();
      const correctQuestionIds = new Set<string>();

      if (userProfile) {
        const pastResponses = await adminDb
          .collection("responses")
          .where("userId", "==", session.userId)
          .orderBy("answeredAt", "desc")
          .limit(200)
          .get();

        pastResponses.docs.forEach((doc) => {
          const r = doc.data();
          if (r.isCorrect) {
            correctQuestionIds.add(r.questionId);
          } else {
            wrongQuestionIds.add(r.questionId);
          }
        });
      }

      // Create updated session for recommendation
      const updatedSession: Session = {
        ...session,
        currentRating: newUserRating,
        questionCount: session.questionCount + 1,
        correctCount: session.correctCount + (isCorrect ? 1 : 0),
        streak: newStreak,
        bestStreak: newBestStreak,
      };

      // Mark the question as answered
      const newBuffer = [...session.bufferedQuestions];
      newBuffer[firstUnansweredIndex] = {
        questionId,
        selectedAnswer,
        isCorrect,
        correctAnswer,
        answeredAt: Date.now(),
        timeSpentMs: timeSpentMs || 0,
        ratingChange: newUserRating - session.currentRating,
      };

      // Ensure buffer has enough unanswered questions (at least 3)
      const unansweredCount = newBuffer.filter((q) => q.answeredAt === undefined).length;
      let finalBuffer = newBuffer;

      if (unansweredCount < 3) {
        const questionsToAdd = 3 - unansweredCount;
        
        const nextQuestions = recommendQuestions(
          {
            candidates: allQuestions,
            userRating: newUserRating,
            userProfile,
            session: updatedSession,
            wrongQuestionIds,
            correctQuestionIds,
          },
          questionsToAdd
        );

        finalBuffer = [
          ...newBuffer,
          ...nextQuestions.map((id) => ({ questionId: id })),
        ];
      }

      // Update session document atomically
      transaction.update(sessionRef, {
        currentRating: newUserRating,
        questionCount: updatedSession.questionCount,
        correctCount: updatedSession.correctCount,
        streak: newStreak,
        bestStreak: newBestStreak,
        bufferedQuestions: finalBuffer,
        lastActiveAt: Date.now(),
      });

      return {
        isCorrect,
        correctAnswer,
        newRating: newUserRating,
        ratingChange: newUserRating - session.currentRating,
        streak: newStreak,
        bestStreak: newBestStreak,
        bufferedQuestions: finalBuffer,
      };
    });

    // Update question Elo outside transaction
    const questionSnap = await adminDb
      .collection("questions")
      .where("question_id", "==", questionId)
      .limit(1)
      .get();

    if (!questionSnap.empty) {
      const questionDoc = questionSnap.docs[0];
      const questionData = questionDoc.data();

      const { newElo, newAnswerCount } = updateQuestionElo(
        questionData.elo || 1100,
        result.newRating,
        questionData.eloAnswerCount || 0,
        result.isCorrect
      );

      await questionDoc.ref.update({
        elo: newElo,
        eloAnswerCount: newAnswerCount,
      });
    }

    // Save response record
    const response: Response = {
      userId: userId || "guest",
      sessionId,
      questionId,
      selectedAnswer,
      isCorrect: result.isCorrect,
      timeSpentMs: timeSpentMs || 0,
      answeredAt: Date.now(),
    };

    await adminDb.collection("responses").add(response);

    // Update user profile stats if authenticated
    const sessionSnap = await sessionRef.get();
    const session = sessionSnap.data() as Session;

    if (!session.userId.startsWith("guest_")) {
      const userDoc = await adminDb.collection("users").doc(session.userId).get();
      if (userDoc.exists) {
        const userProfile = userDoc.data() as UserProfile;
        const questionData = questionSnap.docs[0]?.data();
        const skillKey = questionData?.skill || "unknown";
        const skillPath = `skillStats.${skillKey}`;
        const currentSkill = userProfile.skillStats[skillKey] || {
          correct: 0,
          total: 0,
          lastSeen: 0,
        };

        await adminDb.collection("users").doc(session.userId).update({
          [ratingField(session.module)]: result.newRating,
          totalQuestions: FieldValue.increment(1),
          totalCorrect: FieldValue.increment(result.isCorrect ? 1 : 0),
          [`${skillPath}.correct`]: currentSkill.correct + (result.isCorrect ? 1 : 0),
          [`${skillPath}.total`]: currentSkill.total + 1,
          [`${skillPath}.lastSeen`]: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Answer submission error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process answer" },
      { status: 500 }
    );
  }
}

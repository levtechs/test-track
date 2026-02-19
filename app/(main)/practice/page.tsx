"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { QuestionCard, InfoButton } from "@/components/question/question-card";
import { RationaleView } from "@/components/question/rationale-view";
import { BookOpen, Calculator, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { Module, QuestionClient, Session } from "@/types";
import type { QueuedQuestion } from "@/types";
import { checkAnswerCorrect } from "@/lib/utils";

type PracticeState =
  | { phase: "select" }
  | { phase: "loading"; module: Module }
  | {
      phase: "active";
      sessionId: string;
      module: Module;
    };

export default function PracticePage() {
  const { user, getIdToken, loading: authLoading } = useAuth();
  const [state, setState] = useState<PracticeState>({ phase: "loading", module: "english" });
  const [session, setSession] = useState<Session | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionClient | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<{ isCorrect: boolean; correctAnswer: string; ratingChange?: number } | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [showRationale, setShowRationale] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Use ref for cache - instant access, no re-renders
  const questionCache = useRef<Map<string, QuestionClient>>(new Map());
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const hasInitializedRef = useRef(false);

  const getGuestId = useCallback(() => {
    if (typeof window === "undefined") return undefined;
    let guestId = localStorage.getItem("sat_guest_id");
    if (!guestId) {
      guestId = `guest_${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem("sat_guest_id", guestId);
    }
    return guestId;
  }, []);

  // Fetch question - uses cache, returns instantly if cached
  const fetchQuestion = useCallback(async (questionId: string): Promise<QuestionClient | null> => {
    // Check cache first
    if (questionCache.current.has(questionId)) {
      return questionCache.current.get(questionId)!;
    }

    try {
      const docRef = doc(db, "questions", questionId);
      let snap = await getDoc(docRef);

      if (!snap.exists()) {
        const { query, collection, where, limit, getDocs } = await import("firebase/firestore");
        const q = query(collection(db, "questions"), where("question_id", "==", questionId), limit(1));
        const querySnap = await getDocs(q);
        if (querySnap.empty) return null;
        snap = querySnap.docs[0];
      }

      const data = snap.data();
      if (!data) return null;

      const question: QuestionClient = {
        question_id: data.question_id || snap.id,
        module: data.module,
        difficulty: data.difficulty,
        domain: data.domain,
        skill: data.skill,
        question_text: data.question_text,
        stimulus: data.stimulus || null,
        answer_options: data.answer_options || [],
        correct_answer: data.correct_answer || [],
        rationale: data.rationale || "",
        question_type: data.question_type || "mcq",
        elo: data.elo || 1100,
        images: data.images || [],
      };

      questionCache.current.set(questionId, question);
      return question;
    } catch (err) {
      console.error("Error fetching question:", err);
      return null;
    }
  }, []);

  // Load question at index - instant if cached
  const loadQuestionAtIndex = useCallback(async (index: number, bufferedQuestions: QueuedQuestion[]) => {
    if (index < 0 || index >= bufferedQuestions.length) return;

    const q = bufferedQuestions[index];
    const cached = questionCache.current.get(q.questionId);
    
    if (cached) {
      setCurrentQuestion(cached);
    } else {
      const question = await fetchQuestion(q.questionId);
      if (question) {
        setCurrentQuestion(question);
      }
    }

    // Set answer state based on whether answered
    if (q.answeredAt !== undefined) {
      setSelectedAnswer(q.selectedAnswer || null);
      setAnswerResult({
        isCorrect: q.isCorrect || false,
        correctAnswer: q.correctAnswer || "",
        ratingChange: q.ratingChange,
      });
      setShowRationale(!(q.isCorrect ?? true));
      setQuestionStartTime(q.timeSpentMs || 0);
    } else {
      setSelectedAnswer(null);
      setAnswerResult(null);
      setShowRationale(false);
      setQuestionStartTime(Date.now());
    }
  }, [fetchQuestion]);

  // Helper to get last session info from Firebase (for authenticated users) or localStorage (for guests)
  const getLastSessionInfo = useCallback(async (module: Module, isGuest: boolean, userId?: string) => {
    if (!isGuest && userId) {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const sessionId = module === "english" ? userData.lastEnglishSessionId : userData.lastMathSessionId;
        const index = module === "english" ? userData.lastEnglishIndex : userData.lastMathIndex;
        console.log("Firebase read - module:", module, "sessionId:", sessionId, "index:", index);
        return { sessionId, index: index ?? 0 };
      }
    }
    // Fall back to localStorage for guests
    const sessionId = localStorage.getItem("sat_last_session_id");
    const indexKey = `sat_last_index_${module}`;
    const savedIndex = localStorage.getItem(indexKey);
    return { sessionId, index: savedIndex ? parseInt(savedIndex, 10) : 0 };
  }, []);

  // Helper to get last module from Firebase (for authenticated users) or localStorage (for guests)
  const getLastModule = useCallback(async (isGuest: boolean, userId?: string): Promise<Module | null> => {
    if (!isGuest && userId) {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        return userData.lastModule || null;
      }
    }
    // Fall back to localStorage for guests
    return localStorage.getItem("sat_last_module") as Module | null;
  }, []);

  // Helper to save last session info to Firebase (for authenticated users) or localStorage (for guests)
  const saveLastSessionInfo = useCallback(async (module: Module, sessionId: string, index: number, isGuest: boolean, userId?: string) => {
    if (!isGuest && userId) {
      try {
        const userRef = doc(db, "users", userId);
        const updateData = module === "english" 
          ? { lastModule: module, lastEnglishSessionId: sessionId, lastEnglishIndex: index }
          : { lastModule: module, lastMathSessionId: sessionId, lastMathIndex: index };
        await updateDoc(userRef, updateData);
      } catch (err) {
        console.error("Failed to save session info to Firebase:", err);
      }
    } else {
      localStorage.setItem("sat_last_session_id", sessionId);
      localStorage.setItem("sat_last_module", module);
      localStorage.setItem(`sat_last_index_${module}`, index.toString());
    }
  }, []);

  // Handle session update from Firebase
  const handleSessionUpdate = useCallback((sessionData: Session, isInitial = false, providedIndex?: number) => {
    setSession(sessionData);

    // On initial load, figure out which index to show
    if (isInitial && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      
      let idx: number;

      // If we have a saved index, use it (even if already answered - that's where user left off)
      if (providedIndex !== undefined) {
        idx = Math.min(providedIndex, sessionData.bufferedQuestions.length - 1);
      } else {
        // No saved index - find first unanswered
        idx = sessionData.bufferedQuestions.findIndex((q: QueuedQuestion) => q.answeredAt === undefined);
        if (idx === -1) idx = sessionData.bufferedQuestions.length - 1;
      }

      setCurrentIndex(idx);
      loadQuestionAtIndex(idx, sessionData.bufferedQuestions);
    }
  }, [loadQuestionAtIndex]);

  // Resume session (from Firebase for auth users, localStorage for guests)
  useEffect(() => {
    // Wait for auth to finish loading before attempting to resume
    if (authLoading) {
      setState({ phase: "loading", module: "english" });
      return;
    }

    const resumeSession = async () => {
      // Show loading while we try to resume
      setState({ phase: "loading", module: "english" });

      const isGuest = !user;
      const savedModule = await getLastModule(isGuest, user?.uid);
      if (!savedModule) {
        setState({ phase: "select" });
        return;
      }

      const { sessionId: savedSessionId, index: savedIndex } = await getLastSessionInfo(savedModule, isGuest, user?.uid);
      
      if (!savedSessionId) {
        setState({ phase: "select" });
        return;
      }

      setState({ phase: "active", sessionId: savedSessionId, module: savedModule });

      const sessionRef = doc(db, "sessions", savedSessionId);
      const unsub = onSnapshot(sessionRef, (snap) => {
        if (!snap.exists()) {
          setState({ phase: "select" });
          return;
        }

        const sessionData = snap.data() as Session;
        handleSessionUpdate(sessionData, true, savedIndex);
      });

      unsubscribeRef.current = unsub;
    };

    resumeSession();
  }, [user, authLoading, getLastModule, getLastSessionInfo, handleSessionUpdate]);

  // Start new session
  const startSession = useCallback(async (module: Module) => {
    setState({ phase: "loading", module });
    questionCache.current.clear();
    hasInitializedRef.current = false;
    setCurrentIndex(0);
    localStorage.removeItem(`sat_last_index_${module}`);

    try {
      const idToken = user ? await getIdToken() : undefined;
      const guestId = !user ? getGuestId() : undefined;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
      if (guestId) headers["X-Guest-Id"] = guestId;

      const res = await fetch("/api/sessions/start", {
        method: "POST",
        headers,
        body: JSON.stringify({ module }),
      });

      if (!res.ok) throw new Error("Failed to start session");

      const data = await res.json();
      const { sessionId, bufferedQuestions } = data;

      // Find first unanswered question to start at
      const firstUnansweredIdx = bufferedQuestions.findIndex((q: QueuedQuestion) => q.answeredAt === undefined);
      const startIdx = firstUnansweredIdx === -1 ? 0 : firstUnansweredIdx;

      // Save to Firebase (auth users) or localStorage (guests)
      const isGuest = !user;
      await saveLastSessionInfo(module, sessionId, startIdx, isGuest, user?.uid);

      setState({ phase: "active", sessionId, module });
      setCurrentIndex(startIdx);

      // Load first unanswered question
      if (bufferedQuestions.length > 0) {
        await loadQuestionAtIndex(startIdx, bufferedQuestions);
      }

      // Set up Firebase listener
      const sessionRef = doc(db, "sessions", sessionId);
      const unsub = onSnapshot(sessionRef, (snap) => {
        if (!snap.exists()) return;
        const sessionData = snap.data() as Session;
        handleSessionUpdate(sessionData, false);
      });

      unsubscribeRef.current = unsub;
    } catch (err) {
      console.error("Error starting session:", err);
      setState({ phase: "select" });
    }
  }, [user, getIdToken, getGuestId, handleSessionUpdate, loadQuestionAtIndex, saveLastSessionInfo]);

  // Submit answer
  const submitAnswer = useCallback(async (optionId: string) => {
    if (!currentQuestion || !session || selectedAnswer || answerResult) return;

    const activeSessionId = session.sessionId;
    const currentQ = session.bufferedQuestions[currentIndex];

    // Check if this is the first unanswered question
    if (currentQ.answeredAt !== undefined) return;

    const isFIB = currentQuestion.question_type === "fib";
    let isCorrect: boolean;
    let correctAnswerDisplay: string;

    if (isFIB) {
      const userAnswer = optionId.trim();
      const correctAnswer = currentQuestion.correct_answer[0];
      isCorrect = checkAnswerCorrect(userAnswer, correctAnswer);
      correctAnswerDisplay = currentQuestion.correct_answer[0];
    } else {
      const selectedIndex = currentQuestion.answer_options.findIndex((opt) => opt.id === optionId);
      const selectedLetter = ["A", "B", "C", "D"][selectedIndex];
      correctAnswerDisplay = currentQuestion.correct_answer[0];
      isCorrect = selectedLetter === correctAnswerDisplay;
    }

    // Optimistic update - show result immediately
    setSelectedAnswer(optionId);
    setAnswerResult({ isCorrect, correctAnswer: correctAnswerDisplay });
    setShowRationale(!isCorrect);

    // Optimistically update local session state so navigation works
    setSession((prev) => {
      if (!prev) return prev;
      const newBuffer = [...prev.bufferedQuestions];
      newBuffer[currentIndex] = {
        ...newBuffer[currentIndex],
        selectedAnswer: optionId,
        isCorrect,
        correctAnswer: correctAnswerDisplay,
        answeredAt: Date.now(),
        timeSpentMs,
      };
      return { ...prev, bufferedQuestions: newBuffer };
    });

    const timeSpentMs = Date.now() - questionStartTime;

    // Fire API request in background (no await)
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = user ? await getIdToken() : undefined;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    else {
      const guestId = getGuestId();
      if (guestId) headers["X-Guest-Id"] = guestId;
    }

    fetch("/api/questions/next", {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionId: activeSessionId,
        questionId: currentQuestion.question_id,
        selectedAnswer: optionId,
        timeSpentMs,
      }),
    }).then(async (res) => {
      if (res.ok && !isCorrect) {
        const result = await res.json();
        setAnswerResult((prev) => prev ? { ...prev, ratingChange: result.ratingChange } : null);
      }
    }).catch((err) => {
      console.error("Error submitting answer:", err);
    });

    // If correct, advance after delay
    if (isCorrect) {
      setTimeout(() => {
        const nextIdx = currentIndex + 1;
        setCurrentIndex(nextIdx);
        saveLastSessionInfo(session.module, session.sessionId, nextIdx, !user, user?.uid);
        loadQuestionAtIndex(nextIdx, session.bufferedQuestions);
      }, 500);
    }
  }, [selectedAnswer, currentQuestion, session, currentIndex, questionStartTime, user, getIdToken, getGuestId, answerResult, loadQuestionAtIndex, saveLastSessionInfo]);

  // Go to next unanswered
  const goToNextUnanswered = useCallback(() => {
    if (!session) return;
    
    const nextIdx = session.bufferedQuestions.findIndex((q) => q.answeredAt === undefined);
    if (nextIdx !== -1 && nextIdx !== currentIndex) {
      setCurrentIndex(nextIdx);
      localStorage.setItem("sat_last_index", nextIdx.toString());
      loadQuestionAtIndex(nextIdx, session.bufferedQuestions);
    }
  }, [session, currentIndex, loadQuestionAtIndex]);

  // Go back
  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      const newIdx = currentIndex - 1;
      setCurrentIndex(newIdx);
      if (session) {
        saveLastSessionInfo(session.module, session.sessionId, newIdx, !user, user?.uid);
        loadQuestionAtIndex(newIdx, session.bufferedQuestions);
      }
    }
  }, [currentIndex, session, loadQuestionAtIndex, saveLastSessionInfo, user]);

  // Go forward - can only go to first unanswered
  const goForward = useCallback(() => {
    if (!session) return;
    
    const firstUnanswered = session.bufferedQuestions.findIndex((q) => q.answeredAt === undefined);
    const maxIndex = firstUnanswered === -1 ? session.bufferedQuestions.length - 1 : firstUnanswered;
    
    if (currentIndex < maxIndex) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      saveLastSessionInfo(session.module, session.sessionId, nextIdx, !user, user?.uid);
      loadQuestionAtIndex(nextIdx, session.bufferedQuestions);
    }
  }, [session, currentIndex, loadQuestionAtIndex, saveLastSessionInfo, user]);

  // Cleanup
  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  // Handle exit
  const handleGoBack = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setState({ phase: "select" });
    setSession(null);
    setCurrentQuestion(null);
    setSelectedAnswer(null);
    setAnswerResult(null);
    setShowRationale(false);
    setCurrentIndex(0);
    questionCache.current.clear();
    hasInitializedRef.current = false;
    localStorage.removeItem("sat_last_session_id");
    localStorage.removeItem("sat_last_module");
    localStorage.removeItem("sat_last_index");
  }, []);

  // Navigation helpers
  const canGoBack = currentIndex > 0;
  const canGoForward = session ? (() => {
    const firstUnanswered = session.bufferedQuestions.findIndex((q) => q.answeredAt === undefined);
    const maxIndex = firstUnanswered === -1 ? session.bufferedQuestions.length - 1 : firstUnanswered;
    return currentIndex < maxIndex;
  })() : false;

  if (state.phase === "select") {
    return (
      <div className="flex flex-col items-center justify-center px-4 pt-12">
        <h1 className="mb-2 text-2xl font-bold">Practice</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Choose a module to start practicing
        </p>
        <div className="grid w-full max-w-sm gap-4">
          <Card
            className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-md ${
              authLoading ? "opacity-50 pointer-events-none" : "active:scale-[0.98]"
            }`}
            onClick={() => !authLoading && startSession("english")}
          >
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-lg">English</CardTitle>
                <p className="text-sm text-muted-foreground">Reading & Writing</p>
              </div>
            </CardHeader>
          </Card>
          <Card
            className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-md ${
              authLoading ? "opacity-50 pointer-events-none" : "active:scale-[0.98]"
            }`}
            onClick={() => !authLoading && startSession("math")}
          >
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <Calculator className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-lg">Math</CardTitle>
                <p className="text-sm text-muted-foreground">Problem Solving & Data</p>
              </div>
            </CardHeader>
          </Card>
        </div>
        {!user && (
          <p className="mt-6 text-center text-xs text-muted-foreground max-w-xs">
            Sign in to save your progress and compete with others
          </p>
        )}
      </div>
    );
  }

  if (state.phase === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Loading {state.module} practice...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col px-2 sm:px-4 pb-3 max-w-3xl mx-auto">
      {session && (
        <div className="flex-none flex items-center justify-between gap-2 py-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoBack}
            className="h-7 px-2 text-muted-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            <span className="capitalize">{state.module}</span>
          </Button>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={goBack}
              disabled={!canGoBack}
              className="h-7 px-1"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={goForward}
              disabled={!canGoForward}
              className="h-7 px-1"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-4">
            {(() => {
              const accuracy = session.questionCount > 0
                ? Math.round((session.correctCount / session.questionCount) * 100)
                : 0;
              return (
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{accuracy}%</span>
                </span>
              );
            })()}

            <span className="font-mono font-semibold">{session.currentRating}</span>

            {(() => {
              const currentQ = session?.bufferedQuestions[currentIndex];
              if (currentQ?.ratingChange !== undefined) {
                const change = currentQ.ratingChange;
                return (
                  <div className="flex items-center gap-1 text-xs font-semibold">
                    <span className={change >= 0 ? "text-green-500" : "text-red-500"}>
                      {change >= 0 ? "+" : ""}{change}
                    </span>
                  </div>
                );
              }
              if (currentQuestion?.elo) {
                const expectedScore = 1 / (1 + Math.pow(10, (currentQuestion.elo - session.currentRating) / 400));
                const gain = Math.round(24 * (1 - expectedScore));
                const loss = Math.round(24 * expectedScore);
                return (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-green-500">+{gain}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-red-500">-{loss}</span>
                  </div>
                );
              }
              return null;
            })()}

            {currentQuestion && (
              <InfoButton
                skill={currentQuestion.skill}
                domain={currentQuestion.domain}
                difficulty={currentQuestion.difficulty}
                questionId={currentQuestion.question_id}
                elo={currentQuestion.elo}
              />
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden pt-2">
        <QuestionCard
          question={currentQuestion}
          selectedAnswer={selectedAnswer}
          correctAnswer={answerResult?.correctAnswer || null}
          disabled={!!answerResult}
          onSelectAnswer={submitAnswer}
          loading={false}
        />
      </div>

      {currentQuestion && showRationale && (
        <RationaleView
          rationale={currentQuestion.rationale}
          onNext={goToNextUnanswered}
          ratingChange={answerResult?.ratingChange}
        />
      )}
    </div>
  );
}

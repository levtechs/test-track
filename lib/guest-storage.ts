import type { Module } from "@/types";
import type { UserProfile, SkillElo, QuestionRepetition } from "@/types/user";
import {
  updateSkillElo as updateSharedSkillElo,
  updateRepetition as updateSharedRepetition,
  dynamicUserK,
} from "@/lib/algorithm/rating";

export interface GuestData {
  uid: string;
  englishRating: number;
  mathRating: number;
  totalQuestions: number;
  totalCorrect: number;
  skillElos: Record<string, SkillElo>;
  questionRepetitions: Record<string, QuestionRepetition>;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEYS = {
  english: "sat_guest_english_data",
  math: "sat_guest_math_data",
};

function getStorageKey(module: Module): string {
  return STORAGE_KEYS[module];
}

export function loadGuestData(module: Module): GuestData | null {
  if (typeof window === "undefined") return null;
  
  const key = getStorageKey(module);
  const data = localStorage.getItem(key);
  
  if (!data) return null;
  
  try {
    const parsed = JSON.parse(data);
    return {
      uid: parsed.uid || "",
      englishRating: parsed.englishRating || 1000,
      mathRating: parsed.mathRating || 1000,
      totalQuestions: parsed.totalQuestions || 0,
      totalCorrect: parsed.totalCorrect || 0,
      skillElos: parsed.skillElos || {},
      questionRepetitions: parsed.questionRepetitions || {},
      createdAt: parsed.createdAt || Date.now(),
      updatedAt: parsed.updatedAt || Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveGuestData(module: Module, data: GuestData): void {
  if (typeof window === "undefined") return;
  
  const key = getStorageKey(module);
  localStorage.setItem(key, JSON.stringify({
    ...data,
    updatedAt: Date.now(),
  }));
}

export function initGuestData(module: Module, uid: string): GuestData {
  return {
    uid,
    englishRating: 1000,
    mathRating: 1000,
    totalQuestions: 0,
    totalCorrect: 0,
    skillElos: {},
    questionRepetitions: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function updateGuestRating(
  module: Module,
  isCorrect: boolean,
  data: GuestData,
  questionElo: number
): GuestData {
  const ratingField = module === "english" ? "englishRating" : "mathRating";
  const currentRating = data[ratingField];
  const k = dynamicUserK(data.totalQuestions);
  
  const exp = 1 / (1 + Math.pow(10, (questionElo - currentRating) / 400));
  const newRating = Math.round(currentRating + k * ((isCorrect ? 1 : 0) - exp));
  
  return {
    ...data,
    [ratingField]: newRating,
    totalQuestions: data.totalQuestions + 1,
    totalCorrect: data.totalCorrect + (isCorrect ? 1 : 0),
  };
}

export function updateGuestSkillElo(
  skill: string,
  isCorrect: boolean,
  questionElo: number,
  data: GuestData
): GuestData {
  const newSkillElo = updateSharedSkillElo(isCorrect, data.skillElos[skill], questionElo);
  
  return {
    ...data,
    skillElos: {
      ...data.skillElos,
      [skill]: newSkillElo,
    },
  };
}

export function updateGuestRepetition(
  questionId: string,
  isCorrect: boolean,
  data: GuestData
): GuestData {
  const newRep = updateSharedRepetition(isCorrect, data.questionRepetitions[questionId]);
  
  return {
    ...data,
    questionRepetitions: {
      ...data.questionRepetitions,
      [questionId]: newRep,
    },
  };
}

export function getGuestSkillElos(module: Module): Record<string, SkillElo> {
  const data = loadGuestData(module);
  return data?.skillElos ?? {};
}

export function getGuestRepetitions(module: Module): Record<string, QuestionRepetition> {
  const data = loadGuestData(module);
  return data?.questionRepetitions ?? {};
}

export function migrateToFirestore(
  guestData: GuestData,
  userId: string,
  displayName: string,
  photoURL: string | null
): UserProfile {
  return {
    uid: userId,
    displayName,
    photoURL,
    englishRating: guestData.englishRating,
    mathRating: guestData.mathRating,
    totalQuestions: guestData.totalQuestions,
    totalCorrect: guestData.totalCorrect,
    skillStats: {},
    skillElos: guestData.skillElos,
    questionRepetitions: guestData.questionRepetitions,
    createdAt: guestData.createdAt,
    updatedAt: Date.now(),
  };
}

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuthRequired } from "@/lib/api-auth";
import type { UserProfile } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuthRequired(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, decoded } = auth;
    const userRef = adminDb.collection("users").doc(userId);
    const userSnap = await userRef.get();

    // Idempotent: if profile already exists, return it
    if (userSnap.exists) {
      return NextResponse.json({ profile: userSnap.data() as UserProfile });
    }

    // Create new user profile with defaults
    const newProfile: UserProfile = {
      uid: userId,
      displayName: decoded.name || "Anonymous",
      photoURL: decoded.picture || null,
      englishRating: 1000,
      mathRating: 1000,
      totalQuestions: 0,
      totalCorrect: 0,
      skillStats: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dayStreak: 0,
      lastActiveDate: null,
    };

    await userRef.set(newProfile);

    return NextResponse.json({ profile: newProfile }, { status: 201 });
  } catch (error) {
    console.error("Error creating profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

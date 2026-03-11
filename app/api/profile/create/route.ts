import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import type { UserProfile } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    let decoded;

    try {
      decoded = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = decoded.uid;
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

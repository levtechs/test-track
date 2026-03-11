import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { incrementUser } from "@/lib/stats";
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

    const existingDoc = await adminDb.collection("users").doc(userId).get();
    if (existingDoc.exists) {
      return NextResponse.json({ 
        userProfile: existingDoc.data() as UserProfile,
        isNew: false 
      });
    }

    const newProfile: UserProfile = {
      uid: userId,
      displayName: decoded.name || decoded.email?.split("@")[0] || "Anonymous",
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

    await adminDb.collection("users").doc(userId).set(newProfile);
    incrementUser().catch(console.error);

    return NextResponse.json({ userProfile: newProfile, isNew: true });
  } catch (error) {
    console.error("User creation error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { estimateSectionScore } from "@/lib/algorithm/estimate-score";
import type { UserProfile } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    let userId: string;

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      userId = decoded.uid;
    } catch {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }

    const userDoc = await adminDb.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const userProfile = userDoc.data() as UserProfile;
    const skillElos = userProfile.skillElos;

    const estimatedEnglish = estimateSectionScore(skillElos, "english");
    const estimatedMath = estimateSectionScore(skillElos, "math");
    const totalScore = estimatedEnglish.score + estimatedMath.score;

    await adminDb.collection("users").doc(userId).update({
      estimatedEnglish,
      estimatedMath,
      updatedAt: Date.now(),
    });

    return Response.json({
      total: totalScore,
      english: estimatedEnglish,
      math: estimatedMath,
    });
  } catch (error) {
    console.error("Error calculating estimated score:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

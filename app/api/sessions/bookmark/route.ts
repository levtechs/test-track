import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuthRequired } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuthRequired(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = auth;

    const body = await request.json();
    const { module, sessionId, index } = body as {
      module: "english" | "math";
      sessionId: string;
      index: number;
    };

    if (!module || !["english", "math"].includes(module)) {
      return NextResponse.json(
        { error: "Invalid module" },
        { status: 400 }
      );
    }

    if (!sessionId || !Number.isInteger(index) || index < 0) {
      return NextResponse.json(
        { error: "Missing sessionId or invalid index" },
        { status: 400 }
      );
    }

    // Verify the session belongs to this user
    const sessionSnap = await adminDb
      .collection("sessions")
      .doc(sessionId)
      .get();

    if (!sessionSnap.exists) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const sessionData = sessionSnap.data();
    if (sessionData?.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Verify user profile exists before updating
    const userRef = adminDb.collection("users").doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Update the user's bookmark fields
    const updateData =
      module === "english"
        ? {
            lastModule: module,
            lastEnglishSessionId: sessionId,
            lastEnglishIndex: index,
          }
        : {
            lastModule: module,
            lastMathSessionId: sessionId,
            lastMathIndex: index,
          };

    await userRef.update(updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving bookmark:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

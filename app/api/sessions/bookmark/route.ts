import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    let userId: string;

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

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

    if (!sessionId || typeof index !== "number") {
      return NextResponse.json(
        { error: "Missing sessionId or index" },
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

    await adminDb.collection("users").doc(userId).update(updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving bookmark:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

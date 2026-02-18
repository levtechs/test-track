import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "./firebase-admin";
import type { UserProfile } from "@/types";

export interface AuthResult {
  userId: string;
  userProfile: UserProfile | null;
  isGuest: boolean;
}

/**
 * Extracts and verifies auth from the Authorization header.
 * Returns authenticated user info, or a guest fallback.
 *
 * For guests: userId is derived from the X-Guest-Id header if present,
 * otherwise generates a new one. This provides session continuity.
 */
export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      const userId = decoded.uid;

      const userDoc = await adminDb.collection("users").doc(userId).get();
      const userProfile = userDoc.exists
        ? (userDoc.data() as UserProfile)
        : null;

      return { userId, userProfile, isGuest: false };
    } catch {
      // Token invalid or expired — fall through to guest
    }
  }

  // Guest user — use X-Guest-Id header if present, otherwise generate new
  // The guest prefix ensures we never collide with real UIDs
  let guestId = request.headers.get("x-guest-id");
  if (!guestId) {
    guestId = `guest_${crypto.randomUUID().slice(0, 8)}`;
  }
  // Ensure it has the guest_ prefix
  if (!guestId.startsWith("guest_")) {
    guestId = `guest_${guestId}`;
  }
  return { userId: guestId, userProfile: null, isGuest: true };
}

/**
 * Checks if `userId` owns the session.
 * - Authenticated users must match exactly.
 * - Guest sessions can only be accessed by requests without valid auth
 *   (we can't verify guest identity, so we allow it loosely but
 *   guest data has no value to protect).
 */
export function verifySessionOwnership(
  sessionUserId: string,
  requestUserId: string,
  isGuest: boolean
): boolean {
  // If the session belongs to a guest, only guest requests can access it
  if (sessionUserId.startsWith("guest_")) {
    return isGuest;
  }

  // For authenticated sessions, user must match exactly
  return sessionUserId === requestUserId;
}

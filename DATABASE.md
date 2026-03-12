# Database & Security Architecture

This document outlines how data is accessed and secured in the SAT project.

## 1. Security Philosophy
The project follows a **Server-Side Authority** model:
- **Cloud Firestore**: Configured as **Read-Only** for the frontend. All writes go through backend API routes using the Firebase Admin SDK.
- **Firebase Auth**: Client-side sign-in/sign-out via Google OAuth. ID tokens are passed to the backend for verification.

## 2. Access Patterns

### Frontend (Client SDK)
- **Role**: Data consumption, real-time synchronization, and authentication.
- **Operations**: `onSnapshot`, `getDoc`, `getDocs`, `signInWithPopup`, `signOut`.
- **Constraint**: **NO WRITES** to Firestore (`setDoc`, `addDoc`, `updateDoc`, `deleteDoc`).
- **Implementation**: Uses `lib/firebase.ts` (Firebase Client SDK).

### Backend (Admin SDK)
- **Role**: Data modification, privileged queries, and validation.
- **Operations**: All CRUD operations, bypassing security rules.
- **Constraint**: Must only be called within API routes (`app/api/`).
- **Implementation**: Uses `lib/firebase-admin.ts` (Firebase Admin SDK).

## 3. Communication Flow
To modify data, the frontend follows this sequence:
1. **Request**: Frontend calls a backend API endpoint via `fetch`.
2. **Verify**: Backend verifies the user's identity using `adminAuth.verifyIdToken()`.
3. **Execute**: Backend performs the database operation using `adminDb`.
4. **Sync**: Frontend receives real-time updates automatically via existing `onSnapshot` listeners.

## 4. Collections

| Collection  | Client Read          | Client Write | Backend Read | Backend Write | Notes                                |
| ----------- | -------------------- | ------------ | ------------ | ------------- | ------------------------------------ |
| `users`     | Own document only    | **Denied**   | Yes          | Yes           | Auth required, uid-scoped            |
| `sessions`  | Own sessions only    | **Denied**   | Yes          | Yes           | Auth required (guests can read guest sessions) |
| `questions` | Public (all readers) | **Denied**   | Yes          | Yes           | Guests need access for practice      |
| `responses` | **Denied**           | **Denied**   | Yes          | Yes           | Backend-only, no client access       |

## 5. API Routes

| Endpoint                    | Method | Auth     | Purpose                                      |
| --------------------------- | ------ | -------- | --------------------------------------------- |
| `/api/profile/create`       | POST   | Required | Create user profile on first login             |
| `/api/profile/update`       | POST   | Required | Update estimated scores, streak                |
| `/api/sessions/start`       | POST   | Optional | Start or resume a practice session             |
| `/api/sessions/bookmark`    | POST   | Required | Save session position (module, index)          |
| `/api/questions/next`       | POST   | Optional | Submit answer, get next questions              |

## 6. Configuration Files
- `firestore.rules`: Defines the read-only policy for Firestore.

## 7. Applying Security Rules

### Option A: Firebase CLI (Recommended)
This command **only** uploads the security rules and does not affect hosting or other services:
```bash
firebase deploy --only firestore:rules
```

### Option B: Firebase Console (Manual)
1. Open your project in the [Firebase Console](https://console.firebase.google.com/).
2. Go to **Firestore Database** > **Rules** and paste the contents of `firestore.rules`.

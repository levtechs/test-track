"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { UserProfile } from "@/types";

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | undefined>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  getIdToken: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Fetch or create user profile
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          setUserProfile(userSnap.data() as UserProfile);
        } else {
          try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch("/api/users/create", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            });
            if (res.ok) {
              const { userProfile } = await res.json();
              setUserProfile(userProfile);
            } else {
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                displayName: firebaseUser.displayName || "Anonymous",
                photoURL: firebaseUser.photoURL || null,
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
              await setDoc(userRef, newProfile);
              setUserProfile(newProfile);
            }
          } catch (error) {
            console.error("Failed to create user via API:", error);
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || "Anonymous",
              photoURL: firebaseUser.photoURL || null,
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
            await setDoc(userRef, newProfile);
            setUserProfile(newProfile);
          }
        }
      } else {
        setUserProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserProfile(null);
  };

  const getIdToken = async (): Promise<string | undefined> => {
    if (!user) return undefined;
    return user.getIdToken();
  };

  return (
    <AuthContext.Provider
      value={{ user, userProfile, loading, signInWithGoogle, signOut, getIdToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

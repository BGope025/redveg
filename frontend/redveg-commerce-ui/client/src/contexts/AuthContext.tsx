import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
  signInWithPopup,
  PhoneAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "@/lib/firebase";
import { apiUrl } from "@/lib/api";

interface User {
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  firebaseConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  sendPhoneOtp: (phoneNumber: string) => Promise<void>;
  verifyPhoneOtp: (otp: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  signOutAdmin: () => Promise<void>;
  login: (credentials: { email: string; password: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  // Check authentication status on app load
  useEffect(() => {
    if (!auth) {
      // Firebase not configured — skip auth entirely
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          phoneNumber: firebaseUser.phoneNumber,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Sign in with Google
  const signInWithGoogle = async () => {
    if (!auth || !googleProvider) {
      throw new Error("Firebase is not configured. Please set environment variables.");
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);

    } catch (error) {
      console.error("Error signing in with Google:", error);
      throw error;
    }
  };

  // Send OTP to phone number
  const sendPhoneOtp = async (phoneNumber: string) => {
    if (!auth) {
      throw new Error("Firebase is not configured. Please set environment variables.");
    }
    try {
      // Initialize reCAPTCHA verifier
      const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });

      const result = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
      setConfirmationResult(result);
    } catch (error) {
      console.error("Error sending OTP:", error);
      throw error;
    }
  };

  // Verify OTP and sign in
  const verifyPhoneOtp = async (otp: string) => {
    if (!confirmationResult) {
      throw new Error("No OTP was sent. Please request a new OTP.");
    }
    try {
      await confirmationResult.confirm(otp);
    } catch (error) {
      console.error("Error verifying OTP:", error);
      throw error;
    }
  };

  // Email/password login via backend
  const login = async (credentials: { email: string; password: string }) => {
    try {
      const response = await fetch(apiUrl('auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          username: credentials.email,
          password: credentials.password
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const data = await response.json();
      if (data.success && data.data?.user) {
        if (data.data.token) {
          localStorage.setItem('adminToken', data.data.token);
        }
        setAdminAuthenticated(true);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Error logging in:', error);
      throw error;
    }
  };

  // Customer sign-out is Firebase-only. It must not touch the admin token/session.
  const signOutUser = async () => {
    if (auth) await auth.signOut();
    setConfirmationResult(null);
  };

  // Admin sign-out is backend-token based. It must not sign out Firebase customers.
  const signOutAdmin = async () => {
    await fetch(apiUrl('auth/logout'), {
      method: 'POST',
      credentials: 'include'
    }).catch(() => undefined);
    localStorage.removeItem('adminToken');
    setAdminAuthenticated(false);
  };

  const isAuthenticated = !!user;
  const isAdmin = adminAuthenticated;

  const value: AuthContextValue = {
    user,
    loading,
    isAuthenticated,
    isAdmin,
    isLoading: loading,
    firebaseConfigured: isFirebaseConfigured,
    signInWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    signOutUser,
    signOutAdmin,
    login,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

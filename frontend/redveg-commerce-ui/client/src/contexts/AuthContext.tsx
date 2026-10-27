import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "@/lib/firebase";
import { apiFetch, apiUrl } from "@/lib/api";

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
  adminLoading: boolean;
  adminUser: AdminSessionUser | null;
  isLoading: boolean;
  firebaseConfigured: boolean;
  getCustomerIdToken: () => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  signOutAdmin: () => Promise<void>;
  login: (credentials: { email: string; password: string; loginAs: "owner" | "employee" }) => Promise<AdminSessionUser>;
}

export interface AdminSessionUser {
  id: string;
  username: string;
  role: string;
  permissions: string[];
  adminAccess: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminSessionUser | null>(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  // Check authentication status on app load
  useEffect(() => {
    if (!auth) {
      // Firebase not configured — skip auth entirely
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          phoneNumber: firebaseUser.phoneNumber,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
        void firebaseUser.getIdToken()
          .then(authToken => apiFetch("customers/me/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }, { forceBackend: true, authToken }))
          .then(async response => {
            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(payload?.message || `Customer sync failed (HTTP ${response.status})`);
            }
          })
          .catch(error => console.error("Unable to sync signed-in customer with the directory:", error));
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    const validateAdminSession = async () => {
      try {
        const token = localStorage.getItem("adminToken");
        const response = await fetch(apiUrl("auth/validate"), {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await response.json().catch(() => null);
        if (
          active &&
          response.ok &&
          data?.success &&
          data.data?.user?.adminAccess === true
        ) {
          setAdminAuthenticated(true);
          setAdminUser(data.data.user as AdminSessionUser);
        } else if (active) {
          localStorage.removeItem("adminToken");
          setAdminAuthenticated(false);
          setAdminUser(null);
        }
      } catch {
        if (active) {
          setAdminAuthenticated(false);
          setAdminUser(null);
        }
      } finally {
        if (active) setAdminLoading(false);
      }
    };
    validateAdminSession();
    return () => {
      active = false;
    };
  }, []);

  // Sign in with Google
  const signInWithGoogle = async () => {
    if (!auth || !googleProvider) {
      throw new Error(
        "Firebase is not configured. Please set environment variables."
      );
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google:", error);
      throw error;
    }
  };

  const getCustomerIdToken = useCallback(async () => {
    const currentUser = auth?.currentUser;
    return currentUser ? currentUser.getIdToken() : null;
  }, []);

  // Email/password login via backend
  const login = async (credentials: { email: string; password: string; loginAs: "owner" | "employee" }): Promise<AdminSessionUser> => {
    try {
      const response = await fetch(apiUrl("auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: credentials.email,
          password: credentials.password,
          loginAs: credentials.loginAs,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Login failed");
      }

      const data = await response.json();
      if (data.success && data.data?.user?.adminAccess === true) {
        if (data.data.token) {
          localStorage.setItem("adminToken", data.data.token);
        }
        setAdminAuthenticated(true);
        const signedInUser = data.data.user as AdminSessionUser;
        setAdminUser(signedInUser);
        return signedInUser;
      } else {
        throw new Error("This account is not authorized for the admin panel");
      }
    } catch (error) {
      console.error("Error logging in:", error);
      throw error;
    }
  };

  // Customer sign-out is Firebase-only. It must not touch the admin token/session.
  const signOutUser = async () => {
    if (auth) await auth.signOut();
  };

  // Admin sign-out is backend-token based. It must not sign out Firebase customers.
  const signOutAdmin = async () => {
    await fetch(apiUrl("auth/logout"), {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    localStorage.removeItem("adminToken");
    setAdminAuthenticated(false);
    setAdminUser(null);
  };

  const isAuthenticated = !!user;
  const isAdmin = adminAuthenticated;

  const value: AuthContextValue = {
    user,
    loading,
    isAuthenticated,
    isAdmin,
    adminLoading,
    adminUser,
    isLoading: loading,
    firebaseConfigured: isFirebaseConfigured,
    getCustomerIdToken,
    signInWithGoogle,
    signOutUser,
    signOutAdmin,
    login,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

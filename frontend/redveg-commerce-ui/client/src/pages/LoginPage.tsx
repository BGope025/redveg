import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Link, Redirect, useLocation } from "wouter";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";

export function LoginPage() {
  const { isAuthenticated, signInWithGoogle, firebaseConfigured } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useLocation();
  const requestedReturnTo = new URLSearchParams(
    location.split("?")[1] || ""
  ).get("returnTo");
  const returnTo =
    requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : "/profile";

  if (isAuthenticated) {
    return <Redirect replace to={returnTo} />;
  }

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      toast.success("Signed in with Google!");
      setLocation(returnTo);
    } catch (err: any) {
      setError(err?.message || "Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#FFFDF9] via-[#FFF5F0] to-[#F9E8E8] p-4">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-[#E9D8D4]/60 bg-white/80 shadow-[0_20px_60px_rgba(180,35,44,0.08)] backdrop-blur-xl">
          <div className="flex flex-col items-center gap-3 border-b border-[#E9D8D4]/40 bg-gradient-to-b from-[#FFFDF9] to-transparent px-6 pb-5 pt-8">
            <BrandLogo compact />
            <p className="text-sm font-medium text-[#4D403D]/70">
              Sign in to continue
            </p>
          </div>

          <div className="p-6">
            {!firebaseConfigured && (
              <p
                role="status"
                className="mb-4 rounded-xl bg-[#FFF3F1] px-4 py-3 text-sm leading-5 text-[#8E2926]"
              >
                Customer sign-in is temporarily unavailable. Please try again
                later.
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              className="h-12 w-full gap-3 rounded-xl border-[#E9D8D4] bg-white text-sm font-semibold text-[#4D403D] shadow-sm transition-all hover:border-[#B4232C]/30 hover:bg-[#FFF5F0] hover:shadow-md"
              onClick={handleGoogleSignIn}
              disabled={loading || !firebaseConfigured}
            >
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {loading ? "Signing in..." : "Continue with Google"}
            </Button>

            {error && (
              <p
                className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                role="alert"
                aria-live="polite"
              >
                {error}
              </p>
            )}
          </div>

          <div className="border-t border-[#E9D8D4]/40 bg-[#FDFAF7] px-6 py-4 text-center">
            <p className="text-[0.7rem] leading-relaxed text-[#4D403D]/40">
              By continuing, you agree to RedVeg&apos;s{" "}
              <Link href="/terms" className="font-bold text-[#4D403D]/70 underline underline-offset-2 hover:text-[#B4232C]">Terms &amp; Conditions</Link>{" "}
              and <a href="mailto:support@redveg.in?subject=Privacy%20policy" className="underline underline-offset-2 hover:text-[#B4232C]">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

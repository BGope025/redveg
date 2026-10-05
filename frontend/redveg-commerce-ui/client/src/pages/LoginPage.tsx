import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Redirect, useLocation } from "wouter";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";

type AuthTab = "phone" | "google";

export function LoginPage() {
  const {
    user,
    isAuthenticated,
    signInWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    login,
    firebaseConfigured,
  } = useAuth();

  const [tab, setTab] = useState<AuthTab>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useLocation();
  const returnTo = new URLSearchParams(location.split("?")[1] || "").get("returnTo") || "/";

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
      setError(err.message || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleaned = phone.trim();
    if (!cleaned || cleaned.length < 10) {
      setError("Please enter a valid phone number");
      return;
    }

    setLoading(true);
    try {
      const fullNumber = cleaned.startsWith("+") ? cleaned : `+91${cleaned}`;
      await sendPhoneOtp(fullNumber);
      setOtpSent(true);
      toast.success("OTP sent to your phone!");
    } catch (err: any) {
      setError(err.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otp || otp.length < 4) {
      setError("Please enter the OTP");
      return;
    }

    setLoading(true);
    try {
      await verifyPhoneOtp(otp);
      toast.success("Phone verified! You're signed in.");
      setLocation(returnTo);
    } catch (err: any) {
      setError(err.message || "Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#FFFDF9] via-[#FFF5F0] to-[#F9E8E8] p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-[#E9D8D4]/60 bg-white/80 shadow-[0_20px_60px_rgba(180,35,44,0.08)] backdrop-blur-xl">
          {/* Header */}
          <div className="flex flex-col items-center gap-3 border-b border-[#E9D8D4]/40 bg-gradient-to-b from-[#FFFDF9] to-transparent px-6 pb-5 pt-8">
            <BrandLogo compact />
            <p className="text-sm font-medium text-[#4D403D]/70">
              Sign in to continue
            </p>
          </div>

          <div className="p-6">
            {/* Google Sign-In — primary CTA */}
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full gap-3 rounded-xl border-[#E9D8D4] bg-white text-sm font-semibold text-[#4D403D] shadow-sm transition-all hover:border-[#B4232C]/30 hover:bg-[#FFF5F0] hover:shadow-md"
              onClick={handleGoogleSignIn}
              disabled={loading}
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
              Continue with Google
            </Button>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#E9D8D4]/60" />
              <span className="text-xs font-medium text-[#4D403D]/40">OR</span>
              <div className="h-px flex-1 bg-[#E9D8D4]/60" />
            </div>

            {/* Phone OTP Section */}
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="phone"
                    className="text-xs font-bold uppercase tracking-wider text-[#4D403D]/60"
                  >
                    Phone Number
                  </Label>
                  <div className="flex gap-2">
                    <span className="grid h-11 w-14 place-items-center rounded-lg border border-[#E9D8D4] bg-[#F9F5F2] text-sm font-semibold text-[#4D403D]">
                      +91
                    </span>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Enter your mobile number"
                      className="h-11 flex-1 rounded-lg border-[#E9D8D4] bg-white text-sm focus-visible:ring-[#B4232C]/30"
                      maxLength={10}
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full rounded-xl bg-[#B4232C] font-semibold text-white shadow-[0_4px_14px_rgba(180,35,44,0.3)] transition-all hover:bg-[#9A1A1A] hover:shadow-[0_6px_20px_rgba(180,35,44,0.35)] disabled:opacity-50"
                >
                  {loading ? "Sending OTP..." : "Send OTP"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="otp"
                    className="text-xs font-bold uppercase tracking-wider text-[#4D403D]/60"
                  >
                    Enter OTP
                  </Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter 6-digit OTP"
                    className="h-11 rounded-lg border-[#E9D8D4] bg-white text-center text-lg font-bold tracking-[0.3em] focus-visible:ring-[#B4232C]/30"
                    maxLength={6}
                    required
                  />
                  <p className="text-xs text-[#4D403D]/50">
                    OTP sent to +91{phone.replace(/^\+91/, "")}
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full rounded-xl bg-[#B4232C] font-semibold text-white shadow-[0_4px_14px_rgba(180,35,44,0.3)] transition-all hover:bg-[#9A1A1A] hover:shadow-[0_6px_20px_rgba(180,35,44,0.35)] disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Verify & Sign In"}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setError(null);
                  }}
                  className="w-full text-center text-xs font-medium text-[#B4232C] hover:underline"
                >
                  Change phone number
                </button>
              </form>
            )}

            {/* Error message */}
            {error && (
              <div className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[#E9D8D4]/40 bg-[#FDFAF7] px-6 py-4 text-center">
            <p className="text-[0.7rem] leading-relaxed text-[#4D403D]/40">
              By continuing, you agree to RedVeg's Terms of Service & Privacy
              Policy
            </p>
          </div>
        </div>

        {/* Invisible reCAPTCHA container (required by Firebase Phone Auth) */}
        <div id="recaptcha-container" />
      </div>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

export default function AdminResetPasswordPage() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch("auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "This reset link is invalid or expired.");
      setMessage("Your password has been changed. You can now sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset your password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F2EE] p-4 text-[#251B18]">
      <form onSubmit={submit} className="w-full max-w-md space-y-6 rounded-2xl border border-black/5 bg-white p-7 shadow-xl">
        <header className="space-y-3 text-center">
          <BrandLogo compact />
          <h1 className="text-2xl font-black">Choose a new password</h1>
          <p className="text-sm text-muted-foreground">Use at least 12 characters. The reset link works once and expires after 30 minutes.</p>
        </header>
        {!token ? <p role="alert" className="text-sm font-medium text-[#B4232C]">This reset link is missing or invalid. Request a new link from admin sign in.</p> : <>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </div>
        </>}
        {error && <p role="alert" className="text-sm font-medium text-[#B4232C]">{error}</p>}
        {message && <p role="status" className="text-sm text-[#276749]">{message}</p>}
        {token && !message && <Button type="submit" className="w-full bg-[#B4232C] hover:bg-[#941D24]" disabled={loading}>{loading ? "Updating…" : "Update password"}</Button>}
        <Link href="/admin/login" className="block text-center text-sm font-semibold text-[#9F2029] underline-offset-4 hover:underline">Back to admin sign in</Link>
      </form>
    </main>
  );
}

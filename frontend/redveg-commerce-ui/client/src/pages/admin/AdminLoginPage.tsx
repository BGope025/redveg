import { useState, type FormEvent } from "react";
import { Redirect, useLocation } from "wouter";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

export default function AdminLoginPage() {
  const { isAdmin, login } = useAuth();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [loginAs, setLoginAs] = useState<"owner" | "employee">("owner");
  const [resetEmail, setResetEmail] = useState("");
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  if (isAdmin) return <Redirect replace to="/admin" />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const signedInUser = await login({ email: username, password, loginAs });
      const permissions = signedInUser.permissions || [];
      const can = (permission: string) => signedInUser.role === "owner" || permissions.includes("*") || permissions.includes(permission);
      const nextPage = can("reports.finance") ? "/admin" : can("orders.read") ? "/admin/orders" : can("catalog.read") ? "/admin/catalog" : can("campaigns.manage") ? "/admin/offers" : can("customers.read") ? "/admin/customers" : can("staff.manage") ? "/admin/staff" : "/admin";
      setLocation(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const requestReset = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setResetNotice(null);
    setLoading(true);
    try {
      const employeeRequest = loginAs === "employee";
      const response = await apiFetch(employeeRequest ? "auth/password-reset/employee-request" : "auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employeeRequest ? { identifier: resetEmail } : { email: resetEmail })
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Could not request a reset link.");
      setResetNotice(payload.message || (employeeRequest ? "The Owner has been notified to review your request." : "If the Owner email matches, a reset link will be sent."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request a reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F2EE] p-4 text-[#251B18]">
      <form onSubmit={forgotPassword ? requestReset : submit} className="w-full max-w-md space-y-6 rounded-2xl border border-black/5 bg-white p-7 shadow-xl">
        <header className="space-y-3 text-center">
          <BrandLogo compact />
          <h1 className="text-2xl font-black">{forgotPassword ? (loginAs === "employee" ? "Ask the Owner to reset your password" : "Reset your Owner password") : "Admin sign in"}</h1>
          <p className="text-sm text-muted-foreground">{forgotPassword ? (loginAs === "employee" ? "We’ll email the Owner with your account details so they can set a new password." : "Enter the email address connected to the Owner account.") : "Choose your account type before signing in."}</p>
        </header>
        {!forgotPassword && <div role="group" aria-label="Account type" className="grid grid-cols-2 rounded-xl bg-[#F5F2EE] p-1">
          {([['owner', 'Owner'], ['employee', 'Employee']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={loginAs === value} onClick={() => { setLoginAs(value); setError(null); }} className={`min-h-11 rounded-lg px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4232C] ${loginAs === value ? "bg-white text-[#9F2029] shadow-sm" : "text-[#625650] hover:text-[#251B18]"}`}>{label}</button>)}
        </div>}
        {forgotPassword ? (
          <div className="space-y-2">
            <Label htmlFor="reset-email">{loginAs === "employee" ? "Employee username or work email" : "Owner email"}</Label>
            <Input id="reset-email" type={loginAs === "employee" ? "text" : "email"} autoComplete={loginAs === "employee" ? "username" : "email"} value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} required />
          </div>
        ) : <>
          <div className="space-y-2">
            <Label htmlFor="admin-username">{loginAs === "owner" ? "Owner username or email" : "Employee username or email"}</Label>
            <Input id="admin-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Password</Label>
            <Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
        </>}
        {error && <p role="alert" className="text-sm font-medium text-[#B4232C]">{error}</p>}
        {resetNotice && <p role="status" className="text-sm text-[#276749]">{resetNotice}</p>}
        <Button type="submit" className="w-full bg-[#B4232C] hover:bg-[#941D24]" disabled={loading}>
          {loading ? "Please wait…" : forgotPassword ? (loginAs === "employee" ? "Email the Owner" : "Send reset link") : `Sign in as ${loginAs === "owner" ? "Owner" : "Employee"}`}
        </Button>
        <button type="button" className="w-full text-sm font-semibold text-[#9F2029] underline-offset-4 hover:underline" onClick={() => { setForgotPassword((value) => !value); setError(null); setResetNotice(null); }}>
          {forgotPassword ? "Back to sign in" : "Forgot password?"}
        </button>
      </form>
    </main>
  );
}

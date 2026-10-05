import { useState, type FormEvent } from "react";
import { Redirect, useLocation } from "wouter";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminLoginPage() {
  const { isAdmin, login } = useAuth();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAdmin) return <Redirect replace to="/admin" />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email: username, password });
      setLocation("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F2EE] p-4 text-[#251B18]">
      <form onSubmit={submit} className="w-full max-w-md space-y-6 rounded-2xl border border-black/5 bg-white p-7 shadow-xl">
        <header className="space-y-3 text-center">
          <BrandLogo compact />
          <h1 className="text-2xl font-black">Admin sign in</h1>
          <p className="text-sm text-muted-foreground">Use your admin account to access the control room.</p>
        </header>
        <div className="space-y-2">
          <Label htmlFor="admin-username">Username</Label>
          <Input id="admin-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-password">Password</Label>
          <Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        {error && <p role="alert" className="text-sm font-medium text-[#B4232C]">{error}</p>}
        <Button type="submit" className="w-full bg-[#B4232C] hover:bg-[#941D24]" disabled={loading}>
          {loading ? "Signing in…" : "Sign in to admin"}
        </Button>
      </form>
    </main>
  );
}

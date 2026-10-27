import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import type { RouteProps } from "wouter";

interface ProtectedRouteProps extends RouteProps {
  adminOnly?: boolean;
  requiredPermission?: string;
  redirectTo?: string;
}

export function ProtectedRoute({
  adminOnly = false,
  requiredPermission,
  redirectTo = "/login",
  children,
}: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, isLoading, adminLoading, adminUser } = useAuth();

  if (adminOnly) {
    if (adminLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-t-[#B4232C] border-[#E9D8D4]" />
            <p className="mt-2 text-sm">Verifying admin session...</p>
          </div>
        </div>
      );
    }
    if (!isAdmin) return <Redirect replace to="/admin/login" />;
    if (requiredPermission && adminUser?.role !== "owner" && !adminUser?.permissions?.includes("*") && !adminUser?.permissions?.includes(requiredPermission)) {
      return <main className="grid min-h-screen place-items-center bg-[#F5F2EE] p-6 text-[#251B18]"><section className="max-w-md rounded-2xl border border-black/5 bg-white p-7 text-center shadow-sm"><h1 className="text-xl font-black">Access not assigned</h1><p className="mt-2 text-sm text-muted-foreground">Your employee account does not have permission to open this section. Ask the Owner to update your access.</p></section></main>;
    }
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-t-[#B4232C] border-[#E9D8D4]"></div>
          <p className="mt-2 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect replace to={redirectTo} />;
  }

  // Assuming we need to render children directly since there's no Outlet equivalent
  // or we need to import it differently
  return <>{children}</>;
}

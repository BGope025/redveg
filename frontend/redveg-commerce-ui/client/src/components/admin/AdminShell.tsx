import { BrandLogo } from "@/components/BrandLogo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Bell,
  ChevronRight,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Palette,
  Search,
  Settings,
  ShoppingBag,
  Tags,
  Truck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const adminLinks = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/catalog", label: "Products", icon: Package },
  { href: "/admin/offers", label: "Offers & combos", icon: Gift },
  { href: "/admin/coupons", label: "Coupons", icon: Tags },
  { href: "/admin/delivery", label: "Delivery areas", icon: Truck },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/analytics", label: "Reports", icon: BarChart3 },
  { href: "/admin/header-theme", label: "Header theme", icon: Palette },
];

export function AdminShell({
  children,
  title,
  subtitle,
  action,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { signOutAdmin } = useAuth();
  const [storeStatus, setStoreStatus] = useState<{
    isOpen?: boolean;
    city?: string;
    closingTime?: string;
  }>({});
  useEffect(() => {
    apiFetch("settings/store-status")
      .then(response => (response.ok ? response.json() : null))
      .then(payload => {
        if (!payload?.data) return;
        try {
          const parsed =
            typeof payload.data.value === "string"
              ? JSON.parse(payload.data.value)
              : payload.data.value;
          if (parsed && typeof parsed === "object") setStoreStatus(parsed);
        } catch {
          /* keep default */
        }
      })
      .catch(() => undefined);
  }, []);
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOutAdmin();
    } finally {
      setLocation("/admin/login");
    }
  };

  const sidebar = (
    <aside className="flex h-full flex-col overflow-hidden bg-[#17110F] px-4 pb-5 pt-6 text-white">
      <div className="px-2">
        <BrandLogo inverse />
      </div>
      <div className="mx-2 mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] font-black uppercase tracking-[0.15em] text-white/45">
            Store status
          </span>
          <span className="size-2 rounded-full bg-[#72B556] shadow-[0_0_0_4px_rgba(114,181,86,.12)]" />
        </div>
        <p className="mt-2 text-sm font-bold">
          {storeStatus?.isOpen === false
            ? "Closed for orders"
            : "Open for orders"}
        </p>
        <p className="mt-1 text-xs text-white/45">
          {storeStatus?.city || "Kolkata"} · until{" "}
          {storeStatus?.closingTime || "8:00 PM"}
        </p>
      </div>
      <nav
        className="mt-6 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]"
        aria-label="Admin navigation"
      >
        {adminLinks.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/admin" ? location === href : location.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${active ? "bg-[#B4232C] text-white shadow-[0_8px_22px_rgba(180,35,44,.2)]" : "text-white/60 hover:bg-white/[0.07] hover:text-white"}`}
            >
              <Icon className="size-[18px]" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="size-4" />}
            </Link>
          );
        })}
      </nav>
      <Link
        href="/admin/settings"
        className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-white/60 hover:bg-white/[0.07] hover:text-white"
      >
        <Settings className="size-[18px]" /> Settings
      </Link>
      <Link
        href="/admin/settings"
        onClick={() => setMobileOpen(false)}
        className="mt-4 flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-white transition hover:border-white/20 hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-[#F6DED9]"
        aria-label="Open Amit Mallick's admin account settings"
      >
        <Avatar className="size-10 shrink-0 ring-2 ring-white/15">
          <AvatarFallback className="bg-[#F6DED9] font-black text-[#B4232C]">
            AM
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">Amit Mallick</p>
          <p className="truncate text-xs text-white/55">Admin account</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-white/45" />
      </Link>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#F5F2EE] text-[#251B18] lg:grid lg:grid-cols-[260px_1fr]">
      <div className="fixed inset-y-0 left-0 z-50 hidden w-[260px] lg:block">
        {sidebar}
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div className="relative h-full w-[280px]">{sidebar}</div>
        </div>
      )}
      <div className="lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-black/5 bg-[#F5F2EE]/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <div className="relative hidden max-w-sm flex-1 md:block">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-10 w-full rounded-full border border-black/5 bg-white pl-10 pr-4 text-sm outline-none ring-[#B4232C]/20 transition focus:ring-4"
              placeholder="Search orders, products..."
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/admin/settings"
              className="flex h-10 items-center gap-2 rounded-full bg-white pl-1.5 pr-3 text-xs font-black text-[#3D302C] shadow-sm ring-1 ring-black/5 transition hover:bg-[#FFF8F5]"
              aria-label="Open Amit Mallick's admin account settings"
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-[#F6DED9] text-[0.65rem] font-black text-[#B4232C]">
                  AM
                </AvatarFallback>
              </Avatar>
              <span>Amit Mallick</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="relative rounded-full bg-white"
            >
              <Bell className="size-4" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#B4232C]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              disabled={loggingOut}
              className="relative rounded-full bg-white"
              aria-label="Log out of the admin panel"
              title="Log out"
            >
              <LogOut className="size-4" />
            </Button>
            <Link
              href="/"
              className="hidden rounded-full bg-white px-4 py-2.5 text-xs font-black text-[#B4232C] shadow-sm ring-1 ring-black/5 sm:inline-flex"
            >
              View store
            </Link>
          </div>
        </header>
        <main className="px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">
                RedVeg control room
              </p>
              <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.035em] sm:text-4xl">
                {title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {action}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

import { BrandLogo } from "@/components/BrandLogo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Bell,
  Boxes,
  Clock3,
  CheckCheck,
  ChevronRight,
  Gift,
  Image,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Palette,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  UserCog,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { formatISTDateTime } from "@/lib/dateTime";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

type AdminOrderAlert = {
  id: string;
  status: string;
  created_at: string;
  customer_name?: string | null;
  total_amount: number;
};

const KNOWN_ORDER_IDS_KEY = "redveg_admin_known_order_ids_v1";
const UNREAD_ORDER_IDS_KEY = "redveg_admin_unread_order_ids_v1";

function readStoredIds(key: string) {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return null;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

function formatNotificationTime(value: string) {
  return formatISTDateTime(value, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const adminLinks = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, permission: "reports.finance" },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag, permission: "orders.read" },
  { href: "/admin/orders/manual", label: "Create manual order", icon: Plus, permission: "orders.manual_create" },
  { href: "/admin/catalog", label: "Products", icon: Package, permission: "catalog.read" },
  { href: "/admin/categories", label: "Categories", icon: Boxes, permission: "catalog.manage" },
  { href: "/admin/offers", label: "Offers & combos", icon: Gift, permission: "campaigns.manage" },
  { href: "/admin/coupons", label: "Coupons", icon: Tags, permission: "coupons.manage" },
  { href: "/admin/delivery", label: "Delivery areas", icon: Truck, permission: "delivery.manage" },
  { href: "/admin/delivery-slots", label: "Delivery slots", icon: Clock3, permission: "delivery.manage" },
  { href: "/admin/category-images", label: "Category images", icon: Image, permission: "content.manage" },
  { href: "/admin/customers", label: "Customers", icon: Users, permission: "customers.read" },
  { href: "/admin/customer-carts", label: "Customer carts", icon: ShoppingCart, permission: "carts.read" },
  { href: "/admin/analytics", label: "Reports", icon: BarChart3, permission: "reports.finance" },
  { href: "/admin/header-theme", label: "Header theme", icon: Palette, permission: "settings.manage" },
  { href: "/admin/staff", label: "Employees & access", icon: UserCog, permission: "staff.manage" },
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
  const { signOutAdmin, adminUser } = useAuth();
  const [storeStatus, setStoreStatus] = useState<{
    isOpen?: boolean;
    city?: string;
    closingTime?: string;
  }>({});
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [alertOrders, setAlertOrders] = useState<AdminOrderAlert[]>([]);
  const [unreadOrderIds, setUnreadOrderIds] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : (readStoredIds(UNREAD_ORDER_IDS_KEY) || [])
  );
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const unreadOrderIdsRef = useRef(unreadOrderIds);

  if (knownOrderIdsRef.current === null && typeof window !== "undefined") {
    const knownIds = readStoredIds(KNOWN_ORDER_IDS_KEY);
    if (knownIds !== null) knownOrderIdsRef.current = new Set(knownIds);
  }

  const saveUnreadIds = (ids: string[]) => {
    unreadOrderIdsRef.current = ids;
    setUnreadOrderIds(ids);
    try {
      window.localStorage.setItem(UNREAD_ORDER_IDS_KEY, JSON.stringify(ids));
    } catch {
      /* Notifications remain available for this session if storage is blocked. */
    }
  };

  const markOrderRead = (orderId: string) => {
    saveUnreadIds(unreadOrderIdsRef.current.filter(id => id !== orderId));
  };

  const markAllOrdersRead = () => saveUnreadIds([]);

  useEffect(() => {
    let active = true;
    let polling = false;

    const pollForOrders = async () => {
      if (polling) return;
      polling = true;
      try {
        const response = await apiFetch("orders?limit=50&offset=0", {}, { forceBackend: true });
        if (!response.ok) return;
        const payload = await response.json();
        const rows = Array.isArray(payload.data) ? payload.data : [];
        if (!active) return;
        const orders: AdminOrderAlert[] = rows.map((row: any) => ({
          id: String(row.id),
          status: String(row.status || "pending"),
          created_at: String(row.created_at || ""),
          customer_name: row.customer_name ? String(row.customer_name) : null,
          total_amount: Number(row.total_amount) || 0,
        }));
        setAlertOrders(orders);
        const orderIds = orders.map(order => order.id);

        // Establish a baseline on the first visit so historical orders do not
        // appear as fresh alerts. Later polls announce only unseen order IDs.
        if (knownOrderIdsRef.current === null) {
          knownOrderIdsRef.current = new Set(orderIds);
          try {
            window.localStorage.setItem(KNOWN_ORDER_IDS_KEY, JSON.stringify(orderIds));
          } catch {
            /* Keep the baseline in memory when browser storage is unavailable. */
          }
          return;
        }

        const newlyCreated = orders.filter(order => !knownOrderIdsRef.current?.has(order.id));
        if (newlyCreated.length) {
          const nextKnownIds = Array.from(new Set([...orderIds, ...Array.from(knownOrderIdsRef.current)])).slice(0, 200);
          knownOrderIdsRef.current = new Set(nextKnownIds);
          try {
            window.localStorage.setItem(KNOWN_ORDER_IDS_KEY, JSON.stringify(nextKnownIds));
          } catch {
            /* Continue notifying during this session if browser storage is blocked. */
          }
          const nextUnread = Array.from(new Set([...Array.from(unreadOrderIdsRef.current), ...newlyCreated.map(order => order.id)])).slice(-50);
          saveUnreadIds(nextUnread);
          newlyCreated.forEach(order => {
            const description = `${order.id}${order.customer_name ? ` · ${order.customer_name}` : ""} · ₹${order.total_amount.toLocaleString("en-IN")}`;
            toast.info("New customer order", { description });
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("New RedVeg order", { body: description });
            }
          });
        }
      } catch {
        // Admin routes may briefly be unavailable while the session is checked.
      } finally {
        polling = false;
      }
    };

    void pollForOrders();
    const intervalId = window.setInterval(() => void pollForOrders(), 15000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

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

  const unreadCount = unreadOrderIds.length;
  const visibleAdminLinks = adminLinks.filter(({ permission }) =>
    adminUser?.role === "owner" || adminUser?.permissions?.includes("*") || adminUser?.permissions?.includes(permission)
  );
  const accountLabel = adminUser?.username || "Admin";
  const accountInitials = accountLabel.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "RV";

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
        {visibleAdminLinks.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" || href === "/admin/orders"
            ? location === href
            : location.startsWith(href);
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
      {(adminUser?.role === "owner" || adminUser?.permissions?.includes("*") || adminUser?.permissions?.includes("settings.manage")) && <Link
        href="/admin/settings"
        className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-white/60 hover:bg-white/[0.07] hover:text-white"
      >
        <Settings className="size-[18px]" /> Settings
      </Link>}
      <Link
        href="/admin/settings"
        onClick={() => setMobileOpen(false)}
        className="mt-4 flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-white transition hover:border-white/20 hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-[#F6DED9]"
        aria-label={`Open ${accountLabel}'s account settings`}
      >
        <Avatar className="size-10 shrink-0 ring-2 ring-white/15">
          <AvatarFallback className="bg-[#F6DED9] font-black text-[#B4232C]">
            {accountInitials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{accountLabel}</p>
          <p className="truncate text-xs capitalize text-white/55">{adminUser?.role?.replace(/_/g, " ") || "Admin"} account</p>
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
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/admin/settings"
              className="flex h-10 items-center gap-2 rounded-full bg-white pl-1.5 pr-3 text-xs font-black text-[#3D302C] shadow-sm ring-1 ring-black/5 transition hover:bg-[#FFF8F5]"
              aria-label={`Open ${accountLabel}'s account settings`}
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-[#F6DED9] text-[0.65rem] font-black text-[#B4232C]">
                  {accountInitials}
                </AvatarFallback>
              </Avatar>
              <span>{accountLabel}</span>
            </Link>
            <Popover open={notificationOpen} onOpenChange={setNotificationOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative rounded-full bg-white"
                  aria-label={unreadCount ? `${unreadCount} unread order notifications` : "Order notifications"}
                  title="Order notifications"
                >
                  <Bell className="size-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#B4232C] px-1 text-[9px] font-black leading-none text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border-black/10 bg-white p-0 shadow-[0_20px_55px_rgba(30,17,14,.18)]">
                <div className="flex items-center justify-between border-b border-black/5 px-4 py-3.5">
                  <div>
                    <p className="text-sm font-black text-[#251B18]">Order notifications</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {unreadCount ? `${unreadCount} unread` : "You’re all caught up"}
                    </p>
                  </div>
                  {unreadCount > 0 && (
                    <button type="button" onClick={markAllOrdersRead} className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold text-[#B4232C] hover:bg-[#FFF3F1]">
                      <CheckCheck className="size-3.5" /> Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-[min(420px,65vh)] overflow-y-auto p-2">
                  {unreadCount === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="mx-auto size-5 text-[#B4232C]/60" />
                      <p className="mt-2 text-sm font-bold text-[#3D302C]">No new orders</p>
                      <p className="mt-1 text-xs text-muted-foreground">New customer orders will appear here.</p>
                    </div>
                  ) : unreadOrderIds.slice(-10).reverse().map(orderId => {
                    const order = alertOrders.find(item => item.id === orderId);
                    return (
                      <button
                        key={orderId}
                        type="button"
                        onClick={() => {
                          markOrderRead(orderId);
                          setNotificationOpen(false);
                          setLocation(`/admin/orders?order=${encodeURIComponent(orderId)}`);
                        }}
                        className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#FAF6F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4232C]/30"
                      >
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#B4232C]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[#251B18]">
                            {order?.customer_name || "New customer order"}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {orderId} · {order ? `₹${order.total_amount.toLocaleString("en-IN")}` : "View order"}
                          </span>
                          {order?.created_at && <span className="mt-1 block text-[0.68rem] text-muted-foreground">{formatNotificationTime(order.created_at)}</span>}
                        </span>
                        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-black/5 px-4 py-2.5">
                  <Link href="/admin/orders" onClick={() => setNotificationOpen(false)} className="text-xs font-black text-[#B4232C] hover:underline">
                    View all orders
                  </Link>
                </div>
              </PopoverContent>
            </Popover>
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
        <main className="px-4 pb-24 pt-7 sm:px-7 sm:pb-24 lg:px-10 lg:pb-9 lg:pt-9">
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
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-[#17110F] px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 text-white lg:hidden" aria-label="Admin quick navigation">
        {[
          { href: "/admin", label: "Overview", icon: LayoutDashboard },
          { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
          { href: "/admin/catalog", label: "Products", icon: Package },
          { href: "/admin/categories", label: "Categories", icon: Boxes },
        ].map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? location === href : location.startsWith(href);
          return (
            <Link key={href} href={href} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[0.65rem] font-bold ${active ? "text-[#F5B8B9]" : "text-white/65"}`}>
              <Icon className="size-[18px]" />{label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMobileOpen(true)} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[0.65rem] font-bold text-white/65" aria-label="Open all admin sections">
          <Menu className="size-[18px]" />Menu
        </button>
      </nav>
    </div>
  );
}

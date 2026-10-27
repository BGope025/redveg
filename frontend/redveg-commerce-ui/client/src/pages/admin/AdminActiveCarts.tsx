import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { formatISTDateTime, parseBackendDateTime } from "@/lib/dateTime";
import { Clock3, RefreshCw, Search, ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type ActiveCartItem = {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  available: boolean;
};

type ActiveCart = {
  customerName: string;
  email: string | null;
  phoneNumber: string | null;
  itemCount: number;
  estimatedSubtotal: number;
  updatedAt: string;
  items: ActiveCartItem[];
};

function formatINR(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function activityLabel(value: string) {
  const date = parseBackendDateTime(value);
  if (!date) return "Activity time unavailable";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 5) return "Active just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}

export default function AdminActiveCarts() {
  const [carts, setCarts] = useState<ActiveCart[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [totalMatches, setTotalMatches] = useState(0);
  const latestRequest = useRef(0);

  const loadCarts = useCallback(async (query = "", manual = false) => {
    const requestId = ++latestRequest.current;
    if (manual || query.trim()) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (query.trim()) params.set("q", query.trim());
      const response = await apiFetch(`admin/customer-carts?${params.toString()}`, { cache: "no-store" }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || `Could not load customer carts (HTTP ${response.status}).`);
      if (requestId !== latestRequest.current) return;
      setCarts(Array.isArray(payload.data) ? payload.data : []);
      setTotalMatches(Number(payload.totalMatches ?? payload.count ?? 0));
      setLastRefreshed(new Date());
    } catch (cause) {
      if (requestId !== latestRequest.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load customer carts.");
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadCarts(search), search.trim() ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [loadCarts, search]);

  useEffect(() => {
    const interval = window.setInterval(() => void loadCarts(search, true), 20_000);
    return () => window.clearInterval(interval);
  }, [loadCarts, search]);

  return <AdminShell title="Customer carts" subtitle="See what signed-in customers have in their baskets before they place an order.">
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <label className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search customer carts" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, phone, email or product" className="h-10 rounded-full border-black/10 bg-[#FBF9F6] pl-10" />
        </label>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <div className="text-right">
            <p className="text-sm font-black">{search.trim() ? `${totalMatches} matching ${totalMatches === 1 ? "cart" : "carts"}` : `${carts.length} ${carts.length === 1 ? "saved cart" : "saved carts"}`}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{lastRefreshed ? `Refreshed ${formatISTDateTime(lastRefreshed.toISOString(), { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}` : "Updating every 20 seconds"}</p>
          </div>
          <Button type="button" variant="outline" disabled={refreshing || loading} onClick={() => void loadCarts(search, true)} className="shrink-0 rounded-full border-black/10 bg-white">
            <RefreshCw className={`mr-2 size-4 ${refreshing ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </section>

      {error && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"><p>{error}</p><Button type="button" variant="outline" onClick={() => void loadCarts(search, true)} className="rounded-full border-red-200 bg-white text-red-800">Try again</Button></div>}

      {loading ? <div role="status" aria-label="Loading customer carts" className="space-y-3">{[0, 1, 2].map((row) => <div key={row} className="h-40 animate-pulse rounded-2xl bg-white ring-1 ring-black/5" />)}</div>
        : !error && carts.length === 0 ? <div className="rounded-2xl border border-dashed border-[#D8CEC8] bg-white px-6 py-14 text-center">
          <ShoppingCart className="mx-auto size-8 text-[#8B7C75]" />
          <h2 className="mt-3 text-base font-black">{search ? "No carts match your search" : "No active customer carts yet"}</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted-foreground">{search ? "Try another name, phone number, email or product keyword." : "A signed-in customer’s non-empty cart will appear here and refresh automatically. Carts are kept in this view for up to 30 days after their latest change."}</p>
        </div> : !error && <div className="space-y-3">
          {carts.map((cart) => <article key={`${cart.email || cart.phoneNumber || cart.customerName}-${cart.updatedAt}`} className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-black/5 bg-[#FBF9F6] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <h2 className="truncate text-base font-black">{cart.customerName}</h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">{[cart.phoneNumber, cart.email].filter(Boolean).join(" · ") || "No phone or email on file"}</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#625650]">
                <Clock3 className="size-4 shrink-0" />
                <span>{activityLabel(cart.updatedAt)} · {formatISTDateTime(cart.updatedAt)}</span>
              </div>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:p-5">
              <div className="divide-y divide-black/5">
                {cart.items.map((item) => <div key={`${item.productId}:${item.variantId}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{item.productName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.variantLabel} · Qty {item.quantity}{!item.available && <span className="ml-2 font-bold text-[#B4232C]">Currently unavailable</span>}</p>
                  </div>
                  <p className="shrink-0 text-sm font-bold">{formatINR(item.lineTotal)}</p>
                </div>)}
              </div>
              <div className="flex items-center justify-between border-t border-black/5 pt-3 sm:block sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                <div><p className="text-xs font-semibold text-muted-foreground">Products subtotal estimate</p><p className="mt-1 text-lg font-black">{formatINR(cart.estimatedSubtotal)}</p></div>
                <p className="max-w-[180px] text-right text-[0.68rem] leading-4 text-muted-foreground sm:mt-2 sm:text-left">Before delivery fees and any coupon.</p>
              </div>
            </div>
          </article>)}
          <p className="px-1 text-xs leading-5 text-muted-foreground">Carts update shortly after a signed-in customer changes them. Only non-empty carts updated in the last 30 days are shown.{search.trim() && totalMatches > carts.length ? ` Showing the first ${carts.length} of ${totalMatches} matches.` : ""}</p>
        </div>}
    </div>
  </AdminShell>;
}

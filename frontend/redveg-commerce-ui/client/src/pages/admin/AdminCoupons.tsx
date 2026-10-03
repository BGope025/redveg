import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { AlertCircle, ChevronLeft, ChevronRight, Clock3, Copy, Edit3, Loader2, Plus, RefreshCw, Search, TicketPercent, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

type Coupon = {
  id: string;
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number;
  startsAt: string;
  endsAt: string;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type CouponDraft = {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  maxDiscountAmount: string;
  minOrderAmount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  isActive: boolean;
};

type CouponFilter = "all" | "active" | "inactive";
const PAGE_SIZE = 25;

function localDateInput(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function makeEmptyDraft(): CouponDraft {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  return {
    code: "",
    description: "",
    discountType: "percentage",
    discountValue: "10",
    maxDiscountAmount: "",
    minOrderAmount: "0",
    startsAt: localDateInput(start),
    endsAt: localDateInput(end),
    usageLimit: "",
    isActive: true,
  };
}

function toDraft(coupon: Coupon): CouponDraft {
  return {
    code: coupon.code,
    description: coupon.description || "",
    discountType: coupon.discountType,
    discountValue: String(coupon.discountValue),
    maxDiscountAmount: coupon.maxDiscountAmount == null ? "" : String(coupon.maxDiscountAmount),
    minOrderAmount: String(coupon.minOrderAmount),
    startsAt: localDateInput(new Date(coupon.startsAt)),
    endsAt: localDateInput(new Date(coupon.endsAt)),
    usageLimit: coupon.usageLimit == null ? "" : String(coupon.usageLimit),
    isActive: coupon.isActive,
  };
}

function couponState(coupon: Coupon, now = Date.now()) {
  if (!coupon.isActive) return "Paused";
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) return "Limit reached";
  if (now < new Date(coupon.startsAt).getTime()) return "Scheduled";
  if (now >= new Date(coupon.endsAt).getTime()) return "Expired";
  return "Active";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDiscount(coupon: Coupon) {
  return coupon.discountType === "percentage"
    ? `${coupon.discountValue}%${coupon.maxDiscountAmount == null ? "" : ` · max ₹${coupon.maxDiscountAmount.toLocaleString("en-IN")}`}`
    : `₹${coupon.discountValue.toLocaleString("en-IN")}`;
}

function responseMessage(payload: any, fallback: string) {
  return typeof payload?.message === "string" && payload.message ? payload.message : fallback;
}

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CouponFilter>("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [draft, setDraft] = useState<CouponDraft>(makeEmptyDraft);
  const [saving, setSaving] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (search.trim()) params.set("search", search.trim());
      if (filter !== "all") params.set("status", filter);

      try {
        const response = await apiFetch(`coupons?${params.toString()}`, { signal: controller.signal }, { forceBackend: true });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) {
          throw new Error(responseMessage(payload, `Could not load coupons (HTTP ${response.status})`));
        }
        setCoupons(Array.isArray(payload.data) ? payload.data : []);
        setTotal(Math.max(0, Number(payload.count) || 0));
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setCoupons([]);
        setTotal(0);
        setError(fetchError instanceof Error ? fetchError.message : "Could not load coupons.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, search, filter, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openCreate = () => {
    setEditingCoupon(null);
    setDraft(makeEmptyDraft());
    setFormError("");
    setEditorOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setDraft(toDraft(coupon));
    setFormError("");
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditingCoupon(null);
    setFormError("");
  };

  const saveCoupon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const body = {
        code: draft.code.trim().toUpperCase(),
        description: draft.description.trim(),
        discountType: draft.discountType,
        discountValue: Number(draft.discountValue),
        maxDiscountAmount: draft.maxDiscountAmount === "" ? null : Number(draft.maxDiscountAmount),
        minOrderAmount: Number(draft.minOrderAmount),
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        usageLimit: draft.usageLimit === "" ? null : Number(draft.usageLimit),
        isActive: draft.isActive,
      };
      const isEdit = Boolean(editingCoupon);
      const response = await apiFetch(isEdit ? `coupons/${editingCoupon!.id}` : "coupons", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(responseMessage(payload, "Could not save this coupon."));
      }
      toast.success(isEdit ? "Coupon updated" : "Coupon created", { description: `${body.code} is saved to the coupon database.` });
      setEditorOpen(false);
      setEditingCoupon(null);
      setRefreshKey((key) => key + 1);
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Could not save this coupon.");
    } finally {
      setSaving(false);
    }
  };

  const toggleCoupon = async (coupon: Coupon) => {
    setMutatingId(coupon.id);
    try {
      const response = await apiFetch(`coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !coupon.isActive }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(responseMessage(payload, "Could not change coupon status."));
      }
      toast.success(coupon.isActive ? "Coupon paused" : "Coupon activated", { description: coupon.code });
      setRefreshKey((key) => key + 1);
    } catch (toggleError) {
      toast.error(toggleError instanceof Error ? toggleError.message : "Could not change coupon status.");
    } finally {
      setMutatingId(null);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Coupon code copied", { description: code });
    } catch {
      toast.error("Could not copy this coupon code.");
    }
  };

  const onFilterChange = (value: CouponFilter) => {
    setFilter(value);
    setPage(0);
  };

  return (
    <AdminShell
      title="Coupons"
      subtitle="Create and manage coupon rules stored in your catalog database."
      action={<Button onClick={openCreate} className="h-11 rounded-full bg-[#B4232C] px-5 font-black text-white hover:bg-[#951D24]"><Plus className="size-4" /> Create coupon</Button>}
    >
      <section className="overflow-hidden rounded-[1.5rem] bg-white shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-5 border-b border-black/5 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#F8E7E6] text-[#B4232C]"><TicketPercent className="size-5" /></span><div><h2 className="text-lg font-black">Coupon directory</h2><p className="mt-1 text-xs text-muted-foreground">{loading ? "Loading from Turso…" : `${total.toLocaleString("en-IN")} ${total === 1 ? "coupon" : "coupons"} found`}</p></div></div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative min-w-0 sm:w-72">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input aria-label="Search coupons" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search code or description" className="h-10 w-full rounded-full border border-black/10 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-[#B4232C]/40 focus:ring-4 focus:ring-[#B4232C]/10" />
            </label>
            <div className="flex rounded-full bg-[#F5F2EE] p-1" aria-label="Filter coupons">
              {(["all", "active", "inactive"] as const).map((option) => (
                <button key={option} type="button" onClick={() => onFilterChange(option)} className={`rounded-full px-3 py-2 text-xs font-black capitalize transition ${filter === option ? "bg-white text-[#B4232C] shadow-sm" : "text-muted-foreground hover:text-[#251B18]"}`}>{option}</button>
              ))}
            </div>
            <Button type="button" aria-label="Refresh coupons" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading} className="size-10 shrink-0 rounded-full bg-[#F5F2EE] text-[#251B18] hover:bg-[#ECE6E1]" size="icon" variant="ghost"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></Button>
          </div>
        </div>

        {error ? (
          <div className="m-5 flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center">
            <AlertCircle className="size-5 shrink-0 text-[#B4232C]" />
            <div className="flex-1"><p className="font-bold text-[#7F1D1D]">Coupons couldn’t be loaded</p><p className="mt-1 text-sm text-[#7F1D1D]/80">{error}</p></div>
            <Button onClick={() => setRefreshKey((key) => key + 1)} variant="outline" className="rounded-full">Try again</Button>
          </div>
        ) : loading ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading coupons">{[0, 1, 2, 3].map((row) => <div key={row} className="h-14 animate-pulse rounded-xl bg-[#F5F2EE]" />)}</div>
        ) : coupons.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-[#F8E7E6] text-[#B4232C]"><TicketPercent className="size-6" /></span>
            <h3 className="mt-5 text-lg font-black">{search.trim() ? "No matching coupons" : filter === "all" ? "No coupons created yet" : `No ${filter} coupons`}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{search.trim() ? "Try a different coupon code or description." : "Create your first coupon to save it in the catalog database. It will appear here after the API confirms it."}</p>
            {!search.trim() && filter === "all" && <Button onClick={openCreate} className="mt-5 rounded-full bg-[#B4232C] font-black text-white hover:bg-[#951D24]"><Plus className="size-4" /> Create first coupon</Button>}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left">
                <thead><tr className="border-b border-black/5 bg-[#FBF9F6] text-[0.65rem] font-black uppercase tracking-[0.13em] text-muted-foreground"><th className="px-6 py-3">Code</th><th className="px-4 py-3">Discount</th><th className="px-4 py-3">Minimum order</th><th className="px-4 py-3">Valid until</th><th className="px-4 py-3">Usage</th><th className="px-4 py-3">Status</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
                <tbody>
                  {coupons.map((coupon) => {
                    const status = couponState(coupon);
                    const statusClass = status === "Active" ? "bg-[#E8F3E5] text-[#267345]" : status === "Scheduled" ? "bg-[#FFF0D2] text-[#996200]" : "bg-[#F3ECE9] text-[#746761]";
                    return (
                      <tr key={coupon.id} className="border-b border-black/5 last:border-0">
                        <td className="px-6 py-4"><div className="flex items-center gap-2"><button type="button" onClick={() => copyCode(coupon.code)} className="font-mono text-sm font-black tracking-wide text-[#B4232C] hover:underline" title="Copy code">{coupon.code}</button><button type="button" aria-label={`Copy ${coupon.code}`} onClick={() => copyCode(coupon.code)} className="rounded p-1 text-muted-foreground hover:bg-[#F5F2EE]"><Copy className="size-3.5" /></button></div><p className="mt-1 max-w-[230px] truncate text-xs text-muted-foreground">{coupon.description || "No description"}</p></td>
                        <td className="px-4 py-4 text-sm font-black">{formatDiscount(coupon)}</td>
                        <td className="px-4 py-4 text-sm text-muted-foreground">₹{coupon.minOrderAmount.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-4"><span className="text-sm font-semibold">{formatDate(coupon.endsAt)}</span><span className="mt-1 flex items-center gap-1 text-[0.68rem] text-muted-foreground"><Clock3 className="size-3" /> Starts {formatDate(coupon.startsAt)}</span></td>
                        <td className="px-4 py-4 text-sm text-muted-foreground">{coupon.usageCount.toLocaleString("en-IN")} / {coupon.usageLimit == null ? "∞" : coupon.usageLimit.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1.5 text-[0.68rem] font-black ${statusClass}`}>{status}</span></td>
                        <td className="px-6 py-4"><div className="flex justify-end gap-2"><Button type="button" aria-label={`Edit ${coupon.code}`} onClick={() => openEdit(coupon)} size="icon-sm" variant="outline" className="rounded-full bg-white"><Edit3 className="size-4" /></Button><Button type="button" disabled={mutatingId === coupon.id} onClick={() => toggleCoupon(coupon)} size="sm" variant="outline" className="rounded-full">{mutatingId === coupon.id ? <Loader2 className="size-4 animate-spin" /> : coupon.isActive ? "Pause" : "Activate"}</Button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-black/5 px-5 py-4 sm:px-6"><p className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</p><div className="flex gap-2"><Button aria-label="Previous page" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} size="sm" variant="outline" className="rounded-full"><ChevronLeft className="size-4" /> Previous</Button><Button aria-label="Next page" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)} size="sm" variant="outline" className="rounded-full">Next <ChevronRight className="size-4" /></Button></div></div>
          </>
        )}
      </section>

      {editorOpen && (
        <div className="fixed inset-0 z-[70]">
          <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={closeEditor} aria-label="Close coupon editor" />
          <aside role="dialog" aria-modal="true" aria-labelledby="coupon-editor-title" className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-[#FFFDF9] p-5 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#B4232C]">Coupon management</p><h2 id="coupon-editor-title" className="mt-2 font-display text-3xl font-black">{editingCoupon ? "Edit coupon" : "Create a coupon"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Set the discount and guardrails. The API validates and saves these rules.</p></div><Button type="button" disabled={saving} variant="ghost" size="icon" className="rounded-full bg-white" onClick={closeEditor} aria-label="Close"><X className="size-5" /></Button></div>
            <form className="mt-7 space-y-5" onSubmit={saveCoupon}>
              <div><label htmlFor="coupon-code" className="mb-1.5 block text-xs font-black">Coupon code</label><input id="coupon-code" required maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="e.g. FRESH10" className="h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 font-mono text-sm font-black tracking-wide outline-none focus:border-[#B4232C]/40 focus:ring-4 focus:ring-[#B4232C]/10" /><p className="mt-1 text-[0.68rem] text-muted-foreground">3–32 letters, numbers, hyphens or underscores.</p></div>
              <div><label htmlFor="coupon-description" className="mb-1.5 block text-xs font-black">Description <span className="font-normal text-muted-foreground">(optional)</span></label><input id="coupon-description" maxLength={300} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Short internal or customer-facing note" className="h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm outline-none focus:border-[#B4232C]/40 focus:ring-4 focus:ring-[#B4232C]/10" /></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="coupon-discount-type" className="mb-1.5 block text-xs font-black">Discount type</label><select id="coupon-discount-type" value={draft.discountType} onChange={(event) => setDraft((current) => ({ ...current, discountType: event.target.value as CouponDraft["discountType"] }))} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm outline-none focus:border-[#B4232C]/40"><option value="percentage">Percentage</option><option value="fixed">Fixed amount (₹)</option></select></div><div><label htmlFor="coupon-discount-value" className="mb-1.5 block text-xs font-black">Discount value</label><input id="coupon-discount-value" required type="number" min="0.01" max={draft.discountType === "percentage" ? 100 : undefined} step="0.01" value={draft.discountValue} onChange={(event) => setDraft((current) => ({ ...current, discountValue: event.target.value }))} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm outline-none focus:border-[#B4232C]/40" /></div></div>
              {draft.discountType === "percentage" && <div><label htmlFor="coupon-max-discount" className="mb-1.5 block text-xs font-black">Maximum discount <span className="font-normal text-muted-foreground">(₹, optional)</span></label><input id="coupon-max-discount" type="number" min="0.01" step="0.01" value={draft.maxDiscountAmount} onChange={(event) => setDraft((current) => ({ ...current, maxDiscountAmount: event.target.value }))} placeholder="No cap" className="h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm outline-none focus:border-[#B4232C]/40" /></div>}
              <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="coupon-min-order" className="mb-1.5 block text-xs font-black">Minimum order (₹)</label><input id="coupon-min-order" required type="number" min="0" step="0.01" value={draft.minOrderAmount} onChange={(event) => setDraft((current) => ({ ...current, minOrderAmount: event.target.value }))} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm outline-none focus:border-[#B4232C]/40" /></div><div><label htmlFor="coupon-usage-limit" className="mb-1.5 block text-xs font-black">Total usage limit <span className="font-normal text-muted-foreground">(optional)</span></label><input id="coupon-usage-limit" type="number" min="1" step="1" value={draft.usageLimit} onChange={(event) => setDraft((current) => ({ ...current, usageLimit: event.target.value }))} placeholder="Unlimited" className="h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm outline-none focus:border-[#B4232C]/40" /></div></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="coupon-starts" className="mb-1.5 block text-xs font-black">Starts</label><input id="coupon-starts" required type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm outline-none focus:border-[#B4232C]/40" /></div><div><label htmlFor="coupon-ends" className="mb-1.5 block text-xs font-black">Ends</label><input id="coupon-ends" required type="datetime-local" min={draft.startsAt} value={draft.endsAt} onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm outline-none focus:border-[#B4232C]/40" /></div></div>
              <label className="flex items-center justify-between rounded-2xl border border-black/5 bg-white p-4"><span><span className="block text-sm font-black">Coupon enabled</span><span className="mt-1 block text-xs text-muted-foreground">Date and usage rules still determine whether customers can use it.</span></span><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} className="size-5 accent-[#B4232C]" /></label>
              {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-[#8B2B2B]">{formError}</p>}
              <div className="flex flex-col-reverse gap-3 border-t border-black/5 pt-5 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={saving} onClick={closeEditor} className="rounded-full">Cancel</Button><Button type="submit" disabled={saving} className="rounded-full bg-[#B4232C] px-5 font-black text-white hover:bg-[#951D24]">{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{editingCoupon ? "Save changes" : "Create coupon"}</Button></div>
            </form>
          </aside>
        </div>
      )}
    </AdminShell>
  );
}

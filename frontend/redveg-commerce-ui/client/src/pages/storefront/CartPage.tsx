import { StoreShell } from "@/components/storefront/StoreShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { AlertCircle, ArrowRight, Check, Loader2, Minus, Plus, ShieldCheck, ShoppingBag, Tag, Trash2, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

type ActiveCoupon = {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number;
};

function money(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function couponOffer(coupon: ActiveCoupon) {
  return coupon.discountType === "percentage"
    ? `${coupon.discountValue}% off${coupon.maxDiscountAmount == null ? "" : ` · max ₹${money(coupon.maxDiscountAmount)}`}`
    : `₹${money(coupon.discountValue)} off`;
}

export default function CartPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const {
    items, resolvedItems, subtotal, deliveryFee, total, updateQuantity, removeItem,
    couponCode, couponQuote, couponValidationLoading, couponValidationError, setCouponCode, clearCoupon,
  } = useCart();
  const [couponInput, setCouponInput] = useState(couponCode);
  const [availableCoupons, setAvailableCoupons] = useState<ActiveCoupon[]>([]);

  useEffect(() => setCouponInput(couponCode), [couponCode]);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch("coupons/active", { signal: controller.signal }, { forceBackend: true })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) throw new Error(payload.message || "Could not load active coupons");
        setAvailableCoupons(Array.isArray(payload.data) ? payload.data : []);
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn("Active coupon feed unavailable:", error);
      });
    return () => controller.abort();
  }, []);

  const quoteIsCurrent = Boolean(couponQuote && couponCode && couponQuote.coupon.code.toUpperCase() === couponCode.toUpperCase());
  const displaySubtotal = quoteIsCurrent ? couponQuote!.subtotalAmount : subtotal;
  const displayDeliveryFee = quoteIsCurrent ? couponQuote!.deliveryFee : deliveryFee;
  const displayTotal = quoteIsCurrent ? couponQuote!.totalAmount : total;
  const discount = quoteIsCurrent ? couponQuote!.discountAmount : 0;

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    if (!items.length) return;
    setCouponCode(code);
  };

  const continueToCheckout = () => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLocation(`/login?returnTo=${encodeURIComponent("/checkout")}`);
      return;
    }
    setLocation("/checkout");
  };

  if (!resolvedItems.length) {
    return <StoreShell><div className="container py-20 sm:py-28"><div className="mx-auto max-w-lg rounded-[2rem] bg-white p-8 text-center shadow-[0_20px_60px_rgba(61,33,27,.08)] sm:p-12"><span className="mx-auto grid size-16 place-items-center rounded-full bg-[#F8E7E5] text-[#B4232C]"><ShoppingBag className="size-7" /></span><h1 className="mt-6 font-display text-3xl font-black">Your basket is waiting</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Choose from today’s fresh chicken, mutton, fish and seafood cuts.</p><Link href="/shop" className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-[#B4232C] px-6 text-sm font-black text-white">Explore fresh cuts <ArrowRight className="size-4" /></Link></div></div></StoreShell>;
  }

  return (
    <StoreShell>
      <div className="container py-10 sm:py-14">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">Your basket</p><h1 className="mt-2 font-display text-4xl font-black tracking-[-0.04em]">Fresh cuts, almost home.</h1></div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_390px]">
          <div className="space-y-4">
            {resolvedItems.map((item) => (
              <article key={`${item.productId}-${item.variantId}`} className="grid grid-cols-[92px_1fr] gap-4 rounded-[1.4rem] bg-white p-3 shadow-[0_10px_30px_rgba(61,33,27,.055)] ring-1 ring-black/[0.045] sm:grid-cols-[130px_1fr_auto] sm:p-4">
                <img src={item.product.image} alt="" className="aspect-square size-[92px] rounded-2xl object-cover sm:size-[130px]" />
                <div className="py-1"><h2 className="font-black sm:text-lg">{item.product.name}</h2><p className="mt-1 text-sm text-muted-foreground">{item.variant.label} · {item.product.shortDescription}</p><p className="mt-3 text-lg font-black">₹{money(item.lineTotal)}</p><button onClick={() => removeItem(item.productId, item.variantId)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#B4232C] sm:hidden"><Trash2 className="size-3.5" /> Remove</button></div>
                <div className="col-span-2 flex items-center justify-between border-t border-black/5 pt-3 sm:col-span-1 sm:flex-col sm:items-end sm:border-0 sm:pt-1"><div className="flex h-11 items-center rounded-full border border-[#E2D8D2] bg-white p-1"><button onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)} className="grid size-8 place-items-center rounded-full hover:bg-[#F6F1EC]" aria-label="Decrease quantity"><Minus className="size-4" /></button><span className="w-8 text-center text-sm font-black">{item.quantity}</span><button onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)} className="grid size-8 place-items-center rounded-full hover:bg-[#F6F1EC]" aria-label="Increase quantity"><Plus className="size-4" /></button></div><button onClick={() => removeItem(item.productId, item.variantId)} className="hidden items-center gap-1.5 text-xs font-bold text-[#B4232C] sm:inline-flex"><Trash2 className="size-3.5" /> Remove</button></div>
              </article>
            ))}
            <div className="flex items-center gap-3 rounded-2xl bg-[#EAF4E8] p-4 text-sm text-[#275F3C]"><Truck className="size-5 shrink-0" /><span>{displaySubtotal >= 799 ? <><strong>You unlocked free delivery.</strong> We’ll confirm the delivery slot on WhatsApp.</> : <><strong>Add ₹{money(799 - displaySubtotal)} more for free delivery.</strong> Standard delivery is ₹49.</>}</span></div>
          </div>

          <aside className="h-fit rounded-[1.6rem] bg-white p-5 shadow-[0_16px_45px_rgba(61,33,27,.08)] ring-1 ring-black/[0.045] lg:sticky lg:top-40 sm:p-6">
            <h2 className="text-xl font-black">Order summary</h2>
            <div className="mt-5 flex gap-2"><Input aria-label="Coupon code" value={couponInput} onChange={(event) => setCouponInput(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyCoupon(); } }} className="h-11 rounded-xl bg-[#F6F1EC] font-mono font-bold" placeholder="Enter coupon code" /><Button type="button" onClick={applyCoupon} disabled={!couponInput.trim() || couponValidationLoading} variant="outline" className="h-11 rounded-xl bg-white font-black">{couponValidationLoading ? <Loader2 className="size-4 animate-spin" /> : "Apply"}</Button></div>
            {couponCode && couponValidationLoading && <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Checking {couponCode} against live prices…</p>}
            {couponCode && couponValidationError && <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-[#8B2B2B]"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{couponValidationError}</span><button type="button" onClick={clearCoupon} aria-label="Remove invalid coupon" className="font-black underline">Remove</button></div>}
            {quoteIsCurrent && <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#EAF4E8] p-3 text-xs font-bold text-[#267345]"><Check className="size-4 shrink-0" /><span><strong>{couponQuote!.coupon.code}</strong> applied · you save ₹{money(discount)}</span><button type="button" onClick={clearCoupon} aria-label="Remove applied coupon" className="ml-auto rounded-full p-1 hover:bg-black/5"><X className="size-4" /></button></div>}
            {availableCoupons.length > 0 && <div className="mt-4"><p className="text-[0.65rem] font-black uppercase tracking-[0.13em] text-muted-foreground">Available coupons</p><div className="mt-2 flex flex-wrap gap-2">{availableCoupons.map((offer) => <button type="button" key={offer.code} onClick={() => { setCouponInput(offer.code); setCouponCode(offer.code); }} className="rounded-xl border border-dashed border-[#DAB9B4] bg-[#FFF8F6] px-3 py-2 text-left transition hover:border-[#B4232C]"><span className="flex items-center gap-1.5 font-mono text-xs font-black text-[#B4232C]"><Tag className="size-3.5" />{offer.code}</span><span className="mt-1 block text-[0.65rem] text-muted-foreground">{couponOffer(offer)}{offer.minOrderAmount > 0 ? ` · min ₹${money(offer.minOrderAmount)}` : ""}</span></button>)}</div></div>}
            {availableCoupons.length === 0 && !couponCode && <p className="mt-2 text-xs text-muted-foreground">Have a coupon code? Enter it above to check eligibility.</p>}
            <div className="mt-6 space-y-3 text-sm"><SummaryRow label="Subtotal" value={`₹${money(displaySubtotal)}`} /><SummaryRow label="Delivery" value={displayDeliveryFee ? `₹${money(displayDeliveryFee)}` : "FREE"} green={!displayDeliveryFee} />{quoteIsCurrent && <SummaryRow label={`Coupon discount (${couponQuote!.coupon.code})`} value={`−₹${money(discount)}`} green />}</div>
            <div className="my-5 border-t border-dashed border-black/15" />
            <div className="flex items-end justify-between"><div><p className="font-black">Total</p><p className="mt-1 text-xs text-muted-foreground">Prices confirmed again at checkout</p></div><p className="text-2xl font-black">₹{money(displayTotal)}</p></div>
            <button type="button" onClick={continueToCheckout} disabled={authLoading} className="mt-6 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[#B4232C] text-sm font-black text-white shadow-[0_12px_28px_rgba(180,35,44,.2)] disabled:cursor-wait disabled:opacity-60">{authLoading ? "Checking account…" : "Continue to checkout"} <ArrowRight className="size-4" /></button>
            <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground"><ShieldCheck className="size-4 text-[#267345]" /> Discount and stock are revalidated before saving</p>
          </aside>
        </div>
      </div>
    </StoreShell>
  );
}

function SummaryRow({ label, value, green = false }: { label: string; value: string; green?: boolean }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className={`font-bold ${green ? "text-[#267345]" : ""}`}>{value}</span></div>;
}

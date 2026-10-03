import { StoreShell } from "@/components/storefront/StoreShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/contexts/CartContext";
import { apiFetch } from "@/lib/api";
import { AlertCircle, ArrowLeft, Check, Copy, ExternalLink, Loader2, MapPin, MessageCircle, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

function money(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const WHATSAPP_RECIPIENT = "918910558446";
const whatsappOrderUrl = (message: string) => `https://wa.me/${WHATSAPP_RECIPIENT}?text=${encodeURIComponent(message)}`;

type SavedOrder = {
  id: string;
  total: number;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  couponCode: string | null;
  message: string;
};

export default function CheckoutPage() {
  const {
    items, resolvedItems, subtotal, deliveryFee, total, clearCart,
    couponCode, couponQuote, couponValidationLoading, couponValidationError, clearCoupon,
  } = useCart();
  const [savedOrder, setSavedOrder] = useState<SavedOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", mobile: "", address: "", locality: "", pincode: "", landmark: "", note: "" });
  const quoteIsCurrent = Boolean(couponQuote && couponCode && couponQuote.coupon.code.toUpperCase() === couponCode.toUpperCase());
  const displaySubtotal = quoteIsCurrent ? couponQuote!.subtotalAmount : subtotal;
  const displayDiscount = quoteIsCurrent ? couponQuote!.discountAmount : 0;
  const displayDeliveryFee = quoteIsCurrent ? couponQuote!.deliveryFee : deliveryFee;
  const displayTotal = quoteIsCurrent ? couponQuote!.totalAmount : total;
  const couponPending = Boolean(couponCode && (couponValidationLoading || !quoteIsCurrent));

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resolvedItems.length) return toast.error("Your basket is empty.");
    if (!form.name.trim() || !/^\d{10}$/.test(form.mobile.replace(/\D/g, "")) || !form.address.trim() || !form.locality.trim() || !/^\d{6}$/.test(form.pincode)) {
      toast.error("Please complete the required delivery details correctly.");
      return;
    }
    if (couponPending) {
      toast.error("Check or remove the coupon before placing your order.", { description: couponValidationError || "We’re verifying it against your current basket." });
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch("orders/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartItems: items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })),
          couponCode: quoteIsCurrent ? couponQuote!.coupon.code : undefined,
          customer: {
            name: form.name.trim(),
            phoneNo: form.mobile.replace(/\D/g, ""),
            address: `${form.address}, ${form.locality}${form.landmark ? `, ${form.landmark}` : ""} - ${form.pincode}${form.note.trim() ? `\nDelivery note: ${form.note.trim()}` : ""}`,
          },
        }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.message || "Unable to save your order");
      const saved = payload.data;
      setSavedOrder({
        id: saved.orderId,
        total: Number(saved.totalAmount),
        subtotal: Number(saved.subtotalAmount ?? subtotal),
        discount: Number(saved.discountAmount ?? 0),
        deliveryFee: Number(saved.deliveryFee ?? 0),
        couponCode: saved.couponCode || null,
        message: saved.whatsappMessage,
      });
      clearCart();
      window.location.assign(whatsappOrderUrl(saved.whatsappMessage));
    } catch (error) {
      toast.error("Order could not be saved", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const openWhatsapp = () => savedOrder && window.location.assign(whatsappOrderUrl(savedOrder.message));

  if (savedOrder) {
    return (
      <StoreShell>
        <div className="container py-16 sm:py-24"><div className="mx-auto max-w-2xl rounded-[2rem] bg-white p-7 text-center shadow-[0_24px_70px_rgba(61,33,27,.1)] ring-1 ring-black/[0.045] sm:p-12"><span className="mx-auto grid size-20 place-items-center rounded-full bg-[#E5F3E3] text-[#267345]"><Check className="size-9" strokeWidth={3} /></span><p className="mt-7 text-xs font-black uppercase tracking-[0.18em] text-[#267345]">Order saved successfully</p><h1 className="mt-3 font-display text-4xl font-black tracking-[-0.04em]">Now confirm on WhatsApp</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">Your order <strong className="text-foreground">{savedOrder.id}</strong> is recorded as pending. WhatsApp should open automatically; send the prepared message to RedVeg to confirm.</p><Button onClick={openWhatsapp} className="mt-8 h-14 w-full rounded-full bg-[#1F8D4D] text-base font-black text-white hover:bg-[#18743E]"><MessageCircle className="size-5" /> Open WhatsApp <ExternalLink className="size-4" /></Button><Button variant="outline" onClick={() => navigator.clipboard.writeText(savedOrder.message).then(() => toast.success("Order message copied"))} className="mt-3 h-12 w-full rounded-full bg-white font-bold"><Copy className="size-4" /> Copy order message</Button><div className="mt-7 rounded-2xl bg-[#F6F1EC] p-4 text-left text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Order ID</span><strong>{savedOrder.id}</strong></div><div className="mt-2 flex justify-between"><span className="text-muted-foreground">Subtotal</span><strong>₹{money(savedOrder.subtotal)}</strong></div>{savedOrder.couponCode && savedOrder.discount > 0 && <div className="mt-2 flex justify-between text-[#267345]"><span>Coupon · {savedOrder.couponCode}</span><strong>−₹{money(savedOrder.discount)}</strong></div>}<div className="mt-2 flex justify-between"><span className="text-muted-foreground">Delivery</span><strong>{savedOrder.deliveryFee ? `₹${money(savedOrder.deliveryFee)}` : "FREE"}</strong></div><div className="mt-2 flex justify-between"><span className="text-muted-foreground">Order total</span><strong>₹{money(savedOrder.total)}</strong></div><div className="mt-2 flex justify-between"><span className="text-muted-foreground">Initial status</span><strong className="text-[#B4232C]">Pending</strong></div></div><Link href="/" className="mt-7 inline-block text-sm font-bold text-[#B4232C]">Return to storefront</Link></div></div>
      </StoreShell>
    );
  }

  return (
    <StoreShell>
      <div className="container py-10 sm:py-14">
        <Link href="/cart" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-[#B4232C]"><ArrowLeft className="size-4" /> Back to basket</Link>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_390px]">
          <form onSubmit={submit} className="rounded-[1.7rem] bg-white p-5 shadow-[0_16px_45px_rgba(61,33,27,.07)] ring-1 ring-black/[0.045] sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">Guest checkout</p><h1 className="mt-2 font-display text-3xl font-black tracking-[-0.035em]">Where should we deliver?</h1><p className="mt-2 text-sm text-muted-foreground">No account needed. We’ll confirm your order and delivery on WhatsApp.</p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2"><Field label="Full name" required><Input value={form.name} onChange={update("name")} placeholder="Amit Roy" className="h-12 rounded-xl bg-[#F8F5F1]" /></Field><Field label="Mobile number" required><Input value={form.mobile} onChange={update("mobile")} inputMode="tel" placeholder="10-digit mobile number" className="h-12 rounded-xl bg-[#F8F5F1]" /></Field></div>
            <div className="mt-5"><Field label="House, street and building" required><Textarea value={form.address} onChange={update("address")} placeholder="Flat, house number, street" className="min-h-24 rounded-xl bg-[#F8F5F1]" /></Field></div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2"><Field label="Locality" required><Input value={form.locality} onChange={update("locality")} placeholder="Dumdum Cantonment" className="h-12 rounded-xl bg-[#F8F5F1]" /></Field><Field label="Pincode" required><div className="relative"><MapPin className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#267345]" /><Input value={form.pincode} onChange={update("pincode")} inputMode="numeric" maxLength={6} placeholder="700065" className="h-12 rounded-xl bg-[#F8F5F1] pl-10" /></div></Field></div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2"><Field label="Landmark"><Input value={form.landmark} onChange={update("landmark")} placeholder="Near the main road" className="h-12 rounded-xl bg-[#F8F5F1]" /></Field><Field label="Delivery note"><Input value={form.note} onChange={update("note")} placeholder="Call before arrival" className="h-12 rounded-xl bg-[#F8F5F1]" /></Field></div>
            <div className="mt-7 rounded-2xl bg-[#EAF4E8] p-4 text-sm text-[#275F3C]"><strong>Serviceability check:</strong> Enter a 6-digit Kolkata pincode. Prices, coupon validity and stock are confirmed by the backend before the order is saved.</div>
          </form>
          <aside className="h-fit rounded-[1.6rem] bg-[#17110F] p-6 text-white shadow-[0_20px_55px_rgba(30,17,14,.16)] lg:sticky lg:top-40">
            <h2 className="text-xl font-black">Review your order</h2>
            <div className="mt-5 space-y-4">{resolvedItems.map((item) => <div key={`${item.productId}-${item.variantId}`} className="flex gap-3"><img src={item.product.image} alt="" className="size-14 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.product.name}</p><p className="mt-1 text-xs text-white/45">{item.variant.label} × {item.quantity}</p></div><span className="text-sm font-bold">₹{money(item.lineTotal)}</span></div>)}</div>
            <div className="my-5 border-t border-white/10" />
            <div className="space-y-3 text-sm"><PriceRow label="Subtotal" value={`₹${money(displaySubtotal)}`} />{quoteIsCurrent && <PriceRow label={`Coupon · ${couponQuote!.coupon.code}`} value={`−₹${money(displayDiscount)}`} green />}<PriceRow label="Delivery" value={displayDeliveryFee ? `₹${money(displayDeliveryFee)}` : "FREE"} green={!displayDeliveryFee} /><div className="flex justify-between pt-2 text-lg font-black"><span>Total</span><span>₹{money(displayTotal)}</span></div></div>
            {couponCode && (couponValidationLoading || !quoteIsCurrent) && <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/10 p-3 text-xs text-white/80"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{couponValidationLoading ? `Rechecking ${couponCode}…` : couponValidationError || "Coupon quote unavailable."}</span><button type="button" onClick={clearCoupon} className="font-black underline"><X className="size-4" /><span className="sr-only">Remove coupon</span></button></div>}
            {quoteIsCurrent && <p className="mt-3 flex items-center gap-2 text-xs font-bold text-[#A8D59D]"><Check className="size-4" /> Coupon verified against current catalog prices.</p>}
            <Button type="submit" onClick={submit} disabled={submitting || !resolvedItems.length || couponPending} className="mt-6 h-14 w-full rounded-full bg-[#D8323A] text-sm font-black text-white hover:bg-[#E33A42]">{submitting ? <><Loader2 className="size-4 animate-spin" /> Saving order safely…</> : "Save Order & Continue on WhatsApp"}</Button>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-white/50"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#72B556]" /> The server recalculates your prices, discount, delivery and available stock when you place the order.</p>
          </aside>
        </div>
      </div>
    </StoreShell>
  );
}

function PriceRow({ label, value, green = false }: { label: string; value: string; green?: boolean }) {
  return <div className={`flex justify-between ${green ? "text-[#A8D59D]" : "text-white/55"}`}><span>{label}</span><span className="font-bold text-white">{value}</span></div>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="text-sm font-bold">{label}{required && <span className="ml-1 text-[#B4232C]">*</span>}</Label>{children}</div>;
}

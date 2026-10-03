import { AdminShell } from "@/components/admin/AdminShell";
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Order, OrderStatus } from "@/types/commerce";
import { ChevronDown, Download, Filter, MapPin, MessageCircle, Phone, Search, X } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

const statuses: OrderStatus[] = ["New", "Confirmed", "Processing", "Out for Delivery", "Delivered", "Cancelled"];
const nextStatuses: Record<OrderStatus, OrderStatus[]> = {
  New: ["Confirmed", "Cancelled"],
  Confirmed: ["Processing", "Delivered"],
  Processing: ["Out for Delivery"],
  "Out for Delivery": ["Delivered"],
  Delivered: [],
  Cancelled: [],
};
type PaymentStatus = "Paid" | "Partial" | "Unpaid";

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | OrderStatus>("All");
  const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentStatusDraft, setPaymentStatusDraft] = useState<PaymentStatus>("Unpaid");
  const [paymentDueDraft, setPaymentDueDraft] = useState("0");
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const response = await apiFetch('orders', {}, { forceBackend: true });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const payload = await response.json();
        const rows = payload.data || payload;
        setOrders(Array.isArray(rows) ? rows.map(normalizeOrder) : []);
      } catch (error) {
        console.error("Error fetching orders:", error);
        toast.error("Failed to load orders");
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setPaymentStatusDraft(selected.paymentStatus || "Unpaid");
    setPaymentDueDraft(String(selected.dueAmount ?? selected.total));
  }, [selected?.id, selected?.paymentStatus, selected?.dueAmount, selected?.total]);

  const visible = useMemo(() =>
    orders.filter((order) =>
      (filter === "All" || order.status === filter) &&
      (!search || `${order.id} ${order.customer} ${order.mobile}`.toLowerCase().includes(search.toLowerCase()))
    ),
    [filter, orders, search]
  );

  const updateStatus = async (id: string, status: OrderStatus) => {
    const currentStatus = orders.find((order) => order.id === id)?.status;
    if (status === currentStatus) return;

    const endpoint = status === "Cancelled"
      ? `orders/${id}/cancel`
      : status === "Confirmed"
        ? `orders/${id}/approve`
        : `orders/${id}/status`;
    try {
      const response = await apiFetch(endpoint, {
        method: "PATCH",
        ...(status !== "Cancelled" && status !== "Confirmed"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: status.toLowerCase().replace(/ /g, "_") }) }
          : {}),
      }, { forceBackend: true });
      if (!response.ok) throw new Error((await response.json()).message || "Unable to update order");
      setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
      setSelected((current) => current?.id === id ? { ...current, status } : current);
      toast.success(`Order ${id} moved to ${status}`);
    } catch (error: any) {
      toast.error("Order update failed", { description: error.message });
    }
  };

  const changePaymentStatus = (status: PaymentStatus) => {
    setPaymentStatusDraft(status);
    if (status === "Paid") setPaymentDueDraft("0");
    else if (status === "Unpaid") setPaymentDueDraft(String(selected?.total ?? 0));
    else {
      const due = Number(paymentDueDraft);
      const total = selected?.total ?? 0;
      if (!(due > 0 && due < total)) setPaymentDueDraft(String(Number((total / 2).toFixed(2))));
    }
  };

  const updatePayment = async () => {
    if (!selected) return;
    setSavingPayment(true);
    try {
      const response = await apiFetch(`orders/${encodeURIComponent(selected.id)}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: paymentStatusDraft.toLowerCase(), dueAmount: Number(paymentDueDraft) }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.message || "Unable to update payment");
      const payment = payload.data;
      const patch = {
        paymentStatus: payment.paymentStatus as PaymentStatus,
        receivedAmount: Number(payment.receivedAmount) || 0,
        dueAmount: Number(payment.dueAmount) || 0,
      };
      setOrders((current) => current.map((order) => order.id === selected.id ? { ...order, ...patch } : order));
      setSelected((current) => current?.id === selected.id ? { ...current, ...patch } : current);
      toast.success(`Payment updated for order ${selected.id}`);
    } catch (error) {
      toast.error("Payment update failed", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSavingPayment(false);
    }
  };

  function normalizeOrder(raw: any): Order {
    const items = Array.isArray(raw.cart_snapshot) ? raw.cart_snapshot : [];
    const status = String(raw.status || "pending").toLowerCase();
    const displayStatus: OrderStatus = status === "cancelled"
      ? "Cancelled"
      : status === "approved" || status === "confirmed"
        ? "Confirmed"
        : status === "processing"
          ? "Processing"
          : status === "out_for_delivery"
            ? "Out for Delivery"
            : status === "delivered" || status === "completed"
              ? "Delivered"
              : "New";
    const paymentStatusValue = String(raw.payment_status || "unpaid").toLowerCase();
    const paymentStatus: PaymentStatus = paymentStatusValue === "paid" ? "Paid" : paymentStatusValue === "partial" ? "Partial" : "Unpaid";
    const total = Number(raw.total_amount ?? raw.total ?? 0);
    return { id: raw.id, customer: raw.customer_name || raw.customer || "Customer", mobile: raw.customer_phone || raw.mobile || "", address: raw.customer_address || raw.address || "", pincode: raw.pincode || "", placedAt: raw.created_at || raw.order_date || "", total, subtotal: Number(raw.subtotal_amount ?? 0), discountAmount: Number(raw.discount_amount ?? 0), deliveryFee: Number(raw.delivery_fee ?? 0), couponCode: raw.coupon_code || null, paymentStatus, receivedAmount: Number(raw.received_amount ?? 0), dueAmount: Number(raw.balance_amount ?? total), itemCount: items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0), source: "WhatsApp", status: displayStatus, items: items.map((item: any) => ({ name: item.name || item.productName || item.product_id, variant: item.variant || item.label || item.variantId, quantity: Number(item.quantity || 0), unitPrice: Number(item.price || item.unitPrice || 0) })) };
  }

  return (
    <AdminShell title="Orders" subtitle="Review customer details and move orders through fulfilment."
                action={<Button variant="outline" className="h-11 rounded-full bg-white font-black"><Download className="size-4" /> Export CSV</Button>}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          <div className="rounded-[1.5rem] bg-white p-4 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04] sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <label className="relative">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 rounded-xl bg-[#F7F4F1] pl-10"
                  placeholder="Search order ID, customer or mobile" />
              </label>
              <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
                {(["All", "New", "Confirmed", "Processing", "Delivered"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilter(status)}
                    className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-black transition ${filter === status ? "bg-[#17110F] text-white" : "bg-[#F7F4F1] text-[#655955]"}`}
                  >
                    {status === "New" ? "Pending" : status === "Confirmed" ? "Confirmed (Approved)" : status}
                  </button>
                ))}
                <button
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F7F4F1]"
                >
                  <Filter className="size-4" />
                </button>
              </div>
            </div>
            <div className="mt-5 space-y-3 md:hidden">
              {visible.map((order) => (
                <article key={order.id} className="rounded-2xl bg-[#FBF9F6] p-4 ring-1 ring-black/5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{order.id}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{order.placedAt}</p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-black/5 pt-4">
                    <div>
                      <p className="text-sm font-bold">{order.customer}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{order.itemCount} item{order.itemCount > 1 ? "s" : ""} · {order.source}</p>
                      <p className="mt-2 text-lg font-black">₹{order.total.toLocaleString("en-IN")}</p>
                      <p className="mt-1 text-xs font-bold text-muted-foreground">Payment · {order.paymentStatus || "Unpaid"}</p>
                    </div>
                    <Button
                      onClick={() => setSelected(order)}
                      className="rounded-full bg-[#17110F] px-4 text-xs font-black text-white"
                    >
                      Review
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-5 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px] text-left">
                <thead>
                  <tr className="border-y border-black/5 bg-[#FBF9F6] text-[0.65rem] font-black uppercase tracking-[0.13em] text-muted-foreground">
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((order) => (
                    <tr key={order.id} className="border-b border-black/5 transition hover:bg-[#FCFAF7]">
                      <td className="px-4 py-4">
                        <p className="font-black">{order.id}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="mt-1 text-xs text-muted-foreground">{order.placedAt}</p>
                      </td>
                      <td className="px-4 py-4 text-sm font-bold">{order.itemCount}</td>
                      <td className="px-4 py-4 text-xs font-bold text-muted-foreground">{order.source}</td>
                      <td className="px-4 py-4 text-sm font-black">₹{order.total.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-black ${order.paymentStatus === "Paid" ? "bg-[#EEF6F0] text-[#267345]" : order.paymentStatus === "Partial" ? "bg-[#FFF7E8] text-[#8A5B13]" : "bg-[#F8E7E6] text-[#8E2028]"}`}>{order.paymentStatus || "Unpaid"}</span></td>
                      <td className="px-4 py-4"><OrderStatusBadge status={order.status} /></td>
                      <td className="px-4 py-4">
                        <Button
                          onClick={() => setSelected(order)}
                          variant="ghost"
                          className="rounded-full text-xs font-black text-[#B4232C]"
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!visible.length && (
              <div className="py-16 text-center">
                <Search className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-3 font-black">No matching orders</p>
              </div>
            )}
          </div>
          {selected && (
            <div className="fixed inset-0 z-[70]">
              <button
                className="absolute inset-0 bg-black/45 backdrop-blur-sm"
                onClick={() => setSelected(null)}
                aria-label="Close order"
              />
              <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-[#FFFDF9] p-5 shadow-2xl sm:p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#B4232C]">Order details</p>
                    <h2 className="mt-2 font-display text-3xl font-black">{selected.id}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{selected.placedAt}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full bg-white"
                    onClick={() => setSelected(null)}
                  >
                    <X className="size-5" />
                  </Button>
                </div>
                <div className="mt-7 rounded-[1.25rem] bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-center gap-3">
                    <div className="grid size-11 place-items-center rounded-full bg-[#F8E7E6] font-black text-[#B4232C]">
                      {selected.customer.split(" ").map((part) => part[0]).join("")}
                    </div>
                    <div>
                      <p className="font-bold">{selected.customer}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{selected.mobile}</p>
                    </div>
                  </div>
                  <p className="mt-5 flex gap-2 text-sm leading-6 text-muted-foreground">
                    <MapPin className="mt-1 size-4 shrink-0 text-[#267345]" />
                    {selected.address} · {selected.pincode}
                  </p>
                  <div className="mt-5 flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-full bg-white text-xs font-black"
                    >
                      <Phone className="size-4" /> Call
                    </Button>
                    <Button
                      className="flex-1 rounded-full bg-[#1F8D4D] text-xs font-black text-white hover:bg-[#18743E]"
                      onClick={() => {
                        const digits = selected.mobile.replace(/\D/g, "");
                        if (!digits) return toast.error("No customer mobile number is available.");
                        const recipient = digits.length === 10 ? `91${digits}` : digits;
                        const message = `Hello ${selected.customer}, I’m following up about your RedVeg order ${selected.id} for ₹${selected.total.toLocaleString("en-IN")}. Please message us once payment is complete so we can confirm your order.`;
                        window.open(`https://wa.me/${recipient}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <MessageCircle className="size-4" /> WhatsApp
                    </Button>
                  </div>
                </div>
                <div className="mt-5 rounded-[1.25rem] bg-white p-5 ring-1 ring-black/5">
                  <h3 className="font-black">Items</h3>
                  <div className="mt-4 space-y-4">
                    {selected.items.map((item, index) => (
                      <div
                        key={`${item.name}-${index}`}
                        className="flex justify-between gap-4 border-b border-black/5 pb-4 last:border-0 last:pb-0"
                      >
                        <div>
                          <p className="text-sm font-bold">{item.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{item.variant} × {item.quantity}</p>
                        </div>
                        <p className="text-sm font-black">₹{item.unitPrice * item.quantity}</p>
                      </div>
                    ))}
                  </div>
                  {(selected.subtotal ?? 0) > 0 && <div className="mb-4 space-y-2 border-t border-black/5 pt-4 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{(selected.subtotal ?? 0).toLocaleString("en-IN")}</span></div>{selected.couponCode && (selected.discountAmount ?? 0) > 0 && <div className="flex justify-between font-bold text-[#267345]"><span>Coupon · {selected.couponCode}</span><span>−₹{(selected.discountAmount ?? 0).toLocaleString("en-IN")}</span></div>}<div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{selected.deliveryFee ? `₹${selected.deliveryFee.toLocaleString("en-IN")}` : "FREE"}</span></div></div>}
                  <div className="mt-5 flex justify-between border-t border-black/10 pt-4 text-lg font-black">
                    <span>Total</span>
                    <span>₹{selected.total.toLocaleString("en-IN")}</span>
                  </div>
                </div>
                <div className="mt-5 rounded-[1.25rem] bg-white p-5 ring-1 ring-black/5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-black">Payment</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Track receipt for this order. Cleared amount is calculated from the order total minus due.</p></div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${selected.paymentStatus === "Paid" ? "bg-[#EEF6F0] text-[#267345]" : selected.paymentStatus === "Partial" ? "bg-[#FFF7E8] text-[#8A5B13]" : "bg-[#F8E7E6] text-[#8E2028]"}`}>{selected.paymentStatus || "Unpaid"}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-[#FBF9F6] p-3"><p className="text-xs text-muted-foreground">Order total</p><p className="mt-1 font-black">₹{selected.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>
                    <div className="rounded-xl bg-[#EEF6F0] p-3"><p className="text-xs text-muted-foreground">Cleared</p><p className="mt-1 font-black text-[#267345]">₹{(selected.receivedAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
                    <label className="text-xs font-bold">Payment status<select value={paymentStatusDraft} onChange={(event) => changePaymentStatus(event.target.value as PaymentStatus)} className="mt-1 h-11 w-full rounded-xl border border-black/10 bg-[#F7F4F1] px-3 text-sm outline-none"><option value="Paid">Paid</option><option value="Partial">Partial</option><option value="Unpaid">Unpaid</option></select></label>
                    <label className="text-xs font-bold">Remaining due (₹)<input type="number" min="0" max={selected.total} step="0.01" disabled={paymentStatusDraft !== "Partial"} value={paymentDueDraft} onChange={(event) => setPaymentDueDraft(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-black/10 bg-[#F7F4F1] px-3 text-sm outline-none disabled:bg-[#EFEAE5]" /></label>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Due: ₹{(Number(paymentDueDraft) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  <Button disabled={savingPayment || selected.status === "Cancelled"} onClick={() => void updatePayment()} className="mt-4 h-11 w-full rounded-full bg-[#17110F] font-black text-white">{savingPayment ? "Saving payment…" : "Save payment"}</Button>
                  {selected.status === "Cancelled" && <p className="mt-2 text-xs text-muted-foreground">Cancelled orders cannot be updated for payment.</p>}
                </div>
                <div className="mt-5 rounded-[1.25rem] bg-white p-5 ring-1 ring-black/5">
                  <h3 className="font-black">Order status</h3>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Contact the customer before confirming, then move the order through each fulfilment stage.
                  </p>
                  {selected.status === "New" && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <Button
                        onClick={() => updateStatus(selected.id, "Cancelled")}
                        variant="outline"
                        className="h-11 rounded-full bg-white font-black text-[#B4232C]"
                      >
                        Cancel order
                      </Button>
                      <Button
                        onClick={() => updateStatus(selected.id, "Confirmed")}
                        className="h-11 rounded-full bg-[#267345] font-black text-white hover:bg-[#1F6239]"
                      >
                        Confirm order
                      </Button>
                    </div>
                  )}
                  <div className="relative mt-4">
                    <select
                      value={selected.status}
                      onChange={(event) => updateStatus(selected.id, event.target.value as OrderStatus)}
                      className="h-12 w-full appearance-none rounded-xl border border-black/10 bg-[#F7F4F1] px-4 pr-10 text-sm font-bold outline-none"
                    >
                      {statuses
                        .filter((status) => status === selected.status || nextStatuses[selected.status].includes(status))
                        .map((status) => (
                        <option key={status} value={status}>
                          {status === "New" ? "Pending" : status === "Confirmed" ? "Confirmed (Approved)" : status}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2" />
                  </div>
                  <div className="mt-4">
                    <OrderStatusBadge status={selected.status} />
                  </div>
                </div>
              </aside>
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}

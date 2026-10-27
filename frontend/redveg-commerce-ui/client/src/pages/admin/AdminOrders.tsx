import { AdminShell } from "@/components/admin/AdminShell";
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Order, OrderStatus } from "@/types/commerce";
import { ChevronDown, Download, MapPin, MessageCircle, Phone, ReceiptText, Search, X, Plus, Minus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { formatISTDateTime, getISTDateInputValue } from "@/lib/dateTime";

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
  const initialStatusFilter = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("status") === "pending" ? "New" : "All";
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersRefreshVersion, setOrdersRefreshVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | OrderStatus>(initialStatusFilter);
  const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedOrders = useRef(false);
  const [paymentStatusDraft, setPaymentStatusDraft] = useState<PaymentStatus>("Unpaid");
  const [paymentReceivedDraft, setPaymentReceivedDraft] = useState("0");
  const [savingPayment, setSavingPayment] = useState(false);
  const [editingItems, setEditingItems] = useState(false);
  const [itemDraft, setItemDraft] = useState<Order["items"]>([]);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addVariantId, setAddVariantId] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const [reviewingCancellation, setReviewingCancellation] = useState(false);
  const [cancellationReviewNote, setCancellationReviewNote] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setOrdersRefreshVersion(version => version + 1), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        if (!hasLoadedOrders.current) setLoading(true);
        const params = new URLSearchParams({ limit: search.trim() ? "100" : "50", offset: "0" });
        if (search.trim()) params.set("q", search.trim());
        const response = await apiFetch(`orders?${params.toString()}`, {}, { forceBackend: true });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const payload = await response.json();
        const rows = payload.data || payload;
        const normalizedOrders = Array.isArray(rows) ? rows.map(normalizeOrder) : [];
        if (cancelled) return;
        setOrders(normalizedOrders);
        setSelected(current => current ? normalizedOrders.find(order => order.id === current.id) ?? current : current);
        const requestedOrderId = !search.trim() && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("order") : null;
        if (requestedOrderId && !selected) {
          setSelected(normalizedOrders.find((order) => order.id === requestedOrderId) ?? null);
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching orders:", error);
        toast.error("Failed to load orders");
      } finally {
        if (!cancelled) {
          hasLoadedOrders.current = true;
          setLoading(false);
        }
      }
    }, search.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, ordersRefreshVersion]);

  useEffect(() => {
    if (!selected) return;
    setPaymentStatusDraft(selected.paymentStatus || "Unpaid");
    setPaymentReceivedDraft(String(selected.receivedAmount ?? 0));
  }, [selected?.id, selected?.paymentStatus, selected?.receivedAmount, selected?.total]);

  useEffect(() => {
    setEditingItems(false);
    setItemDraft(selected?.items.map(item => ({ ...item })) || []);
  }, [selected?.id]);

  useEffect(() => {
    if (!editingItems || catalogProducts.length) return;
    let cancelled = false;
    setCatalogLoading(true);
    apiFetch("admin/products?limit=100&offset=0", {}, { forceBackend: true })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load products");
        const payload = await response.json();
        const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];
        if (!cancelled) setCatalogProducts(rows);
      })
      .catch(error => toast.error(error.message || "Could not load products"))
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [editingItems, catalogProducts.length]);

  const visible = useMemo(() =>
    orders.filter((order) =>
      filter === "All" || order.status === filter
    ),
    [filter, orders]
  );

  const exportOrders = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format: 'csv', limit: '10000', offset: '0' });
      if (search.trim()) params.set('q', search.trim());
      const statusesByFilter: Partial<Record<OrderStatus, string>> = {
        New: 'pending,new',
        Confirmed: 'approved,confirmed',
        Processing: 'processing',
        'Out for Delivery': 'out_for_delivery',
        Delivered: 'delivered,completed',
        Cancelled: 'cancelled',
      };
      if (filter !== 'All') params.set('status', statusesByFilter[filter] || filter.toLowerCase());

      const response = await apiFetch(`orders?${params.toString()}`, {}, { forceBackend: true });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || `Export failed (HTTP ${response.status})`);
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('The server returned an empty export.');
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `redveg-orders-${getISTDateInputValue()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success('Orders exported to CSV');
    } catch (error) {
      toast.error('CSV export failed', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setExporting(false);
    }
  };

  const updateStatus = async (id: string, status: OrderStatus) => {
    const currentStatus = orders.find((order) => order.id === id)?.status;
    if (status === currentStatus) return;

    const orderId = encodeURIComponent(id);
    const endpoint = status === "Cancelled"
      ? `orders/${orderId}/cancel`
      : status === "Confirmed"
        ? `orders/${orderId}/approve`
        : `orders/${orderId}/status`;
    try {
      const response = await apiFetch(endpoint, {
        method: "PATCH",
        ...(status !== "Cancelled" && status !== "Confirmed"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: status.toLowerCase().replace(/ /g, "_") }) }
          : {}),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.message || "Unable to update order");
      const receiptPatch = payload.data?.receiptNumber
        ? {
            receiptNumber: payload.data.receiptNumber,
            receiptIssuedAt: payload.data.receiptIssuedAt || null,
          }
        : {};
      setOrders((current) => current.map((order) => order.id === id ? { ...order, status, ...receiptPatch } : order));
      setSelected((current) => current?.id === id ? { ...current, status, ...receiptPatch } : current);
      toast.success(`Order ${id} moved to ${status}`);
    } catch (error: any) {
      toast.error("Order update failed", { description: error.message });
    }
  };

  const changePaymentStatus = (status: PaymentStatus) => {
    setPaymentStatusDraft(status);
    if (status === "Paid") setPaymentReceivedDraft(String(selected?.total ?? 0));
    else if (status === "Unpaid") setPaymentReceivedDraft("0");
    else {
      const received = Number(paymentReceivedDraft);
      const total = selected?.total ?? 0;
      if (!(received > 0 && received < total)) setPaymentReceivedDraft(String(Number((total / 2).toFixed(2))));
    }
  };

  const updatePayment = async () => {
    if (!selected) return;
    const receivedAmount = Number(paymentReceivedDraft);
    if (!Number.isFinite(receivedAmount) || receivedAmount < 0 || receivedAmount > selected.total ||
      (paymentStatusDraft === "Partial" && !(receivedAmount > 0 && receivedAmount < selected.total))) {
      toast.error("Enter an amount paid that is valid for this payment status.");
      return;
    }
    setSavingPayment(true);
    try {
      const response = await apiFetch(`orders/${encodeURIComponent(selected.id)}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: paymentStatusDraft.toLowerCase(), receivedAmount }),
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

  const reviewCancellation = async (action: "approve" | "decline") => {
    if (!selected || selected.cancellationStatus !== "requested") return;
    if (action === "approve" && !window.confirm(`Approve cancellation for ${selected.id}? The order will be cancelled and its reserved stock restored.`)) return;
    setReviewingCancellation(true);
    try {
      const response = await apiFetch(`orders/${encodeURIComponent(selected.id)}/cancellation-review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: cancellationReviewNote.trim() }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.message || "Unable to review cancellation request");
      const data = payload.data;
      const patch = {
        status: data.status === "cancelled" ? "Cancelled" as const : selected.status,
        cancellationStatus: data.cancellationStatus as Order["cancellationStatus"],
        cancellationReviewNote: data.reviewNote || null,
      };
      setOrders(current => current.map(order => order.id === selected.id ? { ...order, ...patch } : order));
      setSelected(current => current?.id === selected.id ? { ...current, ...patch } : current);
      setCancellationReviewNote("");
      toast.success(action === "approve" ? `Order ${selected.id} cancelled and inventory restored` : `Cancellation request for ${selected.id} declined`);
    } catch (error) {
      toast.error("Cancellation review failed", { description: error instanceof Error ? error.message : "Please refresh and try again." });
    } finally {
      setReviewingCancellation(false);
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
    return { id: raw.id, customer: raw.customer_name || raw.customer || "Customer", mobile: raw.customer_phone || raw.mobile || "", address: raw.customer_address || raw.address || "", pincode: raw.pincode || "", placedAt: raw.created_at || raw.order_date || "", total, subtotal: Number(raw.subtotal_amount ?? 0), discountAmount: Number(raw.discount_amount ?? 0), deliveryFee: Number(raw.delivery_fee ?? 0), deliveryDistanceKm: Number(raw.delivery_distance_km ?? 0), deliveryRatePerKm: Number(raw.delivery_rate_per_km ?? 10), deliverySlotName: raw.delivery_slot_name || null, deliverySlotTime: raw.delivery_slot_time || null, couponCode: raw.coupon_code || null, receiptNumber: raw.receipt_number || null, receiptIssuedAt: raw.receipt_issued_at || null, cancellationStatus: raw.cancellation_status || "none", cancellationRequestedAt: raw.cancellation_requested_at || null, cancellationMessage: raw.cancellation_message || null, cancellationReviewNote: raw.cancellation_review_note || null, paymentStatus, receivedAmount: Number(raw.received_amount ?? 0), dueAmount: Number(raw.balance_amount ?? total), itemCount: items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0), source: raw.order_source === "Admin Manual" ? "Admin Manual" : "WhatsApp", paymentMethod: raw.payment_method || null, customerNotes: raw.customer_notes || null, status: displayStatus, items: items.map((item: any) => ({ productId: item.productId || item.product_id, variantId: item.variantId || item.variant_id, name: item.name || item.productName || item.product_id, variant: item.variant || [item.size, item.weight, item.piece_size].filter(Boolean).join(" / ") || item.label || item.variantId, quantity: Number(item.quantity || 0), unitPrice: Number(item.price || item.unitPrice || 0) })) };
  }

  const availableAddVariants = (catalogProducts.find(product => product.id === addProductId && product.isActive)?.variants || []).filter((variant: any) => variant.isAvailable && Number(variant.stock ?? variant.stockCount ?? variant.stock_count ?? 0) > 0);

  const startEditingItems = () => {
    setItemDraft(selected?.items.map(item => ({ ...item })) || []);
    setEditingItems(true);
  };

  const addCatalogItem = () => {
    const product = catalogProducts.find(row => row.id === addProductId);
    const variant = product?.variants?.find((row: any) => row.id === addVariantId);
    if (!product || !variant) return toast.error("Choose an available product variant first.");
    setItemDraft(current => {
      const existingIndex = current.findIndex(item => item.productId === product.id && item.variantId === variant.id);
      if (existingIndex >= 0) return current.map((item, index) => index === existingIndex ? { ...item, quantity: item.quantity + addQuantity } : item);
      return [...current, { productId: product.id, variantId: variant.id, name: product.name, variant: variant.label || variant.size || variant.weight || variant.sku || "Variant", quantity: addQuantity, unitPrice: Number(variant.price) || 0 }];
    });
    setAddProductId("");
    setAddVariantId("");
    setAddQuantity(1);
  };

  const saveOrderItems = async () => {
    if (!selected) return;
    const invalidItem = itemDraft.find(item => !item.productId || !item.variantId || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99);
    if (invalidItem) return toast.error("Each item needs a valid variant and quantity from 1 to 99.");
    if (!itemDraft.length) return toast.error("An order must contain at least one item.");
    setSavingItems(true);
    try {
      const response = await apiFetch(`orders/${encodeURIComponent(selected.id)}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemDraft.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })) }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.message || "Unable to save order items");
      const data = payload.data;
      const items = data.items.map((item: any) => ({ productId: item.productId, variantId: item.variantId, name: item.name, variant: [item.size, item.weight].filter(Boolean).join(" / ") || item.sku || "", quantity: Number(item.quantity), unitPrice: Number(item.price) }));
      const patch = { items, itemCount: items.reduce((sum: number, item: any) => sum + item.quantity, 0), subtotal: Number(data.subtotalAmount), discountAmount: Number(data.discountAmount), deliveryFee: Number(data.deliveryFee), total: Number(data.totalAmount), paymentStatus: data.paymentStatus as PaymentStatus, receivedAmount: Number(data.receivedAmount), dueAmount: Number(data.dueAmount) };
      setOrders(current => current.map(order => order.id === selected.id ? { ...order, ...patch } : order));
      setSelected(current => current?.id === selected.id ? { ...current, ...patch } : current);
      setItemDraft(items);
      setEditingItems(false);
      toast.success(`Order ${selected.id} items were saved`);
    } catch (error) {
      toast.error("Order edit failed", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSavingItems(false);
    }
  };

  return (
    <AdminShell title="Orders" subtitle="Review customer details and move orders through fulfilment."
                action={<Button variant="outline" className="h-11 rounded-full bg-white font-black" onClick={exportOrders} disabled={exporting}><Download className="size-4" /> {exporting ? 'Exporting…' : 'Export CSV'}</Button>}>
      {loading && !hasLoadedOrders.current ? (
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
                {(["All", ...statuses] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilter(status)}
                    className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-black transition ${filter === status ? "bg-[#17110F] text-white" : "bg-[#F7F4F1] text-[#655955]"}`}
                  >
                    {status === "New" ? "Pending" : status === "Confirmed" ? "Confirmed (Approved)" : status}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 space-y-3 md:hidden">
              {visible.map((order) => (
                <article key={order.id} className="rounded-2xl bg-[#FBF9F6] p-4 ring-1 ring-black/5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{order.id}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatISTDateTime(order.placedAt)}</p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  {order.cancellationStatus === "requested" && <span className="mt-2 inline-flex rounded-full bg-[#FFF1D7] px-2.5 py-1 text-[0.65rem] font-black text-[#76521D]">Cancellation requested</span>}
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
                        <p className="mt-1 text-xs text-muted-foreground">{formatISTDateTime(order.placedAt)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-bold">{order.customer || "Customer"}</p>
                      </td>
                      <td className="px-4 py-4 text-sm font-bold">{order.itemCount}</td>
                      <td className="px-4 py-4 text-xs font-bold text-muted-foreground">{order.source}</td>
                      <td className="px-4 py-4 text-sm font-black">₹{order.total.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-black ${order.paymentStatus === "Paid" ? "bg-[#EEF6F0] text-[#267345]" : order.paymentStatus === "Partial" ? "bg-[#FFF7E8] text-[#8A5B13]" : "bg-[#F8E7E6] text-[#8E2028]"}`}>{order.paymentStatus || "Unpaid"}</span></td>
                      <td className="px-4 py-4"><OrderStatusBadge status={order.status} />{order.cancellationStatus === "requested" && <span className="mt-2 block w-fit rounded-full bg-[#FFF1D7] px-2 py-1 text-[0.6rem] font-black text-[#76521D]">Cancellation requested</span>}</td>
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
                    <p className="mt-1 text-sm text-muted-foreground">{formatISTDateTime(selected.placedAt)}</p>
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
                  {selected.paymentMethod && <p className="mt-3 text-xs text-muted-foreground">Payment method: <strong className="capitalize text-foreground">{selected.paymentMethod.toLowerCase() === "online" ? (String(selected.paymentStatus || "").toLowerCase() === "paid" ? "Razorpay · automatically confirmed" : "Razorpay · awaiting confirmation") : selected.paymentMethod.replace(/_/g, " ")}</strong></p>}
                  {selected.customerNotes && <div className="mt-3 rounded-xl bg-[#FFF7E8] p-3 text-xs leading-5 text-[#76521D]"><strong>Order note:</strong> {selected.customerNotes}</div>}
                  <div className="mt-5 flex gap-2">
                    <Button asChild variant="outline" className="flex-1 rounded-full bg-white text-xs font-black">
                      <a href={`tel:${selected.mobile.replace(/[^\d+]/g, "")}`}>
                        <Phone className="size-4" /> Call
                      </a>
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
                  {selected.receiptNumber ? (
                    <div className="mt-5 rounded-xl bg-[#F3F7F0] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-black text-[#245A35]">
                            Receipt attached to customer
                          </h3>
                          <p className="mt-1 text-xs text-[#45634C]">
                            {selected.receiptNumber} · issued {formatISTDateTime(selected.receiptIssuedAt || selected.placedAt)}
                          </p>
                        </div>
                        <ReceiptText className="size-4 shrink-0 text-[#267345]" />
                      </div>
                      <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-white/80 p-3 font-mono text-[0.68rem] leading-5 text-[#3B2C26]">
{[
  "REDVEG CUSTOMER RECEIPT",
  `Receipt: ${selected.receiptNumber}`,
  `Order: ${selected.id}`,
  `Customer: ${selected.customer}`,
  `Phone: ${selected.mobile || "—"}`,
  `Issued: ${formatISTDateTime(selected.receiptIssuedAt || selected.placedAt)}`,
  ...(selected.deliverySlotName ? [`Delivery slot: ${selected.deliverySlotName}${selected.deliverySlotTime ? ` · ${selected.deliverySlotTime}` : ""}`] : []),
  "Items:",
  ...selected.items.map(item => `• ${item.name}${item.variant ? ` (${item.variant})` : ""} × ${item.quantity} — ₹${(item.unitPrice * item.quantity).toFixed(2)}`),
  `Subtotal: ₹${Number(selected.subtotal || 0).toFixed(2)}`,
  ...(Number(selected.discountAmount || 0) > 0 ? [`Discount: −₹${Number(selected.discountAmount).toFixed(2)}`] : []),
  `Delivery: ${selected.deliveryDistanceKm ? `${selected.deliveryDistanceKm} km × ₹${selected.deliveryRatePerKm}/km = ₹${Number(selected.deliveryFee || 0).toFixed(2)}` : `₹${Number(selected.deliveryFee || 0).toFixed(2)}`}`,
  `Total: ₹${Number(selected.total).toFixed(2)}`,
  `Payment: ${selected.paymentStatus || "Unpaid"}`,
].join("\n")}
                      </pre>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl bg-[#FBF9F6] p-3 text-xs text-muted-foreground">
                      The customer receipt is issued here and in their profile after this order is approved.
                    </p>
                  )}
                </div>
                <div className="mt-5 rounded-[1.25rem] bg-white p-5 ring-1 ring-black/5">
                  <div className="flex items-center justify-between gap-3"><h3 className="font-black">Items</h3>{!editingItems && ["New", "Confirmed", "Processing"].includes(selected.status) && <Button variant="outline" className="h-9 rounded-full text-xs font-bold" onClick={startEditingItems}><Pencil className="mr-1.5 size-3.5" /> Edit order</Button>}</div>
                  {editingItems ? (
                    <div className="mt-4 space-y-4">
                      <p className="rounded-xl bg-[#FFF7E8] p-3 text-xs leading-5 text-[#76521D]">Changes are saved to the order database and customer receipt. Added quantities are checked against stock; removed quantities return to stock.</p>
                      <div className="space-y-3">{itemDraft.map((item, index) => <div key={`${item.productId}-${item.variantId}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl bg-[#FBF9F6] p-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.variant} · ₹{item.unitPrice.toLocaleString("en-IN")} each</p></div><div className="flex items-center gap-1"><button type="button" className="grid size-8 place-items-center rounded-full bg-white" aria-label="Decrease quantity" onClick={() => setItemDraft(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Math.max(1, line.quantity - 1) } : line))}><Minus className="size-3.5" /></button><span className="w-6 text-center text-sm font-black">{item.quantity}</span><button type="button" className="grid size-8 place-items-center rounded-full bg-white" aria-label="Increase quantity" onClick={() => setItemDraft(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line))}><Plus className="size-3.5" /></button><button type="button" className="ml-1 grid size-8 place-items-center rounded-full text-[#B4232C] hover:bg-red-50" aria-label={`Remove ${item.name}`} onClick={() => setItemDraft(current => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="size-4" /></button></div></div>)}</div>
                      <div className="rounded-xl border border-black/10 p-3">
                        <p className="text-xs font-black">Add a product</p>
                        {catalogLoading ? <p className="mt-2 text-xs text-muted-foreground">Loading products…</p> : <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <select value={addProductId} onChange={event => { setAddProductId(event.target.value); setAddVariantId(""); }} className="h-10 min-w-0 rounded-lg border border-black/10 bg-white px-2 text-xs"><option value="">Choose product</option>{catalogProducts.filter(product => product.isActive && product.variants?.some((variant: any) => variant.isAvailable && Number(variant.stock ?? variant.stockCount ?? variant.stock_count ?? 0) > 0)).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
                          <select value={addVariantId} onChange={event => setAddVariantId(event.target.value)} disabled={!addProductId} className="h-10 min-w-0 rounded-lg border border-black/10 bg-white px-2 text-xs disabled:opacity-50"><option value="">Choose variant</option>{availableAddVariants.map((variant: any) => <option key={variant.id} value={variant.id}>{variant.label || variant.sku} · ₹{Number(variant.price).toLocaleString("en-IN")} · {variant.stock ?? variant.stockCount ?? variant.stock_count} stock</option>)}</select>
                        </div>}
                        <div className="mt-2 flex gap-2"><Input type="number" min={1} max={99} value={addQuantity} onChange={event => setAddQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} className="h-10 w-20 rounded-lg" aria-label="Quantity to add" /><Button type="button" variant="outline" disabled={!addVariantId || catalogLoading} className="h-10 rounded-full text-xs font-bold" onClick={addCatalogItem}><Plus className="mr-1 size-3.5" /> Add item</Button></div>
                      </div>
                      <div className="flex gap-2"><Button variant="outline" className="h-10 flex-1 rounded-full" disabled={savingItems} onClick={() => { setEditingItems(false); setItemDraft(selected.items.map(item => ({ ...item }))); }}>Discard changes</Button><Button className="h-10 flex-1 rounded-full bg-[#267345] font-black text-white" disabled={savingItems || !itemDraft.length} onClick={() => void saveOrderItems()}>{savingItems ? "Saving to database…" : "Save order changes"}</Button></div>
                    </div>
                  ) : <div className="mt-4 space-y-4">
                    {selected.deliverySlotName && <div className="rounded-xl bg-[#EEF6F0] p-3"><p className="text-xs font-bold text-muted-foreground">Delivery slot</p><p className="mt-1 text-sm font-black text-[#267345]">{selected.deliverySlotName}{selected.deliverySlotTime ? ` · ${selected.deliverySlotTime}` : ""}</p></div>}
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
                  </div>}
                  {(selected.subtotal ?? 0) > 0 && <div className="mb-4 space-y-2 border-t border-black/5 pt-4 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{(selected.subtotal ?? 0).toLocaleString("en-IN")}</span></div>{selected.couponCode && (selected.discountAmount ?? 0) > 0 && <div className="flex justify-between font-bold text-[#267345]"><span>Coupon · {selected.couponCode}</span><span>−₹{(selected.discountAmount ?? 0).toLocaleString("en-IN")}</span></div>}<div className="flex justify-between"><span className="text-muted-foreground">Delivery{selected.deliveryDistanceKm ? ` · ${selected.deliveryDistanceKm} km × ₹${selected.deliveryRatePerKm}/km` : ""}</span><span>₹{(selected.deliveryFee ?? 0).toLocaleString("en-IN")}</span></div></div>}
                  <div className="mt-5 flex justify-between border-t border-black/10 pt-4 text-lg font-black">
                    <span>Total</span>
                    <span>₹{selected.total.toLocaleString("en-IN")}</span>
                  </div>
                </div>
                <div className="mt-5 rounded-[1.25rem] bg-white p-5 ring-1 ring-black/5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-black">Payment</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">For partial payments, enter the amount received. The remaining due is calculated and saved with the order.</p></div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${selected.paymentStatus === "Paid" ? "bg-[#EEF6F0] text-[#267345]" : selected.paymentStatus === "Partial" ? "bg-[#FFF7E8] text-[#8A5B13]" : "bg-[#F8E7E6] text-[#8E2028]"}`}>{selected.paymentStatus || "Unpaid"}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-[#FBF9F6] p-3"><p className="text-xs text-muted-foreground">Order total</p><p className="mt-1 font-black">₹{selected.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>
                    <div className="rounded-xl bg-[#EEF6F0] p-3"><p className="text-xs text-muted-foreground">Cleared</p><p className="mt-1 font-black text-[#267345]">₹{(selected.receivedAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
                    <label className="text-xs font-bold">Payment status<select value={paymentStatusDraft} onChange={(event) => changePaymentStatus(event.target.value as PaymentStatus)} className="mt-1 h-11 w-full rounded-xl border border-black/10 bg-[#F7F4F1] px-3 text-sm outline-none"><option value="Paid">Paid</option><option value="Partial">Partial</option><option value="Unpaid">Unpaid</option></select></label>
                    <label className="text-xs font-bold">Amount paid (₹)<input type="number" min="0" max={selected.total} step="0.01" disabled={paymentStatusDraft !== "Partial"} value={paymentReceivedDraft} onChange={(event) => setPaymentReceivedDraft(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-black/10 bg-[#F7F4F1] px-3 text-sm outline-none disabled:bg-[#EFEAE5]" /></label>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Remaining due: ₹{Math.max(0, selected.total - (Number(paymentReceivedDraft) || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })} — calculated from the order total.</p>
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
                {selected.cancellationStatus === "requested" && (
                  <div className="mt-5 rounded-[1.25rem] bg-[#FFF8EC] p-5 ring-1 ring-[#E8D4B3]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-black text-[#3B2C26]">Customer cancellation request</h3>
                        <p className="mt-1 text-xs text-[#76521D]">Received {formatISTDateTime(selected.cancellationRequestedAt, { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZoneName: "short" })}</p>
                      </div>
                      <MessageCircle className="size-5 text-[#8A5B13]" />
                    </div>
                    <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-white p-4 font-sans text-xs leading-5 text-[#3B2C26]">{selected.cancellationMessage || "The customer requested cancellation. No message was saved."}</pre>
                    <label className="mt-4 block text-xs font-bold text-[#51423C]">Review note (optional)<textarea value={cancellationReviewNote} onChange={event => setCancellationReviewNote(event.target.value)} maxLength={500} rows={2} placeholder="Add a short note for the customer record" className="mt-1 w-full resize-y rounded-xl border border-[#E4D5C8] bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#B4232C]" /></label>
                    <p className="mt-2 text-xs leading-5 text-[#76521D]">Approving cancels the order in the database, restores ordered variant stock, and releases its coupon use. Declining leaves the order active.</p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <Button variant="outline" disabled={reviewingCancellation} onClick={() => void reviewCancellation("decline")} className="h-11 rounded-full border-[#D9AAA5] bg-white font-black text-[#A82A2A]">{reviewingCancellation ? "Saving…" : "Decline request"}</Button>
                      <Button disabled={reviewingCancellation} onClick={() => void reviewCancellation("approve")} className="h-11 rounded-full bg-[#267345] font-black text-white hover:bg-[#1F6239]">{reviewingCancellation ? "Saving…" : "Approve cancellation"}</Button>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}

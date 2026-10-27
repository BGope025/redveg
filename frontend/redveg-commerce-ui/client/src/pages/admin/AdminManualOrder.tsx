import { AdminShell } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

type DirectoryCustomer = { id: string; source: string; name: string; phone: string; address?: string; locality?: string; pincode?: string };
type Product = { id: string; name: string; isActive?: boolean; variants?: Array<{ id: string; label?: string; size?: string; weight?: string; sku?: string; price: number; stock?: number; stockCount?: number; stock_count?: number; isAvailable?: boolean }> };
type Line = { productId: string; variantId: string; name: string; variantLabel: string; price: number; quantity: number; cuttingOption: string };
type Slot = { id: string; name: string; startTime: string; endTime: string };

export default function AdminManualOrder() {
  const [, setLocation] = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [customers, setCustomers] = useState<DirectoryCustomer[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<DirectoryCustomer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [locality, setLocality] = useState('');
  const [pincode, setPincode] = useState('');
  const [notes, setNotes] = useState('');
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [cuttingOption, setCuttingOption] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [deliverySlotId, setDeliverySlotId] = useState('');
  const [deliveryQuote, setDeliveryQuote] = useState<any>(null);
  const [deliveryError, setDeliveryError] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponQuote, setCouponQuote] = useState<{ code: string; discountAmount: number; totalAmount: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('unrecorded');
  const [paymentStatus, setPaymentStatus] = useState('unpaid');
  const [amountReceived, setAmountReceived] = useState('0');
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch('admin/products?limit=200&offset=0', {}, { forceBackend: true }).then(async response => { const payload = await response.json().catch(() => ({})); if (!response.ok || !payload.success) throw new Error(payload.message || 'Could not load products. Assign Catalog read access if needed.'); return Array.isArray(payload.data) ? payload.data : []; }),
      apiFetch('delivery-slots', {}, { forceBackend: true }).then(async response => { const payload = await response.json().catch(() => ({})); if (!response.ok || !payload.success) throw new Error(payload.message || 'Could not load delivery slots.'); return Array.isArray(payload.data) ? payload.data : []; }),
    ]).then(([productRows, slotRows]) => { if (active) { setProducts(productRows); setSlots(slotRows); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not prepare the order form.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setCustomers([]);
    setCustomerSearchError('');
    if (query.trim().length < 2 || selectedCustomer) { setSearchingCustomers(false); return; }
    const timer = window.setTimeout(() => {
      setSearchingCustomers(true);
      apiFetch(`orders/manual/customers?q=${encodeURIComponent(query.trim())}`, {}, { forceBackend: true })
        .then(async response => { const payload = await response.json().catch(() => ({})); if (!response.ok || !payload.success) throw new Error(payload.message || `Customer search failed (HTTP ${response.status}).`); if (active) setCustomers(Array.isArray(payload.data) ? payload.data : []); })
        .catch(cause => { if (active) setCustomerSearchError(cause instanceof Error ? cause.message : 'Customer search failed.'); })
        .finally(() => { if (active) setSearchingCustomers(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, selectedCustomer]);

  useEffect(() => {
    setVariantId('');
  }, [productId]);

  useEffect(() => {
    if (!/^\d{6}$/.test(pincode) || !locality.trim() || !addressLine.trim()) { setDeliveryQuote(null); setDeliveryError('Enter the delivery address, locality, and pincode for a delivery quote.'); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      apiFetch('delivery-fees/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destination: { addressLine, area: locality, pincode }, subtotalAmount: lines.reduce((sum, line) => sum + line.price * line.quantity, 0) }), signal: controller.signal }, { forceBackend: true })
        .then(async response => { const payload = await response.json().catch(() => ({})); if (!response.ok || !payload.success) throw new Error(payload.message || 'Delivery quote unavailable.'); if (!controller.signal.aborted) { setDeliveryQuote(payload.data); setDeliveryError(''); } })
        .catch(cause => { if (!controller.signal.aborted) { setDeliveryQuote(null); setDeliveryError(cause instanceof Error ? cause.message : 'Delivery quote unavailable.'); } });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [addressLine, locality, pincode, lines]);

  useEffect(() => {
    const code = couponCode.trim().toUpperCase();
    if (!code || !lines.length || !deliveryQuote) { setCouponQuote(null); setCouponError(''); setCouponLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCouponLoading(true); setCouponQuote(null); setCouponError('');
      apiFetch('coupons/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, cartItems: lines.map(line => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })), destination: { addressLine, area: locality, pincode } }),
        signal: controller.signal,
      }, { forceBackend: true }).then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.message || 'Coupon could not be applied.');
        if (!controller.signal.aborted) setCouponQuote({ code, discountAmount: Number(payload.data.discountAmount) || 0, totalAmount: Number(payload.data.totalAmount) || 0 });
      }).catch(cause => { if (!controller.signal.aborted) setCouponError(cause instanceof Error ? cause.message : 'Coupon could not be applied.'); })
        .finally(() => { if (!controller.signal.aborted) setCouponLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [couponCode, lines, deliveryQuote, addressLine, locality, pincode]);

  const selectedProduct = products.find(product => product.id === productId);
  const availableVariants = (selectedProduct?.variants || []).filter(variant => variant.isAvailable !== false && Number(variant.stock ?? variant.stockCount ?? variant.stock_count ?? 0) > 0);
  const selectedVariant = availableVariants.find(variant => variant.id === variantId);
  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.price * line.quantity, 0), [lines]);
  const deliveryFee = Number(deliveryQuote?.deliveryFee || 0);
  const couponIsCurrent = Boolean(couponQuote && couponQuote.code === couponCode.trim().toUpperCase());
  const discountAmount = couponIsCurrent ? couponQuote!.discountAmount : 0;
  const total = couponIsCurrent ? couponQuote!.totalAmount : subtotal + deliveryFee;

  const chooseCustomer = (customer: DirectoryCustomer) => {
    setSelectedCustomer(customer); setCustomers([]); setQuery(customer.name);
    setName(customer.name); setPhone(customer.phone);
    setAddressLine(customer.address || ''); setLocality(customer.locality || ''); setPincode(customer.pincode || '');
  };

  const addLine = () => {
    if (!selectedProduct || !selectedVariant) return toast.error('Choose an available product variant.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return toast.error('Quantity must be from 1 to 99.');
    setLines(current => [...current, { productId, variantId, name: selectedProduct.name, variantLabel: selectedVariant.label || selectedVariant.size || selectedVariant.weight || selectedVariant.sku || 'Variant', price: Number(selectedVariant.price) || 0, quantity, cuttingOption: cuttingOption.trim() }]);
    setProductId(''); setVariantId(''); setQuantity(1); setCuttingOption('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!lines.length) return toast.error('Add at least one product to this order.');
    if (!deliveryQuote || deliveryError) return toast.error('A valid delivery quote is required.', { description: deliveryError });
    if (couponCode.trim() && (!couponIsCurrent || couponLoading || couponError)) return toast.error('Wait for a valid coupon quote or remove the coupon.', { description: couponError || undefined });
    if (paymentStatus === 'paid' && !paymentVerified) return toast.error('Confirm the payment was received before marking this order as Paid.');
    setSaving(true);
    try {
      const response = await apiFetch('orders/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        customer: selectedCustomer ? { source: selectedCustomer.source, id: selectedCustomer.id, name, phone } : { source: 'new', name, phone },
        addressLine, locality, pincode, notes, deliverySlotId, couponCode: couponCode.trim(), paymentMethod, paymentStatus,
        amountReceived: paymentStatus === 'paid' ? total : paymentStatus === 'unpaid' ? 0 : Number(amountReceived),
        paymentVerified, items: lines.map(line => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity, cuttingOption: line.cuttingOption })),
      }) }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Could not save the order.');
      toast.success(`Manual order ${payload.data.id} saved to the order database.`);
      setLocation(`/admin/orders?order=${encodeURIComponent(payload.data.id)}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save the manual order.';
      setError(message); toast.error('Manual order failed', { description: message });
    } finally { setSaving(false); }
  };

  return <AdminShell title="Create manual order" subtitle="Create an order for a phone or walk-in customer. Catalog prices, stock, discounts, and delivery charges are confirmed by the backend.">
    {loading ? <p role="status" className="rounded-2xl bg-white p-8 text-sm text-muted-foreground">Loading live products and delivery slots…</p> : <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,.8fr)]">
      <div className="space-y-6">
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-black">Customer</h2>
          <label className="mt-4 block space-y-2 text-sm font-bold">Search by name or phone<Input value={query} onChange={event => { setQuery(event.target.value); setSelectedCustomer(null); }} placeholder="Type at least 2 characters" autoComplete="off" /></label>
          {searchingCustomers && <p className="mt-2 text-xs text-muted-foreground" role="status">Searching customers…</p>}
          {customerSearchError && <p className="mt-2 text-xs text-[#B4232C]" role="alert">{customerSearchError}</p>}
          {!searchingCustomers && !customerSearchError && query.trim().length >= 2 && !selectedCustomer && customers.length === 0 && <p className="mt-2 rounded-lg bg-[#FBF9F6] px-3 py-2 text-xs text-muted-foreground" role="status">No matching customers found. You can enter a new customer below.</p>}
          {customers.length > 0 && <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-black/10 bg-white shadow-lg">{customers.map(customer => <button type="button" key={`${customer.source}-${customer.id}`} onClick={() => chooseCustomer(customer)} className="block w-full border-b border-black/5 px-4 py-3 text-left last:border-0 hover:bg-[#FFF8F3]"><span className="block text-sm font-bold">{customer.name}</span><span className="text-xs text-muted-foreground">{customer.phone || 'Phone number needed'} · {customer.source.replace('_', ' ')}</span></button>)}</div>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold">Customer name<Input required readOnly={Boolean(selectedCustomer)} maxLength={160} value={name} onChange={event => setName(event.target.value)} /></label><label className="space-y-2 text-sm font-bold">Mobile number<Input required readOnly={Boolean(selectedCustomer?.phone)} inputMode="tel" maxLength={16} value={phone} onChange={event => setPhone(event.target.value)} /></label></div>
          {selectedCustomer && !selectedCustomer.phone && <p className="mt-2 text-xs text-[#76521D]">This directory record has no saved phone number. Enter the customer’s mobile number to continue.</p>}
          {selectedCustomer && <button type="button" className="mt-3 text-xs font-bold text-[#B4232C] underline" onClick={() => { setSelectedCustomer(null); setQuery(''); setName(''); setPhone(''); }}>Clear selection and enter a new customer</button>}
          {!selectedCustomer && <p className="mt-2 text-xs text-muted-foreground">If this is a new customer, the customer record will be added to the directory when the order is saved.</p>}
        </section>
        <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-black">Products & cutting</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold">Product<select value={productId} onChange={event => setProductId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select product</option>{products.filter(product => product.isActive !== false).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className="space-y-2 text-sm font-bold">Variant<select value={variantId} onChange={event => setVariantId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select available variant</option>{availableVariants.map(variant => <option key={variant.id} value={variant.id}>{variant.label || variant.size || variant.weight || variant.sku} · ₹{Number(variant.price).toLocaleString('en-IN')} · stock {variant.stock ?? variant.stockCount ?? variant.stock_count}</option>)}</select></label></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_150px_auto]"><label className="space-y-2 text-sm font-bold">Cutting option<Input maxLength={120} value={cuttingOption} onChange={event => setCuttingOption(event.target.value)} placeholder="Optional, e.g. curry cut" /></label><label className="space-y-2 text-sm font-bold">Quantity<Input required type="number" min="1" max="99" step="1" value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></label><Button type="button" onClick={addLine} className="self-end rounded-full bg-[#17110F]">Add item</Button></div>
          {!!lines.length && <div className="mt-5 divide-y divide-black/5 rounded-xl border border-black/5">{lines.map((line, index) => <div key={`${line.productId}-${line.variantId}-${index}`} className="flex items-center justify-between gap-3 p-3 text-sm"><div className="min-w-0"><p className="truncate font-bold">{line.name} · {line.variantLabel}</p><p className="text-xs text-muted-foreground">{line.quantity} × ₹{line.price.toLocaleString('en-IN')}{line.cuttingOption ? ` · ${line.cuttingOption}` : ''}</p></div><div className="flex items-center gap-3"><strong>₹{(line.price * line.quantity).toLocaleString('en-IN')}</strong><button type="button" onClick={() => setLines(current => current.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-bold text-[#B4232C]">Remove</button></div></div>)}</div>}
        </section>
        <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-black">Delivery</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold">House, street and building<Input required maxLength={300} value={addressLine} onChange={event => setAddressLine(event.target.value)} /></label><label className="space-y-2 text-sm font-bold">Locality<Input required maxLength={160} value={locality} onChange={event => setLocality(event.target.value)} /></label><label className="space-y-2 text-sm font-bold">Pincode<Input required inputMode="numeric" maxLength={6} value={pincode} onChange={event => setPincode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label><label className="space-y-2 text-sm font-bold">Delivery slot<select value={deliverySlotId} onChange={event => setDeliverySlotId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select later / not assigned</option>{slots.map(slot => <option key={slot.id} value={slot.id}>{slot.name} · {slot.startTime}–{slot.endTime}</option>)}</select></label></div>
          <label className="mt-4 block space-y-2 text-sm font-bold">Order notes / customer instructions<textarea maxLength={1000} rows={3} value={notes} onChange={event => setNotes(event.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" /></label>
          {deliveryQuote ? <p role="status" className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-900">Distance {deliveryQuote.distanceKm} km · ₹{Number(deliveryQuote.ratePerKm).toLocaleString('en-IN')}/km · delivery ₹{Number(deliveryQuote.deliveryFee).toLocaleString('en-IN')}</p> : <p role={deliveryError.startsWith('Enter') ? 'note' : 'alert'} className="mt-3 text-xs text-[#9D3A34]">{deliveryError}</p>}
        </section>
      </div>
      <aside className="h-fit space-y-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6 xl:sticky xl:top-5">
        <h2 className="font-black">Discount & payment</h2>
        <label className="block space-y-2 text-sm font-bold">Coupon code<input value={couponCode} onChange={event => setCouponCode(event.target.value.toUpperCase())} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" placeholder="Optional" /></label>
        {couponLoading && <p role="status" className="text-xs text-muted-foreground">Checking coupon against live rules…</p>}
        {couponIsCurrent && <p role="status" className="text-xs font-bold text-green-800">Coupon verified · ₹{discountAmount.toLocaleString('en-IN')} discount</p>}
        {couponError && <p role="alert" className="text-xs text-[#B4232C]">{couponError}</p>}
        <label className="block space-y-2 text-sm font-bold">Payment method<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="unrecorded">Not recorded</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
        <label className="block space-y-2 text-sm font-bold">Payment status<select value={paymentStatus} onChange={event => { const next = event.target.value; setPaymentStatus(next); if (next !== 'paid') setPaymentVerified(false); if (next === 'unpaid') setAmountReceived('0'); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid (verification required)</option></select></label>
        {paymentStatus === 'partial' && <label className="block space-y-2 text-sm font-bold">Amount received (₹)<Input required type="number" min="0.01" max={total} step="0.01" value={amountReceived} onChange={event => setAmountReceived(event.target.value)} /></label>}
        {paymentStatus === 'paid' && <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5"><input type="checkbox" checked={paymentVerified} onChange={event => setPaymentVerified(event.target.checked)} className="mt-1 accent-[#B4232C]" />I have independently verified that the full payment was received.</label>}
        <div className="space-y-2 border-t border-black/5 pt-4 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>₹{subtotal.toLocaleString('en-IN')}</span></div>{discountAmount > 0 && <div className="flex justify-between text-green-800"><span>Coupon discount</span><span>−₹{discountAmount.toLocaleString('en-IN')}</span></div>}<div className="flex justify-between"><span>Delivery charge</span><span>{deliveryQuote ? `₹${deliveryFee.toLocaleString('en-IN')}` : 'Pending quote'}</span></div><div className="flex justify-between border-t border-black/5 pt-3 text-base font-black"><span>Estimated total</span><span>₹{total.toLocaleString('en-IN')}</span></div><p className="text-[11px] leading-4 text-muted-foreground">The backend recalculates prices, coupon, delivery and final total before saving.</p></div>
        {paymentStatus === 'partial' && <p className="text-xs font-bold text-muted-foreground">Estimated balance due: ₹{Math.max(0, total - (Number(amountReceived) || 0)).toLocaleString('en-IN')}</p>}
        <Button type="submit" disabled={saving || loading || !lines.length || !deliveryQuote || couponLoading || Boolean(couponCode.trim() && !couponIsCurrent)} className="h-12 w-full rounded-full bg-[#B4232C] font-black text-white hover:bg-[#941D24]">{saving ? 'Saving order…' : 'Save manual order'}</Button>
      </aside>
    </form>}
  </AdminShell>;
}

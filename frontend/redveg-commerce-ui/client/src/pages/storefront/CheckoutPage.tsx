import { StoreShell } from "@/components/storefront/StoreShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation as useDeliveryLocation } from "@/contexts/LocationContext";
import { apiFetch } from "@/lib/api";
import { trackMetaEvent, trackMetaPurchase } from "@/lib/metaPixel";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

function money(value: number) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

const WHATSAPP_RECIPIENT = "918910558446";
const whatsappOrderUrl = (message: string) =>
  `https://wa.me/${WHATSAPP_RECIPIENT}?text=${encodeURIComponent(message)}`;

type SavedOrder = {
  id: string;
  total: number;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  deliveryDistanceKm: number;
  deliveryRatePerKm: number;
  couponCode: string | null;
  message: string;
  paymentMethod: "cash" | "online";
  razorpayCheckout?: { orderId: string; amount: number; currency: string; keyId: string } | null;
  paymentStatus?: "paid" | "unpaid";
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; contact: string };
  theme: { color: string };
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal: { ondismiss: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: "payment.failed", callback: (response: { error?: { description?: string } }) => void) => void;
    };
  }
}

type SavedAddress = {
  id: string;
  label: string;
  recipientName: string;
  phoneNumber: string;
  addressLine: string;
  locality: string;
  landmark: string;
  pincode: string;
};

type DeliverySlot = { id: string; name: string; startTime: string; endTime: string };

function formatSlotTime(value: string) {
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || !minute) return value;
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

const REQUIRED_FIELDS = ["name", "mobile", "address", "locality", "pincode"] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];

function isRequiredFieldValid(field: RequiredField, value: string) {
  switch (field) {
    case "name":
    case "address":
    case "locality":
      return Boolean(value.trim());
    case "mobile":
      return /^\d{10}$/.test(value.replace(/\D/g, ""));
    case "pincode":
      return /^\d{6}$/.test(value.trim());
  }
}

async function requestCustomerData<T>(path: string, token: string, init: RequestInit = {}) {
  const response = await apiFetch(path, init, { forceBackend: true, authToken: token });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.message || "Unable to load your saved details.");
  return payload.data as T;
}

export default function CheckoutPage() {
  const {
    user,
    isAuthenticated,
    loading: authLoading,
    getCustomerIdToken,
  } = useAuth();
  const { location } = useDeliveryLocation();
  const [, setLocation] = useLocation();
  const {
    items,
    resolvedItems,
    subtotal,
    deliveryFee,
    total,
    clearCart,
    couponCode,
    couponQuote,
    couponValidationLoading,
    couponValidationError,
    clearCoupon,
  } = useCart();
  const [checkoutDeliveryQuote, setCheckoutDeliveryQuote] = useState<{ distanceKm: number; ratePerKm: number; deliveryFee: number; originAddress: string; distanceMethod: string; locationPrecision: string; matchedDestinationAddress: string | null } | null>(null);
  const [checkoutDeliveryLoading, setCheckoutDeliveryLoading] = useState(false);
  const [checkoutDeliveryError, setCheckoutDeliveryError] = useState("");
  const [savedOrder, setSavedOrder] = useState<SavedOrder | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [onlinePaymentsAvailable, setOnlinePaymentsAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [deliverySlots, setDeliverySlots] = useState<DeliverySlot[]>([]);
  const [selectedDeliverySlotId, setSelectedDeliverySlotId] = useState("");
  const [deliverySlotsLoading, setDeliverySlotsLoading] = useState(true);
  const [deliverySlotsError, setDeliverySlotsError] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [invalidFields, setInvalidFields] = useState<RequiredField[]>([]);
  const editedFields = useRef(new Set<keyof typeof form>());
  const checkoutStarted = useRef(false);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    address: "",
    locality: "",
    pincode: "",
    landmark: "",
    paymentMethod: "cash",
    note: "",
  });

  useEffect(() => {
    let current = true;
    setOnlinePaymentsAvailable(false);
    if (!user?.uid) return () => { current = false; };
    void getCustomerIdToken()
      .then(token => token ? apiFetch('orders/online-payment-status', {}, { forceBackend: true, authToken: token }) : null)
      .then(response => response ? response.json() : null)
      .then(payload => { if (current) setOnlinePaymentsAvailable(payload?.success === true && payload?.data?.available === true); })
      .catch(() => { if (current) setOnlinePaymentsAvailable(false); });
    return () => { current = false; };
  }, [getCustomerIdToken, user?.uid]);

  useEffect(() => {
    if (checkoutStarted.current || !resolvedItems.length) return;
    checkoutStarted.current = true;
    trackMetaEvent("InitiateCheckout", {
      content_type: "product",
      content_ids: Array.from(new Set(resolvedItems.map(item => item.productId))),
      contents: resolvedItems.map(item => ({ id: item.productId, quantity: item.quantity, item_price: Number(item.variant.price) })),
      num_items: resolvedItems.reduce((sum, item) => sum + item.quantity, 0),
      value: Number(subtotal),
      currency: "INR",
    });
  }, [resolvedItems, subtotal]);
  const quoteIsCurrent = Boolean(
    couponQuote &&
    couponCode &&
    couponQuote.coupon.code.toUpperCase() === couponCode.toUpperCase()
  );
  const displaySubtotal = quoteIsCurrent
    ? couponQuote!.subtotalAmount
    : subtotal;
  const displayDiscount = quoteIsCurrent ? couponQuote!.discountAmount : 0;
  const displayDeliveryFee = checkoutDeliveryQuote?.deliveryFee ?? deliveryFee;
  const displayTotal = displaySubtotal - displayDiscount + displayDeliveryFee;
  const couponPending = Boolean(
    couponCode && (couponValidationLoading || !quoteIsCurrent)
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated)
      setLocation(`/login?returnTo=${encodeURIComponent("/checkout")}`);
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    let active = true;
    const loadCustomer = async () => {
      const token = await getCustomerIdToken();
      if (!token) return;
      try {
        const data = await requestCustomerData<{ profile: { displayName?: string | null; phoneNumber?: string | null } | null; addresses: SavedAddress[] }>("customers/me", token);
        if (!active) return;
        setSavedAddresses(data.addresses || []);
        const phone = data.profile?.phoneNumber || user?.phoneNumber || "";
        const digits = phone.replace(/\D/g, "");
        setForm(current => ({
          ...current,
          name: editedFields.current.has("name") ? current.name : (data.profile?.displayName || user?.displayName || current.name),
          mobile: editedFields.current.has("mobile") ? current.mobile : (digits.length > 10 ? digits.slice(-10) : digits || current.mobile),
        }));
      } catch (error) {
        console.warn("Could not load checkout profile details:", error);
      }
    };
    if (user?.uid) void loadCustomer();
    return () => { active = false; };
  }, [user?.uid, user?.displayName, user?.phoneNumber, getCustomerIdToken]);

  useEffect(() => {
    if (!location) return;
    setForm(current => ({
      ...current,
      locality: editedFields.current.has("locality") ? current.locality : (current.locality || location.area),
      pincode: editedFields.current.has("pincode") ? current.pincode : (current.pincode || location.pincode),
    }));
  }, [location]);

  useEffect(() => {
    let active = true;
    let requestPending = false;
    const refreshSlots = async () => {
      if (requestPending) return;
      requestPending = true;
      try {
        const response = await apiFetch("delivery-slots", {}, { forceBackend: true });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.message || "Could not load delivery slots.");
        const nextSlots = Array.isArray(payload.data) ? payload.data as DeliverySlot[] : [];
        if (!active) return;
        setDeliverySlots(nextSlots);
        setDeliverySlotsError("");
        setSelectedDeliverySlotId(current => {
          if (current && nextSlots.some(slot => slot.id === current)) return current;
          if (current) toast.error("That delivery slot is no longer available. Please choose another slot.");
          return "";
        });
      } catch (error) {
        if (active) setDeliverySlotsError(error instanceof Error ? error.message : "Could not load delivery slots.");
      } finally {
        requestPending = false;
        if (active) setDeliverySlotsLoading(false);
      }
    };
    void refreshSlots();
    const timer = window.setInterval(() => void refreshSlots(), 15000);
    const onFocus = () => void refreshSlots();
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  useEffect(() => {
    if (!/^\d{6}$/.test(form.pincode.trim()) || !form.locality.trim()) {
      setCheckoutDeliveryQuote(null);
      setCheckoutDeliveryLoading(false);
      setCheckoutDeliveryError("Enter your delivery locality and 6-digit pincode to calculate the fee.");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCheckoutDeliveryQuote(null);
      setCheckoutDeliveryLoading(true);
      setCheckoutDeliveryError("");
      const destination = {
        addressLine: form.address.trim(), landmark: form.landmark.trim(), area: form.locality.trim(), pincode: form.pincode.trim(),
        city: location?.city || "Kolkata", state: location?.state || "West Bengal",
        ...(location?.source === "geolocation" && location.latitude != null && location.longitude != null
          ? { latitude: location.latitude, longitude: location.longitude, source: "geolocation", accuracy: location.accuracy }
          : {}),
      };
      apiFetch("delivery-fees/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination, subtotalAmount: subtotal }), signal: controller.signal }, { forceBackend: true })
        .then(async response => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.success) throw new Error(payload.message || "Could not calculate the delivery fee.");
          setCheckoutDeliveryQuote({ distanceKm: Number(payload.data.distanceKm), ratePerKm: Number(payload.data.ratePerKm), deliveryFee: Number(payload.data.deliveryFee), originAddress: String(payload.data.originAddress || ""), distanceMethod: String(payload.data.distanceMethod || "road"), locationPrecision: String(payload.data.locationPrecision || ""), matchedDestinationAddress: payload.data.matchedDestinationAddress ? String(payload.data.matchedDestinationAddress) : null });
        })
        .catch(error => { if (!controller.signal.aborted) setCheckoutDeliveryError(error instanceof Error ? error.message : "Could not calculate the delivery fee."); })
        .finally(() => { if (!controller.signal.aborted) setCheckoutDeliveryLoading(false); });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [form.pincode, form.locality, form.address, form.landmark, location, subtotal]);

  useEffect(() => {
    setInvalidFields(current => {
      const remaining = current.filter(field => !isRequiredFieldValid(field, form[field]));
      return remaining.length === current.length ? current : remaining;
    });
  }, [form]);

  const update =
    (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      editedFields.current.add(field);
      setForm(current => ({ ...current, [field]: event.target.value }));
    };

  const chooseSavedAddress = (addressId: string) => {
    setSelectedAddressId(addressId);
    const address = savedAddresses.find(item => item.id === addressId);
    if (!address) return;
    setForm(current => ({
      ...current,
      name: address.recipientName,
      mobile: address.phoneNumber.replace(/\D/g, "").slice(-10),
      address: address.addressLine,
      locality: address.locality,
      pincode: address.pincode,
      landmark: address.landmark || "",
    }));
    ["name", "mobile", "address", "locality", "pincode", "landmark"].forEach(field => editedFields.current.add(field as keyof typeof form));
  };

  const startRazorpayCheckout = (order: SavedOrder, authToken: string) => {
    const checkout = order.razorpayCheckout;
    if (!checkout || !window.Razorpay) {
      setPaymentError("Secure checkout could not load. Refresh this page and try again.");
      toast.error("Razorpay checkout is unavailable. Please refresh and try again.");
      return;
    }
    setPaymentError("");
    const modal = new window.Razorpay({
      key: checkout.keyId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: "RedVeg",
      description: `Order ${order.id}`,
      order_id: checkout.orderId,
      prefill: { name: form.name.trim(), contact: form.mobile.replace(/\D/g, "") },
      theme: { color: "#B4232C" },
      handler: async (response) => {
        try {
          const verification = await apiFetch("orders/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: order.id, ...response }),
          }, { forceBackend: true, authToken });
          const payload = await verification.json().catch(() => null);
          if (!verification.ok || !payload?.success) throw new Error(payload?.message || "Payment could not be verified.");
          setSavedOrder(current => current?.id === order.id ? { ...current, paymentStatus: "paid" } : current);
          toast.success("Payment received and verified.");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Payment verification failed. Contact RedVeg before retrying.";
          setPaymentError(message);
          toast.error("Payment verification failed", { description: message });
        }
      },
      modal: { ondismiss: () => toast.info("Payment was cancelled. Your order is saved and you can retry checkout.") },
    });
    modal.on("payment.failed", (response) => {
      const message = response.error?.description || "The payment did not go through. Please try again.";
      setPaymentError(message);
      toast.error("Payment failed", { description: message });
    });
    modal.open();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resolvedItems.length) return toast.error("Your basket is empty.");
    const missingFields = REQUIRED_FIELDS.filter(field => !isRequiredFieldValid(field, form[field]));
    setInvalidFields(missingFields);
    if (missingFields.length) {
      toast.error("Please Fill up the Remaining Box");
      return;
    }
    if (couponPending) {
      toast.error("Check or remove the coupon before placing your order.", {
        description:
          couponValidationError ||
          "We’re verifying it against your current basket.",
      });
      return;
    }
    if (deliverySlotsLoading || deliverySlotsError || !deliverySlots.some(slot => slot.id === selectedDeliverySlotId)) {
      toast.error("Please choose an available delivery slot.", { description: deliverySlotsError || undefined });
      return;
    }
    if (checkoutDeliveryLoading || !checkoutDeliveryQuote || checkoutDeliveryError) {
      toast.error("Delivery fee is not ready yet", { description: checkoutDeliveryError || "Wait for the delivery distance to be calculated." });
      return;
    }

    setSubmitting(true);
    try {
      const authToken = await getCustomerIdToken();
      if (!authToken) {
        toast.error(
          "Your sign-in has expired. Please sign in again to place your order."
        );
        setLocation(`/login?returnTo=${encodeURIComponent("/checkout")}`);
        return;
      }
      const response = await apiFetch(
        "orders/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cartItems: items.map(item => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
            })),
            couponCode: quoteIsCurrent ? couponQuote!.coupon.code : undefined,
            deliverySlotId: selectedDeliverySlotId,
            paymentMethod: form.paymentMethod,
            deliveryDestination: {
              addressLine: form.address.trim(), landmark: form.landmark.trim(), area: form.locality.trim(), pincode: form.pincode.trim(),
              city: location?.city || "Kolkata", state: location?.state || "West Bengal",
              ...(location?.source === "geolocation" && location.latitude != null && location.longitude != null
                ? { latitude: location.latitude, longitude: location.longitude, source: "geolocation", accuracy: location.accuracy }
                : {}),
            },
            customer: {
              name: form.name.trim(),
              phoneNo: form.mobile.replace(/\D/g, ""),
              address: `${form.address}, ${form.locality}${form.landmark ? `, ${form.landmark}` : ""} - ${form.pincode}${form.note.trim() ? `\nDelivery note: ${form.note.trim()}` : ""}`,
            },
          }),
        },
        { forceBackend: true, authToken }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false)
        throw new Error(payload.message || "Unable to save your order");
      const saved = payload.data;
      if (!saved?.orderId || !Number.isFinite(Number(saved.totalAmount))) {
        throw new Error("The order response did not include a confirmed order ID and total.");
      }
      trackMetaPurchase(
        String(saved.orderId),
        Number(saved.totalAmount),
        Array.from(new Set(resolvedItems.map(item => item.productId))),
        resolvedItems.map(item => ({ id: item.productId, quantity: item.quantity, item_price: Number(item.variant.price) })),
      );
      try {
        await requestCustomerData<SavedAddress>("customers/me/addresses", authToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: "Home",
            recipientName: form.name.trim(),
            phoneNumber: form.mobile.replace(/\D/g, ""),
            addressLine: form.address.trim(),
            locality: form.locality.trim(),
            landmark: form.landmark.trim(),
            pincode: form.pincode.trim(),
          }),
        });
      } catch (addressError) {
        console.warn("Order was saved, but checkout address could not be saved:", addressError);
      }
      const orderForCheckout: SavedOrder = {
        id: saved.orderId,
        total: Number(saved.totalAmount),
        subtotal: Number(saved.subtotalAmount ?? subtotal),
        discount: Number(saved.discountAmount ?? 0),
        deliveryFee: Number(saved.deliveryFee ?? 0),
        deliveryDistanceKm: Number(saved.deliveryDistanceKm ?? checkoutDeliveryQuote.distanceKm),
        deliveryRatePerKm: Number(saved.deliveryRatePerKm ?? checkoutDeliveryQuote.ratePerKm),
        couponCode: saved.couponCode || null,
        message: saved.whatsappMessage,
        paymentMethod: form.paymentMethod as "cash" | "online",
        razorpayCheckout: saved.razorpayCheckout && typeof saved.razorpayCheckout.orderId === "string" ? saved.razorpayCheckout : null,
        paymentStatus: "unpaid",
      };
      setSavedOrder(orderForCheckout);
      clearCart();
      if (form.paymentMethod === "cash") {
        window.location.assign(whatsappOrderUrl(saved.whatsappMessage));
      } else if (orderForCheckout.razorpayCheckout) {
        startRazorpayCheckout(orderForCheckout, authToken);
      } else {
        throw new Error("The payment gateway did not return secure checkout details. Your order was saved; contact RedVeg before retrying.");
      }
    } catch (error) {
      toast.error("Order could not be saved", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openWhatsapp = () =>
    savedOrder && window.location.assign(whatsappOrderUrl(savedOrder.message));

  if (authLoading || !isAuthenticated) {
    return (
      <StoreShell>
        <div className="container py-24 text-center text-sm font-bold text-muted-foreground">
          Checking your RedVeg account…
        </div>
      </StoreShell>
    );
  }

  if (savedOrder) {
    return (
      <StoreShell>
        <div className="container py-16 sm:py-24">
          <div className="mx-auto max-w-2xl rounded-[2rem] bg-white p-7 text-center shadow-[0_24px_70px_rgba(61,33,27,.1)] ring-1 ring-black/[0.045] sm:p-12">
            <span className="mx-auto grid size-20 place-items-center rounded-full bg-[#E5F3E3] text-[#267345]">
              <Check className="size-9" strokeWidth={3} />
            </span>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.18em] text-[#267345]">
              Order saved successfully
            </p>
            <h1 className="mt-3 font-display text-4xl font-black tracking-[-0.04em]">
              {savedOrder.paymentMethod === "online" ? savedOrder.paymentStatus === "paid" ? "Payment confirmed" : "Continue to secure payment" : "Now confirm on WhatsApp"}
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Your order <strong className="text-foreground">{savedOrder.id}</strong> is recorded as pending.
              {savedOrder.paymentMethod === "online"
                ? savedOrder.paymentStatus === "paid" ? " Razorpay confirmed your payment." : " Your order is saved. Complete payment in the Razorpay window to confirm it."
                : " WhatsApp should open automatically; send the prepared message to RedVeg to confirm."}
            </p>
            <Button
              onClick={async () => {
                if (savedOrder.paymentMethod !== "online") return openWhatsapp();
                if (savedOrder.paymentStatus === "paid") return;
                const token = await getCustomerIdToken();
                if (!token) return toast.error("Please sign in again before retrying payment.");
                startRazorpayCheckout(savedOrder, token);
              }}
              disabled={savedOrder.paymentMethod === "online" && savedOrder.paymentStatus === "paid"}
              className="mt-8 h-14 w-full rounded-full bg-[#1F8D4D] text-base font-black text-white hover:bg-[#18743E]"
            >
              {savedOrder.paymentMethod === "online" ? <ShieldCheck className="size-5" /> : <MessageCircle className="size-5" />} {savedOrder.paymentMethod === "online" ? savedOrder.paymentStatus === "paid" ? "Payment verified" : "Pay with Razorpay" : "Open WhatsApp"}{" "}
              <ExternalLink className="size-4" />
            </Button>
            {paymentError && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{paymentError}</p>}
            <Button
              variant="outline"
              onClick={() =>
                navigator.clipboard
                  .writeText(savedOrder.message)
                  .then(() => toast.success("Order message copied"))
              }
              className="mt-3 h-12 w-full rounded-full bg-white font-bold"
            >
              <Copy className="size-4" /> Copy order message
            </Button>
            <div className="mt-7 rounded-2xl bg-[#F6F1EC] p-4 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order ID</span>
                <strong>{savedOrder.id}</strong>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <strong>₹{money(savedOrder.subtotal)}</strong>
              </div>
              {savedOrder.couponCode && savedOrder.discount > 0 && (
                <div className="mt-2 flex justify-between text-[#267345]">
                  <span>Coupon · {savedOrder.couponCode}</span>
                  <strong>−₹{money(savedOrder.discount)}</strong>
                </div>
              )}
              <div className="mt-2 flex justify-between">
                <span className="text-muted-foreground">Delivery · {savedOrder.deliveryDistanceKm} km × ₹{savedOrder.deliveryRatePerKm}/km</span>
                <strong>₹{money(savedOrder.deliveryFee)}</strong>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-muted-foreground">Order total</span>
                <strong>₹{money(savedOrder.total)}</strong>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-muted-foreground">Initial status</span>
                <strong className="text-[#B4232C]">Pending</strong>
              </div>
            </div>
            <Link
              href="/"
              className="mt-7 inline-block text-sm font-bold text-[#B4232C]"
            >
              Return to storefront
            </Link>
          </div>
        </div>
      </StoreShell>
    );
  }

  return (
    <StoreShell>
      <div className="container py-10 sm:py-14">
        <Link
          href="/cart"
          className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-[#B4232C]"
        >
          <ArrowLeft className="size-4" /> Back to basket
        </Link>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_390px]">
          <form
            onSubmit={submit}
            className="rounded-[1.7rem] bg-white p-5 shadow-[0_16px_45px_rgba(61,33,27,.07)] ring-1 ring-black/[0.045] sm:p-8"
          >
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">
              Secure checkout
            </p>
            <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.035em]">
              Where should we deliver?
            </h1>
            {savedAddresses.length > 0 && (
              <div className="mt-6 max-w-xl">
                <Label htmlFor="checkout-saved-address" className="text-sm font-bold">Use a saved address</Label>
                <select id="checkout-saved-address" value={selectedAddressId} onChange={event => chooseSavedAddress(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#E8DDD5] bg-[#F8F5F1] px-3 text-sm outline-none focus:border-[#B4232C]/50">
                  <option value="">Enter a new delivery address</option>
                  {savedAddresses.map(address => <option key={address.id} value={address.id}>{address.label} · {address.addressLine}, {address.locality} {address.pincode}</option>)}
                </select>
              </div>
            )}
            <section className="mt-7" aria-labelledby="delivery-slot-heading">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="delivery-slot-heading" className="text-sm font-black">Choose a delivery slot <span className="text-[#B4232C]">*</span></h2>
                  <p className="mt-1 text-xs text-muted-foreground">Select a time window for this order.</p>
                </div>
                <span className="text-xs font-semibold text-muted-foreground">Live availability</span>
              </div>
              {deliverySlotsLoading ? <p className="mt-3 rounded-xl bg-[#F8F5F1] p-4 text-sm text-muted-foreground">Loading available delivery slots…</p>
                : deliverySlotsError ? <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#B4232C]">{deliverySlotsError} Refresh the page to try again.</p>
                : deliverySlots.length === 0 ? <p className="mt-3 rounded-xl bg-[#FFF7E8] p-4 text-sm text-[#76521D]">No delivery slots are currently available. Please check again later.</p>
                : <div className="mt-3 grid gap-3 sm:grid-cols-2">{deliverySlots.map(slot => {
                  const selected = selectedDeliverySlotId === slot.id;
                  return <label key={slot.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${selected ? "border-[#B4232C] bg-[#FFF7F5] ring-2 ring-[#B4232C]/10" : "border-[#E8DDD5] bg-white hover:border-[#B4232C]/40"}`}>
                    <input type="radio" name="delivery-slot" value={slot.id} checked={selected} onChange={() => setSelectedDeliverySlotId(slot.id)} className="size-4 accent-[#B4232C]" />
                    <span><span className="block text-sm font-black">{slot.name}</span><span className="mt-1 block text-xs text-muted-foreground">{formatSlotTime(slot.startTime)} – {formatSlotTime(slot.endTime)}</span></span>
                  </label>;
                })}</div>}
            </section>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <Field label="Full name" required>
                <Input
                  value={form.name}
                  onChange={update("name")}
                  aria-invalid={invalidFields.includes("name")}
                  className={`h-12 rounded-xl bg-[#F8F5F1] ${invalidFields.includes("name") ? "border-[#B4232C] ring-2 ring-[#B4232C]/25 focus-visible:ring-[#B4232C]" : ""}`}
                />
              </Field>
              <Field label="Mobile number" required>
                <Input
                  value={form.mobile}
                  onChange={update("mobile")}
                  inputMode="tel"
                  aria-invalid={invalidFields.includes("mobile")}
                  className={`h-12 rounded-xl bg-[#F8F5F1] ${invalidFields.includes("mobile") ? "border-[#B4232C] ring-2 ring-[#B4232C]/25 focus-visible:ring-[#B4232C]" : ""}`}
                />
              </Field>
            </div>
            <div className="mt-5">
              <Field label="House, street and building" required>
                <Textarea
                  value={form.address}
                  onChange={update("address")}
                  aria-invalid={invalidFields.includes("address")}
                  className={`min-h-24 rounded-xl bg-[#F8F5F1] ${invalidFields.includes("address") ? "border-[#B4232C] ring-2 ring-[#B4232C]/25 focus-visible:ring-[#B4232C]" : ""}`}
                />
              </Field>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Locality" required>
                <Input
                  value={form.locality}
                  onChange={update("locality")}
                  aria-invalid={invalidFields.includes("locality")}
                  className={`h-12 rounded-xl bg-[#F8F5F1] ${invalidFields.includes("locality") ? "border-[#B4232C] ring-2 ring-[#B4232C]/25 focus-visible:ring-[#B4232C]" : ""}`}
                />
              </Field>
              <Field label="Pincode" required>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#267345]" />
                  <Input
                    value={form.pincode}
                    onChange={update("pincode")}
                    inputMode="numeric"
                    maxLength={6}
                    aria-invalid={invalidFields.includes("pincode")}
                    className={`h-12 rounded-xl bg-[#F8F5F1] pl-10 ${invalidFields.includes("pincode") ? "border-[#B4232C] ring-2 ring-[#B4232C]/25 focus-visible:ring-[#B4232C]" : ""}`}
                  />
                </div>
              </Field>
            </div>
            <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <Field label="Landmark">
                <Input
                  value={form.landmark}
                  onChange={update("landmark")}
                  className="h-12 rounded-xl bg-[#F8F5F1]"
                />
              </Field>
              <Field label="Delivery note">
                <Input
                  value={form.note}
                  onChange={update("note")}
                  className="h-12 rounded-xl bg-[#F8F5F1]"
                />
              </Field>
              <div className="sm:col-span-2">
              <Field label="Payment method" required>
                <div className="grid grid-cols-2 gap-2">
                  {(["cash", "online"] as const).map(method => {
                    const selected = form.paymentMethod === method;
                    const label = method === "cash" ? "Cash" : "Online · Razorpay";
                    return (
                      <label
                        key={method}
                        className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors focus-within:ring-2 focus-within:ring-[#B4232C]/25 ${method === "online" && !onlinePaymentsAvailable ? "cursor-not-allowed border-[#E8DDD5] bg-[#F8F5F1] text-muted-foreground/60" : `cursor-pointer ${selected ? "border-[#B4232C] bg-[#FFF7F5] text-[#8F1D25]" : "border-[#E8DDD5] bg-white text-foreground hover:border-[#B4232C]/40"}`}`}
                      >
                        <input
                          type="radio"
                          name="checkout-payment-method"
                          value={method}
                          checked={selected}
                          disabled={method === "online" && !onlinePaymentsAvailable}
                          onChange={() => setForm(current => ({ ...current, paymentMethod: method }))}
                          className="size-4 accent-[#B4232C]"
                          required
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
                {!onlinePaymentsAvailable && <p className="mt-2 text-xs text-muted-foreground">Online gateway checkout is being configured. Please choose Cash for now.</p>}
              </Field>
              </div>
            </div>
            <div className="mt-7 rounded-2xl bg-[#EAF4E8] p-4 text-sm text-[#275F3C]">
              <strong>Serviceability check:</strong> Enter a 6-digit Kolkata
              pincode. Prices, coupon validity and stock are confirmed by the
              backend before the order is saved.
            </div>
            <div className="mt-4 rounded-2xl bg-[#F6F1EC] p-4 text-sm text-[#4F4540]" aria-live="polite">
              <strong>Delivery:</strong> {checkoutDeliveryLoading ? "Calculating the driving route…" : checkoutDeliveryQuote ? <>{checkoutDeliveryQuote.distanceKm} km × ₹{money(checkoutDeliveryQuote.ratePerKm)}/km = ₹{money(checkoutDeliveryQuote.deliveryFee)}<span className="mt-1 block">Driving route from {checkoutDeliveryQuote.originAddress}.</span>{checkoutDeliveryQuote.locationPrecision === "pincode_estimate" && <span className="mt-1 block">Area estimate. Use “Use my current location” for the route from the customer’s actual location.</span>}{checkoutDeliveryQuote.matchedDestinationAddress && <span className="mt-1 block">Matched destination: {checkoutDeliveryQuote.matchedDestinationAddress}</span>}</> : checkoutDeliveryError}
            </div>
          </form>
          <aside className="h-fit rounded-[1.6rem] bg-[#17110F] p-6 text-white shadow-[0_20px_55px_rgba(30,17,14,.16)] lg:sticky lg:top-40">
            <h2 className="text-xl font-black">Review your order</h2>
            <div className="mt-5 space-y-4">
              {resolvedItems.map(item => (
                <div
                  key={`${item.productId}-${item.variantId}`}
                  className="flex gap-3"
                >
                  <img
                    src={item.product.image}
                    alt=""
                    className="size-14 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {item.product.name}
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      {item.variant.label} × {item.quantity}
                    </p>
                  </div>
                  <span className="text-sm font-bold">
                    ₹{money(item.lineTotal)}
                  </span>
                </div>
              ))}
            </div>
            <div className="my-5 border-t border-white/10" />
            <div className="space-y-3 text-sm">
              <PriceRow label="Subtotal" value={`₹${money(displaySubtotal)}`} />
              {quoteIsCurrent && (
                <PriceRow
                  label={`Coupon · ${couponQuote!.coupon.code}`}
                  value={`−₹${money(displayDiscount)}`}
                  green
                />
              )}
              <PriceRow
                label="Delivery"
                value={checkoutDeliveryQuote ? `${checkoutDeliveryQuote.distanceKm} km × ₹${money(checkoutDeliveryQuote.ratePerKm)}/km · ₹${money(displayDeliveryFee)}` : checkoutDeliveryLoading ? "Calculating…" : checkoutDeliveryError || "Choose a delivery location"}
              />
              <div className="flex justify-between pt-2 text-lg font-black">
                <span>Total</span>
                <span>₹{money(displayTotal)}</span>
              </div>
            </div>
            {couponCode && (couponValidationLoading || !quoteIsCurrent) && (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/10 p-3 text-xs text-white/80">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span className="flex-1">
                  {couponValidationLoading
                    ? `Rechecking ${couponCode}…`
                    : couponValidationError || "Coupon quote unavailable."}
                </span>
                <button
                  type="button"
                  onClick={clearCoupon}
                  className="font-black underline"
                >
                  <X className="size-4" />
                  <span className="sr-only">Remove coupon</span>
                </button>
              </div>
            )}
            {quoteIsCurrent && (
              <p className="mt-3 flex items-center gap-2 text-xs font-bold text-[#A8D59D]">
                <Check className="size-4" /> Coupon verified against current
                catalog prices.
              </p>
            )}
            <Button
              type="submit"
              onClick={submit}
              disabled={submitting || !resolvedItems.length || couponPending || checkoutDeliveryLoading || !checkoutDeliveryQuote || Boolean(checkoutDeliveryError) || deliverySlotsLoading || Boolean(deliverySlotsError) || !deliverySlots.length || !deliverySlots.some(slot => slot.id === selectedDeliverySlotId)}
              className="mt-6 h-14 w-full rounded-full bg-[#D8323A] text-sm font-black text-white hover:bg-[#E33A42]"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving order
                  safely…
                </>
              ) : (
                form.paymentMethod === "online" ? "Save Order & Pay Securely" : "Save Order & Continue on WhatsApp"
              )}
            </Button>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-white/50">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#72B556]" />{" "}
              The server recalculates your prices, discount, delivery and
              available stock when you place the order.
            </p>
          </aside>
        </div>
      </div>
    </StoreShell>
  );
}

function PriceRow({
  label,
  value,
  green = false,
}: {
  label: string;
  value: string;
  green?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${green ? "text-[#A8D59D]" : "text-white/55"}`}
    >
      <span>{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-bold">
        {label}
        {required && <span className="ml-1 text-[#B4232C]">*</span>}
      </Label>
      {children}
    </div>
  );
}

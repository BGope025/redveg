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
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
function money(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}
const WHATSAPP_RECIPIENT = "918910558446";
const whatsappOrderUrl = (message) => `https://wa.me/${WHATSAPP_RECIPIENT}?text=${encodeURIComponent(message)}`;
function formatSlotTime(value) {
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || !minute) return value;
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}
const REQUIRED_FIELDS = ["name", "mobile", "address", "locality", "pincode"];
function isRequiredFieldValid(field, value) {
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
async function requestCustomerData(path, token, init = {}) {
  const response = await apiFetch(path, init, { forceBackend: true, authToken: token });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.message || "Unable to load your saved details.");
  return payload.data;
}
function CheckoutPage() {
  const {
    user,
    isAuthenticated,
    loading: authLoading,
    getCustomerIdToken
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
    clearCoupon
  } = useCart();
  const [checkoutDeliveryQuote, setCheckoutDeliveryQuote] = useState(null);
  const [checkoutDeliveryLoading, setCheckoutDeliveryLoading] = useState(false);
  const [checkoutDeliveryError, setCheckoutDeliveryError] = useState("");
  const [savedOrder, setSavedOrder] = useState(null);
  const [onlinePaymentsAvailable, setOnlinePaymentsAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [deliverySlots, setDeliverySlots] = useState([]);
  const [selectedDeliverySlotId, setSelectedDeliverySlotId] = useState("");
  const [deliverySlotsLoading, setDeliverySlotsLoading] = useState(true);
  const [deliverySlotsError, setDeliverySlotsError] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [invalidFields, setInvalidFields] = useState([]);
  const editedFields = useRef(/* @__PURE__ */ new Set());
  const checkoutStarted = useRef(false);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    address: "",
    locality: "",
    pincode: "",
    landmark: "",
    paymentMethod: "cash",
    note: ""
  });
  useEffect(() => {
    let current = true;
    setOnlinePaymentsAvailable(false);
    if (!user?.uid) return () => {
      current = false;
    };
    void getCustomerIdToken().then((token) => token ? apiFetch("orders/online-payment-status", {}, { forceBackend: true, authToken: token }) : null).then((response) => response ? response.json() : null).then((payload) => {
      if (current) setOnlinePaymentsAvailable(payload?.success === true && payload?.data?.available === true);
    }).catch(() => {
      if (current) setOnlinePaymentsAvailable(false);
    });
    return () => {
      current = false;
    };
  }, [getCustomerIdToken, user?.uid]);
  useEffect(() => {
    if (checkoutStarted.current || !resolvedItems.length) return;
    checkoutStarted.current = true;
    trackMetaEvent("InitiateCheckout", {
      content_type: "product",
      content_ids: Array.from(new Set(resolvedItems.map((item) => item.productId))),
      contents: resolvedItems.map((item) => ({ id: item.productId, quantity: item.quantity, item_price: Number(item.variant.price) })),
      num_items: resolvedItems.reduce((sum, item) => sum + item.quantity, 0),
      value: Number(subtotal),
      currency: "INR"
    });
  }, [resolvedItems, subtotal]);
  const quoteIsCurrent = Boolean(
    couponQuote && couponCode && couponQuote.coupon.code.toUpperCase() === couponCode.toUpperCase()
  );
  const displaySubtotal = quoteIsCurrent ? couponQuote.subtotalAmount : subtotal;
  const displayDiscount = quoteIsCurrent ? couponQuote.discountAmount : 0;
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
        const data = await requestCustomerData("customers/me", token);
        if (!active) return;
        setSavedAddresses(data.addresses || []);
        const phone = data.profile?.phoneNumber || user?.phoneNumber || "";
        const digits = phone.replace(/\D/g, "");
        setForm((current) => ({
          ...current,
          name: editedFields.current.has("name") ? current.name : data.profile?.displayName || user?.displayName || current.name,
          mobile: editedFields.current.has("mobile") ? current.mobile : digits.length > 10 ? digits.slice(-10) : digits || current.mobile
        }));
      } catch (error) {
        console.warn("Could not load checkout profile details:", error);
      }
    };
    if (user?.uid) void loadCustomer();
    return () => {
      active = false;
    };
  }, [user?.uid, user?.displayName, user?.phoneNumber, getCustomerIdToken]);
  useEffect(() => {
    if (!location) return;
    setForm((current) => ({
      ...current,
      locality: editedFields.current.has("locality") ? current.locality : current.locality || location.area,
      pincode: editedFields.current.has("pincode") ? current.pincode : current.pincode || location.pincode
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
        const nextSlots = Array.isArray(payload.data) ? payload.data : [];
        if (!active) return;
        setDeliverySlots(nextSlots);
        setDeliverySlotsError("");
        setSelectedDeliverySlotId((current) => {
          if (current && nextSlots.some((slot) => slot.id === current)) return current;
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
    const timer = window.setInterval(() => void refreshSlots(), 15e3);
    const onFocus = () => void refreshSlots();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
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
        addressLine: form.address.trim(),
        landmark: form.landmark.trim(),
        area: form.locality.trim(),
        pincode: form.pincode.trim(),
        city: location?.city || "Kolkata",
        state: location?.state || "West Bengal",
        ...location?.source === "geolocation" && location.latitude != null && location.longitude != null ? { latitude: location.latitude, longitude: location.longitude, source: "geolocation", accuracy: location.accuracy } : {}
      };
      apiFetch("delivery-fees/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination, subtotalAmount: subtotal }), signal: controller.signal }, { forceBackend: true }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.message || "Could not calculate the delivery fee.");
        setCheckoutDeliveryQuote({ distanceKm: Number(payload.data.distanceKm), ratePerKm: Number(payload.data.ratePerKm), deliveryFee: Number(payload.data.deliveryFee), originAddress: String(payload.data.originAddress || ""), distanceMethod: String(payload.data.distanceMethod || "road"), locationPrecision: String(payload.data.locationPrecision || ""), matchedDestinationAddress: payload.data.matchedDestinationAddress ? String(payload.data.matchedDestinationAddress) : null });
      }).catch((error) => {
        if (!controller.signal.aborted) setCheckoutDeliveryError(error instanceof Error ? error.message : "Could not calculate the delivery fee.");
      }).finally(() => {
        if (!controller.signal.aborted) setCheckoutDeliveryLoading(false);
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.pincode, form.locality, form.address, form.landmark, location, subtotal]);
  useEffect(() => {
    setInvalidFields((current) => {
      const remaining = current.filter((field) => !isRequiredFieldValid(field, form[field]));
      return remaining.length === current.length ? current : remaining;
    });
  }, [form]);
  const update = (field) => (event) => {
    editedFields.current.add(field);
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };
  const chooseSavedAddress = (addressId) => {
    setSelectedAddressId(addressId);
    const address = savedAddresses.find((item) => item.id === addressId);
    if (!address) return;
    setForm((current) => ({
      ...current,
      name: address.recipientName,
      mobile: address.phoneNumber.replace(/\D/g, "").slice(-10),
      address: address.addressLine,
      locality: address.locality,
      pincode: address.pincode,
      landmark: address.landmark || ""
    }));
    ["name", "mobile", "address", "locality", "pincode", "landmark"].forEach((field) => editedFields.current.add(field));
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!resolvedItems.length) return toast.error("Your basket is empty.");
    const missingFields = REQUIRED_FIELDS.filter((field) => !isRequiredFieldValid(field, form[field]));
    setInvalidFields(missingFields);
    if (missingFields.length) {
      toast.error("Please Fill up the Remaining Box");
      return;
    }
    if (couponPending) {
      toast.error("Check or remove the coupon before placing your order.", {
        description: couponValidationError || "We\u2019re verifying it against your current basket."
      });
      return;
    }
    if (deliverySlotsLoading || deliverySlotsError || !deliverySlots.some((slot) => slot.id === selectedDeliverySlotId)) {
      toast.error("Please choose an available delivery slot.", { description: deliverySlotsError || void 0 });
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
            cartItems: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity
            })),
            couponCode: quoteIsCurrent ? couponQuote.coupon.code : void 0,
            deliverySlotId: selectedDeliverySlotId,
            paymentMethod: form.paymentMethod,
            deliveryDestination: {
              addressLine: form.address.trim(),
              landmark: form.landmark.trim(),
              area: form.locality.trim(),
              pincode: form.pincode.trim(),
              city: location?.city || "Kolkata",
              state: location?.state || "West Bengal",
              ...location?.source === "geolocation" && location.latitude != null && location.longitude != null ? { latitude: location.latitude, longitude: location.longitude, source: "geolocation", accuracy: location.accuracy } : {}
            },
            customer: {
              name: form.name.trim(),
              phoneNo: form.mobile.replace(/\D/g, ""),
              address: `${form.address}, ${form.locality}${form.landmark ? `, ${form.landmark}` : ""} - ${form.pincode}${form.note.trim() ? `
Delivery note: ${form.note.trim()}` : ""}`
            }
          })
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
        Array.from(new Set(resolvedItems.map((item) => item.productId))),
        resolvedItems.map((item) => ({ id: item.productId, quantity: item.quantity, item_price: Number(item.variant.price) }))
      );
      try {
        await requestCustomerData("customers/me/addresses", authToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: "Home",
            recipientName: form.name.trim(),
            phoneNumber: form.mobile.replace(/\D/g, ""),
            addressLine: form.address.trim(),
            locality: form.locality.trim(),
            landmark: form.landmark.trim(),
            pincode: form.pincode.trim()
          })
        });
      } catch (addressError) {
        console.warn("Order was saved, but checkout address could not be saved:", addressError);
      }
      setSavedOrder({
        id: saved.orderId,
        total: Number(saved.totalAmount),
        subtotal: Number(saved.subtotalAmount ?? subtotal),
        discount: Number(saved.discountAmount ?? 0),
        deliveryFee: Number(saved.deliveryFee ?? 0),
        deliveryDistanceKm: Number(saved.deliveryDistanceKm ?? checkoutDeliveryQuote.distanceKm),
        deliveryRatePerKm: Number(saved.deliveryRatePerKm ?? checkoutDeliveryQuote.ratePerKm),
        couponCode: saved.couponCode || null,
        message: saved.whatsappMessage,
        checkoutUrl: saved.checkoutUrl || null
      });
      clearCart();
      if (saved.checkoutUrl) {
        window.location.assign(saved.checkoutUrl);
      } else {
        window.location.assign(whatsappOrderUrl(saved.whatsappMessage));
      }
    } catch (error) {
      toast.error("Order could not be saved", {
        description: error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setSubmitting(false);
    }
  };
  const openWhatsapp = () => savedOrder && window.location.assign(whatsappOrderUrl(savedOrder.message));
  if (authLoading || !isAuthenticated) {
    return /* @__PURE__ */ React.createElement(StoreShell, null, /* @__PURE__ */ React.createElement("div", { className: "container py-24 text-center text-sm font-bold text-muted-foreground" }, "Checking your RedVeg account\u2026"));
  }
  if (savedOrder) {
    return /* @__PURE__ */ React.createElement(StoreShell, null, /* @__PURE__ */ React.createElement("div", { className: "container py-16 sm:py-24" }, /* @__PURE__ */ React.createElement("div", { className: "mx-auto max-w-2xl rounded-[2rem] bg-white p-7 text-center shadow-[0_24px_70px_rgba(61,33,27,.1)] ring-1 ring-black/[0.045] sm:p-12" }, /* @__PURE__ */ React.createElement("span", { className: "mx-auto grid size-20 place-items-center rounded-full bg-[#E5F3E3] text-[#267345]" }, /* @__PURE__ */ React.createElement(Check, { className: "size-9", strokeWidth: 3 })), /* @__PURE__ */ React.createElement("p", { className: "mt-7 text-xs font-black uppercase tracking-[0.18em] text-[#267345]" }, "Order saved successfully"), /* @__PURE__ */ React.createElement("h1", { className: "mt-3 font-display text-4xl font-black tracking-[-0.04em]" }, "Now confirm on WhatsApp"), /* @__PURE__ */ React.createElement("p", { className: "mt-4 text-sm leading-6 text-muted-foreground" }, "Your order", " ", /* @__PURE__ */ React.createElement("strong", { className: "text-foreground" }, savedOrder.id), " is recorded as pending. WhatsApp should open automatically; send the prepared message to RedVeg to confirm."), /* @__PURE__ */ React.createElement(
      Button,
      {
        onClick: openWhatsapp,
        className: "mt-8 h-14 w-full rounded-full bg-[#1F8D4D] text-base font-black text-white hover:bg-[#18743E]"
      },
      /* @__PURE__ */ React.createElement(MessageCircle, { className: "size-5" }),
      " Open WhatsApp",
      " ",
      /* @__PURE__ */ React.createElement(ExternalLink, { className: "size-4" })
    ), /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "outline",
        onClick: () => navigator.clipboard.writeText(savedOrder.message).then(() => toast.success("Order message copied")),
        className: "mt-3 h-12 w-full rounded-full bg-white font-bold"
      },
      /* @__PURE__ */ React.createElement(Copy, { className: "size-4" }),
      " Copy order message"
    ), /* @__PURE__ */ React.createElement("div", { className: "mt-7 rounded-2xl bg-[#F6F1EC] p-4 text-left text-sm" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-muted-foreground" }, "Order ID"), /* @__PURE__ */ React.createElement("strong", null, savedOrder.id)), /* @__PURE__ */ React.createElement("div", { className: "mt-2 flex justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-muted-foreground" }, "Subtotal"), /* @__PURE__ */ React.createElement("strong", null, "\u20B9", money(savedOrder.subtotal))), savedOrder.couponCode && savedOrder.discount > 0 && /* @__PURE__ */ React.createElement("div", { className: "mt-2 flex justify-between text-[#267345]" }, /* @__PURE__ */ React.createElement("span", null, "Coupon \xB7 ", savedOrder.couponCode), /* @__PURE__ */ React.createElement("strong", null, "\u2212\u20B9", money(savedOrder.discount))), /* @__PURE__ */ React.createElement("div", { className: "mt-2 flex justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-muted-foreground" }, "Delivery \xB7 ", savedOrder.deliveryDistanceKm, " km \xD7 \u20B9", savedOrder.deliveryRatePerKm, "/km"), /* @__PURE__ */ React.createElement("strong", null, "\u20B9", money(savedOrder.deliveryFee))), /* @__PURE__ */ React.createElement("div", { className: "mt-2 flex justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-muted-foreground" }, "Order total"), /* @__PURE__ */ React.createElement("strong", null, "\u20B9", money(savedOrder.total))), /* @__PURE__ */ React.createElement("div", { className: "mt-2 flex justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-muted-foreground" }, "Initial status"), /* @__PURE__ */ React.createElement("strong", { className: "text-[#B4232C]" }, "Pending"))), /* @__PURE__ */ React.createElement(
      Link,
      {
        href: "/",
        className: "mt-7 inline-block text-sm font-bold text-[#B4232C]"
      },
      "Return to storefront"
    ))));
  }
  return /* @__PURE__ */ React.createElement(StoreShell, null, /* @__PURE__ */ React.createElement("div", { className: "container py-10 sm:py-14" }, /* @__PURE__ */ React.createElement(
    Link,
    {
      href: "/cart",
      className: "inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-[#B4232C]"
    },
    /* @__PURE__ */ React.createElement(ArrowLeft, { className: "size-4" }),
    " Back to basket"
  ), /* @__PURE__ */ React.createElement("div", { className: "mt-6 grid gap-8 lg:grid-cols-[1fr_390px]" }, /* @__PURE__ */ React.createElement(
    "form",
    {
      onSubmit: submit,
      className: "rounded-[1.7rem] bg-white p-5 shadow-[0_16px_45px_rgba(61,33,27,.07)] ring-1 ring-black/[0.045] sm:p-8"
    },
    /* @__PURE__ */ React.createElement("p", { className: "text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]" }, "Secure checkout"),
    /* @__PURE__ */ React.createElement("h1", { className: "mt-2 font-display text-3xl font-black tracking-[-0.035em]" }, "Where should we deliver?"),
    savedAddresses.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "mt-6 max-w-xl" }, /* @__PURE__ */ React.createElement(Label, { htmlFor: "checkout-saved-address", className: "text-sm font-bold" }, "Use a saved address"), /* @__PURE__ */ React.createElement("select", { id: "checkout-saved-address", value: selectedAddressId, onChange: (event) => chooseSavedAddress(event.target.value), className: "mt-2 h-12 w-full rounded-xl border border-[#E8DDD5] bg-[#F8F5F1] px-3 text-sm outline-none focus:border-[#B4232C]/50" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Enter a new delivery address"), savedAddresses.map((address) => /* @__PURE__ */ React.createElement("option", { key: address.id, value: address.id }, address.label, " \xB7 ", address.addressLine, ", ", address.locality, " ", address.pincode)))),
    /* @__PURE__ */ React.createElement("section", { className: "mt-7", "aria-labelledby": "delivery-slot-heading" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { id: "delivery-slot-heading", className: "text-sm font-black" }, "Choose a delivery slot ", /* @__PURE__ */ React.createElement("span", { className: "text-[#B4232C]" }, "*")), /* @__PURE__ */ React.createElement("p", { className: "mt-1 text-xs text-muted-foreground" }, "Select a time window for this order.")), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-semibold text-muted-foreground" }, "Live availability")), deliverySlotsLoading ? /* @__PURE__ */ React.createElement("p", { className: "mt-3 rounded-xl bg-[#F8F5F1] p-4 text-sm text-muted-foreground" }, "Loading available delivery slots\u2026") : deliverySlotsError ? /* @__PURE__ */ React.createElement("p", { role: "alert", className: "mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#B4232C]" }, deliverySlotsError, " Refresh the page to try again.") : deliverySlots.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "mt-3 rounded-xl bg-[#FFF7E8] p-4 text-sm text-[#76521D]" }, "No delivery slots are currently available. Please check again later.") : /* @__PURE__ */ React.createElement("div", { className: "mt-3 grid gap-3 sm:grid-cols-2" }, deliverySlots.map((slot) => {
      const selected = selectedDeliverySlotId === slot.id;
      return /* @__PURE__ */ React.createElement("label", { key: slot.id, className: `flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${selected ? "border-[#B4232C] bg-[#FFF7F5] ring-2 ring-[#B4232C]/10" : "border-[#E8DDD5] bg-white hover:border-[#B4232C]/40"}` }, /* @__PURE__ */ React.createElement("input", { type: "radio", name: "delivery-slot", value: slot.id, checked: selected, onChange: () => setSelectedDeliverySlotId(slot.id), className: "size-4 accent-[#B4232C]" }), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { className: "block text-sm font-black" }, slot.name), /* @__PURE__ */ React.createElement("span", { className: "mt-1 block text-xs text-muted-foreground" }, formatSlotTime(slot.startTime), " \u2013 ", formatSlotTime(slot.endTime))));
    }))),
    /* @__PURE__ */ React.createElement("div", { className: "mt-8 grid gap-5 sm:grid-cols-2" }, /* @__PURE__ */ React.createElement(Field, { label: "Full name", required: true }, /* @__PURE__ */ React.createElement(
      Input,
      {
        value: form.name,
        onChange: update("name"),
        "aria-invalid": invalidFields.includes("name"),
        className: `h-12 rounded-xl bg-[#F8F5F1] ${invalidFields.includes("name") ? "border-[#B4232C] ring-2 ring-[#B4232C]/25 focus-visible:ring-[#B4232C]" : ""}`
      }
    )), /* @__PURE__ */ React.createElement(Field, { label: "Mobile number", required: true }, /* @__PURE__ */ React.createElement(
      Input,
      {
        value: form.mobile,
        onChange: update("mobile"),
        inputMode: "tel",
        "aria-invalid": invalidFields.includes("mobile"),
        className: `h-12 rounded-xl bg-[#F8F5F1] ${invalidFields.includes("mobile") ? "border-[#B4232C] ring-2 ring-[#B4232C]/25 focus-visible:ring-[#B4232C]" : ""}`
      }
    ))),
    /* @__PURE__ */ React.createElement("div", { className: "mt-5" }, /* @__PURE__ */ React.createElement(Field, { label: "House, street and building", required: true }, /* @__PURE__ */ React.createElement(
      Textarea,
      {
        value: form.address,
        onChange: update("address"),
        "aria-invalid": invalidFields.includes("address"),
        className: `min-h-24 rounded-xl bg-[#F8F5F1] ${invalidFields.includes("address") ? "border-[#B4232C] ring-2 ring-[#B4232C]/25 focus-visible:ring-[#B4232C]" : ""}`
      }
    ))),
    /* @__PURE__ */ React.createElement("div", { className: "mt-5 grid gap-5 sm:grid-cols-2" }, /* @__PURE__ */ React.createElement(Field, { label: "Locality", required: true }, /* @__PURE__ */ React.createElement(
      Input,
      {
        value: form.locality,
        onChange: update("locality"),
        "aria-invalid": invalidFields.includes("locality"),
        className: `h-12 rounded-xl bg-[#F8F5F1] ${invalidFields.includes("locality") ? "border-[#B4232C] ring-2 ring-[#B4232C]/25 focus-visible:ring-[#B4232C]" : ""}`
      }
    )), /* @__PURE__ */ React.createElement(Field, { label: "Pincode", required: true }, /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(MapPin, { className: "absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#267345]" }), /* @__PURE__ */ React.createElement(
      Input,
      {
        value: form.pincode,
        onChange: update("pincode"),
        inputMode: "numeric",
        maxLength: 6,
        "aria-invalid": invalidFields.includes("pincode"),
        className: `h-12 rounded-xl bg-[#F8F5F1] pl-10 ${invalidFields.includes("pincode") ? "border-[#B4232C] ring-2 ring-[#B4232C]/25 focus-visible:ring-[#B4232C]" : ""}`
      }
    )))),
    /* @__PURE__ */ React.createElement("div", { className: "mt-5 grid gap-5 sm:grid-cols-3" }, /* @__PURE__ */ React.createElement(Field, { label: "Landmark" }, /* @__PURE__ */ React.createElement(
      Input,
      {
        value: form.landmark,
        onChange: update("landmark"),
        className: "h-12 rounded-xl bg-[#F8F5F1]"
      }
    )), /* @__PURE__ */ React.createElement(Field, { label: "Payment method", required: true }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-2" }, ["cash", "online"].map((method) => {
      const selected = form.paymentMethod === method;
      const label = method === "cash" ? "Cash" : "Online";
      return /* @__PURE__ */ React.createElement(
        "label",
        {
          key: method,
          className: `flex h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors focus-within:ring-2 focus-within:ring-[#B4232C]/25 ${method === "online" && !onlinePaymentsAvailable ? "cursor-not-allowed border-[#E8DDD5] bg-[#F8F5F1] text-muted-foreground/60" : `cursor-pointer ${selected ? "border-[#B4232C] bg-[#FFF7F5] text-[#8F1D25]" : "border-[#E8DDD5] bg-white text-foreground hover:border-[#B4232C]/40"}`}`
        },
        /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "radio",
            name: "checkout-payment-method",
            value: method,
            checked: selected,
            disabled: method === "online" && !onlinePaymentsAvailable,
            onChange: () => setForm((current) => ({ ...current, paymentMethod: method })),
            className: "size-4 accent-[#B4232C]",
            required: true
          }
        ),
        label
      );
    })), !onlinePaymentsAvailable && /* @__PURE__ */ React.createElement("p", { className: "mt-2 text-xs text-muted-foreground" }, "Online payments are being prepared for staging. Please choose Cash for now.")), /* @__PURE__ */ React.createElement(Field, { label: "Delivery note" }, /* @__PURE__ */ React.createElement(
      Input,
      {
        value: form.note,
        onChange: update("note"),
        className: "h-12 rounded-xl bg-[#F8F5F1]"
      }
    ))),
    /* @__PURE__ */ React.createElement("div", { className: "mt-7 rounded-2xl bg-[#EAF4E8] p-4 text-sm text-[#275F3C]" }, /* @__PURE__ */ React.createElement("strong", null, "Serviceability check:"), " Enter a 6-digit Kolkata pincode. Prices, coupon validity and stock are confirmed by the backend before the order is saved."),
    /* @__PURE__ */ React.createElement("div", { className: "mt-4 rounded-2xl bg-[#F6F1EC] p-4 text-sm text-[#4F4540]", "aria-live": "polite" }, /* @__PURE__ */ React.createElement("strong", null, "Delivery:"), " ", checkoutDeliveryLoading ? "Calculating the driving route\u2026" : checkoutDeliveryQuote ? /* @__PURE__ */ React.createElement(React.Fragment, null, checkoutDeliveryQuote.distanceKm, " km \xD7 \u20B9", money(checkoutDeliveryQuote.ratePerKm), "/km = \u20B9", money(checkoutDeliveryQuote.deliveryFee), /* @__PURE__ */ React.createElement("span", { className: "mt-1 block" }, "Driving route from ", checkoutDeliveryQuote.originAddress, "."), checkoutDeliveryQuote.locationPrecision === "pincode_estimate" && /* @__PURE__ */ React.createElement("span", { className: "mt-1 block" }, "Area estimate. Use \u201CUse my current location\u201D for the route from the customer\u2019s actual location."), checkoutDeliveryQuote.matchedDestinationAddress && /* @__PURE__ */ React.createElement("span", { className: "mt-1 block" }, "Matched destination: ", checkoutDeliveryQuote.matchedDestinationAddress)) : checkoutDeliveryError)
  ), /* @__PURE__ */ React.createElement("aside", { className: "h-fit rounded-[1.6rem] bg-[#17110F] p-6 text-white shadow-[0_20px_55px_rgba(30,17,14,.16)] lg:sticky lg:top-40" }, /* @__PURE__ */ React.createElement("h2", { className: "text-xl font-black" }, "Review your order"), /* @__PURE__ */ React.createElement("div", { className: "mt-5 space-y-4" }, resolvedItems.map((item) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: `${item.productId}-${item.variantId}`,
      className: "flex gap-3"
    },
    /* @__PURE__ */ React.createElement(
      "img",
      {
        src: item.product.image,
        alt: "",
        className: "size-14 rounded-xl object-cover"
      }
    ),
    /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("p", { className: "truncate text-sm font-bold" }, item.product.name), /* @__PURE__ */ React.createElement("p", { className: "mt-1 text-xs text-white/45" }, item.variant.label, " \xD7 ", item.quantity)),
    /* @__PURE__ */ React.createElement("span", { className: "text-sm font-bold" }, "\u20B9", money(item.lineTotal))
  ))), /* @__PURE__ */ React.createElement("div", { className: "my-5 border-t border-white/10" }), /* @__PURE__ */ React.createElement("div", { className: "space-y-3 text-sm" }, /* @__PURE__ */ React.createElement(PriceRow, { label: "Subtotal", value: `\u20B9${money(displaySubtotal)}` }), quoteIsCurrent && /* @__PURE__ */ React.createElement(
    PriceRow,
    {
      label: `Coupon \xB7 ${couponQuote.coupon.code}`,
      value: `\u2212\u20B9${money(displayDiscount)}`,
      green: true
    }
  ), /* @__PURE__ */ React.createElement(
    PriceRow,
    {
      label: "Delivery",
      value: checkoutDeliveryQuote ? `${checkoutDeliveryQuote.distanceKm} km \xD7 \u20B9${money(checkoutDeliveryQuote.ratePerKm)}/km \xB7 \u20B9${money(displayDeliveryFee)}` : checkoutDeliveryLoading ? "Calculating\u2026" : checkoutDeliveryError || "Choose a delivery location"
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between pt-2 text-lg font-black" }, /* @__PURE__ */ React.createElement("span", null, "Total"), /* @__PURE__ */ React.createElement("span", null, "\u20B9", money(displayTotal)))), couponCode && (couponValidationLoading || !quoteIsCurrent) && /* @__PURE__ */ React.createElement("div", { className: "mt-4 flex items-start gap-2 rounded-xl bg-white/10 p-3 text-xs text-white/80" }, /* @__PURE__ */ React.createElement(AlertCircle, { className: "mt-0.5 size-4 shrink-0" }), /* @__PURE__ */ React.createElement("span", { className: "flex-1" }, couponValidationLoading ? `Rechecking ${couponCode}\u2026` : couponValidationError || "Coupon quote unavailable."), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: clearCoupon,
      className: "font-black underline"
    },
    /* @__PURE__ */ React.createElement(X, { className: "size-4" }),
    /* @__PURE__ */ React.createElement("span", { className: "sr-only" }, "Remove coupon")
  )), quoteIsCurrent && /* @__PURE__ */ React.createElement("p", { className: "mt-3 flex items-center gap-2 text-xs font-bold text-[#A8D59D]" }, /* @__PURE__ */ React.createElement(Check, { className: "size-4" }), " Coupon verified against current catalog prices."), /* @__PURE__ */ React.createElement(
    Button,
    {
      type: "submit",
      onClick: submit,
      disabled: submitting || !resolvedItems.length || couponPending || checkoutDeliveryLoading || !checkoutDeliveryQuote || Boolean(checkoutDeliveryError) || deliverySlotsLoading || Boolean(deliverySlotsError) || !deliverySlots.length || !deliverySlots.some((slot) => slot.id === selectedDeliverySlotId),
      className: "mt-6 h-14 w-full rounded-full bg-[#D8323A] text-sm font-black text-white hover:bg-[#E33A42]"
    },
    submitting ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Loader2, { className: "size-4 animate-spin" }), " Saving order safely\u2026") : "Save Order & Continue on WhatsApp"
  ), /* @__PURE__ */ React.createElement("p", { className: "mt-4 flex items-start gap-2 text-xs leading-5 text-white/50" }, /* @__PURE__ */ React.createElement(ShieldCheck, { className: "mt-0.5 size-4 shrink-0 text-[#72B556]" }), " ", "The server recalculates your prices, discount, delivery and available stock when you place the order.")))));
}
function PriceRow({
  label,
  value,
  green = false
}) {
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `flex justify-between ${green ? "text-[#A8D59D]" : "text-white/55"}`
    },
    /* @__PURE__ */ React.createElement("span", null, label),
    /* @__PURE__ */ React.createElement("span", { className: "font-bold text-white" }, value)
  );
}
function Field({
  label,
  required,
  children
}) {
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement(Label, { className: "text-sm font-bold" }, label, required && /* @__PURE__ */ React.createElement("span", { className: "ml-1 text-[#B4232C]" }, "*")), children);
}
export {
  CheckoutPage as default
};

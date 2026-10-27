import type { CartItem, Product, ProductVariant } from "@/types/commerce";
import { apiFetch, unwrapApiData } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { trackMetaEvent } from "@/lib/metaPixel";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

interface ResolvedCartItem extends CartItem {
  product: Product;
  variant: ProductVariant;
  lineTotal: number;
}

type CouponQuote = {
  coupon: {
    code: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    maxDiscountAmount: number | null;
    minOrderAmount: number;
  };
  subtotalAmount: number;
  discountAmount: number;
  deliveryFee: number;
  totalAmount: number;
};

interface CartContextValue {
  items: CartItem[];
  resolvedItems: ResolvedCartItem[];
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryDistanceKm: number;
  deliveryRatePerKm: number;
  deliveryOriginAddress: string;
  deliveryDistanceMethod: string;
  deliveryLocationPrecision: string;
  deliveryQuoteLoading: boolean;
  deliveryQuoteError: string;
  couponCode: string;
  couponQuote: CouponQuote | null;
  couponValidationLoading: boolean;
  couponValidationError: string;
  setCouponCode: (code: string) => void;
  clearCoupon: () => void;
  addItem: (productId: string, variantId: string, quantity?: number) => number;
  updateQuantity: (productId: string, variantId: string, quantity: number) => void;
  removeItem: (productId: string, variantId: string) => void;
  clearCart: () => void;
  cartSyncStatus: "local" | "syncing" | "synced" | "error";
  retryCartSync: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "redveg-cart-v1";
const CART_OWNER_STORAGE_KEY = "redveg-cart-owner-v1";
const COUPON_STORAGE_KEY = "redveg-coupon-v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { getCustomerIdToken, user, loading: authLoading } = useAuth();
  const { location } = useLocation();
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const itemsRef = useRef(items);
  const setCartItems = (updater: CartItem[] | ((current: CartItem[]) => CartItem[])) => {
    const nextItems = typeof updater === "function" ? updater(itemsRef.current) : updater;
    itemsRef.current = nextItems;
    setItems(nextItems);
  };
  const [products, setProducts] = useState<Product[]>([]);
  const [cartSyncReadyFor, setCartSyncReadyFor] = useState<string | null>(null);
  const cartSyncQueue = useRef<Promise<void>>(Promise.resolve());
  const cartSyncVersion = useRef(0);
  const [cartSyncStatus, setCartSyncStatus] = useState<"local" | "syncing" | "synced" | "error">("local");
  const [, setLoading] = useState(true);
  const [couponCodeValue, setCouponCodeValue] = useState(() => {
    try { return localStorage.getItem(COUPON_STORAGE_KEY) || ""; } catch { return ""; }
  });
  const [couponRequestKey, setCouponRequestKey] = useState(0);
  const [couponQuote, setCouponQuote] = useState<CouponQuote | null>(null);
  const [couponValidationLoading, setCouponValidationLoading] = useState(false);
  const [couponValidationError, setCouponValidationError] = useState("");
  const destination = useMemo(() => location ? ({
    pincode: location.pincode, area: location.area, city: location.city, state: location.state,
    ...(location.source === "geolocation" && location.latitude != null && location.longitude != null
      ? { latitude: location.latitude, longitude: location.longitude, source: "geolocation", accuracy: location.accuracy }
      : {}),
  }) : null, [location]);
  const [deliveryQuote, setDeliveryQuote] = useState<{ distanceKm: number; ratePerKm: number; deliveryFee: number; originAddress: string; distanceMethod: string; locationPrecision: string } | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState("");

  const resolvedItems = useMemo<ResolvedCartItem[]>(
    () => items.flatMap((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      const variant = product?.variants.find((entry) => entry.id === item.variantId);
      if (!product || !variant) return [];
      return [{ ...item, product, variant, lineTotal: variant.price * item.quantity }];
    }),
    [items, products],
  );

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const response = await apiFetch("products");
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const payload = await response.json();
        setProducts(unwrapApiData<Product[]>(payload, []));
      } catch (error) {
        console.error("Error fetching products for cart:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!destination?.pincode) {
      setDeliveryQuote(null);
      setDeliveryQuoteLoading(false);
      setDeliveryQuoteError("Choose a delivery location to calculate the fee.");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDeliveryQuoteLoading(true);
      setDeliveryQuoteError("");
      apiFetch("delivery-fees/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
        signal: controller.signal,
      }, { forceBackend: true })
        .then(async response => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.success) throw new Error(payload.message || "Could not calculate delivery distance.");
          setDeliveryQuote({
            distanceKm: Number(payload.data.distanceKm),
            ratePerKm: Number(payload.data.ratePerKm),
            deliveryFee: Number(payload.data.deliveryFee),
            originAddress: String(payload.data.originAddress || ""),
            distanceMethod: String(payload.data.distanceMethod || "road"),
            locationPrecision: String(payload.data.locationPrecision || "pincode_estimate"),
          });
        })
        .catch(error => { if (!controller.signal.aborted) { setDeliveryQuote(null); setDeliveryQuoteError(error instanceof Error ? error.message : "Could not calculate delivery distance."); } })
        .finally(() => { if (!controller.signal.aborted) setDeliveryQuoteLoading(false); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [destination]);

  // Hydrate the signed-in customer's server cart once per login. Merge by taking
  // the larger quantity for overlapping products so reloading an already-synced
  // local cart does not duplicate every line.
  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) {
      setCartSyncReadyFor(null);
      setCartSyncStatus("local");
      return;
    }
    let active = true;
    setCartSyncReadyFor(null);
    void (async () => {
      try {
        const authToken = await getCustomerIdToken();
        if (!authToken) throw new Error("Customer sign-in token unavailable");
        const response = await apiFetch("customers/me/cart", {}, { forceBackend: true, authToken });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success || !Array.isArray(payload.data?.items)) {
          throw new Error(payload.message || "Customer cart sync failed");
        }
        if (!active) return;
        const serverItems = payload.data.items.filter((item: any) =>
          typeof item?.productId === "string" && typeof item?.variantId === "string" && Number.isInteger(Number(item?.quantity)) && Number(item.quantity) > 0,
        ).map((item: any) => ({ productId: item.productId, variantId: item.variantId, quantity: Math.min(99, Number(item.quantity)) } as CartItem));
        let localOwner: string | null = null;
        try { localOwner = localStorage.getItem(CART_OWNER_STORAGE_KEY); } catch { /* Continue with the in-memory cart. */ }
        setCartItems((localItems) => {
          const merged = new Map<string, CartItem>();
          const safeLocalItems = localOwner && localOwner !== user.uid ? [] : localItems;
          for (const item of [...safeLocalItems, ...serverItems]) {
            const key = `${item.productId}:${item.variantId}`;
            const previous = merged.get(key);
            merged.set(key, { ...item, quantity: Math.min(99, Math.max(previous?.quantity || 0, item.quantity)) });
          }
          return Array.from(merged.values());
        });
        try { localStorage.setItem(CART_OWNER_STORAGE_KEY, user.uid); } catch { /* Server cart remains available even if local storage is blocked. */ }
        setCartSyncStatus("syncing");
        setCartSyncReadyFor(user.uid);
      } catch (error) {
        if (active) {
          setCartSyncStatus("error");
          console.warn("Signed-in cart was not synced; keeping the local cart until the server is available.", error);
        }
      }
    })();
    return () => { active = false; };
  }, [authLoading, user?.uid, getCustomerIdToken]);

  // Keep the server snapshot current for active signed-in customers. A short
  // debounce avoids writing each keystroke-like quantity update separately.
  useEffect(() => {
    if (!user?.uid || cartSyncReadyFor !== user.uid || authLoading) return;
    const itemsSnapshot = items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }));
    const version = ++cartSyncVersion.current;
    setCartSyncStatus("syncing");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const authToken = await getCustomerIdToken();
          if (!authToken) return;
          if (version !== cartSyncVersion.current) return;
          const write = async () => {
            // An older request waiting in the queue must not overwrite a newer cart.
            if (version !== cartSyncVersion.current) return;
            const response = await apiFetch("customers/me/cart", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: itemsSnapshot }),
              cache: "no-store",
              keepalive: true,
            }, { forceBackend: true, authToken });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.success) throw new Error(payload.message || `Cart sync failed (HTTP ${response.status})`);
            if (version === cartSyncVersion.current && Array.isArray(payload.data?.items)) {
              const acceptedItems = payload.data.items.filter((item: any) =>
                typeof item?.productId === "string" && typeof item?.variantId === "string" && Number.isInteger(Number(item?.quantity)) && Number(item.quantity) > 0,
              ).map((item: any) => ({ productId: item.productId, variantId: item.variantId, quantity: Number(item.quantity) } as CartItem));
              if (JSON.stringify(acceptedItems) !== JSON.stringify(itemsSnapshot)) setCartItems(acceptedItems);
            }
            if (version === cartSyncVersion.current) setCartSyncStatus("synced");
          };
          cartSyncQueue.current = cartSyncQueue.current.catch(() => undefined).then(write);
          await cartSyncQueue.current;
        } catch (error) {
          if (version === cartSyncVersion.current) setCartSyncStatus("error");
          console.warn("Unable to sync the signed-in customer cart.", error);
        }
      })();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [items, user?.uid, authLoading, cartSyncReadyFor, getCustomerIdToken]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* Keep cart state in memory if storage is unavailable. */ }
  }, [items]);

  useEffect(() => {
    try {
      if (couponCodeValue) localStorage.setItem(COUPON_STORAGE_KEY, couponCodeValue);
      else localStorage.removeItem(COUPON_STORAGE_KEY);
    } catch { /* Keep coupon state in memory if storage is unavailable. */ }
  }, [couponCodeValue]);

  useEffect(() => {
    if (!couponCodeValue || !items.length) {
      setCouponQuote(null);
      setCouponValidationLoading(false);
      setCouponValidationError("");
      return;
    }

    const controller = new AbortController();
    setCouponQuote(null);
    setCouponValidationLoading(true);
    setCouponValidationError("");
    getCustomerIdToken()
      .catch(() => null)
      .then(authToken => apiFetch("coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCodeValue, cartItems: items, destination }),
        signal: controller.signal,
      }, { forceBackend: true, ...(authToken ? { authToken } : {}) }))
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false || !payload.data?.coupon) {
          throw new Error(payload.message || "This coupon could not be applied.");
        }
        setCouponQuote({
          coupon: payload.data.coupon,
          subtotalAmount: Number(payload.data.subtotalAmount),
          discountAmount: Number(payload.data.discountAmount),
          deliveryFee: Number(payload.data.deliveryFee),
          totalAmount: Number(payload.data.totalAmount),
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setCouponQuote(null);
        setCouponValidationError(error instanceof Error ? error.message : "This coupon could not be applied.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCouponValidationLoading(false);
      });
    return () => controller.abort();
  }, [couponCodeValue, couponRequestKey, items, destination, getCustomerIdToken]);

  // Keep saved carts within the latest catalogue stock, including carts loaded
  // from local storage or a previous signed-in session.
  useEffect(() => {
    if (!products.length) return;
    setCartItems((current) => current.flatMap((item) => {
      const variant = products.find((product) => product.id === item.productId)?.variants.find((entry) => entry.id === item.variantId);
      const stock = Math.max(0, Math.floor(Number(variant?.stock) || 0));
      if (!variant?.available || stock < 1) return [];
      return [{ ...item, quantity: Math.min(item.quantity, stock) }];
    }));
  }, [products]);

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const deliveryFee = deliveryQuote?.deliveryFee || 0;
  const total = subtotal + deliveryFee;

  const setCouponCode = (code: string) => {
    setCouponCodeValue(code.trim().toUpperCase());
    setCouponQuote(null);
    setCouponValidationError("");
    setCouponRequestKey((key) => key + 1);
  };

  const clearCoupon = () => {
    setCouponCodeValue("");
    setCouponQuote(null);
    setCouponValidationError("");
    setCouponValidationLoading(false);
  };

  const addItem = (productId: string, variantId: string, quantity = 1) => {
    const product = products.find(entry => entry.id === productId);
    const variant = product?.variants.find(entry => entry.id === variantId);
    const stock = Math.max(0, Math.floor(Number(variant?.stock) || 0));
    if (!variant?.available || stock < 1) return 0;
    const existingQuantity = itemsRef.current.find((item) => item.productId === productId && item.variantId === variantId)?.quantity || 0;
    const acceptedQuantity = Math.min(Math.max(0, Math.floor(quantity)), Math.max(0, stock - existingQuantity));
    if (!acceptedQuantity) return 0;
    setCouponQuote(null);
    trackMetaEvent("AddToCart", {
      content_type: "product",
      content_ids: [productId],
      contents: [{ id: productId, quantity: acceptedQuantity, item_price: Number(variant?.price || 0) }],
      value: Number(variant?.price || 0) * acceptedQuantity,
      currency: "INR",
      content_name: product?.name,
      content_category: product?.category,
    });
    setCartItems((current) => {
      const match = current.find((item) => item.productId === productId && item.variantId === variantId);
      if (match) {
        return current.map((item) => item.productId === productId && item.variantId === variantId
          ? { ...item, quantity: Math.min(stock, item.quantity + acceptedQuantity) }
          : item);
      }
      return [...current, { productId, variantId, quantity: acceptedQuantity }];
    });
    return acceptedQuantity;
  };

  const updateQuantity = (productId: string, variantId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId, variantId);
      return;
    }
    const variant = products.find((product) => product.id === productId)?.variants.find((entry) => entry.id === variantId);
    const stock = Math.max(0, Math.floor(Number(variant?.stock) || 0));
    if (!variant?.available || stock < 1) {
      removeItem(productId, variantId);
      return;
    }
    quantity = Math.min(Math.floor(quantity), stock);
    setCouponQuote(null);
    setCartItems((current) => current.map((item) =>
      item.productId === productId && item.variantId === variantId ? { ...item, quantity } : item));
  };

  const removeItem = (productId: string, variantId: string) => {
    setCouponQuote(null);
    setCartItems((current) => current.filter((item) => !(item.productId === productId && item.variantId === variantId)));
  };

  const clearCart = () => {
    setCartItems([]);
    clearCoupon();
  };

  const retryCartSync = () => {
    if (user?.uid) setCartSyncReadyFor(user.uid);
    setCartItems((current) => [...current]);
  };

  return (
    <CartContext.Provider value={{
      items, resolvedItems, itemCount, subtotal, deliveryFee, total,
      deliveryDistanceKm: deliveryQuote?.distanceKm || 0,
      deliveryRatePerKm: deliveryQuote?.ratePerKm || 10,
      deliveryOriginAddress: deliveryQuote?.originAddress || "",
      deliveryDistanceMethod: deliveryQuote?.distanceMethod || "road",
      deliveryLocationPrecision: deliveryQuote?.locationPrecision || "pincode_estimate",
      deliveryQuoteLoading,
      deliveryQuoteError,
      couponCode: couponCodeValue, couponQuote, couponValidationLoading, couponValidationError,
      setCouponCode, clearCoupon, addItem, updateQuantity, removeItem, clearCart,
      cartSyncStatus, retryCartSync,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}

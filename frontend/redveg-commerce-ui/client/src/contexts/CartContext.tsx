import type { CartItem, Product, ProductVariant } from "@/types/commerce";
import { apiFetch, unwrapApiData } from "@/lib/api";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

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
  couponCode: string;
  couponQuote: CouponQuote | null;
  couponValidationLoading: boolean;
  couponValidationError: string;
  setCouponCode: (code: string) => void;
  clearCoupon: () => void;
  addItem: (productId: string, variantId: string, quantity?: number) => void;
  updateQuantity: (productId: string, variantId: string, quantity: number) => void;
  removeItem: (productId: string, variantId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "redveg-cart-v1";
const COUPON_STORAGE_KEY = "redveg-coupon-v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [, setLoading] = useState(true);
  const [couponCodeValue, setCouponCodeValue] = useState(() => {
    try { return localStorage.getItem(COUPON_STORAGE_KEY) || ""; } catch { return ""; }
  });
  const [couponRequestKey, setCouponRequestKey] = useState(0);
  const [couponQuote, setCouponQuote] = useState<CouponQuote | null>(null);
  const [couponValidationLoading, setCouponValidationLoading] = useState(false);
  const [couponValidationError, setCouponValidationError] = useState("");

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
    apiFetch("coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponCodeValue, cartItems: items }),
      signal: controller.signal,
    }, { forceBackend: true })
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
  }, [couponCodeValue, couponRequestKey, items]);

  const resolvedItems = useMemo<ResolvedCartItem[]>(
    () => items.flatMap((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      const variant = product?.variants.find((entry) => entry.id === item.variantId);
      if (!product || !variant) return [];
      return [{ ...item, product, variant, lineTotal: variant.price * item.quantity }];
    }),
    [items, products],
  );

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const deliveryFee = subtotal === 0 || subtotal >= 799 ? 0 : 49;
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
    setCouponQuote(null);
    setItems((current) => {
      const match = current.find((item) => item.productId === productId && item.variantId === variantId);
      if (match) {
        return current.map((item) => item.productId === productId && item.variantId === variantId
          ? { ...item, quantity: item.quantity + quantity }
          : item);
      }
      return [...current, { productId, variantId, quantity }];
    });
  };

  const updateQuantity = (productId: string, variantId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId, variantId);
      return;
    }
    setCouponQuote(null);
    setItems((current) => current.map((item) =>
      item.productId === productId && item.variantId === variantId ? { ...item, quantity } : item));
  };

  const removeItem = (productId: string, variantId: string) => {
    setCouponQuote(null);
    setItems((current) => current.filter((item) => !(item.productId === productId && item.variantId === variantId)));
  };

  const clearCart = () => {
    setItems([]);
    clearCoupon();
  };

  return (
    <CartContext.Provider value={{
      items, resolvedItems, itemCount, subtotal, deliveryFee, total,
      couponCode: couponCodeValue, couponQuote, couponValidationLoading, couponValidationError,
      setCouponCode, clearCoupon, addItem, updateQuantity, removeItem, clearCart,
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

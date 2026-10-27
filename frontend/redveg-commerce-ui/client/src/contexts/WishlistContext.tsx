import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type WishlistContextValue = {
  favoriteIds: Set<string>;
  loading: boolean;
  loadError: string | null;
  toggleFavorite: (productId: string) => Promise<boolean>;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, getCustomerIdToken } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setFavoriteIds(new Set());
    setLoadError(null);
    if (!user?.uid) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void (async () => {
      try {
        const token = await getCustomerIdToken();
        if (!token) return;
        const response = await apiFetch("customers/me/favorites", {}, { forceBackend: true, authToken: token });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success || !Array.isArray(payload.data)) throw new Error(payload?.message || "Unable to load saved products");
        if (active) setFavoriteIds(new Set(payload.data.map(String)));
      } catch (error) {
        console.error("Unable to load saved products:", error);
        if (active) setLoadError(error instanceof Error ? error.message : "Unable to load saved products.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.uid, getCustomerIdToken]);

  const toggleFavorite = useCallback(async (productId: string) => {
    const token = await getCustomerIdToken();
    if (!token) throw new Error("Please sign in to save products.");
    const isSaved = favoriteIds.has(productId);
    const response = await apiFetch(`customers/me/favorites/${encodeURIComponent(productId)}`, {
      method: isSaved ? "DELETE" : "PUT",
    }, { forceBackend: true, authToken: token });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) throw new Error(payload?.message || "Unable to update saved products.");
    setFavoriteIds(current => {
      const next = new Set(current);
      if (isSaved) next.delete(productId);
      else next.add(productId);
      return next;
    });
    return !isSaved;
  }, [favoriteIds, getCustomerIdToken]);

  return <WishlistContext.Provider value={{ favoriteIds, loading, loadError, toggleFavorite }}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used within WishlistProvider");
  return context;
}

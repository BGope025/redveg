import { useState } from "react";
import { useLocation } from "wouter";
import { Heart, LoaderCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useWishlist } from "@/contexts/WishlistContext";
import type { Product } from "@/types/commerce";

export function ProductCardActions({ product }: { product: Product }) {
  const { user } = useAuth();
  const { favoriteIds, toggleFavorite } = useWishlist();
  const [, setLocation] = useLocation();
  const [saving, setSaving] = useState(false);
  const saved = favoriteIds.has(product.id);

  const toggle = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      setLocation(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const nextSaved = await toggleFavorite(product.id);
      toast.success(nextSaved ? "Saved to your favorites" : "Removed from favorites", { description: product.name });
    } catch (error) {
      toast.error("Could not update favorites", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const share = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const url = `${window.location.origin}/product/${encodeURIComponent(product.slug)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, text: product.shortDescription || `See ${product.name} at RedVeg`, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Product link copied", { description: "Share it with your friends." });
      } else {
        throw new Error("Sharing is unavailable in this browser.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this product", { description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  const buttonClass = "grid size-10 place-items-center rounded-full bg-white/95 text-[#3A2C28] shadow-[0_4px_14px_rgba(47,28,24,.16)] ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:text-[#B4232C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4232C]";

  return (
    <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
      <button type="button" onClick={toggle} disabled={saving} aria-label={saved ? `Remove ${product.name} from favorites` : `Save ${product.name} to favorites`} aria-pressed={saved} className={buttonClass}>
        {saving ? <LoaderCircle className="size-5 animate-spin" /> : <Heart className={`size-5 ${saved ? "fill-[#B4232C] text-[#B4232C]" : ""}`} />}
      </button>
      <button type="button" onClick={share} aria-label={`Share ${product.name}`} className={buttonClass}>
        <Send className="size-[18px]" />
      </button>
    </div>
  );
}

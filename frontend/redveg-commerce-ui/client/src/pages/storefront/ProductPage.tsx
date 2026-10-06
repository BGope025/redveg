import { ProductCard } from "@/components/storefront/ProductCard";
import { StoreShell } from "@/components/storefront/StoreShell";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useLocation } from "@/contexts/LocationContext";
import {
  BadgeCheck,
  ChevronLeft,
  Clock3,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Star,
  ThermometerSnowflake,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { apiFetch, unwrapApiData } from "@/lib/api";
import { brandedCatalogImage } from "@/lib/catalogImages";
import { Link, useRoute } from "wouter";
import type { Product } from "@/types/commerce";

export default function ProductPage() {
  const [, params] = useRoute("/product/:slug");
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { location } = useLocation();

  useEffect(() => {
    const fetchProductData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch all products (could be optimized to fetch just one, but we need related products too)
        const response = await apiFetch("products");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("API returned non-JSON response");
        }

        const productsPayload = await response.json();
        const productsData = unwrapApiData<Product[]>(productsPayload, []);

        if (!Array.isArray(productsData)) {
          throw new Error("Invalid products data format");
        }

        // Find the product by slug
        const productSlug = params?.slug ?? "";
        const foundProduct =
          productsData.find(entry => entry.slug === productSlug) ?? null;

        if (!foundProduct) {
          setError("Product not found");
          return;
        }

        setProduct(foundProduct);

        // Set default variant if product exists and has variants
        if (
          foundProduct &&
          foundProduct.variants &&
          foundProduct.variants.length > 0
        ) {
          const availableVariant = foundProduct.variants.find(
            variant => variant.available
          );
          setVariantId(
            availableVariant?.id ?? foundProduct.variants[0]?.id ?? ""
          );
        } else if (foundProduct) {
          // Edge case: product with no variants
          setVariantId("");
        }

        // Find related products (same category or featured, excluding current product)
        if (foundProduct) {
          const relatedProducts = productsData
            .filter(
              entry =>
                entry.id !== foundProduct.id &&
                (entry.category === foundProduct.category || entry.featured)
            )
            .slice(0, 4);
          setRelated(relatedProducts);
        }
      } catch (error: any) {
        console.error("Error fetching product data:", error);
        setError(error.message);
        toast.error("Failed to load product details");
      } finally {
        setLoading(false);
      }
    };

    fetchProductData();
  }, [params?.slug]);

  if (loading) {
    return (
      <StoreShell>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
        </div>
      </StoreShell>
    );
  }

  if (error || !product) {
    return (
      <StoreShell>
        <div className="container py-12 text-center">
          <div className="rounded-[1.5rem] border border-dashed border-red-200 bg-red-50/50 px-6 py-16">
            <h3 className="font-black text-red-600">Product not found</h3>
            <p className="mt-2 text-sm text-red-800/80">
              {error ||
                "The product you're looking for doesn't exist or is currently unavailable."}
            </p>
            <Link
              href="/shop"
              className="mt-6 inline-block rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
            >
              Back to shop
            </Link>
          </div>
        </div>
      </StoreShell>
    );
  }

  const variant =
    product.variants?.find(entry => entry.id === variantId) ??
    product.variants?.[0] ??
    null;
  const stockRemaining = Number(variant?.stock ?? 0);
  const isLowStock = Boolean(
    variant?.available && stockRemaining > 0 && stockRemaining <= 9
  );
  const { addItem } = useCart();
  const deliveryAddress = location
    ? `${location.area}, ${location.city} ${location.pincode}`
    : null;
  const deliveryMessage = !location
    ? "Choose a delivery location to check availability."
    : location.isServiceable === false
      ? `Delivery is currently unavailable to ${deliveryAddress}.`
      : `Delivery available to ${deliveryAddress} today.`;

  const add = () => {
    if (!variant) {
      toast.error("This product has no available pack size yet");
      return;
    }
    addItem(product.id, variant.id, quantity);
    toast.success("Added to your basket", {
      description: `${quantity} × ${product.name} (${variant.label})`,
    });
  };

  return (
    <StoreShell>
      <div className="container py-6 sm:py-10">
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition hover:text-[#B4232C]"
        >
          <ChevronLeft className="size-4" /> Back to fresh cuts
        </Link>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-14">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#F5EFE9] shadow-[0_20px_55px_rgba(61,33,27,.08)]">
            {product.image || brandedCatalogImage(product.name) ? (
              <img
                src={product.image || brandedCatalogImage(product.name)}
                alt={product.name}
                className="aspect-[4/3] size-full object-contain p-5"
              />
            ) : (
              <div className="grid aspect-[4/3] place-items-center p-6 text-center text-sm font-bold text-muted-foreground">
                Image unavailable
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center">
            {product.badge && (
              <span className="w-fit rounded-full bg-[#FCE8E7] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#B4232C]">
                {product.badge}
              </span>
            )}
            <h1 className="mt-4 font-display text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              {product.name}
            </h1>
            <p className="mt-3 text-base font-semibold text-muted-foreground">
              {product.shortDescription}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              {product.rating != null &&
                Number.isFinite(Number(product.rating)) && (
                  <span className="flex items-center gap-1 font-black text-[#267345]">
                    <Star className="size-4 fill-current" /> {product.rating}
                  </span>
                )}
              {product.reviewCount != null && (
                <span className="text-muted-foreground">
                  {product.reviewCount} verified reviews
                </span>
              )}
              {product.deliveryMinutes != null &&
                Number.isFinite(Number(product.deliveryMinutes)) && (
                  <span className="flex items-center gap-1.5 font-bold">
                    <Clock3 className="size-4 text-[#B4232C]" /> Delivery in{" "}
                    {product.deliveryMinutes} min
                  </span>
                )}
            </div>
            <p className="mt-7 max-w-xl text-sm leading-7 text-[#655955]">
              {product.description}
            </p>
            <div className="mt-8">
              <p className="text-xs font-black uppercase tracking-[0.15em] text-muted-foreground">
                Choose pack size
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {product.variants?.length ? (
                  product.variants.map(entry => (
                    <button
                      key={entry.id}
                      disabled={!entry.available}
                      onClick={() => setVariantId(entry.id)}
                      className={`min-w-28 rounded-2xl border p-3 text-left transition ${entry.id === variantId ? "border-[#B4232C] bg-[#FCE9E8] shadow-[0_0_0_3px_rgba(180,35,44,.08)]" : "border-[#E2D8D2] bg-white hover:border-[#B4232C]/40"} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <span className="block text-sm font-black">
                        {entry.label}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {entry.available ? `₹${entry.price}` : "Unavailable"}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm font-bold text-red-600">
                    Currently unavailable
                  </p>
                )}
              </div>
            </div>
            {isLowStock && (
              <p className="mt-3 text-sm font-black text-[#B4232C]">
                Only {stockRemaining} left in stock — order soon
              </p>
            )}
            <div className="mt-7 flex items-center gap-4">
              <div>
                <p className="text-3xl font-black tracking-tight">
                  ₹{variant ? variant.price * quantity : 0}
                </p>
                {variant?.mrp && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="line-through">
                      ₹{variant.mrp * quantity}
                    </span>{" "}
                    · You save ₹{(variant.mrp - variant.price) * quantity}
                  </p>
                )}
              </div>
              <div className="ml-auto flex h-12 items-center rounded-full border border-[#E2D8D2] bg-white p-1">
                <button
                  onClick={() =>
                    setQuantity(current => Math.max(1, current - 1))
                  }
                  className="grid size-9 place-items-center rounded-full hover:bg-[#F6F1EC]"
                  aria-label="Decrease quantity"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-8 text-center text-sm font-black">
                  {quantity}
                </span>
                <button
                  onClick={() =>
                    setQuantity(current => Math.min(10, current + 1))
                  }
                  className="grid size-9 place-items-center rounded-full hover:bg-[#F6F1EC]"
                  aria-label="Increase quantity"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
            <Button
              onClick={add}
              disabled={!variant?.available}
              className="mt-6 h-14 rounded-full bg-[#B4232C] text-base font-black text-white shadow-[0_14px_32px_rgba(180,35,44,.22)] hover:bg-[#951D24]"
            >
              {variant
                ? `Add to basket · ₹${variant.price * quantity}`
                : "Currently unavailable"}
            </Button>
            <div
              className={`mt-5 flex items-center gap-3 rounded-2xl p-4 text-sm ${location?.isServiceable === false ? "bg-[#FCE8E7] text-[#8F1D25]" : "bg-[#EAF4E8] text-[#275F3C]"}`}
            >
              <MapPin className="size-5 shrink-0" />
              <span>
                {location?.isServiceable === false ? (
                  <strong>Delivery unavailable</strong>
                ) : location ? (
                  <strong>Delivery available</strong>
                ) : (
                  <strong>Delivery location</strong>
                )}{" "}
                {deliveryMessage.replace(
                  /^(Delivery available|Delivery is currently unavailable)\s*/,
                  ""
                )}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-xs font-bold text-muted-foreground sm:grid-cols-3">
              <span className="flex items-center gap-2">
                <ThermometerSnowflake className="size-4 text-[#267345]" />{" "}
                Temperature controlled
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-[#267345]" /> Hygienically
                packed
              </span>
              <span className="flex items-center gap-2">
                <BadgeCheck className="size-4 text-[#267345]" /> Quality checked
              </span>
            </div>
          </div>
        </div>
      </div>
      <section className="mt-12 bg-[#F6F1EC] py-16">
        <div className="container">
          <h2 className="font-display text-3xl font-black tracking-[-0.04em]">
            You may also like
          </h2>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {related.map(entry => (
              <ProductCard key={entry.id} product={entry} />
            ))}
          </div>
        </div>
      </section>
    </StoreShell>
  );
}

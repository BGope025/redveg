import { ProductCard } from "@/components/storefront/ProductCard";
import { StoreShell } from "@/components/storefront/StoreShell";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
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
import { formatISTDate } from "@/lib/dateTime";
import { Link, useRoute } from "wouter";
import type { Product } from "@/types/commerce";
import { cleanSeoText, SeoMetadata } from "@/components/storefront/SeoMetadata";
import { trackMetaEvent } from "@/lib/metaPixel";
import { ProductCardActions } from "@/components/storefront/ProductCardActions";

type ProductReviewsPayload = {
  reviewCount: number;
  averageRating: number | null;
  reviews: Array<{ rating: number; text: string; createdAt: string; verifiedPurchase: boolean }>;
  eligibleOrders: Array<{ id: string; createdAt: string }>;
  customerReview?: { rating: number; text: string; orderId: string } | null;
};

export default function ProductPage() {
  const [, params] = useRoute("/product/:slug");
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { location } = useLocation();
  const { user, getCustomerIdToken } = useAuth();
  const [reviews, setReviews] = useState<ProductReviewsPayload | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewOrderId, setReviewOrderId] = useState("");
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  useEffect(() => {
    if (!product?.id) return;
    let active = true;
    setReviewsLoading(true);
    void (async () => {
      try {
        const token = await getCustomerIdToken();
        const response = await apiFetch(`products/${encodeURIComponent(product.id)}/reviews`, {}, {
          forceBackend: true,
          ...(token ? { authToken: token } : {}),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) throw new Error(payload?.message || "Unable to load reviews.");
        if (!active) return;
        const data = payload.data as ProductReviewsPayload;
        setReviews(data);
        setReviewOrderId(data.eligibleOrders?.[0]?.id || data.customerReview?.orderId || "");
        if (data.customerReview) {
          setReviewRating(data.customerReview.rating);
          setReviewText(data.customerReview.text);
        }
        setProduct(current => current && current.id === product.id
          ? { ...current, rating: data.averageRating, reviewCount: data.reviewCount }
          : current);
      } catch (loadError) {
        if (active) console.error("Unable to load product reviews:", loadError);
      } finally {
        if (active) setReviewsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [product?.id, user?.uid, getCustomerIdToken]);

  const submitReview = async () => {
    if (!product || !reviewOrderId) return;
    setReviewSubmitting(true);
    try {
      const token = await getCustomerIdToken();
      if (!token) throw new Error("Please sign in again to submit your review.");
      const response = await apiFetch(`products/${encodeURIComponent(product.id)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: reviewOrderId, rating: reviewRating, text: reviewText }),
      }, { forceBackend: true, authToken: token });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "Unable to save your review.");
      const data = payload.data as ProductReviewsPayload;
      setReviews(data);
      setProduct(current => current && current.id === product.id
        ? { ...current, rating: data.averageRating, reviewCount: data.reviewCount }
        : current);
      toast.success("Review saved", { description: "Thanks for sharing your experience." });
    } catch (submitError) {
      toast.error("Could not save review", { description: submitError instanceof Error ? submitError.message : "Please try again." });
    } finally {
      setReviewSubmitting(false);
    }
  };

  useEffect(() => {
    if (!product) return;
    trackMetaEvent("ViewContent", {
      content_type: "product",
      content_ids: [product.id],
      content_name: product.name,
      content_category: product.category,
      currency: "INR",
      value: product.variants.length
        ? Math.min(...product.variants.map(item => Number(item.price)).filter(Number.isFinite))
        : undefined,
    });
  }, [product?.id]);

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
        <SeoMetadata
          title={`${(params?.slug || "Fresh cuts").replace(/-/g, " ")} in Kolkata | RedVeg`}
          description="Browse RedVeg's fresh chicken, mutton, fish, hilsa (ilish), prawns and seafood catalogue in Kolkata. Check current products and delivery availability for your area."
          canonicalPath={`/product/${encodeURIComponent(params?.slug || "")}`}
        />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
        </div>
      </StoreShell>
    );
  }

  if (error || !product) {
    return (
      <StoreShell>
        <SeoMetadata
          title="Product unavailable | RedVeg"
          description="This RedVeg product page is unavailable. Browse the current fresh chicken, mutton, fish and seafood catalogue."
          canonicalPath="/shop"
          noIndex
        />
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
  const productDescription = cleanSeoText(
    product.shortDescription || product.description || `${product.name} from RedVeg's Kolkata catalogue, based near Dum Dum. Check live availability and delivery to your area.`,
    280
  );
  const productTitle = `${product.name} Online in Kolkata | RedVeg`;
  const productUrl = `https://redveg.in/product/${encodeURIComponent(product.slug)}`;
  const productOffers = (product.variants || []).map(entry => ({
    "@type": "Offer",
    url: productUrl,
    priceCurrency: "INR",
    price: Number(entry.price),
    availability: entry.available && Number(entry.stock) > 0
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    name: entry.label,
  })).filter(offer => Number.isFinite(offer.price) && offer.price > 0);
  const productSchema = productOffers.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: productDescription,
    image: product.image ? [product.image] : undefined,
    category: product.category,
    brand: { "@type": "Brand", name: "RedVeg" },
    url: productUrl,
    offers: productOffers.length === 1 ? productOffers[0] : {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: Math.min(...productOffers.map(offer => offer.price)),
      highPrice: Math.max(...productOffers.map(offer => offer.price)),
      offerCount: productOffers.length,
      offers: productOffers,
    },
  } : null;
  const stockRemaining = Math.max(0, Math.floor(Number(variant?.stock ?? 0)));
  const { addItem, items: cartItems } = useCart();
  const alreadyInCart = cartItems.find((item) => item.productId === product.id && item.variantId === variant?.id)?.quantity || 0;
  const remainingStock = Math.max(0, stockRemaining - alreadyInCart);
  const displayedQuantity = remainingStock > 0 ? Math.min(quantity, remainingStock) : 0;
  const isLowStock = Boolean(
    variant?.available && stockRemaining > 0 && stockRemaining <= 9
  );
  const deliveryAddress = location
    ? `${location.area}, ${location.city} ${location.pincode}`
    : null;
  const deliveryMessage = !location
    ? "Choose a delivery location to check availability."
    : location.isServiceable === false
      ? `Delivery is currently unavailable to ${deliveryAddress}.`
      : `Delivery available to ${deliveryAddress} today.`;

  const add = () => {
    if (!variant || !variant.available || remainingStock < 1) {
      toast.error("This pack size is currently unavailable");
      return;
    }
    const addedQuantity = addItem(product.id, variant.id, displayedQuantity);
    if (!addedQuantity) {
      toast.error("No more stock is available for this pack size");
      return;
    }
    toast.success("Added to your basket", {
      description: `${addedQuantity} × ${product.name} (${variant.label})${addedQuantity < displayedQuantity ? ` · only ${remainingStock} more in stock` : ""}`,
    });
  };

  return (
    <StoreShell>
      <SeoMetadata
        title={productTitle}
        description={productDescription}
        canonicalPath={`/product/${encodeURIComponent(product.slug)}`}
        structuredData={productSchema}
      />
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
            <ProductCardActions product={product} />
            {product.rating != null && Number.isFinite(Number(product.rating)) && (
              <div className="absolute bottom-4 left-4 z-10 inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-2 text-sm font-black text-[#267345] shadow-sm ring-1 ring-black/5">
                <Star className="size-4 fill-current" /> {Number(product.rating).toFixed(1)}
                {product.reviewCount != null && Number.isFinite(Number(product.reviewCount)) && Number(product.reviewCount) > 0 && (
                  <span className="font-bold text-[#71645F]">· {Number(product.reviewCount).toLocaleString("en-IN")}</span>
                )}
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
                {product.variants?.some(entry => entry.pieceSize) ? "Choose pack and piece size" : "Choose pack size"}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {product.variants?.length ? (
                  product.variants.map(entry => (
                    <button
                      key={entry.id}
                      onClick={() => { setVariantId(entry.id); setQuantity(1); }}
                    aria-pressed={entry.id === variantId}
                    className={`min-w-28 rounded-2xl border p-3 text-left transition ${entry.id === variantId ? "border-[#B4232C] bg-[#FCE9E8] shadow-[0_0_0_3px_rgba(180,35,44,.08)]" : "border-[#E2D8D2] bg-white hover:border-[#B4232C]/40"} ${entry.available ? "" : "border-dashed text-[#8F1D25]"}`}
                    >
                      <span className="block text-sm font-black">
                        {entry.label}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {entry.available ? `₹${entry.price}` : "Stock Unavailable"}
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
            {variant && !variant.available && (
              <p className="mt-3 text-sm font-black text-[#8F1D25]">Stock Unavailable</p>
            )}
            <div className="mt-7 flex items-center gap-4">
              <div>
                <p className="text-3xl font-black tracking-tight">
                  ₹{variant ? variant.price * displayedQuantity : 0}
                </p>
                {variant?.mrp && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="line-through">
                      ₹{variant.mrp * displayedQuantity}
                    </span>{" "}
                    · You save ₹{(variant.mrp - variant.price) * displayedQuantity}
                  </p>
                )}
              </div>
              <div className="ml-auto flex h-12 items-center rounded-full border border-[#E2D8D2] bg-white p-1">
                <button
                  onClick={() =>
                    setQuantity(current => Math.max(1, current - 1))
                  }
                  disabled={quantity <= 1}
                  className="grid size-9 place-items-center rounded-full hover:bg-[#F6F1EC]"
                  aria-label="Decrease quantity"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-8 text-center text-sm font-black">
                    {displayedQuantity}
                </span>
                <button
                  onClick={() =>
                    setQuantity(current => Math.min(Math.max(1, remainingStock), current + 1))
                  }
                  disabled={!variant?.available || quantity >= remainingStock}
                  className="grid size-9 place-items-center rounded-full hover:bg-[#F6F1EC]"
                  aria-label="Increase quantity"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
            <Button
              onClick={add}
              disabled={!variant?.available || remainingStock < 1}
              className="mt-6 h-14 rounded-full bg-[#B4232C] text-base font-black text-white shadow-[0_14px_32px_rgba(180,35,44,.22)] hover:bg-[#951D24]"
            >
              {variant
                ? variant.available && remainingStock > 0
                  ? `Add to basket · ₹${variant.price * displayedQuantity}`
                  : "Stock limit reached"
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
        <section className="mt-12 rounded-[1.75rem] border border-[#E9DED7] bg-white p-5 shadow-sm sm:p-8" aria-labelledby="product-reviews-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#B4232C]">Verified customer feedback</p>
              <h2 id="product-reviews-title" className="mt-2 font-display text-3xl font-black tracking-[-0.04em]">Ratings &amp; reviews</h2>
            </div>
            <div className="flex items-center gap-2 text-sm font-black text-[#267345]">
              <Star className="size-4 fill-current" />
              {reviews?.averageRating != null ? Number(reviews.averageRating).toFixed(1) : "New"}
              <span className="font-semibold text-[#71645F]">· {reviews?.reviewCount ?? product.reviewCount ?? 0} reviews</span>
            </div>
          </div>
          {user && reviews?.eligibleOrders?.length ? (
            <div className="mt-6 rounded-2xl bg-[#F8F4F0] p-4 sm:p-5">
              <p className="font-black">{reviews.customerReview ? "Update your review" : "Share your experience"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Only customers with a delivered order for this product can review it.</p>
              <label className="mt-4 block text-sm font-bold" htmlFor="review-order">Delivered order</label>
              <select id="review-order" value={reviewOrderId} onChange={event => setReviewOrderId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#DED2CB] bg-white px-3 text-sm sm:max-w-md">
                {reviews.eligibleOrders.map(order => <option key={order.id} value={order.id}>{order.id} · {formatISTDate(order.createdAt)}</option>)}
              </select>
              <div className="mt-4 flex items-center gap-1" role="group" aria-label="Choose a rating">
                {[1, 2, 3, 4, 5].map(value => <button key={value} type="button" aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-pressed={reviewRating === value} onClick={() => setReviewRating(value)} className="rounded p-1 text-[#D39924] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4232C]"><Star className={`size-7 ${value <= reviewRating ? "fill-current" : ""}`} /></button>)}
              </div>
              <label className="mt-3 block text-sm font-bold" htmlFor="review-text">Review (optional)</label>
              <textarea id="review-text" maxLength={1000} value={reviewText} onChange={event => setReviewText(event.target.value)} placeholder="How was the product?" className="mt-2 min-h-24 w-full rounded-xl border border-[#DED2CB] bg-white p-3 text-sm" />
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">{reviewText.length}/1000</span>
                <Button onClick={() => void submitReview()} disabled={reviewSubmitting || !reviewOrderId} className="rounded-full bg-[#B4232C] px-5 font-bold text-white hover:bg-[#921B22]">{reviewSubmitting ? "Saving…" : "Save review"}</Button>
              </div>
            </div>
          ) : !user ? (
            <p className="mt-5 rounded-xl bg-[#F8F4F0] p-4 text-sm text-[#655955]">Sign in and place a delivered order to leave a verified review.</p>
          ) : reviewsLoading ? (
            <p className="mt-5 text-sm text-muted-foreground">Checking your delivered orders…</p>
          ) : (
            <p className="mt-5 rounded-xl bg-[#F8F4F0] p-4 text-sm text-[#655955]">Reviews are available after this product has been delivered to you.</p>
          )}
          <div className="mt-6 divide-y divide-[#EEE6E0]">
            {reviews?.reviews.map((entry, index) => <article key={`${entry.createdAt}-${index}`} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2 text-sm"><span className="flex items-center gap-1 font-black text-[#267345]"><Star className="size-4 fill-current" />{entry.rating}.0</span><span className="rounded-full bg-[#EAF4E8] px-2 py-0.5 text-[0.68rem] font-bold text-[#267345]">Verified purchase</span><time className="text-xs text-muted-foreground">{formatISTDate(entry.createdAt)}</time></div>
              {entry.text && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#514641]">{entry.text}</p>}
            </article>)}
            {!reviewsLoading && reviews && reviews.reviewCount === 0 && <p className="py-5 text-sm text-muted-foreground">No reviews yet. Be the first verified customer to rate this product.</p>}
          </div>
        </section>
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

import { ProductCard } from "@/components/storefront/ProductCard";
import { GoogleReviewsCarousel } from "@/components/storefront/GoogleReviewsCarousel";
import { StoreShell } from "@/components/storefront/StoreShell";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  ShieldCheck,
  ThermometerSnowflake,
} from "lucide-react";
import { Link } from "wouter";
import { CampaignWhatsAppButton } from "@/components/storefront/CampaignWhatsAppButton";
import { isWhatsAppCampaignUrl } from "@/lib/campaignWhatsapp";
import { useEffect, useState } from "react";
import HeroSlideshow from "@/components/HeroSlideshow";
import { useCampaign } from "@/contexts/CampaignContext";
import { apiFetch, normalizeCategorySlug, unwrapApiData } from "@/lib/api";
import type { Category, Product } from "@/types/commerce";

const promises = [
  {
    icon: ThermometerSnowflake,
    title: "Freshness locked",
    text: "Temperature-controlled handling from source to doorstep.",
  },
  {
    icon: ShieldCheck,
    title: "Cleaned with care",
    text: "Hygienic cuts prepared by trained specialists.",
  },
  {
    icon: Clock3,
    title: "Quick local delivery",
    text: "Clear delivery windows across serviceable Kolkata areas.",
  },
];

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activeCampaigns } = useCampaign();
  const collectionCampaigns = activeCampaigns.filter(campaign =>
    campaign.placement === "collection_module" || campaign.placement === "both"
  );
  const [collectionCampaignIndex, setCollectionCampaignIndex] = useState(0);
  const campaignIds = collectionCampaigns.map(campaign => campaign.id).join("|");
  const activeCampaign = collectionCampaigns.length
    ? collectionCampaigns[collectionCampaignIndex % collectionCampaigns.length]
    : null;

  useEffect(() => {
    setCollectionCampaignIndex(0);
  }, [campaignIds]);

  useEffect(() => {
    if (collectionCampaigns.length < 2) return;
    const timer = window.setInterval(() => {
      setCollectionCampaignIndex(index => (index + 1) % collectionCampaigns.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [collectionCampaigns.length]);

  useEffect(() => {
    let cancelled = false;
    const fetchHomeData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [categoriesResponse, productsResponse] = await Promise.all([
          apiFetch("categories", { cache: "no-store" }),
          apiFetch("products?limit=8"),
        ]);
        if (!categoriesResponse.ok)
          throw new Error(
            `Failed to fetch categories: ${categoriesResponse.status}`
          );
        if (!productsResponse.ok)
          throw new Error(
            `Failed to fetch products: ${productsResponse.status}`
          );
        const categoriesPayload = await categoriesResponse.json();
        const productsPayload = await productsResponse.json();
        if (!cancelled) {
          setCategories(unwrapApiData<Category[]>(categoriesPayload, []));
          setProducts(unwrapApiData<Product[]>(productsPayload, []));
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load storefront"
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchHomeData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshCategoryImages = async () => {
      try {
        const response = await apiFetch("categories", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (active) setCategories(unwrapApiData<Category[]>(payload, []));
      } catch (refreshError) {
        console.warn("Could not refresh category images:", refreshError);
      }
    };
    const interval = window.setInterval(() => void refreshCategoryImages(), 30000);
    window.addEventListener("focus", refreshCategoryImages);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshCategoryImages);
    };
  }, []);

  if (loading) {
    return (
      <StoreShell>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
        </div>
      </StoreShell>
    );
  }

  return (
    <StoreShell>
      <section className="container pt-5 sm:pt-7">
        <HeroSlideshow />
      </section>

      {activeCampaign &&
        (activeCampaign.placement === "collection_module" ||
          activeCampaign.placement === "both") && (
          <section className="container pt-6 sm:pt-10">
            <div
              key={activeCampaign.id}
              className="group relative overflow-hidden rounded-[2rem] p-8 sm:p-12 animate-in fade-in slide-in-from-right-3 duration-500"
              style={{ backgroundColor: activeCampaign.backgroundColor }}
            >
              {(activeCampaign.backgroundPattern ||
                activeCampaign.collectionImageUrl ||
                activeCampaign.desktopImageUrl) && (
                <div
                  className="absolute inset-0 opacity-20 transition-transform duration-700 group-hover:scale-105"
                  style={{
                    backgroundImage: `url(${activeCampaign.backgroundPattern || activeCampaign.collectionImageUrl || activeCampaign.desktopImageUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              )}
              <div className="relative z-10 flex max-w-2xl flex-col items-start gap-4">
                {activeCampaign.logoVariant && (
                  <img
                    src={activeCampaign.logoVariant}
                    alt=""
                    className="mb-2 h-12 w-auto object-contain"
                  />
                )}
                <h2
                  className="font-display text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl"
                  style={{ color: activeCampaign.foregroundColor }}
                >
                  {activeCampaign.collectionTitle || activeCampaign.name}
                </h2>
                <p
                  className="text-lg font-medium opacity-90 sm:text-xl"
                  style={{ color: activeCampaign.foregroundColor }}
                >
                  {activeCampaign.collectionSubtitle || activeCampaign.message}
                </p>
                {activeCampaign.ctaLabel && (
                  isWhatsAppCampaignUrl(activeCampaign.destinationValue) ? (
                    <CampaignWhatsAppButton
                      href={activeCampaign.destinationValue}
                      className="mt-4 inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold shadow-sm transition-transform hover:-translate-y-0.5 active:scale-95 disabled:cursor-wait disabled:opacity-60"
                      style={{ backgroundColor: activeCampaign.buttonColor, color: activeCampaign.buttonTextColor }}
                    >
                      {activeCampaign.ctaLabel}<ArrowRight className="size-4" />
                    </CampaignWhatsAppButton>
                  ) : (
                    <Link
                      href={activeCampaign.collectionLink || activeCampaign.destinationValue || "/shop"}
                      className="mt-4 inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold shadow-sm transition-transform hover:-translate-y-0.5 active:scale-95"
                      style={{ backgroundColor: activeCampaign.buttonColor, color: activeCampaign.buttonTextColor }}
                    >
                      {activeCampaign.ctaLabel}<ArrowRight className="size-4" />
                    </Link>
                  )
                )}
              </div>
              {activeCampaign.accentColor && (
                <div
                  className="absolute -right-24 -top-24 size-64 rounded-full blur-3xl opacity-30"
                  style={{ backgroundColor: activeCampaign.accentColor }}
                />
              )}
              {collectionCampaigns.length > 1 && (
                <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 sm:bottom-6 sm:right-6">
                  <span className="mr-1 text-xs font-bold text-white/80">
                    {collectionCampaignIndex + 1} / {collectionCampaigns.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Previous offer"
                    onClick={() => setCollectionCampaignIndex(index => (index - 1 + collectionCampaigns.length) % collectionCampaigns.length)}
                    className="grid size-10 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
                  >
                    <ArrowLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next offer"
                    onClick={() => setCollectionCampaignIndex(index => (index + 1) % collectionCampaigns.length)}
                    className="grid size-10 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
                  >
                    <ArrowRight className="size-5" />
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

      <section
        className="container pt-8 sm:pt-12"
        aria-labelledby="shop-by-category"
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">
              Browse fresh cuts
            </p>
            <h2
              id="shop-by-category"
              className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl"
            >
              Shop by category
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a category to see matching products from our live
              catalogue.
            </p>
          </div>
          <Link
            href="/shop"
            className="hidden items-center gap-1 text-sm font-black text-[#B4232C] sm:inline-flex"
          >
            View all <ArrowRight className="size-4" />
          </Link>
        </div>
        {error ? (
          <div className="mt-6 rounded-2xl border border-dashed border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error}
          </div>
        ) : categories.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-black/10 bg-white p-8 text-center text-sm text-muted-foreground">
            No live categories are available yet.
          </div>
        ) : (
          <div className="mt-5 -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-6">
            {categories.map(category => {
              const slug = normalizeCategorySlug(category.id || category.name);
              const matchingProduct = products.find(
                product =>
                  normalizeCategorySlug(product.category) ===
                  normalizeCategorySlug(slug)
              );
              const image =
                category.image && !category.image.includes("placeholder-")
                  ? category.image
                  : matchingProduct?.image;
              return (
                <Link
                  key={category.id}
                  href={`/shop?category=${encodeURIComponent(slug)}`}
                  aria-label={`Shop ${category.name}`}
                  className="group w-[42vw] max-w-[190px] shrink-0 snap-start overflow-hidden rounded-[1.1rem] bg-white shadow-[0_10px_30px_rgba(61,33,27,.06)] ring-1 ring-black/[0.05] transition hover:-translate-y-1 hover:shadow-[0_16px_35px_rgba(61,33,27,.12)] sm:w-auto sm:max-w-none sm:rounded-[1.35rem] sm:shrink"
                >
                  <div className="aspect-[1.25] overflow-hidden bg-[#F6F1EC] sm:aspect-square">
                    {image ? (
                      <img
                        src={image}
                        alt={category.name}
                        className="size-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div
                        className="grid size-full place-items-center text-center text-sm font-black text-[#B4232C]"
                        style={{ backgroundColor: category.accent }}
                      >
                        {category.name}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-black">{category.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {category.description || "Fresh products"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="container py-10 sm:py-14"
        aria-labelledby="featured-products"
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">
              Live catalogue
            </p>
            <h2
              id="featured-products"
              className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl"
            >
              Fresh cuts for today
            </h2>
          </div>
          <Link
            href="/shop"
            className="inline-flex items-center gap-1 text-sm font-black text-[#B4232C]"
          >
            See all <ArrowRight className="size-4" />
          </Link>
        </div>
        {products.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {products.slice(0, 8).map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-black/10 bg-white p-8 text-center text-sm text-muted-foreground">
            No active products are available yet.
          </div>
        )}
      </section>

      <section className="container grid gap-3 pb-12 sm:grid-cols-3">
        {promises.map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.05]"
          >
            <Icon className="size-5 text-[#B4232C]" />
            <h3 className="mt-3 font-black">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {text}
            </p>
          </div>
        ))}
      </section>
      <GoogleReviewsCarousel />
    </StoreShell>
  );
}

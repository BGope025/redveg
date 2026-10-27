import { ProductCard } from "@/components/storefront/ProductCard";
import { StoreShell } from "@/components/storefront/StoreShell";
import type { Category, Product } from "@/types/commerce";
import {
  ChevronDown,
  Filter,
  Search,
  SlidersHorizontal,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { apiFetch, normalizeCategorySlug, unwrapApiData } from "@/lib/api";
import { SeoMetadata } from "@/components/storefront/SeoMetadata";

const PAGE_SIZE = 8;

export default function ShopPage() {
  const [location, setLocation] = useLocation();
  const queryString = location.includes("?")
    ? location.slice(location.indexOf("?") + 1).split("#")[0]
    : typeof window !== "undefined"
      ? window.location.search.slice(1)
      : "";
  const params = new URLSearchParams(queryString);
  const urlCategory = normalizeCategorySlug(params.get("category") || "all");
  const isLegacyOffersLink = urlCategory === "offers";
  const search = params.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(search);
  const [activeSearch, setActiveSearch] = useState(search);
  const [category, setCategory] = useState(urlCategory);
  const [sort, setSort] = useState("popular");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setCategory(urlCategory);
  }, [urlCategory]);

  useEffect(() => {
    setSearchInput(search);
    setActiveSearch(search);
  }, [search]);

  useEffect(() => {
    const syncFromHistory = () => {
      const query = new URLSearchParams(window.location.search).get("q") || "";
      setSearchInput(query);
      setActiveSearch(query);
    };
    const handleSearchNavigation = (event: Event) => {
      const query = (event as CustomEvent<string>).detail || "";
      setSearchInput(query);
      setActiveSearch(query);
    };
    window.addEventListener("popstate", syncFromHistory);
    window.addEventListener("redveg:shop-search", handleSearchNavigation);
    return () => {
      window.removeEventListener("popstate", syncFromHistory);
      window.removeEventListener("redveg:shop-search", handleSearchNavigation);
    };
  }, []);

  useEffect(() => {
    if (isLegacyOffersLink) setLocation("/offers");
  }, [isLegacyOffersLink, setLocation]);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastProductElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading || loadingMore) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && hasMore) {
          setPage(prevPage => prevPage + 1);
        }
      });
      if (node) observer.current.observe(node);
    },
    [loading, loadingMore, hasMore]
  );

  // Fetch initial data or when search/sort/category changes
  useEffect(() => {
    let cancelled = false;
    const fetchShopData = async () => {
      if (category === "offers") {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        setPage(1); // Reset page on filter change

        const searchParams = new URLSearchParams();
        if (category && category !== "all")
          searchParams.set("category", category);
        if (activeSearch) searchParams.set("q", activeSearch);
        if (sort !== "popular") searchParams.set("sort", sort);
        // Load the full catalog for a selected category so the client can
        // enforce the filter even when an older backend ignores the slug.
        searchParams.set(
          "limit",
          category === "all" ? PAGE_SIZE.toString() : "500"
        );
        searchParams.set("offset", "0");

        const productPath = `products?${searchParams.toString()}`;

        const [categoriesResponse, productsResponse] = await Promise.all([
          apiFetch("categories", { cache: "no-store" }),
          apiFetch(productPath),
        ]);

        if (!categoriesResponse.ok)
          throw new Error(
            `Failed to fetch categories: ${categoriesResponse.status}`
          );
        if (!productsResponse.ok)
          throw new Error(
            `Failed to fetch products: ${productsResponse.status}`
          );

        const [categoriesPayload, productsPayload] = await Promise.all([
          categoriesResponse.json(),
          productsResponse.json(),
        ]);

        if (!cancelled) {
          setCategories(unwrapApiData<Category[]>(categoriesPayload, []));
          const newProducts = unwrapApiData<Product[]>(productsPayload, []);
          const visibleProducts =
            category === "all"
              ? newProducts
              : newProducts.filter(
                  product =>
                    normalizeCategorySlug(product.category) === category
                );
          setProducts(visibleProducts);
          setHasMore(category === "all" && newProducts.length === PAGE_SIZE);
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load catalog"
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchShopData();
    return () => {
      cancelled = true;
    };
  }, [category, activeSearch, sort]);

  // Fetch more data on scroll
  useEffect(() => {
    if (page === 1 || category !== "all") return; // Initial fetch handles categories in full

    let cancelled = false;
    const fetchMoreData = async () => {
      try {
        setLoadingMore(true);
        const searchParams = new URLSearchParams();
        if (category && category !== "all")
          searchParams.set("category", category);
        if (activeSearch) searchParams.set("q", activeSearch);
        if (sort !== "popular") searchParams.set("sort", sort);
        searchParams.set("limit", PAGE_SIZE.toString());
        searchParams.set("offset", ((page - 1) * PAGE_SIZE).toString());

        const productsResponse = await apiFetch(
          `products?${searchParams.toString()}`
        );
        if (!productsResponse.ok)
          throw new Error(`Failed to fetch more products`);

        const productsPayload = await productsResponse.json();

        if (!cancelled) {
          const newProducts = unwrapApiData<Product[]>(productsPayload, []);
          setProducts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const filteredNew = newProducts.filter(p => !existingIds.has(p.id));
            return [...prev, ...filteredNew];
          });
          setHasMore(newProducts.length === PAGE_SIZE);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoadingMore(false);
      }
    };
    fetchMoreData();
    return () => {
      cancelled = true;
    };
  }, [page, category, activeSearch, sort]);

  const selectedCategory = categories.find(
    entry => (entry.id || normalizeCategorySlug(entry.name)) === category
  );
  const categoryName = selectedCategory?.name || "Fresh cuts";
  const categoryKeyword = category === "all"
    ? "chicken, mutton, fish, hilsa (ilish), prawns and seafood"
    : category === "crabs-seafood"
      ? "crab and seafood"
      : category === "fish"
        ? "fresh fish and Bengali hilsa (ilish)"
        : category === "hilsa"
          ? "fresh hilsa (ilish) fish"
          : category === "prawns"
            ? "fresh prawns and shrimp"
        : `fresh ${categoryName.toLowerCase()}`;
  const shopTitle = category === "all"
    ? "Fresh Chicken, Fish & Meat Online in Kolkata | RedVeg"
    : `${categoryName} Online in Kolkata | RedVeg`;
  const shopDescription = `Browse ${categoryKeyword} in RedVeg's live Kolkata catalogue, based near Dum Dum. Compare available cuts, sizes and prices, then check delivery to your area.`;
  const canonicalPath = category === "all" ? "/shop" : `/shop?category=${encodeURIComponent(category)}`;
  const collectionSchema = category !== "all" && products.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${categoryName} in Kolkata`,
    description: shopDescription,
    url: `https://redveg.in${canonicalPath}`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: products.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `https://redveg.in/product/${encodeURIComponent(product.slug)}`,
        name: product.name,
      })),
    },
  } : null;

  const categoryHref = (next: string) => {
    const nextParams = new URLSearchParams(params);
    if (next === "all") nextParams.delete("category");
    else nextParams.set("category", next);
    return `/shop${nextParams.toString() ? `?${nextParams.toString()}` : ""}`;
  };

  const updateSearch = (next: string) => {
    setActiveSearch(next);
    setSearchInput(next);
    const nextParams = new URLSearchParams(params);
    if (next) nextParams.set("q", next);
    else nextParams.delete("q");
    setLocation(
      `/shop${nextParams.toString() ? `?${nextParams.toString()}` : ""}`
    );
  };

  if (isLegacyOffersLink)
    return (
      <StoreShell>
        <div className="container py-16 text-center text-sm font-bold text-muted-foreground" role="status">
          Opening current offers…
        </div>
      </StoreShell>
    );

  if (loading && page === 1)
    return (
      <StoreShell>
        <SeoMetadata
          title={shopTitle}
          description={shopDescription}
          canonicalPath={canonicalPath}
          noIndex={Boolean(activeSearch || sort !== "popular")}
        />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
        </div>
      </StoreShell>
    );
  if (error && page === 1)
    return (
      <StoreShell>
        <SeoMetadata
          title={shopTitle}
          description={shopDescription}
          canonicalPath={canonicalPath}
          noIndex
        />
        <div className="container py-12 text-center">
          <div className="rounded-[1.5rem] border border-dashed border-red-200 bg-red-50/50 px-6 py-16">
            <h3 className="font-black text-red-600">Failed to load catalog</h3>
            <p className="mt-2 text-sm text-red-800/80">{error}</p>
            <button
              onClick={() => setLocation(location)}
              className="mt-6 rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </StoreShell>
    );

  return (
    <StoreShell>
      <SeoMetadata
        title={shopTitle}
        description={shopDescription}
        canonicalPath={canonicalPath}
        noIndex={Boolean(activeSearch || sort !== "popular")}
        structuredData={collectionSchema}
      />
      <section className="border-b border-black/5 bg-[#F6F1EC]">
        <div className="container py-10 sm:py-14">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">
            Fresh catalogue
          </p>
          <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                {selectedCategory?.name || "All Fresh Cuts"}
              </h1>
            </div>
            <Link href="/" className="text-sm font-bold text-[#B4232C]">
              Home / <span className="text-muted-foreground">Shop</span>
            </Link>
          </div>
        </div>
      </section>
      <section className="container py-8 sm:py-12">
        <div className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href={categoryHref("all")}
            onClick={() => setCategory("all")}
            className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-black transition ${category === "all" ? "bg-[#B4232C] text-white" : "bg-white ring-1 ring-black/10 hover:ring-[#B4232C]/30"}`}
          >
            All
          </Link>
          {categories.map(entry => {
            const slug = normalizeCategorySlug(entry.id || entry.name);
            return (
              <Link
                key={entry.id}
                href={categoryHref(slug)}
                onClick={() => setCategory(normalizeCategorySlug(slug))}
                className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-black transition ${category === slug ? "bg-[#B4232C] text-white" : "bg-white ring-1 ring-black/10 hover:ring-[#B4232C]/30"}`}
              >
                {entry.name}
              </Link>
            );
          })}
        </div>
        <div className="mt-5 grid gap-4 rounded-[1.35rem] bg-white p-3 shadow-[0_10px_30px_rgba(61,33,27,.055)] ring-1 ring-black/[0.045] md:grid-cols-[1fr_auto_auto]">
          <form
            role="search"
            onSubmit={event => {
              event.preventDefault();
              updateSearch(searchInput.trim());
            }}
            className="relative"
          >
            <input
              type="search"
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              aria-label="Search the product catalogue"
              className="h-11 w-full rounded-xl bg-[#F6F1EC] pl-10 pr-14 text-sm outline-none ring-[#B4232C]/20 transition focus:ring-4"
              placeholder="Search products (chicken, ilish, prawn…)"
            />
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <button
              type="submit"
              aria-label="Search products"
              className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg bg-[#B4232C] text-white transition hover:bg-[#951D25] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4232C] focus-visible:ring-offset-2"
            >
              <Search className="size-4" />
            </button>
          </form>
          <button type="button" aria-expanded={showFilters} aria-controls="shop-category-filters" onClick={() => setShowFilters(open => !open)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/8 px-4 text-sm font-bold md:hidden">
            <Filter className="size-4" /> Filters
          </button>
          <div className="relative">
            <SlidersHorizontal className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={sort}
              onChange={event => setSort(event.target.value)}
              className="h-11 min-w-48 appearance-none rounded-xl border border-black/8 bg-white pl-10 pr-9 text-sm font-bold outline-none"
            >
              <option value="popular">Most popular</option>
              <option value="rating">Top rated</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" />
          </div>
        </div>
        {showFilters && (
          <div id="shop-category-filters" className="mt-3 rounded-2xl border border-black/8 bg-white p-4 md:hidden">
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-muted-foreground">Filter by category</p>
            <div className="flex flex-wrap gap-2">
              {[{ id: "all", name: "All" }, ...categories.map(entry => ({ id: normalizeCategorySlug(entry.id || entry.name), name: entry.name }))].map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => { setCategory(entry.id); setLocation(categoryHref(entry.id)); setShowFilters(false); }}
                  aria-pressed={category === entry.id}
                  className={`rounded-full px-3 py-2 text-xs font-bold ${category === entry.id ? "bg-[#B4232C] text-white" : "bg-[#F6F1EC] text-[#3D302C]"}`}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-8 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black">
              {selectedCategory?.name || "All non-veg products"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Showing {products.length} products
            </p>
          </div>
        </div>

        {products.length > 0 ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {products.map((product, index) => {
                if (products.length === index + 1) {
                  return (
                    <div ref={lastProductElementRef} key={product.id}>
                      <ProductCard product={product} />
                    </div>
                  );
                } else {
                  return <ProductCard key={product.id} product={product} />;
                }
              })}
            </div>
            {loadingMore && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-[#B4232C] size-8" />
              </div>
            )}
            {!hasMore && products.length > 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                You've reached the end of the catalogue.
              </div>
            )}
          </>
        ) : (
          <div className="mt-10 rounded-[1.5rem] border border-dashed border-black/15 bg-white px-6 py-16 text-center">
            <Search className="mx-auto size-7 text-muted-foreground" />
            <h3 className="mt-4 font-black">
              {category !== "all"
                ? "No products found in this category"
                : "No matching fresh cuts"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {category !== "all"
                ? "Try another category or check back soon."
                : "Try another category or a simpler search term."}
            </p>
          </div>
        )}
      </section>
    </StoreShell>
  );
}

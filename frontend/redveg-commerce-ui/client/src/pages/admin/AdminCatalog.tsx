import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Edit3, ImagePlus, MoreHorizontal, Plus, Search, Upload, X, Trash2, Loader2 } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

const PAGE_SIZE = 8;
const DEFAULT_CATEGORY_OPTIONS = ["Chicken", "Fish", "Hilsa", "Mutton", "Prawns", "Crab", "Deshi Fish", "Rui & Katla", "Seasonal"];

function createDraftVariant() {
  const draftId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: `temp-${draftId}`,
    sku: `SKU-${draftId}`,
    label: "",
    size: "",
    weight: "",
    piece_size: "",
    price: "",
    stock: "",
    is_available: true
  };
}

export default function AdminCatalog() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showEditor, setShowEditor] = useState(window.location.search.includes("new=true"));
  const [products, setProducts] = useState<any[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>(DEFAULT_CATEGORY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatingVariantIds, setUpdatingVariantIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    apiFetch("categories/admin", {}, { forceBackend: true })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const names = payload?.success && Array.isArray(payload.data)
          ? payload.data.filter((category: any) => category?.isActive !== false).map((category: any) => String(category?.name ?? "").trim()).filter(Boolean)
          : [];
        if (!cancelled && payload?.success && Array.isArray(payload.data)) {
          setCategoryOptions(uniqueCategoryOptions(names));
        }
      })
      .catch((error) => console.warn("Live catalog categories unavailable; using saved category options:", error));
    return () => { cancelled = true; };
  }, []);

  // Editor State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "Chicken",
    short_description: "",
    description: "",
    image_url: "",
    is_active: true
  });
  const [variantsData, setVariantsData] = useState<any[]>([createDraftVariant()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastProductElementRef = useCallback((node: HTMLDivElement | HTMLTableRowElement | null) => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  // Initial fetch / fetch on search change
  useEffect(() => {
    let cancelled = false;
    const fetchInitial = async () => {
      try {
        setLoading(true);
        setError(null);
        setPage(1);

        const searchParams = new URLSearchParams();
        if (debouncedQuery) searchParams.set("q", debouncedQuery);
        searchParams.set("limit", PAGE_SIZE.toString());
        searchParams.set("offset", "0");

        const response = await apiFetch(`admin/products?${searchParams.toString()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        const items = data.data || data;
        const newProducts = normalizeAdminProducts(Array.isArray(items) ? items : []);

        if (!cancelled) {
          setProducts(newProducts);
          setHasMore(newProducts.length === PAGE_SIZE);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Error fetching admin products:", err);
          setError(err.message);
          toast.error("Failed to load products");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchInitial();
    return () => { cancelled = true; };
  }, [debouncedQuery, refreshKey]);

  // Fetch more on scroll
  useEffect(() => {
    if (page === 1) return;
    
    let cancelled = false;
    const fetchMore = async () => {
      try {
        setLoadingMore(true);
        const searchParams = new URLSearchParams();
        if (debouncedQuery) searchParams.set("q", debouncedQuery);
        searchParams.set("limit", PAGE_SIZE.toString());
        searchParams.set("offset", ((page - 1) * PAGE_SIZE).toString());

        const response = await apiFetch(`admin/products?${searchParams.toString()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        const items = data.data || data;
        const newProducts = normalizeAdminProducts(Array.isArray(items) ? items : []);

        if (!cancelled) {
          setProducts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const filteredNew = newProducts.filter(p => !existingIds.has(p.id));
            return [...prev, ...filteredNew];
          });
          setHasMore(newProducts.length === PAGE_SIZE);
        }
      } catch (err: any) {
        console.error("Error fetching more admin products:", err);
      } finally {
        if (!cancelled) setLoadingMore(false);
      }
    };
    fetchMore();
    return () => { cancelled = true; };
  }, [page, debouncedQuery]);

  const refetch = () => {
    setPage(1);
    setDebouncedQuery(query);
    setRefreshKey(current => current + 1);
  };

  const toggleVariantAvailability = async (variant: any, productName: string) => {
    const nextAvailable = !variant.isAvailable;
    setUpdatingVariantIds(current => new Set(current).add(variant.id));
    try {
      const response = await apiFetch(`admin/variants/${variant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_available: nextAvailable }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success === false) {
        throw new Error(result?.message || `Availability update failed (HTTP ${response.status})`);
      }
      setProducts(current => current.map(product => ({
        ...product,
        variants: product.variants?.map((entry: any) => entry.id === variant.id
          ? { ...entry, isAvailable: nextAvailable, available: nextAvailable && entry.stock > 0 }
          : entry),
      })));
      toast.success(`${productName} · ${variant.label} ${nextAvailable ? "is available" : "is unavailable"}`);
    } catch (err: any) {
      toast.error("Variant availability update failed", { description: err.message });
    } finally {
      setUpdatingVariantIds(current => {
        const next = new Set(current);
        next.delete(variant.id);
        return next;
      });
    }
  };

  const toggleProductActive = async (id: string, currentStatus: boolean, name: string) => {
    try {
      const response = await apiFetch(`admin/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: !currentStatus })
      });
      if (!response.ok) throw new Error("Failed to update status");
      toast.success(currentStatus ? `${name} is hidden` : `${name} is live`);
      
      // Optimistic update
      setProducts(prev => prev.map(p => p.id === id ? { ...p, isActive: !currentStatus } : p));
    } catch (err: any) {
      toast.error("Status update failed", { description: err.message });
    }
  };

  const openEditor = (product: any = null) => {
    if (product) {
      setEditingId(product.id);
      setFormData({
        name: product.name,
        category: normalizeCategoryOption(product.category),
        short_description: product.shortDescription,
        description: product.description,
        image_url: product.image,
        is_active: product.isActive
      });
      setVariantsData(
        product.variants?.map((v: any) => ({
          id: v.id,
          sku: v.sku || 'SKU-'+Date.now(),
          label: getVariantEditorName(v),
          size: v.size || '',
          weight: v.weight || '',
          piece_size: v.pieceSize || '',
          price: v.price,
          stock: v.stock,
          is_available: v.isAvailable
        })) || []
      );
    } else {
      setEditingId(null);
      setFormData({
        name: "",
        category: "Chicken",
        short_description: "",
        description: "",
        image_url: "",
        is_active: true
      });
      setVariantsData([createDraftVariant()]);
    }
    setShowEditor(true);
  };

  const saveProduct = async () => {
    try {
      setIsSubmitting(true);
      if (!formData.name || !formData.category) throw new Error("Name and category are required");
      if (variantsData.some(variant => isPlaceholderVariantName(variant.label))) {
        throw new Error("Enter a real name for every product variant; placeholder names cannot be saved.");
      }
      if (variantsData.some(variant => !String(variant.sku || '').trim())) {
        throw new Error("Enter an SKU for every product variant.");
      }
      if (variantsData.some(variant => variant.price === '' || variant.stock === '' || !Number.isFinite(Number(variant.price)) || Number(variant.price) < 0 || !Number.isInteger(Number(variant.stock)) || Number(variant.stock) < 0)) {
        throw new Error("Enter a valid non-negative price and whole-number stock for every variant.");
      }
      
      const payload = {
        name: formData.name,
        description: formData.description,
        short_description: formData.short_description,
        category: formData.category,
        image_url: formData.image_url,
        is_active: formData.is_active,
        // Persist the product and all of its variants in one database transaction.
        variants: variantsData.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          variant_name: variant.label.trim(),
          weight: variant.weight || null,
          piece_size: variant.piece_size || null,
          price: Number(variant.price),
          stock_count: Number(variant.stock),
          is_available: variant.is_available
        }))
      };

      if (editingId) {
        const response = await apiFetch(`admin/products/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(await getResponseError(response, "Failed to update product"));
      } else {
        const response = await apiFetch('admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(await getResponseError(response, "Failed to create product"));
      }

      toast.success(editingId ? "Product updated" : "Product created");
      setShowEditor(false);
      // We force a refresh of the first page to see the new product
      setPage(1);
      setDebouncedQuery(query);
      setRefreshKey(current => current + 1);
    } catch (err: any) {
      toast.error("Save failed", { description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeVariant = (index: number) => {
    setVariantsData(current => current.filter((_, i) => i !== index));
  };

  const uploadProductImage = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Choose a JPEG, PNG, or WebP image');
      return;
    }
    const form = new FormData();
    form.append('image', file);
    setIsUploadingImage(true);
    try {
      const response = await apiFetch('media/upload/products', { method: 'POST', body: form });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success === false || !result?.data?.url) {
        throw new Error(result?.message || `Image upload failed (HTTP ${response.status})`);
      }
      setFormData(current => ({ ...current, image_url: result.data.url }));
      toast.success('Product image uploaded');
    } catch (err: any) {
      toast.error('Image upload failed', { description: err.message });
    } finally {
      setIsUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      const response = await apiFetch(`admin/products/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error("Failed to delete product");
      toast.success("Product deleted");
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      toast.error("Failed to delete product", { description: err.message });
    }
  };

  return (
    <AdminShell
      title="Products & inventory"
      subtitle="Keep fresh cuts, variants, prices and availability accurate."
      action={
        <Button onClick={() => openEditor()} className="h-11 rounded-full bg-[#B4232C] px-5 font-black text-white hover:bg-[#951D24]">
          <Plus className="size-4" /> Add product
        </Button>
      }
    >
      <div className="relative max-w-lg">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 rounded-xl bg-[#F7F4F1] pl-10"
          placeholder="Search products or variants"
          aria-label="Search products or variants"
        />
      </div>
      {loading && page === 1 ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : error && page === 1 ? (
        <div className="rounded-[1.5rem] border border-dashed border-red-200 bg-red-50/50 px-6 py-16 text-center">
          <h3 className="font-black text-red-600">Failed to load catalog</h3>
          <p className="mt-2 text-sm text-red-800/80">{error}</p>
          <button onClick={() => refetch()} className="mt-6 rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-red-700">Retry</button>
        </div>
      ) : products.length === 0 ? (
        <div className="mt-10 rounded-[1.5rem] border border-dashed border-black/15 bg-white px-6 py-16 text-center">
          <Search className="mx-auto size-7 text-muted-foreground" />
          <h3 className="mt-4 font-black">{debouncedQuery ? "No matching products found" : "Database is empty"}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{debouncedQuery ? "Try another search term." : "No products found in the catalog."}</p>
        </div>
      ) : (
        <>
          <div className="mt-5 space-y-3 md:hidden">
            {products.map((product, index) => {
              const stock = product.variants?.reduce((sum: number, variant: any) => sum + variant.stock, 0) || 0;
              const isLast = products.length === index + 1;
              return (
                <article key={product.id} className="rounded-2xl bg-[#FBF9F6] p-4 ring-1 ring-black/5" ref={isLast ? lastProductElementRef : null}>
                  <div className="flex gap-3">
                    <img src={product.image || 'https://placehold.co/150'} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">{product.name}</p>
                      <p className="mt-1 text-xs font-semibold capitalize text-muted-foreground">{product.category}</p>
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">{product.variants?.map((v: any) => <div key={v.id} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate">{v.label} · ₹{Number(v.price || 0)} · {Number(v.stock ?? v.stockCount ?? 0)} in stock</span><div className="flex shrink-0 items-center gap-2"><span className={`text-[0.65rem] font-bold ${v.isAvailable ? "text-[#267345]" : "text-[#9A1A1A]"}`}>{v.isAvailable ? "Available" : "Off"}</span><Switch checked={v.isAvailable} disabled={updatingVariantIds.has(v.id)} onCheckedChange={() => toggleVariantAvailability(v, product.name)} aria-label={`${v.isAvailable ? "Mark" : "Make"} ${product.name} ${v.label} ${v.isAvailable ? "unavailable" : "available"}`} /></div></div>)}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-black ${stock <= 9 ? "text-[#B4232C]" : "text-[#267345]"}`}>{stock} in stock</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <Switch 
                        checked={product.isActive} 
                        onCheckedChange={() => toggleProductActive(product.id, product.isActive, product.name)} 
                        aria-label={`${product.isActive ? "Hide" : "Publish"} ${product.name}`}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-black/5 pt-3">
                    <Button variant="outline" className="min-h-10 flex-1 rounded-xl" onClick={() => openEditor(product)}><Edit3 className="mr-2 size-4" /> Edit product</Button>
                    <Button variant="outline" className="min-h-10 rounded-xl border-red-200 px-3 text-red-700 hover:bg-red-50" onClick={() => deleteProduct(product.id)} aria-label={`Delete ${product.name}`}><Trash2 className="size-4" /><span className="sr-only">Delete {product.name}</span></Button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-5 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-y border-black/5 bg-[#FBF9F6] text-[0.65rem] font-black uppercase tracking-[0.13em] text-muted-foreground">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Variants</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Live</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {products.map((product, index) => {
                  const stock = product.variants?.reduce((sum: number, variant: any) => sum + variant.stock, 0) || 0;
                  const minPrice = product.variants?.length ? Math.min(...product.variants.map((v: any) => v.price)) : 0;
                  const isLast = products.length === index + 1;
                  
                  return (
                    <tr key={product.id} className="border-b border-black/5 hover:bg-[#FCFAF7]" ref={isLast ? lastProductElementRef : null}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <img src={product.image || 'https://placehold.co/150'} alt="" className="size-12 rounded-xl object-cover" />
                          <div>
                            <p className="text-sm font-black">{product.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{product.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-bold capitalize">{product.category}</td>
                      <td className="px-4 py-4 text-xs font-bold"><div className="space-y-2">{product.variants?.map((v: any) => <div key={v.id} className="flex min-w-[260px] items-center justify-between gap-3"><span><span>{v.label}</span><span className="ml-2 text-muted-foreground">₹{Number(v.price || 0)} · {Number(v.stock ?? v.stockCount ?? 0)} stock</span></span><Switch checked={v.isAvailable} disabled={updatingVariantIds.has(v.id)} onCheckedChange={() => toggleVariantAvailability(v, product.name)} aria-label={`${v.isAvailable ? "Mark" : "Make"} ${product.name} ${v.label} ${v.isAvailable ? "unavailable" : "available"}`} /></div>)}</div></td>
                      <td className="px-4 py-4 text-sm font-black">₹{minPrice}</td>
                      <td className="px-4 py-4"><span className={`text-sm font-black ${stock <= 9 ? "text-[#B4232C]" : "text-[#267345]"}`}>{stock}</span></td>
                      <td className="px-4 py-4">
                        <Switch 
                          checked={product.isActive} 
                          onCheckedChange={() => toggleProductActive(product.id, product.isActive, product.name)} 
                        />
                      </td>
                      <td className="px-4 py-4">
                        <Button variant="ghost" size="icon" onClick={() => openEditor(product)}><Edit3 className="size-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteProduct(product.id)} className="text-red-600 hover:bg-red-50"><Trash2 className="size-4" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {loadingMore && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="animate-spin text-[#B4232C] size-6" />
            </div>
          )}
        </>
      )}

      {showEditor && (
        <div className="fixed inset-0 z-[70]">
          <button className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setShowEditor(false)} aria-label="Close editor" />
          <aside className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto bg-[#FFFDF9] p-5 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.15em] text-[#B4232C]">Catalogue editor</p>
                <h2 className="mt-2 font-display text-3xl font-black">{editingId ? "Edit product" : "Add a fresh product"}</h2>
              </div>
              <Button variant="ghost" size="icon" className="rounded-full bg-white" onClick={() => setShowEditor(false)}><X className="size-5" /></Button>
            </div>
            <div className="mt-8 space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Product name">
                  <Input 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="h-12 rounded-xl bg-white" 
                    placeholder="e.g. Ilish Bengali Cut" 
                  />
                </Field>
                <Field label="Category">
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="h-12 w-full rounded-xl border border-input bg-white px-3 text-sm"
                  >
                    {Array.from(new Set([...categoryOptions, formData.category].filter(Boolean))).map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Short description">
                <Input 
                  value={formData.short_description}
                  onChange={(e) => setFormData({...formData, short_description: e.target.value})}
                  className="h-12 rounded-xl bg-white" 
                  placeholder="Cleaned, descaled & curry cut" 
                />
              </Field>
              <Field label="Product details">
                <Textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="min-h-28 rounded-xl bg-white" 
                  placeholder="Describe sourcing, cut and best uses" 
                />
              </Field>
              <div>
                <Label className="font-bold">Product photography</Label>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {formData.image_url && <img src={formData.image_url} alt={`${formData.name || 'Product'} preview`} className="size-16 rounded-xl border border-black/10 object-cover" />}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    aria-label="Choose product image"
                    onChange={(event) => uploadProductImage(event.target.files?.[0])}
                  />
                  <Button type="button" variant="outline" className="h-11 rounded-xl bg-white" disabled={isUploadingImage} onClick={() => imageInputRef.current?.click()}>
                    {isUploadingImage ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                    {isUploadingImage ? 'Uploading…' : 'Upload image'}
                  </Button>
                  <span className="text-xs text-muted-foreground">JPEG, PNG, or WebP · max 5 MB</span>
                </div>
                <Input 
                  value={formData.image_url}
                  onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                  className="mt-2 h-12 rounded-xl bg-white" 
                  placeholder="Or paste an image URL" 
                />
              </div>
              <div className="rounded-[1.25rem] bg-white p-5 ring-1 ring-black/5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-black">Variants & pricing</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Set each option’s pack size, piece size, price, and stock.</p>
                  </div>
                    <Button 
                    onClick={() => setVariantsData(current => [...current, createDraftVariant()])} 
                    variant="outline" 
                    className="rounded-full bg-white text-xs font-black"
                  >
                    <Plus className="size-4" /> Variant
                  </Button>
                </div>
                
                {variantsData.map((variant, index) => (
                  <div key={variant.id} className="mt-5 grid gap-3 sm:grid-cols-[1.3fr_0.9fr_0.9fr_1fr_auto]">
                    <Input 
                      value={variant.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        setVariantsData(current => current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, label, size: label } : entry
                        ));
                      }}
                      className="h-11 rounded-xl" 
                      placeholder="Variant name or pack size" 
                    />
                    <Input 
                      type="number"
                      min="0"
                      step="0.01"
                      value={variant.price}
                    onChange={(e) => setVariantsData(current => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, price: e.target.value } : entry))}
                      className="h-11 rounded-xl" 
                      placeholder="Price ₹" 
                    />
                    <Input 
                      type="number"
                      min="0"
                      step="1"
                      value={variant.stock}
                    onChange={(e) => setVariantsData(current => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, stock: e.target.value } : entry))}
                      className="h-11 rounded-xl" 
                      placeholder="Stock" 
                    />
                    <select
                      value={variant.piece_size || ""}
                      onChange={(event) => setVariantsData(current => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, piece_size: event.target.value } : entry))}
                      className="h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-sm"
                      aria-label={`Piece size for ${variant.label || "variant"}`}
                    >
                      <option value="">Piece size (optional)</option>
                      <option value="Small">Small</option>
                      <option value="Medium">Medium</option>
                      <option value="Large">Large</option>
                    </select>
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-black/10 px-3 sm:col-span-4 sm:justify-start">
                      <span className="text-xs font-bold text-[#4D403D]">{variant.is_available ? "Available to customers" : "Stock Unavailable"}</span>
                      <Switch
                        checked={variant.is_available}
                        onCheckedChange={checked => setVariantsData(current => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, is_available: checked } : entry))}
                        aria-label={`${variant.is_available ? "Turn off" : "Turn on"} ${variant.label}`}
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeVariant(index)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              
              <div className="flex items-center justify-between rounded-[1.25rem] bg-[#EAF4E8] p-5">
                <div>
                  <p className="font-black text-[#275F3C]">Available for ordering</p>
                  <p className="mt-1 text-xs text-[#557662]">Customers can see and add this product.</p>
                </div>
                <Switch 
                  checked={formData.is_active}
                  onCheckedChange={(c) => setFormData({...formData, is_active: c})}
                />
              </div>
              
              <div className="sticky bottom-0 -mx-5 flex gap-3 border-t border-black/5 bg-[#FFFDF9]/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8">
                <Button variant="outline" className="h-12 flex-1 rounded-full bg-white font-black" onClick={() => setShowEditor(false)}>Cancel</Button>
                <Button 
                  onClick={saveProduct} 
                  disabled={isSubmitting}
                  className="h-12 flex-1 rounded-full bg-[#B4232C] font-black text-white hover:bg-[#951D24]"
                >
                  {isSubmitting ? "Saving..." : editingId ? "Save Changes" : "Create Product"}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </AdminShell>
  );
}

function normalizeAdminProducts(products: any[]) {
  return products.map((product) => ({
    ...product,
    variants: Array.isArray(product?.variants)
      ? product.variants.map((variant: any) => ({
          ...variant,
          label: variant.label || variant.size || variant.weight || variant.sku || 'Variant',
          price: Number(variant.price ?? 0),
          stock: Number(variant.stock ?? variant.stockCount ?? variant.stock_count ?? 0),
          stockCount: Number(variant.stockCount ?? variant.stock_count ?? variant.stock ?? 0),
          isAvailable: Boolean(variant.isAvailable ?? Number(variant.is_available ?? 1) === 1),
          available: Boolean(variant.isAvailable ?? Number(variant.is_available ?? 1) === 1) && Number(variant.stock ?? variant.stockCount ?? variant.stock_count ?? 0) > 0,
        }))
      : [],
  }));
}

function normalizeCategoryOption(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const options: Record<string, string> = {
    fish: "Fish",
    chicken: "Chicken",
    hilsa: "Hilsa",
    hilsha: "Hilsa",
    mutton: "Mutton",
    prawns: "Prawns",
    crab: "Crab",
    "deshi fish": "Deshi Fish",
    "rui & katla": "Rui & Katla",
    seasonal: "Seasonal",
    "crabs & seafood": "Crabs & Seafood",
    "crabs and seafood": "Crabs & Seafood",
    combos: "Combos",
  };
  return options[normalized] ?? (String(value ?? "").trim() || "Chicken");
}

function uniqueCategoryOptions(values: string[]) {
  const categories = new Map<string, string>();
  for (const value of values) {
    const label = normalizeCategoryOption(value);
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (key && !categories.has(key)) categories.set(key, label);
  }
  return Array.from(categories.values());
}

function isPlaceholderVariantName(value: unknown) {
  return typeof value !== "string" || !value.trim() || /^new\s+(size|variant)$/i.test(value.trim());
}

function getVariantEditorName(variant: any) {
  const sizeName = String(variant.size || "").trim();
  if (isPlaceholderVariantName(sizeName)) return String(variant.weight || variant.label || "").trim();
  if (/^standard(?:\s|$)/i.test(sizeName)) {
    return String(variant.weight || sizeName.replace(/^standard\s*/i, '') || variant.label || sizeName).trim();
  }
  return sizeName;
}

async function getResponseError(response: Response, fallback: string) {
  const result = await response.json().catch(() => null);
  return result?.message || `${fallback} (HTTP ${response.status})`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="font-bold">{label}</Label>{children}</div>;
}

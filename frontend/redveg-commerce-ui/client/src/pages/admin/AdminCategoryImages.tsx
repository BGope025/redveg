import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { ImagePlus, Loader2, RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type CategoryImage = {
  id: string;
  name: string;
  imageUrl: string | null;
  image: string;
  productImage: string | null;
  productCount: number;
  updatedAt?: string | null;
};

export default function AdminCategoryImages() {
  const [categories, setCategories] = useState<CategoryImage[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [uploadingSlug, setUploadingSlug] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("categories/admin", {}, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not load categories.");
      const rows = Array.isArray(payload.data) ? payload.data as CategoryImage[] : [];
      setCategories(rows);
      setDrafts(Object.fromEntries(rows.map(category => [category.id, category.imageUrl || ""])));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load categories.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveImage = async (category: CategoryImage, imageUrl: string) => {
    setSavingSlug(category.id);
    try {
      const response = await apiFetch(`categories/admin/${encodeURIComponent(category.id)}/image`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not save the category image.");
      const saved = payload.data as CategoryImage;
      setCategories(current => current.map(item => item.id === category.id ? { ...item, ...saved } : item));
      setDrafts(current => ({ ...current, [category.id]: saved.imageUrl || "" }));
      toast.success(imageUrl ? `${category.name} image updated` : `${category.name} now uses a product image`);
    } catch (saveError) {
      toast.error("Category image was not saved", { description: saveError instanceof Error ? saveError.message : "Please try again." });
    } finally {
      setSavingSlug(null);
    }
  };

  const uploadImage = async (category: CategoryImage, file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Choose an image smaller than 5 MB.");
      return;
    }
    setUploadingSlug(category.id);
    try {
      const form = new FormData();
      form.append("image", file);
      const response = await apiFetch("media/upload/products", { method: "POST", body: form }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      const url = String(payload?.data?.url || "");
      if (!response.ok || !payload.success || !url) throw new Error(payload.message || "Cloudinary upload failed.");
      setDrafts(current => ({ ...current, [category.id]: url }));
      await saveImage(category, url);
    } catch (uploadError) {
      toast.error("Image upload failed", { description: uploadError instanceof Error ? uploadError.message : "Please try again." });
    } finally {
      setUploadingSlug(null);
      if (fileRefs.current[category.id]) fileRefs.current[category.id]!.value = "";
    }
  };

  return (
    <AdminShell title="Category images" subtitle="Choose the storefront image for each category. Images are uploaded to Cloudinary and saved to the catalog database.">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Changes appear on the storefront after it refreshes category data.</p>
        <Button variant="outline" className="shrink-0 rounded-full" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
      </div>
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{error}<Button variant="link" onClick={() => void refresh()} className="ml-2 text-red-800">Try again</Button></div>
        : loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading category images">{[1, 2, 3].map(item => <div key={item} className="h-80 animate-pulse rounded-2xl bg-white" />)}</div>
          : categories.length === 0 ? <div className="rounded-2xl border border-dashed border-black/15 bg-white p-10 text-center text-sm text-muted-foreground">Add products to the catalog to create categories.</div>
            : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{categories.map(category => {
              const busy = savingSlug === category.id || uploadingSlug === category.id;
              const preview = drafts[category.id]?.trim() || category.productImage || "";
              return <article key={category.id} className="overflow-hidden rounded-[1.4rem] bg-white shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
                <div className="relative aspect-[1.45] bg-[#F6F1EC]">
                  {preview ? <img src={preview} alt={`${category.name} category preview`} className="size-full object-cover" /> : <div className="grid size-full place-items-center text-sm font-bold text-muted-foreground"><ImagePlus className="mr-2 size-5" />No image available</div>}
                  <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-black shadow-sm">{category.name}</span>
                </div>
                <div className="space-y-3 p-4">
                  <p className="text-xs text-muted-foreground">{category.productCount} catalog product{category.productCount === 1 ? "" : "s"} · {category.imageUrl ? "Custom category image" : "Using a product image"}</p>
                  <Input aria-label={`${category.name} Cloudinary image URL`} value={drafts[category.id] || ""} onChange={event => setDrafts(current => ({ ...current, [category.id]: event.target.value }))} placeholder="https://res.cloudinary.com/..." className="h-10 rounded-xl bg-[#FBF9F6] text-xs" />
                  <div className="flex flex-wrap gap-2">
                    <input ref={node => { fileRefs.current[category.id] = node; }} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={`Choose ${category.name} image`} onChange={event => void uploadImage(category, event.target.files?.[0])} />
                    <Button type="button" variant="outline" className="h-10 flex-1 rounded-full" disabled={busy} onClick={() => fileRefs.current[category.id]?.click()}>{uploadingSlug === category.id ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}Upload to Cloudinary</Button>
                    <Button type="button" className="h-10 rounded-full bg-[#B4232C] px-4 font-black text-white hover:bg-[#941D25]" disabled={busy || (drafts[category.id] || "").trim() === (category.imageUrl || "")} onClick={() => void saveImage(category, (drafts[category.id] || "").trim())}>{savingSlug === category.id ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
                  </div>
                  {category.imageUrl && <Button type="button" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground" disabled={busy} onClick={() => { setDrafts(current => ({ ...current, [category.id]: "" })); void saveImage(category, ""); }}>Use product image instead</Button>}
                </div>
              </article>;
            })}</div>}
    </AdminShell>
  );
}

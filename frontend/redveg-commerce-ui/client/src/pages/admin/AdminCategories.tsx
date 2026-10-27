import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import { FolderPlus, Loader2, RefreshCw, Tags, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Category = {
  id: string;
  name: string;
  productCount: number;
  isActive: boolean;
  imageUrl?: string | null;
};

function slugPreview(value: string) {
  return value.trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-and-/g, "-");
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busySlugs, setBusySlugs] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const slug = useMemo(() => slugPreview(name), [name]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("categories/admin", {}, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not load categories.");
      setCategories(Array.isArray(payload.data) ? payload.data : []);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load categories.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const response = await apiFetch("categories/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not create category.");
      setCategories(current => [...current, payload.data].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      toast.success(`${payload.data.name} category created`);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Could not create category.");
    } finally {
      setSaving(false);
    }
  };

  const setCategoryActive = async (category: Category, isActive: boolean) => {
    setBusySlugs(current => new Set(current).add(category.id));
    try {
      const response = await apiFetch(`categories/admin/${encodeURIComponent(category.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not update category visibility.");
      setCategories(current => current.map(item => item.id === category.id ? { ...item, isActive } : item));
      toast.success(`${category.name} is ${isActive ? "visible" : "hidden"} on the storefront`);
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Could not update category visibility.");
    } finally {
      setBusySlugs(current => { const next = new Set(current); next.delete(category.id); return next; });
    }
  };

  const deleteCategory = async (category: Category) => {
    if (category.productCount > 0) return;
    if (!window.confirm(`Delete the “${category.name}” category? This cannot be undone.`)) return;
    setBusySlugs(current => new Set(current).add(category.id));
    try {
      const response = await apiFetch(`categories/admin/${encodeURIComponent(category.id)}`, { method: "DELETE" }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not delete category.");
      setCategories(current => current.filter(item => item.id !== category.id));
      toast.success(`${category.name} category deleted`);
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Could not delete category.");
      void refresh();
    } finally {
      setBusySlugs(current => { const next = new Set(current); next.delete(category.id); return next; });
    }
  };

  return (
    <AdminShell title="Categories" subtitle="Create storefront categories and assign products to them.">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.05] sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black">Add a category</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">It is available in the product editor after saving. Active categories appear on the storefront; inactive categories and their products are hidden.</p>
            </div>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#FBE8E7] text-[#B4232C]"><FolderPlus className="size-5" /></span>
          </div>
          <form className="mt-6 space-y-4" onSubmit={event => void createCategory(event)}>
            <label className="block text-sm font-bold" htmlFor="category-name">Category name</label>
            <Input id="category-name" value={name} onChange={event => setName(event.target.value)} maxLength={60} placeholder="e.g. Duck" className="h-12 rounded-xl" required aria-describedby="category-slug-preview" />
            <p id="category-slug-preview" className="text-xs text-muted-foreground">Store URL key: <span className="font-semibold text-foreground">{slug || "your-category"}</span></p>
            <Button type="submit" disabled={saving || !slug} className="h-11 rounded-full bg-[#B4232C] px-6 font-black text-white hover:bg-[#941D25] disabled:opacity-60">
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FolderPlus className="mr-2 size-4" />}
              {saving ? "Creating…" : "Create category"}
            </Button>
          </form>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.05] sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-black">Saved categories</h2><p className="mt-1 text-sm text-muted-foreground">{categories.length} total</p></div>
            <Button type="button" variant="outline" size="icon" onClick={() => void refresh()} disabled={loading} aria-label="Refresh categories"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></Button>
          </div>
          {error ? <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<Button type="button" variant="link" onClick={() => void refresh()} className="ml-2 h-auto p-0 font-bold text-red-800">Retry</Button></div>
            : loading ? <div role="status" className="mt-5 space-y-3" aria-label="Loading categories">{[1, 2, 3].map(item => <div key={item} className="h-14 animate-pulse rounded-xl bg-[#F5F1EC]" />)}</div>
              : categories.length ? <ul className="mt-5 divide-y divide-black/[0.06]">{categories.map(category => <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F6F2ED] text-[#756761]"><Tags className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-bold">{category.name}</p><p className="truncate text-xs text-muted-foreground">/{category.id}</p><p className="mt-1 text-xs text-muted-foreground">{category.productCount} products · {category.isActive ? "Visible on storefront" : "Hidden from storefront"}</p></div></div><div className="flex shrink-0 items-center gap-3"><label htmlFor={`category-active-${category.id}`} className="text-xs font-semibold text-muted-foreground">{category.isActive ? "On" : "Off"}</label><Switch id={`category-active-${category.id}`} checked={category.isActive} disabled={busySlugs.has(category.id)} onCheckedChange={checked => void setCategoryActive(category, checked)} aria-label={`${category.isActive ? "Hide" : "Show"} ${category.name} category on storefront`} /><Button type="button" variant="ghost" size="icon" disabled={busySlugs.has(category.id) || category.productCount > 0} onClick={() => void deleteCategory(category)} title={category.productCount > 0 ? "Reassign or remove products before deleting" : `Delete ${category.name}`} aria-label={`Delete ${category.name} category`} className="text-red-700 hover:bg-red-50"><Trash2 className="size-4" /></Button></div></li>)}</ul>
                : <div className="mt-5 rounded-xl bg-[#F7F4F0] p-5 text-sm text-muted-foreground">No categories yet. Add one to begin.</div>}
        </section>
      </div>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">Category images can be uploaded or changed in <a href="/admin/category-images" className="font-bold text-[#B4232C] underline underline-offset-2">Category images</a>.</p>
    </AdminShell>
  );
}

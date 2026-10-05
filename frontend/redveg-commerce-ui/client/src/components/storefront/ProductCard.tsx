import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { brandedCatalogImage } from "@/lib/catalogImages";
import type { Product } from "@/types/commerce";
import { Clock3, Plus, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export function ProductCard({ product }: { product: Product }) {
  const placeholderImage = 'https://placehold.co/600x400/eee/999?text=No+Image';
  const brandedFallback = brandedCatalogImage(product.name) ?? placeholderImage;
  const [imageSrc, setImageSrc] = useState(product.image || brandedFallback);
  const [variantId, setVariantId] = useState(
    product.variants?.find((variant) => variant.available)?.id ?? product.variants?.[0]?.id ?? ""
  );
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  
  const variant = product.variants?.find((entry) => entry.id === variantId) ?? product.variants?.[0];
  const stockRemaining = Number(variant?.stock ?? 0);
  const isLowStock = Boolean(variant?.available && stockRemaining > 0 && stockRemaining <= 9);
  const { addItem } = useCart();

  useEffect(() => {
    setImageSrc(product.image || brandedFallback);
  }, [brandedFallback, product.id, product.image]);

  const add = () => {
    if (!variant || !variant.available) return;
    addItem(product.id, variant.id);
    toast.success(`${product.name} added`, { description: `${variant.label} · ₹${variant.price}` });
    setShowQuickAdd(false);
  };

  return (
    <article className="group overflow-hidden rounded-[1.4rem] bg-white shadow-[0_14px_40px_rgba(75,41,33,0.08)] ring-1 ring-black/[0.045] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(75,41,33,0.13)]">
      <Link href={`/product/${product.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-[#F5EFE9]">
        <img
          src={imageSrc}
          alt={product.name}
          onError={() => setImageSrc((current) => current === brandedFallback ? placeholderImage : brandedFallback)}
          className="size-full object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-[1.02]"
        />
        {product.badge && <span className="absolute left-3 top-3 rounded-full bg-[#B4232C] px-3 py-1.5 text-[0.68rem] font-black uppercase tracking-wide text-white shadow-lg">{product.badge}</span>}
        <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-white/92 px-2.5 py-1 text-[0.68rem] font-bold text-[#4F423E] shadow-sm backdrop-blur"><Clock3 className="size-3" /> {product.deliveryMinutes || 45} min</span>
        {product.variants?.length ? <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setShowQuickAdd(true); }} className="absolute bottom-3 left-3 translate-y-2 rounded-full bg-[#B4232C] px-4 py-2 text-xs font-black text-white opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100">Quick add</button> : null}
      </Link>
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-1 text-xs font-bold text-[#267345]"><Star className="size-3.5 fill-current" /> {product.rating ?? 5.0} <span className="font-medium text-muted-foreground">({product.reviewCount ?? 0})</span></div>
        <Link href={`/product/${product.slug}`} className="mt-2 block min-h-12 text-base font-black leading-6 tracking-[-0.015em] text-[#261B18] transition-colors hover:text-[#B4232C] sm:text-lg">{product.name}</Link>
        <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">{product.shortDescription || product.description || 'Fresh non-veg cuts'}</p>

        {product.variants && product.variants.length > 0 ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {product.variants.map((entry) => (
                <button key={entry.id} onClick={() => setVariantId(entry.id)} disabled={!entry.available} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${entry.id === variant?.id ? "border-[#B4232C] bg-[#FCE9E8] text-[#B4232C]" : "border-[#E7DDD8] bg-white text-[#6E625E] hover:border-[#B4232C]/50"} disabled:cursor-not-allowed disabled:opacity-35`}>
                  {entry.label}
                </button>
              ))}
            </div>
            {isLowStock && <p className="mt-2 text-xs font-black text-[#B4232C]">Only {stockRemaining} left in stock — order soon</p>}

            <div className="mt-5 flex items-end justify-between gap-3">
              <div>
                <p className="text-lg font-black tracking-tight text-[#251B18]">₹{variant?.price ?? 0}</p>
                {variant?.mrp && <p className="text-xs text-muted-foreground"><span className="line-through">₹{variant.mrp}</span> <span className="ml-1 font-bold text-[#267345]">{Math.round((1 - (variant.price / variant.mrp)) * 100)}% off</span></p>}
              </div>
              <Button onClick={add} disabled={!variant?.available} className="h-10 rounded-full bg-[#B4232C] px-4 font-black text-white shadow-[0_8px_18px_rgba(180,35,44,0.2)] hover:bg-[#921B22]">
                <Plus className="size-4" /> Add
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-5 text-sm text-red-600 font-bold">Currently unavailable</div>
        )}
      </div>
      {showQuickAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setShowQuickAdd(false)}>
          <div role="dialog" aria-modal="true" aria-label={`Add ${product.name} to basket`} className="w-full max-w-md rounded-[1.5rem] bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#B4232C]">Quick add</p><h2 className="mt-1 text-2xl font-black">{product.name}</h2></div>
              <button type="button" onClick={() => setShowQuickAdd(false)} className="rounded-full px-3 py-1 text-2xl leading-none text-muted-foreground hover:bg-[#F6F1EC]" aria-label="Close">×</button>
            </div>
            {product.variants?.length ? <>
              <p className="mt-5 text-sm font-bold text-muted-foreground">Choose a pack size</p>
              <div className="mt-3 flex flex-wrap gap-2">{product.variants.map((entry) => <button key={entry.id} type="button" onClick={() => setVariantId(entry.id)} disabled={!entry.available} className={`rounded-full border px-4 py-2 text-sm font-bold ${entry.id === variant?.id ? "border-[#B4232C] bg-[#FCE9E8] text-[#B4232C]" : "border-[#E7DDD8]"} disabled:cursor-not-allowed disabled:opacity-40`}>{entry.label} · ₹{entry.price}</button>)}</div>
              <Button type="button" onClick={add} disabled={!variant?.available} className="mt-6 h-12 w-full rounded-full bg-[#B4232C] font-black text-white hover:bg-[#921B22]">{variant?.available ? `Add to basket · ₹${variant.price}` : "Currently unavailable"}</Button>
            </> : <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">This product is currently unavailable.</p>}
          </div>
        </div>
      )}
    </article>
  );
}

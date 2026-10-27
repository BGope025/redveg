import { StoreShell } from "@/components/storefront/StoreShell";
import { CampaignWhatsAppButton } from "@/components/storefront/CampaignWhatsAppButton";
import { Button } from "@/components/ui/button";
import { useLocation as useDeliveryLocation } from "@/contexts/LocationContext";
import { campaignApi } from "@/lib/campaignApi";
import type { Campaign } from "@/types/commerce";
import { isWhatsAppCampaignUrl } from "@/lib/campaignWhatsapp";
import { ArrowRight, Gift, Loader2, RefreshCw, Tag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { SeoMetadata } from "@/components/storefront/SeoMetadata";

function campaignDestination(campaign: Campaign) {
  if (campaign.destinationType === "category") return `/shop?category=${encodeURIComponent(campaign.destinationValue || "all")}`;
  if (campaign.destinationType === "product") return `/product/${encodeURIComponent(campaign.destinationValue || "")}`;
  if (campaign.destinationType === "collection") return campaign.collectionLink || campaign.destinationValue || "/shop";
  return campaign.destinationValue || "/shop";
}

function isExternal(href: string) {
  return /^https?:\/\//i.test(href);
}

function campaignImage(campaign: Campaign) {
  return campaign.mobileImageUrl || campaign.posterImageUrl || campaign.desktopImageUrl || "";
}

function OfferAction({ campaign, href }: { campaign: Campaign; href: string }) {
  const label = campaign.ctaLabel || "Shop this offer";
  if (isWhatsAppCampaignUrl(href)) {
    return <CampaignWhatsAppButton href={href} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#B4232C] px-5 text-sm font-black text-white transition hover:bg-[#941D25] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B4232C]/25 disabled:cursor-wait disabled:opacity-60">{label}<ArrowRight className="size-4" /></CampaignWhatsAppButton>;
  }
  if (isExternal(href)) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#B4232C] px-5 text-sm font-black text-white transition hover:bg-[#941D25] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B4232C]/25">{label}<ArrowRight className="size-4" /></a>;
  }
  return <Link href={href} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#B4232C] px-5 text-sm font-black text-white transition hover:bg-[#941D25] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B4232C]/25">{label}<ArrowRight className="size-4" /></Link>;
}

export default function OffersPage() {
  const { location } = useDeliveryLocation();
  const [offers, setOffers] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshOffers = useCallback(async () => {
    setError("");
    try {
      const device = window.matchMedia("(max-width: 1023px)").matches ? "mobile" : "desktop";
      const data = await campaignApi.getStorefrontOffers({ locationId: location?.pincode, device });
      setOffers(data.filter(campaign => campaign.status === "published" && Date.parse(campaign.startsAt) <= Date.now() && Date.parse(campaign.endsAt) > Date.now()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Offers could not be loaded right now.");
    } finally {
      setLoading(false);
    }
  }, [location?.pincode]);

  useEffect(() => {
    setLoading(true);
    void refreshOffers();
    const timer = window.setInterval(() => void refreshOffers(), 60_000);
    const onFocus = () => void refreshOffers();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [refreshOffers, refreshKey]);

  return (
    <StoreShell>
      <SeoMetadata
        title="Fresh Meat & Seafood Offers in Kolkata | RedVeg"
        description="See current RedVeg offers on chicken, mutton, fish, hilsa (ilish), prawns and seafood in Kolkata. Browse live campaigns and check delivery availability for your area."
        canonicalPath="/offers"
      />
      <section className="border-b border-black/5 bg-[#F6F1EC]">
        <div className="container py-10 sm:py-14">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">RedVeg specials</p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-black tracking-[-0.04em] sm:text-5xl">Offers for you</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#74645D]">Current offers published by RedVeg. New campaigns appear here as soon as they go live.</p>
            </div>
            {!loading && !error && <span className="hidden shrink-0 items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-[#267345] ring-1 ring-black/5 sm:inline-flex"><span className="size-2 rounded-full bg-[#3B9859]" />Live from RedVeg</span>}
          </div>
        </div>
      </section>

      <section className="container min-h-[42vh] py-8 pb-12 sm:py-12">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading current offers">
            {[0, 1, 2].map(item => <div key={item} className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05]"><div className="aspect-[2/3] animate-pulse bg-[#EEE7E1] sm:aspect-[16/9]" /><div className="space-y-3 p-5"><div className="h-4 w-1/3 animate-pulse rounded bg-[#EEE7E1]" /><div className="h-6 w-3/4 animate-pulse rounded bg-[#EEE7E1]" /><div className="h-4 w-full animate-pulse rounded bg-[#EEE7E1]" /></div></div>)}
          </div>
        ) : error ? (
          <div role="alert" className="mx-auto max-w-lg rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-red-200">
            <Gift className="mx-auto size-8 text-[#B4232C]" />
            <h2 className="mt-4 text-xl font-black">Offers are unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-[#74645D]">{error}</p>
            <Button onClick={() => setRefreshKey(key => key + 1)} className="mt-5 rounded-full bg-[#B4232C] font-black text-white"><RefreshCw className="size-4" /> Try again</Button>
          </div>
        ) : offers.length === 0 ? (
          <div className="mx-auto max-w-xl py-12 text-center sm:py-20">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#FBE8E7] text-[#B4232C]"><Gift className="size-6" /></span>
            <h2 className="mt-5 font-display text-2xl font-black">No live offers right now</h2>
            <p className="mt-2 text-sm leading-6 text-[#74645D]">When RedVeg publishes an offer for your area, it will show up here automatically.</p>
            <Link href="/shop" className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[#B4232C]">Browse fresh cuts <ArrowRight className="size-4" /></Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {offers.map(campaign => {
              const image = campaignImage(campaign);
              const href = campaignDestination(campaign);
              const endDate = new Date(campaign.endsAt);
              return (
                <article key={campaign.id} className="overflow-hidden rounded-2xl bg-white shadow-[0_12px_32px_rgba(61,33,27,.07)] ring-1 ring-black/[0.05]">
                  <div className="relative aspect-[2/3] overflow-hidden bg-[#F6F1EC] sm:aspect-[16/9]">
                    {image ? (
                      <picture className="absolute inset-0 block size-full">
                        {campaign.desktopImageUrl && <source media="(min-width: 640px)" srcSet={campaign.desktopImageUrl} />}
                        <img src={image} alt={campaign.altText || campaign.name} loading="lazy" decoding="async" className="size-full object-contain" />
                      </picture>
                    ) : <div className="grid size-full place-items-center text-[#B4232C]"><Gift className="size-10" /></div>}
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[0.68rem] font-black text-[#267345] shadow-sm"><span className="size-1.5 rounded-full bg-[#3B9859]" />LIVE OFFER</span>
                  </div>
                  <div className="p-5 sm:p-6">
                    {campaign.label && <p className="flex items-center gap-1.5 text-[0.68rem] font-black uppercase tracking-[0.13em] text-[#B4232C]"><Tag className="size-3.5" />{campaign.label}</p>}
                    <h2 className="mt-2 text-xl font-black leading-tight text-[#251B18]">{campaign.name}</h2>
                    {campaign.message && <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#74645D]">{campaign.message}</p>}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4">
                      <p className="text-xs font-semibold text-[#74645D]">Ends {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }).format(endDate)} IST</p>
                      <OfferAction campaign={campaign} href={href} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {loading && <p className="sr-only" role="status"><Loader2 className="size-4 animate-spin" /> Loading offers</p>}
      </section>
    </StoreShell>
  );
}

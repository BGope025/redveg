import { ExternalLink, MapPin, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

declare global {
  interface Window {
    google?: typeof google;
  }
}

type Review = {
  author: string;
  rating: number;
  text: string;
  relativeTime?: string;
};

type BusinessDetails = {
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
  reviews: Review[];
};

const GOOGLE_MAPS_URL = "https://maps.app.goo.gl/S2aBvWw49uN2pEXc7";
const PLACE_QUERY = "Red Veg, Prantik Sarani, Rabindra Nagar, Dum Dum Cantonment, Kolkata";
const FALLBACK_DETAILS: BusinessDetails = {
  name: "Red Veg",
  address: "Prantik Sarani, Rabindra Nagar, Dum Dum Cantonment, P.O, Dum Dum, Kolkata, West Bengal 700065",
  rating: 4.8,
  reviewCount: 384,
  reviews: [
    { author: "Poulami Banerjee", rating: 5, relativeTime: "4 months ago", text: "Bought 1.7 kg Ilish from Red Veg and it was absolutely delicious! Fresh, flavorful and perfectly satisfying. Truly worth it. I will definitely purchase again in future." },
    { author: "Amitabha Sankar Bhaduri", rating: 5, relativeTime: "4 months ago", text: "Impeccable quality at market price. I have ordered for the second time. Hope they will maintain the quality in future also. Great going, Red Veg." },
    { author: "Google customer", rating: 5, text: "Good quantity and quality of the products and excellent service. Price comparable with standard market rates." },
    { author: "Google customer", rating: 5, text: "Ordered Bangladeshi hilsa. Fast delivery and cleaned fish received." },
  ],
};

function loadGooglePlaces() {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Places is browser-only"));
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  const existing = document.getElementById("redveg-google-places-script") as HTMLScriptElement | null;
  if (existing) return new Promise<typeof google>((resolve, reject) => { existing.addEventListener("load", () => resolve(window.google!)); existing.addEventListener("error", () => reject(new Error("Google Places failed to load"))); });
  const apiKey = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
  if (!apiKey) return Promise.reject(new Error("Google Maps key is not configured"));
  const forgeBase = import.meta.env.VITE_FRONTEND_FORGE_API_URL || "https://forge.butterfly-effect.dev";
  return new Promise<typeof google>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "redveg-google-places-script";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `${forgeBase}/v1/maps/proxy/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=places`;
    script.onload = () => window.google ? resolve(window.google) : reject(new Error("Google Places loaded without the Google namespace"));
    script.onerror = () => reject(new Error("Google Places failed to load"));
    document.head.appendChild(script);
  });
}

async function fetchBusinessDetails(): Promise<BusinessDetails> {
  const googleMaps = await loadGooglePlaces();
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.display = "none";
  document.body.appendChild(container);
  try {
    const service = new googleMaps.maps.places.PlacesService(container);
    const place = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
      service.findPlaceFromQuery({ query: PLACE_QUERY, fields: ["place_id"] }, (results, status) => {
        if (status !== googleMaps.maps.places.PlacesServiceStatus.OK || !results?.[0]?.place_id) return reject(new Error(`Place search failed: ${status}`));
        resolve(results[0]);
      });
    });
    const details = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
      service.getDetails({ placeId: place.place_id!, fields: ["name", "formatted_address", "rating", "user_ratings_total", "reviews"] }, (result, status) => {
        if (status !== googleMaps.maps.places.PlacesServiceStatus.OK || !result) return reject(new Error(`Place details failed: ${status}`));
        resolve(result);
      });
    });
    const reviews = (details.reviews || []).filter((review) => review.text).map((review) => ({ author: review.author_name || "Google customer", rating: review.rating || 5, text: review.text!, relativeTime: review.relative_time_description }));
    return { name: details.name || FALLBACK_DETAILS.name, address: details.formatted_address || FALLBACK_DETAILS.address, rating: details.rating || FALLBACK_DETAILS.rating, reviewCount: details.user_ratings_total || FALLBACK_DETAILS.reviewCount, reviews: reviews.length ? reviews : FALLBACK_DETAILS.reviews };
  } finally {
    container.remove();
  }
}

export function useGoogleBusinessDetails() {
  const [details, setDetails] = useState<BusinessDetails>(FALLBACK_DETAILS);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBusinessDetails().then((next) => { if (!cancelled) { setDetails(next); setIsLive(true); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return { details, isLive };
}

export function GoogleReviewsCarousel() {
  const { details, isLive } = useGoogleBusinessDetails();

  const marqueeReviews = useMemo(() => [...details.reviews, ...details.reviews], [details.reviews]);

  return (
    <section className="container overflow-hidden py-10 sm:py-14" aria-labelledby="google-reviews-title">
      <div className="rounded-[2rem] bg-[#F7EFE8] p-5 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">Loved by local families</p>
            <h2 id="google-reviews-title" className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl">Real reviews from Google</h2>
            <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-[#746762]"><MapPin className="mt-0.5 size-4 shrink-0 text-[#B4232C]" />{details.address}</p>
          </div>
          <a href={GOOGLE_MAPS_URL} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-black text-[#B4232C] shadow-sm ring-1 ring-black/[0.05] hover:-translate-y-0.5">View on Google Maps <ExternalLink className="size-4" /></a>
        </div>
        <div className="mt-6 flex items-center gap-3"><span className="text-4xl font-black text-[#251B18]">{details.rating.toFixed(1)}</span><span className="flex items-center gap-0.5 text-[#E5A51B]">{[1, 2, 3, 4, 5].map((star) => <Star key={star} className="size-5 fill-current" />)}</span><span className="text-sm font-bold text-[#746762]">{details.reviewCount.toLocaleString()} Google reviews</span><span className="rounded-full bg-[#E3F3E2] px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-wide text-[#267345]">{isLive ? "Live from Google" : "Google rating"}</span></div>
        <div className="group relative mt-7 overflow-hidden" aria-label="Customer reviews. Hover to pause scrolling.">
          <div className="review-marquee flex w-max gap-4 group-hover:[animation-play-state:paused]">
            {marqueeReviews.map((review, index) => <article key={`${review.author}-${index}`} className="w-[min(82vw,340px)] shrink-0 rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(61,33,27,.06)] ring-1 ring-black/[0.04]"><div className="flex items-center justify-between gap-3"><div><p className="font-black text-[#251B18]">{review.author}</p>{review.relativeTime && <p className="mt-0.5 text-xs text-[#746762]">{review.relativeTime}</p>}</div><span className="flex items-center gap-0.5 text-[#E5A51B]">{[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`size-3.5 ${star <= review.rating ? "fill-current" : ""}`} />)}</span></div><p className="mt-4 text-sm leading-6 text-[#4F423E]">“{review.text}”</p><p className="mt-4 text-[0.68rem] font-black uppercase tracking-wide text-[#267345]">Google review</p></article>)}
          </div>
        </div>
        <p className="mt-4 text-center text-xs font-semibold text-[#746762]">Reviews move continuously; hover over the cards to pause.</p>
      </div>
    </section>
  );
}

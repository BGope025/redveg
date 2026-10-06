import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  MapPin,
  Pause,
  Play,
  Star,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type BusinessDetails = {
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
};

/**
 * Public listing snapshot verified from the Red Veg Google Maps page.
 * This deliberately contains no API key, script loader, or Places request.
 * Customers can use the listing link below for the current review feed.
 */
export const GOOGLE_MAPS_URL = "https://maps.app.goo.gl/S2aBvWw49uN2pEXc7";
export const PUBLIC_GOOGLE_BUSINESS_DETAILS: BusinessDetails = {
  name: "Red Veg",
  address:
    "Prantik Sarani, Rabindra Nagar, Dum Dum Cantonment, P.O, Dum Dum, Kolkata, West Bengal 700065",
  rating: 4.8,
  reviewCount: 384,
};

const GOOGLE_MAPS_REVIEWS = [
  {
    author: "Poulami Banerjee",
    text: "Bought 1.7 kg Ilish from Red Veg and it was absolutely delicious! Fresh, flavorful and perfectly satisfying. Truly worth it ❤️🐟. I will definitely purchase again in future 👍",
  },
  {
    author: "Amitabha Sankar Bhaduri",
    text: "I have got to know about redveg from YouTube and being curious, ordered some mutton and fish there. Impeccable quality in market price. I have ordered for the second time. Hope they will maintain the quality in future also. Great going, redveg.",
  },
  {
    author: "Ishita Chakraborty",
    text: "Great quality. Amazing service. I ordered Sundarban crabs. It was clean and chopped properly for curry. They even sent the crab ghee in a separate container. Will order again.",
  },
] as const;

export function useGoogleBusinessDetails() {
  return {
    details: PUBLIC_GOOGLE_BUSINESS_DETAILS,
    isLive: false,
    error: null,
  };
}

function RatingStars({ rating = 5 }: { rating?: number }) {
  return (
    <span
      className="flex items-center gap-0.5 text-[#E5A51B]"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map(star => (
        <Star key={star} className="size-5 fill-current" />
      ))}
    </span>
  );
}

export function GoogleReviewsCarousel() {
  const details = PUBLIC_GOOGLE_BUSINESS_DETAILS;
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  const scrollToReview = (
    index: number,
    behavior: ScrollBehavior = "smooth"
  ) => {
    const track = trackRef.current;
    const slide = track?.children[index] as HTMLElement | undefined;
    if (!track || !slide) return;

    track.scrollTo({
      left: slide.offsetLeft - track.offsetLeft,
      behavior: prefersReducedMotion ? "auto" : behavior,
    });
    setActiveIndex(index);
  };

  useEffect(() => {
    if (isPaused || isHovered || isFocused || prefersReducedMotion) return;

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      const nextIndex = (activeIndex + 1) % GOOGLE_MAPS_REVIEWS.length;
      scrollToReview(nextIndex);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [activeIndex, isFocused, isHovered, isPaused, prefersReducedMotion]);

  const updateActiveSlide = () => {
    const track = trackRef.current;
    if (!track) return;

    const slides = Array.from(track.children) as HTMLElement[];
    const nearestIndex = slides.reduce(
      (nearest, slide, index) => {
        const distance = Math.abs(
          slide.offsetLeft - track.offsetLeft - track.scrollLeft
        );
        return distance < nearest.distance ? { index, distance } : nearest;
      },
      { index: activeIndex, distance: Number.POSITIVE_INFINITY }
    ).index;

    setActiveIndex(nearestIndex);
  };

  return (
    <section
      className="container overflow-hidden py-10 sm:py-14"
      aria-labelledby="google-reviews-title"
    >
      <div className="rounded-[2rem] bg-[#F7EFE8] p-5 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">
              Loved by local families
            </p>
            <h2
              id="google-reviews-title"
              className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl"
            >
              Reviews from Google
            </h2>
            <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-[#746762]">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#B4232C]" />
              {details.address}
            </p>
          </div>
          <a
            href={GOOGLE_MAPS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-black text-[#B4232C] shadow-sm ring-1 ring-black/[0.05] hover:-translate-y-0.5"
          >
            Read reviews on Google Maps <ExternalLink className="size-4" />
          </a>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-6 py-5 text-center shadow-[0_10px_30px_rgba(61,33,27,.06)] ring-1 ring-black/[0.04]">
            <p className="text-5xl font-black tracking-[-0.06em] text-[#251B18]">
              {details.rating.toFixed(1)}
            </p>
            <div className="mt-2 flex justify-center">
              <RatingStars />
            </div>
            <p className="mt-2 text-sm font-bold text-[#746762]">
              {details.reviewCount.toLocaleString()} Google reviews
            </p>
          </div>
          <div
            className="min-w-0"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onFocusCapture={() => setIsFocused(true)}
            onBlurCapture={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setIsFocused(false);
              }
            }}
          >
            <div
              ref={trackRef}
              role="region"
              aria-label="Customer reviews"
              aria-roledescription="carousel"
              aria-live={isPaused || isHovered || isFocused ? "polite" : "off"}
              onScroll={updateActiveSlide}
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {GOOGLE_MAPS_REVIEWS.map((review, index) => (
                <article
                  key={review.author}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${index + 1} of ${GOOGLE_MAPS_REVIEWS.length}`}
                  className="flex min-h-56 w-full shrink-0 snap-start flex-col justify-between rounded-2xl bg-white p-5 ring-1 ring-black/[0.04]"
                >
                  <div>
                    <RatingStars />
                    <blockquote className="mt-4 text-sm leading-6 text-[#4F413B]">
                      “{review.text}”
                    </blockquote>
                  </div>
                  <p className="mt-5 border-t border-[#E8DCD4] pt-3 text-sm font-black text-[#251B18]">
                    {review.author}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={
                    isPaused
                      ? "Play automatic reviews"
                      : "Pause automatic reviews"
                  }
                  onClick={() => setIsPaused(paused => !paused)}
                  className="grid size-10 place-items-center rounded-full bg-white text-[#4F413B] ring-1 ring-black/10 transition-colors hover:bg-[#FFFDF9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4232C]"
                >
                  {isPaused ? (
                    <Play className="size-4" />
                  ) : (
                    <Pause className="size-4" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Previous review"
                  onClick={() =>
                    scrollToReview(
                      (activeIndex - 1 + GOOGLE_MAPS_REVIEWS.length) %
                        GOOGLE_MAPS_REVIEWS.length
                    )
                  }
                  className="grid size-10 place-items-center rounded-full bg-white text-[#4F413B] ring-1 ring-black/10 transition-colors hover:bg-[#FFFDF9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4232C]"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next review"
                  onClick={() =>
                    scrollToReview(
                      (activeIndex + 1) % GOOGLE_MAPS_REVIEWS.length
                    )
                  }
                  className="grid size-10 place-items-center rounded-full bg-white text-[#4F413B] ring-1 ring-black/10 transition-colors hover:bg-[#FFFDF9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4232C]"
                >
                  <ArrowRight className="size-4" />
                </button>
              </div>

              <div
                className="flex items-center gap-2"
                role="group"
                aria-label="Choose a review"
              >
                {GOOGLE_MAPS_REVIEWS.map((review, index) => (
                  <button
                    key={review.author}
                    type="button"
                    aria-label={`Show review ${index + 1} of ${GOOGLE_MAPS_REVIEWS.length}`}
                    aria-current={activeIndex === index ? "true" : undefined}
                    onClick={() => scrollToReview(index)}
                    className={`h-2.5 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4232C] ${activeIndex === index ? "w-7 bg-[#B4232C]" : "w-2.5 bg-[#B4232C]/30 hover:bg-[#B4232C]/60"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs font-semibold text-[#746762]">
          Customer reviews from Red Veg’s public Google Maps listing.
        </p>
      </div>
    </section>
  );
}

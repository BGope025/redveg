import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  BadgeCheck,
  Clock3,
  ShieldCheck,
  Sparkles,
  ThermometerSnowflake,
  ChevronDown
} from 'lucide-react';
import { assets } from '@/lib/assets';
import { useLocation } from '@/contexts/LocationContext';
import { useGoogleBusinessDetails } from '@/components/storefront/GoogleReviewsCarousel';
import { toast } from 'sonner';

interface Slide {
  id: number;
  eyebrow: string;
  headline: string;
  description: string;
  primaryButtonText: string;
  primaryButtonHref: string;
  secondaryButtonText?: string;
  secondaryButtonHref?: string;
  image?: string;
  showSecondaryButton?: boolean;
}

const slides: Slide[] = [
  {
    id: 1,
    eyebrow: 'DELIVERING FRESH ACROSS KOLKATA',
    headline: 'Fresh cuts.\nProperly done.',
    description: 'Premium chicken, mutton, fish and seafood—cleaned to your preference, hygienically packed and ready for your kitchen.',
    primaryButtonText: 'Shop fresh cuts',
    primaryButtonHref: '/shop',
    secondaryButtonText: 'Check delivery area',
    secondaryButtonHref: '#', // Will be handled separately to preserve existing behavior
    image: assets.hero
  },
  {
    id: 2,
    eyebrow: 'KITCHEN-READY CHICKEN',
    headline: 'Tender cuts.\nReady to cook.',
    description: 'Fresh chicken cuts prepared to your preference and packed hygienically for everyday meals.',
    primaryButtonText: 'Shop chicken',
    primaryButtonHref: '/shop?category=chicken',
    image: assets.chicken
  },
  {
    id: 3,
    eyebrow: 'HAND-SELECTED MUTTON',
    headline: 'Rich flavour.\nCarefully selected.',
    description: 'Premium mutton cuts, prepared with care and delivered fresh to your doorstep.',
    primaryButtonText: 'Shop mutton',
    primaryButtonHref: '/shop?category=mutton',
    image: assets.mutton
  },
  {
    id: 4,
    eyebrow: 'FRESH CATCH, CLEANED WITH CARE',
    headline: 'From the coast.\nTo your kitchen.',
    description: 'Fresh fish, cleaned prawns and seafood prepared for easy cooking at home.',
    primaryButtonText: 'Shop fish',
    primaryButtonHref: '/shop?category=fish',
    secondaryButtonText: 'Shop seafood',
    secondaryButtonHref: '/shop?category=crabs-seafood', // Using crabs-seafood as per existing convention
    showSecondaryButton: true,
    image: assets.prawns // Using prawns image as it represents seafood well
  },
  {
    id: 5,
    eyebrow: 'BETTER VALUE FOR FAMILY MEALS',
    headline: 'More for the table.\nDelivered on time.',
    description: 'Explore family-friendly combos, clear delivery windows and fresh products delivered across Kolkata.',
    primaryButtonText: 'Explore combos',
    primaryButtonHref: '/shop?category=combos',
    secondaryButtonText: 'View offers',
    secondaryButtonHref: '/shop?category=offers',
    showSecondaryButton: true,
    image: assets.hero
  }
];

export default function HeroSlideshow() {
  const { location } = useLocation();
  const { details: googleBusiness } = useGoogleBusinessDetails();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check for reduced motion preference
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  // Auto-advance slides every 4.5 seconds (disabled if reduced motion)
  useEffect(() => {
    if (isHovered || isFocused || reducedMotion) return;

    timeoutRef.current = setTimeout(() => {
      setCurrentSlide(prev => (prev + 1) % slides.length);
    }, 4500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [currentSlide, isHovered, isFocused, reducedMotion]);

  // Reset timer when slide changes manually
  useEffect(() => {
    if (timeoutRef.current || reducedMotion) return;
    if (!isHovered && !isFocused) {
      timeoutRef.current = setTimeout(() => {
        setCurrentSlide(prev => (prev + 1) % slides.length);
      }, 4500);
    }
  }, [currentSlide, isHovered, isFocused, reducedMotion]);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    // Reset timer when user manually changes slide
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (!isHovered && !isFocused) {
      timeoutRef.current = setTimeout(() => {
        setCurrentSlide(prev => (prev + 1) % slides.length);
      }, 4500);
    }
  };

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => setIsHovered(false);
  const handleFocusIn = () => setIsFocused(true);
  const handleFocusOut = () => setIsFocused(false);

  const currentSlideData = slides[currentSlide];

  return (
    <div
      ref={slideRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocusIn}
      onBlur={handleFocusOut}
      tabIndex={-1}
      className="relative min-h-[520px] overflow-hidden rounded-[2rem] bg-[#17110f] text-white shadow-[0_24px_70px_rgba(46,24,20,.18)] sm:min-h-[560px] lg:min-h-[590px]"
    >
      {/* Slide Image */}
      {currentSlideData.image && (
        <img
          src={currentSlideData.image}
          alt={`Slide ${currentSlide + 1}`}
          className={`absolute inset-0 size-full object-cover object-center lg:object-right ${reducedMotion ? 'transition-none' : 'duration-500'}`}
        />
      )}

      {/* Dark Gradient Overlay */}
      <div className={`absolute inset-0 bg-[linear-gradient(90deg,rgba(19,12,10,.96)_0%,rgba(19,12,10,.88)_34%,rgba(19,12,10,.35)_67%,rgba(19,12,10,.08)_100%)] ${reducedMotion ? 'transition-none' : 'duration-500'}`} />

      {/* Radial Gradient Overlay */}
      <div className={`absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_15%_20%,rgba(180,35,44,.55),transparent_34%)] ${reducedMotion ? 'transition-none' : 'duration-500'}`} />

      {/* Slide Content */}
      <div className="relative z-10 flex min-h-[520px] max-w-2xl flex-col justify-center px-6 py-14 sm:min-h-[560px] sm:px-12 lg:min-h-[590px] lg:px-16">
        {/* Eyebrow */}
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] backdrop-blur">
          <span className="size-2 rounded-full bg-[#72B556] shadow-[0_0_0_5px_rgba(114,181,86,.12)]" />
          {currentSlideData.eyebrow}
        </div>

        {/* Headline */}
        <h1 className="mt-7 max-w-[640px] font-display text-[3.1rem] font-black leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-[5rem]">
          {currentSlideData.headline.split('\n').map((line, index) => (
            <>
              {line}
              {index < currentSlideData.headline.split('\n').length - 1 && <br />}
            </>
          ))}
        </h1>

        {/* Description */}
        <p className="mt-6 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
          {currentSlideData.description}
        </p>

        {/* Buttons */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {/* Primary Button */}
          <Link
            href={currentSlideData.primaryButtonHref}
            className={`inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[#D62F37] px-7 text-sm font-black text-white shadow-[0_14px_35px_rgba(214,47,55,.28)] ${reducedMotion ? 'transition-none' : 'transition'} hover:bg-[#E53A42] active:scale-[.97]`}
          >
            {currentSlideData.primaryButtonText}
            <ArrowRight className="size-4" />
          </Link>

          {/* Secondary Button (if applicable) */}
          {currentSlideData.showSecondaryButton && currentSlideData.secondaryButtonText && currentSlideData.secondaryButtonHref && (
            <>
              {/* Special handling for delivery area button to preserve existing behavior */}
              {currentSlideData.secondaryButtonHref === '#' ? (
                <button
                  className={`inline-flex h-13 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur ${reducedMotion ? 'transition-none' : 'transition'} hover:bg-white/15`}
                  onClick={(e) => {
                    e.preventDefault();
                    // Replicate the existing delivery area button behavior
                    toast.success(
                      location ? "Delivery area selected" : "Choose a delivery area first",
                      { description: location ? `${location.area}, ${location.city} · ${location.pincode}` : "Use your current location to check availability." }
                    );
                  }}
                >
                  <MapPin className="size-4 text-[#86CC68]" />
                  {currentSlideData.secondaryButtonText}
                </button>
              ) : (
                <Link
                  href={currentSlideData.secondaryButtonHref}
                  className={`inline-flex h-13 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur ${reducedMotion ? 'transition-none' : 'transition'} hover:bg-white/15`}
                >
                  <MapPin className="size-4 text-[#86CC68]" />
                  {currentSlideData.secondaryButtonText}
                </Link>
              )}
            </>
          )}
        </div>

        {/* Benefits Section (only on first slide) */}
        {currentSlideData.id === 1 && (
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-white/65">
            <span className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-[#86CC68]" /> {googleBusiness.rating.toFixed(1)} Google rating · {googleBusiness.reviewCount.toLocaleString()} reviews
            </span>
            <span className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-[#86CC68]" /> No frozen stock
            </span>
            <span className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-[#86CC68]" /> Cut to order
            </span>
          </div>
        )}
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={() => {
          const prev = (currentSlide - 1 + slides.length) % slides.length;
          goToSlide(prev);
        }}
        className={`absolute left-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-white/20 text-white/50 hover:bg-white/30 hover:text-white ${reducedMotion ? 'transition-none' : 'transition-colors'} disabled:opacity-50`}
        aria-label="Previous slide"
      >
        <ArrowLeft className="size-5" />
      </button>
      <button
        onClick={() => {
          const next = (currentSlide + 1) % slides.length;
          goToSlide(next);
        }}
        className={`absolute right-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-white/20 text-white/50 hover:bg-white/30 hover:text-white ${reducedMotion ? 'transition-none' : 'transition-colors'} disabled:opacity-50`}
        aria-label="Next slide"
      >
        <ArrowRight className="size-5" />
      </button>

      {/* Pagination Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {slides.map((slide, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`h-3 w-3 rounded-full bg-white/30 hover:bg-white/50 focus-visible:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${reducedMotion ? 'transition-none' : 'transition-colors'} ${currentSlide === index ? 'bg-white/60' : ''}`}
            aria-label={`Go to slide ${index + 1}`}
            aria-current={currentSlide === index ? 'true' : undefined}
          />
        ))}
      </div>
    </div>
  );
}

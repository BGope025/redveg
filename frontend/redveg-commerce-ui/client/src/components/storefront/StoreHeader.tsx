import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCart } from '@/contexts/CartContext';
import { useLocation } from '@/contexts/LocationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useHeaderTheme } from '@/contexts/HeaderThemeContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { ChevronDown, LogOut, MapPin, Menu, Search, ShoppingBag, UserRound } from 'lucide-react';
import { DeliveryLocationModal } from '@/components/DeliveryLocationModal';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { Link, useLocation as useRouterLocation, useLocation as wouterUseLocation } from 'wouter';
import type { DeliveryLocation } from '@/contexts/LocationContext';


export function StoreHeader() {
  const { itemCount } = useCart();
  const { location, setLocation } = useLocation();
  const { user, isAuthenticated, signOutUser } = useAuth();
  const { effectiveTheme } = useHeaderTheme();
  const { activeCampaign } = useCampaign();
  const [search, setSearch] = useState('');
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [, navigate] = useRouterLocation();
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  const p = effectiveTheme.palette;
  const isDefault = effectiveTheme.id === 'default';

  // Close account dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setIsAccountDropdownOpen(false);
      }
    }
    if (isAccountDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isAccountDropdownOpen]);

  // Show dialog on first visit if no saved location
  useEffect(() => {
    const savedLocation = localStorage.getItem('redveg_delivery_location');
    if (!savedLocation) {
      setIsLocationDialogOpen(true);
    }
  }, []);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    navigate(`/shop${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`);
  };

  const handleLocationClick = useCallback(() => {
    setIsLocationDialogOpen(true);
  }, []);

  const handleLocationSelected = useCallback((newLocation: DeliveryLocation) => {
    setLocation(newLocation);
    localStorage.setItem(
      'redveg_delivery_location',
      JSON.stringify({
        pincode: newLocation.pincode,
        area: newLocation.area,
        city: newLocation.city,
        state: newLocation.state,
        source: newLocation.latitude != null && newLocation.longitude != null ? 'geolocation' : 'pincode',
        latitude: newLocation.latitude ?? null,
        longitude: newLocation.longitude ?? null,
      })
    );
    setIsLocationDialogOpen(false);
  }, [setLocation]);

  // Build CSS custom properties for the theme — scoped to the header wrapper
  const themeVars = useMemo(() => ({
    '--ht-top-bg': p.topBarBg,
    '--ht-top-fg': p.topBarFg,
    '--ht-bg': p.headerBg,
    '--ht-fg': p.headerFg,
    '--ht-accent': p.accent,
    '--ht-accent2': p.accentSecondary,
    '--ht-search-bg': p.searchBg,
    '--ht-pin-bg': p.locationPinBg,
    '--ht-pin-fg': p.locationPinFg,
    '--ht-border': p.borderColor,
    '--ht-nav-text': p.navText,
    '--ht-nav-hover-bg': p.navHoverBg,
    '--ht-nav-hover-text': p.navHoverText,
    '--ht-cart-badge': p.cartBadgeBg,
  } as React.CSSProperties), [p]);

  const campaignVars = useMemo(() => {
    if (!activeCampaign) return {};
    
    return {
      '--campaign-bg': activeCampaign.backgroundColor,
      '--campaign-fg': activeCampaign.foregroundColor,
      '--campaign-accent': activeCampaign.accentColor,
      '--campaign-button-bg': activeCampaign.buttonColor,
      '--campaign-button-fg': activeCampaign.buttonTextColor,
    } as React.CSSProperties;
  }, [activeCampaign]);

  return (
    <>
      {/* ── Theme wrapper: all theme CSS vars are scoped here ── */}
      <div data-header-theme={effectiveTheme.id} style={themeVars}>
        {/* Top announcement bar */}
        <div style={{ backgroundColor: p.topBarBg, color: p.topBarFg }}>
          <div className="container flex h-8 items-center justify-between text-[0.7rem] font-semibold tracking-wide">
            <span>Freshly cut · Hygienically packed · Delivered across Kolkata delivery</span>
            <span className="hidden sm:inline">Order before 6 PM for same-day delivery</span>
          </div>
        </div>

        {/* Main header */}
        <header
          className="sticky top-0 z-40 backdrop-blur-xl"
          style={{
            backgroundColor: p.headerBg + 'F2', // ~95% opacity
            color: p.headerFg,
            borderBottom: `1px solid ${p.borderColor}`,
            boxShadow: `0 8px 30px ${isDefault ? 'rgba(55,28,22,0.05)' : 'rgba(0,0,0,0.04)'}`,
          }}
        >
          <div className="container">
            <div className="flex h-[74px] items-center gap-3 lg:h-[84px] lg:gap-7">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => toast("Category menu is available in the bar below.")} aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
              <BrandLogo compact />

              {/* Desktop location selector */}
              <div className="hidden min-w-[190px] items-center gap-2 border-l pl-6 text-left lg:flex" style={{ borderColor: p.borderColor }}>
                <button
                  type="button"
                  onClick={handleLocationClick}
                  aria-label={
                    location
                      ? `Change delivery location. Current: ${location.area}, ${location.pincode}`
                      : 'Choose delivery location'
                  }
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer hover:opacity-80"
                  style={{ borderColor: p.borderColor }}
                >
                  <span className="grid size-9 place-items-center rounded-full" style={{ backgroundColor: p.locationPinBg, color: p.locationPinFg }}>
                    <MapPin className="size-4" />
                  </span>
                  <span>
                    <span className="block text-[0.68rem] font-bold uppercase tracking-[0.14em] opacity-60">
                      Deliver to
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-sm font-bold">
                      {location ? `${location.area} · ${location.pincode}` : 'Choose location'} <ChevronDown className="size-3.5" />
                    </span>
                  </span>
                </button>
              </div>

              <form onSubmit={submitSearch} className="relative ml-auto hidden max-w-xl flex-1 md:block">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 opacity-50" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-12 rounded-full border-transparent pl-11 pr-4 shadow-none focus-visible:bg-white"
                  style={{ backgroundColor: p.searchBg }}
                  placeholder="Search fish, chicken, mutton..."
                  aria-label="Search products"
                />
              </form>

              {/* Account button — auth-aware */}
              {isAuthenticated ? (
                <div className="relative hidden md:block" ref={accountDropdownRef}>
                  <Button
                    variant="ghost"
                    className="h-11 gap-2 px-3"
                    onClick={() => setIsAccountDropdownOpen((prev) => !prev)}
                  >
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt="" className="size-7 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${p.accent}33` }} />
                    ) : (
                      <span className="grid size-7 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: p.accent }}>
                        {(user?.displayName?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                      </span>
                    )}
                    <span className="hidden xl:inline max-w-[100px] truncate text-sm font-semibold">
                      {user?.displayName || user?.email?.split('@')[0] || 'Account'}
                    </span>
                    <ChevronDown className="size-3.5" />
                  </Button>

                  {/* Dropdown */}
                  {isAccountDropdownOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-white shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="border-b border-border px-4 py-3">
                        <p className="text-sm font-bold text-foreground truncate">{user?.displayName || 'User'}</p>
                        <p className="text-xs text-muted-foreground truncate">{user?.email || user?.phoneNumber || ''}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsAccountDropdownOpen(false);
                          await signOutUser();
                          toast.success('Signed out successfully');
                        }}
                        className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                      >
                        <LogOut className="size-4" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/login" className="hidden md:inline-flex">
                  <Button variant="ghost" className="h-11 gap-2 px-3">
                    <UserRound className="size-5" />
                    <span className="hidden xl:inline">Account</span>
                  </Button>
                </Link>
              )}

              <Link
                href="/cart"
                className="relative ml-auto grid size-11 shrink-0 place-items-center rounded-full text-white shadow-[0_8px_22px_rgba(180,35,44,0.25)] transition-transform duration-150 active:scale-[0.97] md:ml-0"
                style={{ backgroundColor: p.accent }}
                aria-label={`Cart with ${itemCount} items`}
              >
                <ShoppingBag className="size-5" />
                {itemCount > 0 && (
                  <span
                    className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full px-1 text-[0.65rem] font-black leading-5 text-white ring-2 ring-white"
                    style={{ backgroundColor: p.cartBadgeBg }}
                  >
                    {itemCount}
                  </span>
                )}
              </Link>
            </div>

            {/* Mobile location selector */}
            <button
              type="button"
              onClick={handleLocationClick}
              className="mb-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden hover:opacity-80"
              style={{ borderColor: p.borderColor }}
              aria-label={
                location
                  ? `Change delivery location. Current: ${location.area}, ${location.pincode}`
                  : 'Choose delivery location'
              }
            >
              <MapPin className="size-4" style={{ color: p.locationPinFg }} />
              <span className="text-xs font-bold">
                {location ? `${location.area} · ${location.pincode}` : 'Choose location'}
              </span>
              <ChevronDown className="ml-auto size-3.5 opacity-50" />
            </button>

            <form onSubmit={submitSearch} className="relative mb-3 md:hidden">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 opacity-50" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 rounded-xl border-transparent pl-11"
                style={{ backgroundColor: p.searchBg }}
                placeholder="Search fish, chicken, mutton..."
                aria-label="Search products"
              />
            </form>
          </div>


          {/* Campaign Strip at Bottom of Header */}
          {activeCampaign && (activeCampaign.placement === 'header_strip' || activeCampaign.placement === 'both') ? (
            <div className="relative overflow-hidden font-sans border-t" style={{ ...(campaignVars as object), borderColor: p.borderColor }}>
              <div 
                className="flex min-h-[44px] flex-col items-center justify-center gap-2 px-4 py-2 text-center sm:flex-row sm:gap-4 md:py-0 md:min-h-[48px]"
                style={{ backgroundColor: 'var(--campaign-bg)', color: 'var(--campaign-fg)' }}
              >
                <div className="flex items-center gap-2 md:gap-3">
                  {activeCampaign.logoVariant && (
                    <img src={activeCampaign.logoVariant} alt="" className="h-6 w-auto object-contain" />
                  )}
                  {activeCampaign.label && (
                    <span 
                      className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wider md:text-xs"
                      style={{ backgroundColor: 'var(--campaign-accent)', color: 'var(--campaign-bg)' }}
                    >
                      {activeCampaign.label}
                    </span>
                  )}
                  <span className="text-sm font-bold tracking-tight md:text-base">{activeCampaign.message}</span>
                </div>
                
                {activeCampaign.ctaLabel && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeCampaign.destinationType === 'url') {
                        window.location.href = activeCampaign.destinationValue;
                      } else if (activeCampaign.destinationType === 'category') {
                        navigate(`/shop?category=${activeCampaign.destinationValue}`);
                      } else if (activeCampaign.destinationType === 'product') {
                        navigate(`/product/${activeCampaign.destinationValue}`);
                      } else if (activeCampaign.destinationType === 'collection') {
                        navigate(`/shop?collection=${activeCampaign.destinationValue}`);
                      } else {
                        navigate(activeCampaign.destinationValue);
                      }
                    }}
                    className="group flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-black shadow-sm transition-transform active:scale-95 md:text-sm"
                    style={{ backgroundColor: 'var(--campaign-button-bg)', color: 'var(--campaign-button-fg)' }}
                  >
                    {activeCampaign.ctaLabel}
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </button>
                )}
              </div>
              {/* Decorative accent line for campaign */}
              <div className="h-1 w-full" style={{ backgroundColor: 'var(--campaign-accent)' }} />
            </div>
          ) : (
            /* ── Decorative accent line at bottom of header ── */
            !isDefault && (
              <div
                className="h-[3px] w-full pointer-events-none"
                style={{
                  background: `linear-gradient(90deg, ${p.accent}, ${p.accentSecondary}, ${p.accent})`,
                }}
                aria-hidden="true"
              />
            )
          )}
        </header>
      </div>

      {/* Delivery Location Modal — controlled, always in DOM */}
      <DeliveryLocationModal
        open={isLocationDialogOpen}
        onOpenChange={setIsLocationDialogOpen}
        onLocationSelected={handleLocationSelected}
      />
    </>
  );
}
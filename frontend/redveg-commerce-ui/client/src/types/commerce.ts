import type { HeaderTheme } from "@/themes/headerThemes";

export type CategorySlug = "fish" | "chicken" | "mutton" | "prawns" | "crabs-seafood" | "combos" | "offers";

export interface Category {
  id: CategorySlug;
  name: string;
  description: string;
  image: string;
  accent: string;
}

export interface ProductVariant {
  id: string;
  label: string;
  price: number;
  mrp?: number;
  stock: number;
  available: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: CategorySlug;
  description: string;
  shortDescription: string;
  image: string;
  badge?: string;
  rating: number;
  reviewCount: number;
  deliveryMinutes: number;
  featured?: boolean;
  bestseller?: boolean;
  variants: ProductVariant[];
}

export interface CartItem {
  productId: string;
  variantId: string;
  quantity: number;
}

export type OrderStatus =
  | "New"
  | "Confirmed"
  | "Processing"
  | "Out for Delivery"
  | "Delivered"
  | "Cancelled";

export interface Order {
  id: string;
  customer: string;
  mobile: string;
  address: string;
  pincode: string;
  placedAt: string;
  total: number;
  subtotal?: number;
  discountAmount?: number;
  deliveryFee?: number;
  couponCode?: string | null;
  paymentStatus?: "Paid" | "Partial" | "Unpaid";
  receivedAmount?: number;
  dueAmount?: number;
  itemCount: number;
  source: "Instagram" | "Google" | "Direct" | "WhatsApp";
  status: OrderStatus;
  items: Array<{
    name: string;
    variant: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export interface DeliveryLocation {
  pincode: string;
  area: string;
  city: string;
  state: string;
  isServiceable?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}
// ──────────────────────────────────────────────────────────────────────────────
// Campaign Types - Seasonal Header System
// ──────────────────────────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'scheduled' | 'published' | 'paused' | 'expired' | 'archived';

export type CampaignPlacement = 'header_strip' | 'collection_module' | 'both';

export type CampaignOccasion =
  | 'diwali'
  | 'holi'
  | 'valentines'
  | 'ramadan_eid'
  | 'new_year'
  | 'ipl'
  | 'independence_day'
  | 'durga_puja'
  | 'custom';

export interface CampaignThemeBase {
  id: string;
  name: string;
  slug: string;
  occasion: CampaignOccasion;
  customOccasionLabel?: string;
  status: CampaignStatus;

  startsAt: string; // ISO timestamp
  endsAt: string; // ISO timestamp
  timezone: string; // IANA timezone string

  placement: CampaignPlacement;
  priority: number; // Higher number = higher priority

  label: string; // Short label/callout
  message: string; // Main campaign message
  ctaLabel: string; // Call-to-action button text
  destinationType: 'url' | 'category' | 'collection' | 'product' | 'custom';
  destinationValue: string; // URL, category slug, etc.

  backgroundColor: string; // CSS color
  foregroundColor: string; // CSS color
  accentColor: string; // CSS color
  buttonColor: string; // CSS color
  buttonTextColor: string; // CSS color
  borderColor?: string; // CSS color (optional)

  logoVariant?: string; // Reference to logo variant
  desktopImageUrl?: string; // URL to desktop image
  mobileImageUrl?: string; // URL to mobile image
  posterImageUrl?: string; // URL to poster/fallback image
  backgroundPattern?: string; // Safe predefined pattern

  altText?: string; // Accessibility text for images
  reducedMotionMessage?: string; // Message when motion is reduced

  targetLocations?: string[]; // Area/pincode codes, empty array = all locations
  targetDevice?: 'all' | 'desktop' | 'mobile';

  collectionTitle?: string; // For collection module
  collectionSubtitle?: string; // For collection module
  collectionLink?: string; // For collection module
  collectionImageUrl?: string; // For collection module

  analyticsCampaignId: string; // For analytics tracking
  createdBy: string; // User ID
  updatedBy: string; // User ID
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  publishedAt?: string; // ISO timestamp
  archivedAt?: string; // ISO timestamp
}

// Campaign type that extends HeaderTheme for compatibility
export interface Campaign extends CampaignThemeBase, Omit<HeaderTheme, 'id' | 'name' | 'description' | 'emoji' | 'palette'> {
  // Additional fields beyond HeaderTheme
  // All CampaignThemeBase fields are included
}

export const META_PIXEL_ID = "1589412762313544";

type MetaPixel = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[][]; push?: MetaPixel; loaded?: boolean; version?: string };
declare global {
  interface Window {
    fbq?: MetaPixel;
    _fbq?: MetaPixel;
  }
}

let initialized = false;
const memoryPurchaseIds = new Set<string>();
const PURCHASE_STORAGE_KEY = "redveg-meta-purchases-v1";

export function initializeMetaPixel() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  if (!window.fbq) {
    const pixel: MetaPixel = function (...args: unknown[]) {
      if (pixel.callMethod) pixel.callMethod(...args);
      else (pixel.queue ||= []).push(args);
    } as MetaPixel;
    pixel.push = pixel;
    pixel.loaded = true;
    pixel.version = "2.0";
    window.fbq = window._fbq = pixel;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.dataset.metaPixel = META_PIXEL_ID;
    document.head.appendChild(script);
  }
  window.fbq("init", META_PIXEL_ID);
}

export function trackMetaEvent(eventName: string, parameters?: Record<string, unknown>, eventId?: string) {
  if (typeof window === "undefined") return;
  initializeMetaPixel();
  if (eventId) window.fbq?.("track", eventName, parameters || {}, { eventID: eventId });
  else window.fbq?.("track", eventName, parameters || {});
}

export function trackMetaPurchase(orderId: string, value: number, contentIds: string[], contents: Array<{ id: string; quantity: number; item_price: number }>) {
  const id = String(orderId || "").trim();
  const amount = Number(value);
  if (!id || !Number.isFinite(amount) || amount < 0 || alreadyTrackedPurchase(id)) return false;
  // Persist before queueing the event so retries or rerenders cannot report this order twice.
  rememberPurchase(id);
  trackMetaEvent("Purchase", {
    value: amount,
    currency: "INR",
    content_type: "product",
    content_ids: contentIds,
    contents,
    order_id: id,
  }, `purchase-${id}`);
  return true;
}

function alreadyTrackedPurchase(orderId: string) {
  if (memoryPurchaseIds.has(orderId)) return true;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PURCHASE_STORAGE_KEY) || "[]");
    return Array.isArray(saved) && saved.includes(orderId);
  } catch {
    return false;
  }
}

function rememberPurchase(orderId: string) {
  memoryPurchaseIds.add(orderId);
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PURCHASE_STORAGE_KEY) || "[]");
    const ids = Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
    localStorage.setItem(PURCHASE_STORAGE_KEY, JSON.stringify([...ids.filter(value => value !== orderId), orderId].slice(-200)));
  } catch {
    // The in-memory guard still prevents repeat events during the current page session.
  }
}

export const pendingCampaignWhatsAppKey = "redveg:pending-campaign-whatsapp";
export const campaignWhatsAppContinuePath = "/campaign/continue";

const whatsappHosts = new Set([
  "wa.me",
  "api.whatsapp.com",
  "web.whatsapp.com",
]);

export function isWhatsAppCampaignUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" && whatsappHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

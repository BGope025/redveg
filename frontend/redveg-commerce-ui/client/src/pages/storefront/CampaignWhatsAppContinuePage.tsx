import { StoreShell } from "@/components/storefront/StoreShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  campaignWhatsAppContinuePath,
  isWhatsAppCampaignUrl,
  pendingCampaignWhatsAppKey,
} from "@/lib/campaignWhatsapp";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function CampaignWhatsAppContinuePage() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;

    const pendingUrl = sessionStorage.getItem(pendingCampaignWhatsAppKey);
    if (!pendingUrl || !isWhatsAppCampaignUrl(pendingUrl)) {
      sessionStorage.removeItem(pendingCampaignWhatsAppKey);
      setLocation("/offers");
      return;
    }

    if (!isAuthenticated) {
      setLocation(
        `/login?returnTo=${encodeURIComponent(campaignWhatsAppContinuePath)}`
      );
      return;
    }

    sessionStorage.removeItem(pendingCampaignWhatsAppKey);
    window.location.assign(pendingUrl);
  }, [isAuthenticated, loading, setLocation]);

  return (
    <StoreShell>
      <div className="container grid min-h-[50vh] place-items-center py-12">
        <p className="text-sm font-semibold text-[#74645D]" role="status">
          {loading ? "Checking your account…" : "Opening WhatsApp…"}
        </p>
      </div>
    </StoreShell>
  );
}

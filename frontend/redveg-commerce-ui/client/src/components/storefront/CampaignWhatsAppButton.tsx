import { useAuth } from "@/contexts/AuthContext";
import {
  campaignWhatsAppContinuePath,
  isWhatsAppCampaignUrl,
  pendingCampaignWhatsAppKey,
} from "@/lib/campaignWhatsapp";
import { useLocation } from "wouter";
import type { ReactNode } from "react";
import type { CSSProperties } from "react";

export function CampaignWhatsAppButton({
  href,
  children,
  className,
  style,
}: {
  href: string;
  children: ReactNode;
  className: string;
  style?: CSSProperties;
}) {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  const continueToWhatsApp = () => {
    if (loading || !isWhatsAppCampaignUrl(href)) return;
    if (!isAuthenticated) {
      sessionStorage.setItem(pendingCampaignWhatsAppKey, href);
      setLocation(
        `/login?returnTo=${encodeURIComponent(campaignWhatsAppContinuePath)}`
      );
      return;
    }

    window.location.assign(href);
  };

  return (
    <button
      type="button"
      onClick={continueToWhatsApp}
      disabled={loading}
      className={className}
      style={style}
      aria-label={loading ? "Checking sign-in status" : undefined}
    >
      {children}
    </button>
  );
}

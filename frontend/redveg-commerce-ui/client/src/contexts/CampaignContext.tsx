// ──────────────────────────────────────────────────────────────────────────────
// CampaignContext — Manages active campaigns for the seasonal header system
// ──────────────────────────────────────────────────────────────────────────────

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { Campaign } from "@/types/commerce";
import { campaignApi, campaignsUpdatedEvent } from "@/lib/campaignApi";

const campaignsUpdatedStorageKey = "redveg:campaigns-updated";

interface CampaignContextValue {
  /** The currently active campaign resolved based on time/location/device */
  activeCampaign: Campaign | null;
  /** All campaigns currently published within their configured time window */
  activeCampaigns: Campaign[];
  /** All campaigns (for admin use) */
  allCampaigns: Campaign[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: string | null;
  /** Refetch campaigns */
  refetch: () => Promise<void>;
  /** Resolve active campaign with specific parameters */
  resolveActiveCampaign: (options: {
    now?: Date;
    locationId?: string;
    device?: "all" | "desktop" | "mobile";
  }) => Promise<Campaign | null>;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

export function CampaignProvider({ children }: { children: React.ReactNode }) {
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeCampaigns = allCampaigns.filter(campaign => {
    const now = Date.now();
    return campaign.status === "published" &&
      new Date(campaign.startsAt).getTime() <= now &&
      new Date(campaign.endsAt).getTime() > now;
  });

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const campaigns = await campaignApi.getCampaigns();
      setAllCampaigns(campaigns);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
      setError("Failed to load campaigns");
      setAllCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveActiveCampaign = async (options?: {
    now?: Date;
    locationId?: string;
    device?: "all" | "desktop" | "mobile";
  }): Promise<Campaign | null> => {
    try {
      const campaign = await campaignApi.resolveActiveCampaign(options || {});
      setActiveCampaign(campaign);
      return campaign;
    } catch (err) {
      console.error("Failed to resolve active campaign:", err);
      setError("Failed to resolve active campaign");
      return null;
    }
  };

  // Refresh on load, when the tab returns to the foreground, and immediately
  // after a campaign mutation in this tab or another RedVeg tab.
  useEffect(() => {
    void fetchCampaigns();
    const refreshTimer = window.setInterval(() => void fetchCampaigns(), 60_000);
    const handleCampaignChange = () => void fetchCampaigns();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === campaignsUpdatedStorageKey) handleCampaignChange();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") handleCampaignChange();
    };
    window.addEventListener(campaignsUpdatedEvent, handleCampaignChange);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleCampaignChange);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener(campaignsUpdatedEvent, handleCampaignChange);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleCampaignChange);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchCampaigns]);

  const refetch = fetchCampaigns;

  // Auto-resolve active campaign on load and when campaigns change
  useEffect(() => {
    resolveActiveCampaign();
  }, [allCampaigns]);

  return (
    <CampaignContext.Provider
      value={{
        activeCampaign,
        activeCampaigns,
        allCampaigns,
        loading,
        error,
        refetch,
        resolveActiveCampaign,
      }}
    >
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign() {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error("useCampaign must be used within CampaignProvider");
  return ctx;
}

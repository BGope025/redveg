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
import { campaignApi } from "@/lib/campaignApi";

interface CampaignContextValue {
  /** The currently active campaign resolved based on time/location/device */
  activeCampaign: Campaign | null;
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

  const fetchCampaigns = async () => {
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
  };

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

  // Initial load and refetch function
  useEffect(() => {
    fetchCampaigns();
    const refreshTimer = window.setInterval(fetchCampaigns, 60_000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  const refetch = useCallback(() => {
    return fetchCampaigns();
  }, []);

  // Auto-resolve active campaign on load and when campaigns change
  useEffect(() => {
    resolveActiveCampaign();
  }, [allCampaigns]);

  return (
    <CampaignContext.Provider
      value={{
        activeCampaign,
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

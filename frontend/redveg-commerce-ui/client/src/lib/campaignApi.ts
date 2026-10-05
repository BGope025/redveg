import type { Campaign, CampaignStatus, CampaignOccasion, CampaignPlacement } from '@/types/commerce';
import { apiFetch } from '@/lib/api';

// Campaign management always uses the real catalog backend; preview/mock mode
// must not create or display fake campaign records here.
const liveCampaignFetch = (path: string, init: RequestInit = {}) =>
  apiFetch(path, init, { forceBackend: true });


// Helper to handle fetch responses
async function handleFetchResponse(response: Response) {
  if (!response.ok) {
    // Try to get error message from body
    let errorMessage = 'Failed to fetch';
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch (e) {
      // ignore
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

export const campaignApi = {
  getCampaigns: async (options?: {
    status?: CampaignStatus[];
    occasion?: CampaignOccasion[];
    placement?: CampaignPlacement[];
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Campaign[]> => {
    try {
      // Build query string
      const params = new URLSearchParams();
      if (options?.status) {
        options.status.forEach(status => params.append('status', status));
      }
      if (options?.occasion) {
        options.occasion.forEach(occasion => params.append('occasion', occasion));
      }
      if (options?.placement) {
        options.placement.forEach(placement => params.append('placement', placement));
      }
      if (options?.activeOnly !== undefined) {
        params.append('activeOnly', String(options.activeOnly));
      }
      if (options?.limit !== undefined) {
        params.append('limit', String(options.limit));
      }
      if (options?.offset !== undefined) {
        params.append('offset', String(options.offset));
      }

      const query = params.toString();
      const response = await liveCampaignFetch(`campaigns${query ? `?${query}` : ''}`, {
        credentials: 'include', // include cookies for auth
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await handleFetchResponse(response);
      // Assuming the backend returns { success: true, data: Campaign[] }
      if (data && data.data) {
        return data.data;
      }
      // Fallback if structure is different
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      throw error; // Re-throw so UI can show error state
    }
  },

  getCampaignById: async (id: string): Promise<Campaign | null> => {
    try {
      const response = await liveCampaignFetch(`campaigns/${encodeURIComponent(id)}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 404) {
        return null;
      }

      const data = await handleFetchResponse(response);
      if (data && data.data) {
        return data.data;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching campaign ${id}:`, error);
      throw error;
    }
  },

  createCampaign: async (campaignData: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'archivedAt'>): Promise<Campaign> => {
    try {
      const response = await liveCampaignFetch('campaigns', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(campaignData),
      });

      const data = await handleFetchResponse(response);
      if (data && data.data) {
        return data.data;
      }
      throw new Error('Invalid response from server');
    } catch (error) {
      console.error('Error creating campaign:', error);
      throw error;
    }
  },

  updateCampaign: async (id: string, campaignData: Partial<Campaign>): Promise<Campaign | null> => {
    try {
      const response = await liveCampaignFetch(`campaigns/${encodeURIComponent(id)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(campaignData),
      });

      if (response.status === 404) {
        return null;
      }

      const data = await handleFetchResponse(response);
      if (data && data.data) {
        return data.data;
      }
      throw new Error('Invalid response from server');
    } catch (error) {
      console.error(`Error updating campaign ${id}:`, error);
      throw error;
    }
  },

  deleteCampaign: async (id: string): Promise<boolean> => {
    try {
      const response = await liveCampaignFetch(`campaigns/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 404) {
        return false;
      }

      if (!response.ok) {
        throw new Error('Failed to delete campaign');
      }

      // Assuming backend returns { success: true }
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error(`Error deleting campaign ${id}:`, error);
      throw error;
    }
  },

  resolveActiveCampaign: async (options?: {
    now?: Date;
    locationId?: string;
    device?: 'all' | 'desktop' | 'mobile';
  }): Promise<Campaign | null> => {
    try {
      // Build query string
      const params = new URLSearchParams();
      if (options?.now) {
        params.append('now', options.now.toISOString());
      }
      if (options?.locationId) {
        params.append('locationId', options.locationId);
      }
      if (options?.device) {
        params.append('device', options.device);
      }

      const query = params.toString();
      const response = await liveCampaignFetch(`campaigns/active${query ? `?${query}` : ''}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await handleFetchResponse(response);
      if (data && data.data) {
        return data.data;
      }
      return null;
    } catch (error) {
      console.error('Error resolving active campaign:', error);
      throw error;
    }
  }
};


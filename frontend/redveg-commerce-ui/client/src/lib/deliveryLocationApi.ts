import type { DeliveryLocation } from "@/contexts/LocationContext";
import { apiUrl } from "@/lib/api";

interface ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
}

const DELIVERY_LOCATION_REQUEST_TIMEOUT_MS = 10000;

function createRequestSignal(signal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    DELIVERY_LOCATION_REQUEST_TIMEOUT_MS
  );
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

export const deliveryLocationApi = {
  /**
   * Search for delivery locations by pincode or area name
   * @param query - Search query (pincode or area name)
   * @param serviceableOnly - If true, returns only serviceable locations
   * @returns Promise resolving to array of matching DeliveryLocation objects
   */
  async search(
    query: string,
    serviceableOnly = true,
    signal?: AbortSignal
  ): Promise<DeliveryLocation[]> {
    const request = createRequestSignal(signal);
    try {
      const params = new URLSearchParams();
      params.append("q", query);
      if (serviceableOnly) {
        params.append("serviceableOnly", "true");
      }
      const apiUrlStr = apiUrl(
        `delivery-locations/search?${params.toString()}`
      );
      const response = await fetch(apiUrlStr, {
        method: "GET",
        credentials: "include",
        signal: request.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Failed to search delivery locations: ${response.status}`
        );
      }
      const data: ApiResponse = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to search delivery locations");
      }
      // Map API response to DeliveryLocation type
      return (
        data.data?.map((loc: any) => ({
          pincode: loc.pincode,
          area: loc.area,
          city: loc.city,
          state: loc.state,
          isServiceable: loc.isServiceable,
          latitude: loc.latitude,
          longitude: loc.longitude,
          deliveryCharge: loc.deliveryCharge,
        })) ?? []
      );
    } catch (error) {
      console.error("Error searching delivery locations:", error);
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          "Pincode search timed out. Please check that the backend can reach Turso and try again."
        );
      }
      throw error; // Re-throw to let caller handle
    } finally {
      request.cleanup();
    }
  },

  /**
   * Reverse geocode latitude/longitude to get location details
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @param accuracy - Browser-reported accuracy radius in meters
   * @returns Promise resolving to DeliveryLocation object
   */
  async reverseGeocode(
    latitude: number,
    longitude: number,
    accuracy?: number
  ): Promise<DeliveryLocation> {
    const request = createRequestSignal();
    try {
      const apiUrlStr = apiUrl(`delivery-locations/reverse-geocode`);
      const response = await fetch(apiUrlStr, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude, accuracy }),
        credentials: "include",
        signal: request.signal,
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.message ||
            `Failed to reverse geocode location: ${response.status}`
        );
      }
      const data: ApiResponse = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to reverse geocode location");
      }
      // Map API response to DeliveryLocation type
      return {
        pincode: data.data.pincode,
        area: data.data.area,
        city: data.data.city,
        state: data.data.state,
        isServiceable: data.data.isServiceable,
        latitude: data.data.latitude,
        longitude: data.data.longitude,
        accuracy: data.data.accuracy ?? accuracy ?? null,
        accuracyWarning: data.data.accuracyWarning ?? false,
        learnedPincode: data.data.learnedPincode ?? false,
        deliveryCharge: data.data.deliveryCharge,
      } as DeliveryLocation;
    } catch (error) {
      console.error("Error reverse geocoding location:", error);
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          "Location lookup timed out. Please try searching by pincode instead."
        );
      }
      throw error; // Re-throw to let caller handle
    } finally {
      request.cleanup();
    }
  },
};

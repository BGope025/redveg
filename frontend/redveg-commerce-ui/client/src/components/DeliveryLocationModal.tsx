import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { MapPin, XIcon, Loader2Icon } from "lucide-react";
import { deliveryLocationApi } from "@/lib/deliveryLocationApi";
import type { DeliveryLocation } from "@/contexts/LocationContext";

interface DeliveryLocationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLocationSelected: (location: DeliveryLocation) => void;
}

function getBestCurrentPosition({
  targetAccuracy = 75,
  maxWaitMs = 20000,
}: {
  targetAccuracy?: number;
  maxWaitMs?: number;
} = {}): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let watchId: number | null = null;
    let timeoutId: number | null = null;
    let bestPosition: GeolocationPosition | null = null;
    let finished = false;

    const cleanup = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };

    const finish = (position: GeolocationPosition) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(position);
    };

    const fail = (error: GeolocationPositionError) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    };

    watchId = navigator.geolocation.watchPosition(
      position => {
        if (
          !bestPosition ||
          position.coords.accuracy < bestPosition.coords.accuracy
        ) {
          bestPosition = position;
        }
        if (position.coords.accuracy <= targetAccuracy) finish(position);
      },
      fail,
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs }
    );

    timeoutId = window.setTimeout(() => {
      if (bestPosition) {
        finish(bestPosition);
      } else {
        fail({
          code: 3,
          message: "Unable to obtain a location in time.",
        } as GeolocationPositionError);
      }
    }, maxWaitMs);
  });
}

export function DeliveryLocationModal({
  open,
  onOpenChange,
  onLocationSelected,
}: DeliveryLocationModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DeliveryLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] =
    useState<DeliveryLocation | null>(null);
  const [geolocationLoading, setGeolocationLoading] = useState(false);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset internal state when dialog opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setError(null);
      setSelectedLocation(null);
      setGeolocationError(null);
      // Focus the search input after the dialog animation
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      searchController.current?.abort();
    };
  }, []);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;

    try {
      const searchResults = await deliveryLocationApi.search(
        searchQuery,
        true,
        controller.signal
      );
      if (controller.signal.aborted) return;
      setResults(searchResults);
      setError(
        searchResults.length === 0 ? "No matching locations found" : null
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        "We couldn't search right now. Please try again or choose manually."
      );
      setResults([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const handleGeolocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeolocationError("Geolocation is not supported by your browser.");
      return;
    }

    setGeolocationLoading(true);
    setGeolocationError(null);

    try {
      const position = await getBestCurrentPosition();
      const { latitude, longitude, accuracy } = position.coords;
      const location = await deliveryLocationApi.reverseGeocode(
        latitude,
        longitude,
        accuracy
      );

      setSelectedLocation({ ...location, accuracy });
      setQuery(`${location.area}, ${location.city} · ${location.pincode}`);
      if (accuracy > 150) {
        setGeolocationError(
          `Location detected with approximately ${Math.round(accuracy)}m accuracy. Please verify it before confirming.`
        );
      }
    } catch (err: any) {
      if (err.code === 1) {
        setGeolocationError(
          "Location permission was denied. You can search by pincode instead."
        );
      } else if (err.code === 2) {
        setGeolocationError(
          "We couldn't detect your location. Please search by pincode."
        );
      } else if (err.code === 3) {
        setGeolocationError(
          "Geolocation request timed out. Please try again or search by pincode."
        );
      } else {
        setGeolocationError(
          err.message || "An unknown error occurred with geolocation."
        );
      }
    } finally {
      setGeolocationLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (query.length >= 3) {
      debounceTimer.current = setTimeout(() => {
        handleSearch(query);
      }, 300);
    } else if (query.length === 0) {
      searchController.current?.abort();
      setLoading(false);
      setResults([]);
      setError(null);
    }
  }, [query, handleSearch]);

  const handleLocationSelect = useCallback((location: DeliveryLocation) => {
    setSelectedLocation(location);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedLocation) return;
    onLocationSelected(selectedLocation);
  }, [selectedLocation, onLocationSelected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-auto max-h-[90vh] overflow-y-auto overscroll-contain sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-3">
              <BrandLogo compact className="flex-shrink-0" />
            </div>
          </DialogTitle>
          <DialogDescription>Choose delivery location</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-background px-1 pb-2 pt-1">
            <label
              htmlFor="location-search"
              className="text-[0.68rem] font-bold text-foreground"
            >
              Search your pincode...
            </label>
            <div className="relative">
              <input
                ref={searchInputRef}
                id="location-search"
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search your pincode..."
                className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 disabled:opacity-50"
                disabled={loading || geolocationLoading}
              />
              {loading && (
                <Loader2Icon className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-primary animate-spin" />
              )}
              {!loading && query.length > 0 && (
                <XIcon
                  className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground cursor-pointer hover:text-accent-foreground"
                  onClick={() => setQuery("")}
                />
              )}
            </div>
            {error && (
              <p className="text-[0.62rem] text-destructive">{error}</p>
            )}
          </div>

          {/* Geolocation Button */}
          <Button
            variant="outline"
            className="w-full items-center justify-start gap-3 px-4 py-3 text-left"
            disabled={geolocationLoading}
            onClick={handleGeolocation}
          >
            <div className="flex items-center gap-2">
              {geolocationLoading ? (
                <Loader2Icon className="size-4 text-primary animate-spin" />
              ) : (
                <MapPin className="size-5 text-[#B4232C]" />
              )}
            </div>
            <div className="flex-1 space-y-1 min-w-0">
              <span className="block text-[0.68rem] font-bold text-foreground truncate">
                Use my current location
              </span>
              {geolocationError ? (
                <p className="text-[0.62rem] text-destructive break-words whitespace-normal leading-tight">
                  {geolocationError}
                </p>
              ) : (
                <p className="text-[0.62rem] text-muted-foreground break-words whitespace-normal leading-tight">
                  We use your location only to check delivery availability near
                  you.
                </p>
              )}
            </div>
          </Button>

          {/* Search Results */}
          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-[0.68rem] font-bold text-foreground">
                Search results:
              </p>
              <div className="space-y-1">
                {results.map((location, index) => (
                  <button
                    key={`${location.pincode}-${index}`}
                    onClick={() => handleLocationSelect(location)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-background text-left
                      ${
                        selectedLocation?.pincode === location.pincode
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent hover:text-accent-foreground"
                      }
                      focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0
                      transition-all duration-150`}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between">
                        <span className="block text-[0.68rem] font-semibold text-foreground">
                          {location.area}
                        </span>
                        <span className="block text-[0.62rem] text-muted-foreground">
                          {location.pincode}
                        </span>
                      </div>
                      {!location.isServiceable && (
                        <span className="block text-[0.62rem] text-destructive">
                          Currently unavailable in this area
                        </span>
                      )}
                    </div>
                    {selectedLocation?.pincode === location.pincode && (
                      <svg
                        className="size-4 text-primary-foreground"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submit Button */}
          {selectedLocation && (
            <div className="space-y-2">
              {selectedLocation.accuracy && (
                <p className="text-center text-[0.62rem] text-muted-foreground">
                  Detected within approximately{" "}
                  {Math.round(selectedLocation.accuracy)}m
                </p>
              )}
              <Button
                variant="default"
                className="w-full px-4 py-3"
                disabled={loading || geolocationLoading}
                onClick={handleSubmit}
              >
                Confirm location
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Skip</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

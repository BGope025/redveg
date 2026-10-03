import { createContext } from "react";
import type { DeliveryLocation } from "./LocationContext";

export type LocationContextType = {
  location: DeliveryLocation | null;
  setLocation: (location: DeliveryLocation | null) => void;
  hasLocation: boolean;
};

export const LocationContext = createContext<LocationContextType | undefined>(undefined);

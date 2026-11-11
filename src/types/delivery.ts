/**
 * Delivery, Zones, Landmarks, and Address Domain Types
 */

export type FulfillmentType = 'pickup' | 'delivery';

export type PricingModel = 'zone_landmark' | 'distance_tiered' | 'hybrid';

export interface DeliveryZone {
  id: string;
  name: string;             // e.g. "UNILAG Campus", "Mainland Zone 1", "Mainland Zone 2"
  baseFee: number;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  isActive: boolean;
}

export interface DeliveryLandmark {
  id: string;
  zoneId: string;
  name: string;             // e.g. "Inside School (UNILAG)", "Abule Oja", "Akoka", "Yaba", "Surulere"
  fee: number;              // Verified landmark delivery price
  isCampus: boolean;        // True if inside UNILAG gates
  displayOrder: number;
  isActive: boolean;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  title?: string;           // e.g. "Hostel Room", "Office", "Home", "Faculty"
  landmarkId: string;
  landmarkName: string;
  detailedAddress: string;  // e.g. "King Jaja Hall, Block B, Room 14"
  estateOrHostel?: string | null; // e.g. "King Jaja Hall", "Moremi Hall", "Fagunwa Hall"
  roomOrPlot?: string | null;     // e.g. "Block A, Room 12"
  streetAddress?: string | null;  // e.g. "Commercial Avenue"
  area?: string | null;           // e.g. "Akoka", "Yaba"
  contactPhone: string;
  deliveryNotes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface FulfillmentSelection {
  type: FulfillmentType;
  landmarkId?: string;
  landmarkName?: string;
  deliveryFee: number;
  detailedAddress?: string;
  deliveryNotes?: string;
}

export interface DeliveryConfig {
  id?: string;
  storeName: string;
  storeAddress: string;
  storeLatitude: number;
  storeLongitude: number;
  maxDeliveryRadiusKm: number;
  minDeliveryFee: number;
  pricingModel: PricingModel;
  isDeliveryActive: boolean;
  isPickupActive: boolean;
  pickupFee: number;
}

export interface DeliveryQuote {
  fulfillmentType: FulfillmentType;
  isAvailable: boolean;
  deliveryFee: number;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  distanceKm?: number;
  landmark?: DeliveryLandmark | null;
  zone?: DeliveryZone | null;
  reason?: string;
}

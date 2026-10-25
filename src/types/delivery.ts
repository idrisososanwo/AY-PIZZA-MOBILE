/**
 * Delivery, Zones, Landmarks, and Address Domain Types
 */

export type FulfillmentType = 'pickup' | 'delivery';

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
  landmarkId: string;
  landmarkName: string;
  detailedAddress: string;  // e.g. "King Jaja Hall, Block B, Room 14"
  contactPhone: string;
  deliveryNotes?: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface FulfillmentSelection {
  type: FulfillmentType;
  landmarkId?: string;
  landmarkName?: string;
  deliveryFee: number;
  detailedAddress?: string;
  deliveryNotes?: string;
}

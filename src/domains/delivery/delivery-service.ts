/**
 * Delivery Zone & Landmark Pricing Service
 */

import { DeliveryLandmark, FulfillmentType } from '../../types/delivery';
import { Brand } from '../../constants/brand';

/**
 * Provisional Delivery Landmarks & Fees Table
 * NOTE: These rates are reverse-engineered estimates derived from the legacy web portal
 * and are strictly PROVISIONAL pending explicit sign-off from the restaurant owner.
 * In production, rates are database-driven in public.delivery_landmarks and can be updated
 * at any time by administrators without application redeployment.
 */
export const PROVISIONAL_LANDMARKS: DeliveryLandmark[] = [
  { id: 'lm-1', zoneId: 'zone-campus', name: 'Inside School (UNILAG Campus)', fee: 500, isCampus: true, displayOrder: 1, isActive: true },
  { id: 'lm-2', zoneId: 'zone-near', name: 'Abule Oja', fee: 1000, isCampus: false, displayOrder: 2, isActive: true },
  { id: 'lm-3', zoneId: 'zone-near', name: 'Akoka', fee: 1000, isCampus: false, displayOrder: 3, isActive: true },
  { id: 'lm-4', zoneId: 'zone-near', name: 'Onike', fee: 1000, isCampus: false, displayOrder: 4, isActive: true },
  { id: 'lm-5', zoneId: 'zone-near', name: 'Iwaya', fee: 1000, isCampus: false, displayOrder: 5, isActive: true },
  { id: 'lm-6', zoneId: 'zone-near', name: 'Abule Ijesha', fee: 1200, isCampus: false, displayOrder: 6, isActive: true },
  { id: 'lm-7', zoneId: 'zone-near', name: 'Bariga', fee: 1500, isCampus: false, displayOrder: 7, isActive: true },
  { id: 'lm-8', zoneId: 'zone-mid', name: 'Makoko', fee: 2000, isCampus: false, displayOrder: 8, isActive: true },
  { id: 'lm-9', zoneId: 'zone-mid', name: 'Alagomeji', fee: 2000, isCampus: false, displayOrder: 9, isActive: true },
  { id: 'lm-10', zoneId: 'zone-mid', name: 'Bajuliaye', fee: 2000, isCampus: false, displayOrder: 10, isActive: true },
  { id: 'lm-11', zoneId: 'zone-mid', name: 'Shomolu', fee: 2000, isCampus: false, displayOrder: 11, isActive: true },
  { id: 'lm-12', zoneId: 'zone-mid', name: 'Yaba', fee: 2000, isCampus: false, displayOrder: 12, isActive: true },
  { id: 'lm-13', zoneId: 'zone-mid', name: 'Palmgroove', fee: 2500, isCampus: false, displayOrder: 13, isActive: true },
  { id: 'lm-14', zoneId: 'zone-far', name: 'Luth (Idi-Araba)', fee: 3000, isCampus: false, displayOrder: 14, isActive: true },
  { id: 'lm-15', zoneId: 'zone-far', name: 'Onipanu', fee: 3000, isCampus: false, displayOrder: 15, isActive: true },
  { id: 'lm-16', zoneId: 'zone-far', name: 'Surulere', fee: 3500, isCampus: false, displayOrder: 16, isActive: true },
  { id: 'lm-17', zoneId: 'zone-far', name: 'Gbagada', fee: 4000, isCampus: false, displayOrder: 17, isActive: true },
  { id: 'lm-18', zoneId: 'zone-far', name: 'Ebute Meta', fee: 4000, isCampus: false, displayOrder: 18, isActive: true },
  { id: 'lm-19', zoneId: 'zone-far', name: 'Oworo', fee: 4000, isCampus: false, displayOrder: 19, isActive: true },
];

/** Backward-compatible alias — note: rates are provisional */
export const VERIFIED_LANDMARKS = PROVISIONAL_LANDMARKS;

/**
 * Resolves the official delivery fee for a landmark or fulfillment selection.
 */
export function resolveDeliveryFee(fulfillmentType: FulfillmentType, landmarkNameOrId?: string): number {
  if (fulfillmentType === 'pickup') {
    return Brand.fulfillment.pickupFee; // ₦0
  }

  if (!landmarkNameOrId) {
    throw new Error('A delivery landmark must be selected for delivery orders.');
  }

  const query = landmarkNameOrId.trim().toLowerCase();
  const landmark = VERIFIED_LANDMARKS.find(
    (l) => l.id.toLowerCase() === query || l.name.toLowerCase() === query
  );

  if (!landmark) {
    throw new Error(`Unrecognized delivery landmark: "${landmarkNameOrId}".`);
  }

  if (!landmark.isActive) {
    throw new Error(`Delivery to "${landmark.name}" is currently suspended.`);
  }

  return landmark.fee;
}

/**
 * Checks if a landmark is located on the UNILAG campus.
 */
export function isCampusLandmark(landmarkNameOrId: string): boolean {
  const query = landmarkNameOrId.trim().toLowerCase();
  const landmark = VERIFIED_LANDMARKS.find(
    (l) => l.id.toLowerCase() === query || l.name.toLowerCase() === query
  );
  return landmark?.isCampus ?? false;
}

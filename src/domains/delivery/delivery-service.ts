/**
 * Delivery Zone & Landmark Pricing Service
 */

import { FulfillmentType } from '../../types/delivery';
import { Brand } from '../../constants/brand';
import { deliveryPricingEngine, VERIFIED_LANDMARKS } from './delivery-pricing-engine';

export { deliveryPricingEngine, PROVISIONAL_LANDMARKS, VERIFIED_LANDMARKS } from './delivery-pricing-engine';
export { locationService, STORE_COORDINATES, DEFAULT_MAX_DELIVERY_RADIUS_KM } from './location-service';

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

  const quote = deliveryPricingEngine.calculateQuote({
    fulfillmentType,
    landmarkId: landmarkNameOrId,
    landmarkName: landmarkNameOrId,
  });

  if (!quote.isAvailable) {
    if (quote.reason?.includes('suspended')) {
      throw new Error(`Delivery to "${quote.landmark?.name || landmarkNameOrId}" is currently suspended.`);
    }
    if (quote.reason?.includes('landmark must be selected')) {
      throw new Error(`Unrecognized delivery landmark: "${landmarkNameOrId}".`);
    }
    throw new Error(quote.reason || `Delivery unavailable for "${landmarkNameOrId}".`);
  }

  return quote.deliveryFee;
}

/**
 * Checks if a landmark is located on the UNILAG campus.
 */
export function isCampusLandmark(landmarkNameOrId: string): boolean {
  const query = landmarkNameOrId.trim().toLowerCase();
  const landmark = deliveryPricingEngine.findLandmark(query) || VERIFIED_LANDMARKS.find(
    (l) => l.id.toLowerCase() === query || l.name.toLowerCase() === query
  );
  return landmark?.isCampus ?? false;
}

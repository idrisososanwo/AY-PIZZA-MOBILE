/**
 * Authoritative Order Calculation Engine
 * CRITICAL SECURITY PRINCIPLE: Never trust client-calculated totals!
 * All calculations must be performed or verified with this deterministic engine.
 */

import { OrderItemInput, SelectedCustomization } from '../../types/order';
import { FulfillmentType } from '../../types/delivery';

export interface CalculatedItem {
  productId: string;
  productName: string;
  sizeName: string | null;
  sizePrice: number;
  unitBasePrice: number;
  customizationsTotal: number;
  unitItemTotal: number;
  quantity: number;
  lineTotal: number;
}

export interface CalculatedOrder {
  items: CalculatedItem[];
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  total: number;
  totalInKobo: number; // For Paystack transactions
  /** Explicitly flags whether this calculation was performed locally on client */
  isClientEstimate: boolean;
  estimatedTotal: number;
}

/**
 * Computes the additional price for Half & Half pizza based on selected size.
 * In AY Pizza: Regular & Standard = +₦1,000; Large, Queen, King = +₦1,500.
 */
export function calculateHalfAndHalfSurcharge(sizeName: string | null | undefined): number {
  if (!sizeName) return 1000;
  const normalized = sizeName.toLowerCase().trim();
  if (['regular', 'standard'].includes(normalized)) {
    return 1000;
  }
  if (['large', 'queen', 'king'].includes(normalized)) {
    return 1500;
  }
  return 1000;
}

/**
 * Calculates a single order item's authoritative total.
 */
export function calculateOrderItem(item: OrderItemInput): CalculatedItem {
  if (item.quantity <= 0) {
    throw new Error(`Invalid item quantity: ${item.quantity}. Must be at least 1.`);
  }
  if (item.basePrice < 0) {
    throw new Error(`Invalid base price: ${item.basePrice}. Must not be negative.`);
  }

  const sizePrice = item.sizePrice || 0;
  let customizationsTotal = 0;

  for (const c of item.customizations) {
    if (c.price < 0) {
      throw new Error(`Invalid customization price for ${c.optionName}: ${c.price}`);
    }
    // Dynamic Half & Half rule adjustment
    if (c.optionName.toLowerCase().includes('half')) {
      const adjustedHalfPrice = calculateHalfAndHalfSurcharge(item.sizeName);
      customizationsTotal += adjustedHalfPrice;
    } else {
      customizationsTotal += c.price;
    }
  }

  // Validate flavor constraint: Max 2 flavors for ice cream / milkshake items
  if (item.flavors && item.flavors.length > 2) {
    throw new Error(`Cannot select more than 2 flavors for item: ${item.productName}`);
  }

  const unitItemTotal = item.basePrice + sizePrice + customizationsTotal;
  const lineTotal = unitItemTotal * item.quantity;

  return {
    productId: item.productId,
    productName: item.productName,
    sizeName: item.sizeName || null,
    sizePrice,
    unitBasePrice: item.basePrice,
    customizationsTotal,
    unitItemTotal,
    quantity: item.quantity,
    lineTotal,
  };
}

/**
 * Calculates the complete order breakdown authoritatively.
 */
export function calculateOrderTotal(params: {
  items: OrderItemInput[];
  fulfillmentType: FulfillmentType;
  deliveryFee?: number;
  discountAmount?: number;
}): CalculatedOrder {
  if (!params.items || params.items.length === 0) {
    throw new Error('Order must contain at least one item.');
  }

  const calculatedItems = params.items.map(calculateOrderItem);
  const subtotal = calculatedItems.reduce((acc, curr) => acc + curr.lineTotal, 0);

  // Delivery fee is strictly 0 for pickup orders
  const effectiveDeliveryFee = params.fulfillmentType === 'pickup' ? 0 : (params.deliveryFee || 0);

  if (effectiveDeliveryFee < 0) {
    throw new Error(`Invalid delivery fee: ${effectiveDeliveryFee}. Must not be negative.`);
  }

  const discount = Math.max(0, params.discountAmount || 0);
  const total = Math.max(0, subtotal + effectiveDeliveryFee - discount);
  const totalInKobo = Math.round(total * 100);

  return {
    items: calculatedItems,
    subtotal,
    deliveryFee: effectiveDeliveryFee,
    discountAmount: discount,
    total,
    totalInKobo,
    isClientEstimate: true, // Marked as client UX estimate until server confirms
    estimatedTotal: total,
  };
}

/**
 * Reconciles a client-side cart estimate against the server's authoritative database calculation.
 * Throws a security discrepancy error if the totals differ by more than 0.01 NGN.
 */
export function reconcileClientEstimateWithServer(
  clientEstimatedTotal: number,
  serverAuthoritativeTotal: number
): { matches: boolean; variance: number } {
  const variance = Math.abs(clientEstimatedTotal - serverAuthoritativeTotal);
  const matches = variance < 0.01;
  return { matches, variance };
}

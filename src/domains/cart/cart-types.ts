/**
 * Cart Domain Types and State Models — Hardened Phase 2.1
 */

import { ProductCategorySlug } from '../../types/catalog';
import { SelectedCustomization } from '../../types/order';
import { DeliveryLandmark, FulfillmentType } from '../../types/delivery';

export interface CartCustomizerSnapshot {
  sizeId?: string;
  selectedOptionIds: string[];
  isHalfAndHalf: boolean;
  halfSecondaryProductId?: string;
  halfSecondaryFlavor?: string;
  flavors?: string[];
  specialInstructions?: string;
}

export interface CartItem {
  id: string;
  itemHash: string;
  productId: string;
  productName: string;
  categorySlug: ProductCategorySlug;
  imageUrl: string | null;
  basePrice: number;
  sizeId?: string;
  sizeName?: string;
  sizePrice?: number;
  customizations: SelectedCustomization[];
  halfSecondaryFlavor?: string;
  flavors?: string[];
  specialInstructions?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  customizerSnapshot?: CartCustomizerSnapshot;
  /** Set when catalog reconciliation detects this product is out of stock */
  isUnavailable?: boolean;
  /** Set when reconciliation detects a selected size, topping, or flavor was discontinued */
  hasInvalidConfiguration?: boolean;
  /** Explanatory message for customer correction */
  validationError?: string;
}

export interface PriceChangeNotice {
  previousSubtotal: number;
  newSubtotal: number;
  difference: number;
  requiresCustomerAcceptance: boolean;
}

export interface CartState {
  schemaVersion: number;
  items: CartItem[];
  fulfillmentType: FulfillmentType;
  selectedLandmark: DeliveryLandmark | null;
  deliveryAddress: string;
  deliveryNotes: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  estimatedTotal: number;
  itemCount: number;
  isStale: boolean;
  staleReason?: string;
  /** Set to true only if all items are available, valid, delivery info is complete, and prices accepted */
  isReadyForCheckout: boolean;
  /** Specific blockers preventing checkout progression */
  checkoutBlockers: string[];
  /** Flagged if customer must reconfigure an invalid item */
  requiresCorrection: boolean;
  /** Notice when prices changed during reconciliation requiring explicit customer acceptance */
  priceChangeNotice?: PriceChangeNotice | null;
  /** Set if disk write or read failed */
  storageError?: string | null;
}

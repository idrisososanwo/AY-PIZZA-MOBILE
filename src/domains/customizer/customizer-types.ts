/**
 * Customizer Engine Types
 */

import { Product, ProductSize, CustomizationGroup, CustomizationOption } from '../../types/catalog';
import { CartItem } from '../cart/cart-types';

export interface CustomizerState {
  product: Product;
  selectedSize: ProductSize | null;
  /** Option selections keyed by group ID */
  selectedOptions: Record<string, CustomizationOption[]>;
  isHalfAndHalf: boolean;
  halfSecondaryProduct: Product | null;
  /** Chosen flavors (for ice creams/milkshakes, max 2) */
  selectedFlavors: string[];
  specialInstructions: string;
  quantity: number;
}

export interface CustomizerPriceBreakdown {
  unitBasePrice: number;
  sizePrice: number;
  customizationsTotal: number;
  halfAndHalfSurcharge: number;
  unitItemTotal: number;
  quantity: number;
  lineTotal: number;
  isClientEstimate: true;
}

export interface CustomizerValidationResult {
  isValid: boolean;
  errors: string[];
}

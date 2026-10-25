/**
 * Data-Driven Reusable Customizer Engine
 * Supports required/optional groups, min/max selection bounds, single/multi select,
 * Half & Half pizza builder with dynamic size surcharges, and flavor constraints.
 */

import { Product, ProductSize, CustomizationGroup, CustomizationOption } from '../../types/catalog';
import { SelectedCustomization } from '../../types/order';
import { calculateHalfAndHalfSurcharge } from '../order/order-calculator';
import { CartItem, CartCustomizerSnapshot } from '../cart/cart-types';
import { CustomizerState, CustomizerPriceBreakdown, CustomizerValidationResult } from './customizer-types';

/**
 * Initializes customizer state for a new customization or editing an existing cart item.
 */
export function initializeCustomizerState(
  product: Product,
  existingCartItem?: CartItem,
  allAvailableProducts: Product[] = []
): CustomizerState {
  if (existingCartItem && existingCartItem.productId === product.id) {
    // Restore from existing cart item
    const selectedSize = product.sizes?.find((s) => s.id === existingCartItem.sizeId) || product.sizes?.[0] || null;
    
    // Restore options into grouped map
    const selectedOptions: Record<string, CustomizationOption[]> = {};
    if (product.customizationGroups) {
      for (const group of product.customizationGroups) {
        const matching = group.options.filter((opt) =>
          existingCartItem.customizations.some((c) => c.optionId === opt.id)
        );
        selectedOptions[group.id] = matching;
      }
    }

    // Resolve half & half secondary product if set
    let halfSecondaryProduct: Product | null = null;
    if (existingCartItem.halfSecondaryFlavor) {
      halfSecondaryProduct =
        allAvailableProducts.find((p) => p.name === existingCartItem.halfSecondaryFlavor) || null;
    }

    return {
      product,
      selectedSize,
      selectedOptions,
      isHalfAndHalf: Boolean(existingCartItem.halfSecondaryFlavor),
      halfSecondaryProduct,
      selectedFlavors: existingCartItem.flavors ? [...existingCartItem.flavors] : [],
      specialInstructions: existingCartItem.specialInstructions || '',
      quantity: existingCartItem.quantity > 0 ? existingCartItem.quantity : 1,
    };
  }

  // New customization default state
  const defaultSize = product.sizes && product.sizes.length > 0 ? product.sizes[0] : null;

  return {
    product,
    selectedSize: defaultSize,
    selectedOptions: {},
    isHalfAndHalf: false,
    halfSecondaryProduct: null,
    selectedFlavors: [],
    specialInstructions: '',
    quantity: 1,
  };
}

/**
 * Updates selected product size.
 */
export function selectSize(state: CustomizerState, size: ProductSize): CustomizerState {
  return {
    ...state,
    selectedSize: size,
  };
}

/**
 * Toggles a customization option within a group, enforcing min/max bounds.
 */
export function toggleOption(
  state: CustomizerState,
  group: CustomizationGroup,
  option: CustomizationOption
): CustomizerState {
  const currentList = state.selectedOptions[group.id] || [];
  const exists = currentList.some((opt) => opt.id === option.id);

  let updatedList: CustomizationOption[];

  if (exists) {
    // Option is being removed
    updatedList = currentList.filter((opt) => opt.id !== option.id);
  } else {
    // Option is being added
    if (group.maxSelections === 1) {
      // Single-select group: replaces current selection
      updatedList = [option];
    } else {
      // Multi-select group: check max selections
      if (currentList.length >= group.maxSelections) {
        return state; // Cannot exceed max selections
      }
      updatedList = [...currentList, option];
    }
  }

  return {
    ...state,
    selectedOptions: {
      ...state.selectedOptions,
      [group.id]: updatedList,
    },
  };
}

/**
 * Toggles Half & Half configuration on or off.
 */
export function toggleHalfAndHalf(state: CustomizerState, enabled: boolean): CustomizerState {
  return {
    ...state,
    isHalfAndHalf: enabled,
    halfSecondaryProduct: enabled ? state.halfSecondaryProduct : null,
  };
}

/**
 * Sets secondary pizza flavor for Half & Half.
 */
export function setHalfSecondaryProduct(
  state: CustomizerState,
  secondaryProduct: Product | null
): CustomizerState {
  return {
    ...state,
    halfSecondaryProduct: secondaryProduct,
  };
}

/**
 * Toggles a flavor selection with maxLimit constraint (default: 2 for desserts).
 */
export function toggleFlavor(
  state: CustomizerState,
  flavorName: string,
  maxLimit: number = 2
): CustomizerState {
  const current = state.selectedFlavors;
  const exists = current.includes(flavorName);

  let updated: string[];
  if (exists) {
    updated = current.filter((f) => f !== flavorName);
  } else {
    if (current.length >= maxLimit) {
      return state; // Limit reached
    }
    updated = [...current, flavorName];
  }

  return {
    ...state,
    selectedFlavors: updated,
  };
}

/**
 * Updates special preparation instructions.
 */
export function setSpecialInstructions(state: CustomizerState, text: string): CustomizerState {
  return {
    ...state,
    specialInstructions: text,
  };
}

/**
 * Updates item quantity (minimum 1, maximum 99).
 */
export function setQuantity(state: CustomizerState, quantity: number): CustomizerState {
  const clamped = Math.min(99, Math.max(1, Math.floor(quantity)));
  return {
    ...state,
    quantity: clamped,
  };
}

/**
 * Computes live, transparent price breakdown for the current customizer state.
 */
export function calculateCustomizerPrice(state: CustomizerState): CustomizerPriceBreakdown {
  const unitBasePrice = state.product.basePrice;
  const sizePrice = state.selectedSize ? state.selectedSize.sizeMultiplierPrice : 0;

  let customizationsTotal = 0;
  for (const options of Object.values(state.selectedOptions)) {
    for (const opt of options) {
      customizationsTotal += opt.price;
    }
  }

  // Dynamic Half & Half surcharge:
  // Regular/Standard = +₦1,000; Large/Queen/King = +₦1,500
  let halfAndHalfSurcharge = 0;
  if (state.isHalfAndHalf) {
    halfAndHalfSurcharge = calculateHalfAndHalfSurcharge(state.selectedSize?.name);
  }

  const unitItemTotal = unitBasePrice + sizePrice + customizationsTotal + halfAndHalfSurcharge;
  const quantity = Math.max(1, state.quantity);
  const lineTotal = unitItemTotal * quantity;

  return {
    unitBasePrice,
    sizePrice,
    customizationsTotal,
    halfAndHalfSurcharge,
    unitItemTotal,
    quantity,
    lineTotal,
    isClientEstimate: true,
  };
}

/**
 * Validates the current customization state against product and business rules.
 */
export function validateCustomizerState(state: CustomizerState): CustomizerValidationResult {
  const errors: string[] = [];

  // 1. Availability
  if (!state.product.isAvailable) {
    errors.push(`"${state.product.name}" is currently out of stock.`);
  }

  // 2. Size requirement
  if (state.product.sizes && state.product.sizes.length > 0 && !state.selectedSize) {
    errors.push('Please select a size.');
  }

  // 3. Customization group selection limits
  if (state.product.customizationGroups) {
    for (const group of state.product.customizationGroups) {
      // Skip half and half and flavor groups here as they are managed via dedicated flavor states
      if (
        group.name.toLowerCase().includes('half and half') ||
        group.name.toLowerCase().includes('flavor')
      ) {
        continue;
      }

      const selectedCount = (state.selectedOptions[group.id] || []).length;
      if (selectedCount < group.minSelections) {
        errors.push(`Please select at least ${group.minSelections} option(s) for "${group.name}".`);
      }
      if (selectedCount > group.maxSelections) {
        errors.push(`You can select at most ${group.maxSelections} option(s) for "${group.name}".`);
      }
    }
  }

  // 4. Half & Half validation
  if (state.isHalfAndHalf) {
    if (!state.halfSecondaryProduct) {
      errors.push('Please select the secondary pizza flavor for your Half & Half pizza.');
    } else if (state.halfSecondaryProduct.id === state.product.id) {
      errors.push('Half & Half secondary pizza must be a different flavor.');
    } else if (!state.halfSecondaryProduct.isAvailable) {
      errors.push(`Selected secondary flavor "${state.halfSecondaryProduct.name}" is out of stock.`);
    }
  }

  // 5. Flavor validation for milkshakes / ice cream
  if (['icecream'].includes(state.product.categorySlug)) {
    if (state.selectedFlavors.length === 0) {
      errors.push('Please select at least 1 flavor (up to 2).');
    } else if (state.selectedFlavors.length > 2) {
      errors.push('You cannot select more than 2 flavors.');
    }
  }

  // 6. Quantity
  if (state.quantity < 1) {
    errors.push('Quantity must be at least 1.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Generates a deterministic hash representing the exact configured specification.
 * Items with identical hashes can be combined (increasing quantity); different hashes remain distinct.
 */
export function generateCustomizerItemHash(state: CustomizerState): string {
  const parts: string[] = [state.product.id];

  if (state.selectedSize) {
    parts.push(`size:${state.selectedSize.id}`);
  }

  // All selected option IDs sorted and deduplicated
  const allOptionIds: string[] = [];
  for (const list of Object.values(state.selectedOptions)) {
    for (const opt of list) {
      allOptionIds.push(opt.id);
    }
  }
  const uniqueOptionIds = Array.from(new Set(allOptionIds)).sort();
  if (uniqueOptionIds.length > 0) {
    parts.push(`opts:${uniqueOptionIds.join(',')}`);
  }

  if (state.isHalfAndHalf) {
    const secId = state.halfSecondaryProduct ? state.halfSecondaryProduct.id : 'none';
    parts.push(`half:${secId}`);
  }

  if (state.selectedFlavors.length > 0) {
    const sortedFlavors = Array.from(new Set(state.selectedFlavors.map((f) => f.trim()))).sort();
    parts.push(`flavors:${sortedFlavors.join(',')}`);
  }

  // Normalized special instructions (lowercase, collapsed whitespace)
  const normalizedNotes = state.specialInstructions
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (normalizedNotes.length > 0) {
    parts.push(`notes:${normalizedNotes}`);
  }

  return parts.join('|');
}

/**
 * Converts a validated CustomizerState into a standardized CartItem.
 */
export function toCartItem(state: CustomizerState, existingItemId?: string): CartItem {
  const breakdown = calculateCustomizerPrice(state);
  const itemHash = generateCustomizerItemHash(state);
  const id = existingItemId || `cart_item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Flatten selected options into SelectedCustomization array
  const customizations: SelectedCustomization[] = [];
  const selectedOptionIds: string[] = [];

  for (const list of Object.values(state.selectedOptions)) {
    for (const opt of list) {
      customizations.push({
        optionId: opt.id,
        optionName: opt.name,
        price: opt.price,
      });
      selectedOptionIds.push(opt.id);
    }
  }

  // If Half & Half is selected, include it in customizations array
  if (state.isHalfAndHalf && state.halfSecondaryProduct) {
    customizations.push({
      optionId: 'half-and-half-surcharge',
      optionName: `Half & Half (${state.halfSecondaryProduct.name})`,
      price: breakdown.halfAndHalfSurcharge,
    });
  }

  const snapshot: CartCustomizerSnapshot = {
    sizeId: state.selectedSize?.id,
    selectedOptionIds,
    isHalfAndHalf: state.isHalfAndHalf,
    halfSecondaryProductId: state.halfSecondaryProduct?.id,
    halfSecondaryFlavor: state.halfSecondaryProduct?.name,
    flavors: state.selectedFlavors.length > 0 ? [...state.selectedFlavors] : undefined,
    specialInstructions: state.specialInstructions || undefined,
  };

  return {
    id,
    itemHash,
    productId: state.product.id,
    productName: state.product.name,
    categorySlug: state.product.categorySlug,
    imageUrl: state.product.imageUrl,
    basePrice: state.product.basePrice,
    sizeId: state.selectedSize?.id,
    sizeName: state.selectedSize?.name,
    sizePrice: breakdown.sizePrice,
    customizations,
    halfSecondaryFlavor: state.halfSecondaryProduct?.name,
    flavors: state.selectedFlavors.length > 0 ? [...state.selectedFlavors] : undefined,
    specialInstructions: state.specialInstructions || undefined,
    quantity: state.quantity,
    unitPrice: breakdown.unitItemTotal,
    lineTotal: breakdown.lineTotal,
    customizerSnapshot: snapshot,
  };
}

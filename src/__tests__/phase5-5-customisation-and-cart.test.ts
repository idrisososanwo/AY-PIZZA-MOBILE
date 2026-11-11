import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';
import { cartStore } from '../domains/cart/cart-store';
import {
  SEEDED_PRODUCTS,
  PIZZA_SIZES,
} from '../domains/catalog/catalog-repository';
import {
  initializeCustomizerState,
  selectSize,
  toggleHalfAndHalf,
  setHalfSecondaryProduct,
  setQuantity,
  calculateCustomizerPrice,
  validateCustomizerState,
  generateCustomizerItemHash,
  toCartItem,
} from '../domains/customizer/customizer-engine';
import { PROVISIONAL_LANDMARKS } from '../domains/delivery/delivery-service';
import { calculateHalfAndHalfSurcharge } from '../domains/order/order-calculator';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
declare const __dirname: string;

/**
 * Calculates relative luminance according to WCAG 2.1 definition.
 */
function getRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const sRGB = [r, g, b].map((c) => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/**
 * Calculates contrast ratio between two hex colors according to WCAG 2.1.
 */
function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

describe('Phase 5.5-5: Customisation & Cart Experience Redesign', () => {
  const pizzaBase = SEEDED_PRODUCTS[0]; // Sweet and Sour Pizza (₦7,000 base)
  const secondaryPizza = SEEDED_PRODUCTS[6]; // BBQ Beef Pizza
  const tertiaryPizza = SEEDED_PRODUCTS[1]; // Pepperoni Passion Pizza
  const allPizzaProducts = SEEDED_PRODUCTS.filter((p) => p.categorySlug === 'pizza');

  beforeEach(async () => {
    await AsyncStorage.clear();
    await cartStore.clearCart();
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. VISUAL HALF-AND-HALF SELECTION & AUTHORITATIVE SURCHARGE RULES
  // =========================================================================
  describe('1. Half-and-Half Selector & Surcharge Engine', () => {
    it('applies authoritative ₦1,000 surcharge for Regular and Standard sizes', () => {
      // Regular (sizeMultiplierPrice = 0)
      expect(calculateHalfAndHalfSurcharge(PIZZA_SIZES[0].name)).toBe(1000);
      // Standard (sizeMultiplierPrice = 1500)
      expect(calculateHalfAndHalfSurcharge(PIZZA_SIZES[1].name)).toBe(1000);
    });

    it('applies authoritative ₦1,500 surcharge for Large, Queen, and King sizes', () => {
      // Large (sizeMultiplierPrice = 3000)
      expect(calculateHalfAndHalfSurcharge(PIZZA_SIZES[2].name)).toBe(1500);
      // Queen (sizeMultiplierPrice = 5000)
      expect(calculateHalfAndHalfSurcharge(PIZZA_SIZES[3].name)).toBe(1500);
      // King (sizeMultiplierPrice = 7000)
      expect(calculateHalfAndHalfSurcharge(PIZZA_SIZES[4].name)).toBe(1500);
    });

    it('initializes pizza with half-and-half disabled by default', () => {
      const state = initializeCustomizerState(pizzaBase, undefined, allPizzaProducts);
      expect(state.isHalfAndHalf).toBe(false);
      expect(state.halfSecondaryProduct).toBeNull();
      const price = calculateCustomizerPrice(state);
      expect(price.halfAndHalfSurcharge).toBe(0);
      expect(price.lineTotal).toBe(7000);
    });

    it('toggles half-and-half on and validates missing secondary flavor', () => {
      let state = initializeCustomizerState(pizzaBase, undefined, allPizzaProducts);
      state = toggleHalfAndHalf(state, true);
      expect(state.isHalfAndHalf).toBe(true);

      // Surcharge is calculated even before secondary flavor is chosen
      const price = calculateCustomizerPrice(state);
      expect(price.halfAndHalfSurcharge).toBe(1000); // Regular size -> ₦1,000

      // Incomplete state is invalid
      const validation = validateCustomizerState(state);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Please select the secondary pizza flavor for your Half & Half pizza.'
      );
    });

    it('completes half-and-half configuration when secondary flavor is chosen', () => {
      let state = initializeCustomizerState(pizzaBase, undefined, allPizzaProducts);
      state = toggleHalfAndHalf(state, true);
      state = setHalfSecondaryProduct(state, secondaryPizza);

      expect(state.halfSecondaryProduct?.name).toBe(secondaryPizza.name);

      const validation = validateCustomizerState(state);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      const price = calculateCustomizerPrice(state);
      expect(price.unitBasePrice).toBe(7000);
      expect(price.sizePrice).toBe(0);
      expect(price.halfAndHalfSurcharge).toBe(1000);
      expect(price.unitItemTotal).toBe(8000); // 7,000 + 1,000
      expect(price.lineTotal).toBe(8000);
    });

    it('dynamically increases half-and-half surcharge when upgrading to Large size', () => {
      let state = initializeCustomizerState(pizzaBase, undefined, allPizzaProducts);
      state = toggleHalfAndHalf(state, true);
      state = setHalfSecondaryProduct(state, secondaryPizza);
      state = selectSize(state, PIZZA_SIZES[2]); // Large (+₦3,000)

      const price = calculateCustomizerPrice(state);
      expect(price.unitBasePrice).toBe(7000);
      expect(price.sizePrice).toBe(3000);
      expect(price.halfAndHalfSurcharge).toBe(1500); // Large -> ₦1,500
      expect(price.unitItemTotal).toBe(11500); // 7000 + 3000 + 1500
      expect(price.lineTotal).toBe(11500);
    });

    it('generates distinct item hashes for single flavor vs half-and-half variants', () => {
      const stateSingle = initializeCustomizerState(pizzaBase, undefined, allPizzaProducts);
      const hashSingle = generateCustomizerItemHash(stateSingle);

      let stateHalfA = initializeCustomizerState(pizzaBase, undefined, allPizzaProducts);
      stateHalfA = toggleHalfAndHalf(stateHalfA, true);
      stateHalfA = setHalfSecondaryProduct(stateHalfA, secondaryPizza);
      const hashHalfA = generateCustomizerItemHash(stateHalfA);

      let stateHalfB = initializeCustomizerState(pizzaBase, undefined, allPizzaProducts);
      stateHalfB = toggleHalfAndHalf(stateHalfB, true);
      stateHalfB = setHalfSecondaryProduct(stateHalfB, tertiaryPizza);
      const hashHalfB = generateCustomizerItemHash(stateHalfB);

      expect(hashSingle).not.toBe(hashHalfA);
      expect(hashHalfA).not.toBe(hashHalfB);
    });

    it('generates correct CartItem format with secondary flavor tag', () => {
      let state = initializeCustomizerState(pizzaBase, undefined, allPizzaProducts);
      state = toggleHalfAndHalf(state, true);
      state = setHalfSecondaryProduct(state, secondaryPizza);
      state = selectSize(state, PIZZA_SIZES[1]); // Standard (+1,500)
      state = setQuantity(state, 2);

      const cartItem = toCartItem(state);
      expect(cartItem.productName).toBe(pizzaBase.name);
      expect(cartItem.halfSecondaryFlavor).toBe(secondaryPizza.name);
      expect(cartItem.sizeName).toBe('Standard');
      expect(cartItem.unitPrice).toBe(7000 + 1500 + 1000); // 9,500
      expect(cartItem.quantity).toBe(2);
      expect(cartItem.lineTotal).toBe(19000);
      expect(cartItem.customizations.some((c) => c.optionId === 'half-and-half-surcharge')).toBe(true);
    });
  });

  // =========================================================================
  // 2. CUSTOMIZER MODAL UI ARCHITECTURE & CODE INTEGRITY
  // =========================================================================
  describe('2. CustomizerModal Visual Structure & Architecture', () => {
    const customizerFile = fs.readFileSync(
      path.resolve(__dirname, '../components/CustomizerModal.tsx'),
      'utf-8'
    );

    it('implements visual pizza split preview with left/right slots and center divider seam', () => {
      expect(customizerFile).toContain('testID="pizza-split-preview"');
      expect(customizerFile).toContain('splitCircleContainer');
      expect(customizerFile).toContain('splitHalfLeft');
      expect(customizerFile).toContain('splitHalfRight');
      expect(customizerFile).toContain('splitDividerLine');
      expect(customizerFile).toContain('Left 🍕');
      expect(customizerFile).toContain('Right 🍕');
    });

    it('renders two-slot label cards distinguishing locked Base Half 1 from selectable Half 2', () => {
      expect(customizerFile).toContain('HALF 1 (LEFT)');
      expect(customizerFile).toContain('Base Flavor (Locked)');
      expect(customizerFile).toContain('HALF 2 (RIGHT)');
      expect(customizerFile).toContain('✓ Flavor Selected');
      expect(customizerFile).toContain('⚠️ Pick Flavor Below');
    });

    it('filters out base flavor to prevent duplicate selections in secondary flavor tray', () => {
      expect(customizerFile).toContain('filter((p) => p.id !== product.id && p.isAvailable)');
      expect(customizerFile).toContain('Choose Second Pizza Flavor:');
      expect(customizerFile).toContain('clearSecondFlavorText');
    });

    it('displays dynamic half-and-half surcharge notices', () => {
      expect(customizerFile).toContain('priceBreakdown.halfAndHalfSurcharge');
      expect(customizerFile).toContain('Surcharge: +₦');
      expect(customizerFile).toContain('split');
    });

    it('maintains sticky footer with line total and minimum 44dp touch targets', () => {
      expect(customizerFile).toContain('styles.footer');
      expect(customizerFile).toContain('stepperButton');
      expect(customizerFile).toContain('saveButton');
      expect(customizerFile).toContain('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}');
      expect(customizerFile).toContain('minHeight: 48'); // saveButton accessible touch height (>=44dp)
    });
  });

  // =========================================================================
  // 3. CART FULFILLMENT SWITCHER & DYNAMIC FEE RECALCULATION
  // =========================================================================
  describe('3. Cart Fulfillment Switcher & Fee Recalculation', () => {
    it('authoritatively switches between Campus Delivery and King Jaja Pickup', async () => {
      // Add an item to cart first
      const state = initializeCustomizerState(pizzaBase);
      const item = toCartItem(state);
      await cartStore.addItem(item);

      // Default is delivery with ₦500 flat fee
      expect(cartStore.getState().fulfillmentType).toBe('delivery');
      expect(cartStore.getState().deliveryFee).toBe(500);
      expect(cartStore.getState().estimatedTotal).toBe(7000 + 500);

      // Switch to pickup
      await cartStore.setFulfillmentType('pickup');
      expect(cartStore.getState().fulfillmentType).toBe('pickup');
      expect(cartStore.getState().deliveryFee).toBe(0); // STRICTLY ₦0
      expect(cartStore.getState().estimatedTotal).toBe(7000);

      // Switch back to delivery
      await cartStore.setFulfillmentType('delivery');
      expect(cartStore.getState().fulfillmentType).toBe('delivery');
      expect(cartStore.getState().deliveryFee).toBe(500);
      expect(cartStore.getState().estimatedTotal).toBe(7500);
    });

    it('updates delivery fee dynamically when selecting a specific landmark', async () => {
      const state = initializeCustomizerState(pizzaBase);
      await cartStore.addItem(toCartItem(state));

      const landmark = PROVISIONAL_LANDMARKS[1]; // e.g. Queen Amina Hall (₦500)
      await cartStore.setLandmark(landmark);

      expect(cartStore.getState().selectedLandmark?.id).toBe(landmark.id);
      expect(cartStore.getState().deliveryFee).toBe(landmark.fee);
      expect(cartStore.getState().estimatedTotal).toBe(7000 + landmark.fee);
    });

    it('retains zero pickup fee even if landmark is stored in state', async () => {
      const state = initializeCustomizerState(pizzaBase);
      await cartStore.addItem(toCartItem(state));

      await cartStore.setLandmark(PROVISIONAL_LANDMARKS[0]);
      await cartStore.setFulfillmentType('pickup');

      expect(cartStore.getState().deliveryFee).toBe(0);
      expect(cartStore.getState().estimatedTotal).toBe(7000);
    });
  });

  // =========================================================================
  // 4. CART ITEM EXPERIENCE & ANTI-COLLISION LAYOUT
  // =========================================================================
  describe('4. Cart Item Experience & 360dp Anti-Collision Architecture', () => {
    const cartViewFile = fs.readFileSync(
      path.resolve(__dirname, '../components/CartView.tsx'),
      'utf-8'
    );

    it('implements 2-column anti-collision layout isolating thumbnail, title, and price', () => {
      expect(cartViewFile).toContain('styles.cartItemRow');
      expect(cartViewFile).toContain('styles.itemThumbContainer');
      expect(cartViewFile).toContain('styles.itemMainInfo');
      expect(cartViewFile).toContain('styles.itemHeaderRow');
      expect(cartViewFile).toContain('styles.itemNameBlock');
      expect(cartViewFile).toContain('styles.itemPriceColumn');
      expect(cartViewFile).toContain('styles.itemActionsRow');
    });

    it('displays Half & Half breakdown tag clearly on cart item', () => {
      expect(cartViewFile).toContain('item.halfSecondaryFlavor');
      expect(cartViewFile).toContain('🍕 Half & Half:');
      expect(cartViewFile).toContain('halfAndHalfTagContainer');
    });

    it('handles quantity increment, decrement, and item removal safely', async () => {
      let state = initializeCustomizerState(pizzaBase);
      state = setQuantity(state, 1);
      const item = toCartItem(state);
      await cartStore.addItem(item);

      const addedItemId = cartStore.getState().items[0].id;

      // Increment
      await cartStore.updateQuantity(addedItemId, 3);
      expect(cartStore.getState().items[0].quantity).toBe(3);
      expect(cartStore.getState().subtotal).toBe(21000);

      // Decrement
      await cartStore.updateQuantity(addedItemId, 2);
      expect(cartStore.getState().items[0].quantity).toBe(2);
      expect(cartStore.getState().subtotal).toBe(14000);

      // Remove
      await cartStore.removeItem(addedItemId);
      expect(cartStore.getState().items).toHaveLength(0);
      expect(cartStore.getState().subtotal).toBe(0);
    });

    it('protects against rapid double-tap race conditions with throttle flag', () => {
      expect(cartViewFile).toContain('isThrottled');
      expect(cartViewFile).toContain('setIsThrottled(true)');
      expect(cartViewFile).toContain('handleQuantityUpdate');
      expect(cartViewFile).toContain('handleRemoveItem');
    });

    it('provides minimum 44dp touch targets with hitSlop on item action buttons', () => {
      expect(cartViewFile).toContain('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}');
      expect(cartViewFile).toContain('accessibilityLabel="Decrease quantity"');
      expect(cartViewFile).toContain('accessibilityLabel="Increase quantity"');
      expect(cartViewFile).toContain('Edit ⚙️');
      expect(cartViewFile).toContain('Remove 🗑️');
    });
  });

  // =========================================================================
  // 5. EMPTY CART EXPERIENCE & CAMPUS POPULAR SUGGESTIONS
  // =========================================================================
  describe('5. Empty Cart Experience & Suggestions Shelf', () => {
    const cartViewFile = fs.readFileSync(
      path.resolve(__dirname, '../components/CartView.tsx'),
      'utf-8'
    );

    it('renders empty cart illustration, welcoming copy, and full menu CTA', () => {
      expect(cartViewFile).toContain('testID="cart-empty-state"');
      expect(cartViewFile).toContain('Your Cart is Empty');
      expect(cartViewFile).toContain('testID="empty-cart-explore-btn"');
      expect(cartViewFile).toContain('Explore Full Menu 🍕');
    });

    it('renders Campus Popular Suggestions shelf using authentic catalog items', () => {
      expect(cartViewFile).toContain('testID="empty-cart-suggestions"');
      expect(cartViewFile).toContain('Popular on Campus 🔥');
      expect(cartViewFile).toContain('Quick additions to get started');
      expect(cartViewFile).toContain('+ Add');
      expect(cartViewFile).toContain('SEEDED_PRODUCTS.slice(0, 3)');
    });

    it('falls back to authentic SEEDED_PRODUCTS when suggestedProducts prop is omitted', () => {
      expect(cartViewFile).toContain('suggestedProducts && suggestedProducts.length > 0');
      expect(cartViewFile).toContain('SEEDED_PRODUCTS.slice(0, 3)');
    });
  });

  // =========================================================================
  // 6. WCAG 2.1 AA COLOR CONTRAST & DESIGN SYSTEM COMPLIANCE
  // =========================================================================
  describe('6. Color Contrast & Visual Design System', () => {
    it('primary text has > 12:1 contrast ratio on cream background', () => {
      const ratio = getContrastRatio(Colors.textPrimary, Colors.warmCream);
      expect(ratio).toBeGreaterThan(12);
    });

    it('primary text has > 13:1 contrast ratio on white card background', () => {
      const ratio = getContrastRatio(Colors.textPrimary, Colors.cardWhite);
      expect(ratio).toBeGreaterThan(13);
    });

    it('secondary text has > 4.5:1 contrast ratio on white card background', () => {
      const ratio = getContrastRatio(Colors.textSecondary, Colors.cardWhite);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('primary brand red provides high visibility against card white', () => {
      const ratio = getContrastRatio(Colors.primaryRed, Colors.cardWhite);
      expect(ratio).toBeGreaterThan(3.5);
    });
  });
});

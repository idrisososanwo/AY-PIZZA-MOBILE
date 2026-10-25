/**
 * Phase 2.1 Targeted Verification and Data Integrity Test Suite
 * Covers catalog consistency, production safeguards, comprehensive reconciliation,
 * delivery/pickup integrity, storage reliability, and customizer hash edge cases.
 */

import { CartStore, INITIAL_CART_STATE, CART_STORAGE_KEY } from '../domains/cart/cart-store';
import {
  catalogRepository,
  SEEDED_PRODUCTS,
  PIZZA_SIZES,
  EXTRA_PIZZA_TOPPINGS,
} from '../domains/catalog/catalog-repository';
import {
  initializeCustomizerState,
  selectSize,
  toggleOption,
  toggleHalfAndHalf,
  setHalfSecondaryProduct,
  toggleFlavor,
  setSpecialInstructions,
  setQuantity,
  generateCustomizerItemHash,
  toCartItem,
} from '../domains/customizer/customizer-engine';
import { PROVISIONAL_LANDMARKS } from '../domains/delivery/delivery-service';
import { Config } from '../config/env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../types/catalog';

describe('Phase 2.1: 1. Catalog Consistency & Deduplication', () => {
  it('confirms exact count of 13 unique pizza varieties in catalog', async () => {
    const products = await catalogRepository.getProducts({ categorySlug: 'pizza' });
    expect(products.length).toBe(13);

    // Verify all names are unique (confirming Sweet & Sour duplicate is resolved)
    const names = products.map((p) => p.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(13);
    expect(names.filter((n) => n === 'Sweet and Sour Pizza').length).toBe(1);
  });
});

describe('Phase 2.1: 2. Production vs Development Catalog Fallback Safeguards', () => {
  it('identifies offline fallback status in development', async () => {
    await catalogRepository.getCategories();
    expect(catalogRepository.isOfflineFallbackActive()).toBe(true);
  });

  it('rejects placeholder credentials if production mode is enabled', async () => {
    // Temporarily simulate production mode
    const origEnv = Config.appEnv;
    const origProd = Config.isProduction;

    try {
      (Config as any).appEnv = 'production';
      (Config as any).isProduction = true;

      await expect(catalogRepository.getCategories()).rejects.toThrow(
        /FATAL CONFIGURATION ERROR/
      );

      await expect(catalogRepository.getProducts()).rejects.toThrow(
        /FATAL CONFIGURATION ERROR/
      );
    } finally {
      (Config as any).appEnv = origEnv;
      (Config as any).isProduction = origProd;
    }
  });
});

describe('Phase 2.1: 3. Comprehensive Cart Reconciliation & Price Change Protection', () => {
  let cart: CartStore;
  const pizza = SEEDED_PRODUCTS[0];
  const bbqPizza = SEEDED_PRODUCTS[6];
  const toppingsGroup = pizza.customizationGroups![0];

  beforeEach(async () => {
    await AsyncStorage.clear();
    cart = new CartStore();
    await cart.clearCart();
  });

  it('detects product unavailability, marks item, and blocks checkout', async () => {
    const item = toCartItem(initializeCustomizerState(pizza));
    await cart.addItem(item);

    const catalogWithOutOfStock: Product[] = [
      { ...pizza, isAvailable: false },
    ];

    const result = await cart.reconcileWithCatalog(catalogWithOutOfStock);
    expect(result.hasChanges).toBe(true);
    expect(result.unavailableItems).toContain(pizza.name);

    const state = cart.getState();
    expect(state.items[0].isUnavailable).toBe(true);
    expect(state.items[0].validationError).toContain('out of stock');
    expect(state.requiresCorrection).toBe(true);
    expect(state.isReadyForCheckout).toBe(false);
    expect(state.checkoutBlockers).toContain(
      'Please remove out of stock items from your cart.'
    );
  });

  it('detects size removal and marks item for customer correction', async () => {
    let customizer = initializeCustomizerState(pizza);
    customizer = selectSize(customizer, PIZZA_SIZES[2]); // Large
    const item = toCartItem(customizer);
    await cart.addItem(item);

    // Live product where Large size was removed
    const catalogWithoutLarge: Product[] = [
      {
        ...pizza,
        sizes: [PIZZA_SIZES[0], PIZZA_SIZES[1]], // only Regular and Standard
      },
    ];

    const result = await cart.reconcileWithCatalog(catalogWithoutLarge);
    expect(result.hasChanges).toBe(true);
    expect(result.invalidConfigurations.length).toBeGreaterThan(0);

    const state = cart.getState();
    expect(state.items[0].hasInvalidConfiguration).toBe(true);
    expect(state.items[0].validationError).toContain('Selected size "Large" is no longer available');
    expect(state.isReadyForCheckout).toBe(false);
  });

  it('detects topping unavailability and flags invalid configuration', async () => {
    let customizer = initializeCustomizerState(pizza);
    customizer = toggleOption(customizer, toppingsGroup, EXTRA_PIZZA_TOPPINGS[0]); // Extra Beef
    const item = toCartItem(customizer);
    await cart.addItem(item);

    // Live catalog where Extra Beef is out of stock
    const catalogWithToppingUnavailable: Product[] = [
      {
        ...pizza,
        customizationGroups: [
          {
            ...toppingsGroup,
            options: [
              { ...EXTRA_PIZZA_TOPPINGS[0], isAvailable: false },
              EXTRA_PIZZA_TOPPINGS[1],
            ],
          },
        ],
      },
    ];

    await cart.reconcileWithCatalog(catalogWithToppingUnavailable);
    const state = cart.getState();
    expect(state.items[0].hasInvalidConfiguration).toBe(true);
    expect(state.items[0].validationError).toContain('Topping "Extra Beef" is currently unavailable');
    expect(state.isReadyForCheckout).toBe(false);
  });

  it('detects Half & Half secondary flavor unavailability', async () => {
    let customizer = initializeCustomizerState(pizza);
    customizer = toggleHalfAndHalf(customizer, true);
    customizer = setHalfSecondaryProduct(customizer, bbqPizza);
    const item = toCartItem(customizer);
    await cart.addItem(item);

    // Live catalog where BBQ Beef Pizza is out of stock
    const catalogWithBbqUnavailable: Product[] = [
      pizza,
      { ...bbqPizza, isAvailable: false },
    ];

    await cart.reconcileWithCatalog(catalogWithBbqUnavailable);
    const state = cart.getState();
    expect(state.items[0].hasInvalidConfiguration).toBe(true);
    expect(state.items[0].validationError).toContain('Half & Half flavor "BBQ Beef Pizza" is out of stock');
  });

  it('requires explicit customer acceptance when menu prices change and never silently alters agreed price', async () => {
    const item = toCartItem(initializeCustomizerState(pizza)); // ₦7,000
    await cart.addItem(item);
    expect(cart.getState().subtotal).toBe(7000);

    // Price increased from ₦7,000 to ₦8,000
    const catalogWithPriceIncrease: Product[] = [
      { ...pizza, basePrice: 8000 },
    ];

    await cart.reconcileWithCatalog(catalogWithPriceIncrease);
    const state = cart.getState();

    // Price changed notice must be present
    expect(state.priceChangeNotice).not.toBeNull();
    expect(state.priceChangeNotice?.previousSubtotal).toBe(7000);
    expect(state.priceChangeNotice?.newSubtotal).toBe(8000);
    expect(state.priceChangeNotice?.difference).toBe(1000);
    expect(state.priceChangeNotice?.requiresCustomerAcceptance).toBe(true);

    // Checkout must be blocked until customer accepts
    expect(state.isReadyForCheckout).toBe(false);
    expect(state.checkoutBlockers).toContain(
      'Please accept the updated menu prices before checkout.'
    );

    // Customer accepts updated prices
    await cart.acceptPriceAdjustment();
    const updatedState = cart.getState();
    expect(updatedState.priceChangeNotice).toBeNull();
  });
});

describe('Phase 2.1: 4. Delivery and Pickup Integrity', () => {
  let cart: CartStore;
  const pizza = SEEDED_PRODUCTS[0];

  beforeEach(async () => {
    await AsyncStorage.clear();
    cart = new CartStore();
    await cart.clearCart();
    await cart.addItem(toCartItem(initializeCustomizerState(pizza)));
  });

  it('strictly sets delivery fee to ₦0 and removes address requirement when switching to pickup', async () => {
    await cart.setFulfillmentType('pickup');
    const state = cart.getState();

    expect(state.fulfillmentType).toBe('pickup');
    expect(state.deliveryFee).toBe(0);
    expect(state.selectedLandmark).toBeNull();
    expect(state.estimatedTotal).toBe(state.subtotal);
    // Pickup does not require delivery address
    expect(state.isReadyForCheckout).toBe(true);
    expect(state.checkoutBlockers.length).toBe(0);
  });

  it('blocks delivery checkout if landmark is missing or address is blank', async () => {
    await cart.setFulfillmentType('delivery');
    await cart.setLandmark(null);
    await cart.setDeliveryDetails('');

    const state = cart.getState();
    expect(state.isReadyForCheckout).toBe(false);
    expect(state.checkoutBlockers).toContain('Please select a valid delivery landmark.');
    expect(state.checkoutBlockers).toContain('Please enter your delivery address / hostel room.');

    // Provide landmark and address
    await cart.setLandmark(PROVISIONAL_LANDMARKS[0]);
    await cart.setDeliveryDetails('King Jaja Hall, Block A, Room 12');

    const readyState = cart.getState();
    expect(readyState.isReadyForCheckout).toBe(true);
    expect(readyState.checkoutBlockers.length).toBe(0);
  });
});

describe('Phase 2.1: 5. Local Cart Storage Resilience & Boundary Testing', () => {
  it('recovers gracefully from corrupted JSON in AsyncStorage without crashing', async () => {
    await AsyncStorage.setItem(CART_STORAGE_KEY, '{ corrupt-json: invalid @@');

    const freshCart = new CartStore();
    await freshCart.ensureLoaded();

    const state = freshCart.getState();
    expect(state.items).toEqual([]);
    expect(state.subtotal).toBe(0);
  });

  it('sanitizes malformed cart items on hydration', async () => {
    const malformedData = {
      schemaVersion: 1,
      items: [
        { productId: 'valid-prod', productName: 'Valid Pizza', quantity: -5, unitPrice: 7000 },
        { productId: 12345, productName: null }, // corrupt item
        { productId: 'prod-2', productName: 'Drink', quantity: 9999, unitPrice: -300 }, // out of bounds
      ],
    };

    await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(malformedData));

    const freshCart = new CartStore();
    await freshCart.ensureLoaded();

    const state = freshCart.getState();
    expect(state.items.length).toBe(2); // corrupt item discarded
    expect(state.items[0].quantity).toBe(1); // clamped from -5 to 1
    expect(state.items[1].quantity).toBe(99); // clamped from 9999 to 99
    expect(state.items[1].unitPrice).toBe(0); // clamped negative price to 0
  });

  it('handles AsyncStorage write failures without crashing', async () => {
    const cart = new CartStore();
    await cart.clearCart();

    // Mock AsyncStorage.setItem throwing quota error
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(
      new Error('Disk quota exceeded')
    );

    const result = await cart.addItem(toCartItem(initializeCustomizerState(SEEDED_PRODUCTS[0])));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Disk quota exceeded');
    expect(cart.getState().storageError).toContain('Disk quota exceeded');

    spy.mockRestore();
  });
});

describe('Phase 2.1: 6. Customizer Item Hash Determinism & Normalization', () => {
  const pizza = SEEDED_PRODUCTS[0];
  const toppingsGroup = pizza.customizationGroups![0];
  const milkshake = SEEDED_PRODUCTS.find((p) => p.name === 'Milkshake')!;

  it('produces identical hash regardless of topping selection order', () => {
    // Order 1: Beef then Cheese
    let state1 = initializeCustomizerState(pizza);
    state1 = toggleOption(state1, toppingsGroup, EXTRA_PIZZA_TOPPINGS[0]); // Beef
    state1 = toggleOption(state1, toppingsGroup, EXTRA_PIZZA_TOPPINGS[1]); // Cheese

    // Order 2: Cheese then Beef
    let state2 = initializeCustomizerState(pizza);
    state2 = toggleOption(state2, toppingsGroup, EXTRA_PIZZA_TOPPINGS[1]); // Cheese
    state2 = toggleOption(state2, toppingsGroup, EXTRA_PIZZA_TOPPINGS[0]); // Beef

    expect(generateCustomizerItemHash(state1)).toBe(generateCustomizerItemHash(state2));
  });

  it('produces identical hash regardless of flavor selection order in desserts', () => {
    // Order 1: Vanilla then Chocolate
    let state1 = initializeCustomizerState(milkshake);
    state1 = toggleFlavor(state1, 'Vanilla Blast', 2);
    state1 = toggleFlavor(state1, 'Strawberry Lovers', 2);

    // Order 2: Chocolate then Vanilla
    let state2 = initializeCustomizerState(milkshake);
    state2 = toggleFlavor(state2, 'Strawberry Lovers', 2);
    state2 = toggleFlavor(state2, 'Vanilla Blast', 2);

    expect(generateCustomizerItemHash(state1)).toBe(generateCustomizerItemHash(state2));
  });

  it('does NOT alter configuration hash when only quantity changes', () => {
    let state1 = initializeCustomizerState(pizza);
    state1 = setQuantity(state1, 1);

    let state2 = initializeCustomizerState(pizza);
    state2 = setQuantity(state2, 5);

    expect(generateCustomizerItemHash(state1)).toBe(generateCustomizerItemHash(state2));
  });

  it('normalizes special instructions whitespace and casing', () => {
    let state1 = initializeCustomizerState(pizza);
    state1 = setSpecialInstructions(state1, 'Crispy   crust ');

    let state2 = initializeCustomizerState(pizza);
    state2 = setSpecialInstructions(state2, 'crispy crust');

    expect(generateCustomizerItemHash(state1)).toBe(generateCustomizerItemHash(state2));
  });
});

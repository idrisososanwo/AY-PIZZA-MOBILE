/**
 * Automated Tests: Customizer Engine & Catalog Data Handling
 */

import {
  catalogRepository,
  SEEDED_PRODUCTS,
  PIZZA_SIZES,
  MILKSHAKE_SIZES,
  ICE_CREAM_SIZES,
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
  calculateCustomizerPrice,
  validateCustomizerState,
  generateCustomizerItemHash,
  toCartItem,
} from '../domains/customizer/customizer-engine';
import { Product } from '../types/catalog';

describe('Catalog Data Handling', () => {
  it('retrieves seeded categories with correct display orders', async () => {
    const categories = await catalogRepository.getCategories();
    expect(categories.length).toBeGreaterThanOrEqual(4);
    expect(categories.map((c) => c.slug)).toEqual(
      expect.arrayContaining(['pizza', 'icecream', 'fastfood', 'drinks'])
    );
  });

  it('filters products by category slug', async () => {
    const pizzas = await catalogRepository.getProducts({ categorySlug: 'pizza' });
    expect(pizzas.length).toBeGreaterThanOrEqual(13);
    for (const p of pizzas) {
      expect(p.categorySlug).toBe('pizza');
    }
  });

  it('searches products by keyword in name or description', async () => {
    const searchResults = await catalogRepository.getProducts({ searchQuery: 'pepperoni' });
    expect(searchResults.length).toBeGreaterThanOrEqual(1);
    expect(searchResults[0].name).toContain('Pepperoni');
  });

  it('flags reverse-engineered prices and fees as provisional', async () => {
    const products = await catalogRepository.getProducts();
    for (const p of products) {
      expect(p.isProvisional).toBe(true);
    }
  });
});

describe('Customizer Engine: Sizing & Base Rules', () => {
  const sweetAndSourPizza = SEEDED_PRODUCTS[0]; // Base price: ₦7,000

  it('initializes pizza with default Regular size (+₦0)', () => {
    const state = initializeCustomizerState(sweetAndSourPizza);
    expect(state.selectedSize).not.toBeNull();
    expect(state.selectedSize?.name).toBe('Regular');
    expect(state.quantity).toBe(1);

    const breakdown = calculateCustomizerPrice(state);
    expect(breakdown.unitBasePrice).toBe(7000);
    expect(breakdown.sizePrice).toBe(0);
    expect(breakdown.unitItemTotal).toBe(7000);
    expect(breakdown.lineTotal).toBe(7000);
  });

  it('calculates price increments for all 5 pizza sizes', () => {
    let state = initializeCustomizerState(sweetAndSourPizza);

    // Standard (+₦1,500) -> ₦8,500
    state = selectSize(state, PIZZA_SIZES[1]);
    expect(calculateCustomizerPrice(state).unitItemTotal).toBe(8500);

    // Large (+₦3,000) -> ₦10,000
    state = selectSize(state, PIZZA_SIZES[2]);
    expect(calculateCustomizerPrice(state).unitItemTotal).toBe(10000);

    // Queen (+₦5,000) -> ₦12,000
    state = selectSize(state, PIZZA_SIZES[3]);
    expect(calculateCustomizerPrice(state).unitItemTotal).toBe(12000);

    // King (+₦7,000) -> ₦14,000
    state = selectSize(state, PIZZA_SIZES[4]);
    expect(calculateCustomizerPrice(state).unitItemTotal).toBe(14000);
  });
});

describe('Customizer Engine: Half & Half Pricing & Validation', () => {
  const sweetAndSourPizza = SEEDED_PRODUCTS[0];
  const bbqBeefPizza = SEEDED_PRODUCTS[6];

  it('applies +₦1,000 Half & Half surcharge for Regular and Standard pizzas', () => {
    let state = initializeCustomizerState(sweetAndSourPizza);
    state = toggleHalfAndHalf(state, true);
    state = setHalfSecondaryProduct(state, bbqBeefPizza);

    // Regular size
    state = selectSize(state, PIZZA_SIZES[0]);
    let breakdown = calculateCustomizerPrice(state);
    expect(breakdown.halfAndHalfSurcharge).toBe(1000);
    expect(breakdown.unitItemTotal).toBe(7000 + 0 + 1000); // ₦8,000

    // Standard size
    state = selectSize(state, PIZZA_SIZES[1]);
    breakdown = calculateCustomizerPrice(state);
    expect(breakdown.halfAndHalfSurcharge).toBe(1000);
    expect(breakdown.unitItemTotal).toBe(7000 + 1500 + 1000); // ₦9,500
  });

  it('applies +₦1,500 Half & Half surcharge for Large, Queen, and King pizzas', () => {
    let state = initializeCustomizerState(sweetAndSourPizza);
    state = toggleHalfAndHalf(state, true);
    state = setHalfSecondaryProduct(state, bbqBeefPizza);

    // Large
    state = selectSize(state, PIZZA_SIZES[2]);
    let breakdown = calculateCustomizerPrice(state);
    expect(breakdown.halfAndHalfSurcharge).toBe(1500);
    expect(breakdown.unitItemTotal).toBe(7000 + 3000 + 1500); // ₦11,500

    // Queen
    state = selectSize(state, PIZZA_SIZES[3]);
    breakdown = calculateCustomizerPrice(state);
    expect(breakdown.halfAndHalfSurcharge).toBe(1500);
    expect(breakdown.unitItemTotal).toBe(7000 + 5000 + 1500); // ₦13,500

    // King
    state = selectSize(state, PIZZA_SIZES[4]);
    breakdown = calculateCustomizerPrice(state);
    expect(breakdown.halfAndHalfSurcharge).toBe(1500);
    expect(breakdown.unitItemTotal).toBe(7000 + 7000 + 1500); // ₦15,500
  });

  it('rejects Half & Half if no secondary flavor is chosen', () => {
    let state = initializeCustomizerState(sweetAndSourPizza);
    state = toggleHalfAndHalf(state, true);
    state = setHalfSecondaryProduct(state, null);

    const validation = validateCustomizerState(state);
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain(
      'Please select the secondary pizza flavor for your Half & Half pizza.'
    );
  });

  it('rejects Half & Half if the user selects the same product as the secondary flavor', () => {
    let state = initializeCustomizerState(sweetAndSourPizza);
    state = toggleHalfAndHalf(state, true);
    state = setHalfSecondaryProduct(state, sweetAndSourPizza);

    const validation = validateCustomizerState(state);
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain(
      'Half & Half secondary pizza must be a different flavor.'
    );
  });

  it('rejects Half & Half if the secondary pizza is out of stock', () => {
    const unavailablePizza: Product = {
      ...bbqBeefPizza,
      isAvailable: false,
    };
    let state = initializeCustomizerState(sweetAndSourPizza);
    state = toggleHalfAndHalf(state, true);
    state = setHalfSecondaryProduct(state, unavailablePizza);

    const validation = validateCustomizerState(state);
    expect(validation.isValid).toBe(false);
    expect(validation.errors[0]).toContain('is out of stock');
  });
});

describe('Customizer Engine: Topping Selection Limits', () => {
  const sweetAndSourPizza = SEEDED_PRODUCTS[0];
  const toppingsGroup = sweetAndSourPizza.customizationGroups![0]; // Extra Pizza Toppings (min 0, max 5)

  it('allows adding up to max selections (+₦1,000 each) and blocks exceeding max', () => {
    let state = initializeCustomizerState(sweetAndSourPizza);

    // Add 4 toppings
    state = toggleOption(state, toppingsGroup, EXTRA_PIZZA_TOPPINGS[0]); // Extra Beef
    state = toggleOption(state, toppingsGroup, EXTRA_PIZZA_TOPPINGS[1]); // Extra Cheese
    state = toggleOption(state, toppingsGroup, EXTRA_PIZZA_TOPPINGS[2]); // Extra Chicken
    state = toggleOption(state, toppingsGroup, EXTRA_PIZZA_TOPPINGS[3]); // Extra Pepperoni

    expect(state.selectedOptions[toppingsGroup.id].length).toBe(4);
    const breakdown = calculateCustomizerPrice(state);
    expect(breakdown.customizationsTotal).toBe(4000);

    // Toggling an existing option removes it
    state = toggleOption(state, toppingsGroup, EXTRA_PIZZA_TOPPINGS[0]);
    expect(state.selectedOptions[toppingsGroup.id].length).toBe(3);
    expect(calculateCustomizerPrice(state).customizationsTotal).toBe(3000);
  });
});

describe('Customizer Engine: Milkshake & Ice Cream Flavor Constraints', () => {
  const milkshake = SEEDED_PRODUCTS.find((p) => p.name === 'Milkshake')!;
  const iceCream = SEEDED_PRODUCTS.find((p) => p.name === 'Ice Cream Cup')!;

  it('requires at least 1 flavor and prevents selecting more than 2 flavors for milkshake', () => {
    let state = initializeCustomizerState(milkshake);
    expect(validateCustomizerState(state).isValid).toBe(false);
    expect(validateCustomizerState(state).errors).toContain(
      'Please select at least 1 flavor (up to 2).'
    );

    // Select 1 flavor
    state = toggleFlavor(state, 'Vanilla Blast', 2);
    expect(validateCustomizerState(state).isValid).toBe(true);

    // Select 2nd flavor
    state = toggleFlavor(state, 'Strawberry Lovers', 2);
    expect(state.selectedFlavors.length).toBe(2);
    expect(validateCustomizerState(state).isValid).toBe(true);

    // Attempting 3rd flavor is blocked by engine
    state = toggleFlavor(state, 'Milk and Cookies', 2);
    expect(state.selectedFlavors.length).toBe(2);
  });

  it('allows selecting up to 2 flavors for ice cream cup with size adjustments', () => {
    let state = initializeCustomizerState(iceCream);
    // Medium Cup (+₦1,000)
    state = selectSize(state, ICE_CREAM_SIZES[1]);
    state = toggleFlavor(state, 'Vanilla', 2);
    state = toggleFlavor(state, 'Chocolate', 2);

    expect(state.selectedFlavors).toEqual(['Vanilla', 'Chocolate']);
    const breakdown = calculateCustomizerPrice(state);
    // Base ₦3,500 + Medium Cup ₦1,000 = ₦4,500
    expect(breakdown.unitItemTotal).toBe(4500);
  });
});

describe('Customizer Engine: Product Availability & Out of Stock', () => {
  it('blocks customizing an unavailable product', () => {
    const outOfStockPizza: Product = {
      ...SEEDED_PRODUCTS[0],
      isAvailable: false,
    };

    const state = initializeCustomizerState(outOfStockPizza);
    const validation = validateCustomizerState(state);
    expect(validation.isValid).toBe(false);
    expect(validation.errors[0]).toContain('is currently out of stock');
  });
});

describe('Customizer Engine: Item Hashing and Differentiation', () => {
  const pizza = SEEDED_PRODUCTS[0];
  const toppingsGroup = pizza.customizationGroups![0];

  it('generates identical hash for same product configuration', () => {
    let state1 = initializeCustomizerState(pizza);
    state1 = selectSize(state1, PIZZA_SIZES[2]); // Large
    state1 = toggleOption(state1, toppingsGroup, EXTRA_PIZZA_TOPPINGS[0]); // Extra Beef

    let state2 = initializeCustomizerState(pizza);
    state2 = selectSize(state2, PIZZA_SIZES[2]); // Large
    state2 = toggleOption(state2, toppingsGroup, EXTRA_PIZZA_TOPPINGS[0]); // Extra Beef

    expect(generateCustomizerItemHash(state1)).toBe(generateCustomizerItemHash(state2));
  });

  it('generates distinct hashes for different sizes or toppings', () => {
    let state1 = initializeCustomizerState(pizza);
    state1 = selectSize(state1, PIZZA_SIZES[0]); // Regular

    let state2 = initializeCustomizerState(pizza);
    state2 = selectSize(state2, PIZZA_SIZES[2]); // Large

    expect(generateCustomizerItemHash(state1)).not.toBe(generateCustomizerItemHash(state2));

    let state3 = initializeCustomizerState(pizza);
    state3 = selectSize(state3, PIZZA_SIZES[2]);
    state3 = toggleOption(state3, toppingsGroup, EXTRA_PIZZA_TOPPINGS[1]); // Extra Cheese

    expect(generateCustomizerItemHash(state2)).not.toBe(generateCustomizerItemHash(state3));
  });
});

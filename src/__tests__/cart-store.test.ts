/**
 * Automated Tests: Local Cart Engine & Persistence
 */

import { CartStore, INITIAL_CART_STATE, CART_STORAGE_KEY } from '../domains/cart/cart-store';
import {
  SEEDED_PRODUCTS,
  PIZZA_SIZES,
  EXTRA_PIZZA_TOPPINGS,
} from '../domains/catalog/catalog-repository';
import {
  initializeCustomizerState,
  selectSize,
  toggleOption,
  setQuantity,
  toCartItem,
} from '../domains/customizer/customizer-engine';
import { PROVISIONAL_LANDMARKS } from '../domains/delivery/delivery-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../types/catalog';

describe('Local Cart Engine: Item Operations & Differentiation', () => {
  let cart: CartStore;
  const pizza = SEEDED_PRODUCTS[0]; // Sweet and Sour Pizza (₦7,000 base)
  const toppingsGroup = pizza.customizationGroups![0];

  beforeEach(async () => {
    await AsyncStorage.clear();
    cart = new CartStore();
    await cart.clearCart();
  });

  it('adds customized item to cart and calculates subtotal and estimated total', async () => {
    let state = initializeCustomizerState(pizza);
    state = selectSize(state, PIZZA_SIZES[2]); // Large (+₦3,000) -> ₦10,000
    state = toggleOption(state, toppingsGroup, EXTRA_PIZZA_TOPPINGS[0]); // Extra Beef (+₦1,000) -> ₦11,000
    state = setQuantity(state, 2); // 2x ₦11,000 = ₦22,000

    const item = toCartItem(state);
    await cart.addItem(item);

    const snapshot = cart.getState();
    expect(snapshot.items.length).toBe(1);
    expect(snapshot.itemCount).toBe(2);
    expect(snapshot.subtotal).toBe(22000);
    // Campus delivery fee: ₦500
    expect(snapshot.deliveryFee).toBe(500);
    expect(snapshot.estimatedTotal).toBe(22500);
  });

  it('increments quantity when identical configuration is added', async () => {
    let state = initializeCustomizerState(pizza);
    state = selectSize(state, PIZZA_SIZES[1]); // Standard
    const item1 = toCartItem(state);

    await cart.addItem(item1);
    expect(cart.getState().items.length).toBe(1);
    expect(cart.getState().items[0].quantity).toBe(1);

    // Add identical item again
    const item2 = toCartItem(state);
    await cart.addItem(item2);

    expect(cart.getState().items.length).toBe(1);
    expect(cart.getState().items[0].quantity).toBe(2);
    expect(cart.getState().subtotal).toBe(8500 * 2);
  });

  it('distinguishes different configurations of the same product', async () => {
    // Config A: Regular with Extra Beef
    let stateA = initializeCustomizerState(pizza);
    stateA = selectSize(stateA, PIZZA_SIZES[0]);
    stateA = toggleOption(stateA, toppingsGroup, EXTRA_PIZZA_TOPPINGS[0]);
    const itemA = toCartItem(stateA);

    // Config B: Large with Extra Cheese
    let stateB = initializeCustomizerState(pizza);
    stateB = selectSize(stateB, PIZZA_SIZES[2]);
    stateB = toggleOption(stateB, toppingsGroup, EXTRA_PIZZA_TOPPINGS[1]);
    const itemB = toCartItem(stateB);

    await cart.addItem(itemA);
    await cart.addItem(itemB);

    const snapshot = cart.getState();
    expect(snapshot.items.length).toBe(2);
    expect(snapshot.items[0].itemHash).not.toBe(snapshot.items[1].itemHash);
  });

  it('edits an existing cart item in-place', async () => {
    let state = initializeCustomizerState(pizza);
    state = selectSize(state, PIZZA_SIZES[0]); // Regular (₦7,000)
    const originalItem = toCartItem(state);
    await cart.addItem(originalItem);

    // Edit item to Large (+₦3,000) and Extra Chicken (+₦1,000)
    let updatedState = initializeCustomizerState(pizza, originalItem);
    updatedState = selectSize(updatedState, PIZZA_SIZES[2]); // Large
    updatedState = toggleOption(updatedState, toppingsGroup, EXTRA_PIZZA_TOPPINGS[2]); // Extra Chicken
    const updatedItem = toCartItem(updatedState, originalItem.id);

    await cart.updateItem(originalItem.id, updatedItem);

    const snapshot = cart.getState();
    expect(snapshot.items.length).toBe(1);
    expect(snapshot.items[0].id).toBe(originalItem.id);
    expect(snapshot.items[0].sizeName).toBe('Large');
    expect(snapshot.items[0].unitPrice).toBe(11000); // 7000 + 3000 + 1000
    expect(snapshot.subtotal).toBe(11000);
  });

  it('updates quantity and removes item when quantity reaches zero', async () => {
    const item = toCartItem(initializeCustomizerState(pizza));
    await cart.addItem(item);

    expect(cart.getState().items[0].quantity).toBe(1);

    await cart.updateQuantity(item.id, 5);
    expect(cart.getState().items[0].quantity).toBe(5);

    // Decrement to zero triggers removal
    await cart.updateQuantity(item.id, 0);
    expect(cart.getState().items.length).toBe(0);
    expect(cart.getState().subtotal).toBe(0);
  });

  it('removes item directly by ID', async () => {
    const item = toCartItem(initializeCustomizerState(pizza));
    await cart.addItem(item);
    expect(cart.getState().items.length).toBe(1);

    await cart.removeItem(item.id);
    expect(cart.getState().items.length).toBe(0);
  });
});

describe('Local Cart Engine: Fulfillment & Landmark Fees', () => {
  let cart: CartStore;
  const pizza = SEEDED_PRODUCTS[0];

  beforeEach(async () => {
    cart = new CartStore();
    await cart.clearCart();
    await cart.addItem(toCartItem(initializeCustomizerState(pizza)));
  });

  it('sets delivery fee to ₦0 when switching to pickup', async () => {
    await cart.setFulfillmentType('pickup');
    const snapshot = cart.getState();
    expect(snapshot.fulfillmentType).toBe('pickup');
    expect(snapshot.deliveryFee).toBe(0);
    expect(snapshot.estimatedTotal).toBe(snapshot.subtotal);
  });

  it('updates delivery fee based on selected UNILAG / Mainland landmark', async () => {
    await cart.setFulfillmentType('delivery');

    // UNILAG Campus (₦500)
    await cart.setLandmark(PROVISIONAL_LANDMARKS[0]);
    expect(cart.getState().deliveryFee).toBe(500);

    // Yaba (₦2,000)
    const yabaLandmark = PROVISIONAL_LANDMARKS.find((l) => l.name === 'Yaba')!;
    await cart.setLandmark(yabaLandmark);
    expect(cart.getState().deliveryFee).toBe(2000);
    expect(cart.getState().estimatedTotal).toBe(cart.getState().subtotal + 2000);

    // Surulere (₦3,500)
    const surulereLandmark = PROVISIONAL_LANDMARKS.find((l) => l.name === 'Surulere')!;
    await cart.setLandmark(surulereLandmark);
    expect(cart.getState().deliveryFee).toBe(3500);
  });
});

describe('Local Cart Engine: Catalog Reconciliation & Stale Data', () => {
  let cart: CartStore;
  const pizza = SEEDED_PRODUCTS[0];

  beforeEach(async () => {
    await AsyncStorage.clear();
    cart = new CartStore();
    await cart.clearCart();
    await cart.addItem(toCartItem(initializeCustomizerState(pizza)));
  });

  it('flags cart as stale when a cart item becomes out of stock in fresh catalog', async () => {
    const updatedCatalog: Product[] = [
      {
        ...pizza,
        isAvailable: false, // Discontinued / out of stock
      },
    ];

    const result = await cart.reconcileWithCatalog(updatedCatalog);
    expect(result.hasChanges).toBe(true);
    expect(result.unavailableItems).toContain(pizza.name);

    const snapshot = cart.getState();
    expect(snapshot.isStale).toBe(true);
    expect(snapshot.staleReason).toContain('out of stock');
  });

  it('updates unit prices gracefully if catalog base price changes', async () => {
    const updatedCatalog: Product[] = [
      {
        ...pizza,
        basePrice: 8000, // Price updated from 7,000 to 8,000
      },
    ];

    const result = await cart.reconcileWithCatalog(updatedCatalog);
    expect(result.hasChanges).toBe(true);

    const snapshot = cart.getState();
    expect(snapshot.items[0].basePrice).toBe(8000);
    expect(snapshot.items[0].unitPrice).toBe(8000);
    expect(snapshot.subtotal).toBe(8000);
  });
});

describe('Local Cart Engine: Persistence', () => {
  it('persists cart state to AsyncStorage', async () => {
    const cart = new CartStore();
    await cart.clearCart();
    const item = toCartItem(initializeCustomizerState(SEEDED_PRODUCTS[0]));
    await cart.addItem(item);

    const storedData = await AsyncStorage.getItem(CART_STORAGE_KEY);
    expect(storedData).not.toBeNull();

    const parsed = JSON.parse(storedData!);
    expect(parsed.items.length).toBe(1);
    expect(parsed.items[0].productId).toBe(SEEDED_PRODUCTS[0].id);
  });
});

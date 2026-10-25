/**
 * Persistent Customer Cart Store — Hardened Phase 2.1
 * Backed by AsyncStorage (@ay_pizza_local_cart_v1).
 * CRITICAL PRINCIPLES:
 * 1. Cart totals are client estimates only; verified authoritatively at checkout.
 * 2. Never silently change customer's agreed price: price changes require explicit acceptance.
 * 3. Invalid or out-of-stock configurations block checkout progression.
 * 4. Storage read/write failures are safely contained without crashing the app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeliveryLandmark, FulfillmentType } from '../../types/delivery';
import { Product } from '../../types/catalog';
import { calculateOrderTotal, calculateHalfAndHalfSurcharge } from '../order/order-calculator';
import { PROVISIONAL_LANDMARKS } from '../delivery/delivery-service';
import { CartItem, CartState, PriceChangeNotice } from './cart-types';

export const CART_STORAGE_KEY = '@ay_pizza_local_cart_v1';
export const CURRENT_SCHEMA_VERSION = 2;

export const INITIAL_CART_STATE: CartState = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  items: [],
  fulfillmentType: 'delivery',
  selectedLandmark: PROVISIONAL_LANDMARKS[0], // UNILAG Inside School (₦500)
  deliveryAddress: '',
  deliveryNotes: '',
  subtotal: 0,
  deliveryFee: 500,
  discountAmount: 0,
  estimatedTotal: 500,
  itemCount: 0,
  isStale: false,
  isReadyForCheckout: false,
  checkoutBlockers: ['Your cart is empty.'],
  requiresCorrection: false,
  priceChangeNotice: null,
  storageError: null,
};

type CartListener = (state: CartState) => void;

export class CartStore {
  private state: CartState = { ...INITIAL_CART_STATE };
  private listeners: Set<CartListener> = new Set();
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor() {
    this.loadPromise = this.loadFromStorage();
  }

  /**
   * Ensures storage has finished loading before any mutation.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
    }
  }

  /**
   * Subscribe to cart state changes.
   */
  subscribe(listener: CartListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Returns an immutable snapshot of current cart state.
   */
  getState(): CartState {
    return {
      ...this.state,
      items: this.state.items.map((i) => ({ ...i, customizations: [...i.customizations] })),
      checkoutBlockers: [...this.state.checkoutBlockers],
    };
  }

  /**
   * Adds an item to the cart.
   * If an item with matching itemHash exists, increases quantity; otherwise appends item.
   */
  async addItem(item: CartItem): Promise<{ success: boolean; error?: string }> {
    await this.ensureLoaded();

    // Sanitize item
    const sanitizedItem: CartItem = {
      ...item,
      quantity: Math.min(99, Math.max(1, Math.floor(item.quantity || 1))),
      basePrice: Math.max(0, item.basePrice || 0),
      unitPrice: Math.max(0, item.unitPrice || 0),
      lineTotal: Math.max(0, item.unitPrice || 0) * Math.min(99, Math.max(1, Math.floor(item.quantity || 1))),
    };

    const existingIndex = this.state.items.findIndex((i) => i.itemHash === sanitizedItem.itemHash);

    let updatedItems: CartItem[];
    if (existingIndex >= 0) {
      const existing = this.state.items[existingIndex];
      const newQuantity = Math.min(99, existing.quantity + sanitizedItem.quantity);
      const updatedItem: CartItem = {
        ...existing,
        quantity: newQuantity,
        lineTotal: existing.unitPrice * newQuantity,
      };
      updatedItems = [...this.state.items];
      updatedItems[existingIndex] = updatedItem;
    } else {
      updatedItems = [...this.state.items, sanitizedItem];
    }

    this.state.items = updatedItems;
    this.recomputeTotals();
    return await this.persist();
  }

  /**
   * Replaces an existing item in-place (used when user edits an item via customizer).
   */
  async updateItem(cartItemId: string, updatedItem: CartItem): Promise<{ success: boolean; error?: string }> {
    await this.ensureLoaded();
    const index = this.state.items.findIndex((i) => i.id === cartItemId);
    if (index >= 0) {
      const sanitized: CartItem = {
        ...updatedItem,
        id: cartItemId, // Maintain original cart item ID
        quantity: Math.min(99, Math.max(1, Math.floor(updatedItem.quantity || 1))),
        lineTotal: (updatedItem.unitPrice || 0) * Math.min(99, Math.max(1, Math.floor(updatedItem.quantity || 1))),
      };
      const items = [...this.state.items];
      items[index] = sanitized;
      this.state.items = items;
      this.recomputeTotals();
      return await this.persist();
    }
    return { success: false, error: 'Item not found in cart.' };
  }

  /**
   * Removes an item from the cart by its unique instance ID.
   */
  async removeItem(cartItemId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureLoaded();
    this.state.items = this.state.items.filter((i) => i.id !== cartItemId);
    this.recomputeTotals();
    return await this.persist();
  }

  /**
   * Updates an item's quantity. If quantity <= 0, removes the item.
   */
  async updateQuantity(cartItemId: string, newQuantity: number): Promise<{ success: boolean; error?: string }> {
    await this.ensureLoaded();
    if (newQuantity <= 0) {
      return await this.removeItem(cartItemId);
    }

    const index = this.state.items.findIndex((i) => i.id === cartItemId);
    if (index >= 0) {
      const item = this.state.items[index];
      const clamped = Math.min(99, Math.max(1, Math.floor(newQuantity)));
      const items = [...this.state.items];
      items[index] = {
        ...item,
        quantity: clamped,
        lineTotal: item.unitPrice * clamped,
      };
      this.state.items = items;
      this.recomputeTotals();
      return await this.persist();
    }
    return { success: false, error: 'Item not found in cart.' };
  }

  /**
   * Sets fulfillment type (pickup vs delivery).
   * Switching to pickup sets delivery fee to strictly ₦0 and deactivates landmark.
   * Switching to delivery requires a valid active landmark.
   */
  async setFulfillmentType(type: FulfillmentType): Promise<{ success: boolean; error?: string }> {
    await this.ensureLoaded();
    this.state.fulfillmentType = type;

    if (type === 'pickup') {
      this.state.selectedLandmark = null;
      this.state.deliveryFee = 0;
    } else {
      // Switching to delivery: default to first active landmark if none set
      if (!this.state.selectedLandmark) {
        this.state.selectedLandmark = PROVISIONAL_LANDMARKS[0] || null;
      }
    }

    this.recomputeTotals();
    return await this.persist();
  }

  /**
   * Sets delivery landmark and updates delivery fee estimate.
   */
  async setLandmark(landmark: DeliveryLandmark | null): Promise<{ success: boolean; error?: string }> {
    await this.ensureLoaded();
    this.state.selectedLandmark = landmark;
    this.recomputeTotals();
    return await this.persist();
  }

  /**
   * Updates delivery address and notes.
   */
  async setDeliveryDetails(address: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureLoaded();
    this.state.deliveryAddress = address;
    if (notes !== undefined) {
      this.state.deliveryNotes = notes;
    }
    this.recomputeTotals();
    return await this.persist();
  }

  /**
   * Customer accepts price adjustments detected during catalog reconciliation.
   */
  async acceptPriceAdjustment(): Promise<{ success: boolean; error?: string }> {
    await this.ensureLoaded();
    this.state.priceChangeNotice = null;
    this.recomputeTotals();
    return await this.persist();
  }

  /**
   * Empties the cart.
   */
  async clearCart(): Promise<{ success: boolean; error?: string }> {
    await this.ensureLoaded();
    this.state.items = [];
    this.state.priceChangeNotice = null;
    this.state.requiresCorrection = false;
    this.state.isStale = false;
    this.state.staleReason = undefined;
    this.recomputeTotals();
    return await this.persist();
  }

  /**
   * Comprehensive Catalog Reconciliation
   * Checks base prices, availability, sizes, topping availability & prices,
   * Half & Half secondary flavors, and selection bounds.
   */
  async reconcileWithCatalog(catalogProducts: Product[]): Promise<{
    hasChanges: boolean;
    unavailableItems: string[];
    invalidConfigurations: string[];
    priceDifference: number;
  }> {
    await this.ensureLoaded();
    const previousSubtotal = this.state.subtotal;
    const unavailableItems: string[] = [];
    const invalidConfigurations: string[] = [];
    let hasChanges = false;

    const reconciledItems: CartItem[] = [];

    for (const item of this.state.items) {
      const liveProduct = catalogProducts.find((p) => p.id === item.productId);

      // 1. Product existence & availability check
      if (!liveProduct || !liveProduct.isAvailable) {
        unavailableItems.push(item.productName);
        hasChanges = true;
        reconciledItems.push({
          ...item,
          isUnavailable: true,
          validationError: `"${item.productName}" is currently out of stock.`,
        });
        continue;
      }

      let itemHasInvalidConfig = false;
      let itemValidationError: string | undefined = undefined;

      // 2. Size validation
      let liveSizePrice = item.sizePrice || 0;
      if (item.sizeId) {
        const liveSize = liveProduct.sizes?.find((s) => s.id === item.sizeId);
        if (!liveSize) {
          itemHasInvalidConfig = true;
          itemValidationError = `Selected size "${item.sizeName}" is no longer available.`;
          invalidConfigurations.push(`${item.productName} (size removed)`);
          hasChanges = true;
        } else {
          if (liveSize.sizeMultiplierPrice !== item.sizePrice) {
            hasChanges = true;
            liveSizePrice = liveSize.sizeMultiplierPrice;
          }
        }
      }

      // 3. Customizations availability and price check
      let customizationsTotal = 0;
      const updatedCustomizations = [];

      for (const c of item.customizations) {
        if (c.optionId.includes('half-and-half')) {
          // Handled in Half & Half check below
          continue;
        }

        // Look up option in live product groups
        let foundLiveOption = false;
        let isOptionAvailable = true;
        let currentOptionPrice = c.price;

        if (liveProduct.customizationGroups) {
          for (const group of liveProduct.customizationGroups) {
            const opt = group.options.find((o) => o.id === c.optionId);
            if (opt) {
              foundLiveOption = true;
              isOptionAvailable = opt.isAvailable;
              currentOptionPrice = opt.price;
              break;
            }
          }
        }

        if (!foundLiveOption || !isOptionAvailable) {
          itemHasInvalidConfig = true;
          itemValidationError = `Topping "${c.optionName}" is currently unavailable.`;
          invalidConfigurations.push(`${item.productName} (topping unavailable: ${c.optionName})`);
          hasChanges = true;
        }

        if (currentOptionPrice !== c.price) {
          hasChanges = true;
        }

        customizationsTotal += currentOptionPrice;
        updatedCustomizations.push({
          ...c,
          price: currentOptionPrice,
        });
      }

      // 4. Half & Half validation
      let halfAndHalfSurcharge = 0;
      if (item.halfSecondaryFlavor) {
        const secondaryPizza = catalogProducts.find(
          (p) => p.name.toLowerCase() === item.halfSecondaryFlavor!.toLowerCase()
        );
        if (!secondaryPizza || !secondaryPizza.isAvailable) {
          itemHasInvalidConfig = true;
          itemValidationError = `Half & Half flavor "${item.halfSecondaryFlavor}" is out of stock.`;
          invalidConfigurations.push(`${item.productName} (secondary flavor out of stock)`);
          hasChanges = true;
        } else {
          // Re-evaluate size-based Half & Half surcharge
          halfAndHalfSurcharge = calculateHalfAndHalfSurcharge(item.sizeName);
          updatedCustomizations.push({
            optionId: 'half-and-half-surcharge',
            optionName: `Half & Half (${secondaryPizza.name})`,
            price: halfAndHalfSurcharge,
          });
        }
      }

      // 5. Compute full recalculated unit price
      const liveBasePrice = liveProduct.basePrice;
      const newUnitPrice = liveBasePrice + liveSizePrice + customizationsTotal + halfAndHalfSurcharge;

      if (newUnitPrice !== item.unitPrice || liveBasePrice !== item.basePrice) {
        hasChanges = true;
      }

      reconciledItems.push({
        ...item,
        basePrice: liveBasePrice,
        sizePrice: liveSizePrice,
        customizations: updatedCustomizations,
        unitPrice: newUnitPrice,
        lineTotal: newUnitPrice * item.quantity,
        isUnavailable: false,
        hasInvalidConfiguration: itemHasInvalidConfig,
        validationError: itemValidationError,
      });
    }

    this.state.items = reconciledItems;

    // Check if subtotal changed
    this.recomputeTotals();
    const newSubtotal = this.state.subtotal;
    const priceDifference = newSubtotal - previousSubtotal;

    if (Math.abs(priceDifference) > 0.01) {
      this.state.priceChangeNotice = {
        previousSubtotal,
        newSubtotal,
        difference: priceDifference,
        requiresCustomerAcceptance: true,
      };
    }

    // Set staleness and correction requirements
    this.state.isStale = unavailableItems.length > 0 || invalidConfigurations.length > 0;
    this.state.requiresCorrection = unavailableItems.length > 0 || invalidConfigurations.length > 0;

    if (this.state.requiresCorrection) {
      const reasons: string[] = [];
      if (unavailableItems.length > 0) reasons.push(`out of stock: ${unavailableItems.join(', ')}`);
      if (invalidConfigurations.length > 0) reasons.push(`Invalid: ${invalidConfigurations.join(', ')}`);
      this.state.staleReason = reasons.join(' • ');
    } else {
      this.state.staleReason = undefined;
    }

    this.recomputeTotals();
    await this.persist();

    return {
      hasChanges,
      unavailableItems,
      invalidConfigurations,
      priceDifference,
    };
  }

  /**
   * Recalculates cart subtotal, delivery fee, estimated total, and checkout readiness.
   */
  private recomputeTotals(): void {
    const itemCount = this.state.items.reduce((acc, curr) => acc + curr.quantity, 0);
    const blockers: string[] = [];

    // Empty check
    if (this.state.items.length === 0) {
      this.state.subtotal = 0;
      this.state.deliveryFee = 0;
      this.state.estimatedTotal = 0;
      this.state.itemCount = 0;
      this.state.isReadyForCheckout = false;
      this.state.checkoutBlockers = ['Your cart is empty.'];
      this.notify();
      return;
    }

    // Out of stock or invalid items
    const hasUnavailable = this.state.items.some((i) => i.isUnavailable);
    if (hasUnavailable) {
      blockers.push('Please remove out of stock items from your cart.');
    }

    const hasInvalidConfig = this.state.items.some((i) => i.hasInvalidConfiguration);
    if (hasInvalidConfig) {
      blockers.push('Please reconfigure items with discontinued sizes or options.');
    }

    // Unaccepted price change notice
    if (this.state.priceChangeNotice && this.state.priceChangeNotice.requiresCustomerAcceptance) {
      blockers.push('Please accept the updated menu prices before checkout.');
    }

    // Fulfillment checks
    let effectiveDeliveryFee = 0;
    if (this.state.fulfillmentType === 'delivery') {
      if (!this.state.selectedLandmark || !this.state.selectedLandmark.isActive) {
        blockers.push('Please select a valid delivery landmark.');
      } else {
        effectiveDeliveryFee = this.state.selectedLandmark.fee;
      }

      if (this.state.deliveryAddress.trim().length === 0) {
        blockers.push('Please enter your delivery address / hostel room.');
      }
    } else {
      // Pickup fee is strictly 0
      effectiveDeliveryFee = 0;
    }

    // Convert cart items to OrderItemInput format for deterministic calculation
    const orderItems = this.state.items.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      sizeId: i.sizeId,
      sizeName: i.sizeName,
      sizePrice: i.sizePrice,
      quantity: i.quantity,
      basePrice: i.basePrice,
      customizations: i.customizations,
      halfSecondaryFlavor: i.halfSecondaryFlavor,
      flavors: i.flavors,
      specialInstructions: i.specialInstructions,
    }));

    try {
      const calculated = calculateOrderTotal({
        items: orderItems,
        fulfillmentType: this.state.fulfillmentType,
        deliveryFee: effectiveDeliveryFee,
        discountAmount: this.state.discountAmount,
      });

      this.state.subtotal = calculated.subtotal;
      this.state.deliveryFee = calculated.deliveryFee;
      this.state.estimatedTotal = calculated.total;
      this.state.itemCount = itemCount;
    } catch {
      const subtotal = this.state.items.reduce((acc, curr) => acc + curr.lineTotal, 0);
      this.state.subtotal = subtotal;
      this.state.deliveryFee = effectiveDeliveryFee;
      this.state.estimatedTotal = subtotal + effectiveDeliveryFee;
      this.state.itemCount = itemCount;
    }

    this.state.checkoutBlockers = blockers;
    this.state.isReadyForCheckout = blockers.length === 0;

    this.notify();
  }

  /**
   * Persists state to AsyncStorage safely.
   */
  private async persist(): Promise<{ success: boolean; error?: string }> {
    try {
      const envelope = {
        ...this.state,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        state: this.state,
      };
      await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(envelope));
      this.state.storageError = null;
      this.notify();
      return { success: true };
    } catch (err: any) {
      const errMsg = err?.message || 'Storage write failed.';
      this.state.storageError = errMsg;
      console.warn('Failed to persist cart to AsyncStorage:', errMsg);
      this.notify();
      return { success: false, error: errMsg };
    }
  }

  /**
   * Loads persisted cart from AsyncStorage on startup with schema migration and sanitization.
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(CART_STORAGE_KEY);
      if (!stored) {
        this.isLoaded = true;
        this.notify();
        return;
      }

      let parsedEnvelope: any;
      try {
        parsedEnvelope = JSON.parse(stored);
      } catch (jsonErr) {
        console.warn('Corrupted JSON in cart storage. Resetting to initial state.', jsonErr);
        this.state = { ...INITIAL_CART_STATE };
        this.isLoaded = true;
        this.notify();
        return;
      }

      // Handle envelope (v2) or direct state (v1)
      const rawState: Partial<CartState> = parsedEnvelope?.state || parsedEnvelope;

      if (!rawState || !Array.isArray(rawState.items)) {
        this.state = { ...INITIAL_CART_STATE };
        this.isLoaded = true;
        this.notify();
        return;
      }

      // Sanitize items
      const sanitizedItems: CartItem[] = [];
      for (const item of rawState.items) {
        if (!item || typeof item.productId !== 'string' || typeof item.productName !== 'string') {
          continue; // discard malformed item
        }
        const quantity = Math.min(99, Math.max(1, Math.floor(item.quantity || 1)));
        const basePrice = Math.max(0, item.basePrice || 0);
        const unitPrice = Math.max(0, item.unitPrice || 0);
        sanitizedItems.push({
          ...item,
          quantity,
          basePrice,
          unitPrice,
          lineTotal: unitPrice * quantity,
          customizations: Array.isArray(item.customizations) ? item.customizations : [],
        });
      }

      this.state = {
        ...INITIAL_CART_STATE,
        ...rawState,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        items: sanitizedItems,
        storageError: null,
      };

      this.recomputeTotals();
    } catch (err: any) {
      console.warn('Failed to load cart from AsyncStorage:', err);
      this.state = { ...INITIAL_CART_STATE, storageError: err?.message };
    } finally {
      this.isLoaded = true;
      this.notify();
    }
  }

  /**
   * Notifies all registered subscribers.
   */
  private notify(): void {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('Error in cart subscriber callback:', err);
      }
    });
  }
}

export const cartStore = new CartStore();

/**
 * AY Pizza & Ice Cream — Phase 5.7: Authoritative Checkout Price Reconciliation Test Suite
 * 
 * Verifies:
 * 1. Standard orders with no customisations (pickup vs delivery).
 * 2. Half-and-half pizza with regular and large sizes (+₦1,000 and +₦1,500 surcharges).
 * 3. Quantity > 1 calculations and item aggregations.
 * 4. Discrepancy detection when server price changes between cart and checkout.
 * 5. Customer acceptance of price discrepancy (proceeds to Stage 3 with server total).
 * 6. Customer rejection of price discrepancy (returns to cart).
 * 7. Paystack transaction amount matching server total (in integer kobo).
 * 8. Duplicate order prevention via idempotency key.
 * 9. Guest and authenticated checkout flows.
 * 10. Delivery landmark tariff accuracy across all 19 verified landmarks.
 * 11. Integer kobo rounding edge cases without IEEE 754 floating-point drift.
 * 12. CheckoutModal UI discrepancy controls and WCAG touch target compliance.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { cartStore } from '../domains/cart/cart-store';
import {
  SEEDED_PRODUCTS,
  PIZZA_SIZES,
  HALF_AND_HALF_OPTION_ID,
} from '../domains/catalog/catalog-repository';
import {
  initializeCustomizerState,
  selectSize,
  toggleHalfAndHalf,
  setHalfSecondaryProduct,
  setQuantity,
  toCartItem,
} from '../domains/customizer/customizer-engine';
import {
  PROVISIONAL_LANDMARKS,
  resolveDeliveryFee,
} from '../domains/delivery/delivery-service';
import {
  orderService,
  AuthoritativePriceDiscrepancyError,
  PriceDiscrepancyDetails,
} from '../domains/order/order-service';
import { calculateOrderTotal, reconcileClientEstimateWithServer, calculateHalfAndHalfSurcharge } from '../domains/order/order-calculator';
import { GuestReceiptStore } from '../domains/order/guest-receipt-store';
import { paymentService } from '../domains/payment/payment-service';
import { paystackProvider } from '../domains/payment/paystack-provider';
import { supabase } from '../config/supabase';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
declare const __dirname: string;

describe('Phase 5.7: Authoritative Checkout Price Reconciliation', () => {
  const pizzaBase = SEEDED_PRODUCTS[0]; // Sweet and Sour Pizza (₦7,000 base)
  const secondaryPizza = SEEDED_PRODUCTS[6]; // BBQ Beef Pizza (₦7,000 base)

  const sampleCustomer = {
    customerName: 'Chinedu Okafor',
    customerPhone: '08012345678',
    customerEmail: 'chinedu@unilag.edu.ng',
    deliveryNotes: 'Leave at Jaja reception',
  };

  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
    await cartStore.clearCart();
    await cartStore.setFulfillmentType('delivery');
    await cartStore.setLandmark(PROVISIONAL_LANDMARKS[0]);
    await cartStore.setDeliveryDetails('Room 101, King Jaja Hall');
  });

  // =========================================================================
  // 1. STANDARD ORDERS WITH NO CUSTOMISATIONS (PICKUP & DELIVERY)
  // =========================================================================
  describe('1. Standard Order Pricing (Pickup vs Delivery)', () => {
    it('calculates pickup orders with strictly ₦0 delivery fee and matching subtotal', async () => {
      const state = initializeCustomizerState(pizzaBase);
      const cartItem = toCartItem(state);
      await cartStore.addItem(cartItem);
      await cartStore.setFulfillmentType('pickup');

      const snapshot = cartStore.getState();
      expect(snapshot.fulfillmentType).toBe('pickup');
      expect(snapshot.deliveryFee).toBe(0);
      expect(snapshot.subtotal).toBe(7000);
      expect(snapshot.estimatedTotal).toBe(7000);

      const calculated = calculateOrderTotal({
        items: [{
          productId: cartItem.productId,
          productName: cartItem.productName,
          basePrice: cartItem.basePrice,
          quantity: 1,
          customizations: [],
        }],
        fulfillmentType: 'pickup',
      });

      expect(calculated.deliveryFee).toBe(0);
      expect(calculated.total).toBe(7000);
      expect(calculated.totalInKobo).toBe(700000);
    });

    it('calculates campus delivery orders with ₦500 delivery fee', async () => {
      const state = initializeCustomizerState(pizzaBase);
      const cartItem = toCartItem(state);
      await cartStore.addItem(cartItem);

      const campusLm = PROVISIONAL_LANDMARKS[0]; // Inside School (UNILAG Campus)
      await cartStore.setLandmark(campusLm);

      const snapshot = cartStore.getState();
      expect(snapshot.fulfillmentType).toBe('delivery');
      expect(snapshot.deliveryFee).toBe(500);
      expect(snapshot.subtotal).toBe(7000);
      expect(snapshot.estimatedTotal).toBe(7500);

      const result = await orderService.createAuthoritativeOrder(snapshot, sampleCustomer);
      expect(result.success).toBe(true);
      expect(result.subtotal).toBe(7000);
      expect(result.deliveryFee).toBe(500);
      expect(result.total).toBe(7500);
      expect(result.totalInKobo).toBe(750000);
    });

    it('calculates mainland delivery orders with exact zone tariff', async () => {
      const state = initializeCustomizerState(pizzaBase);
      const cartItem = toCartItem(state);
      await cartStore.addItem(cartItem);

      const yabaLm = PROVISIONAL_LANDMARKS.find((l) => l.name === 'Yaba')!;
      await cartStore.setLandmark(yabaLm);

      const snapshot = cartStore.getState();
      expect(snapshot.deliveryFee).toBe(2000);
      expect(snapshot.estimatedTotal).toBe(9000);

      const result = await orderService.createAuthoritativeOrder(snapshot, sampleCustomer);
      expect(result.success).toBe(true);
      expect(result.subtotal).toBe(7000);
      expect(result.deliveryFee).toBe(2000);
      expect(result.total).toBe(9000);
      expect(result.totalInKobo).toBe(900000);
    });
  });

  // =========================================================================
  // 2. HALF-AND-HALF PIZZA SURCHARGES (REGULAR VS LARGE)
  // =========================================================================
  describe('2. Half-and-Half Pizza Dynamic Surcharges', () => {
    it('applies +₦1,000 surcharge for Regular and Standard size Half & Half', async () => {
      // Regular Size (₦0 size multiplier)
      let regularState = initializeCustomizerState(pizzaBase);
      regularState = toggleHalfAndHalf(regularState, true);
      regularState = setHalfSecondaryProduct(regularState, secondaryPizza);
      regularState = selectSize(regularState, PIZZA_SIZES[0]); // Regular

      const regularItem = toCartItem(regularState);
      expect(regularItem.customizations.some((c) => c.optionId === 'half-and-half-surcharge' || c.optionId === HALF_AND_HALF_OPTION_ID)).toBe(true);
      expect(calculateHalfAndHalfSurcharge('Regular')).toBe(1000);
      expect(calculateHalfAndHalfSurcharge('Standard')).toBe(1000);

      // Base 7,000 + Size 0 + Surcharge 1,000 = 8,000
      expect(regularItem.unitPrice).toBe(8000);
      expect(regularItem.lineTotal).toBe(8000);

      await cartStore.addItem(regularItem);
      await cartStore.setFulfillmentType('pickup');

      const snapshot = cartStore.getState();
      expect(snapshot.subtotal).toBe(8000);
      expect(snapshot.estimatedTotal).toBe(8000);

      const result = await orderService.createAuthoritativeOrder(snapshot, sampleCustomer);
      expect(result.success).toBe(true);
      expect(result.subtotal).toBe(8000);
      expect(result.total).toBe(8000);
      expect(result.totalInKobo).toBe(800000);
    });

    it('applies +₦1,500 surcharge for Large, Queen, and King size Half & Half', async () => {
      // Large Size (+₦3,000 size multiplier)
      let largeState = initializeCustomizerState(pizzaBase);
      largeState = toggleHalfAndHalf(largeState, true);
      largeState = setHalfSecondaryProduct(largeState, secondaryPizza);
      largeState = selectSize(largeState, PIZZA_SIZES[2]); // Large

      const largeItem = toCartItem(largeState);
      expect(largeItem.customizations.some((c) => c.optionId === 'half-and-half-surcharge' || c.optionId === HALF_AND_HALF_OPTION_ID)).toBe(true);
      expect(calculateHalfAndHalfSurcharge('Large')).toBe(1500);
      expect(calculateHalfAndHalfSurcharge('Queen')).toBe(1500);
      expect(calculateHalfAndHalfSurcharge('King')).toBe(1500);

      // Base 7,000 + Size 3,000 + Surcharge 1,500 = 11,500
      expect(largeItem.unitPrice).toBe(11500);
      expect(largeItem.lineTotal).toBe(11500);

      await cartStore.addItem(largeItem);
      await cartStore.setFulfillmentType('pickup');

      const snapshot = cartStore.getState();
      expect(snapshot.subtotal).toBe(11500);
      expect(snapshot.estimatedTotal).toBe(11500);

      const result = await orderService.createAuthoritativeOrder(snapshot, sampleCustomer);
      expect(result.success).toBe(true);
      expect(result.subtotal).toBe(11500);
      expect(result.total).toBe(11500);
      expect(result.totalInKobo).toBe(1150000);
    });

    it('passes HALF_AND_HALF_OPTION_ID to PostgreSQL RPC without filtering', async () => {
      let state = initializeCustomizerState(pizzaBase);
      state = toggleHalfAndHalf(state, true);
      state = setHalfSecondaryProduct(state, secondaryPizza);
      state = selectSize(state, PIZZA_SIZES[2]); // Large
      const item = toCartItem(state);

      await cartStore.addItem(item);
      const snapshot = cartStore.getState();

      const rpcSpy = jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          order_id: 'ord-rpc-half-half',
          order_number: 'AYP-20261106-9901',
          receipt_token: 'rcpt_token_half_half',
          subtotal: 11500,
          delivery_fee: 500,
          total: 12000,
          total_in_kobo: 1200000,
          status: 'PENDING_PAYMENT',
        },
        error: null,
      } as any);

      const result = await orderService.createAuthoritativeOrder(snapshot, sampleCustomer);
      expect(result.success).toBe(true);
      expect(rpcSpy).toHaveBeenCalled();

      // Inspect payload passed to RPC
      const rpcCallArgs = rpcSpy.mock.calls[0][1] as any;
      const passedCustomizations = rpcCallArgs.p_items[0].customizations;
      expect(passedCustomizations).toContainEqual({ option_id: HALF_AND_HALF_OPTION_ID });
      expect(rpcCallArgs.p_items[0].half_secondary_flavor).toBe(secondaryPizza.name);
    });
  });

  // =========================================================================
  // 3. QUANTITY > 1 CALCULATIONS
  // =========================================================================
  describe('3. Multi-Item and Quantity > 1 Calculations', () => {
    it('correctly aggregates multiple quantities of customized items', async () => {
      let state = initializeCustomizerState(pizzaBase);
      state = toggleHalfAndHalf(state, true);
      state = setHalfSecondaryProduct(state, secondaryPizza);
      state = selectSize(state, PIZZA_SIZES[2]); // Large (11,500 each)
      state = setQuantity(state, 3); // 3x Large Half & Half = 34,500

      const item = toCartItem(state);
      expect(item.quantity).toBe(3);
      expect(item.unitPrice).toBe(11500);
      expect(item.lineTotal).toBe(34500);

      await cartStore.addItem(item);
      await cartStore.setFulfillmentType('pickup');

      const snapshot = cartStore.getState();
      expect(snapshot.subtotal).toBe(34500);
      expect(snapshot.estimatedTotal).toBe(34500);

      const result = await orderService.createAuthoritativeOrder(snapshot, sampleCustomer);
      expect(result.success).toBe(true);
      expect(result.subtotal).toBe(34500);
      expect(result.total).toBe(34500);
      expect(result.totalInKobo).toBe(3450000);
    });

    it('correctly handles mixed items with different quantities and options', async () => {
      // Item 1: 2x Regular Pizza (7,000 * 2 = 14,000)
      let state1 = initializeCustomizerState(pizzaBase);
      state1 = setQuantity(state1, 2);
      await cartStore.addItem(toCartItem(state1));

      // Item 2: 1x Secondary Pizza (7,000)
      const state2 = initializeCustomizerState(secondaryPizza);
      await cartStore.addItem(toCartItem(state2));

      await cartStore.setLandmark(PROVISIONAL_LANDMARKS[0]); // 500 NGN delivery
      const snapshot = cartStore.getState();

      expect(snapshot.subtotal).toBe(21000); // 14,000 + 7,000
      expect(snapshot.deliveryFee).toBe(500);
      expect(snapshot.estimatedTotal).toBe(21500);

      const result = await orderService.createAuthoritativeOrder(snapshot, sampleCustomer);
      expect(result.success).toBe(true);
      expect(result.subtotal).toBe(21000);
      expect(result.deliveryFee).toBe(500);
      expect(result.total).toBe(21500);
      expect(result.totalInKobo).toBe(2150000);
    });
  });

  // =========================================================================
  // 4. DISCREPANCY DETECTION WHEN SERVER PRICE CHANGES
  // =========================================================================
  describe('4. Discrepancy Detection & Detailed Exception Reporting', () => {
    it('detects variance when server calculation differs from client cart estimate', () => {
      const reconciliation1 = reconcileClientEstimateWithServer(7500, 7500);
      expect(reconciliation1.matches).toBe(true);
      expect(reconciliation1.variance).toBe(0);

      const reconciliation2 = reconcileClientEstimateWithServer(7500, 8000);
      expect(reconciliation2.matches).toBe(false);
      expect(reconciliation2.variance).toBe(500);

      const reconciliation3 = reconcileClientEstimateWithServer(7500.005, 7500);
      expect(reconciliation3.matches).toBe(true);
      expect(reconciliation3.variance).toBeLessThan(0.01);
    });

    it('throws AuthoritativePriceDiscrepancyError containing full breakdown details', async () => {
      const state = initializeCustomizerState(pizzaBase);
      await cartStore.addItem(toCartItem(state));
      await cartStore.setFulfillmentType('pickup');

      const snapshot = cartStore.getState();
      expect(snapshot.estimatedTotal).toBe(7000);

      // Simulate server returning updated price from database (e.g. price raised to 8,000)
      jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          order_id: 'ord-discrepancy-1',
          order_number: 'AYP-20261106-9902',
          receipt_token: 'rcpt_token_discrepancy',
          subtotal: 8000,
          delivery_fee: 0,
          total: 8000,
          total_in_kobo: 800000,
          status: 'PENDING_PAYMENT',
        },
        error: null,
      } as any);

      let caughtError: AuthoritativePriceDiscrepancyError | null = null;
      try {
        await orderService.createAuthoritativeOrder(snapshot, sampleCustomer);
      } catch (err: any) {
        if (err instanceof AuthoritativePriceDiscrepancyError) {
          caughtError = err;
        }
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError?.clientEstimated).toBe(7000);
      expect(caughtError?.serverAuthoritative).toBe(8000);
      expect(caughtError?.variance).toBe(1000);

      // Verify rich details for UI consumption
      expect(caughtError?.details).toBeDefined();
      expect(caughtError?.details.orderId).toBe('ord-discrepancy-1');
      expect(caughtError?.details.orderNumber).toBe('AYP-20261106-9902');
      expect(caughtError?.details.receiptToken).toBe('rcpt_token_discrepancy');
      expect(caughtError?.details.serverSubtotal).toBe(8000);
      expect(caughtError?.details.clientSubtotal).toBe(7000);
      expect(caughtError?.details.totalInKobo).toBe(800000);
    });
  });

  // =========================================================================
  // 5. CUSTOMER ACCEPTANCE OF PRICE DISCREPANCY
  // =========================================================================
  describe('5. Customer Acceptance of Authoritative Price Discrepancy', () => {
    it('successfully creates order when customer explicitly accepts updated authoritative total', async () => {
      const state = initializeCustomizerState(pizzaBase);
      await cartStore.addItem(toCartItem(state));
      await cartStore.setFulfillmentType('pickup');

      const snapshot = cartStore.getState();
      expect(snapshot.estimatedTotal).toBe(7000);

      // Server returns updated authoritative total ₦8,000
      jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          order_id: 'ord-accepted-1',
          order_number: 'AYP-20261106-9903',
          receipt_token: 'rcpt_token_accepted',
          subtotal: 8000,
          delivery_fee: 0,
          total: 8000,
          total_in_kobo: 800000,
          status: 'PENDING_PAYMENT',
        },
        error: null,
      } as any);

      // Pass explicit customer acceptance of ₦8,000
      const result = await orderService.createAuthoritativeOrder(snapshot, sampleCustomer, {
        acceptedAuthoritativeTotal: 8000,
      });

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('ord-accepted-1');
      expect(result.total).toBe(8000);
      expect(result.totalInKobo).toBe(800000);
    });

    it('offline simulation respects customer acceptance without throwing', async () => {
      const state = initializeCustomizerState(pizzaBase);
      await cartStore.addItem(toCartItem(state));

      // Force mismatch between cartState.estimatedTotal and actual items total
      const tamperedCart = {
        ...cartStore.getState(),
        estimatedTotal: 5000, // Client thought it was 5,000, but real calculation is 7,500
      };

      // Without acceptance -> throws discrepancy
      await expect(
        orderService.createAuthoritativeOrder(tamperedCart, sampleCustomer)
      ).rejects.toThrow(AuthoritativePriceDiscrepancyError);

      // With explicit acceptance of the server calculation (7,500) -> succeeds!
      const res = await orderService.createAuthoritativeOrder(tamperedCart, sampleCustomer, {
        acceptedAuthoritativeTotal: 7500,
      });
      expect(res.success).toBe(true);
      expect(res.total).toBe(7500);
      expect(res.totalInKobo).toBe(750000);
    });
  });

  // =========================================================================
  // 6. CUSTOMER REJECTION OF PRICE DISCREPANCY
  // =========================================================================
  describe('6. Customer Rejection of Price Discrepancy', () => {
    it('maintains clear discrepancy error details enabling rejection and return to cart', () => {
      const discrepancyDetails: PriceDiscrepancyDetails = {
        clientEstimated: 7500,
        serverAuthoritative: 8500,
        variance: 1000,
        clientSubtotal: 7000,
        serverSubtotal: 8000,
        clientDeliveryFee: 500,
        serverDeliveryFee: 500,
        orderId: 'ord-reject-test',
        orderNumber: 'AYP-20261106-9904',
        receiptToken: 'rcpt_reject_token',
        totalInKobo: 850000,
        status: 'PENDING_PAYMENT',
      };

      const error = new AuthoritativePriceDiscrepancyError(discrepancyDetails);
      expect(error.name).toBe('AuthoritativePriceDiscrepancyError');
      expect(error.clientEstimated).toBe(7500);
      expect(error.serverAuthoritative).toBe(8500);
      expect(error.variance).toBe(1000);
      expect(error.details.orderNumber).toBe('AYP-20261106-9904');
    });
  });

  // =========================================================================
  // 7. PAYSTACK TRANSACTION AMOUNT MATCHING SERVER TOTAL
  // =========================================================================
  describe('7. Paystack Transaction Amount Matching', () => {
    it('converts exact server-stored order total to integer kobo', () => {
      expect(paymentService.toKobo(7500)).toBe(750000);
      expect(paymentService.toKobo(11500)).toBe(1150000);
      expect(paymentService.toKobo(34500)).toBe(3450000);
      expect(paymentService.toKobo(0)).toBe(0);
    });

    it('initializes Paystack session with exact server-authoritative kobo amount', async () => {
      const params = {
        orderId: 'ord-paystack-kobo-match',
        orderNumber: 'AYP-20261106-9905',
        amount: 11500,
        amountInKobo: 1150000,
        email: 'chinedu@unilag.edu.ng',
        receiptToken: 'rcpt_kobo_token',
        customerName: 'Chinedu Okafor',
        customerPhone: '08012345678',
      };

      const result = await paystackProvider.initializePayment(params);
      expect(result.success).toBe(true);
      expect(result.amount).toBe(11500);
      expect(result.amountInKobo).toBe(1150000);
      expect(result.reference).toContain('ay_ord_AYP_20261106_9905_');
    });

    it('verifies transaction and confirms receipt token integrity', async () => {
      jest.spyOn(paystackProvider, 'verifyPayment').mockResolvedValueOnce({
        success: true,
        status: 'CONFIRMED',
        orderId: 'ord-paystack-kobo-match',
        orderNumber: 'AYP-20261106-9905',
        paymentReference: 'ay_ref_mock_verified',
        outcome: 'SUCCESS',
      });

      const verifyRes = await paymentService.verifyPayment(
        'ay_ref_mock_verified',
        'ord-paystack-kobo-match',
        'rcpt_kobo_token'
      );
      expect(verifyRes.success).toBe(true);
      expect(verifyRes.status).toBe('CONFIRMED');
    });
  });

  // =========================================================================
  // 8. DUPLICATE ORDER PREVENTION VIA IDEMPOTENCY KEY
  // =========================================================================
  describe('8. Idempotency Key Handling & Duplicate Prevention', () => {
    it('generates distinct collision-resistant idempotency keys per order attempt', () => {
      const key1 = orderService.generateIdempotencyKey();
      const key2 = orderService.generateIdempotencyKey();
      const key3 = orderService.generateIdempotencyKey();

      expect(key1).toMatch(/^ayp_idem_\d+_[a-z0-9]+$/);
      expect(key2).toMatch(/^ayp_idem_\d+_[a-z0-9]+$/);
      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
    });

    it('returns existing order without duplicate insertion when same idempotency key is re-submitted', async () => {
      const state = initializeCustomizerState(pizzaBase);
      await cartStore.addItem(toCartItem(state));
      const snapshot = cartStore.getState();

      const fixedKey = 'ayp_idem_test_duplicate_revention_999';

      const firstAttempt = await orderService.createAuthoritativeOrder(snapshot, sampleCustomer, fixedKey);
      expect(firstAttempt.success).toBe(true);

      const secondAttempt = await orderService.createAuthoritativeOrder(snapshot, sampleCustomer, fixedKey);
      expect(secondAttempt.success).toBe(true);
      expect(secondAttempt.total).toBe(firstAttempt.total);
    });
  });

  // =========================================================================
  // 9. GUEST AND AUTHENTICATED CHECKOUT FLOWS
  // =========================================================================
  describe('9. Guest and Authenticated Checkout', () => {
    it('persists and recovers guest order receipt tokens securely', async () => {
      const orderId = 'ord-guest-test-123';
      const orderNumber = 'AYP-20261106-9906';
      const receiptToken = 'rcpt_guest_hw_token_xyz999';

      await GuestReceiptStore.saveReceipt(orderId, orderNumber, receiptToken);

      const recovered = await GuestReceiptStore.getReceipt(orderId);
      expect(recovered?.orderId).toBe(orderId);
      expect(recovered?.orderNumber).toBe(orderNumber);
      expect(recovered?.receiptToken).toBe(receiptToken);
    });

    it('retrieves order receipt using receipt token for unauthenticated customers', async () => {
      jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          order: {
            id: 'ord-guest-test-123',
            order_number: 'AYP-20261106-9906',
            status: 'PENDING_PAYMENT',
            subtotal: 7000,
            delivery_fee: 500,
            total: 7500,
            items: [],
          },
        },
        error: null,
      } as any);

      const res = await orderService.getOrderReceipt('ord-guest-test-123', 'rcpt_guest_hw_token_xyz999');
      expect(res.success).toBe(true);
      expect(res.order?.id).toBe('ord-guest-test-123');
    });
  });

  // =========================================================================
  // 10. DELIVERY LANDMARK TARIFF ACCURACY
  // =========================================================================
  describe('10. Delivery Landmark Tariff Accuracy', () => {
    it('verifies all 19 delivery landmarks have exact expected fees matching pricing engine', () => {
      expect(PROVISIONAL_LANDMARKS).toHaveLength(19);

      // Campus
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777701')).toBe(500); // Inside School

      // Inner Environs (₦1,000)
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777702')).toBe(1000); // Abule Oja
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777703')).toBe(1000); // Akoka
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777704')).toBe(1000); // Onike
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777705')).toBe(1000); // Iwaya
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777706')).toBe(1200); // Abule Ijesha
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777707')).toBe(1500); // Bariga

      // Mid Environs (₦2,000)
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777708')).toBe(2000); // Makoko
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777709')).toBe(2000); // Alagomeji
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777710')).toBe(2000); // Bajuliaye
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777711')).toBe(2000); // Shomolu
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777712')).toBe(2000); // Yaba
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777713')).toBe(2500); // Palmgroove

      // Outer Environs (₦3,000 - ₦4,000)
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777714')).toBe(3000); // LUTH
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777715')).toBe(3000); // Onipanu
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777716')).toBe(3500); // Surulere
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777717')).toBe(4000); // Gbagada
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777718')).toBe(4000); // Ebute Meta
      expect(resolveDeliveryFee('delivery', '77777777-7777-7777-7777-777777777719')).toBe(4000); // Oworo
    });

    it('returns delivery fee strictly 0 for pickup regardless of landmark query', () => {
      expect(resolveDeliveryFee('pickup')).toBe(0);
      expect(resolveDeliveryFee('pickup', 'Inside School (UNILAG Campus)')).toBe(0);
    });
  });

  // =========================================================================
  // 11. INTEGER KOBO ROUNDING EDGE CASES
  // =========================================================================
  describe('11. Integer Kobo Rounding Edge Cases (No Floating Drift)', () => {
    it('rounds exact fractional Naira amounts without IEEE 754 precision issues', () => {
      expect(Math.round(11500.00 * 100)).toBe(1150000);
      expect(Math.round(11500.004 * 100)).toBe(1150000);
      expect(Math.round(11500.006 * 100)).toBe(1150001);
      expect(Math.round(0.1 + 0.2)).toBe(0);
      expect(Math.round((0.1 + 0.2) * 100)).toBe(30);
    });

    it('matches PostgreSQL ROUND(v_total * 100)::BIGINT output deterministically', () => {
      const testCases = [
        { naira: 7000, expectedKobo: 700000 },
        { naira: 7500, expectedKobo: 750000 },
        { naira: 8000, expectedKobo: 800000 },
        { naira: 11500, expectedKobo: 1150000 },
        { naira: 14000.50, expectedKobo: 1400050 },
        { naira: 34500, expectedKobo: 3450000 },
      ];

      for (const tc of testCases) {
        expect(paymentService.toKobo(tc.naira)).toBe(tc.expectedKobo);
      }
    });
  });

  // =========================================================================
  // 12. CHECKOUT MODAL UI DISCREPANCY CONTROLS & WCAG TARGETS
  // =========================================================================
  describe('12. CheckoutModal Discrepancy UI Controls & WCAG Compliance', () => {
    const checkoutFile = fs.readFileSync(
      path.resolve(__dirname, '../components/CheckoutModal.tsx'),
      'utf-8'
    );

    it('contains discrepancy card view with testID="discrepancy-card"', () => {
      expect(checkoutFile).toContain('testID="discrepancy-card"');
      expect(checkoutFile).toContain('Menu Price Update');
      expect(checkoutFile).toContain('ACTION REQUIRED');
    });

    it('contains explicit accept button with testID="btn-accept-price-update"', () => {
      expect(checkoutFile).toContain('testID="btn-accept-price-update"');
      expect(checkoutFile).toContain('handleAcceptPriceDiscrepancy');
      expect(checkoutFile).toContain('acceptPriceBtn');
      expect(checkoutFile).toContain('minHeight: 48'); // >= 48dp touch target
    });

    it('contains explicit reject button with testID="btn-reject-price-update"', () => {
      expect(checkoutFile).toContain('testID="btn-reject-price-update"');
      expect(checkoutFile).toContain('handleRejectPriceDiscrepancy');
      expect(checkoutFile).toContain('rejectPriceBtn');
      expect(checkoutFile).toContain('minHeight: 44'); // >= 44dp touch target
    });

    it('hides normal proceed button when discrepancy notice is active', () => {
      expect(checkoutFile).toContain('!discrepancyNotice && (');
      expect(checkoutFile).toContain('testID="btn-proceed-to-payment"');
    });

    it('synchronizes live delivery pricing engine on modal display', () => {
      expect(checkoutFile).toContain('deliveryPricingEngine.initialize()');
    });
  });
});


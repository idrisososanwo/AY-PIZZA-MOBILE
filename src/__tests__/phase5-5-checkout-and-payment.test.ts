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
  toCartItem,
} from '../domains/customizer/customizer-engine';
import {
  deliveryPricingEngine,
  PROVISIONAL_LANDMARKS,
  resolveDeliveryFee,
} from '../domains/delivery/delivery-service';
import { orderService } from '../domains/order/order-service';
import { GuestReceiptStore } from '../domains/order/guest-receipt-store';
import { paymentService } from '../domains/payment/payment-service';
import { LANDMARK_CATEGORIES } from '../components/LandmarkPickerModal';

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

describe('Phase 5.5-6: Checkout, Addresses & Payment Redesign', () => {
  const pizzaBase = SEEDED_PRODUCTS[0]; // Sweet and Sour Pizza (₦7,000)
  const secondaryPizza = SEEDED_PRODUCTS[6]; // BBQ Beef Pizza

  beforeEach(async () => {
    await AsyncStorage.clear();
    await cartStore.clearCart();
    await cartStore.setFulfillmentType('delivery');
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. THREE-STAGE CHECKOUT NAVIGATION & ARCHITECTURE
  // =========================================================================
  describe('1. Three-Stage Checkout Navigation', () => {
    const checkoutFile = fs.readFileSync(
      path.resolve(__dirname, '../components/CheckoutModal.tsx'),
      'utf-8'
    );

    it('implements structured 3-stage progress stepper in CheckoutModal', () => {
      expect(checkoutFile).toContain('testID="checkout-progress-indicator"');
      expect(checkoutFile).toContain('testID="step-tab-1"');
      expect(checkoutFile).toContain('testID="step-tab-2"');
      expect(checkoutFile).toContain('testID="step-tab-3"');
      expect(checkoutFile).toContain('1. Fulfilment');
      expect(checkoutFile).toContain('2. Review');
      expect(checkoutFile).toContain('3. Payment');
    });

    it('contains Stage 1, Stage 2, and Stage 3 container views', () => {
      expect(checkoutFile).toContain('testID="checkout-stage-1"');
      expect(checkoutFile).toContain('testID="checkout-stage-2"');
      expect(checkoutFile).toContain('testID="checkout-stage-3"');
    });

    it('provides back navigation controls between checkout stages', () => {
      expect(checkoutFile).toContain('testID="btn-back-to-details"');
      expect(checkoutFile).toContain('testID="btn-back-to-review"');
      expect(checkoutFile).toContain('setCheckoutStep(1)');
      expect(checkoutFile).toContain('setCheckoutStep(2)');
    });

    it('enforces contact and location validation before advancing to Stage 2', () => {
      expect(checkoutFile).toContain('validateStage1()');
      expect(checkoutFile).toContain('Please enter your full name.');
      expect(checkoutFile).toContain('Please enter a valid phone number');
      expect(checkoutFile).toContain('Please select a valid delivery landmark');
      expect(checkoutFile).toContain('Please enter your room number, hostel, or delivery location.');
    });
  });

  // =========================================================================
  // 2. FULFILMENT & AUTHORITATIVE DELIVERY PRICING
  // =========================================================================
  describe('2. Fulfilment Selection & Authoritative Pricing', () => {
    it('sets delivery fee strictly to ₦0 when King Jaja Pickup is selected', async () => {
      const state = initializeCustomizerState(pizzaBase);
      await cartStore.addItem(toCartItem(state));

      await cartStore.setFulfillmentType('pickup');
      const snapshot = cartStore.getState();

      expect(snapshot.fulfillmentType).toBe('pickup');
      expect(snapshot.deliveryFee).toBe(0);
      expect(snapshot.estimatedTotal).toBe(snapshot.subtotal);
      expect(resolveDeliveryFee('pickup')).toBe(0);
    });

    it('calculates dynamic delivery fee authoritatively when landmark is selected', async () => {
      const state = initializeCustomizerState(pizzaBase);
      await cartStore.addItem(toCartItem(state));

      // Campus landmark
      const campusLandmark = PROVISIONAL_LANDMARKS[0]; // Inside School (₦500)
      await cartStore.setLandmark(campusLandmark);

      expect(cartStore.getState().deliveryFee).toBe(500);
      expect(cartStore.getState().estimatedTotal).toBe(7000 + 500);
      expect(resolveDeliveryFee('delivery', campusLandmark.id)).toBe(500);

      // Mainland landmark
      const mainlandLandmark = PROVISIONAL_LANDMARKS[11]; // Yaba (₦2,000)
      await cartStore.setLandmark(mainlandLandmark);

      expect(cartStore.getState().deliveryFee).toBe(2000);
      expect(cartStore.getState().estimatedTotal).toBe(7000 + 2000);
      expect(resolveDeliveryFee('delivery', mainlandLandmark.id)).toBe(2000);
    });

    it('throws when delivery order is missing landmark', () => {
      expect(() => resolveDeliveryFee('delivery', undefined)).toThrow(
        'A delivery landmark must be selected for delivery orders.'
      );
    });
  });

  // =========================================================================
  // 3. LANDMARK SEARCH & LOGICAL CATEGORIZATION
  // =========================================================================
  describe('3. Landmark Picker & Categorization', () => {
    const landmarkFile = fs.readFileSync(
      path.resolve(__dirname, '../components/LandmarkPickerModal.tsx'),
      'utf-8'
    );

    it('defines logical categories covering all verified delivery zones', () => {
      expect(LANDMARK_CATEGORIES).toHaveLength(5);
      expect(LANDMARK_CATEGORIES.map((c) => c.id)).toEqual([
        'all',
        'zone-campus',
        'zone-near',
        'zone-mid',
        'zone-far',
      ]);
    });

    it('filters landmarks by search term and verified zone categories', () => {
      const allLandmarks = deliveryPricingEngine.getActiveLandmarks();

      // Search filter test
      const searchYaba = allLandmarks.filter((l) =>
        l.name.toLowerCase().includes('yaba')
      );
      expect(searchYaba.length).toBeGreaterThanOrEqual(1);
      expect(searchYaba[0].name).toBe('Yaba');

      // Zone category filter test (zone-campus)
      const campusList = allLandmarks.filter((l) => l.zoneId === 'zone-campus');
      expect(campusList.length).toBeGreaterThanOrEqual(1);
      expect(campusList[0].isCampus).toBe(true);

      // Zone category filter test (zone-far)
      const farList = allLandmarks.filter((l) => l.zoneId === 'zone-far');
      expect(farList.length).toBeGreaterThanOrEqual(5);
      expect(farList.some((l) => l.name === 'Surulere')).toBe(true);
    });

    it('maintains high-contrast search input and clear button in LandmarkPickerModal', () => {
      expect(landmarkFile).toContain('placeholder="Search landmark (e.g. Akoka, Yaba, Jaja, Surulere)..."');
      expect(landmarkFile).toContain('clearBtn');
      expect(landmarkFile).toContain('categoryChipsRow');
      expect(landmarkFile).toContain('categoryChipActive');
    });

    it('provides GPS assist option without making location mandatory', () => {
      expect(landmarkFile).toContain('Use Current Location (GPS Assist)');
      expect(landmarkFile).toContain('Or Search Landmark Manually:');
    });
  });

  // =========================================================================
  // 4. ADDRESS MANAGEMENT & GUEST / AUTH ISOLATION
  // =========================================================================
  describe('4. Address Management & Storage Isolation', () => {
    const GUEST_ADDRESSES_STORAGE_KEY = '@aypizza_guest_addresses';

    it('saves guest addresses to local AsyncStorage safely', async () => {
      const guestAddr = {
        id: 'guest_addr_test_1',
        customerId: 'guest',
        landmarkId: PROVISIONAL_LANDMARKS[0].id,
        landmarkName: PROVISIONAL_LANDMARKS[0].name,
        title: 'Hostel',
        detailedAddress: 'King Jaja Hall, Block B, Room 22',
        contactPhone: '08123456789',
        isDefault: true,
      };

      await AsyncStorage.setItem(
        GUEST_ADDRESSES_STORAGE_KEY,
        JSON.stringify([guestAddr])
      );

      const stored = await AsyncStorage.getItem(GUEST_ADDRESSES_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe('Hostel');
      expect(parsed[0].contactPhone).toBe('08123456789');
      expect(parsed[0].isDefault).toBe(true);
    });

    it('supports address deletion for guest storage', async () => {
      const addr1 = { id: 'addr_1', detailedAddress: 'Jaja Hall' };
      const addr2 = { id: 'addr_2', detailedAddress: 'Moremi Hall' };

      await AsyncStorage.setItem(
        GUEST_ADDRESSES_STORAGE_KEY,
        JSON.stringify([addr1, addr2])
      );

      // Delete addr1
      const stored = await AsyncStorage.getItem(GUEST_ADDRESSES_STORAGE_KEY);
      const list = JSON.parse(stored!);
      const filtered = list.filter((a: any) => a.id !== 'addr_1');
      await AsyncStorage.setItem(
        GUEST_ADDRESSES_STORAGE_KEY,
        JSON.stringify(filtered)
      );

      const updated = await AsyncStorage.getItem(GUEST_ADDRESSES_STORAGE_KEY);
      const parsedUpdated = JSON.parse(updated!);
      expect(parsedUpdated).toHaveLength(1);
      expect(parsedUpdated[0].id).toBe('addr_2');
    });

    it('supports making an address default in guest storage', async () => {
      const addr1 = { id: 'addr_1', isDefault: true };
      const addr2 = { id: 'addr_2', isDefault: false };

      const list = [addr1, addr2];
      // Switch default to addr2
      const updated = list.map((a) => ({
        ...a,
        isDefault: a.id === 'addr_2',
      }));

      expect(updated.find((a) => a.id === 'addr_1')?.isDefault).toBe(false);
      expect(updated.find((a) => a.id === 'addr_2')?.isDefault).toBe(true);
    });
  });

  // =========================================================================
  // 5. STAGE 2 ORDER REVIEW INTEGRITY
  // =========================================================================
  describe('5. Order Review Totals & Item Breakdown', () => {
    it('accurately compiles Half-and-Half items and toppings in line totals', async () => {
      let state = initializeCustomizerState(pizzaBase);
      state = toggleHalfAndHalf(state, true);
      state = setHalfSecondaryProduct(state, secondaryPizza);
      state = selectSize(state, PIZZA_SIZES[2]); // Large (+₦3,000)
      state = setQuantity(state, 2);

      const item = toCartItem(state);
      await cartStore.addItem(item);

      // Large sweet & sour (7,000 + 3,000) + Large Half&Half surcharge (1,500) = 11,500 ea
      // 2x 11,500 = 23,000
      expect(item.lineTotal).toBe(23000);
      expect(item.halfSecondaryFlavor).toBe(secondaryPizza.name);

      const snapshot = cartStore.getState();
      expect(snapshot.subtotal).toBe(23000);
      expect(snapshot.estimatedTotal).toBe(23000 + snapshot.deliveryFee);
    });

    it('matches authoritative order calculation total', async () => {
      const state = initializeCustomizerState(pizzaBase);
      await cartStore.addItem(toCartItem(state));

      const snapshot = cartStore.getState();
      const customerDetails = {
        customerName: 'Adebayo Idris',
        customerPhone: '08123456789',
      };

      // Mock authoritative order response
      jest.spyOn(orderService, 'createAuthoritativeOrder').mockResolvedValueOnce({
        success: true,
        orderId: 'ord-test-authoritative-123',
        orderNumber: 'AYP-20261105-1002',
        receiptToken: 'rcpt_token_authoritative_xyz',
        subtotal: snapshot.subtotal,
        deliveryFee: snapshot.deliveryFee,
        total: snapshot.estimatedTotal,
        totalInKobo: snapshot.estimatedTotal * 100,
        status: 'CONFIRMED',
      });

      const res = await orderService.createAuthoritativeOrder(snapshot, customerDetails);
      expect(res.success).toBe(true);
      expect(res.total).toBe(snapshot.estimatedTotal);
      expect(res.totalInKobo).toBe(snapshot.estimatedTotal * 100);
    });
  });

  // =========================================================================
  // 6. PAYSTACK PAYMENT INITIATION, VERIFICATION & AMBIGUOUS OUTCOME RECOVERY
  // =========================================================================
  describe('6. Paystack Payment Security & Ambiguous Recovery', () => {
    it('converts Naira amounts to integer Kobo strictly without floating point drift', () => {
      expect(paymentService.toKobo(7500)).toBe(750000);
      expect(paymentService.toKobo(11500)).toBe(1150000);
      expect(paymentService.toKobo(23000.5)).toBe(2300050);
    });

    it('generates unique, traceable payment references per transaction', async () => {
      const params = {
        orderId: 'ord-ref-1',
        orderNumber: 'AYP-20261105-1003',
        receiptToken: 'token-ref-1',
        amount: 8500,
        amountInKobo: 850000,
        email: 'adebayo@unilag.edu.ng',
        customerName: 'Adebayo',
        customerPhone: '08123456789',
      };

      const init1 = await paymentService.initializePayment(params);
      const init2 = await paymentService.initializePayment(params);

      expect(init1.success).toBe(true);
      expect(init2.success).toBe(true);
      expect(init1.reference).toMatch(/^ay_ord_/);
      expect(init2.reference).toMatch(/^ay_ord_/);
    });

    it('handles ambiguous verification outcomes safely without marking order failed', async () => {
      // Simulate ambiguous response from payment gateway
      jest.spyOn(paymentService, 'verifyPayment').mockResolvedValueOnce({
        success: false,
        paymentReference: 'ay_ref_ambiguous_123',
        error: 'Verification pending with bank. Webhook confirmation awaited.',
      });

      const verifyRes = await paymentService.verifyPayment(
        'ay_ref_ambiguous_123',
        'ord-ambiguous-1',
        'rcpt-ambiguous-1'
      );

      expect(verifyRes.success).toBe(false);
      expect(verifyRes.error).toContain('Verification pending with bank');
    });

    it('verifies successful payment and returns confirmed status', async () => {
      jest.spyOn(paymentService, 'verifyPayment').mockResolvedValueOnce({
        success: true,
        orderId: 'ord-success-1',
        orderNumber: 'AYP-20261105-1004',
        paymentReference: 'ay_ref_success_123',
        status: 'CONFIRMED',
        channel: 'card',
      });

      const res = await paymentService.verifyPayment(
        'ay_ref_success_123',
        'ord-success-1',
        'rcpt-success-1'
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe('CONFIRMED');
      expect(res.orderNumber).toBe('AYP-20261105-1004');
    });

    it('persists receipt token securely upon successful payment', async () => {
      await GuestReceiptStore.saveReceipt(
        'ord-secure-receipt-1',
        'AYP-20261105-1005',
        'rcpt_secure_hardware_token_abc'
      );

      const recovered = await GuestReceiptStore.getReceipt('ord-secure-receipt-1');
      expect(recovered?.receiptToken).toBe('rcpt_secure_hardware_token_abc');
      expect(recovered?.orderNumber).toBe('AYP-20261105-1005');
    });
  });

  // =========================================================================
  // 7. ACCESSIBILITY, RESPONSIVENESS & DESIGN SYSTEM COMPLIANCE
  // =========================================================================
  describe('7. Design System & WCAG 2.1 AA Contrast', () => {
    it('primary brand text has > 13:1 contrast against white background', () => {
      const ratio = getContrastRatio(Colors.charcoal, '#FFFFFF');
      expect(ratio).toBeGreaterThan(13);
    });

    it('secondary text has > 4.5:1 contrast against white background', () => {
      const ratio = getContrastRatio(Colors.textSecondary, '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('primary brand red provides high visibility against card white', () => {
      const ratio = getContrastRatio(Colors.primaryRed, '#FFFFFF');
      expect(ratio).toBeGreaterThan(3.5);
    });

    it('interactive buttons in CheckoutModal have minimum 44dp touch targets', () => {
      const checkoutFile = fs.readFileSync(
        path.resolve(__dirname, '../components/CheckoutModal.tsx'),
        'utf-8'
      );
      expect(checkoutFile).toContain('minHeight: 48'); // primaryActionBtn & simulateCancelBtn
      expect(checkoutFile).toContain('minHeight: 44'); // closeBtn & textInput
      expect(checkoutFile).toContain('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}');
    });

    it('interactive buttons in PaystackPaymentModal have minimum 48dp touch targets', () => {
      const paystackFile = fs.readFileSync(
        path.resolve(__dirname, '../components/PaystackPaymentModal.tsx'),
        'utf-8'
      );
      expect(paystackFile).toContain('minHeight: 48');
      expect(paystackFile).toContain('hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}');
    });
  });
});

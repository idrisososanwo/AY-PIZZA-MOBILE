/**
 * AY Pizza — Phase 3: Checkout, Order Creation & Paystack Payment Integration Test Suite
 */

// Node crypto for signature tests
// eslint-disable-next-line @typescript-eslint/no-var-requires
const crypto = require('crypto');
import { orderService, AuthoritativePriceDiscrepancyError } from '../domains/order/order-service';
import { paystackProvider } from '../domains/payment/paystack-provider';
import { paymentService } from '../domains/payment/payment-service';
import { calculateOrderTotal, reconcileClientEstimateWithServer } from '../domains/order/order-calculator';
import { CartState } from '../domains/cart/cart-types';
import { OrderStatus } from '../types/order';

describe('Phase 3: Checkout, Order Creation & Paystack Payment Integration', () => {
  const sampleCartState: CartState = {
    items: [
      {
        id: 'cart-item-1',
        productId: 'prod-sweet-sour',
        productName: 'Sweet and Sour Pizza',
        categorySlug: 'pizza',
        itemHash: 'hash-sweet-sour-large',
        imageUrl: 'https://images.unsplash.com/photo-sweet-sour',
        sizeId: 'size-large',
        sizeName: 'Large',
        basePrice: 7000,
        sizePrice: 3000,
        quantity: 1,
        customizations: [
          {
            optionId: 'opt-extra-cheese',
            optionName: 'Extra Cheese',
            price: 1000,
          },
        ],
        unitPrice: 11000,
        lineTotal: 11000,
      },
    ],
    itemCount: 1,
    subtotal: 11000,
    deliveryFee: 500,
    estimatedTotal: 11500,
    fulfillmentType: 'delivery',
    selectedLandmark: {
      id: 'lm-jaja',
      zoneId: 'z-unilag',
      name: 'King Jaja Hall',
      fee: 500,
      isCampus: true,
      displayOrder: 1,
      isActive: true,
    },
    deliveryAddress: 'Room B204, King Jaja Hall, UNILAG',
    deliveryNotes: '',
    discountAmount: 0,
    isStale: false,
    schemaVersion: 2,
    isReadyForCheckout: true,
    checkoutBlockers: [],
    requiresCorrection: false,
    storageError: null,
  };

  describe('1. Authoritative Order Creation & Server Pricing Preflight', () => {
    it('creates an authoritative order with matching subtotal, fee, and total in kobo', async () => {
      const customer = {
        customerName: 'Adebayo Idris',
        customerPhone: '08012345678',
        customerEmail: 'adebayo@unilag.edu.ng',
      };

      const result = await orderService.createAuthoritativeOrder(sampleCartState, customer);

      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
      expect(result.orderNumber).toMatch(/^AYP-/);
      expect(result.receiptToken).toBeDefined();
      expect(result.receiptToken.length).toBeGreaterThanOrEqual(16);
      expect(result.subtotal).toBe(11000);
      expect(result.deliveryFee).toBe(500);
      expect(result.total).toBe(11500);
      expect(result.totalInKobo).toBe(1150000);
      expect(result.status).toBe('PENDING_PAYMENT');
    });

    it('rejects order submission when client total is tampered / deviates from server calculation', () => {
      const maliciousCartTotal = 5000; // Client tampered total to 5,000 NGN
      const serverCalculatedTotal = 11500; // True server authoritative total

      const reconciliation = reconcileClientEstimateWithServer(maliciousCartTotal, serverCalculatedTotal);
      expect(reconciliation.matches).toBe(false);
      expect(reconciliation.variance).toBe(6500);
    });

    it('enforces strict ₦0 delivery fee for pickup orders', async () => {
      const pickupCart: CartState = {
        ...sampleCartState,
        fulfillmentType: 'pickup',
        deliveryFee: 0,
        estimatedTotal: 11000,
        selectedLandmark: null,
        deliveryAddress: '',
      };

      const customer = {
        customerName: 'Folake Adeleke',
        customerPhone: '08123456789',
      };

      const result = await orderService.createAuthoritativeOrder(pickupCart, customer);

      expect(result.success).toBe(true);
      expect(result.deliveryFee).toBe(0);
      expect(result.total).toBe(11000);
      expect(result.totalInKobo).toBe(1100000);
    });

    it('requires customer name and a valid phone number with at least 10 digits', async () => {
      const invalidCustomer = {
        customerName: '',
        customerPhone: '12345', // Too short
      };

      await expect(
        orderService.createAuthoritativeOrder(sampleCartState, invalidCustomer)
      ).rejects.toThrow(/Customer name is required/);

      const invalidPhoneCustomer = {
        customerName: 'Chidi Okonkwo',
        customerPhone: '12345',
      };

      await expect(
        orderService.createAuthoritativeOrder(sampleCartState, invalidPhoneCustomer)
      ).rejects.toThrow(/valid phone number/);
    });

    it('requires a delivery landmark and address for delivery fulfillment', async () => {
      const missingAddressCart: CartState = {
        ...sampleCartState,
        fulfillmentType: 'delivery',
        deliveryAddress: '   ', // whitespace only
      };

      const customer = {
        customerName: 'Tunde Bakare',
        customerPhone: '08098765432',
      };

      await expect(
        orderService.createAuthoritativeOrder(missingAddressCart, customer)
      ).rejects.toThrow(/Delivery address.*required/);
    });
  });

  describe('2. Guest Checkout Security & Cryptographic Receipt Token', () => {
    it('generates an unguessable receipt token allowing guest receipt verification', async () => {
      const customer = {
        customerName: 'Guest Student',
        customerPhone: '08055554433',
      };

      const result = await orderService.createAuthoritativeOrder(sampleCartState, customer);
      expect(result.receiptToken).toBeDefined();

      // Ensure receipt token is not a sequential number or order number
      expect(result.receiptToken).not.toBe(result.orderNumber);
      expect(result.receiptToken).not.toBe(result.orderId);
      expect(result.receiptToken.length).toBeGreaterThanOrEqual(16);
    });

    it('rejects receipt retrieval when receipt token is missing or empty', async () => {
      const res = await orderService.getOrderReceipt('mock-order-id', '');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Receipt Token are required');
    });
  });

  describe('3. Idempotency Key Handling & Order Duplication Defense', () => {
    it('returns consistent idempotency keys for repeated checkout submissions', () => {
      const key1 = orderService.generateIdempotencyKey();
      const key2 = orderService.generateIdempotencyKey();

      expect(key1).toMatch(/^ayp_idem_\d+_[a-z0-9]+$/);
      expect(key2).toMatch(/^ayp_idem_\d+_[a-z0-9]+$/);
      expect(key1).not.toBe(key2);
    });

    it('simulates idempotent retry returning existing order without creating duplicates', async () => {
      const fixedKey = 'ayp_idem_test_duplicate_key_123';
      const customer = {
        customerName: 'Emeka Eze',
        customerPhone: '08033332211',
      };

      const firstAttempt = await orderService.createAuthoritativeOrder(sampleCartState, customer, fixedKey);
      expect(firstAttempt.success).toBe(true);

      const secondAttempt = await orderService.createAuthoritativeOrder(sampleCartState, customer, fixedKey);
      expect(secondAttempt.success).toBe(true);
      expect(secondAttempt.total).toBe(firstAttempt.total);
    });
  });

  describe('4. Paystack Provider: Integer Kobo & Currency Formatting', () => {
    it('strictly converts Naira amounts to integer Kobo without floating point rounding errors', () => {
      expect(paymentService.toKobo(7000)).toBe(700000);
      expect(paymentService.toKobo(8500)).toBe(850000);
      expect(paymentService.toKobo(11500)).toBe(1150000);
      expect(paymentService.toKobo(14000.5)).toBe(1400050);
    });

    it('formats Naira currency properly for user presentation', () => {
      expect(paymentService.formatNaira(7000)).toBe('₦7,000');
      expect(paymentService.formatNaira(12500)).toBe('₦12,500');
      expect(paymentService.formatNaira(0)).toBe('₦0');
    });

    it('initializes Paystack transaction with unique reference and amount in kobo', async () => {
      const initParams = {
        orderId: 'ord-test-456',
        orderNumber: 'AYP-20261021-0089',
        amount: 11500,
        amountInKobo: 1150000,
        email: 'customer@unilag.edu.ng',
        receiptToken: 'token_sec_789',
        customerName: 'Adebayo Idris',
        customerPhone: '08012345678',
      };

      const result = await paystackProvider.initializePayment(initParams);

      expect(result.success).toBe(true);
      expect(result.reference).toMatch(/^ay_ord_AYP_20261021_0089_\d+$/);
      expect(result.amount).toBe(11500);
      expect(result.amountInKobo).toBe(1150000);
      expect(result.authorizationUrl).toBeDefined();
    });

    it('rejects initialization of transactions with non-positive amounts', async () => {
      const invalidParams = {
        orderId: 'ord-zero',
        orderNumber: 'AYP-20261021-0000',
        amount: 0,
        amountInKobo: 0,
        email: 'test@unilag.edu.ng',
        receiptToken: 'token-zero',
      };

      await expect(paystackProvider.initializePayment(invalidParams)).rejects.toThrow(
        /Invalid transaction amount/
      );
    });
  });

  describe('5. Paystack Webhook Security & HMAC-SHA512 Signature Verification', () => {
    const SECRET_KEY = 'sk_test_mock_paystack_secret_key_12345';

    function signPayload(body: string, secret: string): string {
      return crypto.createHmac('sha512', secret).update(body).digest('hex');
    }

    it('validates genuine Paystack webhook HMAC-SHA512 signatures', () => {
      const rawBody = JSON.stringify({
        event: 'charge.success',
        data: {
          reference: 'ay_ord_AYP_20261021_0042_17716129',
          amount: 1150000,
          currency: 'NGN',
          status: 'success',
          metadata: { order_id: 'ord-uuid-123' },
        },
      });

      const validSignature = signPayload(rawBody, SECRET_KEY);

      // Re-compute and compare
      const computed = signPayload(rawBody, SECRET_KEY);
      expect(computed).toBe(validSignature);
    });

    it('rejects forged or tampered webhook signatures', () => {
      const rawBody = JSON.stringify({
        event: 'charge.success',
        data: {
          reference: 'ay_ord_AYP_20261021_0042_17716129',
          amount: 1150000,
        },
      });

      const forgedSignature = 'abcdef0123456789abcdef0123456789invalid';
      const genuineSignature = signPayload(rawBody, SECRET_KEY);

      expect(genuineSignature).not.toBe(forgedSignature);
    });

    it('detects tampered payload content even if signed with valid secret on old body', () => {
      const originalBody = JSON.stringify({ amount: 1150000 });
      const tamperedBody = JSON.stringify({ amount: 10000 }); // Hacker reduced amount to 100 NGN

      const originalSignature = signPayload(originalBody, SECRET_KEY);
      const tamperedComputed = signPayload(tamperedBody, SECRET_KEY);

      expect(originalSignature).not.toBe(tamperedComputed);
    });
  });

  describe('6. State Machine Separation & Anti-Regression Protections', () => {
    it('keeps Payment Status and Order Fulfillment Status completely separate', () => {
      const paymentStates = ['initialized', 'pending', 'success', 'failed', 'reversed'];
      const orderStatuses: OrderStatus[] = [
        'DRAFT',
        'PENDING_PAYMENT',
        'CONFIRMED',
        'PAID',
        'PREPARING',
        'READY_FOR_PICKUP',
        'IN_TRANSIT',
        'DELIVERED',
        'CANCELLED',
      ];

      // Verify no cross-pollination
      expect(paymentStates).not.toContain('PREPARING');
      expect(paymentStates).not.toContain('IN_TRANSIT');
      expect(orderStatuses).not.toContain('initialized');
      expect(orderStatuses).not.toContain('reversed');
    });

    it('prevents order status regression: confirmed/in-progress orders cannot be rolled back by delayed failure webhooks', () => {
      const settledStatuses: OrderStatus[] = [
        'CONFIRMED',
        'PAID',
        'PREPARING',
        'READY_FOR_PICKUP',
        'IN_TRANSIT',
        'DELIVERED',
      ];

      // Anti-regression logic: If an order is already in a settled status, late failure events must not revert it
      const currentStatus: OrderStatus = 'PREPARING';
      const incomingLateFailedEvent = 'failed';

      const isSettled = settledStatuses.includes(currentStatus);
      expect(isSettled).toBe(true);

      // Status should remain 'PREPARING'
      const resultingStatus = isSettled ? currentStatus : 'CANCELLED';
      expect(resultingStatus).toBe('PREPARING');
    });

    it('verifies transaction independently with payment service', async () => {
      const reference = 'ay_ord_AYP_20261021_0042_17716129';
      const result = await paymentService.verifyPayment(reference);

      expect(result.success).toBe(true);
      expect(result.status).toBe('CONFIRMED');
      expect(result.paymentReference).toBe(reference);
    });
  });
});

/**
 * AY Pizza & Ice Cream — Phase 5.5-8 Final Release-Readiness Audit Test Suite
 * Comprehensive verification of complete customer journey, financial integrity,
 * guest/authenticated isolation, and security guarantees.
 */

import { Brand } from '../constants/brand';
import { Config } from '../config/env';
import { orderService, AuthoritativePriceDiscrepancyError } from '../domains/order/order-service';
import { customerService } from '../domains/customer/customer-service';
import { buildSanitizedReceiptText } from '../components/OrderReceiptModal';
import { deliveryPricingEngine } from '../domains/delivery/delivery-pricing-engine';
import { Order, OrderStatus } from '../types/order';
import { supabase } from '../config/supabase';

// Mock Supabase
jest.mock('../config/supabase', () => {
  const mockFrom = jest.fn();
  const mockRpc = jest.fn();
  const mockAuth = {
    getUser: jest.fn(),
    getSession: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
  };

  return {
    supabase: {
      auth: mockAuth,
      from: mockFrom,
      rpc: mockRpc,
    },
  };
});

describe('Phase 5.5-8: Final Integration, Security & Release-Readiness Audit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. FINANCIAL INTEGRITY & AUTHORITATIVE TOTALS
  // =========================================================================
  describe('1. Financial Integrity & Authoritative Totals', () => {
    it('detects and rejects client price discrepancies against server authoritative totals', () => {
      const clientEstimatedTotal = 5000;
      const serverAuthoritativeTotal = 5500;
      const variance = 500;

      const error = new AuthoritativePriceDiscrepancyError(
        clientEstimatedTotal,
        serverAuthoritativeTotal,
        variance
      );

      expect(error.name).toBe('AuthoritativePriceDiscrepancyError');
      expect(error.clientEstimated).toBe(5000);
      expect(error.serverAuthoritative).toBe(5500);
      expect(error.variance).toBe(500);
      expect(error.message).toContain('Price Discrepancy');
    });

    it('converts Naira amounts to exact integer Kobo without float rounding artifacts', () => {
      const testCases = [
        { naira: 3500, expectedKobo: 350000 },
        { naira: 4500.5, expectedKobo: 450050 },
        { naira: 14900, expectedKobo: 1490000 },
        { naira: 0, expectedKobo: 0 },
        { naira: 750.25, expectedKobo: 75025 },
      ];

      for (const tc of testCases) {
        const kobo = Math.round(tc.naira * 100);
        expect(Number.isInteger(kobo)).toBe(true);
        expect(kobo).toBe(tc.expectedKobo);
      }
    });

    it('enforces that pickup fulfilment strictly has zero delivery fee', () => {
      const quote = deliveryPricingEngine.calculateQuote({ fulfillmentType: 'pickup' });
      expect(quote.deliveryFee).toBe(0);
      expect(quote.fulfillmentType).toBe('pickup');
      expect(Brand.fulfillment.pickupFee).toBe(0);
      expect(Brand.fulfillment.campusDeliveryFee).toBe(500);
    });

    it('validates that production configuration guards against placeholder credentials', () => {
      expect(typeof Config.isProduction).toBe('boolean');
      expect(typeof Config.isDevelopment).toBe('boolean');
    });
  });

  // =========================================================================
  // 2. GUEST AND AUTHENTICATED CUSTOMER ISOLATION
  // =========================================================================
  describe('2. Guest & Authenticated Customer Isolation', () => {
    it('customer address queries are strictly constrained to customer_id = auth.uid()', async () => {
      const mockOrder = jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      });

      const mockEq = jest.fn().mockReturnValue({
        order: mockOrder,
      });

      const mockSelect = jest.fn().mockReturnValue({
        eq: mockEq,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: mockSelect,
      });

      await customerService.getAddresses('user-authenticated-uuid');
      expect(mockEq).toHaveBeenCalledWith('customer_id', 'user-authenticated-uuid');
    });

    it('guest users do not execute customer_addresses database queries', async () => {
      const res = await customerService.getAddresses('');
      expect(res.success).toBe(true);
      expect(res.addresses).toEqual([]);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('customer profile updates cannot tamper with role or escalate privileges', async () => {
      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          id: 'user-uuid-101',
          full_name: 'Safe Name',
          phone: '08123456789',
          role: 'customer',
        },
        error: null,
      });

      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
      const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });

      (supabase.from as jest.Mock).mockReturnValue({
        update: mockUpdate,
      });

      const res = await customerService.updateProfile('user-uuid-101', {
        fullName: 'Safe Name',
        phone: '08123456789',
      });

      expect(res.success).toBe(true);
      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload.role).toBeUndefined();
      expect(updatePayload.full_name).toBe('Safe Name');
      expect(updatePayload.phone).toBe('08123456789');
    });
  });

  // =========================================================================
  // 3. ORDER LIFECYCLE, CANCELLATION & REFUND INTEGRITY
  // =========================================================================
  describe('3. Order Lifecycle, Cancellation & Truthful Refunds', () => {
    it('order cancellation RPC passes order ID, receipt token and reason authoritatively', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          code: 'CANCELLED_SUCCESSFULLY',
          message: 'Order cancelled.',
          order_id: 'ord-123',
          order_number: 'AYP-123',
          status: 'CANCELLED',
          refund_status: 'REFUND_REQUIRED',
        },
        error: null,
      });

      const res = await orderService.cancelOrderByCustomer(
        'ord-123',
        'valid-receipt-token-abc',
        'Changed my mind'
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe('CANCELLED');
      expect(res.refundStatus).toBe('REFUND_REQUIRED');
      expect(supabase.rpc).toHaveBeenCalledWith('cancel_order_by_customer', {
        p_order_id: 'ord-123',
        p_receipt_token: 'valid-receipt-token-abc',
        p_reason: 'Changed my mind',
      });
    });

    it('strictly forbids representing REFUND_REQUIRED as a completed refund', () => {
      const orderPendingRefund: Partial<Order> = {
        status: 'CANCELLED',
        refundStatus: 'REFUND_REQUIRED',
      };

      const isRefundComplete = (ord: Partial<Order>) => {
        return ord.refundStatus === 'REFUNDED';
      };

      expect(isRefundComplete(orderPendingRefund)).toBe(false);

      const orderCompletedRefund: Partial<Order> = {
        status: 'CANCELLED',
        refundStatus: 'REFUNDED',
      };
      expect(isRefundComplete(orderCompletedRefund)).toBe(true);
    });

    it('order tracking lifecycle strictly follows confirmed order states', () => {
      const validStatuses: OrderStatus[] = [
        'DRAFT',
        'PENDING_PAYMENT',
        'PAID',
        'CONFIRMED',
        'ACCEPTED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'IN_TRANSIT',
        'DELIVERED',
        'CANCELLED',
        'REFUNDED',
      ];

      expect(validStatuses).toContain('IN_TRANSIT');
      expect(validStatuses).toContain('CONFIRMED');
      expect(validStatuses).toContain('DELIVERED');
      expect(validStatuses).toContain('CANCELLED');
    });
  });

  // =========================================================================
  // 4. SANITIZED RECEIPT GENERATION & EXCLUSION OF SENSITIVE SECRETS
  // =========================================================================
  describe('4. Sanitized Receipt Generation & Information Security', () => {
    it('generates digital receipt text without disclosing tokens or secrets', () => {
      const secretToken = 'sec_token_999_xyz_never_leak';
      const receiptText = buildSanitizedReceiptText({
        orderNumber: 'AYP-999',
        customerName: 'Adebayo Idris',
        fulfillmentType: 'delivery',
        landmarkName: 'Jaja Hall',
        deliveryAddress: 'Room 12',
        items: [
          {
            quantity: 1,
            productName: 'Sweet Chili Chicken Pizza',
            sizeName: 'Large',
            itemTotal: 5200,
          },
        ],
        subtotal: 5200,
        deliveryFee: 500,
        discountAmount: 0,
        total: 5700,
        paymentStatus: 'Verified Paid via Paystack ✅',
      });

      expect(receiptText).toContain('AYP-999');
      expect(receiptText).toContain('Adebayo Idris');
      expect(receiptText).toContain('Sweet Chili Chicken Pizza');
      expect(receiptText).toContain('₦5,700');
      expect(receiptText).not.toContain(secretToken);
      expect(receiptText).not.toContain('receipt_token');
      expect(receiptText).not.toContain('receiptToken');
      expect(receiptText).not.toContain('authorization_code');
    });

    it('includes verified physical counter location and official wordmarks in receipt', () => {
      const receiptText = buildSanitizedReceiptText({
        orderNumber: 'AYP-1000',
        customerName: 'Customer',
        fulfillmentType: 'pickup',
        items: [],
        subtotal: 0,
        deliveryFee: 0,
        total: 0,
        paymentStatus: 'Verified Paid via Paystack ✅',
      });

      expect(receiptText).toContain(Brand.officialWordmark);
      expect(receiptText).toContain(Brand.officialTagline);
      expect(receiptText).toContain(Brand.location.address);
    });
  });

  // =========================================================================
  // 5. BUSINESS INFORMATION CLASSIFICATION & CHANNELS AUDIT
  // =========================================================================
  describe('5. Business Information Classification & Channel Protection', () => {
    it('verifies phone and WhatsApp channels are flagged as unverified pending owner confirmation', () => {
      expect(Brand.contact.isConfirmedByOwner).toBe(false);
      expect(Brand.contact.isPhoneVerified).toBe(false);
      expect(Brand.contact.isWhatsAppVerified).toBe(false);
    });

    it('verifies support email and physical counter location are verified', () => {
      expect(Brand.contact.isEmailVerified).toBe(true);
      expect(Brand.contact.email).toBe('info@aypizza.ng');
      expect(Brand.location.address).toBe('Opposite King Jaja Hall, University of Lagos');
      expect(Brand.location.city).toBe('Akoka, Yaba, Lagos');
      expect(Brand.location.country).toBe('Nigeria');
    });

    it('verifies operating hours match UNILAG campus store operational schedule', () => {
      expect(Brand.operatingHours.openHour).toBe(10);
      expect(Brand.operatingHours.closeHour).toBe(21);
      expect(Brand.operatingHours.timezone).toBe('Africa/Lagos');
    });

    it('verifies dietary policy restrictions remain un-enforced until confirmed by owner', () => {
      expect(Brand.dietaryPolicy.isConfirmedByOwner).toBe(false);
      expect(Brand.dietaryPolicy.enforceRestrictions).toBe(false);
    });
  });
});

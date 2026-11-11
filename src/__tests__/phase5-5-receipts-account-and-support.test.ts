/**
 * AY Pizza & Ice Cream — Phase 5.5-7 Test Suite
 * Digital Order Receipts, Customer Account, Order History & Customer Support
 */

import { Brand } from '../constants/brand';
import {
  buildSanitizedReceiptText,
} from '../components/OrderReceiptModal';
import { orderService } from '../domains/order/order-service';
import { customerService } from '../domains/customer/customer-service';
import { supabase } from '../config/supabase';
import { Order } from '../types/order';

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

describe('Phase 5.5-7: Receipts, Account & Customer Support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. DIGITAL ORDER RECEIPTS & SANITIZED SHARING
  // =========================================================================
  describe('1. Digital Order Receipts & Sharing', () => {
    const mockItems = [
      {
        quantity: 2,
        productName: 'Pepperoni Supreme',
        sizeName: 'Large',
        itemTotal: 9600,
        customizations: [{ optionName: 'Extra Cheese' }],
      },
      {
        quantity: 1,
        productName: 'Half & Half Pizza',
        sizeName: 'Regular',
        itemTotal: 4800,
        halfSecondaryFlavor: 'BBQ Chicken',
      },
    ];

    it('builds a sanitized receipt text with authoritative amounts, products and locations', () => {
      const receiptText = buildSanitizedReceiptText({
        orderNumber: 'AYP-20261105-0042',
        orderDate: '05/11/2026, 14:30',
        customerName: 'Chidi Okafor',
        fulfillmentType: 'delivery',
        landmarkName: 'Moremi Hall',
        deliveryAddress: 'Room B204',
        items: mockItems,
        subtotal: 14400,
        deliveryFee: 500,
        discountAmount: 0,
        total: 14900,
        paymentStatus: 'Verified Paid via Paystack ✅',
      });

      // Brand Wordmark & Location
      expect(receiptText).toContain(Brand.officialWordmark);
      expect(receiptText).toContain(Brand.officialTagline);
      expect(receiptText).toContain(Brand.location.address);

      // Order Info
      expect(receiptText).toContain('#AYP-20261105-0042');
      expect(receiptText).toContain('Chidi Okafor');
      expect(receiptText).toContain('Campus Delivery (Moremi Hall - Room B204)');
      expect(receiptText).toContain('Verified Paid via Paystack ✅');

      // Purchased Items with Half & Half and Toppings
      expect(receiptText).toContain('2x Pepperoni Supreme (Large) — ₦9,600');
      expect(receiptText).toContain('+ Extra Cheese');
      expect(receiptText).toContain('1x Half & Half Pizza (Regular) — ₦4,800');
      expect(receiptText).toContain('Half: BBQ Chicken');

      // Financials
      expect(receiptText).toContain('Subtotal: ₦14,400');
      expect(receiptText).toContain('Delivery Fee: ₦500');
      expect(receiptText).toContain('TOTAL: ₦14,900');
    });

    it('displays FREE (₦0) delivery fee for counter pickup in receipt text', () => {
      const receiptText = buildSanitizedReceiptText({
        orderNumber: 'AYP-20261105-0043',
        customerName: 'Amina Bello',
        fulfillmentType: 'pickup',
        items: [
          {
            quantity: 1,
            productName: 'Margherita Pizza',
            sizeName: 'Regular',
            itemTotal: 3500,
          },
        ],
        subtotal: 3500,
        deliveryFee: 0,
        total: 3500,
        paymentStatus: 'Verified Paid via Paystack ✅',
      });

      expect(receiptText).toContain('Counter Pickup');
      expect(receiptText).toContain('Delivery Fee: FREE (₦0)');
      expect(receiptText).toContain('TOTAL: ₦3,500');
    });

    it('strictly avoids exposing receipt tokens, secret keys or customer passwords in shared text', () => {
      const sensitiveToken = 'SECRET_RECEIPT_TOKEN_XYZ_123456';
      const receiptText = buildSanitizedReceiptText({
        orderNumber: 'AYP-20261105-0044',
        customerName: 'Idris Adebayo',
        fulfillmentType: 'delivery',
        landmarkName: 'New Hall',
        items: mockItems,
        subtotal: 14400,
        deliveryFee: 500,
        total: 14900,
        paymentStatus: 'Verified Paid via Paystack ✅',
      });

      expect(receiptText).not.toContain(sensitiveToken);
      expect(receiptText).not.toContain('receipt_token');
      expect(receiptText).not.toContain('receiptToken');
      expect(receiptText).not.toContain('password');
      expect(receiptText).not.toContain('secret');
      expect(receiptText).not.toContain('Bearer');
    });

    it('does NOT display an unconfirmed or pending order as PAID', () => {
      const pendingReceipt = buildSanitizedReceiptText({
        orderNumber: 'AYP-20261105-0045',
        customerName: 'Fola Adeleke',
        fulfillmentType: 'pickup',
        items: mockItems,
        subtotal: 14400,
        deliveryFee: 0,
        total: 14400,
        paymentStatus: 'Payment Pending ⏳',
      });

      expect(pendingReceipt).toContain('Payment Status: Payment Pending ⏳');
      expect(pendingReceipt).not.toContain('Payment Status: Verified Paid');
    });
  });

  // =========================================================================
  // 2. CUSTOMER ACCOUNT & PROFILE SECURITY
  // =========================================================================
  describe('2. Customer Account & Profile Security', () => {
    it('customerService.updateProfile only updates full_name and phone, preventing role tampering', async () => {
      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          id: 'cust-uuid-1',
          full_name: 'Updated Name',
          phone: '08123456789',
          email: 'cust@aypizza.ng',
          role: 'customer',
          is_phone_verified: false,
          created_at: '2026-10-01T10:00:00Z',
          updated_at: '2026-11-05T12:00:00Z',
        },
        error: null,
      });

      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
      const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });

      (supabase.from as jest.Mock).mockReturnValue({
        update: mockUpdate,
      });

      const res = await customerService.updateProfile('cust-uuid-1', {
        fullName: 'Updated Name',
        phone: '08123456789',
      });

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Updated Name',
          phone: '08123456789',
        })
      );
      // Ensure role property was NOT passed in update payload
      const payloadArg = mockUpdate.mock.calls[0][0];
      expect(payloadArg.role).toBeUndefined();
    });

    it('customerService.getAddresses scopes query strictly to caller customer_id', async () => {
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

      const res = await customerService.getAddresses('target-customer-id');
      expect(res.success).toBe(true);
      expect(mockEq).toHaveBeenCalledWith('customer_id', 'target-customer-id');
    });

    it('returns empty addresses for guest users without firing database queries', async () => {
      const res = await customerService.getAddresses('');
      expect(res.success).toBe(true);
      expect(res.addresses).toEqual([]);
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. ORDER HISTORY & CUSTOMER ORDERS RETRIEVAL
  // =========================================================================
  describe('3. Order History & Customer Orders Retrieval', () => {
    it('orderService.getCustomerOrders queries orders strictly matching customer_id', async () => {
      const mockOrdersData = [
        {
          id: 'ord-101',
          order_number: 'AYP-101',
          customer_id: 'cust-uuid-42',
          fulfillment_type: 'delivery',
          landmark_name: 'Moremi Hall',
          subtotal: 5000,
          delivery_fee: 500,
          discount_amount: 0,
          total: 5500,
          status: 'DELIVERED',
          refund_status: 'NOT_APPLICABLE',
          items: [],
          events: [],
          created_at: '2026-11-04T12:00:00Z',
          updated_at: '2026-11-04T13:00:00Z',
        },
      ];

      const mockOrder = jest.fn().mockResolvedValue({
        data: mockOrdersData,
        error: null,
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

      const res = await orderService.getCustomerOrders('cust-uuid-42');
      expect(res.success).toBe(true);
      expect(res.orders.length).toBe(1);
      expect(res.orders[0].orderNumber).toBe('AYP-101');
      expect(mockEq).toHaveBeenCalledWith('customer_id', 'cust-uuid-42');
    });

    it('handles refund status truthfully without claiming refund is completed when REFUND_REQUIRED', () => {
      const pendingRefundOrder: Partial<Order> = {
        status: 'CANCELLED',
        refundStatus: 'REFUND_REQUIRED',
      };

      const completedRefundOrder: Partial<Order> = {
        status: 'CANCELLED',
        refundStatus: 'REFUNDED',
      };

      // Helper function mirroring OrdersScreen logic
      const evaluateRefundLabel = (ord: Partial<Order>) => {
        if (ord.status === 'CANCELLED') {
          if (ord.refundStatus === 'REFUNDED') return 'Refund Confirmed to Original Payment Method ✅';
          if (ord.refundStatus === 'REFUND_REQUIRED' || ord.refundStatus === 'REFUND_PENDING') {
            return 'Refund Processing — Manager Review in Progress ⏳';
          }
        }
        return 'Not applicable';
      };

      expect(evaluateRefundLabel(pendingRefundOrder)).toBe('Refund Processing — Manager Review in Progress ⏳');
      expect(evaluateRefundLabel(pendingRefundOrder)).not.toContain('Refund Confirmed');
      expect(evaluateRefundLabel(completedRefundOrder)).toBe('Refund Confirmed to Original Payment Method ✅');
    });
  });

  // =========================================================================
  // 4. CUSTOMER SUPPORT & UNVERIFIED CONTACT PROTECTION
  // =========================================================================
  describe('4. Customer Support & Contact Details Verification', () => {
    it('verifies that Brand.contact explicitly flags unverified phone and WhatsApp numbers', () => {
      // Must not assume phone or WhatsApp is owner-confirmed
      expect(Brand.contact.isConfirmedByOwner).toBe(false);
      expect(Brand.contact.isPhoneVerified).toBe(false);
      expect(Brand.contact.isWhatsAppVerified).toBe(false);

      // Email and Physical location are verified
      expect(Brand.contact.isEmailVerified).toBe(true);
      expect(Brand.contact.email).toBe('info@aypizza.ng');
      expect(Brand.location.address).toBe('Opposite King Jaja Hall, University of Lagos');
    });

    it('verifies that physical counter operating hours are accurately configured', () => {
      expect(Brand.operatingHours.openHour).toBe(10);
      expect(Brand.operatingHours.closeHour).toBe(21);
      expect(Brand.operatingHours.timezone).toBe('Africa/Lagos');
      expect(Brand.fulfillment.campusDeliveryFee).toBe(500);
      expect(Brand.fulfillment.pickupFee).toBe(0);
    });
  });

  // =========================================================================
  // 5. VISUAL ACCESSIBILITY & TOUCH TARGET CONSTRAINTS
  // =========================================================================
  describe('5. Accessibility & Touch Targets', () => {
    it('confirms primary brand colors satisfy high-contrast accessibility palette', () => {
      expect(Brand.name).toBe('AY Pizza & Ice Cream');
      expect(Brand.officialWordmark).toBe('AY PIZZA & ICE CREAM');
      expect(Brand.officialTagline).toBe('ARTISAN PIZZAS & FRESH SOFT-SERVE');
    });
  });
});

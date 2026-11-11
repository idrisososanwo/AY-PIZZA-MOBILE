/**
 * AY PIZZA & ICE CREAM — PHASE 6.0.5.1: CUSTOMER CANCELLATION ELIGIBILITY ALIGNMENT TESTS
 *
 * Verifies that the customer-facing Cancel Order action across all screens:
 * - OrderReceiptModal
 * - OrdersScreen
 * - OrderTrackingModal
 * is strictly visible ONLY when the known authoritative order status is CONFIRMED,
 * and is hidden for:
 * - PAID
 * - ACCEPTED
 * - PREPARING
 * - READY_FOR_PICKUP
 * - IN_TRANSIT
 * - DELIVERED
 * - CANCELLED
 * - Unknown, missing, or still-hydrating status.
 */

import React from 'react';
import { OrderReceiptModal, OrderReceiptModalProps } from '../components/OrderReceiptModal';
import { OrdersScreen } from '../components/OrdersScreen';
import { OrderTrackingModal } from '../components/OrderTrackingModal';
import { Order, OrderStatus } from '../types/order';

// Mock Supabase
jest.mock('../config/supabase', () => ({
  supabase: {
    auth: {
      signOut: jest.fn().mockResolvedValue({ error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-user-123' } }, error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
    rpc: jest.fn(),
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    }),
    removeChannel: jest.fn(),
  },
}));

// Mock expo-device to simulate physical device
jest.mock('expo-device', () => ({
  isDevice: true,
}));

// Mock GuestReceiptStore
jest.mock('../domains/order/guest-receipt-store', () => ({
  GuestReceiptStore: {
    getReceipt: jest.fn().mockResolvedValue(null),
    getAllReceipts: jest.fn().mockResolvedValue([]),
    saveReceipt: jest.fn().mockResolvedValue(undefined),
  },
}));

beforeAll(() => {
  jest.spyOn(React, 'useState').mockImplementation(((initial: any) => [
    typeof initial === 'function' ? initial() : initial,
    jest.fn(),
  ]) as any);
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  jest.spyOn(React, 'useCallback').mockImplementation(((cb: any) => cb) as any);
});

afterAll(() => {
  jest.restoreAllMocks();
});

function findByTestId(node: any, testID: string): any {
  if (!node) return null;
  if (node.props?.testID === testID) return node;
  if (Array.isArray(node)) {
    for (const child of node) {
      const res = findByTestId(child, testID);
      if (res) return res;
    }
  }
  if (node.props?.children) {
    if (Array.isArray(node.props.children)) {
      for (const child of node.props.children) {
        const res = findByTestId(child, testID);
        if (res) return res;
      }
    } else {
      return findByTestId(node.props.children, testID);
    }
  }
  return null;
}

function findTextContent(node: any, text: string): boolean {
  if (!node) return false;
  if (typeof node === 'string' && node.includes(text)) return true;
  if (node.props?.children) {
    if (typeof node.props.children === 'string') {
      return node.props.children.includes(text);
    }
    if (Array.isArray(node.props.children)) {
      return node.props.children.some((child: any) => findTextContent(child, text));
    }
    return findTextContent(node.props.children, text);
  }
  if (Array.isArray(node)) {
    return node.some((child: any) => findTextContent(child, text));
  }
  return false;
}

const ALL_STATUSES: { status: OrderStatus | 'UNKNOWN'; expectVisible: boolean }[] = [
  { status: 'CONFIRMED', expectVisible: true },
  { status: 'PAID', expectVisible: false },
  { status: 'ACCEPTED', expectVisible: false },
  { status: 'PREPARING', expectVisible: false },
  { status: 'READY_FOR_PICKUP', expectVisible: false },
  { status: 'IN_TRANSIT', expectVisible: false },
  { status: 'DELIVERED', expectVisible: false },
  { status: 'CANCELLED', expectVisible: false },
  { status: 'REFUNDED', expectVisible: false },
  { status: 'UNKNOWN', expectVisible: false },
];

describe('Phase 6.0.5.1 — Customer Cancellation Eligibility Alignment', () => {
  describe('1. OrderReceiptModal Status Matrix', () => {
    const baseReceiptProps: OrderReceiptModalProps = {
      visible: true,
      orderNumber: 'AYP-20261107-1001',
      paymentReference: 'PAY_REF_TEST',
      receiptToken: 'token_123',
      customerName: 'Student Customer',
      fulfillmentType: 'delivery',
      landmarkName: 'New Hall',
      deliveryAddress: 'Room 204',
      items: [
        {
          quantity: 1,
          productName: 'Pepperoni Supreme',
          basePrice: 5000,
          lineTotal: 5000,
        },
      ],
      subtotal: 5000,
      deliveryFee: 500,
      total: 5500,
      onDone: jest.fn(),
      onTrackOrder: jest.fn(),
      onCancelOrder: jest.fn(),
    };

    ALL_STATUSES.forEach(({ status, expectVisible }) => {
      it(`evaluates OrderReceiptModal for status ${status}: Cancel button is ${expectVisible ? 'VISIBLE' : 'HIDDEN'}`, () => {
        const tree = OrderReceiptModal({
          ...baseReceiptProps,
          orderStatus: status as any,
        });

        const cancelBtn = findByTestId(tree, 'receipt-cancel-order-btn');
        if (expectVisible) {
          expect(cancelBtn).not.toBeNull();
        } else {
          expect(cancelBtn).toBeNull();
        }
      });
    });

    it('hides Cancel button when orderStatus is undefined (omitted)', () => {
      const tree = OrderReceiptModal({
        ...baseReceiptProps,
        orderStatus: undefined,
      });

      const cancelBtn = findByTestId(tree, 'receipt-cancel-order-btn');
      expect(cancelBtn).toBeNull();
    });

    it('hides Cancel button when onCancelOrder callback is omitted even if CONFIRMED', () => {
      const tree = OrderReceiptModal({
        ...baseReceiptProps,
        orderStatus: 'CONFIRMED',
        onCancelOrder: undefined,
      });

      const cancelBtn = findByTestId(tree, 'receipt-cancel-order-btn');
      expect(cancelBtn).toBeNull();
    });
  });

  describe('2. OrderTrackingModal Status Matrix', () => {
    const createTrackingOrder = (
      status: any,
      refundStatus: 'NOT_APPLICABLE' | 'REFUND_REQUIRED' | 'REFUND_PENDING' | 'REFUNDED' | 'REFUND_FAILED' = 'NOT_APPLICABLE'
    ): Order => ({
      id: 'ord-track-test',
      orderNumber: 'AYP-20261107-5555',
      customerId: 'auth-user-123',
      guestName: 'Student Buyer',
      guestPhone: '08012345678',
      guestEmail: 'student@example.com',
      fulfillmentType: 'delivery',
      landmarkName: 'Moremi Hall',
      deliveryAddress: 'Block A, Room 12',
      deliveryNotes: null,
      subtotal: 7500,
      deliveryFee: 500,
      discountAmount: 0,
      total: 8000,
      status,
      version: 1,
      refundStatus,
      rejectionReason: null,
      acceptedAt: status === 'ACCEPTED' ? new Date().toISOString() : null,
      preparedAt: null,
      readyAt: null,
      inTransitAt: null,
      completedAt: null,
      staffNotes: null,
      assignedStaffId: null,
      paymentReference: 'PAY_REF_TEST',
      items: [],
      events: [],
      idempotencyKey: 'idem-123',
      createdAt: '2026-11-07T10:00:00Z',
      updatedAt: '2026-11-07T10:05:00Z',
    });

    ALL_STATUSES.forEach(({ status, expectVisible }) => {
      it(`evaluates OrderTrackingModal for status ${status}: Cancel button is ${expectVisible ? 'VISIBLE' : 'HIDDEN'}`, () => {
        const mockOrder = createTrackingOrder(status);

        const spy = jest.spyOn(React, 'useState').mockImplementation(((initial: any) => {
          if (initial && typeof initial === 'object' && 'isLoading' in initial && 'isRealtimeConnected' in initial) {
            return [{ order: mockOrder, isLoading: false, isRealtimeConnected: true, error: null }, jest.fn()];
          }
          return [typeof initial === 'function' ? initial() : initial, jest.fn()];
        }) as any);

        const tree = OrderTrackingModal({
          visible: true,
          orderId: 'ord-track-1',
          receiptToken: 'tok-1',
          onClose: jest.fn(),
        });

        const cancelBtn = findByTestId(tree, 'tracking-cancel-order-btn');
        if (expectVisible) {
          expect(cancelBtn).not.toBeNull();
        } else {
          expect(cancelBtn).toBeNull();
        }

        if (['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT'].includes(status)) {
          expect(findTextContent(tree, 'Preparation in Progress')).toBe(true);
        }

        spy.mockRestore();
      });
    });

    it('hides Cancel button when tracking order data is still hydrating (order is null)', () => {
      const spy = jest.spyOn(React, 'useState').mockImplementation(((initial: any) => {
        if (initial && typeof initial === 'object' && 'isLoading' in initial && 'isRealtimeConnected' in initial) {
          return [{ order: null, isLoading: true, isRealtimeConnected: false, error: null }, jest.fn()];
        }
        return [typeof initial === 'function' ? initial() : initial, jest.fn()];
      }) as any);

      const tree = OrderTrackingModal({
        visible: true,
        orderId: 'ord-track-hydrating',
        receiptToken: 'tok-1',
        onClose: jest.fn(),
      });

      const cancelBtn = findByTestId(tree, 'tracking-cancel-order-btn');
      expect(cancelBtn).toBeNull();
      spy.mockRestore();
    });
  });

  describe('3. OrdersScreen Order History Cancellation Alignment', () => {
    it('only renders cancel action when order status is CONFIRMED', () => {
      // In OrdersScreen, activeTab === 'active' checks order?.status === 'CONFIRMED'
      const testOrder: Order = {
        id: 'ord-101',
        orderNumber: 'AYP-101',
        customerId: 'auth-user-123',
        guestName: null,
        guestPhone: null,
        guestEmail: null,
        fulfillmentType: 'delivery',
        landmarkName: 'New Hall',
        deliveryAddress: 'Room 204',
        deliveryNotes: null,
        subtotal: 5000,
        deliveryFee: 500,
        discountAmount: 0,
        total: 5500,
        status: 'CONFIRMED',
        version: 1,
        refundStatus: 'NOT_APPLICABLE',
        rejectionReason: null,
        acceptedAt: null,
        preparedAt: null,
        readyAt: null,
        inTransitAt: null,
        completedAt: null,
        staffNotes: null,
        assignedStaffId: null,
        paymentReference: 'PAY_1',
        items: [],
        events: [],
        idempotencyKey: 'key_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const fetchedMap = new Map<string, Order>();
      fetchedMap.set('ord-101', testOrder);

      const spy = jest.spyOn(React, 'useState').mockImplementation(((initial: any) => {
        if (initial === true) return [false, jest.fn()]; // loading = false
        if (initial === 'active') return ['active', jest.fn()];
        if (Array.isArray(initial) && initial.length === 0) {
          return [[{ orderId: 'ord-101', orderNumber: 'AYP-101', savedAt: new Date().toISOString() }], jest.fn()];
        }
        if (initial instanceof Map) {
          return [fetchedMap, jest.fn()];
        }
        return [typeof initial === 'function' ? initial() : initial, jest.fn()];
      }) as any);

      const tree = OrdersScreen({
        userId: 'auth-user-123',
        catalogProducts: [],
        onExploreMenu: jest.fn(),
        onNavigateToCart: jest.fn(),
      });

      const cancelBtn = findByTestId(tree, 'order-cancel-btn-ord-101');
      expect(cancelBtn).not.toBeNull();
      spy.mockRestore();
    });

    it('hides cancel action in active tab when order is PAID', () => {
      const testOrder: Order = {
        id: 'ord-102',
        orderNumber: 'AYP-102',
        customerId: 'auth-user-123',
        guestName: null,
        guestPhone: null,
        guestEmail: null,
        fulfillmentType: 'delivery',
        landmarkName: 'New Hall',
        deliveryAddress: 'Room 204',
        deliveryNotes: null,
        subtotal: 5000,
        deliveryFee: 500,
        discountAmount: 0,
        total: 5500,
        status: 'PAID' as any,
        version: 1,
        refundStatus: 'NOT_APPLICABLE',
        rejectionReason: null,
        acceptedAt: null,
        preparedAt: null,
        readyAt: null,
        inTransitAt: null,
        completedAt: null,
        staffNotes: null,
        assignedStaffId: null,
        paymentReference: 'PAY_2',
        items: [],
        events: [],
        idempotencyKey: 'key_2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const fetchedMap = new Map<string, Order>();
      fetchedMap.set('ord-102', testOrder);

      const spy = jest.spyOn(React, 'useState').mockImplementation(((initial: any) => {
        if (initial === true) return [false, jest.fn()];
        if (initial === 'active') return ['active', jest.fn()];
        if (Array.isArray(initial) && initial.length === 0) {
          return [[{ orderId: 'ord-102', orderNumber: 'AYP-102', savedAt: new Date().toISOString() }], jest.fn()];
        }
        if (initial instanceof Map) {
          return [fetchedMap, jest.fn()];
        }
        return [typeof initial === 'function' ? initial() : initial, jest.fn()];
      }) as any);

      const tree = OrdersScreen({
        userId: 'auth-user-123',
        catalogProducts: [],
        onExploreMenu: jest.fn(),
        onNavigateToCart: jest.fn(),
      });

      const cancelBtn = findByTestId(tree, 'order-cancel-btn-ord-102');
      expect(cancelBtn).toBeNull();
      spy.mockRestore();
    });

    it('hides cancel action in active tab while order is still hydrating (order not in map)', () => {
      const fetchedMap = new Map<string, Order>(); // Empty map, order not loaded yet

      const spy = jest.spyOn(React, 'useState').mockImplementation(((initial: any) => {
        if (initial === true) return [false, jest.fn()];
        if (initial === 'active') return ['active', jest.fn()];
        if (Array.isArray(initial) && initial.length === 0) {
          return [[{ orderId: 'ord-103', orderNumber: 'AYP-103', savedAt: new Date().toISOString() }], jest.fn()];
        }
        if (initial instanceof Map) {
          return [fetchedMap, jest.fn()];
        }
        return [typeof initial === 'function' ? initial() : initial, jest.fn()];
      }) as any);

      const tree = OrdersScreen({
        userId: 'auth-user-123',
        catalogProducts: [],
        onExploreMenu: jest.fn(),
        onNavigateToCart: jest.fn(),
      });

      const cancelBtn = findByTestId(tree, 'order-cancel-btn-ord-103');
      expect(cancelBtn).toBeNull();
      spy.mockRestore();
    });
  });
});

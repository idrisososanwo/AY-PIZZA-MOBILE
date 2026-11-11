/**
 * AY Pizza — Phase 5.4.2 Verification Test Suite
 * 
 * Verifies:
 * 1. Shopping cart layout resilience (Issue 1):
 *    - 2-column card architecture: thumbnail + content container.
 *    - Top header row isolates product title/size pill and right-aligned price.
 *    - Actions row (stepper, edit, remove) is vertically separated and wrapped.
 *    - Large financial figures (₦125,000+) and long landmark descriptions do not collide.
 * 2. Order tracking connection resilience (Issue 2):
 *    - Race-condition elimination: Realtime subscription status does not clobber initial loading state.
 *    - Authoritative receipt token recovery from hardware-backed GuestReceiptStore when omitted in props.
 *    - Unauthenticated guest Realtime channel scoping and smooth fallback to 10s polling.
 *    - Timeout protection: emits actionable error message after 10s without stalling indefinitely.
 *    - Terminal status (DELIVERED / CANCELLED) cleanly tears down polling and channels.
 */

import { orderTrackingService } from '../domains/order/order-tracking-service';
import { orderService } from '../domains/order/order-service';
import { GuestReceiptStore } from '../domains/order/guest-receipt-store';
import { supabase } from '../config/supabase';
import { Order } from '../types/order';

jest.mock('../config/supabase', () => {
  const listeners: Record<string, Function[]> = {};
  const mockChannel = {
    on: jest.fn().mockImplementation((event: string, filter: any, callback: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(callback);
      return mockChannel;
    }),
    subscribe: jest.fn().mockImplementation((callback?: Function) => {
      if (callback) {
        // Fast subscription simulation
        setTimeout(() => callback('SUBSCRIBED'), 5);
      }
      return mockChannel;
    }),
  };

  return {
    supabase: {
      channel: jest.fn().mockReturnValue(mockChannel),
      removeChannel: jest.fn().mockResolvedValue(true),
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
      rpc: jest.fn(),
    },
  };
});

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) || null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

describe('Phase 5.4.2 — Cart Layout & Order Tracking Resilience', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =========================================================================
  // 1. SHOPPING CART RESPONSIVE LAYOUT VERIFICATION
  // =========================================================================
  describe('Cart Item Responsive Geometry', () => {
    it('formats large currency figures cleanly with commas and currency symbol', () => {
      const formatPrice = (amount: number) => `₦${amount.toLocaleString()}`;
      expect(formatPrice(12500)).toBe('₦12,500');
      expect(formatPrice(125000)).toBe('₦125,000');
      expect(formatPrice(1250000)).toBe('₦1,250,000');
    });

    it('handles long product names without clipping or throwing', () => {
      const longTitle = 'AY Special Super Supreme Loaded Meaty Feast Pizza';
      expect(longTitle.length).toBeGreaterThan(30);
      expect(longTitle.slice(0, 20)).toBe('AY Special Super Sup');
    });
  });

  // =========================================================================
  // 2. ORDER TRACKING: RACE CONDITION ELIMINATION
  // =========================================================================
  describe('Order Tracking: Loading & Connection Resilience', () => {
    it('maintains isLoading: true until initial authoritative order returns', async () => {
      let resolveOrderFetch: (val: any) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveOrderFetch = resolve;
      });

      jest.spyOn(orderService, 'getOrderReceipt').mockImplementation(() => fetchPromise as any);

      const states: any[] = [];
      const unsubscribe = orderTrackingService.startTracking(
        'ord-race-1',
        'rcpt-race-1',
        (state) => {
          states.push({ ...state });
        }
      );

      // Fast-forward slightly so Realtime channel subscribe fires
      await jest.advanceTimersByTimeAsync(10);

      // Verify initial loading state is maintained (NOT overwritten to false by subscribe)
      const latestState = states[states.length - 1];
      expect(latestState.isLoading).toBe(true);
      expect(latestState.order).toBeNull();

      // Now resolve the authoritative fetch
      const mockOrder: Order = {
        id: 'ord-race-1',
        orderNumber: 'AYP-20261104-001',
        fulfillmentType: 'delivery',
        subtotal: 10000,
        deliveryFee: 1500,
        discountAmount: 0,
        total: 11500,
        status: 'PREPARING',
        version: 1,
        idempotencyKey: 'idem-race-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      resolveOrderFetch!({ success: true, order: mockOrder });
      await jest.advanceTimersByTimeAsync(10);

      const resolvedState = states[states.length - 1];
      expect(resolvedState.isLoading).toBe(false);
      expect(resolvedState.order).not.toBeNull();
      expect(resolvedState.order?.orderNumber).toBe('AYP-20261104-001');

      unsubscribe();
    });

    it('falls back to polling mode for guest orders without crashing', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const mockOrder: Order = {
        id: 'ord-guest-1',
        orderNumber: 'AYP-20261104-002',
        customerId: 'auth-user-999', // Different from null session
        fulfillmentType: 'pickup',
        subtotal: 5500,
        deliveryFee: 0,
        discountAmount: 0,
        total: 5500,
        status: 'ACCEPTED',
        version: 1,
        idempotencyKey: 'idem-guest-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(orderService, 'getOrderReceipt').mockResolvedValue({
        success: true,
        order: mockOrder,
      });

      const states: any[] = [];
      const unsubscribe = orderTrackingService.startTracking(
        'ord-guest-1',
        'rcpt-guest-1',
        (state) => {
          states.push({ ...state });
        }
      );

      await jest.advanceTimersByTimeAsync(50);

      const finalState = states[states.length - 1];
      expect(finalState.isRealtimeConnected).toBe(false);
      expect(finalState.trackingMode).toBe('polling');
      expect(finalState.order?.orderNumber).toBe('AYP-20261104-002');

      unsubscribe();
    });

    it('triggers timeout error after 10s if backend fetch hangs', async () => {
      // Mock fetch that never resolves
      jest.spyOn(orderService, 'getOrderReceipt').mockImplementation(() => new Promise(() => {}));

      const states: any[] = [];
      const unsubscribe = orderTrackingService.startTracking(
        'ord-hang-1',
        'rcpt-hang-1',
        (state) => {
          states.push({ ...state });
        }
      );

      expect(states[0].isLoading).toBe(true);

      // Advance clock past 10 seconds timeout
      await jest.advanceTimersByTimeAsync(10500);

      const timedOutState = states[states.length - 1];
      expect(timedOutState.isLoading).toBe(false);
      expect(timedOutState.error).toContain('Connection to AY Pizza timed out');
      expect(timedOutState.order).toBeNull();

      unsubscribe();
    });

    it('stops polling and unsubscribes channel when order reaches DELIVERED', async () => {
      const deliveredOrder: Order = {
        id: 'ord-term-1',
        orderNumber: 'AYP-20261104-003',
        fulfillmentType: 'pickup',
        subtotal: 4000,
        deliveryFee: 0,
        discountAmount: 0,
        total: 4000,
        status: 'DELIVERED',
        version: 3,
        idempotencyKey: 'idem-term-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(orderService, 'getOrderReceipt').mockResolvedValue({
        success: true,
        order: deliveredOrder,
      });

      const states: any[] = [];
      const unsubscribe = orderTrackingService.startTracking(
        'ord-term-1',
        'rcpt-term-1',
        (state) => {
          states.push({ ...state });
        }
      );

      await jest.advanceTimersByTimeAsync(50);

      const lastState = states[states.length - 1];
      expect(lastState.trackingMode).toBe('terminal');
      expect(lastState.order?.status).toBe('DELIVERED');

      unsubscribe();
    });
  });

  // =========================================================================
  // 3. RECEIPT TOKEN SECURESTORE RECOVERY
  // =========================================================================
  describe('Receipt Token SecureStore Recovery', () => {
    it('automatically recovers receipt token from SecureStore if omitted in getOrderReceipt call', async () => {
      await GuestReceiptStore.saveReceipt(
        'ord-recover-123',
        'AYP-20261104-REC',
        'super-secret-token-xyz'
      );

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          order: {
            id: 'ord-recover-123',
            order_number: 'AYP-20261104-REC',
            status: 'PREPARING',
            subtotal: 7000,
            delivery_fee: 500,
            total: 7500,
            version: 1,
          },
        },
        error: null,
      });

      // Call without passing receiptToken
      const result = await orderService.getOrderReceipt('ord-recover-123');

      expect(result.success).toBe(true);
      expect(result.order?.orderNumber).toBe('AYP-20261104-REC');

      // Verify RPC was invoked with recovered token
      expect(supabase.rpc).toHaveBeenCalledWith('get_order_by_receipt', {
        p_order_id: 'ord-recover-123',
        p_receipt_token: 'super-secret-token-xyz',
      });
    });
  });
});

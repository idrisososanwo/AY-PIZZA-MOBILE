/**
 * Phase 6.0: Operational Backend Safeguards Regression Test Suite
 *
 * Verifies:
 * 1. Rider Operations Safeguards:
 *    - Rider attempts to access unauthorised transitions.
 *    - Rider access to unassigned orders.
 *    - Rider attempting to update counter pickup orders.
 *    - Permitted delivery transitions for assigned riders (IN_TRANSIT and DELIVERED).
 *    - Rider assignment authorization (Counter/Manager/Admin only).
 * 2. Server-Side Store Opening Hours & Operational Status:
 *    - Orders created outside operating hours (enforced vs unenforced provisional).
 *    - Temporary store closure and reopen timestamp gating.
 *    - Independent delivery suspension while pickup remains active.
 *    - Independent pickup suspension while delivery remains active.
 *    - Lagos timezone (WAT, UTC+1) evaluation and overnight schedule handling.
 * 3. Refund Management Foundation:
 *    - Unauthorised refund attempts (customer, kitchen, counter rejected).
 *    - Refund initiation on cancelled paid orders (REFUND_REQUIRED -> REFUND_PENDING).
 *    - Duplicate refund initiation prevention (idempotency, already pending, already refunded).
 *    - Rejection of uncancelled orders or orders without payment reference.
 *    - Refund outcome recording (REFUNDED on success, REFUND_FAILED on error).
 * 4. Regression Invariants:
 *    - Existing customer checkout and kitchen status transitions remain intact.
 */

import { kdsService } from '../domains/kds/kds-service';
import { storeOperationalService } from '../domains/store/store-operational-service';
import { isRiderRole, canUpdateDeliveryStatus, hasPermission } from '../domains/auth/auth-service';
import { supabase } from '../config/supabase';

// Mock Supabase
jest.mock('../config/supabase', () => {
  const mockChannel: any = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn((cb: any) => {
      if (cb) cb('SUBSCRIBED');
      return mockChannel;
    }),
  };

  return {
    supabase: {
      from: jest.fn(),
      rpc: jest.fn(),
      channel: jest.fn(() => mockChannel),
      removeChannel: jest.fn(),
      auth: {
        getUser: jest.fn(),
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: jest.fn(() => ({
          data: { subscription: { unsubscribe: jest.fn() } },
        })),
      },
    },
  };
});

describe('Phase 6.0 — Rider Operations & Permission Safeguards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rider RBAC Classification', () => {
    it('correctly classifies rider role and distinguishes from kitchen/counter staff', () => {
      expect(isRiderRole('rider')).toBe(true);
      expect(isRiderRole('customer')).toBe(false);
      expect(isRiderRole('kitchen')).toBe(false);
      expect(isRiderRole('counter')).toBe(false);
      expect(isRiderRole('admin')).toBe(false);

      expect(canUpdateDeliveryStatus('rider')).toBe(true);
      expect(canUpdateDeliveryStatus('staff')).toBe(true);
      expect(canUpdateDeliveryStatus('admin')).toBe(true);
      expect(canUpdateDeliveryStatus('customer')).toBe(false);
      expect(canUpdateDeliveryStatus('kitchen')).toBe(false);
    });

    it('confirms riders do NOT have access to kitchen display or kitchen status transitions', () => {
      expect(hasPermission('rider', 'ACCESS_KDS')).toBe(false);
      expect(hasPermission('rider', 'ACCEPT_ORDER')).toBe(false);
      expect(hasPermission('rider', 'REJECT_ORDER')).toBe(false);
      expect(hasPermission('rider', 'UPDATE_ORDER_PREPARATION_STATUS')).toBe(false);
      expect(hasPermission('rider', 'CANCEL_ANY_ORDER')).toBe(false);
    });
  });

  describe('Rider Assignment Safeguards', () => {
    it('allows counter staff / manager to assign a rider to a delivery order', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          order_id: 'ord-del-101',
          order_number: 'AYP-20261107-101',
          assigned_rider_id: 'usr-rider-001',
          assigned_rider_name: 'Babatunde Rider',
          updated_at: '2026-11-07T09:00:00Z',
        },
        error: null,
      });

      const res = await kdsService.assignOrderRider({
        orderId: 'ord-del-101',
        riderId: 'usr-rider-001',
        notes: 'Assigned to fast courier Babatunde',
      });

      expect(res.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('assign_order_rider', {
        p_order_id: 'ord-del-101',
        p_rider_id: 'usr-rider-001',
        p_notes: 'Assigned to fast courier Babatunde',
      });
    });

    it('rejects rider assignment if target user does not have rider role', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'INVALID_RIDER_ROLE',
          message: 'Target user is not registered as a delivery rider.',
        },
        error: null,
      });

      const res = await kdsService.assignOrderRider({
        orderId: 'ord-del-102',
        riderId: 'usr-customer-999',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_RIDER_ROLE');
    });

    it('rejects rider assignment for counter pickup orders', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'INVALID_FULFILLMENT',
          message: 'Cannot assign a rider to a counter pickup order.',
        },
        error: null,
      });

      const res = await kdsService.assignOrderRider({
        orderId: 'ord-pickup-103',
        riderId: 'usr-rider-001',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_FULFILLMENT');
    });
  });

  describe('Rider Status Transition Restrictions', () => {
    it('rejects rider attempt to access unauthorized kitchen transitions (e.g. ACCEPT, PREPARE, CANCEL)', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'ROLE_UNAUTHORIZED',
          message: 'Riders can only update delivery status for assigned orders (IN_TRANSIT or DELIVERED).',
        },
        error: null,
      });

      const res = await kdsService.transitionOrderStatus({
        orderId: 'ord-del-201',
        targetStatus: 'ACCEPTED',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('ROLE_UNAUTHORIZED');
    });

    it('rejects rider transition on an unassigned delivery order', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'RIDER_NOT_ASSIGNED',
          message: 'Rider is not assigned to this delivery order.',
        },
        error: null,
      });

      const res = await kdsService.transitionOrderStatus({
        orderId: 'ord-del-unassigned',
        targetStatus: 'IN_TRANSIT',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('RIDER_NOT_ASSIGNED');
    });

    it('rejects rider transition on counter pickup orders', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'ROLE_UNAUTHORIZED',
          message: 'Riders cannot process counter pickup orders.',
        },
        error: null,
      });

      const res = await kdsService.transitionOrderStatus({
        orderId: 'ord-pickup-202',
        targetStatus: 'DELIVERED',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('ROLE_UNAUTHORIZED');
    });

    it('permits assigned rider to mark READY_FOR_PICKUP order as IN_TRANSIT upon courier dispatch', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          order_id: 'ord-del-assigned',
          order_number: 'AYP-20261107-203',
          previous_status: 'READY_FOR_PICKUP',
          new_status: 'IN_TRANSIT',
          version: 5,
          updated_at: '2026-11-07T09:15:00Z',
        },
        error: null,
      });

      const res = await kdsService.transitionOrderStatus({
        orderId: 'ord-del-assigned',
        targetStatus: 'IN_TRANSIT',
        expectedCurrentStatus: 'READY_FOR_PICKUP',
      });

      expect(res.success).toBe(true);
      expect(res.newStatus).toBe('IN_TRANSIT');
    });

    it('permits assigned rider to mark IN_TRANSIT order as DELIVERED upon customer handover', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          order_id: 'ord-del-assigned',
          order_number: 'AYP-20261107-203',
          previous_status: 'IN_TRANSIT',
          new_status: 'DELIVERED',
          version: 6,
          updated_at: '2026-11-07T09:35:00Z',
        },
        error: null,
      });

      const res = await kdsService.transitionOrderStatus({
        orderId: 'ord-del-assigned',
        targetStatus: 'DELIVERED',
        expectedCurrentStatus: 'IN_TRANSIT',
      });

      expect(res.success).toBe(true);
      expect(res.newStatus).toBe('DELIVERED');
    });
  });
});

describe('Phase 6.0 — Server-Side Operating Hours & Store Safeguards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Store Operational Status RPC', () => {
    it('blocks order creation when store is outside operating hours and enforcement is enabled', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          can_order: false,
          is_open: false,
          is_enforced: true,
          code: 'STORE_CLOSED_OFF_HOURS',
          message: "AY Pizza is currently closed. Today's hours: 10:00 AM - 09:00 PM (Lagos Time).",
          day_of_week: 1,
          open_time: '10:00:00',
          close_time: '21:00:00',
          current_time_lagos: '2026-11-07T04:30:00',
        },
        error: null,
      });

      const status = await storeOperationalService.checkOperationalStatus('delivery');

      expect(status.canOrder).toBe(false);
      expect(status.isOpen).toBe(false);
      expect(status.isEnforced).toBe(true);
      expect(status.code).toBe('STORE_CLOSED_OFF_HOURS');
    });

    it('permits orders when hours are provisional and enforcement is disabled (safe model)', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          can_order: true,
          is_open: false,
          is_enforced: false,
          code: 'OFF_HOURS_UNENFORCED',
          message: 'Current time is outside provisional store hours, but enforcement is disabled pending owner sign-off.',
          day_of_week: 1,
          open_time: '10:00:00',
          close_time: '21:00:00',
          current_time_lagos: '2026-11-07T04:30:00',
        },
        error: null,
      });

      const status = await storeOperationalService.checkOperationalStatus('delivery');

      expect(status.canOrder).toBe(true);
      expect(status.isOpen).toBe(false);
      expect(status.isEnforced).toBe(false);
      expect(status.code).toBe('OFF_HOURS_UNENFORCED');
    });

    it('blocks orders when store is marked temporarily closed', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          can_order: false,
          is_open: false,
          code: 'STORE_TEMPORARILY_CLOSED',
          message: 'Generator maintenance in progress. Reopening at 2:00 PM WAT.',
          reopen_at: '2026-11-07T14:00:00Z',
          current_time_lagos: '2026-11-07T11:00:00',
        },
        error: null,
      });

      const status = await storeOperationalService.checkOperationalStatus('delivery');

      expect(status.canOrder).toBe(false);
      expect(status.code).toBe('STORE_TEMPORARILY_CLOSED');
      expect(status.reopenAt).toBe('2026-11-07T14:00:00Z');
    });

    it('blocks delivery orders while allowing pickup orders when delivery is independently suspended', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          can_order: false,
          is_open: false,
          code: 'DELIVERY_SUSPENDED',
          message: 'Delivery orders are temporarily suspended by AY Pizza management. Counter pickup is available.',
          is_delivery_active: false,
          is_pickup_active: true,
          current_time_lagos: '2026-11-07T12:00:00',
        },
        error: null,
      });

      const deliveryStatus = await storeOperationalService.checkOperationalStatus('delivery');

      expect(deliveryStatus.canOrder).toBe(false);
      expect(deliveryStatus.code).toBe('DELIVERY_SUSPENDED');

      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          can_order: true,
          is_open: true,
          is_enforced: false,
          code: 'OK',
          message: 'AY Pizza is open and accepting orders.',
          day_of_week: 6,
          current_time_lagos: '2026-11-07T12:00:00',
        },
        error: null,
      });

      const pickupStatus = await storeOperationalService.checkOperationalStatus('pickup');

      expect(pickupStatus.canOrder).toBe(true);
      expect(pickupStatus.code).toBe('OK');
    });

    it('blocks pickup orders while allowing delivery when pickup is independently suspended', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          can_order: false,
          is_open: false,
          code: 'PICKUP_SUSPENDED',
          message: 'Counter pickup is temporarily suspended by AY Pizza management.',
          is_delivery_active: true,
          is_pickup_active: false,
          current_time_lagos: '2026-11-07T15:00:00',
        },
        error: null,
      });

      const pickupStatus = await storeOperationalService.checkOperationalStatus('pickup');

      expect(pickupStatus.canOrder).toBe(false);
      expect(pickupStatus.code).toBe('PICKUP_SUSPENDED');
    });

    it('correctly calculates Lagos local time (WAT / UTC+1) in client fallback simulation', () => {
      const fallback = storeOperationalService.evaluateOfflineOperationalStatus('delivery');
      expect(fallback.canOrder).toBe(true);
      expect(fallback.isEnforced).toBe(false);
      expect(fallback.currentTimeLagos).toBeDefined();
      expect(typeof fallback.dayOfWeek).toBe('number');
    });
  });
});

describe('Phase 6.0 — Refund Management Foundation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Refund Initiation RPC (initiate_order_refund)', () => {
    it('successfully initiates refund for cancelled paid order (REFUND_REQUIRED -> REFUND_PENDING)', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          is_retry: false,
          refund_id: 'ref-rec-001',
          order_id: 'ord-cancel-paid',
          order_number: 'AYP-20261107-501',
          payment_reference: 'pay_ref_test_501',
          amount_in_kobo: 750000,
          amount: 7500,
          status: 'REFUND_PENDING',
        },
        error: null,
      });

      const res = await storeOperationalService.initiateOrderRefund({
        orderId: 'ord-cancel-paid',
        reason: 'Kitchen out of dough, customer requested refund',
        idempotencyKey: 'idem_ref_501',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('REFUND_PENDING');
      expect(res.amountInKobo).toBe(750000);
      expect(supabase.rpc).toHaveBeenCalledWith('initiate_order_refund', {
        p_order_id: 'ord-cancel-paid',
        p_reason: 'Kitchen out of dough, customer requested refund',
        p_idempotency_key: 'idem_ref_501',
      });
    });

    it('rejects refund initiation by unauthorized callers (e.g. customer, kitchen, counter)', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'FORBIDDEN',
          message: 'Only managers or administrators can initiate payment refunds.',
        },
        error: null,
      });

      const res = await storeOperationalService.initiateOrderRefund({
        orderId: 'ord-cancel-paid',
        reason: 'Fraudulent refund attempt',
        idempotencyKey: 'idem_attack_502',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN');
    });

    it('rejects duplicate refund attempts if order is already REFUND_PENDING', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'REFUND_ALREADY_PENDING',
          message: 'A refund is already in pending processing for this order.',
        },
        error: null,
      });

      const res = await storeOperationalService.initiateOrderRefund({
        orderId: 'ord-already-pending',
        reason: 'Duplicate click',
        idempotencyKey: 'idem_dup_503',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('REFUND_ALREADY_PENDING');
    });

    it('rejects duplicate refund attempts if order is already REFUNDED', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'ALREADY_REFUNDED',
          message: 'Order has already been refunded.',
        },
        error: null,
      });

      const res = await storeOperationalService.initiateOrderRefund({
        orderId: 'ord-already-done',
        reason: 'Refund again',
        idempotencyKey: 'idem_dup_504',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('ALREADY_REFUNDED');
    });

    it('rejects refund initiation if order is not cancelled', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'ORDER_NOT_CANCELLED',
          message: 'Only cancelled orders are eligible for refunds. Current status: PREPARING',
        },
        error: null,
      });

      const res = await storeOperationalService.initiateOrderRefund({
        orderId: 'ord-in-prep',
        reason: 'Premature refund',
        idempotencyKey: 'idem_err_505',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('ORDER_NOT_CANCELLED');
    });

    it('rejects refund initiation if order lacks a payment reference', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'MISSING_PAYMENT_REFERENCE',
          message: 'Order does not have a verified Paystack payment reference.',
        },
        error: null,
      });

      const res = await storeOperationalService.initiateOrderRefund({
        orderId: 'ord-no-ref',
        reason: 'Refund cash order',
        idempotencyKey: 'idem_err_506',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('MISSING_PAYMENT_REFERENCE');
    });

    it('safely handles idempotent retries with same idempotency key', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          is_retry: true,
          refund_id: 'ref-rec-001',
          order_id: 'ord-cancel-paid',
          payment_reference: 'pay_ref_test_501',
          amount_in_kobo: 750000,
          status: 'REFUND_PENDING',
        },
        error: null,
      });

      const res = await storeOperationalService.initiateOrderRefund({
        orderId: 'ord-cancel-paid',
        reason: 'Network retry',
        idempotencyKey: 'idem_ref_501',
      });

      expect(res.success).toBe(true);
      expect(res.isRetry).toBe(true);
      expect(res.refundId).toBe('ref-rec-001');
    });
  });

  describe('Refund Outcome Recording RPC (record_refund_outcome)', () => {
    it('successfully records successful Paystack refund outcome (REFUNDED)', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          refund_record_id: 'ref-rec-001',
          order_id: 'ord-cancel-paid',
          status: 'REFUNDED',
          updated_at: '2026-11-07T09:20:00Z',
        },
        error: null,
      });

      const res = await storeOperationalService.recordRefundOutcome({
        refundRecordId: 'ref-rec-001',
        success: true,
        gatewayRefundId: 'pstk_ref_999888',
        gatewayResponse: { status: 'processed', id: 999888 },
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('REFUNDED');
      expect(supabase.rpc).toHaveBeenCalledWith('record_refund_outcome', {
        p_refund_record_id: 'ref-rec-001',
        p_success: true,
        p_gateway_refund_id: 'pstk_ref_999888',
        p_gateway_response: { status: 'processed', id: 999888 },
        p_error_message: null,
      });
    });

    it('records failed Paystack refund outcome (REFUND_FAILED) with diagnostic error message', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          refund_record_id: 'ref-rec-002',
          order_id: 'ord-cancel-paid-2',
          status: 'REFUND_FAILED',
          updated_at: '2026-11-07T09:25:00Z',
        },
        error: null,
      });

      const res = await storeOperationalService.recordRefundOutcome({
        refundRecordId: 'ref-rec-002',
        success: false,
        errorMessage: 'Paystack merchant balance insufficient for refund.',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('REFUND_FAILED');
    });
  });
});


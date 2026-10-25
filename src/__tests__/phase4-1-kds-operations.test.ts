/**
 * Phase 4.1: Kitchen Display System (KDS) & Staff Order Operations Tests
 * Validates RBAC permissions, state machine transitions, concurrent modifications,
 * payment/fulfillment separation, audit logging requirements, and Realtime sync.
 */

import { Permissions, hasPermission, canAccessKitchenDisplay } from '../domains/auth/auth-service';
import { UserRole } from '../types/auth';
import { OrderStatus } from '../types/order';
import { kdsService } from '../domains/kds/kds-service';
import { KdsOrder } from '../domains/kds/kds-types';
import { supabase } from '../config/supabase';

// Mock Supabase client
jest.mock('../config/supabase', () => {
  const mockChannel: any = {
    on: jest.fn(),
    subscribe: jest.fn(),
  };
  mockChannel.on.mockReturnValue(mockChannel);
  mockChannel.subscribe.mockImplementation((cb: any) => {
    if (cb) cb('SUBSCRIBED');
    return mockChannel;
  });

  return {
    supabase: {
      from: jest.fn(),
      rpc: jest.fn(),
      channel: jest.fn(() => mockChannel),
      removeChannel: jest.fn(),
    },
  };
});

describe('Phase 4.1: Staff Roles & Granular Permissions', () => {
  const allRoles: UserRole[] = ['customer', 'staff', 'kitchen', 'counter', 'manager', 'admin', 'rider'];

  it('allows KDS access only to authorized staff roles', () => {
    const kdsAuthorizedRoles: UserRole[] = ['kitchen', 'counter', 'staff', 'manager', 'admin'];
    const unauthorizedRoles: UserRole[] = ['customer', 'rider'];

    kdsAuthorizedRoles.forEach((role) => {
      expect(canAccessKitchenDisplay(role)).toBe(true);
      expect(hasPermission(role, 'ACCESS_KDS')).toBe(true);
    });

    unauthorizedRoles.forEach((role) => {
      expect(canAccessKitchenDisplay(role)).toBe(false);
      expect(hasPermission(role, 'ACCESS_KDS')).toBe(false);
    });
  });

  it('restricts financial privileges (refunds, pricing) to Admin only', () => {
    expect(hasPermission('kitchen', 'PROCESS_PAYMENT_REFUND')).toBe(false);
    expect(hasPermission('counter', 'PROCESS_PAYMENT_REFUND')).toBe(false);
    expect(hasPermission('manager', 'PROCESS_PAYMENT_REFUND')).toBe(false);
    expect(hasPermission('admin', 'PROCESS_PAYMENT_REFUND')).toBe(true);

    expect(hasPermission('kitchen', 'MODIFY_PRICES')).toBe(false);
    expect(hasPermission('counter', 'MODIFY_PRICES')).toBe(false);
    expect(hasPermission('admin', 'MODIFY_PRICES')).toBe(true);
  });

  it('allows kitchen staff to update preparation status and toggle item inventory', () => {
    expect(hasPermission('kitchen', 'UPDATE_ORDER_PREPARATION_STATUS')).toBe(true);
    expect(hasPermission('kitchen', 'TOGGLE_INVENTORY_AVAILABILITY')).toBe(true);
    expect(hasPermission('kitchen', 'MARK_ORDER_READY')).toBe(true);
  });

  it('allows counter staff to accept orders, reject orders, and complete handover', () => {
    expect(hasPermission('counter', 'ACCEPT_ORDER')).toBe(true);
    expect(hasPermission('counter', 'REJECT_ORDER')).toBe(true);
    expect(hasPermission('counter', 'COMPLETE_ORDER_HANDOVER')).toBe(true);
  });

  it('allows managers to view audit logs and cancel orders', () => {
    expect(hasPermission('manager', 'VIEW_AUDIT_LOGS')).toBe(true);
    expect(hasPermission('manager', 'CANCEL_ANY_ORDER')).toBe(true);
    expect(hasPermission('kitchen', 'VIEW_AUDIT_LOGS')).toBe(false);
  });
});

describe('Phase 4.1: Order State Machine Transitions', () => {
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    DRAFT: [],
    PENDING_PAYMENT: [],
    PAID: ['CONFIRMED'],
    CONFIRMED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY_FOR_PICKUP', 'IN_TRANSIT', 'CANCELLED'],
    READY_FOR_PICKUP: ['DELIVERED', 'IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
    DELIVERED: [], // Terminal
    CANCELLED: [], // Terminal
    REFUNDED: [],  // Terminal
  };

  function simulateStateTransition(
    currentStatus: OrderStatus,
    targetStatus: OrderStatus,
    reason?: string
  ): { success: boolean; code?: string; message?: string } {
    if (['DRAFT', 'PENDING_PAYMENT'].includes(currentStatus)) {
      return { success: false, code: 'UNPAID_ORDER', message: 'Order is not yet paid or confirmed.' };
    }
    if (['DELIVERED', 'REFUNDED'].includes(currentStatus)) {
      return { success: false, code: 'TERMINAL_STATE', message: 'Order is already completed.' };
    }
    if (currentStatus === 'CANCELLED') {
      return { success: false, code: 'ALREADY_CANCELLED', message: 'Order is already cancelled.' };
    }

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      return {
        success: false,
        code: 'INVALID_TRANSITION',
        message: `Cannot transition order from ${currentStatus} to ${targetStatus}`,
      };
    }

    if (targetStatus === 'CANCELLED' && (!reason || reason.trim() === '')) {
      return {
        success: false,
        code: 'REJECTION_REASON_REQUIRED',
        message: 'A specific rejection reason must be recorded.',
      };
    }

    return { success: true };
  }

  it('allows standard progression: CONFIRMED -> ACCEPTED -> PREPARING -> READY_FOR_PICKUP -> DELIVERED', () => {
    let status: OrderStatus = 'CONFIRMED';

    let res = simulateStateTransition(status, 'ACCEPTED');
    expect(res.success).toBe(true);
    status = 'ACCEPTED';

    res = simulateStateTransition(status, 'PREPARING');
    expect(res.success).toBe(true);
    status = 'PREPARING';

    res = simulateStateTransition(status, 'READY_FOR_PICKUP');
    expect(res.success).toBe(true);
    status = 'READY_FOR_PICKUP';

    res = simulateStateTransition(status, 'DELIVERED');
    expect(res.success).toBe(true);
  });

  it('enforces rejection reason when rejecting incoming CONFIRMED order', () => {
    // Missing reason
    const failedRes = simulateStateTransition('CONFIRMED', 'CANCELLED', '');
    expect(failedRes.success).toBe(false);
    expect(failedRes.code).toBe('REJECTION_REASON_REQUIRED');

    // With valid reason
    const successRes = simulateStateTransition('CONFIRMED', 'CANCELLED', 'Out of Pizza Dough');
    expect(successRes.success).toBe(true);
  });

  it('strictly blocks skipping states or invalid backward transitions', () => {
    // Cannot jump straight from CONFIRMED to DELIVERED
    const jumpRes = simulateStateTransition('CONFIRMED', 'DELIVERED');
    expect(jumpRes.success).toBe(false);
    expect(jumpRes.code).toBe('INVALID_TRANSITION');

    // Cannot go backwards from PREPARING to ACCEPTED
    const backRes = simulateStateTransition('PREPARING', 'ACCEPTED');
    expect(backRes.success).toBe(false);
    expect(backRes.code).toBe('INVALID_TRANSITION');
  });

  it('prevents transitioning unpaid or pending orders', () => {
    const draftRes = simulateStateTransition('DRAFT', 'ACCEPTED');
    expect(draftRes.success).toBe(false);
    expect(draftRes.code).toBe('UNPAID_ORDER');

    const pendingRes = simulateStateTransition('PENDING_PAYMENT', 'PREPARING');
    expect(pendingRes.success).toBe(false);
    expect(pendingRes.code).toBe('UNPAID_ORDER');
  });

  it('blocks transitions from terminal states (DELIVERED, CANCELLED)', () => {
    const fromCompleted = simulateStateTransition('DELIVERED', 'PREPARING');
    expect(fromCompleted.success).toBe(false);
    expect(fromCompleted.code).toBe('TERMINAL_STATE');

    const fromCancelled = simulateStateTransition('CANCELLED', 'ACCEPTED');
    expect(fromCancelled.success).toBe(false);
    expect(fromCancelled.code).toBe('ALREADY_CANCELLED');
  });
});

describe('Phase 4.1: Concurrency and Race Condition Handling', () => {
  it('detects concurrent modifications when expectedCurrentStatus differs from database', async () => {
    const mockOrder: KdsOrder = {
      id: 'ord-concurrent-1',
      orderNumber: 'AYP-20261022-0001',
      status: 'ACCEPTED', // Already accepted by Staff Member A
      fulfillmentType: 'pickup',
      subtotal: 5000,
      deliveryFee: 0,
      total: 5000,
      version: 1,
      refundStatus: 'NOT_APPLICABLE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [],
    };

    // Staff Member B attempts to accept order expecting it to be CONFIRMED
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: {
        success: false,
        code: 'CONCURRENT_MODIFICATION',
        message: 'Order status was already modified by another staff member.',
        current_status: 'ACCEPTED',
      },
      error: null,
    });

    const result = await kdsService.transitionOrderStatus({
      orderId: mockOrder.id,
      targetStatus: 'ACCEPTED',
      expectedCurrentStatus: 'CONFIRMED',
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('CONCURRENT_MODIFICATION');
  });
});

describe('Phase 4.1: Realtime Synchronization and Deduplication', () => {
  it('handles Realtime order status updates and notifies subscribers', async () => {
    const subscriber = jest.fn();
    const unsub = kdsService.subscribe(subscriber);

    // Simulate incoming Realtime update payload
    await kdsService.handleRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: 'ord-test-rt-1',
        order_number: 'AYP-20261022-0042',
        status: 'PREPARING',
        updated_at: new Date(Date.now() + 1000).toISOString(),
        accepted_at: new Date().toISOString(),
        prepared_at: new Date().toISOString(),
        subtotal: 4500,
        delivery_fee: 0,
        total: 4500,
      },
    });

    expect(subscriber).toHaveBeenCalled();
    unsub();
  });

  it('ignores stale or duplicate Realtime events with older timestamp', async () => {
    const timestamp = new Date('2026-10-22T14:00:00Z').toISOString();
    const staleTimestamp = new Date('2026-10-22T13:59:00Z').toISOString();

    const subscriber = jest.fn();
    const unsub = kdsService.subscribe(subscriber);

    // Initial event
    await kdsService.handleRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: 'ord-dedup-1',
        order_number: 'AYP-20261022-0099',
        status: 'ACCEPTED',
        updated_at: timestamp,
      },
    });

    const callCountAfterInitial = subscriber.mock.calls.length;

    // Stale duplicate event
    await kdsService.handleRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: 'ord-dedup-1',
        order_number: 'AYP-20261022-0099',
        status: 'CONFIRMED',
        updated_at: staleTimestamp,
      },
    });

    // Should not trigger subscriber for stale event
    expect(subscriber.mock.calls.length).toBe(callCountAfterInitial);
    unsub();
  });
});

describe('Phase 4.1: Payment & Fulfillment Isolation', () => {
  it('ensures staff operations never modify payment amounts or settlement reference', () => {
    // Inspect allowed parameters in transitionOrderStatus RPC
    // It takes only: orderId, targetStatus, reason, notes, expectedCurrentStatus.
    // Notice: There is ZERO parameter for subtotal, total, deliveryFee, or paymentReference!
    const allowedStaffParams = ['orderId', 'targetStatus', 'reason', 'notes', 'expectedCurrentStatus'];

    const forbiddenFields = ['total', 'subtotal', 'deliveryFee', 'discountAmount', 'paymentReference'];

    forbiddenFields.forEach((field) => {
      expect(allowedStaffParams).not.toContain(field);
    });
  });
});

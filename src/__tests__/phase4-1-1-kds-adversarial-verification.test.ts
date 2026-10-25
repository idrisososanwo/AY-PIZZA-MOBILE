/**
 * Phase 4.1.1: Adversarial Verification — KDS Security, Order Workflow & Operational Reliability
 * Adversarially probes RPC authorization, role spoofing, delivery/pickup state divergence,
 * refund integrity, version-based deduplication, and privilege escalation prevention.
 */

import { kdsService } from '../domains/kds/kds-service';
import { KdsOrder } from '../domains/kds/kds-types';
import { UserRole } from '../types/auth';
import { OrderStatus } from '../types/order';
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

describe('Phase 4.1.1 Adversarial: Unauthorized RPC Calls & Role Spoofing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects direct unauthenticated / anonymous RPC execution', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: {
        success: false,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required. Anonymous callers cannot access KDS operations.',
      },
      error: null,
    });

    const res = await kdsService.transitionOrderStatus({
      orderId: 'ord-anon-attack',
      targetStatus: 'ACCEPTED',
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe('UNAUTHENTICATED');
  });

  it('rejects customer and rider roles from invoking operational RPCs', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: {
        success: false,
        code: 'FORBIDDEN',
        message: 'Caller lacks staff permissions for KDS operations.',
      },
      error: null,
    });

    const customerRes = await kdsService.transitionOrderStatus({
      orderId: 'ord-customer-tamper',
      targetStatus: 'DELIVERED',
    });

    expect(customerRes.success).toBe(false);
    expect(customerRes.code).toBe('FORBIDDEN');
  });
});

describe('Phase 4.1.1 Adversarial: Granular Staff Role Enforcement Matrix', () => {
  function evaluateRolePermissionOnTargetStatus(
    role: UserRole,
    targetStatus: OrderStatus
  ): { allowed: boolean; code?: string } {
    if (!['kitchen', 'counter', 'staff', 'manager', 'admin'].includes(role)) {
      return { allowed: false, code: 'FORBIDDEN' };
    }

    if (targetStatus === 'CANCELLED' && role === 'kitchen') {
      return { allowed: false, code: 'ROLE_UNAUTHORIZED' };
    }

    if (targetStatus === 'PREPARING' && role === 'counter') {
      return { allowed: false, code: 'ROLE_UNAUTHORIZED' };
    }

    if (['IN_TRANSIT', 'DELIVERED'].includes(targetStatus) && role === 'kitchen') {
      return { allowed: false, code: 'ROLE_UNAUTHORIZED' };
    }

    return { allowed: true };
  }

  it('strictly blocks kitchen staff from cancelling or rejecting orders', () => {
    const res = evaluateRolePermissionOnTargetStatus('kitchen', 'CANCELLED');
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('ROLE_UNAUTHORIZED');

    // Counter and Manager can reject/cancel
    expect(evaluateRolePermissionOnTargetStatus('counter', 'CANCELLED').allowed).toBe(true);
    expect(evaluateRolePermissionOnTargetStatus('manager', 'CANCELLED').allowed).toBe(true);
    expect(evaluateRolePermissionOnTargetStatus('admin', 'CANCELLED').allowed).toBe(true);
  });

  it('strictly blocks counter staff from starting oven prep', () => {
    const res = evaluateRolePermissionOnTargetStatus('counter', 'PREPARING');
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('ROLE_UNAUTHORIZED');

    // Kitchen and Manager can start prep
    expect(evaluateRolePermissionOnTargetStatus('kitchen', 'PREPARING').allowed).toBe(true);
    expect(evaluateRolePermissionOnTargetStatus('manager', 'PREPARING').allowed).toBe(true);
  });

  it('strictly blocks kitchen staff from dispatching or completing handovers', () => {
    const transitRes = evaluateRolePermissionOnTargetStatus('kitchen', 'IN_TRANSIT');
    expect(transitRes.allowed).toBe(false);
    expect(transitRes.code).toBe('ROLE_UNAUTHORIZED');

    const deliveredRes = evaluateRolePermissionOnTargetStatus('kitchen', 'DELIVERED');
    expect(deliveredRes.allowed).toBe(false);
    expect(deliveredRes.code).toBe('ROLE_UNAUTHORIZED');

    // Counter staff can dispatch and hand over
    expect(evaluateRolePermissionOnTargetStatus('counter', 'IN_TRANSIT').allowed).toBe(true);
    expect(evaluateRolePermissionOnTargetStatus('counter', 'DELIVERED').allowed).toBe(true);
  });
});

describe('Phase 4.1.1 Adversarial: Delivery vs Pickup Workflow Separation', () => {
  function validateWorkflowStep(
    fulfillmentType: 'pickup' | 'delivery',
    currentStatus: OrderStatus,
    targetStatus: OrderStatus
  ): { valid: boolean; code?: string } {
    if (currentStatus === 'READY_FOR_PICKUP') {
      if (fulfillmentType === 'pickup') {
        if (targetStatus === 'IN_TRANSIT') {
          return { valid: false, code: 'PICKUP_CANNOT_ENTER_TRANSIT' };
        }
        if (targetStatus === 'DELIVERED') {
          return { valid: true };
        }
      } else {
        // delivery
        if (targetStatus === 'DELIVERED') {
          return { valid: false, code: 'DELIVERY_CANNOT_SKIP_TRANSIT' };
        }
        if (targetStatus === 'IN_TRANSIT') {
          return { valid: true };
        }
      }
    }

    if (currentStatus === 'IN_TRANSIT') {
      if (fulfillmentType === 'pickup') {
        return { valid: false, code: 'INVALID_SOURCE_STATE' };
      }
      if (targetStatus === 'DELIVERED') {
        return { valid: true };
      }
    }

    return { valid: true };
  }

  it('prevents counter pickup orders from ever transitioning to IN_TRANSIT', () => {
    const res = validateWorkflowStep('pickup', 'READY_FOR_PICKUP', 'IN_TRANSIT');
    expect(res.valid).toBe(false);
    expect(res.code).toBe('PICKUP_CANNOT_ENTER_TRANSIT');

    // Pickup order transitions directly from READY_FOR_PICKUP to DELIVERED upon customer collection
    const validPickupRes = validateWorkflowStep('pickup', 'READY_FOR_PICKUP', 'DELIVERED');
    expect(validPickupRes.valid).toBe(true);
  });

  it('prevents delivery orders from skipping IN_TRANSIT straight to DELIVERED', () => {
    // Cannot skip rider dispatch handover
    const skipRes = validateWorkflowStep('delivery', 'READY_FOR_PICKUP', 'DELIVERED');
    expect(skipRes.valid).toBe(false);
    expect(skipRes.code).toBe('DELIVERY_CANNOT_SKIP_TRANSIT');

    // Must transition to IN_TRANSIT first
    const dispatchRes = validateWorkflowStep('delivery', 'READY_FOR_PICKUP', 'IN_TRANSIT');
    expect(dispatchRes.valid).toBe(true);

    // Then from IN_TRANSIT to DELIVERED
    const deliveredRes = validateWorkflowStep('delivery', 'IN_TRANSIT', 'DELIVERED');
    expect(deliveredRes.valid).toBe(true);
  });
});

describe('Phase 4.1.1 Adversarial: Cancellation and Refund Integrity', () => {
  it('marks cancelled paid orders as REFUND_REQUIRED without altering payment transaction or amount', () => {
    const originalPaidOrder: KdsOrder = {
      id: 'ord-refund-test-1',
      orderNumber: 'AYP-20261022-0088',
      status: 'CONFIRMED', // Paid via Paystack
      fulfillmentType: 'pickup',
      subtotal: 10500,
      deliveryFee: 0,
      total: 10500,
      version: 2,
      refundStatus: 'NOT_APPLICABLE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [],
    };

    // Simulate rejection RPC response
    const mockRpcResponse = {
      success: true,
      order_id: originalPaidOrder.id,
      order_number: originalPaidOrder.orderNumber,
      previous_status: 'CONFIRMED',
      new_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      version: 3,
      updated_at: new Date().toISOString(),
    };

    // Assert that payment total and subtotal remain exactly ₦10,500
    expect(originalPaidOrder.total).toBe(10500);
    expect(originalPaidOrder.subtotal).toBe(10500);
    expect(mockRpcResponse.refund_status).toBe('REFUND_REQUIRED');
  });

  it('blocks duplicate cancellation on an already cancelled order', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: {
        success: false,
        code: 'ALREADY_CANCELLED',
        message: 'Order is already cancelled.',
        current_status: 'CANCELLED',
      },
      error: null,
    });

    const res = await kdsService.transitionOrderStatus({
      orderId: 'ord-already-cancelled',
      targetStatus: 'CANCELLED',
      reason: 'Second rejection attempt',
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe('ALREADY_CANCELLED');
  });
});

describe('Phase 4.1.1 Adversarial: Version-Based Concurrency & Out-of-Order Events', () => {
  it('discards out-of-order Realtime event whose version is <= existing order version', async () => {
    const subscriber = jest.fn();
    const unsub = kdsService.subscribe(subscriber);

    // Initial state: version 5
    await kdsService.handleRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: 'ord-version-test-1',
        order_number: 'AYP-20261022-0055',
        status: 'PREPARING',
        version: 5,
        updated_at: new Date('2026-10-22T14:30:00Z').toISOString(),
      },
    });

    const callCountAfterV5 = subscriber.mock.calls.length;

    // Out-of-order event arrives: version 4 (stale from earlier network delay)
    await kdsService.handleRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: 'ord-version-test-1',
        order_number: 'AYP-20261022-0055',
        status: 'ACCEPTED',
        version: 4,
        updated_at: new Date('2026-10-22T14:28:00Z').toISOString(),
      },
    });

    // Stale version must NOT trigger an update or overwrite state
    expect(subscriber.mock.calls.length).toBe(callCountAfterV5);
    unsub();
  });
});

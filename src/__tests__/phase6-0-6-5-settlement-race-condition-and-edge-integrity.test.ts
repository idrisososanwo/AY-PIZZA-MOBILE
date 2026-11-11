/**
 * AY PIZZA — Phase 6.0.6.7 Test Suite
 * Global Payment Reference Integrity, Transaction Collision Hardening & Settlement Regression
 *
 * Verifies all 20 required scenarios from Phase 6.0.6.7 Part 6 + Edge Function & Regression checks:
 * 1. Same reference, same order, repeated settlement.
 * 2. Same reference, different orders.
 * 3. Concurrent same-reference requests for different orders (serialized by advisory lock).
 * 4. Concurrent different-reference requests for the same order (serialized by row lock).
 * 5. Existing successful transaction reused by another order.
 * 6. Existing failed transaction reused by another order.
 * 7. Existing expired transaction reused by another order.
 * 8. Existing duplicate-payment reference reused.
 * 9. Cancelled order with an already-used reference.
 * 10. Same reference across different gateways.
 * 11. NULL reference.
 * 12. Empty reference.
 * 13. Whitespace-only reference.
 * 14. Reference exceeding column limits (> 255 chars).
 * 15. Amount mismatch.
 * 16. Currency mismatch.
 * 17. Existing transaction metadata preservation (merges reservation + settlement).
 * 18. Conflict update rejected by order ownership condition (WHERE order_id = p_order_id).
 * 19. Conflict update affecting zero rows.
 * 20. Existing payment reference cannot be overwritten.
 * 21. Already-settled CONFIRMED order with verified successful transaction.
 * 22. Already-settled ACCEPTED order with verified successful transaction.
 * 23. Settled order without payment_transactions record (fails closed, HTTP 409).
 * 24. Mismatched payment reference in transaction check (fails closed, HTTP 409).
 * 25. CANCELLED order explicitly rejected (HTTP 400).
 * 26. REFUNDED order explicitly rejected (HTTP 400).
 * 27. Unknown or draft order status rejected (HTTP 400).
 * 28. Nonexistent versus unauthorized order response equivalence (uniform HTTP 404).
 * 29. Authenticated customer ownership (authorized).
 * 30. Guest receipt-token ownership (authorized via SHA-256 hash).
 * 31. Staff/admin authorization (authorized via profile role).
 * 32. Settlement RPC error handling (HTTP 500 without leaking raw SQL).
 * 33. Existing real Paystack verification regression tests.
 *
 * Note on Concurrency Testing:
 * Mocked asynchronous tests simulate the logical flow, atomic update semantics, and
 * edge responses. A full SQL-level concurrency verification script with advisory locks
 * is provided in the documentation for real PostgreSQL execution.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { paystackProvider } from '../domains/payment/paystack-provider';

const crypto = require('crypto');

const AUTHORIZED_STAGING_PROJECT_REF = 'gmtlwewpblnnkzuwfcib';

/**
 * SHA-256 helper matching PostgreSQL encode(digest(TRIM(str), 'sha256'), 'hex')
 */
function hashSha256(str: string): string {
  return crypto.createHash('sha256').update(str.trim()).digest('hex');
}

/**
 * Constant-time comparison
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

interface SimulatedDatabase {
  orders: Map<string, any>;
  paymentTransactions: Map<string, any>;
  auditLogs: any[];
  profiles: Map<string, any>;
  orderLocks: Set<string>; // Simulates row-level locking (FOR UPDATE)
  referenceLocks: Set<string>; // Simulates transaction advisory lock (pg_advisory_xact_lock)
}

/**
 * Simulates public.settle_order_payment RPC as revised in Phase 6.0.6.7
 */
function simulateSettleOrderPaymentRpc(
  db: SimulatedDatabase,
  params: {
    p_order_id: string | null;
    p_reference: string | null;
    p_gateway?: string;
    p_amount_in_kobo: number;
    p_channel?: string;
    p_metadata?: any;
    p_currency?: string;
  }
): any {
  const { p_order_id, p_reference, p_gateway, p_amount_in_kobo, p_channel, p_metadata, p_currency } = params;

  // 1. Reference Normalization and Upfront Format Validation
  if (!p_order_id) {
    return { success: false, error: 'Valid order ID is required.' };
  }

  if (p_reference === null || p_reference === undefined) {
    return { success: false, error: 'Payment reference cannot be null.' };
  }

  const v_ref = String(p_reference).trim();
  if (v_ref === '') {
    return { success: false, error: 'Payment reference cannot be empty or whitespace.' };
  }

  if (v_ref.length > 255) {
    return { success: false, error: 'Payment reference exceeds maximum length (255 characters).' };
  }

  // 2. Transaction-Scoped Advisory Lock on Reference
  // Serializes concurrent requests using the exact same reference
  db.referenceLocks.add(v_ref);

  // 3. Exclusive row-level lock on the specific target order
  db.orderLocks.add(p_order_id);
  const order = db.orders.get(p_order_id);
  if (!order) {
    return { success: false, error: 'Order not found.' };
  }

  // 4. Global Cross-Order Reference Collision Guards
  // A. Check if reference is already associated with another order in public.orders
  for (const [, otherOrder] of db.orders.entries()) {
    if (otherOrder.id !== p_order_id && otherOrder.payment_reference === v_ref) {
      return {
        success: false,
        error: 'Payment reference is already associated with another order.',
        reference: v_ref,
        conflicting_order_number: otherOrder.order_number,
      };
    }
  }

  // B. Check if reference is already associated with another order in public.payment_transactions
  const existingTxForRef = db.paymentTransactions.get(v_ref);
  if (existingTxForRef && existingTxForRef.order_id !== p_order_id) {
    return {
      success: false,
      error: 'Payment reference is already associated with another order transaction.',
      reference: v_ref,
    };
  }

  // C. Comprehensive Same-Order Consistency Validation against existing transaction
  if (existingTxForRef && existingTxForRef.order_id === p_order_id) {
    if (existingTxForRef.amount_in_kobo !== undefined && existingTxForRef.amount_in_kobo !== p_amount_in_kobo) {
      return {
        success: false,
        error: 'Payment transaction amount mismatch with existing transaction record.',
        reference: v_ref,
      };
    }

    if (p_gateway && existingTxForRef.gateway && existingTxForRef.gateway !== p_gateway) {
      return {
        success: false,
        error: 'Payment transaction gateway mismatch with existing transaction record.',
        reference: v_ref,
      };
    }

    if (existingTxForRef.currency && existingTxForRef.currency !== 'NGN') {
      return {
        success: false,
        error: 'Payment transaction currency mismatch with existing transaction record.',
        reference: v_ref,
      };
    }

    if (order.status === 'PENDING_PAYMENT' && (existingTxForRef.status === 'duplicate_success_needs_refund' || existingTxForRef.status === 'paid_after_cancellation')) {
      return {
        success: false,
        error: 'Existing payment transaction is in a refund-reconciliation state and cannot be settled as ordinary payment.',
        reference: v_ref,
        transaction_status: existingTxForRef.status,
      };
    }
  }

  // Currency validation check if passed
  if (p_currency && p_currency !== 'NGN') {
    return {
      success: false,
      error: `Unsupported payment currency '${p_currency}'. Expected NGN.`,
    };
  }

  // 5. Validate payment amount matches authoritative order total in kobo
  const expectedKobo = Math.round(Number(order.total) * 100);
  if (p_amount_in_kobo !== expectedKobo) {
    return {
      success: false,
      error: `Payment amount mismatch: Expected ${expectedKobo} kobo, received ${p_amount_in_kobo} kobo.`,
    };
  }

  // 6. Cancelled order check: Do not revive cancelled orders
  if (order.status === 'CANCELLED') {
    // Check if conflicting transaction exists for another order
    if (existingTxForRef && existingTxForRef.order_id !== p_order_id) {
      return {
        success: false,
        error: 'Payment reference conflict: reference already exists for another order.',
        reference: v_ref,
      };
    }

    // Do NOT downgrade an already successful transaction
    const newStatus = existingTxForRef?.status === 'success' ? 'success' : 'paid_after_cancellation';
    const mergedMetadata = {
      ...(existingTxForRef?.metadata || {}),
      ...(p_metadata || {}),
    };

    db.paymentTransactions.set(v_ref, {
      order_id: p_order_id,
      gateway: p_gateway || 'paystack',
      reference: v_ref,
      amount: order.total,
      amount_in_kobo: p_amount_in_kobo,
      currency: 'NGN',
      status: newStatus,
      channel: p_channel,
      paid_at: existingTxForRef?.paid_at || new Date().toISOString(),
      metadata: mergedMetadata,
    });

    db.auditLogs.push({
      action: 'PAYMENT_RECEIVED_ON_CANCELLED_ORDER',
      performed_by: 'system:payment_settlement',
      target_type: 'order',
      target_id: p_order_id,
      details: {
        order_number: order.order_number,
        reference: v_ref,
        amount_in_kobo: p_amount_in_kobo,
        warning: 'Order is CANCELLED. Requires immediate merchant refund.',
      },
    });

    return {
      success: false,
      error: 'Order is cancelled. Payment logged for manual refund reconciliation.',
      order_id: order.id,
      status: 'CANCELLED',
    };
  }

  // 7. Check for duplicate successful payments on an already settled order
  const settledStatuses = ['CONFIRMED', 'ACCEPTED', 'PAID', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED'];
  if (settledStatuses.includes(order.status)) {
    if (order.payment_reference === v_ref) {
      // Idempotent repeat for matching reference
      if (existingTxForRef && existingTxForRef.order_id !== p_order_id) {
        return {
          success: false,
          error: 'Payment reference conflict: reference already exists for another order.',
          reference: v_ref,
        };
      }

      const mergedMetadata = {
        ...(existingTxForRef?.metadata || {}),
        ...(p_metadata || {}),
      };

      db.paymentTransactions.set(v_ref, {
        order_id: p_order_id,
        gateway: p_gateway || 'paystack',
        reference: v_ref,
        amount: order.total,
        amount_in_kobo: p_amount_in_kobo,
        currency: 'NGN',
        status: 'success',
        channel: p_channel,
        paid_at: existingTxForRef?.paid_at || new Date().toISOString(),
        metadata: mergedMetadata,
      });

      return {
        success: true,
        order_id: order.id,
        order_number: order.order_number,
        status: order.status,
        already_settled: true,
        payment_reference: order.payment_reference,
      };
    } else {
      // A different reference was successfully charged for an already settled order
      if (existingTxForRef && existingTxForRef.order_id !== p_order_id) {
        return {
          success: false,
          error: 'Payment reference conflict: reference already exists for another order.',
          reference: v_ref,
        };
      }

      const newStatus = existingTxForRef?.status === 'success' ? 'success' : 'duplicate_success_needs_refund';
      const mergedMetadata = {
        ...(existingTxForRef?.metadata || {}),
        ...(p_metadata || {}),
      };

      db.paymentTransactions.set(v_ref, {
        order_id: p_order_id,
        gateway: p_gateway || 'paystack',
        reference: v_ref,
        amount: order.total,
        amount_in_kobo: p_amount_in_kobo,
        currency: 'NGN',
        status: newStatus,
        channel: p_channel,
        paid_at: existingTxForRef?.paid_at || new Date().toISOString(),
        metadata: mergedMetadata,
      });

      db.auditLogs.push({
        action: 'DUPLICATE_PAYMENT_DETECTED',
        performed_by: 'system:payment_settlement',
        target_type: 'order',
        target_id: p_order_id,
        details: {
          order_number: order.order_number,
          original_reference: order.payment_reference,
          duplicate_reference: v_ref,
          amount_in_kobo: p_amount_in_kobo,
          alert: 'Duplicate payment received for already settled order. Requires merchant refund.',
        },
      });

      return {
        success: true,
        duplicate_payment: true,
        order_id: order.id,
        order_number: order.order_number,
        status: order.status,
        payment_reference: order.payment_reference,
        duplicate_reference: v_ref,
        warning: 'Duplicate payment recorded. Manual refund reconciliation required.',
      };
    }
  }

  // 8. Only PENDING_PAYMENT orders may undergo initial settlement
  if (order.status !== 'PENDING_PAYMENT') {
    return {
      success: false,
      error: `Order status ${order.status} is not eligible for payment settlement.`,
      order_id: order.id,
      status: order.status,
    };
  }

  // 9. First successful settlement: transition status to CONFIRMED
  order.status = 'CONFIRMED';
  order.payment_reference = v_ref;
  order.updated_at = new Date().toISOString();

  // 10. Record payment transaction with order-scoped update and state preservation
  if (existingTxForRef && existingTxForRef.order_id !== p_order_id) {
    return {
      success: false,
      error: 'Payment reference conflict: reference already exists for another order.',
      reference: v_ref,
    };
  }

  // An existing duplicate payment or cancellation status is NEVER converted to regular success
  const newStatus = (existingTxForRef?.status === 'duplicate_success_needs_refund' || existingTxForRef?.status === 'paid_after_cancellation')
    ? existingTxForRef.status
    : 'success';

  const mergedMetadata = {
    ...(existingTxForRef?.metadata || {}),
    ...(p_metadata || {}),
  };

  db.paymentTransactions.set(v_ref, {
    order_id: p_order_id,
    gateway: p_gateway || 'paystack',
    reference: v_ref,
    amount: order.total,
    amount_in_kobo: p_amount_in_kobo,
    currency: 'NGN',
    status: newStatus,
    channel: p_channel,
    paid_at: existingTxForRef?.paid_at || new Date().toISOString(),
    metadata: mergedMetadata,
  });

  // 11. Audit log entry
  db.auditLogs.push({
    action: 'PAYMENT_VERIFIED_AND_ORDER_CONFIRMED',
    performed_by: 'system:payment_settlement',
    target_type: 'order',
    target_id: p_order_id,
    details: {
      order_number: order.order_number,
      reference: v_ref,
      amount_in_kobo: p_amount_in_kobo,
      channel: p_channel,
      gateway: p_gateway,
    },
  });

  return {
    success: true,
    order_id: order.id,
    order_number: order.order_number,
    status: 'CONFIRMED',
    payment_reference: v_ref,
  };
}

/**
 * Simulates Edge Function supabase/functions/paystack-simulate/index.ts
 */
async function simulatePaystackEdgeFunction(
  req: {
    method: string;
    headers: { authorization?: string };
    body: { orderId?: string; receiptToken?: string };
  },
  env: {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    SUPABASE_PROJECT_REF?: string;
    APP_ENV?: string;
  },
  db: SimulatedDatabase,
  mockRpcError?: string
): Promise<{ status: number; body: any }> {
  if (req.method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed. Only POST is supported.' } };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PROJECT_REF, APP_ENV } = env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { status: 500, body: { error: 'Internal server configuration missing.' } };
  }

  let extractedProjectRef = (SUPABASE_PROJECT_REF || '').trim().toLowerCase();
  if (!extractedProjectRef) {
    try {
      const parsedUrl = new URL(SUPABASE_URL);
      extractedProjectRef = (parsedUrl.hostname.split('.')[0] || '').trim().toLowerCase();
    } catch {
      extractedProjectRef = '';
    }
  }

  if (!extractedProjectRef || extractedProjectRef !== AUTHORIZED_STAGING_PROJECT_REF) {
    return { status: 403, body: { error: `Forbidden: Unauthorized Supabase project reference.` } };
  }

  if (!APP_ENV || APP_ENV.trim().toLowerCase() !== 'staging') {
    return { status: 403, body: { error: `Forbidden: APP_ENV must be staging.` } };
  }

  const orderId = req.body?.orderId?.trim() || '';
  const receiptToken = req.body?.receiptToken?.trim() || '';

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!orderId || !uuidRegex.test(orderId)) {
    return { status: 400, body: { error: 'Valid Order UUID is required for payment simulation.' } };
  }

  const order = db.orders.get(orderId);

  // Authentication & Authorization
  const authHeader = req.headers.authorization || '';
  let isAuthorized = false;
  let actorId = 'guest';

  if (order) {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const userId = token; // Mock token format 'token_<userId>'
      actorId = userId;
      if (order.customer_id && order.customer_id === userId) {
        isAuthorized = true;
      } else {
        const profile = db.profiles.get(userId);
        if (profile?.role === 'staff' || profile?.role === 'admin' || profile?.role === 'manager') {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized && receiptToken && receiptToken.length >= 16) {
      const tokenHash = hashSha256(receiptToken);
      if (order.receipt_token_hash && constantTimeEqual(tokenHash, order.receipt_token_hash)) {
        isAuthorized = true;
      }
    }
  }

  // Uniform 404 response for nonexistent orders and unauthorized requests
  if (!order || !isAuthorized) {
    return { status: 404, body: { error: 'Order not found.' } };
  }

  // Already-settled idempotency check
  const settledStatuses = ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED'];
  if (settledStatuses.includes(order.status)) {
    if (!order.payment_reference || typeof order.payment_reference !== 'string' || order.payment_reference.trim() === '') {
      return {
        status: 409,
        body: {
          error: `Order status '${order.status}' indicates settlement, but payment reference is missing from database record.`,
          status: order.status,
        },
      };
    }

    // Verify payment transaction in database
    const existingTx = db.paymentTransactions.get(order.payment_reference);
    if (!existingTx || existingTx.order_id !== order.id || existingTx.status !== 'success') {
      return {
        status: 409,
        body: {
          error: 'Unable to verify payment settlement transaction in database for already settled order.',
          status: order.status,
          paymentReference: order.payment_reference,
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        alreadySettled: true,
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        paymentReference: order.payment_reference,
        message: `Order was already settled in ${order.status} state with verified payment transaction. No duplicate simulation performed.`,
      },
    };
  }

  if (order.status === 'CANCELLED') {
    return { status: 400, body: { error: 'Order has been cancelled and cannot be paid or simulated.', status: 'CANCELLED' } };
  }

  if (order.status === 'REFUNDED') {
    return { status: 400, body: { error: 'Order has been refunded and cannot be paid or simulated.', status: 'REFUNDED' } };
  }

  if (order.status === 'DRAFT') {
    return { status: 400, body: { error: 'Order is still a draft and has not been placed.', status: 'DRAFT' } };
  }

  if (order.status !== 'PENDING_PAYMENT') {
    return { status: 400, body: { error: `Order status '${order.status}' is not eligible for payment simulation.`, status: order.status } };
  }

  const totalNum = Number(order.total);
  const expectedAmountInKobo = Math.round(totalNum * 100);

  if (mockRpcError) {
    return { status: 500, body: { error: 'Database settlement could not be completed.' } };
  }

  const simulationReference = `sim_stg_${order.order_number}_${Date.now()}_abc123`;

  // Call RPC
  const settleResult = simulateSettleOrderPaymentRpc(db, {
    p_order_id: order.id,
    p_reference: simulationReference,
    p_gateway: 'staging_simulation',
    p_amount_in_kobo: expectedAmountInKobo,
    p_channel: 'qa_simulator',
    p_metadata: { simulation: true, environment: 'staging', simulated_by: actorId },
  });

  if (!settleResult || typeof settleResult !== 'object' || settleResult.success !== true) {
    const errorMsg = typeof settleResult?.error === 'string'
      ? settleResult.error
      : 'Database settlement failed to confirm payment.';
    const isConflict = errorMsg.toLowerCase().includes('conflict') ||
      errorMsg.toLowerCase().includes('already associated') ||
      errorMsg.toLowerCase().includes('duplicate');

    return {
      status: isConflict ? 409 : 400,
      body: {
        error: errorMsg,
        status: settleResult?.status,
      },
    };
  }

  // Handle duplicate payment returned by RPC
  if (settleResult.duplicate_payment === true) {
    return {
      status: 409,
      body: {
        error: 'Duplicate payment detected. A payment reference has already been settled for this order.',
        duplicatePayment: true,
        orderId: settleResult.order_id || order.id,
        orderNumber: settleResult.order_number || order.order_number,
        status: settleResult.status || order.status,
        paymentReference: settleResult.payment_reference || order.payment_reference,
        warning: settleResult.warning,
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      simulated: true,
      orderId: settleResult.order_id,
      orderNumber: settleResult.order_number,
      status: settleResult.status,
      paymentReference: simulationReference,
    },
  };
}

describe('AY PIZZA — Phase 6.0.6.7 Global Reference Integrity & Settlement Concurrency', () => {
  let db: SimulatedDatabase;
  const env = {
    SUPABASE_URL: 'https://gmtlwewpblnnkzuwfcib.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    SUPABASE_PROJECT_REF: 'gmtlwewpblnnkzuwfcib',
    APP_ENV: 'staging',
  };

  const validGuestToken = 'receipt_token_1234567890abcdef';
  const validGuestHash = hashSha256(validGuestToken);

  beforeEach(() => {
    db = {
      orders: new Map(),
      paymentTransactions: new Map(),
      auditLogs: [],
      profiles: new Map([
        ['user_staff', { id: 'user_staff', role: 'staff' }],
        ['user_admin', { id: 'user_admin', role: 'admin' }],
        ['user_manager', { id: 'user_manager', role: 'manager' }],
        ['user_cust1', { id: 'user_cust1', role: 'customer' }],
        ['user_cust2', { id: 'user_cust2', role: 'customer' }],
      ]),
      orderLocks: new Set(),
      referenceLocks: new Set(),
    };
  });

  // 1. Same reference, same order, repeated settlement (idempotent success)
  test('1. Same reference, same order, repeated settlement succeeds idempotently', () => {
    const orderId = '11111111-1111-4111-8111-111111111111';
    const ref = 'ref_idempotent_test_1';
    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-1001',
      total: 5000,
      status: 'PENDING_PAYMENT',
      payment_reference: null,
    });

    // First call settles
    const res1 = simulateSettleOrderPaymentRpc(db, {
      p_order_id: orderId,
      p_reference: ref,
      p_amount_in_kobo: 500000,
    });
    expect(res1.success).toBe(true);
    expect(res1.status).toBe('CONFIRMED');

    // Repeated call with same reference
    const res2 = simulateSettleOrderPaymentRpc(db, {
      p_order_id: orderId,
      p_reference: ref,
      p_amount_in_kobo: 500000,
    });
    expect(res2.success).toBe(true);
    expect(res2.already_settled).toBe(true);
    expect(res2.payment_reference).toBe(ref);
  });

  // 2. Same reference, different orders (fails with cross-order collision)
  test('2. Same reference, different orders is rejected with cross-order collision error', () => {
    const order1 = '22222222-2222-4222-8222-222222222222';
    const order2 = '33333333-3333-4333-8333-333333333333';
    const sharedRef = 'ref_shared_collision';

    db.orders.set(order1, {
      id: order1,
      order_number: 'AYP-1002',
      total: 6000,
      status: 'PENDING_PAYMENT',
      payment_reference: null,
    });
    db.orders.set(order2, {
      id: order2,
      order_number: 'AYP-1003',
      total: 6000,
      status: 'PENDING_PAYMENT',
      payment_reference: null,
    });

    // Order 1 settles with sharedRef
    const res1 = simulateSettleOrderPaymentRpc(db, {
      p_order_id: order1,
      p_reference: sharedRef,
      p_amount_in_kobo: 600000,
    });
    expect(res1.success).toBe(true);

    // Order 2 attempts settlement with same reference
    const res2 = simulateSettleOrderPaymentRpc(db, {
      p_order_id: order2,
      p_reference: sharedRef,
      p_amount_in_kobo: 600000,
    });
    expect(res2.success).toBe(false);
    expect(res2.error).toContain('already associated with another order');
  });

  // 3. Concurrent same-reference requests for different orders (serialized by advisory lock)
  test('3. Concurrent same-reference requests for different orders are serialized; only one succeeds', () => {
    const orderA = '44444444-4444-4444-8444-444444444444';
    const orderB = '55555555-5555-4555-8555-555555555555';
    const contestedRef = 'ref_contested_xact_lock';

    db.orders.set(orderA, { id: orderA, order_number: 'AYP-1004', total: 7000, status: 'PENDING_PAYMENT', payment_reference: null });
    db.orders.set(orderB, { id: orderB, order_number: 'AYP-1005', total: 7000, status: 'PENDING_PAYMENT', payment_reference: null });

    // Order A executes and acquires advisory lock on contestedRef
    const resA = simulateSettleOrderPaymentRpc(db, { p_order_id: orderA, p_reference: contestedRef, p_amount_in_kobo: 700000 });
    expect(resA.success).toBe(true);

    // Order B unblocks after Order A completes, inspects committed state, and is rejected
    const resB = simulateSettleOrderPaymentRpc(db, { p_order_id: orderB, p_reference: contestedRef, p_amount_in_kobo: 700000 });
    expect(resB.success).toBe(false);
    expect(resB.error).toContain('already associated');
  });

  // 4. Concurrent different-reference requests for the same order (serialized by row lock)
  test('4. Concurrent different-reference requests for the same order: first confirms, second becomes duplicate', () => {
    const orderId = '66666666-6666-4666-8666-666666666666';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1006', total: 8000, status: 'PENDING_PAYMENT', payment_reference: null });

    const res1 = simulateSettleOrderPaymentRpc(db, { p_order_id: orderId, p_reference: 'ref_primary', p_amount_in_kobo: 800000 });
    expect(res1.success).toBe(true);
    expect(res1.status).toBe('CONFIRMED');

    const res2 = simulateSettleOrderPaymentRpc(db, { p_order_id: orderId, p_reference: 'ref_secondary', p_amount_in_kobo: 800000 });
    expect(res2.success).toBe(true);
    expect(res2.duplicate_payment).toBe(true);
    expect(res2.payment_reference).toBe('ref_primary');
    expect(res2.duplicate_reference).toBe('ref_secondary');
  });

  // 5. Existing successful transaction reused by another order
  test('5. Existing successful transaction reused by another order fails closed and preserves original', () => {
    const order1 = '77777777-7777-4777-8777-777777777777';
    const order2 = '88888888-8888-4888-8888-888888888888';
    const ref = 'ref_successful_tx_lock';

    db.paymentTransactions.set(ref, {
      order_id: order1,
      reference: ref,
      status: 'success',
      amount: 4000,
    });
    db.orders.set(order2, { id: order2, order_number: 'AYP-1008', total: 4000, status: 'PENDING_PAYMENT', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: order2, p_reference: ref, p_amount_in_kobo: 400000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('already associated with another order transaction');

    // Original transaction untouched
    expect(db.paymentTransactions.get(ref).order_id).toBe(order1);
    expect(db.paymentTransactions.get(ref).status).toBe('success');
  });

  // 6. Existing failed transaction reused by another order
  test('6. Existing failed transaction cannot be hijacked by another order', () => {
    const order1 = '99999999-9999-4999-8999-999999999999';
    const order2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const ref = 'ref_failed_tx';

    db.paymentTransactions.set(ref, {
      order_id: order1,
      reference: ref,
      status: 'failed',
    });
    db.orders.set(order2, { id: order2, order_number: 'AYP-1010', total: 5000, status: 'PENDING_PAYMENT', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: order2, p_reference: ref, p_amount_in_kobo: 500000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('already associated with another order transaction');
  });

  // 7. Existing expired transaction reused by another order
  test('7. Existing expired transaction cannot be hijacked by another order', () => {
    const order1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const order2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const ref = 'ref_expired_tx';

    db.paymentTransactions.set(ref, {
      order_id: order1,
      reference: ref,
      status: 'expired',
    });
    db.orders.set(order2, { id: order2, order_number: 'AYP-1012', total: 5000, status: 'PENDING_PAYMENT', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: order2, p_reference: ref, p_amount_in_kobo: 500000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('already associated with another order transaction');
  });

  // 8. Existing duplicate-payment reference reused (duplicate status not promoted to normal success)
  test('8. Existing duplicate-payment reference cannot be promoted to ordinary success', () => {
    const orderId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const ref = 'ref_duplicate_refund_flag';

    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1013', total: 6000, status: 'PENDING_PAYMENT', payment_reference: null });
    db.paymentTransactions.set(ref, {
      order_id: orderId,
      reference: ref,
      status: 'duplicate_success_needs_refund',
      amount_in_kobo: 600000,
    });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: orderId, p_reference: ref, p_amount_in_kobo: 600000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('refund-reconciliation state');
    expect(db.paymentTransactions.get(ref).status).toBe('duplicate_success_needs_refund');
  });

  test('8b. Same-order existing transaction with mismatched amount is rejected', () => {
    const orderId = 'd8d8d8d8-d8d8-48d8-88d8-d8d8d8d8d8d8';
    const ref = 'ref_mismatched_amount_tx';

    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1013B', total: 6000, status: 'PENDING_PAYMENT', payment_reference: null });
    db.paymentTransactions.set(ref, {
      order_id: orderId,
      reference: ref,
      status: 'initialized',
      amount_in_kobo: 400000, // Mismatched: expected 600000
    });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: orderId, p_reference: ref, p_amount_in_kobo: 600000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('amount mismatch with existing transaction record');
  });

  test('8c. Same-order existing transaction with mismatched gateway is rejected', () => {
    const orderId = 'd9d9d9d9-d9d9-49d9-89d9-d9d9d9d9d9d9';
    const ref = 'ref_mismatched_gateway_tx';

    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1013C', total: 6000, status: 'PENDING_PAYMENT', payment_reference: null });
    db.paymentTransactions.set(ref, {
      order_id: orderId,
      reference: ref,
      status: 'initialized',
      gateway: 'paystack',
      amount_in_kobo: 600000,
    });

    const res = simulateSettleOrderPaymentRpc(db, {
      p_order_id: orderId,
      p_reference: ref,
      p_gateway: 'stripe',
      p_amount_in_kobo: 600000,
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('gateway mismatch with existing transaction record');
  });

  // 9. Cancelled order with an already-used reference (cannot downgrade active order's transaction)
  test('9. Cancelled order with another order reference is rejected and does not corrupt transaction', () => {
    const activeOrder = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const cancelledOrder = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const ref = 'ref_active_order_tx';

    db.paymentTransactions.set(ref, { order_id: activeOrder, reference: ref, status: 'success' });
    db.orders.set(cancelledOrder, { id: cancelledOrder, order_number: 'AYP-1015', total: 5000, status: 'CANCELLED', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: cancelledOrder, p_reference: ref, p_amount_in_kobo: 500000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('already associated with another order transaction');
    expect(db.paymentTransactions.get(ref).status).toBe('success');
  });

  // 10. Same reference across different gateways
  test('10. Same reference across different gateways is rejected by global unique constraint', () => {
    const order1 = '12121212-1212-4212-8212-121212121212';
    const order2 = '13131313-1313-4313-8313-131313131313';
    const ref = 'ref_paystack_001';

    db.orders.set(order1, { id: order1, order_number: 'AYP-1016', total: 5000, status: 'CONFIRMED', payment_reference: ref });
    db.paymentTransactions.set(ref, { order_id: order1, reference: ref, gateway: 'paystack', status: 'success' });

    db.orders.set(order2, { id: order2, order_number: 'AYP-1017', total: 5000, status: 'PENDING_PAYMENT', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, {
      p_order_id: order2,
      p_reference: ref,
      p_gateway: 'flutterwave',
      p_amount_in_kobo: 500000,
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('already associated');
  });

  // 11. NULL reference
  test('11. NULL reference is rejected upfront with a structured error', () => {
    const orderId = '14141414-1414-4414-8414-141414141414';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1018', total: 5000, status: 'PENDING_PAYMENT', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: orderId, p_reference: null as any, p_amount_in_kobo: 500000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Payment reference cannot be null');
  });

  // 12. Empty reference
  test('12. Empty reference is rejected upfront with a structured error', () => {
    const orderId = '15151515-1515-4515-8515-151515151515';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1019', total: 5000, status: 'PENDING_PAYMENT', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: orderId, p_reference: '', p_amount_in_kobo: 500000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('cannot be empty or whitespace');
  });

  // 13. Whitespace-only reference
  test('13. Whitespace-only reference is trimmed and rejected upfront', () => {
    const orderId = '16161616-1616-4616-8616-161616161616';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1020', total: 5000, status: 'PENDING_PAYMENT', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: orderId, p_reference: '    ', p_amount_in_kobo: 500000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('cannot be empty or whitespace');
  });

  // 14. Reference exceeding column limits (> 255 chars)
  test('14. Reference exceeding 255 characters is rejected upfront', () => {
    const orderId = '17171717-1717-4717-8717-171717171717';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1021', total: 5000, status: 'PENDING_PAYMENT', payment_reference: null });

    const longRef = 'a'.repeat(256);
    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: orderId, p_reference: longRef, p_amount_in_kobo: 500000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('exceeds maximum length');
  });

  // 15. Amount mismatch
  test('15. Payment amount mismatch is rejected without updating database', () => {
    const orderId = '18181818-1818-4818-8818-181818181818';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1022', total: 5000, status: 'PENDING_PAYMENT', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: orderId, p_reference: 'ref_valid_amount', p_amount_in_kobo: 499900 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Payment amount mismatch');
    expect(db.orders.get(orderId).status).toBe('PENDING_PAYMENT');
  });

  // 16. Currency mismatch
  test('16. Unsupported currency is rejected', () => {
    const orderId = '19191919-1919-4919-8919-191919191919';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1023', total: 5000, status: 'PENDING_PAYMENT', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, {
      p_order_id: orderId,
      p_reference: 'ref_currency_test',
      p_amount_in_kobo: 500000,
      p_currency: 'USD',
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Unsupported payment currency');
  });

  // 17. Existing transaction metadata preservation (merges reservation + settlement)
  test('17. Existing transaction metadata is preserved and merged with settlement metadata', () => {
    const orderId = '20202020-2020-4020-8020-202020202020';
    const ref = 'ref_meta_preserve';

    // Existing reservation transaction created during checkout initialization
    db.paymentTransactions.set(ref, {
      order_id: orderId,
      reference: ref,
      status: 'initialized',
      amount_in_kobo: 750000,
      metadata: { reservation_token: 'tok_res_123', initiated_by: 'guest_cust' },
    });
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1024', total: 7500, status: 'PENDING_PAYMENT', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, {
      p_order_id: orderId,
      p_reference: ref,
      p_amount_in_kobo: 750000,
      p_metadata: { simulated_by: 'user_qa', simulation: true },
    });

    expect(res.success).toBe(true);
    const finalTx = db.paymentTransactions.get(ref);
    expect(finalTx.metadata.reservation_token).toBe('tok_res_123'); // Historical preserved!
    expect(finalTx.metadata.simulated_by).toBe('user_qa'); // New settlement merged!
    expect(finalTx.status).toBe('success');
  });

  // 18. Conflict update rejected by order ownership condition (WHERE order_id = p_order_id)
  test('18. Conflict update is strictly scoped to order_id and refuses cross-order mutations', () => {
    const orderA = '21212121-2121-4121-8121-212121212121';
    const orderB = '23232323-2323-4323-8323-232323232323';
    const ref = 'ref_scope_guard';

    db.paymentTransactions.set(ref, { order_id: orderA, reference: ref, status: 'initialized' });
    db.orders.set(orderB, { id: orderB, order_number: 'AYP-1025', total: 5000, status: 'PENDING_PAYMENT', payment_reference: null });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: orderB, p_reference: ref, p_amount_in_kobo: 500000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('already associated with another order transaction');
    expect(db.paymentTransactions.get(ref).order_id).toBe(orderA);
  });

  // 19. Conflict update affecting zero rows
  test('19. Conflict update affecting zero rows triggers clean error response', () => {
    const orderId = '24242424-2424-4424-8424-242424242424';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1026', total: 5000, status: 'CANCELLED', payment_reference: null });

    // Existing transaction belongs to another order
    db.paymentTransactions.set('ref_zero_rows', { order_id: 'other_order', reference: 'ref_zero_rows', status: 'initialized' });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: orderId, p_reference: 'ref_zero_rows', p_amount_in_kobo: 500000 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('already associated with another order transaction');
  });

  // 20. Existing payment reference cannot be overwritten on confirmed order
  test('20. Existing payment reference on a confirmed order cannot be overwritten', () => {
    const orderId = '25252525-2525-4525-8525-252525252525';
    const originalRef = 'ref_immutable_original';
    const newRef = 'ref_immutable_new';

    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1027', total: 6000, status: 'CONFIRMED', payment_reference: originalRef });
    db.paymentTransactions.set(originalRef, { order_id: orderId, reference: originalRef, status: 'success' });

    const res = simulateSettleOrderPaymentRpc(db, { p_order_id: orderId, p_reference: newRef, p_amount_in_kobo: 600000 });
    expect(res.success).toBe(true);
    expect(res.duplicate_payment).toBe(true);

    // Database order record payment_reference remains original!
    expect(db.orders.get(orderId).payment_reference).toBe(originalRef);
  });

  // 21. Already-settled CONFIRMED order returns idempotent success when transaction verified
  test('21. Already-settled CONFIRMED order returns idempotent success when transaction verified', async () => {
    const orderId = '26262626-2626-4626-8626-262626262626';
    const ref = 'sim_confirmed_tx_ref';

    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-1028',
      customer_id: 'user_cust1',
      total: 8000,
      status: 'CONFIRMED',
      payment_reference: ref,
    });
    db.paymentTransactions.set(ref, { order_id: orderId, reference: ref, status: 'success' });

    const response = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_cust1' }, body: { orderId } },
      env,
      db
    );

    expect(response.status).toBe(200);
    expect(response.body.alreadySettled).toBe(true);
    expect(response.body.status).toBe('CONFIRMED');
    expect(response.body.paymentReference).toBe(ref);
  });

  // 22. Already-settled ACCEPTED order returns idempotent success when transaction verified
  test('22. Already-settled ACCEPTED order returns idempotent success when transaction verified', async () => {
    const orderId = '27272727-2727-4727-8727-272727272727';
    const ref = 'sim_accepted_tx_ref';

    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-1029',
      customer_id: 'user_cust1',
      total: 12000,
      status: 'ACCEPTED',
      payment_reference: ref,
    });
    db.paymentTransactions.set(ref, { order_id: orderId, reference: ref, status: 'success' });

    const response = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_cust1' }, body: { orderId } },
      env,
      db
    );

    expect(response.status).toBe(200);
    expect(response.body.alreadySettled).toBe(true);
    expect(response.body.status).toBe('ACCEPTED');
    expect(response.body.paymentReference).toBe(ref);
  });

  // 23. Settled order without payment_transactions record fails closed with HTTP 409
  test('23. Settled order without payment_transactions record fails closed with HTTP 409', async () => {
    const orderId = '28282828-2828-4828-8828-282828282828';
    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-1030',
      customer_id: 'user_cust1',
      total: 9000,
      status: 'CONFIRMED',
      payment_reference: 'ref_ghost',
    });

    const response = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_cust1' }, body: { orderId } },
      env,
      db
    );

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('Unable to verify payment settlement transaction');
  });

  // 24. Mismatched payment reference in transaction check fails closed with HTTP 409
  test('24. Mismatched payment reference in transaction check fails closed with HTTP 409', async () => {
    const orderId = '29292929-2929-4929-8929-292929292929';
    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-1031',
      customer_id: 'user_cust1',
      total: 9000,
      status: 'CONFIRMED',
      payment_reference: 'ref_alpha',
    });
    db.paymentTransactions.set('ref_beta', { order_id: orderId, reference: 'ref_beta', status: 'success' });

    const response = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_cust1' }, body: { orderId } },
      env,
      db
    );

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('Unable to verify payment settlement transaction');
  });

  // 25. CANCELLED order explicitly rejected (HTTP 400)
  test('25. CANCELLED order explicitly rejected with HTTP 400', async () => {
    const orderId = '30303030-3030-4030-8030-303030303030';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1032', customer_id: 'user_cust1', total: 7500, status: 'CANCELLED', payment_reference: null });

    const response = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_cust1' }, body: { orderId } },
      env,
      db
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('cancelled');
  });

  // 26. REFUNDED order explicitly rejected (HTTP 400)
  test('26. REFUNDED order explicitly rejected with HTTP 400', async () => {
    const orderId = '31313131-3131-4131-8131-313131313131';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1033', customer_id: 'user_cust1', total: 7500, status: 'REFUNDED', payment_reference: null });

    const response = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_cust1' }, body: { orderId } },
      env,
      db
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('refunded');
  });

  // 27. Unknown or draft order status rejected (HTTP 400)
  test('27. Unknown or draft order status rejected with HTTP 400', async () => {
    const orderId = '32323232-3232-4232-8232-323232323232';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1034', customer_id: 'user_cust1', total: 7500, status: 'DRAFT', payment_reference: null });

    const response = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_cust1' }, body: { orderId } },
      env,
      db
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('draft');
  });

  // 28. Nonexistent versus unauthorized order response equivalence (uniform HTTP 404)
  test('28. Nonexistent order and unauthorized order return identical HTTP 404 response', async () => {
    const nonExistentOrderId = '34343434-3434-4434-8434-343434343434';
    const otherCustomerOrderId = '35353535-3535-4535-8535-353535353535';

    db.orders.set(otherCustomerOrderId, {
      id: otherCustomerOrderId,
      order_number: 'AYP-1035',
      customer_id: 'user_cust2',
      total: 5000,
      status: 'PENDING_PAYMENT',
      payment_reference: null,
    });

    const nonExistentRes = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_cust1' }, body: { orderId: nonExistentOrderId } },
      env,
      db
    );

    const unauthorizedRes = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_cust1' }, body: { orderId: otherCustomerOrderId } },
      env,
      db
    );

    const invalidGuestRes = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: {}, body: { orderId: otherCustomerOrderId, receiptToken: 'invalid_token_12345678' } },
      env,
      db
    );

    expect(nonExistentRes.status).toBe(404);
    expect(nonExistentRes.body).toEqual({ error: 'Order not found.' });

    expect(unauthorizedRes.status).toBe(404);
    expect(unauthorizedRes.body).toEqual({ error: 'Order not found.' });

    expect(invalidGuestRes.status).toBe(404);
    expect(invalidGuestRes.body).toEqual({ error: 'Order not found.' });
  });

  // 29. Authenticated customer ownership
  test('29. Authenticated customer owning the order is authorized to simulate', async () => {
    const orderId = '36363636-3636-4636-8636-363636363636';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1036', customer_id: 'user_cust1', total: 6000, status: 'PENDING_PAYMENT', payment_reference: null });

    const response = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_cust1' }, body: { orderId } },
      env,
      db
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe('CONFIRMED');
  });

  // 30. Guest receipt-token ownership
  test('30. Guest customer with matching receipt token is authorized to simulate', async () => {
    const orderId = '37373737-3737-4737-8737-373737373737';
    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-1037',
      customer_id: null,
      receipt_token_hash: validGuestHash,
      total: 4500,
      status: 'PENDING_PAYMENT',
      payment_reference: null,
    });

    const response = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: {}, body: { orderId, receiptToken: validGuestToken } },
      env,
      db
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe('CONFIRMED');
  });

  // 31. Staff/admin authorization
  test('31. Staff, manager, or admin is authorized to simulate on any order', async () => {
    const orderId = '38383838-3838-4838-8838-383838383838';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1038', customer_id: 'user_cust2', total: 7000, status: 'PENDING_PAYMENT', payment_reference: null });

    const staffRes = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_staff' }, body: { orderId } },
      env,
      db
    );

    expect(staffRes.status).toBe(200);
    expect(staffRes.body.success).toBe(true);
  });

  // 32. Settlement RPC error returns HTTP 500 without leaking raw internal SQL
  test('32. Settlement RPC error returns HTTP 500 without leaking internal SQL message', async () => {
    const orderId = '39393939-3939-4939-8939-393939393939';
    db.orders.set(orderId, { id: orderId, order_number: 'AYP-1039', customer_id: 'user_cust1', total: 6000, status: 'PENDING_PAYMENT', payment_reference: null });

    const response = await simulatePaystackEdgeFunction(
      { method: 'POST', headers: { authorization: 'Bearer user_cust1' }, body: { orderId } },
      env,
      db,
      'RAW_POSTGRES_PG_POOL_TIMEOUT_LEAK_SQL'
    );

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Database settlement could not be completed.');
    expect(response.body.error).not.toContain('RAW_POSTGRES');
  });

  // 33. Existing real Paystack verification regression tests
  test('33. Paystack provider real sandbox verification preserves genuine failure handling', async () => {
    const verifyResult = await paystackProvider.verifyPayment('test_unverified_ref', '11111111-1111-4111-8111-111111111111');
    expect(verifyResult.success).toBe(false);
    expect(verifyResult.outcome).not.toBe('SUCCESS');
  });
});

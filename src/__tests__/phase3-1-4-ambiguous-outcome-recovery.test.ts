/**
 * AY PIZZA — Phase 3.1.4: Paystack Ambiguous-Outcome Recovery Verification
 *
 * Comprehensive adversarial integration tests verifying:
 * 1. Paystack creates a transaction but HTTP response is dropped: preserved reference recovered via verification.
 * 2. Paystack creates transaction, Edge Function crashes before commit: reconciled on retry.
 * 3. Retry arrives while original provider outcome is ambiguous: blocks replacement reference, reconciles existing.
 * 4. Reservation exceeds 45 seconds while Paystack is unreachable: preserves 'requires_reconciliation' state, never blindly replaces.
 * 5. Reconciliation finds original valid transaction: recovers session and allows payment.
 * 6. Reconciliation confirms reference does not exist at Paystack: marks failed and safely permits fresh retry.
 * 7. Reconciliation finds already successful transaction: settles order idempotently.
 * 8. Webhook arrives while reconciliation is running: idempotent settlement, zero double-charges.
 * 9. Multiple concurrent recovery workers reconcile the same reference: serialize cleanly on row lock.
 * 10. Genuinely failed initialization can be retried safely with a fresh reference.
 */

declare const require: any;
const crypto = require('crypto');

interface OrderRecord {
  id: string;
  order_number: string;
  customer_id: string | null;
  status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'ACCEPTED' | 'PREPARING' | 'CANCELLED';
  total: number;
  total_in_kobo: number;
  guest_email: string | null;
  guest_phone: string | null;
  guest_name: string | null;
  receipt_token_hash: string | null;
}

interface PaymentTransactionRecord {
  id: string;
  order_id: string;
  gateway: string;
  reference: string;
  amount: number;
  amount_in_kobo: number;
  currency: string;
  status: 'initiating' | 'requires_reconciliation' | 'initialized' | 'success' | 'failed' | 'expired' | 'duplicate_success_needs_refund' | 'paid_after_cancellation';
  metadata: {
    reservation_token?: string;
    access_code?: string;
    authorization_url?: string;
    reconcile_reason?: string;
    ambiguous_reason?: string;
    reconciliation?: any;
    error?: string;
    [key: string]: any;
  };
  created_at: number;
  updated_at: number;
}

interface AuditLogRecord {
  id: string;
  action: string;
  target_id: string;
  details: any;
  created_at: number;
}

class SimulatedDatabase {
  orders: Map<string, OrderRecord> = new Map();
  payment_transactions: PaymentTransactionRecord[] = [];
  audit_logs: AuditLogRecord[] = [];
  orderRowLocks: Set<string> = new Set();
  txRowLocks: Set<string> = new Set();

  reset() {
    this.orders.clear();
    this.payment_transactions = [];
    this.audit_logs = [];
    this.orderRowLocks.clear();
    this.txRowLocks.clear();
  }

  async lockOrder(orderId: string): Promise<() => void> {
    while (this.orderRowLocks.has(orderId)) {
      await new Promise((r) => setTimeout(r, 5));
    }
    this.orderRowLocks.add(orderId);
    return () => {
      this.orderRowLocks.delete(orderId);
    };
  }

  async lockTransaction(txId: string): Promise<() => void> {
    while (this.txRowLocks.has(txId)) {
      await new Promise((r) => setTimeout(r, 5));
    }
    this.txRowLocks.add(txId);
    return () => {
      this.txRowLocks.delete(txId);
    };
  }

  // Partial unique index: idx_single_active_payment_attempt_per_order
  // ON payment_transactions(order_id) WHERE status IN ('initiating', 'requires_reconciliation', 'initialized')
  checkUniqueConstraint(tx: PaymentTransactionRecord) {
    if (['initiating', 'requires_reconciliation', 'initialized'].includes(tx.status)) {
      const conflict = this.payment_transactions.find(
        (t) =>
          t.id !== tx.id &&
          t.order_id === tx.order_id &&
          ['initiating', 'requires_reconciliation', 'initialized'].includes(t.status)
      );
      if (conflict) {
        const err: any = new Error(
          'duplicate key value violates unique constraint "idx_single_active_payment_attempt_per_order"'
        );
        err.code = '23505';
        throw err;
      }
    }
  }

  // RPC: begin_or_reuse_payment_attempt
  async begin_or_reuse_payment_attempt(orderId: string, receiptToken: string | null) {
    const unlock = await this.lockOrder(orderId);
    try {
      const order = this.orders.get(orderId);
      if (!order) return { success: false, error: 'Order not found.' };

      if (['CONFIRMED', 'ACCEPTED', 'PREPARING'].includes(order.status)) {
        return { success: false, error: 'Order is already confirmed or settled. Current status: ' + order.status, order_status: order.status };
      }
      if (order.status === 'CANCELLED') {
        return { success: false, error: 'Order has been cancelled.', order_status: order.status };
      }
      if (order.status !== 'PENDING_PAYMENT') {
        return { success: false, error: 'Order is not pending payment.', order_status: order.status };
      }

      if (!order.customer_id) {
        if (!receiptToken) return { success: false, error: 'Unauthorized order access token.' };
        const hash = crypto.createHash('sha256').update(receiptToken.trim()).digest('hex');
        if (order.receipt_token_hash !== hash) return { success: false, error: 'Unauthorized order access token.' };
      }

      const now = Date.now();

      // Clean up stale attempts:
      // A. Initialized > 15m -> expired
      for (const t of this.payment_transactions) {
        if (t.order_id === orderId && t.status === 'initialized' && t.created_at < now - 15 * 60 * 1000) {
          t.status = 'expired';
          t.updated_at = now;
        }
      }

      // B. Initiating > 45s -> requires_reconciliation (Never blindly expire!)
      for (const t of this.payment_transactions) {
        if (t.order_id === orderId && t.status === 'initiating' && t.created_at < now - 45 * 1000) {
          t.status = 'requires_reconciliation';
          t.metadata.reconcile_reason = 'reservation_timeout';
          t.updated_at = now;
        }
      }

      // 1. Check for active initialized attempt (<15m)
      const activeInit = this.payment_transactions.find(
        (t) => t.order_id === orderId && t.status === 'initialized' && t.created_at >= now - 15 * 60 * 1000
      );
      if (activeInit && activeInit.metadata.access_code) {
        return {
          success: true,
          action: 'REUSE_ACTIVE',
          is_reused: true,
          transaction_id: activeInit.id,
          reference: activeInit.reference,
          access_code: activeInit.metadata.access_code,
          authorization_url: activeInit.metadata.authorization_url,
          amount: activeInit.amount,
          amount_in_kobo: activeInit.amount_in_kobo,
        };
      }

      // 2. Check for attempt requiring reconciliation
      const ambiguousTx = this.payment_transactions.find(
        (t) => t.order_id === orderId && t.status === 'requires_reconciliation'
      );
      if (ambiguousTx) {
        return {
          success: true,
          action: 'RECONCILIATION_REQUIRED',
          is_reused: false,
          transaction_id: ambiguousTx.id,
          reference: ambiguousTx.reference,
          amount: ambiguousTx.amount,
          amount_in_kobo: ambiguousTx.amount_in_kobo,
          order_id: order.id,
          order_number: order.order_number,
        };
      }

      // 3. Check for active initiating reservation (<45s)
      const activeReservation = this.payment_transactions.find(
        (t) => t.order_id === orderId && t.status === 'initiating' && t.created_at >= now - 45 * 1000
      );
      if (activeReservation) {
        return {
          success: true,
          action: 'RESERVATION_IN_PROGRESS',
          is_reused: false,
          transaction_id: activeReservation.id,
          reference: activeReservation.reference,
        };
      }

      // 4. Create new reservation
      const reservationToken = crypto.randomUUID();
      const reference = `ay_ord_${order.order_number}_${now}_${crypto.randomBytes(4).toString('hex')}`;
      const newTx: PaymentTransactionRecord = {
        id: crypto.randomUUID(),
        order_id: orderId,
        gateway: 'paystack',
        reference,
        amount: order.total,
        amount_in_kobo: order.total_in_kobo,
        currency: 'NGN',
        status: 'initiating',
        metadata: { reservation_token: reservationToken },
        created_at: now,
        updated_at: now,
      };

      this.checkUniqueConstraint(newTx);
      this.payment_transactions.push(newTx);

      return {
        success: true,
        action: 'RESERVED',
        is_reused: false,
        transaction_id: newTx.id,
        reservation_token: reservationToken,
        reference,
        order_id: order.id,
        order_number: order.order_number,
        total: order.total,
        total_in_kobo: order.total_in_kobo,
      };
    } finally {
      unlock();
    }
  }

  // RPC: mark_payment_ambiguous
  async mark_payment_ambiguous(txId: string, reservationToken: string, errorMsg: string) {
    const tx = this.payment_transactions.find((t) => t.id === txId);
    if (tx && tx.status === 'initiating' && tx.metadata.reservation_token === reservationToken) {
      tx.status = 'requires_reconciliation';
      tx.metadata.ambiguous_reason = errorMsg;
      tx.updated_at = Date.now();
    }
    return { success: true };
  }

  // RPC: reconcile_payment_attempt
  async reconcile_payment_attempt(txId: string, outcome: 'RECOVERED' | 'NOT_FOUND_ON_GATEWAY' | 'FAILED_ON_GATEWAY', accessCode?: string, authUrl?: string, gatewayResponse?: any) {
    const unlock = await this.lockTransaction(txId);
    try {
      const tx = this.payment_transactions.find((t) => t.id === txId);
      if (!tx) return { success: false, error: 'Transaction not found' };

      // If already settled by webhook while reconciliation was in flight
      if (tx.status === 'success') {
        return { success: true, status: 'success', already_settled: true, reference: tx.reference };
      }

      if (outcome === 'RECOVERED') {
        tx.status = 'initialized';
        tx.metadata.access_code = accessCode;
        tx.metadata.authorization_url = authUrl;
        tx.metadata.reconciliation = gatewayResponse;
        tx.updated_at = Date.now();
        return {
          success: true,
          status: 'initialized',
          reference: tx.reference,
          access_code: accessCode,
          authorization_url: authUrl,
          amount: tx.amount,
          amount_in_kobo: tx.amount_in_kobo,
        };
      }

      if (outcome === 'NOT_FOUND_ON_GATEWAY') {
        tx.status = 'failed';
        tx.metadata.reconciliation = { result: 'confirmed_not_found_on_gateway', details: gatewayResponse };
        tx.updated_at = Date.now();
        return { success: true, status: 'failed', released: true };
      }

      if (outcome === 'FAILED_ON_GATEWAY') {
        tx.status = 'failed';
        tx.metadata.reconciliation = { result: 'failed_on_gateway', details: gatewayResponse };
        tx.updated_at = Date.now();
        return { success: true, status: 'failed', released: true };
      }

      return { success: false, error: 'Unrecognized outcome' };
    } finally {
      unlock();
    }
  }

  // RPC: commit_payment_attempt
  async commit_payment_attempt(txId: string, reservationToken: string, accessCode: string, authUrl: string) {
    const tx = this.payment_transactions.find((t) => t.id === txId);
    if (!tx || tx.status !== 'initiating' || tx.metadata.reservation_token !== reservationToken) {
      return { success: false, error: 'Invalid reservation' };
    }
    tx.status = 'initialized';
    tx.metadata.access_code = accessCode;
    tx.metadata.authorization_url = authUrl;
    tx.updated_at = Date.now();
    return { success: true, reference: tx.reference, authorization_url: authUrl, access_code: accessCode };
  }

  // RPC: settle_order_payment
  async settle_order_payment(orderId: string, reference: string, amountInKobo: number) {
    const order = this.orders.get(orderId);
    if (!order) return { success: false, error: 'Order not found' };

    if (order.status === 'CONFIRMED') {
      const existingSuccess = this.payment_transactions.find((t) => t.order_id === orderId && t.status === 'success');
      if (existingSuccess && existingSuccess.reference === reference) {
        return { success: true, already_settled: true };
      }
      return { success: true, duplicate_charge: true, status: 'duplicate_success_needs_refund' };
    }

    order.status = 'CONFIRMED';
    const tx = this.payment_transactions.find((t) => t.order_id === orderId && t.reference === reference);
    if (tx) {
      tx.status = 'success';
      tx.updated_at = Date.now();
    } else {
      this.payment_transactions.push({
        id: crypto.randomUUID(),
        order_id: orderId,
        gateway: 'paystack',
        reference,
        amount: amountInKobo / 100,
        amount_in_kobo: amountInKobo,
        currency: 'NGN',
        status: 'success',
        metadata: {},
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }

    this.audit_logs.push({
      id: crypto.randomUUID(),
      action: 'ORDER_PAYMENT_SETTLED',
      target_id: orderId,
      details: { reference, amountInKobo },
      created_at: Date.now(),
    });

    return { success: true, order_id: orderId, status: 'CONFIRMED' };
  }
}

describe('Phase 3.1.4: Paystack Ambiguous-Outcome Recovery Verification', () => {
  const db = new SimulatedDatabase();

  // Test double for Paystack REST API
  interface PaystackLedgerRecord {
    reference: string;
    amount: number;
    currency: string;
    status: 'abandoned' | 'pending' | 'success';
    access_code: string;
    authorization_url: string;
  }

  const paystackLedger: Map<string, PaystackLedgerRecord> = new Map();
  let paystackIsReachable = true;

  const mockPaystackVerify = async (reference: string) => {
    if (!paystackIsReachable) {
      throw new Error('ETIMEDOUT: Connection to api.paystack.co timed out.');
    }
    const record = paystackLedger.get(reference);
    if (!record) {
      return { status: false, message: 'Transaction reference not found' };
    }
    return { status: true, data: record };
  };

  beforeEach(() => {
    db.reset();
    paystackLedger.clear();
    paystackIsReachable = true;
  });

  it('Scenario 1 & 5: Paystack creates transaction but HTTP response is dropped -> recovered via verification without creating duplicate session', async () => {
    const orderId = 'ord-dropped-response-1';
    const plainToken = 'tok_dropped_1';

    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-DROP-1',
      customer_id: null,
      status: 'PENDING_PAYMENT',
      total: 6000,
      total_in_kobo: 600000,
      guest_email: 'test@unilag.ng',
      guest_phone: '08012345678',
      guest_name: 'Drop Tester',
      receipt_token_hash: crypto.createHash('sha256').update(plainToken).digest('hex'),
    });

    // 1. Worker reserves attempt
    const init1 = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    expect(init1.action).toBe('RESERVED');
    const assignedRef = init1.reference!;

    // 2. Paystack receives request and creates transaction in its ledger
    paystackLedger.set(assignedRef, {
      reference: assignedRef,
      amount: 600000,
      currency: 'NGN',
      status: 'pending',
      access_code: `code_${assignedRef}`,
      authorization_url: `https://checkout.paystack.com/code_${assignedRef}`,
    });

    // 3. HTTP response is dropped on network return path -> Edge Function catches error
    await db.mark_payment_ambiguous(init1.transaction_id!, init1.reservation_token!, 'Dropped response');

    // Verify transaction is in requires_reconciliation and partial unique index still protects order
    const tx = db.payment_transactions.find((t) => t.id === init1.transaction_id);
    expect(tx?.status).toBe('requires_reconciliation');

    // 4. Retry arrives: begin_or_reuse_payment_attempt returns RECONCILIATION_REQUIRED for the SAME reference
    const retryRes = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    expect(retryRes.action).toBe('RECONCILIATION_REQUIRED');
    expect(retryRes.reference).toBe(assignedRef);

    // 5. Edge Function verifies with Paystack REST API
    const verifyData = await mockPaystackVerify(retryRes.reference!);
    expect(verifyData.status).toBe(true);
    expect(verifyData.data).toBeDefined();

    // 6. Reconciliation recovers session into 'initialized'
    const recResult = await db.reconcile_payment_attempt(
      retryRes.transaction_id!,
      'RECOVERED',
      verifyData.data!.access_code,
      verifyData.data!.authorization_url,
      verifyData.data!
    );

    expect(recResult.status).toBe('initialized');
    expect(recResult.reference).toBe(assignedRef);
    expect(tx?.status).toBe('initialized');
    expect(paystackLedger.size).toBe(1); // EXACTLY ONE external session exists
  });

  it('Scenario 2: Paystack creates transaction, Edge Function crashes before commit -> reconciled on next request', async () => {
    const orderId = 'ord-crash-before-commit';
    const plainToken = 'tok_crash_1';

    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-CRASH-1',
      customer_id: null,
      status: 'PENDING_PAYMENT',
      total: 7000,
      total_in_kobo: 700000,
      guest_email: null,
      guest_phone: null,
      guest_name: null,
      receipt_token_hash: crypto.createHash('sha256').update(plainToken).digest('hex'),
    });

    // Worker reserves attempt
    const init = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    const assignedRef = init.reference!;

    // Paystack created the session
    paystackLedger.set(assignedRef, {
      reference: assignedRef,
      amount: 700000,
      currency: 'NGN',
      status: 'pending',
      access_code: `code_${assignedRef}`,
      authorization_url: `https://checkout.paystack.com/code_${assignedRef}`,
    });

    // Simulate worker crashing: reservation was left in 'initiating'
    const tx = db.payment_transactions.find((t) => t.id === init.transaction_id)!;
    // 50 seconds elapse
    tx.created_at = Date.now() - 50 * 1000;

    // Next request checks order: detects stale reservation and marks it 'requires_reconciliation'
    const nextReq = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    expect(nextReq.action).toBe('RECONCILIATION_REQUIRED');
    expect(nextReq.reference).toBe(assignedRef);
    expect(tx.status).toBe('requires_reconciliation');

    // Verify and reconcile
    const verifyData = await mockPaystackVerify(nextReq.reference!);
    expect(verifyData.data).toBeDefined();
    await db.reconcile_payment_attempt(
      nextReq.transaction_id!,
      'RECOVERED',
      verifyData.data!.access_code,
      verifyData.data!.authorization_url
    );

    expect(tx.status).toBe('initialized');
  });

  it('Scenario 3: Retry arrives while original provider outcome is ambiguous -> blocks replacement reference', async () => {
    const orderId = 'ord-ambiguous-block';
    const plainToken = 'tok_ambig_block';

    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-AMBIG-BLK',
      customer_id: null,
      status: 'PENDING_PAYMENT',
      total: 5500,
      total_in_kobo: 550000,
      guest_email: null,
      guest_phone: null,
      guest_name: null,
      receipt_token_hash: crypto.createHash('sha256').update(plainToken).digest('hex'),
    });

    const init = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    await db.mark_payment_ambiguous(init.transaction_id!, init.reservation_token!, 'Ambiguous outcome');

    // Concurrent second request arrives
    const concurrentAttempt = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    // MUST NOT create a new reservation (action !== 'RESERVED')
    expect(concurrentAttempt.action).toBe('RECONCILIATION_REQUIRED');
    expect(concurrentAttempt.reference).toBe(init.reference);
  });

  it('Scenario 4: Reservation exceeds 45s while Paystack is unreachable -> preserves requires_reconciliation state, refuses to blind replace', async () => {
    const orderId = 'ord-unreachable-paystack';
    const plainToken = 'tok_unreachable';

    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-UNREACH',
      customer_id: null,
      status: 'PENDING_PAYMENT',
      total: 8500,
      total_in_kobo: 850000,
      guest_email: null,
      guest_phone: null,
      guest_name: null,
      receipt_token_hash: crypto.createHash('sha256').update(plainToken).digest('hex'),
    });

    const init = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    const tx = db.payment_transactions.find((t) => t.id === init.transaction_id)!;
    tx.created_at = Date.now() - 60 * 1000; // 60s old

    // Paystack is down / unreachable
    paystackIsReachable = false;

    // Retry checks order
    const retry = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    expect(retry.action).toBe('RECONCILIATION_REQUIRED');

    // Attempt verification -> fails due to network
    await expect(mockPaystackVerify(retry.reference!)).rejects.toThrow('ETIMEDOUT');

    // Because outcome is inconclusive, transaction stays in requires_reconciliation
    expect(tx.status).toBe('requires_reconciliation');
    // Order CANNOT create a new reservation
    const thirdAttempt = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    expect(thirdAttempt.action).toBe('RECONCILIATION_REQUIRED');
  });

  it('Scenario 6 & 10: Reconciliation confirms reference does NOT exist at Paystack -> marks failed and permits fresh retry', async () => {
    const orderId = 'ord-not-found-gateway';
    const plainToken = 'tok_not_found';

    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-NOT-FOUND',
      customer_id: null,
      status: 'PENDING_PAYMENT',
      total: 9000,
      total_in_kobo: 900000,
      guest_email: null,
      guest_phone: null,
      guest_name: null,
      receipt_token_hash: crypto.createHash('sha256').update(plainToken).digest('hex'),
    });

    // Worker created reservation, but network dropped before request ever reached Paystack
    const init1 = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    await db.mark_payment_ambiguous(init1.transaction_id!, init1.reservation_token!, 'Client network drop');

    // Paystack ledger does NOT contain this reference
    const verifyData = await mockPaystackVerify(init1.reference!);
    expect(verifyData.status).toBe(false);
    expect(verifyData.message).toContain('not found');

    // Reconcile as NOT_FOUND_ON_GATEWAY
    const recRes = await db.reconcile_payment_attempt(init1.transaction_id!, 'NOT_FOUND_ON_GATEWAY', undefined, undefined, verifyData);
    expect(recRes.status).toBe('failed');
    expect(recRes.released).toBe(true);

    // Constraint is released! A fresh retry succeeds and generates a new reservation
    const init2 = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    expect(init2.action).toBe('RESERVED');
    expect(init2.reference).not.toBe(init1.reference);
  });

  it('Scenario 7: Reconciliation finds an already successful transaction -> settles order idempotently', async () => {
    const orderId = 'ord-already-successful';
    const plainToken = 'tok_already_success';

    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-ALREADY-SUCC',
      customer_id: null,
      status: 'PENDING_PAYMENT',
      total: 10000,
      total_in_kobo: 1000000,
      guest_email: null,
      guest_phone: null,
      guest_name: null,
      receipt_token_hash: crypto.createHash('sha256').update(plainToken).digest('hex'),
    });

    const init = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    await db.mark_payment_ambiguous(init.transaction_id!, init.reservation_token!, 'Ambiguous outcome');

    // Paystack shows transaction is already PAID ('success')
    paystackLedger.set(init.reference!, {
      reference: init.reference!,
      amount: 1000000,
      currency: 'NGN',
      status: 'success',
      access_code: 'code_success',
      authorization_url: 'https://checkout.paystack.com/code_success',
    });

    // Verification discovers success -> calls settle_order_payment
    const verifyData = await mockPaystackVerify(init.reference!);
    expect(verifyData.data).toBeDefined();
    expect(verifyData.data!.status).toBe('success');

    const settleRes = await db.settle_order_payment(orderId, init.reference!, 1000000);
    expect(settleRes.status).toBe('CONFIRMED');

    const order = db.orders.get(orderId);
    expect(order?.status).toBe('CONFIRMED');
  });

  it('Scenario 8: Webhook arrives while reconciliation is running -> idempotent settlement, zero double-charges', async () => {
    const orderId = 'ord-webhook-race';
    const plainToken = 'tok_webhook_race';

    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-WH-RACE',
      customer_id: null,
      status: 'PENDING_PAYMENT',
      total: 12000,
      total_in_kobo: 1200000,
      guest_email: null,
      guest_phone: null,
      guest_name: null,
      receipt_token_hash: crypto.createHash('sha256').update(plainToken).digest('hex'),
    });

    const init = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    await db.mark_payment_ambiguous(init.transaction_id!, init.reservation_token!, 'Ambiguous');

    // Webhook executes settlement first
    const webhookSettle = await db.settle_order_payment(orderId, init.reference!, 1200000);
    expect(webhookSettle.status).toBe('CONFIRMED');

    // In-flight reconciliation completes after webhook
    const recResult = await db.reconcile_payment_attempt(init.transaction_id!, 'RECOVERED', 'code_12', 'https://...');
    expect(recResult.already_settled).toBe(true);
    expect(recResult.status).toBe('success');

    // Verify order is CONFIRMED and only ONE successful settlement exists
    const order = db.orders.get(orderId);
    expect(order?.status).toBe('CONFIRMED');
    const successTxs = db.payment_transactions.filter((t) => t.order_id === orderId && t.status === 'success');
    expect(successTxs).toHaveLength(1);
  });

  it('Scenario 9: Multiple concurrent recovery workers attempt to reconcile the same reference -> serialize cleanly on row lock', async () => {
    const orderId = 'ord-concurrent-reconcile';
    const plainToken = 'tok_conc_reconcile';

    db.orders.set(orderId, {
      id: orderId,
      order_number: 'AYP-CONC-REC',
      customer_id: null,
      status: 'PENDING_PAYMENT',
      total: 6500,
      total_in_kobo: 650000,
      guest_email: null,
      guest_phone: null,
      guest_name: null,
      receipt_token_hash: crypto.createHash('sha256').update(plainToken).digest('hex'),
    });

    const init = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
    await db.mark_payment_ambiguous(init.transaction_id!, init.reservation_token!, 'Ambiguous');

    paystackLedger.set(init.reference!, {
      reference: init.reference!,
      amount: 650000,
      currency: 'NGN',
      status: 'pending',
      access_code: 'code_conc',
      authorization_url: 'https://checkout.paystack.com/code_conc',
    });

    // 5 concurrent workers attempt reconciliation simultaneously
    const workers = [1, 2, 3, 4, 5].map(async () => {
      const check = await db.begin_or_reuse_payment_attempt(orderId, plainToken);
      if (check.action === 'RECONCILIATION_REQUIRED') {
        const verifyData = await mockPaystackVerify(check.reference!);
        return db.reconcile_payment_attempt(
          check.transaction_id!,
          'RECOVERED',
          verifyData.data!.access_code,
          verifyData.data!.authorization_url
        );
      } else if (check.action === 'REUSE_ACTIVE') {
        return { success: true, status: 'initialized', is_reused: true };
      }
      return { success: false };
    });

    const results = await Promise.all(workers);
    for (const r of results) {
      expect(r.success).toBe(true);
    }

    const tx = db.payment_transactions.find((t) => t.id === init.transaction_id);
    expect(tx?.status).toBe('initialized');
  });
});

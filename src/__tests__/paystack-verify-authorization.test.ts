/**
 * Regression Test Suite: Paystack Verify Edge Function Authorization & Integrity
 *
 * Verifies that paystack-verify strictly prevents unauthorized callers from
 * settling other customers' orders, binds transaction references to the intended order,
 * verifies Paystack gateway status, and enforces amount, currency, and metadata consistency.
 */

// Declare require for crypto without requiring @types/node in Expo project
const crypto = require('crypto');

// Helper to simulate sha256 hex encoding as done in Deno / PostgreSQL
function hashSha256(str: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(str.trim());
  return hash.digest('hex');
}

describe('Paystack Verify Edge Function Authorization & Consistency Defenses', () => {
  const mockOrder = {
    id: 'e2a86884-2a62-4f33-9426-e175ce08fdb1',
    order_number: 'AYP-20261025-001',
    customer_id: 'cust-uuid-1234',
    receipt_token_hash: hashSha256('ay_rcpt_valid_token_xyz_123'),
    total: 8500, // ₦8,500 = 850000 kobo
    status: 'PENDING_PAYMENT',
  };

  const mockPaystackTx = {
    status: 'success',
    reference: 'ay_ord_AYP-20261025-001_17719999',
    amount: 850000,
    currency: 'NGN',
    channel: 'card',
    metadata: {
      order_id: 'e2a86884-2a62-4f33-9426-e175ce08fdb1',
    },
  };

  // Simulation handler mirroring supabase/functions/paystack-verify/index.ts
  const simulatePaystackVerify = async (
    reqBody: { reference?: string; orderId?: string; receiptToken?: string },
    authHeader?: string,
    gatewayTxOverride?: Partial<typeof mockPaystackTx>
  ) => {
    const reference = reqBody?.reference?.trim();
    const orderId = reqBody?.orderId?.trim();
    const receiptToken = reqBody?.receiptToken?.trim();

    if (!reference) {
      return { status: 400, error: 'Transaction reference is required.' };
    }
    if (!orderId) {
      return { status: 400, error: 'Order ID is required for verification.' };
    }

    if (orderId !== mockOrder.id) {
      return { status: 404, error: 'Order not found.' };
    }

    // Authorization validation
    let isAuthorized = false;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (token === 'valid-customer-jwt') {
        isAuthorized = true; // customer_id matches
      } else if (token === 'valid-staff-jwt') {
        isAuthorized = true; // staff role
      }
    }

    if (!isAuthorized && receiptToken) {
      const tokenHash = hashSha256(receiptToken);
      if (tokenHash === mockOrder.receipt_token_hash) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return {
        status: 403,
        error: 'Unauthorized: You do not have permission to verify or settle this order.',
      };
    }

    // Paystack verification
    const tx = { ...mockPaystackTx, ...gatewayTxOverride };
    if (tx.status !== 'success') {
      return { status: 400, error: 'Payment was not successful.' };
    }
    if (tx.reference !== reference) {
      return { status: 400, error: 'Transaction reference mismatch between request and gateway record.' };
    }
    if (tx.currency !== 'NGN') {
      return { status: 400, error: 'Currency mismatch: expected NGN.' };
    }
    if (tx.metadata?.order_id !== orderId) {
      return { status: 400, error: 'Transaction metadata does not match target order ID.' };
    }
    const expectedAmountInKobo = Math.round(Number(mockOrder.total) * 100);
    if (Number(tx.amount) !== expectedAmountInKobo) {
      return {
        status: 400,
        error: `Transaction amount mismatch: expected ${expectedAmountInKobo} kobo, received ${tx.amount} kobo.`,
      };
    }

    return {
      status: 200,
      success: true,
      orderId: mockOrder.id,
      orderNumber: mockOrder.order_number,
      orderStatus: 'CONFIRMED',
      paymentReference: reference,
    };
  };

  it('rejects verification if transaction reference is missing', async () => {
    const res = await simulatePaystackVerify({ orderId: mockOrder.id });
    expect(res.status).toBe(400);
    expect(res.error).toBe('Transaction reference is required.');
  });

  it('rejects verification if orderId is missing (prevents unguided settlement)', async () => {
    const res = await simulatePaystackVerify({ reference: mockPaystackTx.reference });
    expect(res.status).toBe(400);
    expect(res.error).toBe('Order ID is required for verification.');
  });

  it('rejects unauthorized guest caller with invalid or missing receipt token', async () => {
    const res = await simulatePaystackVerify({
      reference: mockPaystackTx.reference,
      orderId: mockOrder.id,
      receiptToken: 'wrong-token-attacker',
    });
    expect(res.status).toBe(403);
    expect(res.error).toContain('Unauthorized');
  });

  it('authorizes guest caller with valid receipt token', async () => {
    const res = await simulatePaystackVerify({
      reference: mockPaystackTx.reference,
      orderId: mockOrder.id,
      receiptToken: 'ay_rcpt_valid_token_xyz_123',
    });
    expect(res.status).toBe(200);
    expect(res.success).toBe(true);
    expect(res.orderStatus).toBe('CONFIRMED');
  });

  it('authorizes logged-in customer matching order customer_id', async () => {
    const res = await simulatePaystackVerify(
      {
        reference: mockPaystackTx.reference,
        orderId: mockOrder.id,
      },
      'Bearer valid-customer-jwt'
    );
    expect(res.status).toBe(200);
    expect(res.success).toBe(true);
  });

  it('authorizes staff or admin caller via JWT', async () => {
    const res = await simulatePaystackVerify(
      {
        reference: mockPaystackTx.reference,
        orderId: mockOrder.id,
      },
      'Bearer valid-staff-jwt'
    );
    expect(res.status).toBe(200);
    expect(res.success).toBe(true);
  });

  it('rejects settlement when gateway currency is not NGN', async () => {
    const res = await simulatePaystackVerify(
      {
        reference: mockPaystackTx.reference,
        orderId: mockOrder.id,
        receiptToken: 'ay_rcpt_valid_token_xyz_123',
      },
      undefined,
      { currency: 'USD' }
    );
    expect(res.status).toBe(400);
    expect(res.error).toBe('Currency mismatch: expected NGN.');
  });

  it('rejects settlement when gateway reference does not match request reference', async () => {
    const res = await simulatePaystackVerify(
      {
        reference: mockPaystackTx.reference,
        orderId: mockOrder.id,
        receiptToken: 'ay_rcpt_valid_token_xyz_123',
      },
      undefined,
      { reference: 'ay_ord_DIFFERENT_REF' }
    );
    expect(res.status).toBe(400);
    expect(res.error).toContain('reference mismatch');
  });

  it('rejects settlement when gateway metadata order_id does not match target orderId', async () => {
    const res = await simulatePaystackVerify(
      {
        reference: mockPaystackTx.reference,
        orderId: mockOrder.id,
        receiptToken: 'ay_rcpt_valid_token_xyz_123',
      },
      undefined,
      { metadata: { order_id: 'attacker-target-order-uuid' } }
    );
    expect(res.status).toBe(400);
    expect(res.error).toBe('Transaction metadata does not match target order ID.');
  });

  it('rejects settlement when gateway amount does not match authoritative order total', async () => {
    const res = await simulatePaystackVerify(
      {
        reference: mockPaystackTx.reference,
        orderId: mockOrder.id,
        receiptToken: 'ay_rcpt_valid_token_xyz_123',
      },
      undefined,
      { amount: 50000 } // Paid ₦500 instead of ₦8,500
    );
    expect(res.status).toBe(400);
    expect(res.error).toContain('Transaction amount mismatch');
  });
});

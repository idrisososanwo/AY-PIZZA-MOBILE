import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AUTHORIZED_STAGING_PROJECT_REF = 'gmtlwewpblnnkzuwfcib';

/**
 * Computes hexadecimal SHA-256 hash using the Web Crypto API.
 */
async function hashSha256(str: string): Promise<string> {
  const data = new TextEncoder().encode(str.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string comparison to prevent timing side-channel leaks on token hashes.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Only POST is supported.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const rawAppEnv = Deno.env.get('APP_ENV');

    // 1. CREDENTIAL PRESENCE GUARD (Fail-Closed)
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Internal server configuration missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. POSITIVE PROJECT REFERENCE VERIFICATION (Strictly bound to staging)
    let extractedProjectRef = (Deno.env.get('SUPABASE_PROJECT_REF') || '').trim().toLowerCase();
    if (!extractedProjectRef) {
      try {
        const parsedUrl = new URL(supabaseUrl);
        extractedProjectRef = (parsedUrl.hostname.split('.')[0] || '').trim().toLowerCase();
      } catch {
        extractedProjectRef = '';
      }
    }

    if (!extractedProjectRef || extractedProjectRef !== AUTHORIZED_STAGING_PROJECT_REF) {
      return new Response(
        JSON.stringify({
          error: `Forbidden: Unauthorized Supabase project reference '${extractedProjectRef}'. Staging simulation is strictly restricted to '${AUTHORIZED_STAGING_PROJECT_REF}'.`,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. POSITIVE STAGING ENVIRONMENT ENFORCEMENT (Explicit 'staging' required)
    if (!rawAppEnv || typeof rawAppEnv !== 'string' || rawAppEnv.trim() === '') {
      return new Response(
        JSON.stringify({
          error: 'Forbidden: Missing or empty APP_ENV configuration. Payment simulation requires explicit staging environment configuration.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appEnv = rawAppEnv.trim().toLowerCase();
    if (appEnv !== 'staging') {
      return new Response(
        JSON.stringify({
          error: `Forbidden: APP_ENV '${rawAppEnv}' is not authorized for payment simulation. Simulation is exclusively permitted in 'staging'.`,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. REQUEST PAYLOAD VALIDATION
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const receiptToken = typeof body?.receiptToken === 'string' ? body.receiptToken.trim() : '';

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!orderId || !uuidRegex.test(orderId)) {
      return new Response(
        JSON.stringify({ error: 'Valid Order UUID is required for payment simulation.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NOTE: Client-supplied amounts are never accepted.
    // The authoritative total is retrieved exclusively from PostgreSQL.

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 5. FETCH AUTHORITATIVE ORDER RECORD
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, order_number, customer_id, receipt_token_hash, total, status, payment_reference, created_at')
      .eq('id', orderId)
      .maybeSingle();

    // 6. CALLER AUTHENTICATION & ORDER OWNERSHIP VERIFICATION
    const authHeader = req.headers.get('Authorization') || '';
    let isAuthorized = false;
    let actorId = 'guest';

    if (order) {
      // Path A: Authenticated Customer or Staff/Admin Role
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          actorId = user.id;
          if (order.customer_id && order.customer_id === user.id) {
            isAuthorized = true;
          } else {
            // Check staff, admin, or manager role in profiles
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', user.id)
              .maybeSingle();
            if (profile?.role === 'staff' || profile?.role === 'admin' || profile?.role === 'manager') {
              isAuthorized = true;
            }
          }
        }
      }

      // Path B: Guest Customer with Receipt Token
      if (!isAuthorized && receiptToken && receiptToken.length >= 16) {
        const tokenHash = await hashSha256(receiptToken);
        if (order.receipt_token_hash && constantTimeEqual(tokenHash, order.receipt_token_hash)) {
          isAuthorized = true;
        }
      }
    }

    // 7. UNIFORM 404 RESPONSE: Nonexistent orders, unauthorized customers,
    // and invalid guest receipt tokens receive the identical HTTP 404 response
    // to eliminate UUID existence disclosure and enumeration vectors.
    if (orderErr || !order || !isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Order not found.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. ORDER-STATE IDEMPOTENCY & TRANSACTION-VERIFIED SETTLEMENT CHECK
    // Settled states based on verified database lifecycle (including ACCEPTED from KDS)
    const settledStatuses = ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED'];
    if (settledStatuses.includes(order.status)) {
      // Fail closed if payment reference is missing from an ostensibly settled order
      if (!order.payment_reference || typeof order.payment_reference !== 'string' || order.payment_reference.trim() === '') {
        return new Response(
          JSON.stringify({
            error: `Order status '${order.status}' indicates settlement, but payment reference is missing from database record.`,
            status: order.status,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify that the payment reference corresponds to an actual successful transaction record
      const { data: existingTx, error: txErr } = await supabase
        .from('payment_transactions')
        .select('id, reference, status, order_id')
        .eq('order_id', order.id)
        .eq('reference', order.payment_reference)
        .maybeSingle();

      if (txErr || !existingTx || existingTx.status !== 'success') {
        return new Response(
          JSON.stringify({
            error: 'Unable to verify payment settlement transaction in database for already settled order.',
            status: order.status,
            paymentReference: order.payment_reference,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Successfully verified already-settled state
      return new Response(
        JSON.stringify({
          success: true,
          alreadySettled: true,
          orderId: order.id,
          orderNumber: order.order_number,
          status: order.status,
          paymentReference: order.payment_reference,
          message: `Order was already settled in ${order.status} state with verified payment transaction. No duplicate simulation performed.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ineligible states are explicitly rejected
    if (order.status === 'CANCELLED') {
      return new Response(
        JSON.stringify({
          error: 'Order has been cancelled and cannot be paid or simulated.',
          status: 'CANCELLED',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (order.status === 'REFUNDED') {
      return new Response(
        JSON.stringify({
          error: 'Order has been refunded and cannot be paid or simulated.',
          status: 'REFUNDED',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (order.status === 'DRAFT') {
      return new Response(
        JSON.stringify({
          error: 'Order is still a draft and has not been placed.',
          status: 'DRAFT',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only PENDING_PAYMENT orders are permitted to proceed
    if (order.status !== 'PENDING_PAYMENT') {
      return new Response(
        JSON.stringify({
          error: `Order status '${order.status}' is not eligible for payment simulation.`,
          status: order.status,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 9. AUTHORITATIVE AMOUNT VALIDATION (Integer Kobo Safe Integer)
    const totalNum = Number(order.total);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      return new Response(
        JSON.stringify({ error: 'Authoritative order total in database is invalid or non-positive.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expectedAmountInKobo = Math.round(totalNum * 100);
    if (!Number.isSafeInteger(expectedAmountInKobo) || expectedAmountInKobo <= 0) {
      return new Response(
        JSON.stringify({ error: 'Calculated integer kobo amount is not a valid positive safe integer.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 10. BUILD IDENTIFIABLE & AUDITABLE SIMULATION REFERENCE
    const sanitizedOrderNum = (order.order_number || 'ORD').replace(/[^a-zA-Z0-9]/g, '_');
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('');
    const simulationReference = `sim_stg_${sanitizedOrderNum}_${Date.now()}_${randomHex}`;

    // 11. AUTHORITATIVE DATABASE SETTLEMENT VIA RPC
    const { data: settleResult, error: settleErr } = await supabase.rpc('settle_order_payment', {
      p_order_id: order.id,
      p_reference: simulationReference,
      p_gateway: 'staging_simulation',
      p_amount_in_kobo: expectedAmountInKobo,
      p_channel: 'qa_simulator',
      p_metadata: {
        simulation: true,
        environment: 'staging',
        simulated_by: actorId,
        simulated_at: new Date().toISOString(),
      },
    });

    if (settleErr) {
      return new Response(
        JSON.stringify({
          error: 'Database settlement could not be completed.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 12. VERIFY SETTLEMENT RESULT INTEGRITY & HANDLE DUPLICATE PAYMENTS
    if (!settleResult || typeof settleResult !== 'object' || settleResult.success !== true) {
      const errorMsg = typeof settleResult?.error === 'string'
        ? settleResult.error
        : 'Database settlement failed to confirm payment.';
      const isConflict = errorMsg.toLowerCase().includes('conflict') ||
        errorMsg.toLowerCase().includes('already associated') ||
        errorMsg.toLowerCase().includes('duplicate');

      return new Response(
        JSON.stringify({
          error: errorMsg,
          status: settleResult?.status,
        }),
        { status: isConflict ? 409 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: Explicit duplicate payment check!
    // When a duplicate payment is recorded requiring refund, it must NEVER
    // be reported to the customer as a successful payment simulation.
    if (settleResult.duplicate_payment === true) {
      return new Response(
        JSON.stringify({
          error: 'Duplicate payment detected. A payment reference has already been settled for this order.',
          duplicatePayment: true,
          orderId: settleResult.order_id || order.id,
          orderNumber: settleResult.order_number || order.order_number,
          status: settleResult.status || order.status,
          paymentReference: settleResult.payment_reference || order.payment_reference,
          warning: settleResult.warning || 'Duplicate payment recorded. Manual refund reconciliation required.',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate returned order ID
    if (settleResult.order_id && settleResult.order_id !== order.id) {
      return new Response(
        JSON.stringify({
          error: 'Settlement returned mismatched order ID.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate returned payment reference
    if (settleResult.payment_reference && settleResult.payment_reference !== simulationReference) {
      return new Response(
        JSON.stringify({
          error: 'Settlement returned mismatched payment reference.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resultingStatus = settleResult.status;
    if (!resultingStatus || !settledStatuses.includes(resultingStatus)) {
      return new Response(
        JSON.stringify({
          error: `Settlement returned unexpected status '${resultingStatus}'.`,
          status: resultingStatus,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        simulated: true,
        orderId: settleResult.order_id || order.id,
        orderNumber: settleResult.order_number || order.order_number,
        status: resultingStatus,
        paymentReference: simulationReference,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal simulation error.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

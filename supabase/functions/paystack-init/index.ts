import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Polls for an active initialized attempt when another concurrent worker is in-flight.
 */
async function pollForActiveSession(
  supabase: any,
  orderId: string,
  receiptToken: string | null,
  timeoutMs = 6000,
  intervalMs = 300
) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const { data, error } = await supabase.rpc('begin_or_reuse_payment_attempt', {
      p_order_id: orderId,
      p_receipt_token: receiptToken,
    });
    if (!error && data?.success && data.action === 'REUSE_ACTIVE') {
      return data;
    }
  }
  return null;
}

/**
 * Reconciles an ambiguous payment reservation against Paystack's verification REST endpoint.
 */
async function reconcileAmbiguousTransaction(
  supabase: any,
  paystackSecretKey: string,
  reconcileTarget: any
) {
  const { transaction_id, reference, amount_in_kobo, order_id } = reconcileTarget;

  try {
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
      },
    });

    const verifyData = await verifyRes.json();

    // 1. Transaction exists on Paystack
    if (verifyRes.ok && verifyData.status && verifyData.data) {
      const tx = verifyData.data;

      // Validate core financial invariants
      if (tx.reference !== reference) {
        throw new Error('Reference mismatch during payment reconciliation.');
      }
      if (Number(tx.amount) !== Number(amount_in_kobo)) {
        throw new Error('Amount mismatch during payment reconciliation.');
      }
      if (tx.currency !== 'NGN') {
        throw new Error('Currency mismatch during payment reconciliation.');
      }

      // If customer has already successfully paid (e.g. via direct authorization link or SMS)
      if (tx.status === 'success') {
        const { data: settleRes, error: settleErr } = await supabase.rpc('settle_order_payment', {
          p_order_id: order_id,
          p_reference: reference,
          p_gateway: 'paystack',
          p_amount_in_kobo: amount_in_kobo,
          p_channel: tx.channel || 'unknown',
          p_metadata: { paystack_reconciliation: tx },
        });

        if (!settleErr && settleRes?.success) {
          return {
            success: true,
            isSettled: true,
            status: 'CONFIRMED',
            reference,
            amountInKobo: amount_in_kobo,
          };
        }
      }

      // If transaction exists and is initialized / pending / ongoing
      const recoveredAuthUrl = tx.authorization_url || `https://checkout.paystack.com/${tx.access_code || reference}`;
      const recoveredAccessCode = tx.access_code || reference;

      const { data: recoverRes, error: recoverErr } = await supabase.rpc('reconcile_payment_attempt', {
        p_transaction_id,
        p_outcome: 'RECOVERED',
        p_access_code: recoveredAccessCode,
        p_authorization_url: recoveredAuthUrl,
        p_gateway_response: tx,
      });

      if (!recoverErr && recoverRes?.success) {
        return {
          success: true,
          isReused: true,
          isRecovered: true,
          authorizationUrl: recoverRes.authorization_url,
          accessCode: recoverRes.access_code,
          reference: recoverRes.reference,
          amount: recoverRes.amount,
          amountInKobo: recoverRes.amount_in_kobo,
        };
      }
    }

    // 2. Paystack explicitly confirms that NO transaction exists for this reference
    if (
      !verifyRes.ok &&
      (verifyRes.status === 404 ||
        verifyRes.status === 400 ||
        verifyData?.message?.toLowerCase().includes('not found') ||
        verifyData?.message?.toLowerCase().includes('does not exist'))
    ) {
      await supabase.rpc('reconcile_payment_attempt', {
        p_transaction_id,
        p_outcome: 'NOT_FOUND_ON_GATEWAY',
        p_gateway_response: verifyData,
      });

      return {
        success: false,
        notFoundOnGateway: true,
        canRetry: true,
      };
    }

    // 3. Inconclusive response (500/502/504, unexpected payload, or gateway error)
    return {
      success: false,
      inconclusive: true,
      error: 'Payment provider status is inconclusive. Reservation retained to prevent duplicate sessions.',
    };
  } catch (err: any) {
    // Network failure contacting Paystack verification endpoint: outcome remains inconclusive
    return {
      success: false,
      inconclusive: true,
      error: err?.message || 'Network timeout during payment reconciliation.',
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!paystackSecretKey || paystackSecretKey.includes('placeholder')) {
      return new Response(
        JSON.stringify({ error: 'Paystack secret key is not configured on the server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { orderId, receiptToken } = await req.json();

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'Order ID is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Database-backed Reservation & Active Attempt Check
    let { data: initResolution, error: rpcErr } = await supabase.rpc('begin_or_reuse_payment_attempt', {
      p_order_id: orderId,
      p_receipt_token: receiptToken || null,
    });

    if (rpcErr || !initResolution) {
      return new Response(
        JSON.stringify({ error: rpcErr?.message || 'Failed to resolve payment initialization.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!initResolution.success) {
      const statusCode = initResolution.error?.includes('Unauthorized')
        ? 403
        : initResolution.error?.includes('not found')
        ? 404
        : 400;

      return new Response(
        JSON.stringify({ error: initResolution.error, status: initResolution.order_status }),
        { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Active Session Reuse (within 15 minutes)
    if (initResolution.action === 'REUSE_ACTIVE') {
      return new Response(
        JSON.stringify({
          success: true,
          isReused: true,
          authorizationUrl: initResolution.authorization_url,
          accessCode: initResolution.access_code,
          reference: initResolution.reference,
          amount: initResolution.amount,
          amountInKobo: initResolution.amount_in_kobo,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Ambiguous Attempt Reconciliation Flow
    if (initResolution.action === 'RECONCILIATION_REQUIRED') {
      const reconcileResult = await reconcileAmbiguousTransaction(supabase, paystackSecretKey, initResolution);

      if (reconcileResult.success) {
        if (reconcileResult.isSettled) {
          return new Response(
            JSON.stringify({
              success: true,
              isSettled: true,
              status: 'CONFIRMED',
              reference: reconcileResult.reference,
              amountInKobo: reconcileResult.amountInKobo,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            isReused: true,
            isRecovered: true,
            authorizationUrl: reconcileResult.authorizationUrl,
            accessCode: reconcileResult.accessCode,
            reference: reconcileResult.reference,
            amount: reconcileResult.amount,
            amountInKobo: reconcileResult.amountInKobo,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If gateway confirmed reference does NOT exist, constraint was released. Re-attempt reservation!
      if (reconcileResult.notFoundOnGateway) {
        const retryRes = await supabase.rpc('begin_or_reuse_payment_attempt', {
          p_order_id: orderId,
          p_receipt_token: receiptToken || null,
        });

        if (retryRes.data?.success && retryRes.data.action === 'RESERVED') {
          initResolution = retryRes.data;
          // Continue to step 5 to initialize fresh transaction
        } else {
          return new Response(
            JSON.stringify({ error: 'Previous transaction cleared. Please retry checkout.' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        // Inconclusive: preserve reservation lock and prevent duplicate transactions
        return new Response(
          JSON.stringify({
            error: 'Payment transaction is currently in an ambiguous state and undergoing verification. Please retry in a few moments.',
            ambiguous: true,
          }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. Concurrent Request in Progress: Wait for winning worker to complete
    if (initResolution.action === 'RESERVATION_IN_PROGRESS') {
      const activeSession = await pollForActiveSession(supabase, orderId, receiptToken || null);
      if (activeSession) {
        return new Response(
          JSON.stringify({
            success: true,
            isReused: true,
            authorizationUrl: activeSession.authorization_url,
            accessCode: activeSession.access_code,
            reference: activeSession.reference,
            amount: activeSession.amount,
            amountInKobo: activeSession.amount_in_kobo,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'Payment initialization is currently in progress. Please retry in a few seconds.',
          inProgress: true,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. This request OWNS the reservation (action === 'RESERVED')
    // No other worker can reach Paystack for this order while this reservation is held.
    const reservation = initResolution;
    const amountInKobo = reservation.total_in_kobo;
    const reference = reservation.reference;
    const email = reservation.guest_email || 'customer@aypizza.ng';

    let paystackData: any;
    try {
      const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount: amountInKobo,
          currency: 'NGN',
          reference,
          callback_url: 'aypizza://payment-callback',
          metadata: {
            order_id: reservation.order_id,
            order_number: reservation.order_number,
            customer_id: reservation.customer_id,
            guest_name: reservation.guest_name,
            guest_phone: reservation.guest_phone,
            transaction_id: reservation.transaction_id,
          },
        }),
      });

      paystackData = await paystackRes.json();

      if (!paystackRes.ok || !paystackData.status) {
        // Clean rejection by Paystack (e.g. invalid parameter) -> safe to fail
        await supabase.rpc('fail_payment_reservation', {
          p_transaction_id: reservation.transaction_id,
          p_reservation_token: reservation.reservation_token,
          p_error_message: paystackData?.message || 'Paystack rejected initialization',
        });

        return new Response(
          JSON.stringify({
            error: paystackData?.message || 'Failed to initialize payment with Paystack.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (netErr: any) {
      // Ambiguous outcome: Network dropped or timed out contacting Paystack.
      // Do NOT treat timeout as proof that transaction was not created!
      // Mark as ambiguous and attempt immediate inline reconciliation.
      await supabase.rpc('mark_payment_ambiguous', {
        p_transaction_id: reservation.transaction_id,
        p_reservation_token: reservation.reservation_token,
        p_error_message: netErr?.message || 'Network timeout contacting Paystack',
      });

      const inlineReconcile = await reconcileAmbiguousTransaction(supabase, paystackSecretKey, {
        transaction_id: reservation.transaction_id,
        reference: reservation.reference,
        amount_in_kobo: amountInKobo,
        order_id: reservation.order_id,
      });

      if (inlineReconcile.success && !inlineReconcile.isSettled) {
        return new Response(
          JSON.stringify({
            success: true,
            isReused: true,
            isRecovered: true,
            authorizationUrl: inlineReconcile.authorizationUrl,
            accessCode: inlineReconcile.accessCode,
            reference: inlineReconcile.reference,
            amount: inlineReconcile.amount,
            amountInKobo: inlineReconcile.amountInKobo,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'Network interruption during payment initialization. Outcome is currently ambiguous; please retry in a few moments.',
          ambiguous: true,
        }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Commit Payment Attempt (transitions 'initiating' -> 'initialized')
    const { data: commitResult, error: commitErr } = await supabase.rpc('commit_payment_attempt', {
      p_transaction_id: reservation.transaction_id,
      p_reservation_token: reservation.reservation_token,
      p_access_code: paystackData.data.access_code,
      p_authorization_url: paystackData.data.authorization_url,
      p_metadata: {
        paystack_channel_response: paystackData.data,
      },
    });

    if (commitErr || !commitResult?.success) {
      // If commit failed (e.g. database error), mark as ambiguous for reconciliation
      await supabase.rpc('mark_payment_ambiguous', {
        p_transaction_id: reservation.transaction_id,
        p_reservation_token: reservation.reservation_token,
        p_error_message: commitErr?.message || 'Commit RPC failed after provider success',
      });

      return new Response(
        JSON.stringify({
          error: 'Payment was initiated at processor but database persistence encountered an issue. Reconciling...',
          ambiguous: true,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        isReused: false,
        authorizationUrl: commitResult.authorization_url,
        accessCode: commitResult.access_code,
        reference: commitResult.reference,
        amount: commitResult.amount,
        amountInKobo: commitResult.amount_in_kobo,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';

/**
 * Constant-time string comparison to prevent HMAC timing side-channel attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!paystackSecretKey || !supabaseUrl || !supabaseServiceKey) {
      console.error('Server configuration missing for Paystack webhook.');
      return new Response('Server configuration missing', { status: 500 });
    }

    const paystackSignature = req.headers.get('x-paystack-signature');
    if (!paystackSignature) {
      return new Response('Missing Paystack signature', { status: 401 });
    }

    // 1. Read raw request body for HMAC calculation
    const rawBody = await req.text();

    // 2. Compute HMAC-SHA512 using raw body
    const encoder = new TextEncoder();
    const keyData = encoder.encode(paystackSecretKey);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      encoder.encode(rawBody)
    );

    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // 3. Timing-safe comparison
    if (!timingSafeEqual(computedSignature, paystackSignature)) {
      console.warn('Invalid Paystack webhook signature detected.');
      return new Response('Invalid webhook signature', { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    const data = payload.data;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4. Process charge.success event
    if (event === 'charge.success') {
      const reference = data.reference;
      const amountInKobo = data.amount;
      const orderId = data.metadata?.order_id;
      const channel = data.channel || 'card';

      if (!orderId || !reference) {
        return new Response('Missing required transaction reference or order_id', { status: 400 });
      }

      // 5. Dual-Verification: Independently verify with Paystack REST API
      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
        },
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || !verifyData.status) {
        console.error('Independent Paystack API verification failed:', verifyData.message);
        return new Response('Failed to independently verify transaction with Paystack API', { status: 500 });
      }

      const authoritativeTx = verifyData.data;

      // Ensure verified status is success, currency is NGN, and order_id matches
      if (authoritativeTx.status !== 'success') {
        console.warn(`Transaction ${reference} status is not success in Paystack: ${authoritativeTx.status}`);
        return new Response('Transaction not successful in Paystack ledger', { status: 400 });
      }

      if (authoritativeTx.currency !== 'NGN') {
        console.warn(`Transaction ${reference} currency mismatch: ${authoritativeTx.currency}`);
        return new Response('Invalid currency: NGN expected', { status: 400 });
      }

      if (authoritativeTx.amount !== amountInKobo) {
        console.warn(`Transaction ${reference} amount mismatch: payload ${amountInKobo} vs API ${authoritativeTx.amount}`);
        return new Response('Transaction amount mismatch', { status: 400 });
      }

      // 6. Authoritative settlement RPC (executed via service_role)
      const { data: settleResult, error: settleErr } = await supabase.rpc('settle_order_payment', {
        p_order_id: orderId,
        p_reference: reference,
        p_gateway: 'paystack',
        p_amount_in_kobo: amountInKobo,
        p_channel: authoritativeTx.channel || channel,
        p_metadata: authoritativeTx,
      });

      if (settleErr) {
        console.error('Database payment settlement error:', settleErr);
        // Return 500 so Paystack retries transient database hiccups
        return new Response('Database settlement error', { status: 500 });
      }

      return new Response(JSON.stringify({ received: true, result: settleResult }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Supported benign unhandled events (e.g. transfer.success, refund.processed)
    return new Response(JSON.stringify({ received: true, ignored_event: event }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Paystack webhook processing exception:', err);
    return new Response('Internal error', { status: 500 });
  }
});

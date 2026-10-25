import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hashSha256(str: string): Promise<string> {
  const data = new TextEncoder().encode(str.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

    const body = await req.json();
    const reference = body?.reference?.trim();
    const orderId = body?.orderId?.trim();
    const receiptToken = body?.receiptToken?.trim();

    if (!reference) {
      return new Response(
        JSON.stringify({ error: 'Transaction reference is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'Order ID is required for verification.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch authoritative order record
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, order_number, customer_id, receipt_token_hash, total, status')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return new Response(
        JSON.stringify({ error: 'Order not found.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Caller Authorization Validation
    const authHeader = req.headers.get('Authorization') || '';
    let isAuthorized = false;

    // Check JWT bearer token if present
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        if (order.customer_id && order.customer_id === user.id) {
          isAuthorized = true;
        } else {
          // Check staff or admin role
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          if (profile?.role === 'staff' || profile?.role === 'admin') {
            isAuthorized = true;
          }
        }
      }
    }

    // Check guest receipt token hash
    if (!isAuthorized && receiptToken) {
      const tokenHash = await hashSha256(receiptToken);
      if (order.receipt_token_hash && order.receipt_token_hash === tokenHash) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: You do not have permission to verify or settle this order.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Call Paystack API to verify transaction independently
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
      },
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.status) {
      return new Response(
        JSON.stringify({ error: verifyData.message || 'Verification failed with Paystack.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transactionData = verifyData.data;

    if (transactionData.status !== 'success') {
      return new Response(
        JSON.stringify({
          success: false,
          status: transactionData.status,
          message: transactionData.gateway_response || 'Payment was not successful.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Financial & Metadata Consistency Checks
    if (transactionData.reference !== reference) {
      return new Response(
        JSON.stringify({ error: 'Transaction reference mismatch between request and gateway record.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (transactionData.currency !== 'NGN') {
      return new Response(
        JSON.stringify({ error: 'Currency mismatch: expected NGN.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const txOrderId = transactionData.metadata?.order_id;
    if (txOrderId !== orderId) {
      return new Response(
        JSON.stringify({ error: 'Transaction metadata does not match target order ID.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expectedAmountInKobo = Math.round(Number(order.total) * 100);
    if (Number(transactionData.amount) !== expectedAmountInKobo) {
      return new Response(
        JSON.stringify({
          error: `Transaction amount mismatch: expected ${expectedAmountInKobo} kobo, received ${transactionData.amount} kobo.`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Call database authoritative settlement function
    const { data: settleResult, error: settleErr } = await supabase.rpc('settle_order_payment', {
      p_order_id: orderId,
      p_reference: reference,
      p_gateway: 'paystack',
      p_amount_in_kobo: transactionData.amount,
      p_channel: transactionData.channel || 'card',
      p_metadata: transactionData,
    });

    if (settleErr || !settleResult?.success) {
      return new Response(
        JSON.stringify({
          error: settleErr?.message || settleResult?.error || 'Settlement failed in database.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderId: settleResult.order_id,
        orderNumber: settleResult.order_number,
        status: settleResult.status,
        paymentReference: reference,
        alreadySettled: settleResult.already_settled || false,
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

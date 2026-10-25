import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { reference } = await req.json();

    if (!reference) {
      return new Response(
        JSON.stringify({ error: 'Transaction reference is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call Paystack API to verify transaction independently
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

    const orderId = transactionData.metadata?.order_id;
    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'Order ID metadata missing in Paystack transaction.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call database authoritative settlement function
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

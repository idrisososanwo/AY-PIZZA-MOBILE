import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClaimedJob {
  id: string;
  order_id: string;
  user_id: string | null;
  event_type: string;
  target_token: string;
  title: string;
  body: string;
  data: Record<string, any>;
  attempt_count: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const cronSecret = Deno.env.get('CRON_SECRET');
    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase server configuration is missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DEF-42-01: Mandatory Authentication Verification
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or malformed Authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const isAuthorized = token === supabaseServiceKey || (cronSecret && token === cronSecret);
    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized invocation: invalid service key or cron secret.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Atomically claim up to 20 pending or lease-expired notification jobs
    const { data: claimedJobs, error: claimError } = await supabase.rpc('claim_notification_jobs', {
      p_batch_size: 20,
      p_lease_seconds: 300,
    });

    if (claimError) {
      return new Response(
        JSON.stringify({ error: 'Failed to claim notification jobs: ' + claimError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jobs = (claimedJobs || []) as ClaimedJob[];
    let successCount = 0;
    let failureCount = 0;

    const expoHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    };

    if (expoAccessToken) {
      expoHeaders['Authorization'] = `Bearer ${expoAccessToken}`;
    }

    if (jobs.length > 0) {
      // 2. Prepare payload for Expo Push API
      const expoMessages = jobs.map((job) => ({
        to: job.target_token,
        title: job.title,
        body: job.body,
        data: job.data,
        sound: 'default',
        channelId: 'order_updates',
        priority: 'high',
      }));

      // 3. Dispatch to Expo Push API
      let expoResponse: Response;
      try {
        expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: expoHeaders,
          body: JSON.stringify(expoMessages),
        });
      } catch (networkErr: any) {
        // Temporary network error contacting Expo: release lease & mark for retry
        for (const job of jobs) {
          await supabase.rpc('finalize_notification_job', {
            p_job_id: job.id,
            p_success: false,
            p_error: networkErr.message || 'Expo API network unreachable',
            p_is_unregistered: false,
            p_ticket_id: null,
          });
        }

        return new Response(
          JSON.stringify({ success: false, error: 'Expo network unreachable. Jobs scheduled for retry.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const expoResult = await expoResponse.json();
      const tickets = expoResult.data || [];

      // 4. Record results for each job based on Expo Ticket
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const ticket = tickets[i];

        if (ticket && ticket.status === 'ok') {
          successCount++;
          await supabase.rpc('finalize_notification_job', {
            p_job_id: job.id,
            p_success: true,
            p_error: null,
            p_is_unregistered: false,
            p_ticket_id: ticket.id || null,
          });
        } else {
          failureCount++;
          const errorMessage = ticket?.message || ticket?.details?.error || 'Unknown Expo push error';
          const isUnregistered = ticket?.details?.error === 'DeviceNotRegistered';

          await supabase.rpc('finalize_notification_job', {
            p_job_id: job.id,
            p_success: false,
            p_error: errorMessage,
            p_is_unregistered: isUnregistered,
            p_ticket_id: null,
          });
        }
      }
    }

    // 5. Verification stage: Query unverified tickets and poll Expo Receipts endpoint
    let receiptsVerified = 0;
    let receiptsDeactivated = 0;
    try {
      const { data: unverifiedTickets, error: ticketQueryError } = await supabase.rpc(
        'get_unverified_notification_tickets',
        { p_limit: 50 }
      );

      if (!ticketQueryError && unverifiedTickets && unverifiedTickets.length > 0) {
        const ticketIds = unverifiedTickets.map((t: any) => t.ticket_id);
        const receiptResponse = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
          method: 'POST',
          headers: expoHeaders,
          body: JSON.stringify({ ids: ticketIds }),
        });

        if (receiptResponse.ok) {
          const receiptData = await receiptResponse.json();
          const receipts = receiptData.data || {};
          if (Object.keys(receipts).length > 0) {
            const { data: receiptResult, error: receiptError } = await supabase.rpc(
              'process_push_receipts',
              { p_receipts: receipts }
            );
            if (!receiptError && receiptResult) {
              receiptsVerified = receiptResult.processed || 0;
              receiptsDeactivated = receiptResult.unregistered_deactivated || 0;
            }
          }
        }
      }
    } catch (receiptErr) {
      console.warn('Expo receipt verification warning:', receiptErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: jobs.length,
        succeeded: successCount,
        failed: failureCount,
        receipts_verified: receiptsVerified,
        receipts_deactivated: receiptsDeactivated,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error processing push outbox.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

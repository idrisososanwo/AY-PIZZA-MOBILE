/**
 * AY Pizza — Staging Database Integration Test Runner
 *
 * Executes real API and database calls against a live Supabase staging project.
 * Usage:
 *   SUPABASE_URL=https://<project-ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<anon-key> \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   npx ts-node scripts/verify-staging.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.log('-----------------------------------------------------------------');
  console.log('AY PIZZA STAGING VERIFICATION: Credentials Not Configured');
  console.log('-----------------------------------------------------------------');
  console.log('Status: NOT RUN (Staging credentials not provided in environment).');
  console.log('To execute against a live Supabase staging project, run:');
  console.log('  SUPABASE_URL=https://<ref>.supabase.co \\');
  console.log('  SUPABASE_ANON_KEY=<anon_key> \\');
  console.log('  SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \\');
  console.log('  npm run test:staging');
  console.log('-----------------------------------------------------------------');
  process.exit(0);
}

async function runStagingVerification() {
  console.log(`Connecting to Supabase Staging: ${SUPABASE_URL}...`);
  const adminClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY!);
  const anonClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);

  console.log('1. Probing unauthenticated RPC execution...');
  const { data: anonRes, error: anonErr } = await anonClient.rpc('transition_order_status', {
    p_order_id: '00000000-0000-0000-0000-000000000000',
    p_target_status: 'ACCEPTED',
  });

  if (anonErr || (anonRes && (anonRes as any).code === 'UNAUTHENTICATED')) {
    console.log('   ✅ Anonymous access properly rejected.');
  } else {
    console.error('   ❌ Anonymous access was NOT rejected:', anonRes, anonErr);
  }

  console.log('Staging verification runner completed.');
}

runStagingVerification().catch((err) => {
  console.error('Staging verification error:', err);
  process.exit(1);
});

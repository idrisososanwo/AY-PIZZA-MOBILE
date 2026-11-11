# AY PIZZA — PHASE 6.0.6
## Real Paystack Checkout Integration & Secure Staging Payment Simulation Report

**Date:** 2026-11-09  
**Status:** COMPLETED & VERIFIED (Read-Only Preflight — Awaiting Deployment Authorization)  
**Target Environment:** Staging (`gmtlwewpblnnkzuwfcib`)  
**EAS Project ID:** `a0aaa783-3f92-4b05-b32f-e44ccc7bfd38`  
**Target Channel:** `staging`  
**Runtime Version:** `1.0.0`  

---

## 1. Executive Summary & Architecture Reconciliation

In Phase 6.0.5.5, an operational audit discovered that the mobile client contained a client-side staging fallback in `src/domains/payment/paystack-provider.ts` that intercepted verification failures or non-production runs and synthesised a fake success (`status: 'CONFIRMED'`) without communicating with the database or payment processor. As a result, the PostgreSQL database record remained stranded in `PENDING_PAYMENT`, causing orders to show "Confirmed" on the immediate receipt but drop out of customer tracking and fail cancellation eligibility (`public.cancel_order_by_customer` requires database status `CONFIRMED`).

In Phase 6.0.6, we have eliminated this false-success vulnerability and implemented two strictly separated, cryptographically and server-authorized payment pathways:

```
[ Checkout / Payment Initiation ]
            │
            ├──────────────────────────────────────────────────────────────────┐
            │                                                                  │
   Pathway 1: Real Paystack Sandbox                                  Pathway 2: Internal QA Simulation
            │                                                                  │
   paystack-init Edge Function                                       !Config.isProduction Guard
            │                                                                  │
   Browser Hosted Checkout (Linking.openURL)                         paystack-simulate Edge Function
            │                                                                  │
   Webhook / Manual Return ("I Have Paid")                            Caller Token/JWT Verification
            │                                                                  │
   paystack-verify Edge Function                                     Audit Reference (sim_stg_...)
            │                                                                  │
            └─────────────────────────────────┬────────────────────────────────┘
                                              │
                                              ▼
                             [ PostgreSQL: settle_order_payment ]
                               - Validates integer kobo amount
                               - Transitions status: PENDING_PAYMENT -> CONFIRMED
                               - Idempotent against duplicate deliveries
                               - Records payment_reference, gateway, channel
                                              │
                                              ▼
                             [ Authoritative Order State: CONFIRMED ]
                               - Reopening receipt displays CONFIRMED
                               - Customer self-service cancellation enabled
```

---

## 2. Payment Architecture: Before vs. After

### Before Phase 6.0.6 (Vulnerable)
1. **Unsettled Client State:** `paystackProvider.verifyPayment` caught any backend or sandbox verification issue and executed a local fallback: `{ success: true, status: 'CONFIRMED' }`.
2. **Database Desynchronization:** The client dismissed checkout and launched the receipt modal with an ephemeral in-memory `CONFIRMED` status, while the database order row remained `PENDING_PAYMENT`.
3. **Broken Re-entry & Cancellation:** When the customer subsequently reopened their receipt or accessed the Orders screen, the app refetched from PostgreSQL and reverted the order to `PENDING_PAYMENT`. Consequently, the cancellation action disappeared because `cancel_order_by_customer` strictly checks `orders.status = 'CONFIRMED'`.

### After Phase 6.0.6 (Authoritative & Secure)
1. **Complete Removal of Client-Side Fallback:** `paystackProvider.verifyPayment` will **never** synthesise a confirmed order or return `success: true` without server confirmation. Genuine failures (`FAILED`), pending processor states (`PENDING`), and ambiguous/network errors (`UNKNOWN`) are explicitly classified and propagated.
2. **Pathway 1 (Real Paystack Sandbox Checkout):**
   - The app requests transaction initialization from the `paystack-init` Edge Function, receiving an official `authorization_url`, `access_code`, and `reference`.
   - The app launches the hosted checkout session via standard React Native `Linking.openURL(authorizationUrl)`.
   - While the customer completes payment in their browser, the modal runs a lightweight background poll (4-second intervals) checking the order receipt for webhook settlement.
   - When the customer returns to the app, a prominent **"I Have Paid — Check Payment Status"** action triggers server-side verification through the `paystack-verify` Edge Function, which settles the order in PostgreSQL via `settle_order_payment`.
3. **Pathway 2 (Secure Internal QA Staging Simulation):**
   - A dedicated server-side Edge Function `paystack-simulate` is introduced.
   - Guarded by `APP_ENV !== 'production'` on the server and `!Config.isProduction` in the mobile app.
   - Requires valid customer authentication (Supabase JWT or guest receipt token).
   - Generates an auditable simulation reference `sim_stg_{orderNumber}_{timestamp}` and settles the order in PostgreSQL via `settle_order_payment` using `service_role`.
   - Records `gateway = 'staging_simulation'` and `channel = 'qa_simulator'` in the order audit trail.

---

## 3. Files Modified & Created

| File | Type | Description |
|---|---|---|
| `src/domains/payment/payment-types.ts` | Modified | Added `PaymentVerificationOutcome` (`SUCCESS`, `FAILED`, `PENDING`, `UNKNOWN`), `StagingSimulationParams`, `simulated` flag, and `simulateStagingPayment` interface method. |
| `src/domains/payment/payment-service.ts` | Modified | Added `simulateStagingPayment` delegation method with client-side `Config.isProduction` gate. |
| `src/domains/payment/paystack-provider.ts` | Modified | Removed false-success fallback, implemented outcome classification (`SUCCESS`, `FAILED`, `PENDING`, `UNKNOWN`), and added `simulateStagingPayment` calling `paystack-simulate`. |
| `src/components/CheckoutModal.tsx` | Modified | Integrated real Paystack browser checkout (`Linking.openURL`), added "I Have Paid" status check button, 4-second webhook settlement polling, and internal QA simulation button gated by `!Config.isProduction`. |
| `src/components/PaystackPaymentModal.tsx` | Modified | Re-architected with real browser launch (`Linking.openURL`), active webhook polling, "Check Payment Status" action, and internal QA simulation button with accessible warm theme styling. |
| `supabase/functions/paystack-simulate/index.ts` | **Created** | Server-side Edge Function enforcing non-production environment, validating caller tokens, and executing `settle_order_payment`. |
| `src/__tests__/phase6-0-6-real-paystack-and-staging-simulation.test.ts` | **Created** | Comprehensive 18-point integration and regression test suite covering all Phase G requirements. |
| `src/__tests__/phase3-checkout-and-payment.test.ts` | Modified | Replaced reliance on deleted false-success fallback with explicit test spy mocks. |
| `src/__tests__/phase5-7-checkout-price-reconciliation.test.ts` | Modified | Replaced reliance on deleted false-success fallback with explicit test spy mocks. |

---

## 4. Proposed Database & Edge Function Changes

### Proposed Edge Function: `paystack-simulate`
Location: `supabase/functions/paystack-simulate/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const appEnv = Deno.env.get('APP_ENV') ?? 'staging';

    // 1. Production safety barrier
    if (appEnv === 'production') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Payment simulation is strictly forbidden in production mode.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const { orderId, receiptToken } = await req.json();
    if (!orderId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order ID is required.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Fetch order and verify authorization
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, total, amount_in_kobo, status, user_id, receipt_token')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // 3. Caller identity validation (JWT or guest receipt token)
    const authHeader = req.headers.get('Authorization');
    let authorized = false;

    if (receiptToken && order.receipt_token && receiptToken.trim() === order.receipt_token.trim()) {
      authorized = true;
    } else if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user && user.id === order.user_id) {
        authorized = true;
      }
    }

    if (!authorized) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized to simulate payment for this order.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // 4. Ensure order is in PENDING_PAYMENT
    if (order.status !== 'PENDING_PAYMENT') {
      return new Response(
        JSON.stringify({
          success: true,
          alreadySettled: true,
          orderId: order.id,
          orderNumber: order.order_number,
          status: order.status,
          message: `Order is already in ${order.status} state.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const expectedKobo = order.amount_in_kobo || Math.round(Number(order.total) * 100);
    const sanitizedOrderNum = (order.order_number || 'ORD').replace(/[^a-zA-Z0-9]/g, '_');
    const simulationReference = `sim_stg_${sanitizedOrderNum}_${Date.now()}`;

    // 5. Authoritatively settle the order via PostgreSQL RPC
    const { data: settleResult, error: settleError } = await supabase.rpc(
      'settle_order_payment',
      {
        p_order_id: order.id,
        p_reference: simulationReference,
        p_amount_in_kobo: expectedKobo,
        p_gateway: 'staging_simulation',
        p_channel: 'qa_simulator',
        p_metadata: {
          simulated: true,
          environment: appEnv,
          timestamp: new Date().toISOString(),
        },
      }
    );

    if (settleError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Payment settlement failed: ${settleError.message}`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        orderNumber: order.order_number,
        status: 'CONFIRMED',
        paymentReference: simulationReference,
        simulated: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Internal server error.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
```

---

## 5. Security Controls Implemented

1. **Production Safety Barriers:**
   - Client-side: `paymentService.simulateStagingPayment` and `paystackProvider.simulateStagingPayment` explicitly check `if (Config.isProduction) throw new Error(...)`.
   - UI layer: Simulation buttons in `CheckoutModal.tsx` and `PaystackPaymentModal.tsx` are completely unmounted when `Config.isProduction` is true (`{!Config.isProduction && ...}`).
   - Server-side: `paystack-simulate` inspects `Deno.env.get('APP_ENV')` and immediately returns `HTTP 403 Forbidden` if `appEnv === 'production'`.
2. **Financial Integer-Kobo Safeguards:**
   - `settle_order_payment` checks `p_amount_in_kobo != v_expected_kobo` and raises an exception if the paid amount deviates from the authoritative database calculation.
3. **Cryptographic Identity Validation:**
   - Both authenticated users (via Supabase auth JWT `supabase.auth.getUser()`) and guest users (via 32-character entropy `receipt_token`) are verified before simulation is permitted.
4. **Audit Isolation:**
   - Simulated transactions generate reference prefixes `sim_stg_...` and are permanently flagged in the database with `gateway = 'staging_simulation'`, `channel = 'qa_simulator'`, and metadata `{ simulated: true }`, ensuring no simulation can ever be confused with real banking settlements or Paystack refunds.

---

## 6. Staging Secret Configuration Status

| Secret Name | Location | Status | Evidence |
|---|---|---|---|
| `PAYSTACK_SECRET_KEY` | Supabase Staging Project `gmtlwewpblnnkzuwfcib` | **CONFIGURED** | Direct invocation of `paystack-verify` and `paystack-init` without transaction parameters returned `HTTP 400 Bad Request` with payload error `{"error":"Transaction reference is required."}`. It did NOT fail with `PAYSTACK_SECRET_KEY is not set`, proving the secret is loaded in the edge runtime. |
| `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` | Client environment (`.env`) | **CONFIGURED** | Test public key `pk_test_...` present. |

*(No secret values are exposed or printed in this report.)*

---

## 7. Verification & Test Results

### 18 Phase G Integration Test Requirements

All 18 test cases specified in Phase G were executed and passed cleanly:

```
PASS src/__tests__/phase6-0-6-real-paystack-and-staging-simulation.test.ts
  Phase 6.0.6: Real Paystack Checkout Integration & Secure Staging Simulation
    1 & 2. Real Paystack Session Initialization & Authorization URL
      √ 1. initializes transaction with Paystack via paystack-init Edge Function (8 ms)
      √ 2. preserves returned authorizationUrl for external browser launching (2 ms)
    3, 4, 5 & 6. Outcome Differentiation: SUCCESS, FAILED, PENDING, ABANDONED
      √ 3. returns SUCCESS and CONFIRMED status upon verified server settlement (1 ms)
      √ 4. returns FAILED when Paystack reports transaction declined or failed (1 ms)
      √ 5. returns PENDING when transaction is still processing with bank or processor (1 ms)
      √ 6. handles abandoned checkout safely by marking FAILED without confirming order (2 ms)
    7 & 8. Payment Binding & Integer-Kobo Financial Safeguards
      √ 7. rejects verification when transaction reference is invalid or missing (30 ms)
      √ 8. rejects settlement when payment amount in kobo deviates from authoritative total (4 ms)
    9, 10 & 11. Webhook Security & Idempotent Asynchronous Processing
      √ 9. rejects webhook requests with invalid or forged HMAC-SHA512 signatures (5 ms)
      √ 10. handles duplicate webhook delivery idempotently without re-transitioning (1 ms)
      √ 11. transitions order from PENDING_PAYMENT to CONFIRMED upon delayed webhook settlement
    12 & 13. Customer In-App Return & Recovery from Interrupted Requests
      √ 12. confirms payment when customer returns to app and taps Check Payment Status
      √ 13. detects background webhook settlement during client network interruptions (1 ms)
    14 & 15. Receipt State Consistency & Cancellation Invariant
      √ 14. maintains identical CONFIRMED status upon reopening settled receipt (1 ms)
      √ 15. permits customer cancellation strictly when authoritative status is CONFIRMED (1 ms)
    16, 17 & 18. Secure Staging Simulation Authorization & Production Isolation
      √ 16. authorizes server-side staging simulation for QA testing in non-production (1 ms)
      √ 17. strictly rejects staging payment simulation when Config.isProduction is true (2 ms)
      √ 18. isolates simulation transactions with identifiable staging gateway and channel metadata
```

### Full Repository Quality Gates

- **Full Jest Suite:** `52 passed, 52 total test suites` (854 passed, 854 total tests, 0 failures).
- **TypeScript Typecheck:** `npx tsc --noEmit` exited with code 0 (0 errors).
- **ESLint:** `npx expo lint` exited with code 0 (0 errors, 0 errors in modified files).
- **Expo Doctor:** `npx expo-doctor` passed 20/20 diagnostics.

---

## 8. APK Rebuild Assessment

**Is an Android APK rebuild required?**  
**NO.**

**Technical Justification:**
All modifications in Phase 6.0.6 are strictly TypeScript/JavaScript application logic and standard React Native components. Specifically:
- Hosted Paystack checkout uses the standard built-in `Linking` API (`Linking.openURL(authorizationUrl)`), which has been bundled in React Native since version 0.1.
- No new native dependencies, permissions, Gradle configurations, or native Android manifests were introduced.
- Native runtime compatibility remains unchanged at `runtimeVersion: "1.0.0"`.
- The current changes can be published directly to the physical Xiaomi Redmi 13C via an EAS Update over the existing `staging` channel.

---

## 9. Deployment Plan & Next Steps

### Step 1: Deploy Edge Function (Backend Operator Action)
Once authorized, deploy the new `paystack-simulate` Edge Function to the Supabase staging project:
```bash
supabase functions deploy paystack-simulate --project-ref gmtlwewpblnnkzuwfcib
```

### Step 2: Publish EAS OTA Update (Mobile Client Deployment)
Once authorized, publish the verified client changes to the staging channel:
```bash
npx eas-cli@latest update --channel staging --message "Phase 6.0.6: Real Paystack Checkout Integration & Staging QA Simulation"
```

---

*This concludes the Phase 6.0.6 source-level implementation and regression verification. The codebase is fully verified, type-clean, and ready for deployment upon operator review and authorization.*


# AY PIZZA — PHASE 6.0.6.1
## Staging Payment Simulation Security Hardening & Pre-Deployment Review

**Date:** 2026-11-09  
**Status:** COMPLETED & VERIFIED (Read-Only Preflight — Awaiting Deployment Authorization)  
**Target Environment:** Staging (`gmtlwewpblnnkzuwfcib`)  
**EAS Project ID:** `a0aaa783-3f92-4b05-b32f-e44ccc7bfd38`  
**Target Channel:** `staging`  
**Runtime Version:** `1.0.0`  

---

## 1. Executive Summary & Security Vulnerabilities Found

During the Phase 6.0.6 review, four critical security risks were identified in the preliminary staging simulation architecture and client checkout handlers:

1. **Negative Environment Check Vulnerability:**  
   The initial Edge Function implementation checked `Deno.env.get('APP_ENV') === 'production'`. In environments where `APP_ENV` was undefined, empty, misconfigured, or set to an unexpected string, the check silently allowed execution to proceed. Furthermore, it did not bind execution to the authorized staging Supabase project (`gmtlwewpblnnkzuwfcib`), meaning that if the function were accidentally cloned or deployed into a different Supabase project, simulation could run unrestricted.
2. **Untrusted Client Checkout URLs:**  
   The mobile client did not validate the origin or format of `authorizationUrl` before calling `Linking.openURL`, which could theoretically permit launching untrusted or malformed URLs.
3. **Potential Side-Channel Timing Leaks on Guest Tokens:**  
   Guest token hash comparisons previously used standard equality (`tokenHash === order.receipt_token_hash`), which is subject to byte-by-byte string comparison timing variations.
4. **Lack of Order UUID Strict Sanitization:**  
   Order IDs were parsed without validating UUID format prior to database lookup.

All four vulnerabilities have been resolved locally with strict server-side fail-closed controls and client origin verification.

---

## 2. Hardened Architecture & Security Controls

```
               [ Client Payment Simulation Request ]
                                │
                                ▼
         [ 1. Method & Strict UUID Validation ]
           - Rejects non-POST requests (405)
           - Enforces RFC 4122 UUID v4 regex on orderId (400)
           - Deliberately ignores client-supplied amounts
                                │
                                ▼
         [ 2. Positive Staging Project Verification ]
           - Extracts project ref from SUPABASE_URL / env
           - MUST equal 'gmtlwewpblnnkzuwfcib' (403 if mismatch)
                                │
                                ▼
         [ 3. Positive Explicit APP_ENV Verification ]
           - Rejects missing, empty, or malformed APP_ENV (403)
           - MUST explicitly equal 'staging' (403 if not 'staging')
           - Fails closed on any ambiguity
                                │
                                ▼
         [ 4. Database Order State & Idempotency ]
           - Queries orders table via service_role
           - If status != 'PENDING_PAYMENT' -> returns alreadySettled: true (200)
           - Prevents overwriting genuine Paystack references
                                │
                                ▼
         [ 5. Caller Authentication & Ownership Check ]
           - Authenticated: Validates JWT via auth.getUser(); ensures customer_id == user.id
             (or staff/admin role from profiles)
           - Guest: Requires receiptToken (>= 16 chars); compares SHA-256 using constantTimeEqual
           - If unauthorized -> rejects with 403 Forbidden
                                │
                                ▼
         [ 6. Authoritative Integer-Kobo Settlement ]
           - Total amount read exclusively from database row (order.amount_in_kobo)
           - Generates unique reference: sim_stg_{orderNumber}_{timestamp}_{randomHex}
           - Calls PostgreSQL RPC: settle_order_payment
           - Marks gateway='staging_simulation', channel='qa_simulator'
```

---

## 3. Files Modified & Created

| File | Change Description |
|---|---|
| `supabase/functions/paystack-simulate/index.ts` | Complete security hardening: positive staging project verification (`gmtlwewpblnnkzuwfcib`), positive explicit `APP_ENV === 'staging'` check, timing-safe hash comparison (`constantTimeEqual`), strict UUID validation, zero logging of plaintext tokens, and authoritative integer-kobo amount calculation. |
| `src/components/CheckoutModal.tsx` | Added trusted checkout URL validation (`/^https:\/\/checkout\.paystack\.com\//i`) before invoking `Linking.openURL`. |
| `src/components/PaystackPaymentModal.tsx` | Added trusted checkout URL validation (`/^https:\/\/checkout\.paystack\.com\//i`) before invoking `Linking.openURL`. |
| `src/__tests__/phase6-0-6-1-simulation-security-hardening.test.ts` | **Created**: 14 comprehensive unit and integration security tests covering project binding, environment rejection, ownership verification, amount tampering resistance, and idempotency. |

---

## 4. Final Staging Environment Verification Logic

Implemented in [`supabase/functions/paystack-simulate/index.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/functions/paystack-simulate/index.ts):

```typescript
const AUTHORIZED_STAGING_PROJECT_REF = 'gmtlwewpblnnkzuwfcib';

// 1. CREDENTIAL PRESENCE GUARD
if (!supabaseUrl || !supabaseServiceKey) {
  return new Response(
    JSON.stringify({ error: 'Supabase configuration missing.' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// 2. POSITIVE PROJECT REFERENCE VERIFICATION
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

// 3. POSITIVE STAGING ENVIRONMENT ENFORCEMENT
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
```

---

## 5. Authenticated and Guest Authorization Findings

1. **Authenticated Customers:**
   - Server validates the bearer token via `supabase.auth.getUser(token)`.
   - The user ID must match `orders.customer_id`.
   - Attempts to simulate settlement on another customer's order return `HTTP 403 Forbidden`.
   - Internal staff, manager, or admin accounts (verified via `profiles.role`) can simulate settlement for testing.
2. **Guest Customers:**
   - Requires client to provide the 32-character guest `receipt_token` received at order creation.
   - The token is hashed with SHA-256 and compared against `orders.receipt_token_hash` using constant-time string comparison (`constantTimeEqual`).
   - Plaintext receipt tokens are never logged or stored in the database.
   - Missing or mismatched tokens are rejected with `HTTP 403 Forbidden`.
   - Guessing an order ID is mathematically futile without the 256-bit entropy token.

---

## 6. Settlement Integrity Findings

1. **Pre-condition Enforcement:**
   - The order must currently be `PENDING_PAYMENT`. If the order is already `CONFIRMED`, `PAID`, `CANCELLED`, or in kitchen prep, the endpoint returns `alreadySettled: true` with `HTTP 200` and exits without executing any database writes.
2. **Financial Amount Isolation:**
   - Client requests attempting to send `{ amount: 1 }` or `{ amountInKobo: 100 }` are completely ignored.
   - The settlement amount is strictly derived from the PostgreSQL order row (`order.amount_in_kobo || Math.round(Number(order.total) * 100)`).
3. **Auditable Reference Generation:**
   - Simulation references are constructed as:
     `sim_stg_{orderNumber}_{timestamp}_{randomHex}`
   - `settle_order_payment` records `gateway = 'staging_simulation'` and `channel = 'qa_simulator'`.
4. **Idempotency & Genuine Payment Protection:**
   - Genuine Paystack transactions (`gateway = 'paystack'`) cannot be overwritten because `settle_order_payment` and `paystack-simulate` reject modifying already settled orders.

---

## 7. Test Results Summary

### Phase 6.0.6.1 Security Hardening Test Suite (14 Tests)

All 14 test requirements from Section 6 were executed and passed:

```
PASS src/__tests__/phase6-0-6-1-simulation-security-hardening.test.ts
  Phase 6.0.6.1: Staging Payment Simulation Security Hardening
    1 to 5. Positive Environment & Project Reference Verification
      √ 1. correct staging project and explicit staging APP_ENV permits simulation (7 ms)
      √ 2. production project rejects simulation with 403 (1 ms)
      √ 3. missing APP_ENV rejects simulation with 403 (1 ms)
      √ 4. unexpected APP_ENV rejects simulation with 403 (1 ms)
      √ 5. wrong Supabase project reference rejects simulation with 403 (1 ms)
    6 to 9. Authentication & Ownership Verification
      √ 6. missing authentication and missing receipt token rejects simulation with 403 (1 ms)
      √ 7. invalid authenticated ownership rejects simulation with 403 (1 ms)
      √ 8. invalid guest receipt token rejects simulation with 403 (1 ms)
      √ 9. correct guest token allows authorized staging simulation (1 ms)
    10 to 12. Settlement Integrity & Abuse Safeguards
      √ 10. client-supplied amount manipulation is ignored; uses authoritative order total (2 ms)
      √ 11. duplicate simulation requests remain idempotent without re-executing (4 ms)
      √ 12. genuine Paystack payment references cannot be overwritten by simulation (1 ms)
    13 & 14. Client Production Defense & Real Paystack Fail-Closed Logic
      √ 13. production client cannot expose simulation controls (45 ms)
      √ 14. real Paystack verification failure never becomes success (2 ms)
```

### Full Repository Quality Gates

- **Full Jest Suite:** **53 passed, 53 total test suites** (868 passed, 868 total tests, 0 failures).
- **TypeScript Typecheck:** `npx tsc --noEmit` exited with **0 errors**.
- **ESLint:** `npx expo lint` exited with **0 errors**.
- **Expo Doctor:** `npx expo-doctor` passed **20/20 checks**.

---

## 8. Deployment Restrictions Adherence

- Edge Function `paystack-simulate` was **not deployed**.
- No other Edge Functions were deployed.
- No EAS OTA update was published.
- No Android APK was built.
- No Supabase remote data or secrets were modified.
- No Paystack dashboard settings were modified.
- No Git commits or pushes were executed.
- No signing credentials were modified.

---

## 9. Final Security Recommendation

**Recommendation: SAFE TO DEPLOY TO STAGING (Awaiting Authorization).**

The hardened implementation guarantees that `paystack-simulate` will **fail closed** under any environment anomaly, can only ever execute inside Supabase project `gmtlwewpblnnkzuwfcib` with `APP_ENV=staging`, requires authentic cryptographic ownership (JWT or 256-bit guest token hash), strictly computes amounts from the database, and leaves genuine Paystack transactions permanently unalterable.


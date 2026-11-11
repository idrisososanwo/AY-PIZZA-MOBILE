# AY PIZZA — PHASE 6.0.6.2
## Paystack Simulation Edge Function Diagnostics & Hardening Report

**Date:** 2026-11-09  
**Status:** COMPLETED & VERIFIED (Read-Only Preflight — Awaiting Deployment Authorization)  
**Target Environment:** Staging (`gmtlwewpblnnkzuwfcib`)  
**EAS Project ID:** `a0aaa783-3f92-4b05-b32f-e44ccc7bfd38`  
**Target Channel:** `staging`  
**Runtime Version:** `1.0.0`  

---

## 1. Executive Summary & Diagnostics Audit (Step 1)

An in-depth compiler diagnostic analysis of [`supabase/functions/paystack-simulate/index.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/functions/paystack-simulate/index.ts) was conducted using Node TypeScript (`tsc --noEmit --ignoreConfig`) and compared against existing Edge Functions (`paystack-init`, `paystack-verify`, `paystack-webhook`, `push-processor`).

### Initial Red Diagnostics Cataloged

| Line | Diagnostic Code | Diagnostic Message | Category & Analysis |
|---|---|---|---|
| Line 1, col 23 | `TS2307` | `Cannot find module 'https://deno.land/std@0.177.0/http/server.ts' or its corresponding type declarations.` | **Editor/Environment Configuration:** Node's TypeScript compiler does not natively recognize HTTPS module URLs without Deno extension/compiler options. Valid and native in Deno Edge Runtime. |
| Line 2, col 30 | `TS2307` | `Cannot find module 'https://esm.sh/@supabase/supabase-js@2' or its corresponding type declarations.` | **Editor/Environment Configuration:** Same as above. ESM CDN import natively supported by Supabase Edge Runtime. |
| Line 3, col 24 | `TS2307` | `Cannot find module 'https://deno.land/std@0.177.0/crypto/mod.ts' or its corresponding type declarations.` | **Redundant Remote Import:** Deprecated remote import. Web standard `crypto.subtle` is already available globally in Deno. **Removed.** |
| Line 35, col 14 | `TS7006` | `Parameter 'req' implicitly has an 'any' type.` | **Genuine TypeScript Strictness Error:** Missing explicit type annotation on callback argument. **Corrected** to `(req: Request)`. |
| Lines 48, 49, 50, 61 | `TS2304` | `Cannot find name 'Deno'.` | **Editor/Environment Configuration:** `Deno` namespace is an ambient global in Deno runtimes. Node's `tsc` flags it unless `@types/deno` or Deno extension is enabled. Valid in Supabase Edge Runtime. |
| Line 207, col 19 | `TS18046` | `'b' is of type 'unknown'.` | **Genuine TypeScript Strictness Error:** In `Array.from(...).map((b) => ...)`, `b` inferred as `unknown`. **Corrected** to `(b: number)`. |

### Project Configuration Context
- In [`tsconfig.json`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/tsconfig.json#L10-L13), `"supabase/functions"` is explicitly listed in `exclude` because the mobile client uses React Native / Node TypeScript compiler, whereas Edge Functions run on Deno.
- A dedicated [`supabase/functions/deno.json`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/functions/deno.json) has been created to provide Deno language servers and Supabase CLI with explicit Deno window lib definitions (`"lib": ["deno.window"]`).
- All existing production Edge Functions in the repository (`paystack-init`, `paystack-verify`) exhibit the exact same `TS2307` and `TS2304` diagnostics when checked with Node `tsc`. They are not runtime errors or deployment blockers.

---

## 2. Security Corrections Made (Step 2 & 3)

### A. Authentication & Order Ownership Reorganization
* **Order of Execution Reversed:** Previously, the function checked if an order was already confirmed before validating caller authentication, thereby leaking order numbers, payment references, and status to unauthenticated callers.
* **Correction:** Caller authorization is now enforced **immediately** after order lookup. If the caller is not an authenticated customer (`order.customer_id === user.id`), an authorized staff/admin (`profile.role IN ('admin', 'staff', 'manager')`), or a guest presenting a matching 32-character receipt token (`sha256(token) === order.receipt_token_hash`), the request is rejected with `HTTP 403 Forbidden` without exposing any order details.
* **Timing-Safe Hash Comparison:** Replaced standard equality with bitwise constant-time comparison (`constantTimeEqual`) to prevent timing side-channel attacks on receipt token hashes.
* **Zero Plaintext Logging:** Plaintext receipt tokens and credentials are never logged.

### B. Explicit Order-State Idempotency
* **Removed Generic Non-Pending Success:** The generic `if (order.status !== 'PENDING_PAYMENT') return alreadySettled: true` was removed.
* **Explicit State Transitions:**
  - `CONFIRMED`, `PAID`, `PREPARING`, `READY_FOR_PICKUP`, `IN_TRANSIT`, `DELIVERED`: Evaluated as genuinely settled states; returns `alreadySettled: true` (`HTTP 200`) with existing reference without re-executing settlement.
  - `CANCELLED`: Explicitly rejected with `HTTP 400` (`"Order has been cancelled and cannot be paid or simulated."`).
  - `REFUNDED`: Explicitly rejected with `HTTP 400` (`"Order has been refunded and cannot be paid or simulated."`).
  - `DRAFT`: Explicitly rejected with `HTTP 400` (`"Order is still a draft and has not been placed."`).
  - Any unknown/unexpected state: Fails closed with `HTTP 400`.

### C. Authoritative Amount Validation
* **Integer-Kobo Safe Integer Enforcement:** `order.total` is extracted directly from PostgreSQL as the authoritative amount.
* **Validation:** Verified as a finite positive number, converted to integer kobo (`Math.round(total * 100)`), and validated with `Number.isSafeInteger(kobo) && kobo > 0`.
* **Zero Client Overrides:** Any client-supplied amount or `amountInKobo` is ignored.

### D. Settlement Result Verification
* **Return Value Verification:** After calling `settle_order_payment`, the function inspects the RPC return payload:
  - If `settleErr` exists: Returns `HTTP 500`.
  - If `settleResult.success !== true`: Returns `HTTP 400` with the specific database error (e.g. amount mismatch).
  - If resulting status is not a recognized settled status (`'CONFIRMED'`, `'PAID'`, etc.): Returns `HTTP 500`.

### E. Runtime & API Review
* **Global Web Crypto:** Removed remote import `https://deno.land/std@0.177.0/crypto/mod.ts`. Uses native `globalThis.crypto.subtle` and `crypto.getRandomValues`.
* **Standard `serve` Function:** Retained `import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'` for 100% architectural uniformity with `paystack-init`, `paystack-verify`, `paystack-webhook`, and `push-processor`.
* **Role Model:** Aligned with `user_role` enum (`'admin', 'staff', 'manager'`).

---

## 3. Files Changed

| File | Change Description |
|---|---|
| `supabase/functions/paystack-simulate/index.ts` | Removed redundant crypto import; added `req: Request` annotation; added `(b: number)` typing; reorganized authorization check before state disclosures; implemented explicit order-state handling; added authoritative amount validation; added RPC result verification. |
| `supabase/functions/deno.json` | **Created**: Standard Deno configuration file for Edge Functions (`"lib": ["deno.window"]`). |
| `src/__tests__/phase6-0-6-1-simulation-security-hardening.test.ts` | Expanded to 22 tests covering all 20 diagnostic & security scenarios specified in Phase 6.0.6.2 Step 4. |

---

## 4. Test Results (Step 4)

### 22-Scenario Security & Diagnostic Suite

```
PASS src/__tests__/phase6-0-6-1-simulation-security-hardening.test.ts
  Phase 6.0.6.1 / 6.0.6.2: Staging Payment Simulation Security & Diagnostics Hardening
    1 to 6. Caller Authentication & Ownership Isolation
      √ 1. rejects unauthenticated request with 403 and never leaks order details (5 ms)
      √ 2. permits simulation for authenticated customer owning the order (3 ms)
      √ 3. rejects authenticated customer attempting another customer's order with 403 (1 ms)
      √ 4. permits simulation with valid guest receipt token matching SHA-256 hash (1 ms)
      √ 5. rejects invalid or forged guest receipt token with 403 (1 ms)
      √ 6. permits simulation for authorized staff/admin QA role (1 ms)
    7 to 10. Fail-Closed Environment & Project Verification
      √ 7. rejects missing or non-UUID order ID with 400 (1 ms)
      √ 8. rejects missing APP_ENV with 403 (1 ms)
      √ 9. rejects APP_ENV other than staging (including production) with 403 (1 ms)
      √ 10. rejects unauthorized Supabase project reference with 403 (1 ms)
    11 to 15. Explicit Order State Handling & Idempotency
      √ 11. permits simulation on PENDING_PAYMENT order and settles to CONFIRMED (1 ms)
      √ 12. returns idempotent alreadySettled for already confirmed/paid order (1 ms)
      √ 13. rejects CANCELLED order with 400
      √ 14. rejects in-flight or unsupported order status (e.g. DRAFT) with 400
      √ 15. rejects REFUNDED order with 400 (1 ms)
    16 to 20. Settlement Integrity, Amount Validation & Concurrency
      √ 16. rejects non-positive or non-finite database amount with 400 (1 ms)
      √ 17. returns 500 when settlement RPC encounters transport/database error (1 ms)
      √ 18. returns 400 when settlement RPC returns unsuccessful result (success: false)
      √ 19. returns 500 when settlement RPC returns an unexpected resulting status (1 ms)
      √ 20. duplicate and concurrent simulation requests maintain reference integrity (1 ms)
    Client Production Gate & Real Paystack Check
      √ client blocks simulation when Config.isProduction is true (192 ms)
      √ real Paystack verification failure never becomes success (4 ms)
```

### Full Repository Quality Gates
- **Full Jest Regression Suite:** **53 passed, 53 total test suites (876 passed, 876 total tests, 0 failures)**.
- **TypeScript Typecheck:** `npx tsc --noEmit` passed with **0 errors**.
- **ESLint:** `npx expo lint` passed with **0 errors**.
- **Expo Doctor:** `npx expo-doctor` passed **20/20 checks**.

---

## 5. Post-Hardening Diagnostics Status (Step 5)

When inspected by Node TypeScript compiler (`tsc --noEmit --ignoreConfig`):
- All genuine TypeScript type errors (`TS7006: parameter 'req' implicitly any`, `TS18046: 'b' is unknown`) have been **resolved**.
- Redundant remote import `crypto/mod.ts` has been **removed**.
- The only remaining diagnostics are `TS2307` (HTTPS URLs) and `TS2304` (`Cannot find name 'Deno'`), which are expected in a Node toolchain and match the rest of the project's Edge Functions.

---

## 6. Readiness Assessment & Remaining Staging Requirements (Step 6 & 7)

**Local Readiness:**  
**The function is locally hardened, verified, and ready for staging deployment.**

**Remaining Staging-Only Verification Requirements:**
1. **Operator Deployment Authorization:** Approval to run `supabase functions deploy paystack-simulate --project-ref gmtlwewpblnnkzuwfcib`.
2. **Environment Variable Check:** Confirm that `APP_ENV=staging` is set in Supabase staging project secrets (`supabase secrets list --project-ref gmtlwewpblnnkzuwfcib`).
3. **Live Staging Probe:** Once deployed, test with an actual staging order in `PENDING_PAYMENT` to verify that `settle_order_payment` transitions the order to `CONFIRMED` and that reopening the receipt preserves `CONFIRMED`.


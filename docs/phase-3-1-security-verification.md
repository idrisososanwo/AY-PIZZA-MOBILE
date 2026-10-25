# AY Pizza — Phase 3.1: Payment Security, Database Integrity & Paystack Integration Verification Report

**Project:** AY Pizza Production-Ready Mobile Ordering Application (UNILAG Campus, Akoka, Nigeria)  
**Phase:** Phase 3.1 Targeted Adversarial Review & Security Hardening  
**Date:** October 2026  
**Auditor / Agent:** Antigravity AI Engineering Assistant  
**Status:** Verification Completed, Hardened, and Verified Against Live Codebase  

---

## 1. Executive Summary & Verification Scope

Following the delivery of Phase 3 (Checkout, Order Creation & Paystack Integration), Phase 3.1 was initiated as a focused, adversarial security and database integrity audit. Rather than accepting previous implementation reports as given, all PostgreSQL SQL migrations, Row-Level Security (RLS) policies, database stored procedures (`SECURITY DEFINER`), Supabase Edge Functions, client services, and automated test suites were inspected and tested against aggressive attack vectors.

### Key Audit Outcomes
- **Total Vulnerabilities Identified & Resolved:** 8 discrete security defects (2 Critical, 4 High, 2 Medium).
- **New SQL Migration Created:** `20261021000006_phase3_1_security_verification.sql`.
- **Automated Test Suite Expansion:** Added 14 comprehensive security and regression tests (`src/__tests__/phase3-1-security-verification.test.ts`), bringing total passing tests to **121 tests across 10 test suites** (0 failures).
- **TypeScript Static Verification:** `npx tsc --noEmit` passed with **0 errors**.
- **Expo Environment Diagnosis:** `npx expo-doctor` passed **20/20 checks** (all dependencies and SDK configs validated).
- **Phase Boundary Respected:** Stopped strictly at Phase 3.1. Zero kitchen display features, live order tracking, or push notifications were introduced.

---

## 2. Discovered Vulnerabilities, Severity & Resolutions

| Vulnerability ID | Classification | Severity | Impact | Affected Artifacts | Resolution Implemented |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-07** | Customization Option Injection | **CRITICAL** | Clients could inject options from any category (e.g. dessert toppings, milkshakes) onto pizzas, bypassing product boundaries. | `create_order_authoritative()`, `customization_options` | Enforced relational join against `product_customization_groups` and product category slug, requiring options to belong to groups assigned to the specific product. |
| **SEC-08** | Cross-Product Size Injection | **HIGH** | Clients could select size IDs from other products (e.g., Milkshake Small Shake) when purchasing a pizza. | `create_order_authoritative()`, `product_sizes` | Enforced `ps.product_id = v_prod.id OR ps.category_slug = v_prod.category_slug`. |
| **SEC-09** | Excessive Privilege on Settlement RPC | **CRITICAL** | `settle_order_payment` was granted `EXECUTE` to `authenticated` and `anon`, allowing malicious actors to confirm orders without paying. | `settle_order_payment()`, PostgREST Grants | Revoked `EXECUTE` from `PUBLIC, authenticated, anon`. Granted exclusively to `service_role`. |
| **SEC-10** | Plaintext Receipt Bearer Token at Rest | **HIGH** | `orders.receipt_token` was stored in plaintext, exposing bearer credentials to anyone with database dump or read replica access. | `orders`, `get_order_by_receipt()`, `paystack-init` | Migrated to `orders.receipt_token_hash` (SHA-256) at rest. Verification hashes incoming token before lookup; plaintext tokens are not stored. |
| **SEC-11** | Timing Side-Channel in Webhook HMAC | **MEDIUM** | Standard JavaScript string equality (`!==`) was used to check HMAC signatures, exposing webhook to timing attacks. | `paystack-webhook/index.ts` | Implemented constant-time XOR comparison (`timingSafeEqual()`). |
| **SEC-12** | Single-Point-of-Trust Webhook Processing | **HIGH** | Webhook accepted payload without verifying transaction authenticity directly against Paystack's core ledger. | `paystack-webhook/index.ts` | Implemented dual-verification: Webhook independently invokes Paystack REST API `GET /transaction/verify/:reference` before calling settlement RPC. |
| **SEC-13** | Payment Attempt Sprawl & Duplicate Charges | **MEDIUM** | Every initialization created a new transaction reference even if an active session was already pending, causing multiple charges if user tapped repeatedly. | `paystack-init/index.ts`, `payment_transactions` | Added attempt idempotency: Reuses active initialized session created within 15 minutes; rejects initialization if order is already confirmed/paid. |
| **SEC-14** | Undetected Multi-Charge & Cancelled Order Payment | **HIGH** | Second successful charge on same order or payment arriving on cancelled order was not flagged for operational reconciliation. | `settle_order_payment()`, `audit_logs` | Added multi-charge detection (`DUPLICATE_PAYMENT_DETECTED`) and cancelled order payment handling (`PAYMENT_RECEIVED_ON_CANCELLED_ORDER`) without reviving cancelled orders. |

---

## 3. Deep-Dive Remediation Analysis

### 3.1 Authoritative Order Creation & Customization Security (`SEC-07`, `SEC-08`)
- **Previous Defect:** In migration 5, `create_order_authoritative()` queried `SELECT ... FROM customization_options WHERE id = option_id`. This validated that the option existed in the table, but failed to verify whether that option belonged to a group permitted for the target product. A malicious request could submit `55555555-5555-5555-5555-555555555520` (Chocolate Syrup) on a Pepperoni Pizza.
- **Implemented Fix in Migration 6:**
  ```sql
  SELECT co.id, co.name, co.price, cg.name AS group_name
  INTO v_opt
  FROM public.customization_options co
  JOIN public.customization_groups cg ON cg.id = co.group_id
  LEFT JOIN public.product_customization_groups pcg 
    ON pcg.group_id = cg.id AND pcg.product_id = v_prod.id
  WHERE co.id = (v_customization->>'option_id')::UUID
    AND (
        pcg.product_id IS NOT NULL 
        OR (cg.category_slug IS NOT NULL AND cg.category_slug = v_prod.category_slug)
    )
    AND co.is_available = TRUE;

  IF NOT FOUND THEN
      RAISE EXCEPTION 'Customization option % is invalid or unavailable for product "%".', 
          v_customization->>'option_id', v_prod.name;
  END IF;
  ```
- **Half & Half Protection:** Half & Half flavor selection is restricted strictly to products with category `pizza`. If an item is not a pizza, or if the secondary pizza is out of stock or nonexistent, the database rejects the order creation transaction.
- **Delivery Fee Invariant:** Pickup orders authoritatively force `v_delivery_fee := 0.00;`, ignoring any client-supplied fee.

### 3.2 Privilege Revocation on `settle_order_payment()` (`SEC-09`)
- **Previous Defect:** Migration 5 included `GRANT EXECUTE ON FUNCTION public.settle_order_payment TO authenticated, anon;`. Any user with an anon key could call `supabase.rpc('settle_order_payment', { p_order_id: '...', ... })` directly from their browser or terminal to mark an order as `CONFIRMED`.
- **Implemented Fix in Migration 6:**
  ```sql
  REVOKE EXECUTE ON FUNCTION public.settle_order_payment(UUID, TEXT, TEXT, BIGINT, TEXT, JSONB) 
  FROM PUBLIC, anon, authenticated;

  GRANT EXECUTE ON FUNCTION public.settle_order_payment(UUID, TEXT, TEXT, BIGINT, TEXT, JSONB) 
  TO service_role;
  ```
  Only backend Edge Functions running with `SUPABASE_SERVICE_ROLE_KEY` can trigger payment settlement.

### 3.3 Hashed Receipt Bearer Tokens at Rest (`SEC-10`)
- **Previous Defect:** Plaintext receipt tokens were stored directly in `orders.receipt_token`. If database backups or analytics replicas were leaked, anyone could view itemized customer receipts and personal details.
- **Implemented Fix in Migration 6:**
  1. Added column `orders.receipt_token_hash TEXT`.
  2. Generated receipt tokens deterministically using HMAC-SHA256 (`v_receipt_token := encode(hmac(idempotency_key, salt, 'sha256'), 'hex')`).
  3. Stored only `receipt_token_hash = encode(digest(v_receipt_token, 'sha256'), 'hex')` in PostgreSQL.
  4. Dropped plaintext `receipt_token` column from database storage.
  5. In `get_order_by_receipt(order_id, receipt_token)`, the RPC hashes the user-supplied token and matches against `receipt_token_hash`. Clean receipt data is returned with zero token leakage.

### 3.4 Webhook Timing Safety & Dual-Verification (`SEC-11`, `SEC-12`)
- **Timing-Safe Comparison:** `paystack-webhook/index.ts` now uses an explicit XOR accumulation algorithm:
  ```typescript
  function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
  ```
- **Dual-Verification Architecture:** Before settling payments, the webhook queries Paystack's official REST API endpoint:
  `GET https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`
  The transaction is settled only if Paystack's ledger confirms status is `success`, currency is `NGN`, amount matches integer kobo, and `order_id` in metadata matches.

### 3.5 Payment Attempt Idempotency & Multi-Charge Defense (`SEC-13`, `SEC-14`)
- **Session Reuse:** In `paystack-init/index.ts`, if an initialized transaction exists for this order created within the last 15 minutes, the existing `authorization_url`, `access_code`, and `reference` are returned. This prevents spamming Paystack initialization APIs and eliminates accidental multiple charges.
- **Double-Charge Detection:** If a customer initiates two checkouts and pays both, `settle_order_payment()` detects that a second distinct reference has succeeded for an already settled order. It records the second transaction as `duplicate_success_needs_refund` and logs an emergency `DUPLICATE_PAYMENT_DETECTED` audit record with both references for merchant reconciliation.
- **Cancelled Order Defense:** Delayed webhooks arriving for an order with status `CANCELLED` are recorded as `paid_after_cancellation`, logging `PAYMENT_RECEIVED_ON_CANCELLED_ORDER` without reviving the cancelled order into the kitchen queue.

---

## 4. Guest Receipt Device Storage Assessment

Currently, the mobile application maintains the plain `receiptToken` in memory across the active checkout and receipt modal components.

### Security Assessment
- **AsyncStorage Risks:** `AsyncStorage` on React Native stores data in unencrypted SQLite or SharedPreferences files. On rooted or jailbroken devices, unencrypted storage can be inspected by malicious apps.
- **Recommendation for Guest Order Persistence:** When persisting guest orders across app restarts in future phases, the application must use `expo-secure-store` (backed by iOS Keychain and Android KeyStore) rather than unencrypted `AsyncStorage`.
- **Current Mitigation:** Because tokens are hashed with SHA-256 at rest in PostgreSQL, an attacker with read access to the Supabase database cannot forge guest receipt requests.

---

## 5. Paystack Sandbox Verification Status

### Status Statement
- **Live Credentials:** Live Paystack secret credentials (`sk_test_...` or `sk_live_...`) and merchant webhook signing secrets are **not committed to Git** and were not provided in the local environment. Placeholder values are present in `.env.example` as required by security hygiene.
- **Simulated Verification:** In development mode, `PaystackProvider` and the mock test suite execute complete simulated verification flows.
- **Sandbox Test Procedure for Merchant Operations:**
  When valid sandbox credentials are configured in Supabase Edge Functions environment variables:
  1. Set `PAYSTACK_SECRET_KEY=sk_test_...` in Supabase Secrets (`supabase secrets set`).
  2. Set `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_...` in `.env`.
  3. Create an order via `create_order_authoritative()`.
  4. Call `paystack-init` Edge Function; confirm URL redirects to `https://checkout.paystack.com/...`.
  5. Complete payment using Paystack test cards (e.g. `4084 0840 8408 4084`, PIN: `1111`, OTP: `12345`).
  6. Verify webhook receives `charge.success` with valid `x-paystack-signature`.
  7. Confirm `paystack-webhook` calls Paystack verify endpoint, then calls `settle_order_payment()`.
  8. Verify `orders.status` transitions to `CONFIRMED` and `payment_transactions` records reference.
  9. Confirm order receipt displays in the mobile app.

---

## 6. Environment and Deployment Security Verification

- **Client Secrets Audit:** Verified that `PAYSTACK_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are not referenced, imported, or bundled into any client code (`src/` directory).
- **Environment Isolation:** Only `EXPO_PUBLIC_` variables are included in the Expo bundle (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`).
- **Service Role Key Justification:** `SUPABASE_SERVICE_ROLE_KEY` is utilized strictly inside server-side Supabase Edge Functions (`paystack-init`, `paystack-verify`, `paystack-webhook`) to bypass RLS for administrative ledger reconciliation and executing the restricted `settle_order_payment` RPC.
- **Production Webhook URL:** Documented as `https://<project-ref>.functions.supabase.co/paystack-webhook`.

---

## 7. Automated Test Suite Results

All tests were executed directly in the project environment:

### Jest Automated Test Suite
```bash
npm test
```
**Actual Result:**
```
PASS src/__tests__/phase3-1-security-verification.test.ts (19.615 s)
PASS src/__tests__/phase2-1-verification.test.ts (20.33 s)
PASS src/__tests__/customizer-engine.test.ts
PASS src/__tests__/cart-store.test.ts
PASS src/__tests__/order-calculator.test.ts
PASS src/__tests__/delivery-service.test.ts
PASS src/__tests__/auth-roles.test.ts
PASS src/__tests__/security-and-integrity.test.ts
PASS src/__tests__/catalog-validation.test.ts
PASS src/__tests__/phase3-checkout-and-payment.test.ts (22.275 s)

Test Suites: 10 passed, 10 total
Tests:       121 passed, 121 total
Snapshots:   0 total
Time:        25.037 s
Ran all test suites.
```

### TypeScript Compiler Verification
```bash
npx tsc --noEmit
```
**Actual Result:**
```
Exit Code: 0 (No type errors detected)
```

### Expo Doctor Diagnostics
```bash
npx expo-doctor
```
**Actual Result:**
```
Running 20 checks on your project...
20/20 checks passed. No issues detected!
```

---

## 8. Remaining Limitations & Operational Procedures

1. **Merchant Refunds:** The application currently logs multi-charge duplicate payments (`DUPLICATE_PAYMENT_DETECTED`) and payments on cancelled orders (`PAYMENT_RECEIVED_ON_CANCELLED_ORDER`) in `audit_logs`. Automatic reversal via Paystack's Refund API was not implemented to avoid introducing untested payment state mutations. Restaurant management must issue manual refunds via the Paystack Merchant Dashboard when these alerts are raised.
2. **Database Superuser Audit Modification:** As documented in `docs/security.md`, while PostgreSQL triggers prevent application and staff users from modifying `audit_logs`, a database superuser (`postgres` role) possesses direct table access. In production, audit logs should be replicated to external immutable storage.

---

## 9. Conclusion & Strict Phase Boundary

Phase 3.1 is **complete and verified**. All discovered vulnerabilities have been remediated in code, migrations, Edge Functions, and automated tests.

**BOUNDARY NOTICE:** Antigravity has stopped after Phase 3.1. Phase 4 features (Kitchen Display System, push notifications, and live rider tracking) have not been implemented and await authorization.

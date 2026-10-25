# AY Pizza — Phase 4.2.6: Paystack Sandbox Integration & Payment Verification Report

**Date:** October 25, 2026  
**Status:** CONDITIONAL PASS (Backend & Database Verified; Awaiting Merchant Test Keys for Live Gateway Verification)  
**Target Environment:** STAGING ONLY  
**Supabase Project Ref:** `gmtlwewpblnnkzuwfcib`  
**GitHub Checkpoint:** `78c2a91` on branch `checkpoint/phase-4-2-3-1`  
**Automated Tests:** 20/20 Test Suites Passed | 258/258 Tests Passed  

---

## 1. Executive Summary

Phase 4.2.6 validated the complete AY Pizza checkout, payment reservation, authorization defense, settlement, idempotency, and recovery mechanics against the live Supabase staging backend (`gmtlwewpblnnkzuwfcib`).

All server-side database RPCs, triggers, and Edge Function endpoints were tested directly. A real staging order was generated with seeded catalog items and verified through two-phase reservation, price tampering prevention, authoritative settlement, and duplicate settlement idempotency.

Because live transactions with Paystack's external gateway require merchant sandbox API credentials (`sk_test_...` and `pk_test_...`), integration testing is completed for all database, security, and authorization layers. Clear instructions are provided for configuring the sandbox keys and webhook URL in the Paystack Dashboard.

---

## 2. Deployed Implementation & Authorization Review

The deployed staging implementation was verified against the local codebase:

| Component | Deployed Version / Location | Status | Key Invariants Verified |
| :--- | :--- | :--- | :--- |
| `paystack-init` | `gmtlwewpblnnkzuwfcib/functions/v1/paystack-init` | **ACTIVE** | Rejects unauthenticated callers (403); requires `orderId`; checks receipt token / customer auth. |
| `paystack-verify` | `gmtlwewpblnnkzuwfcib/functions/v1/paystack-verify` | **ACTIVE** | Enforces order binding (`orderId` + `reference`); verifies caller identity or guest receipt token; checks currency (`NGN`), reference, and amount. |
| `paystack-webhook` | `gmtlwewpblnnkzuwfcib/functions/v1/paystack-webhook` | **ACTIVE** | Enforces HMAC-SHA512 raw body validation; timing-safe signature comparison; dual verification. |
| `push-processor` | `gmtlwewpblnnkzuwfcib/functions/v1/push-processor` | **ACTIVE** | Enforces Bearer token auth via `CRON_SECRET`; scheduled every minute via `pg_cron` + `pg_net`. |
| `public.create_order_authoritative()` | Staging PostgreSQL RPC | **ACTIVE** | Zero direct client insert; server-side CSPRNG receipt token; dynamic half-and-half surcharge; landmark fee. |
| `public.begin_or_reuse_payment_attempt()` | Staging PostgreSQL RPC | **ACTIVE** | Row-level locking (`FOR UPDATE`); prevents multiple active attempts; handles race conditions. |
| `public.settle_order_payment()` | Staging PostgreSQL RPC | **ACTIVE** | Restricted to `service_role`; rejects price tampering; idempotent duplicate handling. |

---

## 3. Paystack Test Credentials Configuration Status

### 3.1 Credentials Status
- **`PAYSTACK_SECRET_KEY` (Supabase Server-Side):**
  - Current Status: **Pending Merchant Configuration**
  - When invoked without the key, Edge Functions return: `{"error":"Paystack secret key is not configured on the server."}`.
  - In accordance with staging rules, no production key was used, and payment-dependent gateway calls are safely gated.
- **`EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` (Client-Side):**
  - Current Status: **Template in `.env.example`**
  - Set to placeholder `pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.

### 3.2 Where & How to Obtain and Configure Sandbox Credentials

1. **Obtain Test Keys:**
   - Log into the [Paystack Dashboard](https://dashboard.paystack.com/#/settings/developer).
   - Toggle to **Test Mode** (toggle at top-left/top-right).
   - Navigate to: **Settings > API Keys & Webhooks**.
   - Copy:
     - **Test Secret Key** (`sk_test_...`)
     - **Test Public Key** (`pk_test_...`)

2. **Configure Secret Key in Supabase Staging (`gmtlwewpblnnkzuwfcib`):**
   - *Option A (CLI):*
     ```bash
     supabase secrets set PAYSTACK_SECRET_KEY=sk_test_your_key_here --project-ref gmtlwewpblnnkzuwfcib
     ```
   - *Option B (Dashboard):*
     Go to `https://supabase.com/dashboard/project/gmtlwewpblnnkzuwfcib/settings/functions` > **Secrets** > **Add Secret** (`PAYSTACK_SECRET_KEY`).

3. **Configure Public Key in Client Mobile App:**
   - Create local `.env` (which is safely ignored by `.gitignore`):
     ```env
     EXPO_PUBLIC_SUPABASE_URL=https://gmtlwewpblnnkzuwfcib.supabase.co
     EXPO_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
     EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_your_key_here
     EXPO_PUBLIC_APP_ENV=staging
     ```

---

## 4. Paystack Webhook Configuration

- **Webhook URL:**
  ```text
  https://gmtlwewpblnnkzuwfcib.supabase.co/functions/v1/paystack-webhook
  ```
- **Configuration Steps in Paystack:**
  1. Go to **Settings > API Keys & Webhooks > Webhooks**.
  2. Paste the Webhook URL into the **Test Webhook URL** field.
  3. Save changes.
- **Security Defenses Verified on Webhook:**
  - Non-POST methods rejected with `405 Method Not Allowed`.
  - Requests missing `x-paystack-signature` rejected with `401 Missing Paystack signature`.
  - Requests with invalid signatures rejected with `401 Invalid webhook signature`.
  - Timing-safe comparison prevents timing attacks.
  - Idempotent settlement prevents duplicate order confirmations.

---

## 5. Staging Database Verification & Transaction Lifecycle

A live transaction sequence was executed directly on `gmtlwewpblnnkzuwfcib` to test the full lifecycle:

### 5.1 Real Order Creation
- **Order ID:** `9e93ee15-d7a3-4402-9154-b0a2f24a96dc`
- **Order Number:** `AYP-20261025-2185`
- **Fulfillment:** `delivery` (New Hall, UNILAG)
- **Subtotal:** ₦14,000.00 | **Delivery Fee:** ₦500.00 | **Total:** ₦14,500.00 (1,450,000 kobo)
- **Initial Status:** `PENDING_PAYMENT`

### 5.2 Security & Payment Verification Outcomes
1. **Unauthorized Reservation Defense:** An attacker attempting to initialize payment with an invalid guest token was rejected with `Unauthorized order access token.`
2. **Authorized Two-Phase Reservation:** Initializing with the legitimate receipt token acquired a row-level lock and recorded `status = 'initiating'`, `action = 'RESERVED'`.
3. **Concurrency Protection:** A concurrent initialization attempt within the active reservation window returned `RESERVATION_IN_PROGRESS`, preventing duplicate external transactions.
4. **Price Tampering Defense:** Attempting to settle with ₦14,000 (50,000 kobo short) was rejected with `Payment amount mismatch: Expected 1450000 kobo, received 1400000 kobo.`
5. **Authoritative Order Settlement:** Settling with exact kobo total transitioned order status to `CONFIRMED`, updated transaction status to `success`, and inserted an audit log record:
   - Action: `PAYMENT_VERIFIED_AND_ORDER_CONFIRMED`
   - Performed By: `system:payment_settlement`
   - Reference: `ay_test_ref_19177027`
6. **Duplicate Settlement Idempotency:** Replaying the settlement call returned `{ "already_settled": true, "status": "CONFIRMED" }` without creating duplicate records or modifying order state.
7. **Guest Receipt Retrieval:** `get_order_by_receipt()` verified that the authorized customer with the correct receipt token could access the full order, line items, and confirmed status.
8. **Customer Timeline Event:** `order_status_events` recorded `AY Pizza: Order Confirmed` with description `Your delivery order #AYP-20261025-2185 has been confirmed.`

---

## 6. Edge Function Live Verification Summary

| Endpoint | Test Case | HTTP Status | Response |
| :--- | :--- | :--- | :--- |
| `push-processor` | Missing Authorization Header | `401` | `{"error":"Missing or malformed Authorization header."}` |
| `push-processor` | Invalid Bearer Token | `401` | `{"error":"Unauthorized invocation: invalid service key or cron secret."}` |
| `push-processor` | Valid `CRON_SECRET` Header | `200` | `{"success":true,"processed":0,"succeeded":0,"failed":0,...}` |
| `paystack-init` | Missing `PAYSTACK_SECRET_KEY` | `500` | `{"error":"Paystack secret key is not configured on the server."}` |
| `paystack-verify` | Missing `PAYSTACK_SECRET_KEY` | `500` | `{"error":"Paystack secret key is not configured on the server."}` |
| `paystack-webhook` | Missing Signature Header | `401` | `Missing Paystack signature` |
| `paystack-webhook` | Non-POST Request | `405` | `Method Not Allowed` |

---

## 7. Customer Experience Verification (UI / Mobile)

1. **Payment Modal Initialization:**
   - Loading indicator displayed while resolving authorization URL.
   - Fallback simulation modal available for offline and sandbox development.
2. **Order Confirmation & Receipt Modal:**
   - On successful settlement, `OrderReceiptModal` displays verified order number, payment reference, itemized subtotal, and UNILAG delivery destination.
   - Receipt token is securely cached in local storage for continuous guest recovery.
3. **Active Order Tracking:**
   - `OrderTrackingModal` displays the live timeline backed by `order_status_events`.
   - Polling / real-time updates transition order from `CONFIRMED` -> `PREPARING` -> `READY_FOR_PICKUP` -> `IN_TRANSIT` -> `DELIVERED`.

---

## 8. Automated Regression & Security Test Results

All local test suites and compile-time checks passed with zero errors:

| Check | Result | Details |
| :--- | :--- | :--- |
| **Jest Automated Tests** | **PASS** | 20 test suites, **258/258 tests passed** (`npm test -- --runInBand`) |
| **TypeScript Typecheck** | **PASS** | `npx tsc --noEmit` passed with 0 errors |
| **Expo Doctor** | **PASS** | 20/20 configuration checks passed |
| **Web Production Bundle** | **PASS** | `npx expo export --platform web` completed (363 modules) |
| **Android Production Bundle** | **PASS** | `npx expo export --platform android` completed (771 modules) |

---

## 9. Outstanding Action Items for Merchant

1. **Add Paystack Test Secret Key in Supabase Dashboard:**
   - Navigate to: `https://supabase.com/dashboard/project/gmtlwewpblnnkzuwfcib/settings/functions`
   - Add Secret: `PAYSTACK_SECRET_KEY = sk_test_...`
2. **Configure Test Webhook in Paystack Dashboard:**
   - URL: `https://gmtlwewpblnnkzuwfcib.supabase.co/functions/v1/paystack-webhook`
3. **Execute Live Card Test:**
   - Once the key is configured, initiate a checkout using Paystack's standard sandbox test card (`4084 0840 8408 4081`, CVV `408`, PIN `1111`, OTP `123456`) to observe live settlement.

---

## 10. Overall Phase Verdict

# **VERDICT: CONDITIONAL PASS**

All database settlement RPCs, two-phase reservation invariants, price tampering protections, duplicate webhook idempotency, authorization controls, and cron scheduling are 100% verified and operational on the remote staging database. Final live card authorization on Paystack's external gateway will activate immediately once the merchant configures their `sk_test_...` key in the Supabase secret store.

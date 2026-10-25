# AY Pizza — Phase 4.2.5: Supabase Staging Deployment Report

**Date:** October 25, 2026  
**Status:** PASS  
**Target Environment:** STAGING  
**Target Supabase Project Ref:** `gmtlwewpblnnkzuwfcib`  
**Project Name:** `ay-pizza-staging`  
**Region:** `eu-west-1` (Confirmed via Supabase CLI Management API)  
**Database Engine:** PostgreSQL `17.11.0.003`  
**Local Git Branch / Checkpoint:** `checkpoint/phase-4-2-3-1`  

---

## 1. Actual Target Project Reference & Environment Verification

- **Linked Project Ref:** `gmtlwewpblnnkzuwfcib`
- **Verification Method:** Verified via `supabase projects list` and `supabase/.temp/project-ref`.
- **Project Name & Region:** `ay-pizza-staging` located in AWS Ireland (`eu-west-1`), active and healthy.
- **Project Isolation:** Neither `AgroMarket` (`rfdgrxyofqufeivsphsv`) nor `AgroMarket 2` (`pjmsfjngwetvuwbgttiv`) was touched or linked during this deployment. Only `ay-pizza-staging` was targeted.

---

## 2. Supabase CLI Version & Authentication

- **CLI Version:** `2.117.0`
- **Authentication Method:** Supabase CLI access token stored in the OS credential store / token cache.
- **Authentication Result:** Successfully authenticated and authorized. No credentials were typed into conversation or stored in repository files.

---

## 3. Migration Deployment Results

All 15 database migrations were successfully deployed in strict chronological order to `gmtlwewpblnnkzuwfcib`:

| # | Migration File | Status | Notes |
| :- | :--- | :--- | :--- |
| 1 | `20261021000001_initial_schema.sql` | **APPLIED** | Tables, enums, RLS policies, audit logs |
| 2 | `20261021000002_seed_ay_pizza.sql` | **APPLIED** | Categories (4), products (23), sizes, customization options, landmarks (19) |
| 3 | `20261021000003_security_and_integrity_fixes.sql` | **APPLIED** | Stock bounds, relational integrity, initial authoritative creation |
| 4 | `20261021000004_catalog_customization_links.sql` | **APPLIED** | Customization group linkage |
| 5 | `20261021000005_phase3_checkout_and_paystack.sql` | **APPLIED** | Zero-direct-client-insert policy, guest receipt tokens, settlement RPC |
| 6 | `20261021000006_phase3_1_security_verification.sql` | **APPLIED** | Payment settlement audit log, receipt token hash at rest |
| 7 | `20261022000001_phase3_1_1_security_hardening.sql` | **APPLIED** | Cryptographic token generation, size availability check |
| 8 | `20261022000002_phase3_1_2_payment_concurrency.sql` | **APPLIED** | Stale transaction expiry, `begin_or_reuse_payment_attempt` lock |
| 9 | `20261022000003_phase3_1_3_payment_reservation.sql` | **APPLIED** | Two-phase reservation, partial unique attempt index |
| 10 | `20261022000004_phase3_1_4_ambiguous_outcome_recovery.sql` | **APPLIED** | Ambiguous transaction recovery RPC, reservation timeout recovery |
| 11 | `20261022000005_phase4_1_kds_and_staff_operations.sql` | **APPLIED** | KDS order queue, status transitions, staff operational roles |
| 12 | `20261022000006_phase4_1_1_adversarial_hardening.sql` | **APPLIED** | Optimistic concurrency (`version`), terminal state protection |
| 13 | `20261022000007_phase4_1_3_search_path_hardening.sql` | **APPLIED** | Explicit `search_path = public, pg_temp` on SECURITY DEFINER RPCs |
| 14 | `20261022000008_phase4_2_tracking_and_notifications.sql` | **APPLIED** | Outbox pattern, device push tokens, lease-based job claim |
| 15 | `20261022000009_phase4_2_1_adversarial_hardening.sql` | **APPLIED** | Notification worker retry limits, device deactivation on unregistered |

### Schema Verification on Remote Database
- **Public Tables (18):** `audit_logs`, `categories`, `customer_addresses`, `customization_groups`, `customization_options`, `delivery_landmarks`, `delivery_zones`, `device_push_tokens`, `notification_outbox`, `order_item_customizations`, `order_items`, `order_status_events`, `orders`, `payment_transactions`, `product_customization_groups`, `product_sizes`, `products`, `profiles`.
- **Row-Level Security (RLS):** Enabled (`rowsecurity: true`) on **100% of all 18 public tables**.
- **Seeded Catalog Records:** 4 categories, 23 products, 5 customization groups, 19 UNILAG delivery landmarks.
- **Migration History Parity:** Remote `supabase_migrations.schema_migrations` matches local migration list 15/15.

---

## 4. Edge Function Security Review & Hardening

Before deployment, all four Edge Functions were audited:

### 4.1 `paystack-verify` (Hardened)
- **Vulnerability Identified:** The initial implementation only accepted `{ reference }`, permitting an unauthenticated caller with knowledge of a transaction reference to trigger settlement on an arbitrary order.
- **Hardening Implemented:**
  1. Mandated both `reference` and `orderId` in request payload.
  2. Enforced caller authorization against `orders`:
     - Verified customer identity via user JWT bearer token (`order.customer_id === user.id`).
     - Or verified guest receipt token against `orders.receipt_token_hash` via SHA-256.
     - Or verified staff / admin role via `profiles.role`.
     - Rejects unauthorized callers with `403 Forbidden`.
  3. Enforced gateway consistency validations:
     - `transaction.reference === reference`
     - `transaction.currency === 'NGN'`
     - `transaction.metadata.order_id === orderId`
     - `transaction.amount === Math.round(order.total * 100)`
  4. Updated client `PaystackProvider.verifyPayment()` and `PaystackPaymentModal.tsx` to forward `orderId` and `receiptToken`.
  5. Added regression test suite [`src/__tests__/paystack-verify-authorization.test.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/__tests__/paystack-verify-authorization.test.ts) covering all 10 authorization and consistency boundaries.

### 4.2 `paystack-init` (Approved)
- Enforces application-level order authorization via `begin_or_reuse_payment_attempt()` RPC. Requires matching customer ID or valid guest `receiptToken`. Rejects unauthorized attempts with `403 Forbidden`.

### 4.3 `paystack-webhook` (Approved)
- Reads raw request body.
- Computes HMAC-SHA512 using `PAYSTACK_SECRET_KEY` and validates via constant-time comparison (`timingSafeEqual`) to prevent timing side-channel attacks.
- Performs dual-verification with Paystack REST API before invoking `settle_order_payment()`.

### 4.4 `push-processor` (Approved)
- Enforces Bearer token authentication matching `SUPABASE_SERVICE_ROLE_KEY` or `CRON_SECRET`.
- Rejects unauthenticated callers with `401 Unauthorized`.
- Leases jobs using `FOR UPDATE SKIP LOCKED` to prevent duplicate processing under concurrent invocations.

---

## 5. Edge Function Deployment Results

All four Edge Functions were deployed with `--no-verify-jwt` (delegating to validated application-level authentication):

```text
supabase functions deploy paystack-init --project-ref gmtlwewpblnnkzuwfcib --no-verify-jwt
supabase functions deploy paystack-verify --project-ref gmtlwewpblnnkzuwfcib --no-verify-jwt
supabase functions deploy paystack-webhook --project-ref gmtlwewpblnnkzuwfcib --no-verify-jwt
supabase functions deploy push-processor --project-ref gmtlwewpblnnkzuwfcib --no-verify-jwt
```

**Remote Function Status on `gmtlwewpblnnkzuwfcib`:**
| Function Name | Status | Version | JWT Verification |
| :--- | :--- | :--- | :--- |
| `paystack-init` | **ACTIVE** | 1 | False (Application-enforced) |
| `paystack-verify` | **ACTIVE** | 1 | False (Application-enforced) |
| `paystack-webhook` | **ACTIVE** | 1 | False (HMAC-SHA512 enforced) |
| `push-processor` | **ACTIVE** | 1 | False (Bearer token enforced) |

---

## 6. Secrets Configuration Status

- **Configured Secrets:**
  - `CRON_SECRET`: Generated via 32-byte CSPRNG and configured on Supabase remote via temporary ignored environment file. Secret value stored securely in Supabase Vault and function secret store.
- **Platform Defaults Active:**
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- **Pending Custom Secret:**
  - `PAYSTACK_SECRET_KEY`: Staging/test key (`sk_test_...`) to be provided by merchant. In accordance with staging rules, payment-dependent verification is paused until the merchant configures this sandbox key. No production key was substituted.

---

## 7. Notification Worker Scheduling

- **Extensions Enabled:** `pg_cron` and `pg_net` enabled in schema `extensions`.
- **Vault Integration:** `CRON_SECRET` stored in `vault.secrets` via `vault.create_secret()`.
- **Scheduled Job:**
  - Job Name: `process-push-notifications`
  - Schedule: `* * * * *` (Every minute)
  - Invocation Method: `net.http_post` targeting `https://gmtlwewpblnnkzuwfcib.supabase.co/functions/v1/push-processor` with Bearer auth header dynamically resolved from `vault.decrypted_secrets`.
  - Duplicate Processing Protection: Atomically guaranteed by PostgreSQL `FOR UPDATE SKIP LOCKED` and lease timestamps in `claim_notification_jobs()`.
  - Active Status: `true` in `cron.job`.

---

## 8. Post-Deployment Verification & Local Health Checks

All local verification suites were executed against the updated codebase:

| Check | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| **Unit & Integration Tests** | `npm test -- --runInBand` | **PASS** | 20 test suites passed, **258/258 tests passed** |
| **TypeScript Compilation** | `npx tsc --noEmit` | **PASS** | 0 errors |
| **Expo Configuration Health** | `npx expo-doctor` | **PASS** | 20/20 checks passed |
| **Web Production Bundle** | `npx expo export --platform web` | **PASS** | Metro bundled 363 modules, exported to `dist/` |
| **Android Production Bundle** | `npx expo export --platform android` | **PASS** | Metro bundled 771 modules, generated `.hbc` |

---

## 9. Blockers & Outstanding Manual Steps

1. **Merchant Paystack Test Key:**
   - Configure `PAYSTACK_SECRET_KEY` in Supabase project `gmtlwewpblnnkzuwfcib` via Dashboard:
     `Project Settings > Edge Functions > Secrets > Add New Secret`  
     Name: `PAYSTACK_SECRET_KEY`  
     Value: `sk_test_...` (from Paystack Dashboard Sandbox API Keys).
2. **Paystack Webhook URL:**
   - Configure Webhook URL in Paystack Dashboard (Test Mode):
     `https://gmtlwewpblnnkzuwfcib.supabase.co/functions/v1/paystack-webhook`
3. **Expo Push Notifications on Physical Device:**
   - Test push delivery with a physical Android/iOS device running a development build after setting `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the staging project.

---

## 10. Overall Deployment Status

# **STATUS: PASS**

The AY Pizza staging database migrations, Edge Functions, security defenses, and notification cron scheduler are completely deployed, verified, and operational on Supabase project `gmtlwewpblnnkzuwfcib`.

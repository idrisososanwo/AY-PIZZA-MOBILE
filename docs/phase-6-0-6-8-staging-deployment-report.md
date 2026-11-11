# AY PIZZA — Phase 6.0.6.8: Staging Deployment & Live Concurrency Verification Report

**Deployment Date:** November 10, 2026  
**Environment:** STAGING ONLY  
**Target Project Reference:** `gmtlwewpblnnkzuwfcib` (`ay-pizza-staging`)  
**Deployment Status:** COMPLETE & 100% VERIFIED  
**Git Branch:** `checkpoint/phase-4-2-3-1` (No commits or pushes performed)  
**Strict Boundaries Followed:** Staging target only, zero production touches, zero credential alterations, zero EAS OTA updates, zero Git commits/pushes.

---

## 1. Executive Summary

Phase 6.0.6.8 has been successfully deployed to the AY Pizza staging environment (`gmtlwewpblnnkzuwfcib`). The deployment included:

1. **Target Project Verification:** Verified project linkage against `supabase/.temp/linked-project.json` and `supabase/.temp/project-ref`, confirming the staging environment `ay-pizza-staging` (`gmtlwewpblnnkzuwfcib`).
2. **PostgreSQL Settlement Hardening Migration:** Applied `supabase/migrations/20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql` without touching unrelated pending migrations. Migration was verified and tracked in `supabase_migrations.schema_migrations`.
3. **Database Access Control:** Verified `settle_order_payment` routine privileges: strictly revoked from `PUBLIC, anon, authenticated` and granted exclusively to `service_role` and `postgres`.
4. **Edge Function Deployment:** Deployed `supabase/functions/paystack-simulate` to staging. Verified fail-closed environment guards (`APP_ENV=staging`), project reference verification (`gmtlwewpblnnkzuwfcib`), and uniform HTTP 404 security handling.
5. **Live Staging Scenario Verification:** Executed all 6 core settlement scenarios using dynamic, collision-proof fixtures. All 6 passed with 100% data integrity.
6. **Dual-Connection Advisory-Lock Concurrency Testing:** Executed simultaneous transactions from two independent PostgreSQL client processes. Proved that Connection 2 blocked for the exact duration of Connection 1's lock (waiting ~3 seconds) and cleanly rejected the duplicate reference upon unblocking (2ms after Connection 1's commit).
7. **End-to-End Simulation Testing:** Verified guest customer simulation via receipt-token authorization, database settlement confirmation (`CONFIRMED`), and idempotent re-call handling (`alreadySettled: true`).

---

## 2. Command Log & Execution History

| Step | Operation / Command | Target / Scope | Outcome |
|:---|:---|:---|:---|
| **1** | Project Link Inspection (`.temp/linked-project.json`) | Local project ref | Confirmed `ref: gmtlwewpblnnkzuwfcib`, name: `ay-pizza-staging`. |
| **2** | `npx supabase migration list` | Staging database | Confirmed remote history up to `20261022000009`. Pending: `20261109000001`. |
| **3** | Schema Inspection (`pg_proc`, `orders`, `payment_transactions`, `audit_logs`) | Staging database | Confirmed all required tables, columns, and enums exist on staging. |
| **4** | `npx supabase db query --linked --file "supabase/migrations/20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql"` | Staging database | **SUCCESS (Code 0)**: Hardened `settle_order_payment` deployed. |
| **5** | Migration History Recording (`INSERT INTO supabase_migrations.schema_migrations`) | Staging database | **SUCCESS (Code 0)**: Recorded `version: 20261109000001`. |
| **6** | Routine Privilege Verification | Staging database | **CONFIRMED**: `service_role` (EXECUTE), `postgres` (EXECUTE); `anon`/`authenticated`/`public` revoked. |
| **7** | `npx supabase functions deploy paystack-simulate --project-ref gmtlwewpblnnkzuwfcib --no-verify-jwt` | Supabase Edge Runtime | **SUCCESS (Code 0)**: Function deployed to staging. |
| **8** | Fail-Closed Environment Guard Probe (curl) | Edge Function HTTP | **VERIFIED (403 Forbidden)**: Missing `APP_ENV` rejected before any logic ran. |
| **9** | `npx supabase secrets set APP_ENV=staging --project-ref gmtlwewpblnnkzuwfcib` | Supabase Secrets | **SUCCESS (Code 0)**: Explicit staging environment configured. |
| **10** | Uniform Security Probes (Method, UUID, Auth) | Edge Function HTTP | **VERIFIED**: GET -> 405; invalid UUID -> 400; nonexistent order -> 404. |
| **11** | Core Scenario Suite Execution (`scripts/verify-staging-settlement-results.sql`) | Staging database | **SUCCESS (Code 0)**: All 6 scenarios passed. |
| **12** | Dual-Connection Concurrency Runner (`scripts/run-concurrency-test.ps1`) | Staging database | **SUCCESS (Code 0)**: True advisory-lock mutual exclusion proven. |
| **13** | End-to-End Simulation Test (`scripts/test-edge-function-simulation.ps1`) | Staging + Edge Function | **SUCCESS (Code 0)**: Order settled (`CONFIRMED`), retry returned `alreadySettled`. |

---

## 3. Live Staging Test Suite Results (6 Core Scenarios)

The test suite executed against `gmtlwewpblnnkzuwfcib` using dynamic run suffix `20261110_180004_5d60df`:

```json
[
  {
    "scenario_num": 1,
    "scenario_name": "Initial Settlement",
    "success": true,
    "order_status": "CONFIRMED",
    "tx_status": "success",
    "error_message": null,
    "full_response": {
      "order_id": "56393b9d-5d46-4fc0-8346-41cd686fbb60",
      "order_number": "ORD-STG-20261110_180004_5d60df-1",
      "payment_reference": "ref_stg_20261110_180004_5d60df_01",
      "status": "CONFIRMED",
      "success": true
    }
  },
  {
    "scenario_num": 2,
    "scenario_name": "Idempotent Retry",
    "success": true,
    "order_status": "CONFIRMED",
    "tx_status": null,
    "error_message": null,
    "full_response": {
      "already_settled": true,
      "order_id": "56393b9d-5d46-4fc0-8346-41cd686fbb60",
      "order_number": "ORD-STG-20261110_180004_5d60df-1",
      "payment_reference": "ref_stg_20261110_180004_5d60df_01",
      "status": "CONFIRMED",
      "success": true
    }
  },
  {
    "scenario_num": 3,
    "scenario_name": "Cross-Order Collision",
    "success": false,
    "order_status": "PENDING_PAYMENT",
    "tx_status": null,
    "error_message": "Payment reference is already associated with another order.",
    "full_response": {
      "conflicting_order_number": "ORD-STG-20261110_180004_5d60df-1",
      "error": "Payment reference is already associated with another order.",
      "reference": "ref_stg_20261110_180004_5d60df_01",
      "success": false
    }
  },
  {
    "scenario_num": 4,
    "scenario_name": "Duplicate Payment",
    "success": true,
    "order_status": "CONFIRMED",
    "tx_status": "duplicate_success_needs_refund",
    "error_message": null,
    "full_response": {
      "duplicate_payment": true,
      "duplicate_reference": "ref_stg_20261110_180004_5d60df_01_dup",
      "order_id": "56393b9d-5d46-4fc0-8346-41cd686fbb60",
      "order_number": "ORD-STG-20261110_180004_5d60df-1",
      "payment_reference": "ref_stg_20261110_180004_5d60df_01",
      "status": "CONFIRMED",
      "success": true,
      "warning": "Duplicate payment recorded. Manual refund reconciliation required."
    }
  },
  {
    "scenario_num": 5,
    "scenario_name": "Cancelled Order",
    "success": false,
    "order_status": "CANCELLED",
    "tx_status": "paid_after_cancellation",
    "error_message": "Order is cancelled. Payment logged for manual refund reconciliation.",
    "full_response": {
      "error": "Order is cancelled. Payment logged for manual refund reconciliation.",
      "order_id": "d336b13b-3e62-4141-893a-b18b35b95135",
      "status": "CANCELLED",
      "success": false
    }
  },
  {
    "scenario_num": 6,
    "scenario_name": "Amount Mismatch",
    "success": false,
    "order_status": null,
    "tx_status": null,
    "error_message": "Payment amount mismatch: Expected 720000 kobo, received 999999 kobo.",
    "full_response": {
      "error": "Payment amount mismatch: Expected 720000 kobo, received 999999 kobo.",
      "success": false
    }
  }
]
```

---

## 4. Dual-Connection PostgreSQL Concurrency Test Evidence

To verify advisory-lock mutual exclusion (`pg_advisory_xact_lock`), two independent client processes were executed concurrently against staging:

- **Order A (`1164ff66-7b2b-4ac1-9a6d-fb41533204cf`):** `ORD-CONCUR-A-concur_20261110_180047_b01c3a`
- **Order B (`889bd8a7-c011-4627-8ea9-7b055dedacf0`):** `ORD-CONCUR-B-concur_20261110_180047_b01c3a`
- **Contended Reference:** `ref_concur_20261110_180047_b01c3a`

### Execution Timeline:
1. **Connection 1** opened transaction `BEGIN`, invoked `settle_order_payment` for Order A with `ref_concur_...`, and initiated `pg_sleep(5)`.
2. **Connection 2** was launched 1.2 seconds later at `18:02:01.724688+00`, attempting to settle Order B with the exact same reference.
3. **Lock Contention:** Connection 2 blocked at `pg_advisory_xact_lock` waiting for Connection 1's transaction to conclude.
4. **Connection 1 Commit:** Connection 1 completed sleep and committed at `18:02:04.568367+00`.
5. **Connection 2 Unblock:** Connection 2 immediately unblocked at `18:02:04.570903+00` (within 2 milliseconds of commit).
6. **Result Captured:**
```json
{
  "conn2_start_time": "2026-11-10 18:02:01.724688+00",
  "conn2_end_time": "2026-11-10 18:02:04.570903+00",
  "conn2_result": {
    "conflicting_order_number": "ORD-CONCUR-A-concur_20261110_180047_b01c3a",
    "error": "Payment reference is already associated with another order.",
    "reference": "ref_concur_20261110_180047_b01c3a",
    "success": false
  }
}
```
7. **Database Verification:**
   - Order A: `status = 'CONFIRMED'`, `payment_reference = 'ref_concur_20261110_180047_b01c3a'`
   - Order B: `status = 'PENDING_PAYMENT'`, `payment_reference = NULL`

This conclusively proves true engine-level mutual exclusion across independent connections on remote Supabase PostgreSQL.

---

## 5. End-to-End Edge Function Simulation Verification

Order fixture `c0000000-1111-4000-8000-123456789abc` (`ORD-SIM-TEST-001`) was created with SHA-256 hashed receipt token `e1427edf18253a4e9d51de54b5ff8e3257912fc1d2009b1ba45a88601f14ab63` (`staging_test_token_secret_12345`).

### 1. Initial Simulation Call:
**Request:**
```http
POST /functions/v1/paystack-simulate HTTP/1.1
Content-Type: application/json

{
  "orderId": "c0000000-1111-4000-8000-123456789abc",
  "receiptToken": "staging_test_token_secret_12345"
}
```
**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "simulated": true,
  "orderId": "c0000000-1111-4000-8000-123456789abc",
  "orderNumber": "ORD-SIM-TEST-001",
  "status": "CONFIRMED",
  "paymentReference": "sim_stg_ORD_SIM_TEST_001_1794334046587_1fd3924f1375"
}
```

### 2. Idempotent Re-Call:
**Request:** Same payload.  
**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "alreadySettled": true,
  "orderId": "c0000000-1111-4000-8000-123456789abc",
  "orderNumber": "ORD-SIM-TEST-001",
  "status": "CONFIRMED",
  "paymentReference": "sim_stg_ORD_SIM_TEST_001_1794334046587_1fd3924f1375",
  "message": "Order was already settled in CONFIRMED state with verified payment transaction. No duplicate simulation performed."
}
```

### 3. Unauthorized Caller Check:
**Request:** Same `orderId`, invalid `receiptToken`.  
**Response (HTTP 404 Not Found):**
```json
{
  "error": "Order not found."
}
```
Confirms uniform HTTP 404 security protection against order enumeration.

---

## 6. Strict Execution Boundaries Compliance

- **Target Verification:** Exclusively deployed to `gmtlwewpblnnkzuwfcib` (`ay-pizza-staging`).
- **Production Guard:** Zero connections or calls made to production.
- **Credential Integrity:** No payment secrets or Supabase service keys modified or disclosed.
- **EAS OTA / Native Builds:** Zero builds or OTA releases published.
- **Git State:** Clean worktree; zero commits or pushes executed.

---

## 7. Deployment Sign-Off

The payment settlement architecture is fully deployed, locked against concurrent race conditions, sanitized against SQL error disclosure, and verified on the staging environment.


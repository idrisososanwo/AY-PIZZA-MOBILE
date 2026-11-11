# AY PIZZA — PHASE 6.0.6.5 REPORT
## Payment Settlement Race Condition & Edge Function Integrity Hardening

**Date:** 2026-11-09  
**Branch:** `checkpoint/phase-4-2-3-1`  
**Status:** Complete & Verified Locally (No Remote Deployments, No Migrations Run Remotely)

---

### Executive Summary

During Phase 6.0.6.4, an architectural read-only audit revealed a critical concurrency vulnerability in PostgreSQL RPC `public.settle_order_payment` alongside Edge Function integrity and security leakage concerns in `supabase/functions/paystack-simulate/index.ts`. 

Phase 6.0.6.5 resolves these issues end-to-end through:
1. A new forward-only migration (`supabase/migrations/20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql`) introducing exclusive row-level locking (`SELECT ... FOR UPDATE`), defensive conditional updates (`WHERE id = p_order_id AND status = 'PENDING_PAYMENT'`), diagnostic row count checks (`GET DIAGNOSTICS ROW_COUNT`), and lifecycle status alignment (`ACCEPTED`).
2. Hardening `supabase/functions/paystack-simulate/index.ts` to map duplicate payments to HTTP 409 Conflict, verify existing transaction records before reporting idempotency, unify unauthorized and nonexistent responses to HTTP 404 to eliminate UUID enumeration, and enforce strict RPC return validation.
3. A comprehensive test suite (`src/__tests__/phase6-0-6-5-settlement-race-condition-and-edge-integrity.test.ts`) covering all 20 required scenarios across 16 exhaustive test cases.
4. Clean passes across all verification tooling: Deno check (0 errors), TypeScript compiler (0 errors), full Jest test suite (54 suites, 892 tests passed), Expo lint (0 errors), and Expo Doctor (20/20 checks passed).

---

### 1. Exact Files Changed / Created

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql` | **Created** | Forward-only migration containing the hardened `public.settle_order_payment` definition. |
| `supabase/functions/paystack-simulate/index.ts` | **Modified** | Edge function hardened with uniform 404, HTTP 409 duplicate handling, transaction verification, and return validation. |
| `src/__tests__/phase6-0-6-5-settlement-race-condition-and-edge-integrity.test.ts` | **Created** | Comprehensive 20-scenario test suite verifying concurrency semantics, idempotency, authorization, and regressions. |
| `docs/phase-6-0-6-5-settlement-race-condition-and-edge-integrity.md` | **Created** | Authoritative Phase 6.0.6.5 documentation report. |

*(Note: Workspace editor configuration files `.vscode/settings.json`, `.vscode/extensions.json`, and `supabase/functions/deno.json` were maintained for Deno/Node LSP coexistence without altering React Native settings).*

---

### 2. Root Cause and Correction of the Database Race Condition

#### 2.1 The Race Condition Root Cause
In migration `20261021000006_phase3_1_security_verification.sql`, `public.settle_order_payment` executed:
```sql
SELECT * INTO v_order
FROM public.orders
WHERE id = p_order_id;
```
followed later by:
```sql
UPDATE public.orders
SET status = 'CONFIRMED',
    payment_reference = p_reference,
    updated_at = timezone('utc'::text, now())
WHERE id = p_order_id;
```

**Failure Mode:**
1. Transaction A and Transaction B initiate settlement concurrently for the same order `O` with distinct references `ref_A` and `ref_B`.
2. Both transactions execute `SELECT * FROM public.orders` simultaneously without row locking. Both read `status = 'PENDING_PAYMENT'`.
3. Because `status` is `PENDING_PAYMENT`, both transactions bypass the duplicate payment check (which only checked `CONFIRMED`, `PAID`, etc.).
4. Transaction A executes `UPDATE public.orders SET status = 'CONFIRMED', payment_reference = 'ref_A' WHERE id = 'O'` and commits.
5. Transaction B, having already passed the initial check, executes its update: `UPDATE public.orders SET status = 'CONFIRMED', payment_reference = 'ref_B' WHERE id = 'O'`. Because the `WHERE` clause did not constrain on `status = 'PENDING_PAYMENT'`, PostgreSQL overwrites the row with `ref_B`!
6. **Result:** The original reference `ref_A` was overwritten in `public.orders`, corrupting the audit trail and leaving the system in an inconsistent state.

#### 2.2 The Multi-Layered Architectural Correction
The hardened migration applies defense-in-depth:
1. **Exclusive Row-Level Lock (`SELECT ... FOR UPDATE`):**
   ```sql
   SELECT * INTO v_order
   FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;
   ```
   When Transaction A acquires the row lock, Transaction B blocks at the database engine level until Transaction A finishes and commits.
2. **Post-Lock Status Re-Evaluation:**
   When Transaction B unblocks, its `v_order` record reflects the committed state (`status = 'CONFIRMED'`, `payment_reference = 'ref_A'`). It immediately branches to the duplicate-payment logic, logs the event for merchant refund reconciliation, and never reaches the update block.
3. **Defensive Conditional Update:**
   ```sql
   UPDATE public.orders
   SET status = 'CONFIRMED',
       payment_reference = p_reference,
       updated_at = timezone('utc'::text, now())
   WHERE id = p_order_id AND status = 'PENDING_PAYMENT';
   ```
   Even if an unexpected execution path reached the update, the `AND status = 'PENDING_PAYMENT'` clause guarantees zero rows are updated if the order has transitioned.
4. **Diagnostic Row Count Verification:**
   ```sql
   GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
   IF v_rows_updated = 0 THEN
       RETURN jsonb_build_object(
           'success', false,
           'error', 'Settlement conflict: order was updated by a concurrent transaction.',
           'order_id', p_order_id
       );
   END IF;
   ```
5. **Lifecycle Status Alignment (`ACCEPTED`):**
   Added `ACCEPTED` to the already-settled statuses list (`CONFIRMED`, `ACCEPTED`, `PAID`, `PREPARING`, `READY_FOR_PICKUP`, `IN_TRANSIT`, `DELIVERED`). Orders accepted by kitchen staff in the KDS are now handled correctly and idempotently.
6. **Access Control:**
   `REVOKE EXECUTE ON FUNCTION public.settle_order_payment(...) FROM PUBLIC, anon, authenticated;`  
   `GRANT EXECUTE ON FUNCTION public.settle_order_payment(...) TO service_role;`

---

### 3. New Migration File and Complete SQL

**File:** `supabase/migrations/20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql`

```sql
-- =============================================================================
-- AY PIZZA — PHASE 6.0.6.5: PAYMENT SETTLEMENT CONCURRENCY & RACE CONDITION FIX
-- Migration: 20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql
--
-- Security & Concurrency Invariants:
-- 1. Exclusive Row-Level Locking (SELECT ... FOR UPDATE):
--    Locks the target order row at the start of public.settle_order_payment().
--    Concurrent settlements for the same order are serialized at the database
--    engine level, preventing race conditions where two simultaneous requests
--    both see 'PENDING_PAYMENT'.
-- 2. Post-Lock Status & Idempotency Evaluation:
--    A second serialized settlement transaction re-reads the committed row state,
--    discovers status is already 'CONFIRMED' (or subsequent fulfillment status),
--    and correctly routes to idempotent success (if matching reference) or
--    duplicate payment logging for refund (if different reference).
-- 3. Defensive Conditional Update:
--    The initial status transition explicitly enforces:
--    WHERE id = p_order_id AND status = 'PENDING_PAYMENT'
--    Guarantees no race can ever overwrite an already settled payment reference.
-- 4. Row Count Diagnostic Verification:
--    Checks GET DIAGNOSTICS ROW_COUNT; if zero rows were updated, fails closed.
-- 5. Full Lifecycle Alignment:
--    Includes 'ACCEPTED' in the already-settled status check so orders accepted
--    by kitchen staff in KDS are correctly handled.
-- 6. Access Control:
--    Revokes EXECUTE from PUBLIC, anon, and authenticated; grants only to service_role.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.settle_order_payment(
    p_order_id UUID,
    p_reference TEXT,
    p_gateway TEXT,
    p_amount_in_kobo BIGINT,
    p_channel TEXT,
    p_metadata JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_expected_kobo BIGINT;
    v_rows_updated INT;
BEGIN
    -- 1. Exclusive row-level lock on the specific order:
    -- Serializes concurrent settlements for the same order and ensures
    -- subsequent checks evaluate the authoritative, committed row state.
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- 2. Validate payment amount matches authoritative order total in kobo
    v_expected_kobo := ROUND(v_order.total * 100)::BIGINT;
    IF p_amount_in_kobo != v_expected_kobo THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment amount mismatch: Expected ' || v_expected_kobo || ' kobo, received ' || p_amount_in_kobo || ' kobo.'
        );
    END IF;

    -- 3. Cancelled order check: Do not revive cancelled orders
    IF v_order.status = 'CANCELLED' THEN
        -- Record transaction with warning status
        INSERT INTO public.payment_transactions (
            order_id,
            gateway,
            reference,
            amount,
            amount_in_kobo,
            currency,
            status,
            channel,
            paid_at,
            metadata
        ) VALUES (
            p_order_id,
            COALESCE(p_gateway, 'paystack'),
            p_reference,
            v_order.total,
            p_amount_in_kobo,
            'NGN',
            'paid_after_cancellation',
            p_channel,
            timezone('utc'::text, now()),
            p_metadata
        )
        ON CONFLICT (reference) DO UPDATE
        SET status = 'paid_after_cancellation',
            updated_at = timezone('utc'::text, now());

        INSERT INTO public.audit_logs (
            action,
            performed_by,
            target_type,
            target_id,
            details
        ) VALUES (
            'PAYMENT_RECEIVED_ON_CANCELLED_ORDER',
            'system:payment_settlement',
            'order',
            p_order_id::TEXT,
            jsonb_build_object(
                'order_number', v_order.order_number,
                'reference', p_reference,
                'amount_in_kobo', p_amount_in_kobo,
                'warning', 'Order is CANCELLED. Requires immediate merchant refund.'
            )
        );

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order is cancelled. Payment logged for manual refund reconciliation.',
            'order_id', v_order.id,
            'status', 'CANCELLED'
        );
    END IF;

    -- 4. Check for duplicate successful payments on an already settled order
    -- Note: Includes 'ACCEPTED' which represents kitchen-accepted orders in KDS.
    IF v_order.status IN ('CONFIRMED', 'ACCEPTED', 'PAID', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED') THEN
        -- If this is the exact same reference, handle idempotently
        IF v_order.payment_reference = p_reference THEN
            INSERT INTO public.payment_transactions (
                order_id,
                gateway,
                reference,
                amount,
                amount_in_kobo,
                currency,
                status,
                channel,
                paid_at,
                metadata
            ) VALUES (
                p_order_id,
                COALESCE(p_gateway, 'paystack'),
                p_reference,
                v_order.total,
                p_amount_in_kobo,
                'NGN',
                'success',
                p_channel,
                timezone('utc'::text, now()),
                p_metadata
            )
            ON CONFLICT (reference) DO UPDATE
            SET status = 'success',
                updated_at = timezone('utc'::text, now());

            RETURN jsonb_build_object(
                'success', true,
                'order_id', v_order.id,
                'order_number', v_order.order_number,
                'status', v_order.status,
                'already_settled', true,
                'payment_reference', v_order.payment_reference
            );
        ELSE
            -- A different reference was successfully charged for an already settled order!
            -- Duplicate payment detected!
            INSERT INTO public.payment_transactions (
                order_id,
                gateway,
                reference,
                amount,
                amount_in_kobo,
                currency,
                status,
                channel,
                paid_at,
                metadata
            ) VALUES (
                p_order_id,
                COALESCE(p_gateway, 'paystack'),
                p_reference,
                v_order.total,
                p_amount_in_kobo,
                'NGN',
                'duplicate_success_needs_refund',
                p_channel,
                timezone('utc'::text, now()),
                p_metadata
            )
            ON CONFLICT (reference) DO UPDATE
            SET status = 'duplicate_success_needs_refund',
                updated_at = timezone('utc'::text, now());

            INSERT INTO public.audit_logs (
                action,
                performed_by,
                target_type,
                target_id,
                details
            ) VALUES (
                'DUPLICATE_PAYMENT_DETECTED',
                'system:payment_settlement',
                'order',
                p_order_id::TEXT,
                jsonb_build_object(
                    'order_number', v_order.order_number,
                    'original_reference', v_order.payment_reference,
                    'duplicate_reference', p_reference,
                    'amount_in_kobo', p_amount_in_kobo,
                    'alert', 'Duplicate payment received for already settled order. Requires merchant refund.'
                )
            );

            RETURN jsonb_build_object(
                'success', true,
                'duplicate_payment', true,
                'order_id', v_order.id,
                'order_number', v_order.order_number,
                'status', v_order.status,
                'payment_reference', v_order.payment_reference,
                'duplicate_reference', p_reference,
                'warning', 'Duplicate payment recorded. Manual refund reconciliation required.'
            );
        END IF;
    END IF;

    -- 5. Only PENDING_PAYMENT orders may undergo initial settlement
    IF v_order.status != 'PENDING_PAYMENT' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order status ' || v_order.status || ' is not eligible for payment settlement.',
            'order_id', v_order.id,
            'status', v_order.status
        );
    END IF;

    -- 6. First successful settlement: transition status to CONFIRMED
    -- Defensive conditional update ensures we only update if the order is still PENDING_PAYMENT
    UPDATE public.orders
    SET status = 'CONFIRMED',
        payment_reference = p_reference,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id AND status = 'PENDING_PAYMENT';

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Settlement conflict: order was updated by a concurrent transaction.',
            'order_id', p_order_id
        );
    END IF;

    -- 7. Record payment transaction
    INSERT INTO public.payment_transactions (
        order_id,
        gateway,
        reference,
        amount,
        amount_in_kobo,
        currency,
        status,
        channel,
        paid_at,
        metadata
    ) VALUES (
        p_order_id,
        COALESCE(p_gateway, 'paystack'),
        p_reference,
        v_order.total,
        p_amount_in_kobo,
        'NGN',
        'success',
        p_channel,
        timezone('utc'::text, now()),
        p_metadata
    )
    ON CONFLICT (reference) DO UPDATE
    SET status = 'success',
        updated_at = timezone('utc'::text, now());

    -- 8. Audit log entry
    INSERT INTO public.audit_logs (
        action,
        performed_by,
        target_type,
        target_id,
        details
    ) VALUES (
        'PAYMENT_VERIFIED_AND_ORDER_CONFIRMED',
        'system:payment_settlement',
        'order',
        p_order_id::TEXT,
        jsonb_build_object(
            'order_number', v_order.order_number,
            'reference', p_reference,
            'amount_in_kobo', p_amount_in_kobo,
            'channel', p_channel,
            'gateway', p_gateway
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'status', 'CONFIRMED',
        'payment_reference', p_reference
    );
END;
$$;

-- Revoke from public, anon, authenticated and grant exclusively to service_role
REVOKE EXECUTE ON FUNCTION public.settle_order_payment(UUID, TEXT, TEXT, BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_order_payment(UUID, TEXT, TEXT, BIGINT, TEXT, JSONB) TO service_role;
```

---

### 4. Duplicate-Payment Response Behavior (HTTP 409)

When `settle_order_payment` encounters a duplicate payment (i.e. another payment reference succeeded for an already-settled order), the RPC returns:
```json
{
  "success": true,
  "duplicate_payment": true,
  "order_id": "...",
  "payment_reference": "<original_ref>",
  "duplicate_reference": "<new_ref>",
  "warning": "Duplicate payment recorded. Manual refund reconciliation required."
}
```

In `supabase/functions/paystack-simulate/index.ts`:
- The previous implementation checked `settleResult.success !== true`, which mistakenly treated `duplicate_payment: true` as a successful simulation because `settleResult.success` was `true`.
- **Hardened Correction:** Added explicit check:
```typescript
if (settleResult.duplicate_payment === true) {
  return new Response(
    JSON.stringify({
      error: 'Duplicate payment detected. A payment reference has already been settled for this order.',
      duplicatePayment: true,
      orderId: settleResult.order_id || order.id,
      orderNumber: settleResult.order_number || order.order_number,
      status: settleResult.status || order.status,
      paymentReference: settleResult.payment_reference || order.payment_reference,
      warning: settleResult.warning || 'Duplicate payment recorded. Manual refund reconciliation required.',
    }),
    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```
**Invariant:** A duplicate payment requiring refund is **never** reported to the caller as a successful simulation. It is returned with HTTP 409 Conflict, preserving visibility in audit logs and payment transactions.

---

### 5. Already-Settled Verification Behavior

Before returning an idempotent success response for an already-settled order:
1. **Lifecycle Alignment:** `settledStatuses` now includes `['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED']`.
2. **Payment Reference Presence:** The function checks `order.payment_reference`. If missing or empty, it fails closed with HTTP 409 (`error: Order status indicates settlement, but payment reference is missing`).
3. **Transaction Existence & Status Verification:**
   The function queries PostgreSQL table `public.payment_transactions`:
   ```typescript
   const { data: existingTx, error: txErr } = await supabase
     .from('payment_transactions')
     .select('id, reference, status, order_id')
     .eq('order_id', order.id)
     .eq('reference', order.payment_reference)
     .maybeSingle();
   ```
   If `txErr`, `!existingTx`, or `existingTx.status !== 'success'`, the function fails closed with HTTP 409 (`error: Unable to verify payment settlement transaction in database for already settled order.`).
4. **Verified Success:** Only when the transaction is affirmatively verified does it return HTTP 200 `{ success: true, alreadySettled: true, ... }`.

---

### 6. UUID Disclosure Elimination (Uniform HTTP 404)

In previous versions, a nonexistent order returned HTTP 404, while an unauthorized customer or invalid guest token returned HTTP 403 or 401. This created a classic timing/status side-channel allowing unauthorized callers to probe for valid order UUIDs.

**Hardened Correction:**
```typescript
// 7. UNIFORM 404 RESPONSE: Nonexistent orders, unauthorized customers,
// and invalid guest receipt tokens receive the identical HTTP 404 response
// to eliminate UUID existence disclosure and enumeration vectors.
if (orderErr || !order || !isAuthorized) {
  return new Response(
    JSON.stringify({ error: 'Order not found.' }),
    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```
Nonexistent orders, wrong-customer queries, and unauthenticated/invalid guest tokens all receive identical HTTP status (404) and identical body (`{ "error": "Order not found." }`).

---

### 7. Verification Test Suite and Diagnostic Results

#### 7.1 Scenario Test Coverage (`phase6-0-6-5-settlement-race-condition-and-edge-integrity.test.ts`)
The 20 scenarios are implemented across 16 test cases:
1. **Scenarios 1, 2, 3 (Concurrency & Exclusivity):** Two concurrent requests with different simulation references simulate simultaneous execution. Only one initial settlement succeeds. The original payment reference cannot be overwritten.
2. **Scenarios 4, 5, 6 (Duplicate Payment Rejection & Refunds):** Duplicate payment produces an explicit duplicate response (HTTP 409), is never reported as simulated successfully, and remains visible in refund transactions and audit logs.
3. **Scenario 7 (Already-Settled CONFIRMED):** Returns HTTP 200 with `alreadySettled: true` when a matching transaction with `status = 'success'` exists.
4. **Scenario 8 (Already-Settled ACCEPTED):** Successfully verifies kitchen-accepted (`ACCEPTED`) orders with a matching successful transaction.
5. **Scenario 9 (Missing Transaction Fails Closed):** Returns HTTP 409 if `payment_transactions` record is missing.
6. **Scenario 10 (Mismatched Reference Fails Closed):** Returns HTTP 409 if reference in `orders` does not match `payment_transactions`.
7. **Scenarios 11 & 12 (Cancelled & Refunded Rejection):** Both return HTTP 400 with explicit rejection errors.
8. **Scenario 13 (Unknown Status Rejection):** Rejected with HTTP 400.
9. **Scenario 14 (Uniform 404 Equivalence):** Verifies identical HTTP 404 and `{ "error": "Order not found." }` for nonexistent orders, wrong customers, and invalid tokens.
10. **Scenarios 15, 16, 17 (Authorization Verification):** Confirms authenticated customer, guest receipt-token SHA-256 match, and staff/admin role permissions.
11. **Scenario 18 (Failed Conditional Update):** Fails closed if order status changed from `PENDING_PAYMENT` before update (zero rows updated).
12. **Scenario 19 (RPC Settlement Error Handling):** Edge function properly returns HTTP 500 when RPC returns an error.
13. **Scenario 20 (Paystack Real Verification Regression):** Confirms `paystackProvider.verifyPayment` correctly propagates verification failures and does not report false success.

#### 7.2 Tooling Verification Results
- **Deno Check:**
  `deno check --config supabase/functions/deno.json supabase/functions/paystack-simulate/index.ts`
  **Result:** `0 errors`
- **React Native TypeScript:**
  `npx tsc --noEmit`
  **Result:** `0 errors`
- **Full Jest Test Suite:**
  `npx jest`
  **Result:** `54/54 test suites passed`, `892/892 tests passed` (Elapsed: 20.97s)
- **Expo Lint:**
  `npx expo lint`
  **Result:** `0 errors` (47 pre-existing warnings in unrelated legacy files)
- **Expo Doctor:**
  `npx expo-doctor`
  **Result:** `20/20 checks passed`

---

### 8. Limitations & Remote Concurrency Verification Plan

#### 8.1 Mocked Testing Semantics
In Node/Jest, concurrency tests verify:
- Asynchronous serialization semantics.
- Conditional state evaluation and row count detection.
- Response mapping and HTTP 409 status code enforcement.

However, real PostgreSQL engine-level locking (`SELECT ... FOR UPDATE`, row-level spinlocks, and transaction isolation level guarantees) must be verified against actual PostgreSQL once migration deployment is authorized.

#### 8.2 Real PostgreSQL Concurrency Verification Plan
When the user authorizes remote migration deployment, the following test script should be executed across two simultaneous `psql` connections:

```sql
-- CONNECTION 1:
BEGIN;
SELECT * FROM public.orders WHERE id = 'YOUR_TEST_ORDER_ID' FOR UPDATE;
-- (Holds lock, pauses 5 seconds)
SELECT pg_sleep(5);
-- Settle with Reference A:
SELECT public.settle_order_payment(
  'YOUR_TEST_ORDER_ID',
  'sim_stg_test_ref_A',
  'staging_simulation',
  350000,
  'qa_simulator',
  '{"test": 1}'::jsonb
);
COMMIT;

-- CONNECTION 2 (Executed immediately after Connection 1 starts):
BEGIN;
-- This call will block until Connection 1 commits:
SELECT public.settle_order_payment(
  'YOUR_TEST_ORDER_ID',
  'sim_stg_test_ref_B',
  'staging_simulation',
  350000,
  'qa_simulator',
  '{"test": 2}'::jsonb
);
COMMIT;
```

**Expected Result:**
1. Connection 1 succeeds: `{ "success": true, "status": "CONFIRMED", "payment_reference": "sim_stg_test_ref_A" }`.
2. Connection 2 unblocks upon Connection 1's commit, detects the committed `CONFIRMED` status with `sim_stg_test_ref_A`, and returns:
   `{ "success": true, "duplicate_payment": true, "payment_reference": "sim_stg_test_ref_A", "duplicate_reference": "sim_stg_test_ref_B" }`.
3. In `public.orders`, `payment_reference` remains `sim_stg_test_ref_A` and is never overwritten.
4. In `public.payment_transactions`, both transactions are recorded: `sim_stg_test_ref_A` as `success`, and `sim_stg_test_ref_B` as `duplicate_success_needs_refund`.

---

### 9. Explicit Confirmation of Execution Boundaries

In strict compliance with the prompt instructions:
- **NO remote SQL or migration was executed** against Supabase.
- **NO Edge Function was deployed** or redeployed.
- **NO Supabase secrets or environment variables were modified**.
- **NO EAS OTA update was published**.
- **NO Git commit or git push was performed**.
- All changes exist exclusively in the local working directory awaiting user review and explicit deployment authorization.


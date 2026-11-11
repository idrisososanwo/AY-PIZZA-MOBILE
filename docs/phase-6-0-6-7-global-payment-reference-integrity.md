# AY PIZZA — PHASE 6.0.6.7 REPORT
## Global Payment Reference Integrity & Transaction Collision Hardening

**Date:** 2026-11-09  
**Branch:** `checkpoint/phase-4-2-3-1`  
**Status:** Implemented & Verified Locally (No Remote Deployments, No Migrations Run Remotely)

---

### Executive Summary

Phase 6.0.6.6 identified critical concurrency and data-integrity vulnerabilities in the initial settlement hardening migration:
1. `ON CONFLICT (reference) DO UPDATE` was not scoped to `order_id`, allowing a settlement on Order B to mutate a transaction row belonging to Order A.
2. An existing successful transaction could be downgraded to `paid_after_cancellation` or `duplicate_success_needs_refund`.
3. An existing duplicate-payment transaction could be promoted to `success`, wiping out refund warnings.
4. References were not normalized or validated upfront, causing raw, uncaught PostgreSQL constraint exceptions on `NULL`, empty, or whitespace references.
5. Concurrent requests for different orders using the same reference were not serialized at the reference level, leading to race conditions and raw unique-constraint crashes.

Phase 6.0.6.7 completely resolves these issues locally by revising [`supabase/migrations/20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql) and aligning [`supabase/functions/paystack-simulate/index.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/functions/paystack-simulate/index.ts).

---

### 1. Exact Changed Files

| File | Action | Description |
|---|---|---|
| [`supabase/migrations/20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/migrations/20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql) | **Revised** | Updated `public.settle_order_payment` with reference normalization, advisory locking (`pg_advisory_xact_lock`), cross-order collision guards, order-scoped `ON CONFLICT` updates (`WHERE payment_transactions.order_id = p_order_id`), row count verification, state preservation, metadata merging, and exception containment. |
| [`supabase/functions/paystack-simulate/index.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/functions/paystack-simulate/index.ts) | **Modified** | Aligned Edge Function: sanitized RPC errors to prevent internal SQL disclosure, added conflict detection mapping to HTTP 409, and preserved uniform 404 security. |
| [`src/__tests__/phase6-0-6-5-settlement-race-condition-and-edge-integrity.test.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/src/__tests__/phase6-0-6-5-settlement-race-condition-and-edge-integrity.test.ts) | **Expanded** | Expanded test suite from 16 to 33 test cases, covering all 20 required Phase 6.0.6.7 scenarios plus Edge Function and regression tests. |
| [`docs/phase-6-0-6-7-global-payment-reference-integrity.md`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/docs/phase-6-0-6-7-global-payment-reference-integrity.md) | **Created** | Comprehensive authoritative audit and implementation report. |

---

### 2. Reference Normalization and Upfront Validation Rules

In `public.settle_order_payment`:
1. **Target Order ID Validation:**
   ```sql
   IF p_order_id IS NULL THEN
       RETURN jsonb_build_object('success', false, 'error', 'Valid order ID is required.');
   END IF;
   ```
2. **Null Reference Check:**
   ```sql
   IF p_reference IS NULL THEN
       RETURN jsonb_build_object('success', false, 'error', 'Payment reference cannot be null.');
   END IF;
   ```
3. **Trimming and Whitespace Check:**
   `v_ref := TRIM(p_reference);`
   ```sql
   IF v_ref = '' THEN
       RETURN jsonb_build_object('success', false, 'error', 'Payment reference cannot be empty or whitespace.');
   END IF;
   ```
4. **Length Boundary Check:**
   ```sql
   IF length(v_ref) > 255 THEN
       RETURN jsonb_build_object('success', false, 'error', 'Payment reference exceeds maximum length (255 characters).');
   END IF;
   ```
5. **Consistency:** `v_ref` is strictly used across all subsequent operations (locks, cross-order checks, `orders.payment_reference`, and `payment_transactions.reference`). Legitimate Paystack references are preserved identically (only surrounding whitespace is trimmed).

---

### 3. Concurrency Protection & Locking Strategy

#### 3.1 Two-Tier Concurrency Architecture
When two settlement requests execute concurrently, they may either target:
- The **same order** with different references.
- Two **different orders** with the **same reference**.

To guarantee 100% serializability in both cases, `settle_order_payment` implements two-tier locking:

1. **Tier 1 — Reference-Scoped Transaction Advisory Lock:**
   ```sql
   PERFORM pg_advisory_xact_lock(hashtext('settle_order_payment'), hashtext(v_ref));
   ```
   - **Why Transaction-Scoped?** `pg_advisory_xact_lock` is automatically released by PostgreSQL when the transaction ends (`COMMIT` or `ROLLBACK`). It requires no explicit manual release, preventing lock leaks.
   - **Dual-Integer Namespace:** Uses `hashtext('settle_order_payment')` as the application namespace (class ID) and `hashtext(v_ref)` as the resource key (object ID).
   - **Cross-Order Protection:** If Order A and Order B are processed concurrently with the same reference, the second request immediately blocks at Tier 1. When it unblocks, the first transaction has already committed, and the second request's cross-order check detects the reference in `orders` or `payment_transactions`, cleanly rejecting the duplicate with a structured error.
   - **Collision Characteristics:** `hashtext()` produces a uniform 32-bit integer. Even if an advisory lock hash collision occurred between two different references, the only effect is brief serialization (one waits for the other for milliseconds), with zero impact on data correctness.

2. **Tier 2 — Order Row-Level Lock:**
   ```sql
   SELECT * INTO v_order
   FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;
   ```
   - Serializes concurrent settlement attempts for the **same order**.
   - Ensures the second request reads the committed row state and routes to duplicate payment handling.

---

### 4. Revised ON CONFLICT Paths & Order Scoping

Every `INSERT INTO public.payment_transactions ... ON CONFLICT (reference) DO UPDATE` statement in `settle_order_payment` now includes:
```sql
WHERE payment_transactions.order_id = p_order_id;
```

Followed immediately by row count diagnostic verification:
```sql
GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'Payment reference conflict: reference already exists for another order.',
        'reference', v_ref
    );
END IF;
```

**Security Invariants Enforced:**
1. If a transaction row for `v_ref` exists and belongs to **another order**, PostgreSQL's `WHERE payment_transactions.order_id = p_order_id` clause evaluates to `FALSE`. PostgreSQL **refuses to update the row**.
2. Because 0 rows were updated, `v_rows_updated = 0` triggers, and the function returns a controlled JSON error.
3. Another order's `order_id`, `gateway`, `amount`, and `channel` can **never** be mutated or corrupted.

---

### 5. Transaction State-Transition Rules

The `SET status` expressions in `ON CONFLICT` enforce unidirectional state preservation:

1. **Cancelled Orders (Path 1):**
   ```sql
   SET status = CASE 
           WHEN payment_transactions.status = 'success' THEN payment_transactions.status
           ELSE 'paid_after_cancellation'
       END
   ```
   An existing `success` transaction is **never downgraded** to `paid_after_cancellation`.
2. **Already-Settled Duplicate Payments (Path 3):**
   ```sql
   SET status = CASE
           WHEN payment_transactions.status = 'success' THEN payment_transactions.status
           ELSE 'duplicate_success_needs_refund'
       END
   ```
   An existing `success` transaction is **never downgraded** to `duplicate_success_needs_refund`.
3. **Initial Settlement (Path 4):**
   ```sql
   SET status = CASE
           WHEN payment_transactions.status IN ('duplicate_success_needs_refund', 'paid_after_cancellation')
               THEN payment_transactions.status
           ELSE 'success'
       END
   ```
   An existing `duplicate_success_needs_refund` or `paid_after_cancellation` transaction is **never promoted** to regular `success`.

---

### 6. Metadata Preservation Strategy

For legitimate same-order updates, metadata is merged as follows:
```sql
metadata = COALESCE(payment_transactions.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb)
```

**Why this merge direction (`existing || new`) is appropriate:**
- In PostgreSQL JSONB concatenation (`a || b`), keys from `b` overwrite keys from `a`, while non-overlapping keys from `a` are retained.
- Historical reservation and checkout metadata (e.g. `reservation_token`, `initiated_by`, `initiated_at`) from the original attempt are preserved in the transaction record.
- Incoming settlement details (e.g. `simulated_by`, `simulated_at`, `channel`, `gateway_response`) overwrite or append the final authoritative payment evidence.

---

### 7. Edge Function Response Alignment

In [`supabase/functions/paystack-simulate/index.ts`](file:///c:/Users/Ososanwo%20Idris/Documents/AY%20PIZZA%20MOBILE/supabase/functions/paystack-simulate/index.ts):
1. **Sanitized Database Errors:**
   ```typescript
   if (settleErr) {
     return new Response(
       JSON.stringify({ error: 'Database settlement could not be completed.' }),
       { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
   }
   ```
   Raw SQL error strings and PostgreSQL internal messages are never leaked to callers.
2. **Conflict Classification to HTTP 409:**
   If the settlement RPC returns an error indicating reference conflict or collision, the Edge Function maps it to HTTP 409 Conflict rather than a generic 400.
3. **Uniform 404 Response Preserved:**
   Nonexistent orders, unauthorized customers, and invalid guest tokens continue to receive identical HTTP 404 `{ "error": "Order not found." }` responses.

---

### 8. Verification Results

| Tool / Check | Command | Result |
|---|---|---|
| **Deno Type Check** | `deno check --config supabase/functions/deno.json supabase/functions/paystack-simulate/index.ts` | **PASSED (0 errors)** |
| **React Native TypeScript** | `npx tsc --noEmit` | **PASSED (0 errors)** |
| **Full Jest Test Suite** | `npx jest` | **PASSED (54/54 suites, 909/909 tests)** |
| **Expo Linter** | `npx expo lint` | **PASSED (0 errors)** |
| **Expo Doctor** | `npx expo-doctor` | **PASSED (20/20 checks passed)** |

All 17 new test cases covering all 20 required Phase 6.0.6.7 scenarios passed without regression.

---

### 9. Remaining Limitations

- **Mock Testing Distinction:** In-memory Node/Jest tests verify the logical flow, parameter normalization, state transitions, and error mappings. Real database engine spinlocks and `pg_advisory_xact_lock` execution require a live PostgreSQL instance.
- **Remote Integration Verification:** Once deployment is authorized, a multi-connection SQL test script should be executed on staging PostgreSQL to verify concurrent cross-order advisory locking.

---

### 10. Complete Revised Migration SQL

**File:** `supabase/migrations/20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql`

```sql
-- =============================================================================
-- AY PIZZA — PHASE 6.0.6.7: GLOBAL PAYMENT REFERENCE INTEGRITY & CONCURRENCY HARDENING
-- Migration: 20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql
--
-- Security, Integrity & Concurrency Invariants:
-- 1. Reference Normalization & Upfront Validation:
--    Rejects NULL, empty, whitespace-only, and excessively long references (>255 chars)
--    before modifying any database records. Uses TRIM(p_reference) consistently.
-- 2. Global Cross-Order Reference Serialization via Advisory Locks:
--    Acquires a transaction-level advisory lock on the normalized reference:
--    pg_advisory_xact_lock(hashtext('settle_order_payment'), hashtext(v_ref))
--    Serializes concurrent attempts using the same reference (whether for the same
--    order or different orders) at the database engine level. Automatically released
--    upon transaction COMMIT or ROLLBACK.
-- 3. Exclusive Row-Level Lock on Order (SELECT ... FOR UPDATE):
--    Serializes concurrent settlements for the same order.
-- 4. Upfront Cross-Order Collision Guards:
--    Explicitly queries public.orders and public.payment_transactions to ensure
--    the reference does not belong to another order.
-- 5. Safe ON CONFLICT Behavior Scoped to Order:
--    All INSERT INTO public.payment_transactions ... ON CONFLICT (reference) DO UPDATE
--    statements include: WHERE payment_transactions.order_id = p_order_id.
--    Guarantees an existing transaction belonging to another order can NEVER be updated.
--    Zero rows updated triggers a controlled conflict failure response.
-- 6. State-Transition Safeguards:
--    - An existing successful transaction is NEVER downgraded to refund-warning states.
--    - An existing duplicate-payment transaction is NEVER promoted to success.
-- 7. Deliberate Metadata Merging:
--    Preserves existing reservation metadata and overlays settlement metadata:
--    COALESCE(payment_transactions.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb)
-- 8. Defensive Conditional Order Update:
--    WHERE id = p_order_id AND status = 'PENDING_PAYMENT' with ROW_COUNT verification.
-- 9. Exception Containment:
--    Catches unique_violation and unexpected SQL errors, returning clean JSON responses.
-- 10. Access Control:
--    REVOKE EXECUTE from PUBLIC, anon, authenticated; GRANT exclusively to service_role.
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
    v_ref TEXT;
    v_existing_order RECORD;
    v_existing_tx RECORD;
BEGIN
    -- 1. Reference Normalization and Upfront Format Validation
    IF p_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Valid order ID is required.');
    END IF;

    IF p_reference IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment reference cannot be null.');
    END IF;

    v_ref := TRIM(p_reference);
    IF v_ref = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment reference cannot be empty or whitespace.');
    END IF;

    IF length(v_ref) > 255 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment reference exceeds maximum length (255 characters).');
    END IF;

    -- 2. Transaction-Scoped Advisory Lock on Reference
    -- Serializes all concurrent settlement attempts for the exact same reference globally.
    -- Automatically released when this transaction completes (COMMIT or ROLLBACK).
    PERFORM pg_advisory_xact_lock(hashtext('settle_order_payment'), hashtext(v_ref));

    -- 3. Exclusive row-level lock on the specific target order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- 4. Global Cross-Order Reference Collision Guards
    -- Check if reference is already associated with another order in public.orders
    SELECT id, order_number INTO v_existing_order
    FROM public.orders
    WHERE payment_reference = v_ref
      AND id != p_order_id
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment reference is already associated with another order.',
            'reference', v_ref,
            'conflicting_order_number', v_existing_order.order_number
        );
    END IF;

    -- Check if reference is already associated with another order in public.payment_transactions
    SELECT id, order_id INTO v_existing_tx
    FROM public.payment_transactions
    WHERE reference = v_ref
      AND order_id != p_order_id
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment reference is already associated with another order transaction.',
            'reference', v_ref
        );
    END IF;

    -- 5. Validate payment amount matches authoritative order total in kobo
    v_expected_kobo := ROUND(v_order.total * 100)::BIGINT;
    IF p_amount_in_kobo != v_expected_kobo THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment amount mismatch: Expected ' || v_expected_kobo || ' kobo, received ' || p_amount_in_kobo || ' kobo.'
        );
    END IF;

    -- 6. Cancelled order check: Do not revive cancelled orders
    IF v_order.status = 'CANCELLED' THEN
        -- Record transaction with warning status, scoped strictly to p_order_id
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
            v_ref,
            v_order.total,
            p_amount_in_kobo,
            'NGN',
            'paid_after_cancellation',
            p_channel,
            timezone('utc'::text, now()),
            p_metadata
        )
        ON CONFLICT (reference) DO UPDATE
        SET status = CASE 
                WHEN payment_transactions.status = 'success' THEN payment_transactions.status
                ELSE 'paid_after_cancellation'
            END,
            metadata = COALESCE(payment_transactions.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
            updated_at = timezone('utc'::text, now())
        WHERE payment_transactions.order_id = p_order_id;

        GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
        IF v_rows_updated = 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Payment reference conflict: reference already exists for another order.',
                'reference', v_ref
            );
        END IF;

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
                'reference', v_ref,
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

    -- 7. Check for duplicate successful payments on an already settled order
    -- Note: Includes 'ACCEPTED' which represents kitchen-accepted orders in KDS.
    IF v_order.status IN ('CONFIRMED', 'ACCEPTED', 'PAID', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED') THEN
        -- If this is the exact same reference, handle idempotently
        IF v_order.payment_reference = v_ref THEN
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
                v_ref,
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
                channel = COALESCE(EXCLUDED.channel, payment_transactions.channel),
                metadata = COALESCE(payment_transactions.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
                updated_at = timezone('utc'::text, now())
            WHERE payment_transactions.order_id = p_order_id;

            GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
            IF v_rows_updated = 0 THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Payment reference conflict: reference already exists for another order.',
                    'reference', v_ref
                );
            END IF;

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
                v_ref,
                v_order.total,
                p_amount_in_kobo,
                'NGN',
                'duplicate_success_needs_refund',
                p_channel,
                timezone('utc'::text, now()),
                p_metadata
            )
            ON CONFLICT (reference) DO UPDATE
            SET status = CASE
                    WHEN payment_transactions.status = 'success' THEN payment_transactions.status
                    ELSE 'duplicate_success_needs_refund'
                END,
                metadata = COALESCE(payment_transactions.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
                updated_at = timezone('utc'::text, now())
            WHERE payment_transactions.order_id = p_order_id;

            GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
            IF v_rows_updated = 0 THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Payment reference conflict: reference already exists for another order.',
                    'reference', v_ref
                );
            END IF;

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
                    'duplicate_reference', v_ref,
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
                'duplicate_reference', v_ref,
                'warning', 'Duplicate payment recorded. Manual refund reconciliation required.'
            );
        END IF;
    END IF;

    -- 8. Only PENDING_PAYMENT orders may undergo initial settlement
    IF v_order.status != 'PENDING_PAYMENT' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order status ' || v_order.status || ' is not eligible for payment settlement.',
            'order_id', v_order.id,
            'status', v_order.status
        );
    END IF;

    -- 9. First successful settlement: transition status to CONFIRMED
    -- Defensive conditional update ensures we only update if the order is still PENDING_PAYMENT
    UPDATE public.orders
    SET status = 'CONFIRMED',
        payment_reference = v_ref,
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

    -- 10. Record payment transaction
    -- Re-use / update transaction row for this order, preserving valid states
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
        v_ref,
        v_order.total,
        p_amount_in_kobo,
        'NGN',
        'success',
        p_channel,
        timezone('utc'::text, now()),
        p_metadata
    )
    ON CONFLICT (reference) DO UPDATE
    SET status = CASE
            WHEN payment_transactions.status IN ('duplicate_success_needs_refund', 'paid_after_cancellation')
                THEN payment_transactions.status
            ELSE 'success'
        END,
        channel = COALESCE(EXCLUDED.channel, payment_transactions.channel),
        paid_at = COALESCE(payment_transactions.paid_at, timezone('utc'::text, now())),
        metadata = COALESCE(payment_transactions.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
        updated_at = timezone('utc'::text, now())
    WHERE payment_transactions.order_id = p_order_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment reference conflict: reference already exists for another order.',
            'reference', v_ref
        );
    END IF;

    -- 11. Audit log entry
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
            'reference', v_ref,
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
        'payment_reference', v_ref
    );

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment reference conflict: unique constraint violation on payment reference.',
            'reference', v_ref
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Database settlement error: ' || SQLERRM,
            'reference', v_ref
        );
END;
$$;

-- Revoke from public, anon, authenticated and grant exclusively to service_role
REVOKE EXECUTE ON FUNCTION public.settle_order_payment(UUID, TEXT, TEXT, BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_order_payment(UUID, TEXT, TEXT, BIGINT, TEXT, JSONB) TO service_role;
```

---

### 11. Explicit Confirmation of Execution Boundaries

In strict compliance with instructions:
- **NO remote SQL or migration was executed** against Supabase.
- **NO Edge Function was deployed** or redeployed.
- **NO Supabase secrets or environment variables were changed**.
- **NO EAS OTA update was published**.
- **NO Git commit or git push was performed**.
- All changes are strictly staged locally on branch `checkpoint/phase-4-2-3-1` awaiting your review.


-- =============================================================================
-- AY PIZZA — Phase 3.1.4: Paystack Ambiguous-Outcome Recovery & Reconciliation
-- =============================================================================
-- Migration: 20261022000004_phase3_1_4_ambiguous_outcome_recovery.sql
--
-- Concurrency & Ambiguous Outcome Invariants:
-- 1. Adds 'requires_reconciliation' to payment_status enum.
-- 2. Partial unique index on payment_transactions(order_id)
--    WHERE status IN ('initiating', 'requires_reconciliation', 'initialized')
--    guarantees that an order CANNOT create a new reservation or external session
--    while an ambiguous attempt is unverified.
-- 3. Stale initiating reservations (>45s) transition to 'requires_reconciliation'
--    instead of being blindly discarded.
-- 4. mark_payment_ambiguous() transitions 'initiating' -> 'requires_reconciliation'
--    upon network timeout or dropped HTTP response.
-- 5. reconcile_payment_attempt() resolves ambiguous transactions based on external
--    Paystack REST verification (recovered as initialized, confirmed not found as failed,
--    or settled as success).
-- =============================================================================

-- 1. ADD 'requires_reconciliation' TO payment_status ENUM
DO $$ BEGIN
    ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'requires_reconciliation';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. UPDATE COMPREHENSIVE ACTIVE & AMBIGUOUS ATTEMPT UNIQUE INDEX
DROP INDEX IF EXISTS public.idx_single_active_payment_attempt_per_order;

CREATE UNIQUE INDEX idx_single_active_payment_attempt_per_order
ON public.payment_transactions(order_id)
WHERE status IN ('initiating', 'requires_reconciliation', 'initialized');

-- 3. CONCURRENCY-SAFE RESERVATION & RECONCILIATION-AWARE RPC
CREATE OR REPLACE FUNCTION public.begin_or_reuse_payment_attempt(
    p_order_id UUID,
    p_receipt_token TEXT,
    p_proposed_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_existing_tx RECORD;
    v_token_hash TEXT;
    v_ref TEXT;
    v_new_tx_id UUID;
    v_reservation_token UUID;
BEGIN
    IF p_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order ID is required.');
    END IF;

    -- 1. Acquire row lock on the order (FOR UPDATE)
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- 2. Check order fulfillment status
    IF v_order.status IN ('CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order is already confirmed or settled. Current status: ' || v_order.status,
            'order_status', v_order.status
        );
    END IF;

    IF v_order.status = 'CANCELLED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order has been cancelled.',
            'order_status', v_order.status
        );
    END IF;

    IF v_order.status != 'PENDING_PAYMENT' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order is not pending payment. Current status: ' || v_order.status,
            'order_status', v_order.status
        );
    END IF;

    -- 3. Receipt token authorization check
    IF p_receipt_token IS NOT NULL AND TRIM(p_receipt_token) != '' THEN
        v_token_hash := encode(digest(TRIM(p_receipt_token), 'sha256'), 'hex');
    ELSE
        v_token_hash := NULL;
    END IF;

    IF v_order.customer_id IS NULL THEN
        IF v_token_hash IS NULL OR v_order.receipt_token_hash != v_token_hash THEN
            IF NOT public.is_staff_or_admin() THEN
                RETURN jsonb_build_object('success', false, 'error', 'Unauthorized order access token.');
            END IF;
        END IF;
    ELSE
        IF NOT (auth.uid() IS NOT NULL AND v_order.customer_id = auth.uid()) THEN
            IF v_token_hash IS NULL OR v_order.receipt_token_hash != v_token_hash THEN
                IF NOT public.is_staff_or_admin() THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized order access token.');
                END IF;
            END IF;
        END IF;
    END IF;

    -- 4. Clean up stale attempts:
    -- A. Stale initialized attempts older than 15 minutes -> expired
    UPDATE public.payment_transactions
    SET status = 'expired',
        updated_at = timezone('utc'::text, now())
    WHERE order_id = p_order_id
      AND status = 'initialized'
      AND created_at < (timezone('utc'::text, now()) - INTERVAL '15 minutes');

    -- B. Stale initiating reservations older than 45 seconds -> requires_reconciliation
    -- (Never blindly expire without verifying external provider status!)
    UPDATE public.payment_transactions
    SET status = 'requires_reconciliation',
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reconcile_reason}', '"reservation_timeout"'),
        updated_at = timezone('utc'::text, now())
    WHERE order_id = p_order_id
      AND status = 'initiating'
      AND created_at < (timezone('utc'::text, now()) - INTERVAL '45 seconds');

    -- 5. Check if an active 'initialized' attempt exists (< 15 mins)
    SELECT id, reference, amount, amount_in_kobo, metadata, created_at
    INTO v_existing_tx
    FROM public.payment_transactions
    WHERE order_id = p_order_id
      AND status = 'initialized'
      AND created_at >= (timezone('utc'::text, now()) - INTERVAL '15 minutes')
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND AND (v_existing_tx.metadata->>'access_code') IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'action', 'REUSE_ACTIVE',
            'is_reused', true,
            'transaction_id', v_existing_tx.id,
            'reference', v_existing_tx.reference,
            'access_code', v_existing_tx.metadata->>'access_code',
            'authorization_url', v_existing_tx.metadata->>'authorization_url',
            'amount', v_existing_tx.amount,
            'amount_in_kobo', v_existing_tx.amount_in_kobo
        );
    END IF;

    -- 6. Check if an attempt requires reconciliation
    SELECT id, reference, amount, amount_in_kobo, metadata, created_at
    INTO v_existing_tx
    FROM public.payment_transactions
    WHERE order_id = p_order_id
      AND status = 'requires_reconciliation'
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'action', 'RECONCILIATION_REQUIRED',
            'is_reused', false,
            'transaction_id', v_existing_tx.id,
            'reference', v_existing_tx.reference,
            'amount', v_existing_tx.amount,
            'amount_in_kobo', v_existing_tx.amount_in_kobo,
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'metadata', v_existing_tx.metadata,
            'created_at', v_existing_tx.created_at
        );
    END IF;

    -- 7. Check if an active 'initiating' reservation is in progress (< 45 seconds)
    SELECT id, reference, metadata, created_at
    INTO v_existing_tx
    FROM public.payment_transactions
    WHERE order_id = p_order_id
      AND status = 'initiating'
      AND created_at >= (timezone('utc'::text, now()) - INTERVAL '45 seconds')
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'action', 'RESERVATION_IN_PROGRESS',
            'is_reused', false,
            'transaction_id', v_existing_tx.id,
            'reference', v_existing_tx.reference,
            'created_at', v_existing_tx.created_at
        );
    END IF;

    -- 8. No active attempt or ambiguous session exists:
    -- Atomically CREATE THE RESERVATION ROW while holding lock
    v_reservation_token := gen_random_uuid();
    v_ref := COALESCE(
        p_proposed_reference,
        'ay_ord_' || regexp_replace(v_order.order_number, '[^a-zA-Z0-9]', '_', 'g') || '_' || floor(extract(epoch from now()) * 1000)::text
    );

    INSERT INTO public.payment_transactions (
        order_id,
        gateway,
        reference,
        amount,
        amount_in_kobo,
        currency,
        status,
        metadata
    ) VALUES (
        p_order_id,
        'paystack',
        v_ref,
        v_order.total,
        ROUND(v_order.total * 100)::BIGINT,
        'NGN',
        'initiating',
        jsonb_build_object(
            'reservation_token', v_reservation_token,
            'initiated_by', COALESCE(auth.uid()::text, 'guest')
        )
    ) RETURNING id INTO v_new_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'action', 'RESERVED',
        'is_reused', false,
        'transaction_id', v_new_tx_id,
        'reservation_token', v_reservation_token,
        'reference', v_ref,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'total', v_order.total,
        'total_in_kobo', ROUND(v_order.total * 100)::BIGINT,
        'guest_email', v_order.guest_email,
        'guest_phone', v_order.guest_phone,
        'guest_name', v_order.guest_name,
        'customer_id', v_order.customer_id
    );
END;
$$;

-- 4. MARK PAYMENT ATTEMPT AS AMBIGUOUS (NETWORK TIMEOUT / DROPPED RESPONSE)
CREATE OR REPLACE FUNCTION public.mark_payment_ambiguous(
    p_transaction_id UUID,
    p_reservation_token UUID,
    p_error_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.payment_transactions
    SET status = 'requires_reconciliation',
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{ambiguous_reason}',
            to_jsonb(COALESCE(p_error_message, 'External provider timeout or network interruption'))
        ),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_transaction_id
      AND status = 'initiating'
      AND (metadata->>'reservation_token')::UUID = p_reservation_token;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. RECONCILE AMBIGUOUS PAYMENT ATTEMPT BASED ON PAYSTACK VERIFICATION
CREATE OR REPLACE FUNCTION public.reconcile_payment_attempt(
    p_transaction_id UUID,
    p_outcome TEXT,
    p_access_code TEXT DEFAULT NULL,
    p_authorization_url TEXT DEFAULT NULL,
    p_gateway_response JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx RECORD;
BEGIN
    SELECT * INTO v_tx
    FROM public.payment_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment transaction not found.');
    END IF;

    -- If already settled by webhook while reconciliation was in flight
    IF v_tx.status = 'success' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'success',
            'already_settled', true,
            'reference', v_tx.reference
        );
    END IF;

    IF p_outcome = 'RECOVERED' THEN
        -- Paystack confirmed the transaction exists and is payable
        UPDATE public.payment_transactions
        SET status = 'initialized',
            metadata = jsonb_build_object(
                'access_code', p_access_code,
                'authorization_url', p_authorization_url
            ) || COALESCE(v_tx.metadata, '{}'::jsonb) || jsonb_build_object('reconciliation', p_gateway_response),
            updated_at = timezone('utc'::text, now())
        WHERE id = p_transaction_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'initialized',
            'reference', v_tx.reference,
            'access_code', p_access_code,
            'authorization_url', p_authorization_url,
            'amount', v_tx.amount,
            'amount_in_kobo', v_tx.amount_in_kobo
        );

    ELSIF p_outcome = 'NOT_FOUND_ON_GATEWAY' THEN
        -- Paystack confirmed that reference was never created
        -- Safe to mark as failed/expired, releasing the unique index for retry
        UPDATE public.payment_transactions
        SET status = 'failed',
            metadata = jsonb_set(
                COALESCE(v_tx.metadata, '{}'::jsonb),
                '{reconciliation}',
                jsonb_build_object('result', 'confirmed_not_found_on_gateway', 'details', p_gateway_response)
            ),
            updated_at = timezone('utc'::text, now())
        WHERE id = p_transaction_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'failed',
            'released', true
        );

    ELSIF p_outcome = 'FAILED_ON_GATEWAY' THEN
        UPDATE public.payment_transactions
        SET status = 'failed',
            metadata = jsonb_set(
                COALESCE(v_tx.metadata, '{}'::jsonb),
                '{reconciliation}',
                jsonb_build_object('result', 'failed_on_gateway', 'details', p_gateway_response)
            ),
            updated_at = timezone('utc'::text, now())
        WHERE id = p_transaction_id;

        RETURN jsonb_build_object('success', true, 'status', 'failed', 'released', true);

    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Unrecognized reconciliation outcome: ' || p_outcome);
    END IF;
END;
$$;

-- 6. SECURITY PERMISSIONS AND GRANTS
GRANT EXECUTE ON FUNCTION public.begin_or_reuse_payment_attempt TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_payment_ambiguous TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_payment_attempt TO service_role;

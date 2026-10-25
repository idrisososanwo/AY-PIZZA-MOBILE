-- =============================================================================
-- AY PIZZA — Phase 3.1.2: Payment Initialization Concurrency & Session Safety
-- =============================================================================
-- Migration: 20261022000002_phase3_1_2_payment_concurrency.sql
--
-- Security and concurrency invariants:
-- 1. Partial unique index on payment_transactions(order_id) WHERE status = 'initialized'
--    guarantees at the database engine level that no order can EVER have more than one
--    concurrent active payment attempt.
-- 2. begin_or_reuse_payment_attempt() acquires row-level lock on the order (FOR UPDATE)
--    and idempotently returns the active attempt if created within 15 minutes.
-- 3. Expired attempts (> 15 minutes) are safely transitioned to status = 'expired',
--    releasing the partial unique constraint and allowing a fresh attempt.
-- 4. record_payment_attempt() enforces safe resolution so concurrent workers resolve
--    to a single winning active Paystack session.
-- =============================================================================

-- 1. ADD ENUM VALUES IF NOT PRESENT
DO $$ BEGIN
    ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'expired';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'paid_after_cancellation';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'duplicate_success_needs_refund';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. PARTIAL UNIQUE INDEX: EXACTLY ONE ACTIVE INITIALIZED PAYMENT ATTEMPT PER ORDER
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_initialized_payment_per_order 
ON public.payment_transactions(order_id) 
WHERE status = 'initialized';

-- 3. CONCURRENCY-SAFE PAYMENT INITIALIZATION ATTEMPT RESOLUTION RPC
CREATE OR REPLACE FUNCTION public.begin_or_reuse_payment_attempt(
    p_order_id UUID,
    p_receipt_token TEXT
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
BEGIN
    IF p_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order ID is required.');
    END IF;

    -- Row-level exclusive lock on the specific order:
    -- Prevents race conditions and ensures different orders initialize completely in parallel.
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Check order status: only PENDING_PAYMENT orders can initialize payments
    IF v_order.status != 'PENDING_PAYMENT' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order is not pending payment. Current status: ' || v_order.status,
            'order_status', v_order.status
        );
    END IF;

    -- Receipt token cryptographic hash verification
    IF p_receipt_token IS NOT NULL AND TRIM(p_receipt_token) != '' THEN
        v_token_hash := encode(digest(TRIM(p_receipt_token), 'sha256'), 'hex');
        IF v_order.receipt_token_hash IS NOT NULL AND v_order.receipt_token_hash != v_token_hash THEN
            -- Check if authenticated owner or staff
            IF NOT (auth.uid() IS NOT NULL AND v_order.customer_id = auth.uid()) AND NOT public.is_staff_or_admin() THEN
                RETURN jsonb_build_object('success', false, 'error', 'Unauthorized order access token.');
            END IF;
        END IF;
    END IF;

    -- Clean up and expire stale initialized attempts older than 15 minutes
    UPDATE public.payment_transactions
    SET status = 'expired',
        updated_at = timezone('utc'::text, now())
    WHERE order_id = p_order_id
      AND status = 'initialized'
      AND created_at < (timezone('utc'::text, now()) - INTERVAL '15 minutes');

    -- Look for an existing active attempt created within 15 minutes
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
            'is_reused', true,
            'reference', v_existing_tx.reference,
            'access_code', v_existing_tx.metadata->>'access_code',
            'authorization_url', v_existing_tx.metadata->>'authorization_url',
            'amount', v_existing_tx.amount,
            'amount_in_kobo', v_existing_tx.amount_in_kobo
        );
    END IF;

    -- No active attempt exists: order is ready for a fresh Paystack session
    RETURN jsonb_build_object(
        'success', true,
        'is_reused', false,
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

-- 4. CONCURRENCY-SAFE TRANSACTION REGISTRATION RPC
CREATE OR REPLACE FUNCTION public.record_payment_attempt(
    p_order_id UUID,
    p_reference TEXT,
    p_amount NUMERIC,
    p_amount_in_kobo BIGINT,
    p_access_code TEXT,
    p_authorization_url TEXT,
    p_metadata JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_tx RECORD;
BEGIN
    -- Check if an active attempt was already registered by a concurrent worker
    SELECT id, reference, amount, amount_in_kobo, metadata
    INTO v_existing_tx
    FROM public.payment_transactions
    WHERE order_id = p_order_id
      AND status = 'initialized'
      AND created_at >= (timezone('utc'::text, now()) - INTERVAL '15 minutes')
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_reused', true,
            'reference', v_existing_tx.reference,
            'access_code', v_existing_tx.metadata->>'access_code',
            'authorization_url', v_existing_tx.metadata->>'authorization_url',
            'amount', v_existing_tx.amount,
            'amount_in_kobo', v_existing_tx.amount_in_kobo
        );
    END IF;

    -- Insert new initialized attempt.
    -- If a race occurs, the partial unique index idx_single_active_initialized_payment_per_order
    -- prevents duplicates, raising a unique violation that triggers safe fallback.
    BEGIN
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
            p_reference,
            p_amount,
            p_amount_in_kobo,
            'NGN',
            'initialized',
            jsonb_build_object(
                'access_code', p_access_code,
                'authorization_url', p_authorization_url
            ) || COALESCE(p_metadata, '{}'::jsonb)
        );

        RETURN jsonb_build_object(
            'success', true,
            'is_reused', false,
            'reference', p_reference,
            'access_code', p_access_code,
            'authorization_url', p_authorization_url,
            'amount', p_amount,
            'amount_in_kobo', p_amount_in_kobo
        );
    EXCEPTION
        WHEN unique_violation THEN
            -- Fetch winning transaction
            SELECT id, reference, amount, amount_in_kobo, metadata
            INTO v_existing_tx
            FROM public.payment_transactions
            WHERE order_id = p_order_id
              AND status = 'initialized'
            ORDER BY created_at DESC
            LIMIT 1;

            RETURN jsonb_build_object(
                'success', true,
                'is_reused', true,
                'reference', v_existing_tx.reference,
                'access_code', v_existing_tx.metadata->>'access_code',
                'authorization_url', v_existing_tx.metadata->>'authorization_url',
                'amount', v_existing_tx.amount,
                'amount_in_kobo', v_existing_tx.amount_in_kobo
            );
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.begin_or_reuse_payment_attempt TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_attempt TO service_role;

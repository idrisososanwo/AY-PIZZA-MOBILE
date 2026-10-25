-- =============================================================================
-- AY PIZZA — Phase 3.1.3: Payment Initialization Reservation & Concurrency Safety
-- =============================================================================
-- Migration: 20261022000003_phase3_1_3_payment_reservation.sql
--
-- Concurrency & Provider Race Invariants:
-- 1. Introduces a two-phase reservation pattern before calling external Paystack API.
-- 2. Partial unique index on payment_transactions(order_id) WHERE status IN ('initiating', 'initialized')
--    guarantees at the database engine level that no order can ever have multiple active
--    reservations or initialized attempts.
-- 3. begin_or_reuse_payment_attempt() acquires row-level lock (FOR UPDATE), checks status,
--    verifies guest receipt token, cleans up stale attempts, checks for existing active
--    session (<15m) or active reservation (<45s), and creates an 'initiating' reservation
--    BEFORE the Edge Function invokes Paystack.
-- 4. commit_payment_attempt() transitions 'initiating' -> 'initialized' upon Paystack success.
-- 5. fail_payment_reservation() marks failed reservations so immediate retries succeed.
-- =============================================================================

-- 1. ADD 'initiating' ENUM VALUE TO payment_status
DO $$ BEGIN
    ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'initiating';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. DROP OLD PARTIAL UNIQUE INDEX AND CREATE COMPREHENSIVE ACTIVE ATTEMPT INDEX
DROP INDEX IF EXISTS public.idx_single_active_initialized_payment_per_order;
DROP INDEX IF EXISTS public.idx_single_active_payment_attempt_per_order;

CREATE UNIQUE INDEX idx_single_active_payment_attempt_per_order
ON public.payment_transactions(order_id)
WHERE status IN ('initiating', 'initialized');

-- 3. CONCURRENCY-SAFE RESERVATION & REUSE RPC
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

    -- 3. Receipt token authorization check:
    -- Guest orders (customer_id IS NULL) strictly require matching receipt token (unless staff/admin)
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

    -- B. Stale initiating reservations older than 45 seconds -> expired
    UPDATE public.payment_transactions
    SET status = 'expired',
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{expire_reason}', '"reservation_timeout"'),
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

    -- 6. Check if an active 'initiating' reservation is in progress (< 45 seconds)
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

    -- 7. No active attempt exists: Atomically CREATE THE RESERVATION ROW while holding lock
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

-- 4. COMMIT PAYMENT ATTEMPT UPON SUCCESSFUL PROVIDER INITIALIZATION
CREATE OR REPLACE FUNCTION public.commit_payment_attempt(
    p_transaction_id UUID,
    p_reservation_token UUID,
    p_access_code TEXT,
    p_authorization_url TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx RECORD;
BEGIN
    IF p_transaction_id IS NULL OR p_reservation_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction ID and reservation token are required.');
    END IF;

    SELECT * INTO v_tx
    FROM public.payment_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment reservation not found.');
    END IF;

    IF v_tx.status != 'initiating' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation is not active. Current status: ' || v_tx.status);
    END IF;

    IF (v_tx.metadata->>'reservation_token')::UUID != p_reservation_token THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid reservation token.');
    END IF;

    UPDATE public.payment_transactions
    SET status = 'initialized',
        metadata = jsonb_build_object(
            'access_code', p_access_code,
            'authorization_url', p_authorization_url
        ) || COALESCE(v_tx.metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx.id,
        'reference', v_tx.reference,
        'access_code', p_access_code,
        'authorization_url', p_authorization_url,
        'amount', v_tx.amount,
        'amount_in_kobo', v_tx.amount_in_kobo
    );
END;
$$;

-- 5. FAIL PAYMENT RESERVATION UPON PROVIDER ERROR OR TIMEOUT
CREATE OR REPLACE FUNCTION public.fail_payment_reservation(
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
    SET status = 'failed',
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{error}',
            to_jsonb(COALESCE(p_error_message, 'Paystack initialization failed'))
        ),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_transaction_id
      AND status = 'initiating'
      AND (metadata->>'reservation_token')::UUID = p_reservation_token;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. BACKWARD-COMPATIBLE RECORD PAYMENT ATTEMPT RPC
CREATE OR REPLACE FUNCTION public.record_payment_attempt(
    p_order_id UUID,
    p_reference TEXT,
    p_amount NUMERIC,
    p_amount_in_kobo BIGINT,
    p_access_code TEXT,
    p_authorization_url TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_tx RECORD;
BEGIN
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

-- 7. SECURITY PERMISSIONS AND GRANTS
GRANT EXECUTE ON FUNCTION public.begin_or_reuse_payment_attempt TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.commit_payment_attempt TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_payment_reservation TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_attempt TO service_role;

-- =============================================================================
-- AY PIZZA — PHASE 6.0.6.8: FINAL PAYMENT SETTLEMENT HARDENING & RELEASE READINESS
-- Migration: 20261109000001_phase6_0_6_5_settlement_concurrency_hardening.sql
--
-- Security, Integrity & Concurrency Invariants:
-- 1. Reference Normalization & Upfront Format Validation:
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
-- 4. Upfront Same-Order & Cross-Order Transaction Verification:
--    Validates order_id, gateway, amount_in_kobo, currency, and status transitions
--    against any existing payment_transactions record before modifying database state.
--    Rejects cross-order references and mismatched financial amounts/gateways/currencies.
-- 5. Safe ON CONFLICT Behavior Scoped to Order:
--    All INSERT INTO public.payment_transactions ... ON CONFLICT (reference) DO UPDATE
--    statements enforce: WHERE payment_transactions.order_id = p_order_id.
--    Zero rows updated triggers a controlled conflict failure response.
-- 6. Unidirectional State-Transition Safeguards:
--    - An existing successful transaction is NEVER downgraded to refund-warning states.
--    - An existing duplicate-payment or cancelled-order transaction is NEVER promoted to success.
-- 7. Deliberate Metadata Merging:
--    Preserves existing reservation metadata and overlays settlement metadata:
--    COALESCE(payment_transactions.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb)
-- 8. Defensive Conditional Order Update:
--    WHERE id = p_order_id AND status = 'PENDING_PAYMENT' with ROW_COUNT verification.
-- 9. Complete SQL Error Disclosure Elimination:
--    Catches unique_violation and OTHERS without exposing SQLERRM, constraint names,
--    or internal table details to clients. Logs diagnostics securely via RAISE WARNING.
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

    -- 4. Validate payment amount matches authoritative order total in kobo
    v_expected_kobo := ROUND(v_order.total * 100)::BIGINT;
    IF p_amount_in_kobo != v_expected_kobo THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment amount mismatch: Expected ' || v_expected_kobo || ' kobo, received ' || p_amount_in_kobo || ' kobo.'
        );
    END IF;

    -- 5. Global Cross-Order Reference Collision Guards in orders
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

    -- 6. Comprehensive Same-Order & Cross-Order Transaction Verification
    SELECT * INTO v_existing_tx
    FROM public.payment_transactions
    WHERE reference = v_ref;

    IF FOUND THEN
        -- Cross-order conflict check
        IF v_existing_tx.order_id != p_order_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Payment reference is already associated with another order transaction.',
                'reference', v_ref
            );
        END IF;

        -- Same-order consistency validation: amount in kobo
        IF v_existing_tx.amount_in_kobo != p_amount_in_kobo THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Payment transaction amount mismatch with existing transaction record.',
                'reference', v_ref
            );
        END IF;

        -- Same-order consistency validation: gateway
        IF p_gateway IS NOT NULL AND v_existing_tx.gateway != p_gateway THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Payment transaction gateway mismatch with existing transaction record.',
                'reference', v_ref
            );
        END IF;

        -- Same-order consistency validation: currency
        IF v_existing_tx.currency != 'NGN' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Payment transaction currency mismatch with existing transaction record.',
                'reference', v_ref
            );
        END IF;

        -- Same-order state check: refund-warning records cannot be promoted to ordinary payment
        IF v_order.status = 'PENDING_PAYMENT' AND v_existing_tx.status IN ('duplicate_success_needs_refund', 'paid_after_cancellation') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Existing payment transaction is in a refund-reconciliation state and cannot be settled as ordinary payment.',
                'reference', v_ref,
                'transaction_status', v_existing_tx.status
            );
        END IF;
    END IF;

    -- 7. Cancelled order check: Do not revive cancelled orders
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
                WHEN payment_transactions.status IN ('success', 'duplicate_success_needs_refund')
                    THEN payment_transactions.status
                ELSE 'paid_after_cancellation'
            END,
            channel = COALESCE(payment_transactions.channel, EXCLUDED.channel),
            paid_at = COALESCE(payment_transactions.paid_at, EXCLUDED.paid_at),
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

    -- 8. Check for duplicate successful payments on an already settled order
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
            SET status = CASE
                    WHEN payment_transactions.status IN ('duplicate_success_needs_refund', 'paid_after_cancellation')
                        THEN payment_transactions.status
                    ELSE 'success'
                END,
                channel = COALESCE(payment_transactions.channel, EXCLUDED.channel),
                paid_at = COALESCE(payment_transactions.paid_at, EXCLUDED.paid_at),
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
                channel = COALESCE(payment_transactions.channel, EXCLUDED.channel),
                paid_at = COALESCE(payment_transactions.paid_at, EXCLUDED.paid_at),
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

    -- 9. Only PENDING_PAYMENT orders may undergo initial settlement
    IF v_order.status != 'PENDING_PAYMENT' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order status ' || v_order.status || ' is not eligible for payment settlement.',
            'order_id', v_order.id,
            'status', v_order.status
        );
    END IF;

    -- 10. First successful settlement: transition status to CONFIRMED
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

    -- 11. Record payment transaction
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
        channel = COALESCE(payment_transactions.channel, EXCLUDED.channel),
        paid_at = COALESCE(payment_transactions.paid_at, EXCLUDED.paid_at),
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

    -- 12. Audit log entry
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
            'error', 'Payment reference conflict: payment reference is already in use.',
            'reference', v_ref
        );
    WHEN OTHERS THEN
        -- Log diagnostic details securely to server log without exposing internal SQL details to clients
        RAISE WARNING 'Payment settlement internal error for order %: % (%)', p_order_id, SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Internal database settlement error occurred.',
            'reference', v_ref
        );
END;
$$;

-- Revoke from public, anon, authenticated and grant exclusively to service_role
REVOKE EXECUTE ON FUNCTION public.settle_order_payment(UUID, TEXT, TEXT, BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_order_payment(UUID, TEXT, TEXT, BIGINT, TEXT, JSONB) TO service_role;

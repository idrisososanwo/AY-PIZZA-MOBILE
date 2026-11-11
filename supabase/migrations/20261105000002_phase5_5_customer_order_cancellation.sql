-- =============================================================================
-- Migration: 20261105000002_phase5_5_customer_order_cancellation.sql
-- Description: Authoritative Customer Order Cancellation RPC
-- Security: SECURITY DEFINER, search_path = public, pg_temp, strict token/ownership gating
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_order_by_customer(
    p_order_id UUID,
    p_receipt_token TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_caller_id UUID;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_token_hash TEXT;
    v_is_authorized BOOLEAN := FALSE;
    v_cancellation_reason TEXT;
BEGIN
    v_caller_id := auth.uid();

    -- 1. Validate Order ID
    IF p_order_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'INVALID_ORDER_ID', 
            'message', 'Order ID is required.'
        );
    END IF;

    -- 2. Concurrently lock the order row to serialize race conditions
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'ORDER_NOT_FOUND', 
            'message', 'The requested order does not exist.'
        );
    END IF;

    -- 3. Verify Customer Ownership or Valid Cryptographic Receipt Token
    IF p_receipt_token IS NOT NULL AND TRIM(p_receipt_token) != '' THEN
        v_token_hash := encode(digest(TRIM(p_receipt_token), 'sha256'), 'hex');
        IF v_order.receipt_token_hash = v_token_hash THEN
            v_is_authorized := TRUE;
        END IF;
    END IF;

    IF NOT v_is_authorized AND v_caller_id IS NOT NULL THEN
        IF v_order.customer_id = v_caller_id THEN
            v_is_authorized := TRUE;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'UNAUTHORIZED', 
            'message', 'You do not have permission to cancel this order.'
        );
    END IF;

    -- 4. Idempotency Check: If already CANCELLED, return success safely
    IF v_order.status = 'CANCELLED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'code', 'ALREADY_CANCELLED',
            'message', 'Order is already cancelled.',
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'status', v_order.status,
            'refund_status', v_order.refund_status
        );
    END IF;

    -- 5. Eligibility Check: Customer self-service cancellation is strictly permitted ONLY while CONFIRMED
    IF v_order.status != 'CONFIRMED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_ALREADY_ACCEPTED',
            'message', 'This order has already been accepted by the kitchen and cannot be cancelled self-service. Please contact the store directly.',
            'current_status', v_order.status
        );
    END IF;

    -- 6. Execute Cancellation atomically
    v_cancellation_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'Cancelled by customer before kitchen acceptance');

    UPDATE public.orders
    SET status = 'CANCELLED',
        rejection_reason = v_cancellation_reason,
        refund_status = 'REFUND_REQUIRED',
        version = v_order.version + 1,
        updated_at = v_now
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'code', 'CANCELLED_SUCCESSFULLY',
        'message', 'Your order has been cancelled successfully. A manager will review your refund.',
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'status', 'CANCELLED',
        'refund_status', 'REFUND_REQUIRED',
        'cancelled_at', v_now
    );
END;
$$;

-- Security Grants: Revoke from public; grant to authenticated, anon, and service_role
REVOKE ALL ON FUNCTION public.cancel_order_by_customer(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_customer(UUID, TEXT, TEXT) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.cancel_order_by_customer(UUID, TEXT, TEXT) IS 
'Authoritative customer order cancellation. Gated by cryptographic receipt token or authenticated order ownership. Permits cancellation only while order is CONFIRMED; flags refund for manager review.';


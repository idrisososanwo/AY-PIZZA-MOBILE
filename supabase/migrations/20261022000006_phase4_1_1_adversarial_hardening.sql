-- =============================================================================
-- AY PIZZA POSTGRESQL SCHEMA MIGRATION
-- Migration: 20261022000006_phase4_1_1_adversarial_hardening.sql
-- Description: Phase 4.1.1 Adversarial Security, Granular RBAC, and Workflow Hardening:
--   1. Adds 'version' (integer concurrency counter) and 'refund_status' to public.orders.
--   2. Hardens transition_order_status() RPC:
--      - Explicitly blocks unauthenticated / anonymous callers (P0001 / UNAUTHENTICATED).
--      - Enforces strict granular role permissions per target status (kitchen vs counter vs manager vs admin).
--      - Blocks customer and rider roles from operational RPC invocation.
--      - Enforces strict delivery vs pickup workflow paths (delivery MUST pass IN_TRANSIT before DELIVERED; pickup NEVER enters IN_TRANSIT).
--      - Automatically marks cancelled paid orders as refund_status = 'REFUND_REQUIRED'.
--      - Increments order version for deterministic event ordering.
--   3. Hardens get_kds_orders() RPC to reject unauthenticated callers and riders.
--   4. Revokes EXECUTE from PUBLIC and anon on all operational RPCs.
-- =============================================================================

-- 1. ADD VERSION AND REFUND_STATUS TO public.orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE'
        CHECK (refund_status IN ('NOT_APPLICABLE', 'REFUND_REQUIRED', 'REFUND_PENDING', 'REFUNDED'));

CREATE INDEX IF NOT EXISTS idx_orders_refund_status 
    ON public.orders (refund_status) 
    WHERE refund_status != 'NOT_APPLICABLE';

-- 2. HARDENED ATOMIC ORDER STATUS TRANSITION RPC
CREATE OR REPLACE FUNCTION public.transition_order_status(
    p_order_id UUID,
    p_target_status public.order_status,
    p_reason TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_expected_current_status public.order_status DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_caller_id UUID;
    v_caller_role public.user_role;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_is_service_role BOOLEAN;
    v_new_refund_status TEXT;
BEGIN
    v_caller_id := auth.uid();
    v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');

    -- STRICT AUTHENTICATION CHECK: Anonymous/unauthenticated callers are NEVER permitted
    IF v_caller_id IS NULL AND NOT v_is_service_role THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'UNAUTHENTICATED',
            'message', 'Authentication required. Anonymous callers cannot access KDS operations.'
        );
    END IF;

    -- Retrieve caller profile and role
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        -- Strictly block customer and rider from invoking operational RPC
        IF v_caller_role IS NULL OR v_caller_role NOT IN ('staff', 'admin', 'kitchen', 'counter', 'manager') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'FORBIDDEN',
                'message', 'Caller lacks staff permissions for KDS operations.'
            );
        END IF;
    ELSE
        -- Service-role execution
        v_caller_role := 'admin';
    END IF;

    -- Concurrently lock the order row
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

    -- Concurrency check: If client sent expected status, detect race conditions
    IF p_expected_current_status IS NOT NULL AND v_order.status != p_expected_current_status THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CONCURRENT_MODIFICATION',
            'message', 'Order status was already modified by another staff member.',
            'current_status', v_order.status,
            'version', v_order.version
        );
    END IF;

    -- Disallow transitioning unconfirmed/unpaid orders
    IF v_order.status IN ('DRAFT', 'PENDING_PAYMENT') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'UNPAID_ORDER',
            'message', 'Cannot accept or process an unconfirmed or unpaid order.',
            'current_status', v_order.status
        );
    END IF;

    -- Terminal states: DELIVERED, CANCELLED, REFUNDED cannot be transitioned
    IF v_order.status IN ('DELIVERED', 'REFUNDED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'TERMINAL_STATE',
            'message', 'Order has already reached a completed terminal state.',
            'current_status', v_order.status
        );
    END IF;

    IF v_order.status = 'CANCELLED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ALREADY_CANCELLED',
            'message', 'Order is already cancelled.',
            'current_status', v_order.status
        );
    END IF;

    -- 3. GRANULAR ROLE-BASED ACTION AUTHORIZATION
    -- Kitchen staff cannot reject incoming orders, cannot mark in transit, and cannot mark delivered
    IF p_target_status = 'CANCELLED' AND v_caller_role = 'kitchen' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ROLE_UNAUTHORIZED',
            'message', 'Kitchen staff cannot cancel or reject orders. Counter or Manager authorization required.'
        );
    END IF;

    -- Counter staff cannot start oven baking/preparation (kitchen task)
    IF p_target_status = 'PREPARING' AND v_caller_role = 'counter' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ROLE_UNAUTHORIZED',
            'message', 'Counter staff cannot start kitchen preparation. Kitchen staff authorization required.'
        );
    END IF;

    -- Kitchen staff cannot mark handover or in transit
    IF p_target_status IN ('IN_TRANSIT', 'DELIVERED') AND v_caller_role = 'kitchen' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ROLE_UNAUTHORIZED',
            'message', 'Kitchen staff cannot perform dispatch or customer handover operations.'
        );
    END IF;

    -- 4. VALIDATE STATE MACHINE & WORKFLOW DIVERGENCE (DELIVERY VS PICKUP)
    CASE v_order.status
        WHEN 'CONFIRMED' THEN
            -- Allowed: ACCEPTED, or CANCELLED (rejection)
            IF p_target_status NOT IN ('ACCEPTED', 'CANCELLED') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INVALID_TRANSITION',
                    'message', 'Confirmed orders can only transition to ACCEPTED or CANCELLED.',
                    'current_status', v_order.status,
                    'target_status', p_target_status
                );
            END IF;

        WHEN 'ACCEPTED' THEN
            -- Allowed: PREPARING, or CANCELLED
            IF p_target_status NOT IN ('PREPARING', 'CANCELLED') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INVALID_TRANSITION',
                    'message', 'Accepted orders can only transition to PREPARING or CANCELLED.',
                    'current_status', v_order.status,
                    'target_status', p_target_status
                );
            END IF;

        WHEN 'PREPARING' THEN
            -- Allowed: READY_FOR_PICKUP (for both pickup & delivery staging), or CANCELLED
            IF p_target_status NOT IN ('READY_FOR_PICKUP', 'CANCELLED') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INVALID_TRANSITION',
                    'message', 'Preparing orders must transition to READY_FOR_PICKUP once boxed, or CANCELLED.',
                    'current_status', v_order.status,
                    'target_status', p_target_status
                );
            END IF;

        WHEN 'READY_FOR_PICKUP' THEN
            -- Pickup orders: can transition to DELIVERED (handover at counter). CANNOT enter IN_TRANSIT.
            -- Delivery orders: MUST transition to IN_TRANSIT (handed to dispatch rider). CANNOT skip straight to DELIVERED!
            IF v_order.fulfillment_type = 'pickup' THEN
                IF p_target_status NOT IN ('DELIVERED', 'CANCELLED') THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'code', 'INVALID_TRANSITION',
                        'message', 'Counter pickup orders can only transition to DELIVERED upon customer collection, or CANCELLED.',
                        'current_status', v_order.status,
                        'target_status', p_target_status
                    );
                END IF;
            ELSE -- delivery
                IF p_target_status NOT IN ('IN_TRANSIT', 'CANCELLED') THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'code', 'INVALID_TRANSITION',
                        'message', 'Delivery orders must transition to IN_TRANSIT when handed to rider before reaching DELIVERED.',
                        'current_status', v_order.status,
                        'target_status', p_target_status
                    );
                END IF;
            END IF;

        WHEN 'IN_TRANSIT' THEN
            -- Only delivery orders ever reach IN_TRANSIT
            IF p_target_status NOT IN ('DELIVERED', 'CANCELLED') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INVALID_TRANSITION',
                    'message', 'In-transit delivery orders can only transition to DELIVERED, or CANCELLED.',
                    'current_status', v_order.status,
                    'target_status', p_target_status
                );
            END IF;

        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'code', 'INVALID_SOURCE_STATE',
                'message', 'Current order state does not allow staff transition.',
                'current_status', v_order.status
            );
    END CASE;

    -- If rejecting/cancelling, require a non-empty reason
    IF p_target_status = 'CANCELLED' AND (p_reason IS NULL OR trim(p_reason) = '') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'REJECTION_REASON_REQUIRED',
            'message', 'A specific rejection or cancellation reason must be recorded.'
        );
    END IF;

    -- 5. REFUND INTEGRITY ON CANCELLATION
    -- If a paid order (CONFIRMED, ACCEPTED, PREPARING, READY_FOR_PICKUP, IN_TRANSIT) is cancelled,
    -- it requires management financial review for a Paystack refund. Payment is NOT automatically reversed.
    v_new_refund_status := v_order.refund_status;
    IF p_target_status = 'CANCELLED' AND v_order.status IN ('CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT') THEN
        v_new_refund_status := 'REFUND_REQUIRED';
    END IF;

    -- Apply status update with contextual timestamps and increment version
    UPDATE public.orders
    SET status = p_target_status,
        version = v_order.version + 1,
        refund_status = v_new_refund_status,
        rejection_reason = CASE WHEN p_target_status = 'CANCELLED' THEN p_reason ELSE rejection_reason END,
        accepted_at = CASE WHEN p_target_status = 'ACCEPTED' AND accepted_at IS NULL THEN v_now ELSE accepted_at END,
        prepared_at = CASE WHEN p_target_status = 'PREPARING' AND prepared_at IS NULL THEN v_now ELSE prepared_at END,
        ready_at = CASE WHEN p_target_status = 'READY_FOR_PICKUP' AND ready_at IS NULL THEN v_now ELSE ready_at END,
        completed_at = CASE WHEN p_target_status = 'DELIVERED' AND completed_at IS NULL THEN v_now ELSE completed_at END,
        staff_notes = COALESCE(p_notes, staff_notes),
        assigned_staff_id = COALESCE(v_caller_id, assigned_staff_id),
        updated_at = v_now
    WHERE id = p_order_id;

    -- Record immutable audit log
    INSERT INTO public.audit_logs (
        action,
        performed_by,
        target_type,
        target_id,
        details
    ) VALUES (
        CASE 
            WHEN p_target_status = 'CANCELLED' AND v_new_refund_status = 'REFUND_REQUIRED' 
                THEN 'KDS_ORDER_CANCELLED_REFUND_REQUIRED'
            ELSE 'KDS_ORDER_STATUS_TRANSITION'
        END,
        COALESCE(v_caller_id::text, 'kds_system'),
        'orders',
        p_order_id::text,
        jsonb_build_object(
            'order_number', v_order.order_number,
            'previous_status', v_order.status,
            'new_status', p_target_status,
            'fulfillment_type', v_order.fulfillment_type,
            'reason', p_reason,
            'notes', p_notes,
            'staff_role', v_caller_role,
            'refund_status', v_new_refund_status,
            'version', v_order.version + 1,
            'transition_time', v_now
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'previous_status', v_order.status,
        'new_status', p_target_status,
        'refund_status', v_new_refund_status,
        'version', v_order.version + 1,
        'updated_at', v_now
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. HARDENED KDS ORDERS FETCH RPC
CREATE OR REPLACE FUNCTION public.get_kds_orders(
    p_statuses public.order_status[] DEFAULT ARRAY['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT']::public.order_status[]
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role public.user_role;
    v_is_service_role BOOLEAN;
    v_result JSONB;
BEGIN
    v_caller_id := auth.uid();
    v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');

    IF v_caller_id IS NULL AND NOT v_is_service_role THEN
        RAISE EXCEPTION 'Authentication required. Anonymous callers cannot access KDS.' USING ERRCODE = '42501';
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role IS NULL OR v_caller_role NOT IN ('staff', 'admin', 'kitchen', 'counter', 'manager') THEN
            RAISE EXCEPTION 'Access denied. Caller is not authorized for KDS.' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'orderNumber', o.order_number,
            'status', o.status,
            'version', o.version,
            'refundStatus', o.refund_status,
            'fulfillmentType', o.fulfillment_type,
            'landmarkName', o.landmark_name,
            'deliveryAddress', o.delivery_address,
            'deliveryNotes', o.delivery_notes,
            'subtotal', o.subtotal,
            'deliveryFee', o.delivery_fee,
            'total', o.total,
            'guestName', o.guest_name,
            'guestPhone', o.guest_phone,
            'rejectionReason', o.rejection_reason,
            'staffNotes', o.staff_notes,
            'createdAt', o.created_at,
            'updatedAt', o.updated_at,
            'acceptedAt', o.accepted_at,
            'preparedAt', o.prepared_at,
            'readyAt', o.ready_at,
            'completedAt', o.completed_at,
            'items', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', oi.id,
                        'productName', oi.product_name,
                        'sizeName', oi.size_name,
                        'quantity', oi.quantity,
                        'unitBasePrice', oi.unit_base_price,
                        'itemTotal', oi.item_total,
                        'halfSecondaryFlavor', oi.half_secondary_flavor,
                        'flavors', oi.flavors,
                        'specialInstructions', oi.special_instructions,
                        'customizations', (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'id', oic.id,
                                    'optionName', oic.option_name,
                                    'price', oic.price
                                )
                            )
                            FROM public.order_item_customizations oic
                            WHERE oic.order_item_id = oi.id
                        )
                    )
                )
                FROM public.order_items oi
                WHERE oi.order_id = o.id
            )
        )
        ORDER BY o.created_at ASC
    ) INTO v_result
    FROM public.orders o
    WHERE o.status = ANY(p_statuses);

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. REVOKE PUBLIC / ANON PERMISSIONS EXPLICITLY
REVOKE ALL ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_kds_orders(public.order_status[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kds_orders(public.order_status[]) TO authenticated, service_role;

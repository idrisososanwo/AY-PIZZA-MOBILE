-- =============================================================================
-- AY PIZZA & ICE CREAM — PHASE 5.4.3 / STEP 2 MIGRATION
-- Order Transit Tracking & Lifecycle Timestamp Hardening
--
-- Objective:
-- 1. Add `in_transit_at` timestamp column to public.orders for delivery tracking.
-- 2. Backfill historical in_transit_at timestamps from immutable order_status_events.
-- 3. Update transition_order_status RPC to populate in_transit_at atomically upon dispatch.
-- 4. Update get_order_by_receipt RPC to return in_transit_at to customers.
-- 5. Update get_kds_orders RPC to return inTransitAt to kitchen staff.
-- =============================================================================

-- 1. ADD in_transit_at COLUMN TO public.orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS in_transit_at TIMESTAMPTZ;

-- Performance index for courier queries
CREATE INDEX IF NOT EXISTS idx_orders_in_transit_at 
    ON public.orders (in_transit_at) 
    WHERE in_transit_at IS NOT NULL;

-- 2. BACKFILL HISTORICAL in_transit_at TIMESTAMPTZ FROM AUDIT EVENTS
UPDATE public.orders o
SET in_transit_at = sub.transit_time
FROM (
    SELECT order_id, MIN(created_at) AS transit_time
    FROM public.order_status_events
    WHERE new_status = 'IN_TRANSIT'
    GROUP BY order_id
) sub
WHERE o.id = sub.order_id AND o.in_transit_at IS NULL;

-- 3. HARDEN transition_order_status RPC WITH in_transit_at POPULATION
CREATE OR REPLACE FUNCTION public.transition_order_status(
    p_order_id UUID,
    p_target_status public.order_status,
    p_reason TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_expected_current_status public.order_status DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_caller_id UUID;
    v_caller_role public.user_role;
    v_now TIMESTAMPTZ := clock_timestamp();
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

    -- GRANULAR ROLE-BASED ACTION AUTHORIZATION
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

    -- VALIDATE STATE MACHINE & WORKFLOW DIVERGENCE (DELIVERY VS PICKUP)
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

    -- REFUND INTEGRITY ON CANCELLATION
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
        in_transit_at = CASE WHEN p_target_status = 'IN_TRANSIT' AND in_transit_at IS NULL THEN v_now ELSE in_transit_at END,
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
$$;

-- Permissions on transition_order_status
REVOKE ALL ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) TO authenticated, service_role;


-- 4. UPDATE get_order_by_receipt RPC TO RETURN in_transit_at
CREATE OR REPLACE FUNCTION public.get_order_by_receipt(
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
    v_items JSONB;
    v_events JSONB;
    v_token_hash TEXT;
BEGIN
    IF p_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order ID is required.');
    END IF;

    -- Compute SHA-256 hash of provided receipt token
    IF p_receipt_token IS NOT NULL AND TRIM(p_receipt_token) != '' THEN
        v_token_hash := encode(digest(TRIM(p_receipt_token), 'sha256'), 'hex');
    ELSE
        v_token_hash := NULL;
    END IF;

    -- Match by ID and cryptographic receipt token hash, OR authenticated owner, OR staff
    SELECT o.*,
           CASE WHEN v_token_hash IS NOT NULL AND o.receipt_token_hash = v_token_hash THEN TRUE
                WHEN auth.uid() IS NOT NULL AND o.customer_id = auth.uid() THEN TRUE
                WHEN public.is_staff_or_admin() THEN TRUE
                ELSE FALSE
           END AS is_authorized
    INTO v_order
    FROM public.orders o
    WHERE o.id = p_order_id;

    IF NOT FOUND OR NOT v_order.is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found or unauthorized access.');
    END IF;

    -- Aggregate items with their customizations
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'product_name', oi.product_name,
                'size_name', oi.size_name,
                'size_price', oi.size_price,
                'quantity', oi.quantity,
                'unit_base_price', oi.unit_base_price,
                'customizations_total', oi.customizations_total,
                'item_total', oi.item_total,
                'half_secondary_flavor', oi.half_secondary_flavor,
                'special_instructions', oi.special_instructions,
                'customizations', (
                    SELECT COALESCE(
                        jsonb_agg(
                            jsonb_build_object(
                                'option_id', oic.option_id,
                                'option_name', oic.option_name,
                                'price', oic.price
                            )
                        ),
                        '[]'::jsonb
                    )
                    FROM public.order_item_customizations oic
                    WHERE oic.order_item_id = oi.id
                )
            )
        ),
        '[]'::jsonb
    )
    INTO v_items
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id;

    -- Aggregate append-only order status events for the tracking timeline
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', e.id,
                'previous_status', e.previous_status,
                'new_status', e.new_status,
                'version', e.version,
                'title', e.title,
                'description', e.description,
                'created_at', e.created_at
            )
            ORDER BY e.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_events
    FROM public.order_status_events e
    WHERE e.order_id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order', jsonb_build_object(
            'id', v_order.id,
            'order_number', v_order.order_number,
            'customer_id', v_order.customer_id,
            'guest_name', v_order.guest_name,
            'guest_phone', v_order.guest_phone,
            'guest_email', v_order.guest_email,
            'fulfillment_type', v_order.fulfillment_type,
            'landmark_name', v_order.landmark_name,
            'delivery_address', v_order.delivery_address,
            'delivery_notes', v_order.delivery_notes,
            'subtotal', v_order.subtotal,
            'delivery_fee', v_order.delivery_fee,
            'discount_amount', v_order.discount_amount,
            'total', v_order.total,
            'status', v_order.status,
            'version', v_order.version,
            'refund_status', v_order.refund_status,
            'rejection_reason', v_order.rejection_reason,
            'accepted_at', v_order.accepted_at,
            'prepared_at', v_order.prepared_at,
            'ready_at', v_order.ready_at,
            'in_transit_at', v_order.in_transit_at,
            'completed_at', v_order.completed_at,
            'payment_reference', v_order.payment_reference,
            'created_at', v_order.created_at,
            'updated_at', v_order.updated_at,
            'items', v_items,
            'events', v_events
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_by_receipt(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_by_receipt(UUID, TEXT) TO authenticated, anon, service_role;


-- 5. UPDATE get_kds_orders RPC TO INCLUDE inTransitAt
CREATE OR REPLACE FUNCTION public.get_kds_orders(
    p_statuses public.order_status[] DEFAULT ARRAY['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT']::public.order_status[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role public.user_role;
    v_is_service_role BOOLEAN;
    v_result JSONB;
BEGIN
    v_caller_id := auth.uid();
    v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');

    IF v_caller_id IS NULL AND NOT v_is_service_role THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'UNAUTHENTICATED',
            'message', 'Authentication required for KDS access.'
        );
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role IS NULL OR v_caller_role NOT IN ('staff', 'admin', 'kitchen', 'counter', 'manager') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'FORBIDDEN',
                'message', 'Caller lacks staff authorization.'
            );
        END IF;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', o.id,
                'orderNumber', o.order_number,
                'status', o.status,
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
                'inTransitAt', o.in_transit_at,
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
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM public.orders o
    WHERE o.status = ANY(p_statuses);

    RETURN jsonb_build_object(
        'success', true,
        'orders', v_result
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_kds_orders(public.order_status[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kds_orders(public.order_status[]) TO authenticated, service_role;


-- =============================================================================
-- AY PIZZA & ICE CREAM — PHASE 6.0: OPERATIONAL BACKEND SAFEGUARDS
-- Migration: 20261107000001_phase6_0_operational_backend_safeguards.sql
--
-- Objectives:
-- 1. Rider Assignment & Permission Safeguards:
--    - Adds `assigned_rider_id` column to `public.orders`.
--    - Adds `assign_order_rider` RPC (Counter/Manager/Admin only).
--    - Hardens `transition_order_status` to allow riders ONLY to update delivery
--      orders assigned to them, and ONLY through IN_TRANSIT or DELIVERED.
-- 2. Database-Backed Store Operating Hours & Multi-Day Schedule:
--    - Creates `public.store_operating_hours` for day-of-week open/close times.
--    - Extends `public.delivery_config` with temporary closure & enforcement flags.
--    - Adds `check_store_operational_status` RPC (Lagos timezone WAT, overnight support).
--    - Integrates server-side store status check into `create_order_authoritative`.
-- 3. Refund Management Foundation:
--    - Expands `orders.refund_status` constraint to include 'REFUND_FAILED'.
--    - Creates `public.refund_records` table for immutable lifecycle tracking.
--    - Adds `initiate_order_refund` and `record_refund_outcome` RPCs.
-- =============================================================================

-- =============================================================================
-- PART 1: RIDER ASSIGNMENT & PERMISSION SAFEGUARDS
-- =============================================================================

-- 1. Add assigned_rider_id column to public.orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS assigned_rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_assigned_rider_id 
    ON public.orders (assigned_rider_id) 
    WHERE assigned_rider_id IS NOT NULL;

-- 2. Rider Assignment RPC (Counter/Manager/Admin only)
CREATE OR REPLACE FUNCTION public.assign_order_rider(
    p_order_id UUID,
    p_rider_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role public.user_role;
    v_order RECORD;
    v_rider RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_is_service_role BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');

    IF v_caller_id IS NULL AND NOT v_is_service_role THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'UNAUTHENTICATED',
            'message', 'Authentication required to assign delivery rider.'
        );
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role IS NULL OR v_caller_role NOT IN ('staff', 'admin', 'counter', 'manager') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'FORBIDDEN',
                'message', 'Only counter staff, managers, or administrators can assign riders.'
            );
        END IF;
    ELSE
        v_caller_role := 'admin';
    END IF;

    -- Verify rider exists and has rider role
    SELECT id, full_name, phone, role INTO v_rider
    FROM public.profiles
    WHERE id = p_rider_id;

    IF v_rider.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'RIDER_NOT_FOUND',
            'message', 'Target rider profile does not exist.'
        );
    END IF;

    IF v_rider.role != 'rider' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_RIDER_ROLE',
            'message', 'Target user is not registered as a delivery rider.'
        );
    END IF;

    -- Concurrently lock order row
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_NOT_FOUND',
            'message', 'Order not found.'
        );
    END IF;

    IF v_order.fulfillment_type != 'delivery' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_FULFILLMENT',
            'message', 'Cannot assign a rider to a counter pickup order.'
        );
    END IF;

    IF v_order.status IN ('DELIVERED', 'CANCELLED', 'REFUNDED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'TERMINAL_STATE',
            'message', 'Cannot assign rider to an order in a terminal state.'
        );
    END IF;

    UPDATE public.orders
    SET assigned_rider_id = p_rider_id,
        staff_notes = CASE WHEN p_notes IS NOT NULL THEN COALESCE(staff_notes || E'\n' || p_notes, p_notes) ELSE staff_notes END,
        updated_at = v_now
    WHERE id = p_order_id;

    -- Immutable audit log
    INSERT INTO public.audit_logs (
        action,
        performed_by,
        target_type,
        target_id,
        details
    ) VALUES (
        'RIDER_ASSIGNED_TO_ORDER',
        COALESCE(v_caller_id::text, 'system'),
        'orders',
        p_order_id::text,
        jsonb_build_object(
            'order_number', v_order.order_number,
            'assigned_rider_id', p_rider_id,
            'assigned_rider_name', v_rider.full_name,
            'assigned_rider_phone', v_rider.phone,
            'assigned_by', v_caller_id,
            'assigned_by_role', v_caller_role,
            'timestamp', v_now
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'assigned_rider_id', p_rider_id,
        'assigned_rider_name', v_rider.full_name,
        'updated_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_order_rider(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_order_rider(UUID, UUID, TEXT) TO authenticated, service_role;

-- 3. Hardened transition_order_status RPC (Supporting Restricted Riders)
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

        -- Strictly block customer and unauthorized roles from invoking operational RPC
        IF v_caller_role IS NULL OR v_caller_role NOT IN ('staff', 'admin', 'kitchen', 'counter', 'manager', 'rider') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'FORBIDDEN',
                'message', 'Caller lacks staff or rider permissions for operations.'
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

    -- 4. GRANULAR ROLE-BASED ACTION AUTHORIZATION

    -- RIDER SPECIFIC RESTRICTIONS:
    IF v_caller_role = 'rider' THEN
        -- Rider cannot process pickup orders
        IF v_order.fulfillment_type != 'delivery' THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'ROLE_UNAUTHORIZED',
                'message', 'Riders cannot process counter pickup orders.'
            );
        END IF;

        -- Rider cannot process unassigned orders
        IF v_order.assigned_rider_id IS NULL OR v_order.assigned_rider_id != v_caller_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'RIDER_NOT_ASSIGNED',
                'message', 'Rider is not assigned to this delivery order.'
            );
        END IF;

        -- Rider can ONLY perform IN_TRANSIT (courier dispatch pickup) or DELIVERED (handover to customer)
        IF p_target_status NOT IN ('IN_TRANSIT', 'DELIVERED') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'ROLE_UNAUTHORIZED',
                'message', 'Riders can only update delivery status for assigned orders (IN_TRANSIT or DELIVERED).'
            );
        END IF;
    END IF;

    -- KITCHEN SPECIFIC RESTRICTIONS:
    -- Kitchen staff cannot reject incoming orders, cannot mark in transit, and cannot mark delivered
    IF p_target_status = 'CANCELLED' AND v_caller_role = 'kitchen' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ROLE_UNAUTHORIZED',
            'message', 'Kitchen staff cannot cancel or reject orders. Counter or Manager authorization required.'
        );
    END IF;

    -- COUNTER SPECIFIC RESTRICTIONS:
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

    -- 5. VALIDATE STATE MACHINE & WORKFLOW DIVERGENCE (DELIVERY VS PICKUP)
    CASE v_order.status
        WHEN 'CONFIRMED' THEN
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

    -- 6. REFUND INTEGRITY ON CANCELLATION
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
        assigned_staff_id = CASE WHEN v_caller_role != 'rider' THEN COALESCE(v_caller_id, assigned_staff_id) ELSE assigned_staff_id END,
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
            WHEN v_caller_role = 'rider'
                THEN 'RIDER_ORDER_STATUS_TRANSITION'
            ELSE 'KDS_ORDER_STATUS_TRANSITION'
        END,
        COALESCE(v_caller_id::text, 'system'),
        'orders',
        p_order_id::text,
        jsonb_build_object(
            'order_number', v_order.order_number,
            'previous_status', v_order.status,
            'new_status', p_target_status,
            'fulfillment_type', v_order.fulfillment_type,
            'reason', p_reason,
            'notes', p_notes,
            'caller_role', v_caller_role,
            'assigned_rider_id', v_order.assigned_rider_id,
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

REVOKE ALL ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) TO authenticated, service_role;


-- =============================================================================
-- PART 2: DATABASE-BACKED STORE OPERATING HOURS & SAFEGUARDS
-- =============================================================================

-- 1. Create table for Day-of-Week Store Operating Hours
CREATE TABLE IF NOT EXISTS public.store_operating_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 1=Monday, ..., 6=Saturday
    day_name TEXT NOT NULL,
    open_time TIME NOT NULL DEFAULT '10:00:00',
    close_time TIME NOT NULL DEFAULT '21:00:00',
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    is_overnight BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_store_operating_hours_day UNIQUE (day_of_week)
);

-- Seed 7 days with provisional operating schedule (10:00 to 21:00)
INSERT INTO public.store_operating_hours (day_of_week, day_name, open_time, close_time, is_closed, is_overnight)
VALUES
    (0, 'Sunday', '10:00:00', '21:00:00', FALSE, FALSE),
    (1, 'Monday', '10:00:00', '21:00:00', FALSE, FALSE),
    (2, 'Tuesday', '10:00:00', '21:00:00', FALSE, FALSE),
    (3, 'Wednesday', '10:00:00', '21:00:00', FALSE, FALSE),
    (4, 'Thursday', '10:00:00', '21:00:00', FALSE, FALSE),
    (5, 'Friday', '10:00:00', '21:00:00', FALSE, FALSE),
    (6, 'Saturday', '10:00:00', '21:00:00', FALSE, FALSE)
ON CONFLICT (day_of_week) DO NOTHING;

ALTER TABLE public.store_operating_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read store operating hours" ON public.store_operating_hours;
CREATE POLICY "Public read store operating hours" ON public.store_operating_hours FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Staff or Admin update store operating hours" ON public.store_operating_hours;
CREATE POLICY "Staff or Admin update store operating hours" ON public.store_operating_hours 
    FOR UPDATE USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

-- 2. Extend delivery_config with operational safeguard columns
ALTER TABLE public.delivery_config
    ADD COLUMN IF NOT EXISTS is_temporarily_closed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS temporary_closure_reason TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS temporary_closure_reopen_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS enforce_operating_hours BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS operating_hours_confirmed_by_owner BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS store_timezone TEXT NOT NULL DEFAULT 'Africa/Lagos';

-- 3. Comprehensive Store Operational Status Function
CREATE OR REPLACE FUNCTION public.check_store_operational_status(
    p_fulfillment_type TEXT DEFAULT 'delivery'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cfg RECORD;
    v_hours RECORD;
    v_now_utc TIMESTAMPTZ := clock_timestamp();
    v_tz TEXT := 'Africa/Lagos';
    v_lagos_time TIMESTAMP;
    v_day_of_week INT;
    v_current_time TIME;
    v_is_within_hours BOOLEAN := FALSE;
    v_clean_fulfillment TEXT;
BEGIN
    v_clean_fulfillment := LOWER(TRIM(p_fulfillment_type));
    IF v_clean_fulfillment NOT IN ('delivery', 'pickup') THEN
        RETURN jsonb_build_object(
            'can_order', false,
            'is_open', false,
            'code', 'INVALID_FULFILLMENT_TYPE',
            'message', 'Invalid fulfillment type. Must be "delivery" or "pickup".'
        );
    END IF;

    -- Fetch delivery_config
    SELECT * INTO v_cfg
    FROM public.delivery_config
    LIMIT 1;

    IF v_cfg.id IS NULL THEN
        -- Defensive fallback if table uninitialized
        RETURN jsonb_build_object(
            'can_order', true,
            'is_open', true,
            'is_enforced', false,
            'code', 'DEFAULT_PASS',
            'message', 'Operational configuration uninitialized.'
        );
    END IF;

    IF v_cfg.store_timezone IS NOT NULL AND TRIM(v_cfg.store_timezone) != '' THEN
        v_tz := TRIM(v_cfg.store_timezone);
    END IF;

    -- Compute Lagos local time (WAT / UTC+1)
    v_lagos_time := v_now_utc AT TIME ZONE v_tz;
    v_day_of_week := EXTRACT(DOW FROM v_lagos_time)::INT;
    v_current_time := v_lagos_time::TIME;

    -- 1. Check independent fulfillment active switches
    IF v_clean_fulfillment = 'delivery' AND NOT v_cfg.is_delivery_active THEN
        RETURN jsonb_build_object(
            'can_order', false,
            'is_open', false,
            'code', 'DELIVERY_SUSPENDED',
            'message', 'Delivery orders are temporarily suspended by AY Pizza management. Counter pickup is available.',
            'is_delivery_active', false,
            'is_pickup_active', v_cfg.is_pickup_active,
            'current_time_lagos', v_lagos_time::TEXT
        );
    END IF;

    IF v_clean_fulfillment = 'pickup' AND NOT v_cfg.is_pickup_active THEN
        RETURN jsonb_build_object(
            'can_order', false,
            'is_open', false,
            'code', 'PICKUP_SUSPENDED',
            'message', 'Counter pickup is temporarily suspended by AY Pizza management.',
            'is_delivery_active', v_cfg.is_delivery_active,
            'is_pickup_active', false,
            'current_time_lagos', v_lagos_time::TEXT
        );
    END IF;

    -- 2. Check temporary store closure
    IF v_cfg.is_temporarily_closed THEN
        IF v_cfg.temporary_closure_reopen_at IS NULL OR v_now_utc < v_cfg.temporary_closure_reopen_at THEN
            RETURN jsonb_build_object(
                'can_order', false,
                'is_open', false,
                'code', 'STORE_TEMPORARILY_CLOSED',
                'message', COALESCE(v_cfg.temporary_closure_reason, 'AY Pizza is temporarily closed for maintenance.'),
                'reopen_at', v_cfg.temporary_closure_reopen_at,
                'current_time_lagos', v_lagos_time::TEXT
            );
        END IF;
    END IF;

    -- 3. Lookup day-of-week operating hours
    SELECT * INTO v_hours
    FROM public.store_operating_hours
    WHERE day_of_week = v_day_of_week;

    IF v_hours.id IS NOT NULL THEN
        IF v_hours.is_closed THEN
            v_is_within_hours := FALSE;
        ELSIF v_hours.is_overnight THEN
            -- Overnight schedule: e.g. open 18:00, close 02:00
            v_is_within_hours := (v_current_time >= v_hours.open_time OR v_current_time < v_hours.close_time);
        ELSE
            -- Standard daytime schedule: open_time <= current_time < close_time
            v_is_within_hours := (v_current_time >= v_hours.open_time AND v_current_time < v_hours.close_time);
        END IF;
    ELSE
        -- Fallback default (10:00 to 21:00)
        v_is_within_hours := (v_current_time >= '10:00:00'::TIME AND v_current_time < '21:00:00'::TIME);
    END IF;

    -- 4. Check whether enforcement is enabled
    IF NOT v_is_within_hours THEN
        IF v_cfg.enforce_operating_hours THEN
            RETURN jsonb_build_object(
                'can_order', false,
                'is_open', false,
                'is_enforced', true,
                'code', 'STORE_CLOSED_OFF_HOURS',
                'message', 'AY Pizza is currently closed. Today''s hours: ' || 
                    TO_CHAR(COALESCE(v_hours.open_time, '10:00:00'::TIME), 'HH12:MI AM') || ' - ' || 
                    TO_CHAR(COALESCE(v_hours.close_time, '21:00:00'::TIME), 'HH12:MI AM') || ' (Lagos Time).',
                'day_of_week', v_day_of_week,
                'open_time', v_hours.open_time,
                'close_time', v_hours.close_time,
                'current_time_lagos', v_lagos_time::TEXT
            );
        ELSE
            -- Enforcement disabled pending business owner confirmation
            RETURN jsonb_build_object(
                'can_order', true,
                'is_open', false,
                'is_enforced', false,
                'code', 'OFF_HOURS_UNENFORCED',
                'message', 'Current time is outside provisional store hours, but enforcement is disabled pending owner sign-off.',
                'day_of_week', v_day_of_week,
                'open_time', v_hours.open_time,
                'close_time', v_hours.close_time,
                'current_time_lagos', v_lagos_time::TEXT
            );
        END IF;
    END IF;

    -- Store is open and operational
    RETURN jsonb_build_object(
        'can_order', true,
        'is_open', true,
        'is_enforced', v_cfg.enforce_operating_hours,
        'code', 'OK',
        'message', 'AY Pizza is open and accepting orders.',
        'day_of_week', v_day_of_week,
        'current_time_lagos', v_lagos_time::TEXT
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_store_operational_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_store_operational_status(TEXT) TO authenticated, anon, service_role;

-- 4. Hardened create_order_authoritative with Server-Side Operating Hours & Safeguards
CREATE OR REPLACE FUNCTION public.create_order_authoritative(
    p_fulfillment_type TEXT,
    p_landmark_id UUID,
    p_delivery_address TEXT,
    p_delivery_notes TEXT,
    p_guest_email TEXT,
    p_guest_phone TEXT,
    p_guest_name TEXT,
    p_idempotency_key TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_id UUID;
    v_order_id UUID;
    v_order_number TEXT;
    v_receipt_token TEXT;
    v_receipt_token_hash TEXT;
    v_delivery_fee NUMERIC(10, 2) := 0;
    v_landmark_name TEXT := NULL;
    v_subtotal NUMERIC(10, 2) := 0;
    v_total NUMERIC(10, 2) := 0;
    v_item JSONB;
    v_item_id UUID;
    v_item_qty INT;
    v_item_unit_total NUMERIC(10, 2);
    v_item_customizations_total NUMERIC(10, 2);
    v_line_total NUMERIC(10, 2);
    v_prod RECORD;
    v_size RECORD;
    v_size_price NUMERIC(10, 2) := 0;
    v_size_name TEXT := NULL;
    v_opt RECORD;
    v_customization JSONB;
    v_sec_pizza RECORD;
    v_existing_order RECORD;
    v_store_check JSONB;
BEGIN
    -- 1. Enforce trusted customer identity
    v_customer_id := auth.uid();

    -- 2. Require idempotency key
    IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'Idempotency key is required.';
    END IF;

    -- Check if order with this idempotency key already exists (Idempotent replay)
    SELECT id, order_number, subtotal, delivery_fee, total, status
    INTO v_existing_order
    FROM public.orders
    WHERE idempotency_key = TRIM(p_idempotency_key);

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_retry', true,
            'order_id', v_existing_order.id,
            'order_number', v_existing_order.order_number,
            'receipt_token', NULL,
            'subtotal', v_existing_order.subtotal,
            'delivery_fee', v_existing_order.delivery_fee,
            'total', v_existing_order.total,
            'total_in_kobo', ROUND(v_existing_order.total * 100)::BIGINT,
            'status', v_existing_order.status
        );
    END IF;

    -- 3. SERVER-SIDE OPERATIONAL STATUS SAFEGUARD
    v_store_check := public.check_store_operational_status(p_fulfillment_type);
    IF NOT (v_store_check->>'can_order')::BOOLEAN THEN
        RAISE EXCEPTION '%: %', (v_store_check->>'code'), (v_store_check->>'message');
    END IF;

    -- 4. Cryptographically random server-side receipt token generation (256-bit entropy)
    v_receipt_token := encode(gen_random_bytes(32), 'hex');
    v_receipt_token_hash := encode(digest(v_receipt_token, 'sha256'), 'hex');

    -- 5. Resolve and validate fulfillment details
    IF p_fulfillment_type = 'delivery' THEN
        IF p_landmark_id IS NULL THEN
            RAISE EXCEPTION 'A delivery landmark is required for delivery orders.';
        END IF;

        IF p_delivery_address IS NULL OR TRIM(p_delivery_address) = '' THEN
            RAISE EXCEPTION 'A specific delivery address or room/office number is required.';
        END IF;

        SELECT name, fee INTO v_landmark_name, v_delivery_fee
        FROM public.delivery_landmarks
        WHERE id = p_landmark_id AND is_active = TRUE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected delivery landmark is invalid or inactive.';
        END IF;
    ELSIF p_fulfillment_type = 'pickup' THEN
        v_delivery_fee := 0.00;
        v_landmark_name := 'Campus Pick-up (King Jaja Hall)';
    ELSE
        RAISE EXCEPTION 'Invalid fulfillment type. Must be "delivery" or "pickup".';
    END IF;

    -- 6. Validate customer contact information
    IF p_guest_phone IS NULL OR TRIM(p_guest_phone) = '' THEN
        RAISE EXCEPTION 'Customer phone number is required.';
    END IF;

    IF p_guest_name IS NULL OR TRIM(p_guest_name) = '' THEN
        RAISE EXCEPTION 'Customer name is required.';
    END IF;

    -- 7. Validate items payload
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cart is empty. At least one item is required.';
    END IF;

    -- 8. Generate order number
    v_order_number := 'AYP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 9. Insert provisional order record
    INSERT INTO public.orders (
        order_number,
        customer_id,
        guest_email,
        guest_phone,
        guest_name,
        fulfillment_type,
        landmark_name,
        delivery_address,
        delivery_notes,
        subtotal,
        delivery_fee,
        total,
        status,
        idempotency_key,
        receipt_token_hash
    ) VALUES (
        v_order_number,
        v_customer_id,
        NULLIF(TRIM(p_guest_email), ''),
        TRIM(p_guest_phone),
        TRIM(p_guest_name),
        p_fulfillment_type::public.fulfillment_type,
        v_landmark_name,
        CASE WHEN p_fulfillment_type = 'delivery' THEN TRIM(p_delivery_address) ELSE NULL END,
        NULLIF(TRIM(p_delivery_notes), ''),
        0.00,
        v_delivery_fee,
        0.00,
        'PENDING_PAYMENT',
        TRIM(p_idempotency_key),
        v_receipt_token_hash
    )
    RETURNING id INTO v_order_id;

    -- 10. Iterate, validate, and compute order items authoritatively
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_qty := COALESCE((v_item->>'quantity')::INT, 1);
        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'Quantity must be greater than zero.';
        END IF;

        -- Resolve product from catalog
        SELECT p.id, p.name, p.base_price, p.is_available, c.slug AS category_slug
        INTO v_prod
        FROM public.products p
        JOIN public.categories c ON c.id = p.category_id
        WHERE p.id = (v_item->>'product_id')::UUID;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % does not exist.', v_item->>'product_id';
        END IF;

        IF NOT v_prod.is_available THEN
            RAISE EXCEPTION 'Product "%" is currently out of stock.', v_prod.name;
        END IF;

        -- Resolve and strictly validate size belonging to product or product category, and is active
        v_size_price := 0;
        v_size_name := NULL;
        IF (v_item->>'size_id') IS NOT NULL AND (v_item->>'size_id') != '' THEN
            SELECT ps.name, ps.size_price INTO v_size
            FROM public.product_sizes ps
            WHERE ps.id = (v_item->>'size_id')::UUID
              AND (
                  ps.product_id = v_prod.id
                  OR (ps.category_slug IS NOT NULL AND ps.category_slug = v_prod.category_slug)
              )
              AND ps.is_available = TRUE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Selected size % is invalid or unavailable for product "%".', v_item->>'size_id', v_prod.name;
            END IF;

            v_size_price := v_size.size_price;
            v_size_name := v_size.name;
        END IF;

        -- Validate Half & Half secondary flavor: only permitted for pizza category
        IF (v_item->>'half_secondary_flavor') IS NOT NULL AND TRIM(v_item->>'half_secondary_flavor') != '' THEN
            IF v_prod.category_slug != 'pizza' THEN
                RAISE EXCEPTION 'Half & Half flavor is only permitted for pizza items, not "%".', v_prod.name;
            END IF;

            SELECT p.id, p.name, p.is_available, c.slug AS category_slug
            INTO v_sec_pizza
            FROM public.products p
            JOIN public.categories c ON c.id = p.category_id
            WHERE p.name = TRIM(v_item->>'half_secondary_flavor')
              AND c.slug = 'pizza';

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Secondary pizza "%" does not exist or is not a pizza.', v_item->>'half_secondary_flavor';
            END IF;

            IF NOT v_sec_pizza.is_available THEN
                RAISE EXCEPTION 'Secondary pizza "%" is currently out of stock.', v_sec_pizza.name;
            END IF;
        END IF;

        v_item_customizations_total := 0;

        -- Insert order item
        INSERT INTO public.order_items (
            order_id,
            product_id,
            product_name,
            size_name,
            size_price,
            quantity,
            unit_base_price,
            customizations_total,
            item_total,
            half_secondary_flavor,
            special_instructions
        ) VALUES (
            v_order_id,
            v_prod.id,
            v_prod.name,
            v_size_name,
            v_size_price,
            v_item_qty,
            v_prod.base_price,
            0,
            0,
            NULLIF(TRIM(v_item->>'half_secondary_flavor'), ''),
            NULLIF(TRIM(v_item->>'special_instructions'), '')
        )
        RETURNING id INTO v_item_id;

        -- Process customizations with deep group and product link verification
        IF v_item ? 'customizations' AND jsonb_array_length(v_item->'customizations') > 0 THEN
            FOR v_customization IN SELECT * FROM jsonb_array_elements(v_item->'customizations')
            LOOP
                SELECT co.id, co.name, co.price, cg.name AS group_name
                INTO v_opt
                FROM public.customization_options co
                JOIN public.customization_groups cg ON cg.id = co.group_id
                LEFT JOIN public.product_customization_groups pcg 
                  ON pcg.group_id = cg.id AND pcg.product_id = v_prod.id
                WHERE co.id = (v_customization->>'option_id')::UUID
                  AND (
                      pcg.product_id IS NOT NULL 
                      OR (cg.category_slug IS NOT NULL AND cg.category_slug = v_prod.category_slug)
                  )
                  AND co.is_available = TRUE;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Customization option % is invalid or unavailable for product "%".', v_customization->>'option_id', v_prod.name;
                END IF;

                -- Dynamic Half & Half price adjustment (₦1,000 Regular/Standard, ₦1,500 Large/Queen/King)
                IF LOWER(v_opt.name) LIKE '%half%' THEN
                    IF v_prod.category_slug != 'pizza' THEN
                        RAISE EXCEPTION 'Half & Half option cannot be added to non-pizza product "%".', v_prod.name;
                    END IF;

                    IF LOWER(COALESCE(v_size_name, '')) IN ('large', 'queen', 'king') THEN
                        v_opt.price := 1500.00;
                    ELSE
                        v_opt.price := 1000.00;
                    END IF;
                END IF;

                v_item_customizations_total := v_item_customizations_total + v_opt.price;

                INSERT INTO public.order_item_customizations (
                    order_item_id,
                    option_id,
                    option_name,
                    price
                ) VALUES (
                    v_item_id,
                    v_opt.id,
                    v_opt.name,
                    v_opt.price
                );
            END LOOP;
        END IF;

        -- Finalize unit total & line total
        v_item_unit_total := v_prod.base_price + v_size_price + v_item_customizations_total;
        v_line_total := v_item_unit_total * v_item_qty;
        v_subtotal := v_subtotal + v_line_total;

        -- Update order item calculations
        UPDATE public.order_items
        SET customizations_total = v_item_customizations_total,
            item_total = v_line_total
        WHERE id = v_item_id;
    END LOOP;

    -- 11. Update order totals
    v_total := v_subtotal + v_delivery_fee;

    UPDATE public.orders
    SET subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total
    WHERE id = v_order_id;

    -- 12. Return authoritative order payload with receipt token
    RETURN jsonb_build_object(
        'success', true,
        'is_retry', false,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'receipt_token', v_receipt_token,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total,
        'total_in_kobo', ROUND(v_total * 100)::BIGINT,
        'status', 'PENDING_PAYMENT'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_authoritative(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_authoritative(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, anon, service_role;


-- =============================================================================
-- PART 3: REFUND MANAGEMENT FOUNDATION
-- =============================================================================

-- 1. Expand orders.refund_status constraint to support REFUND_FAILED
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_refund_status_check;
ALTER TABLE public.orders
    ADD CONSTRAINT orders_refund_status_check
    CHECK (refund_status IN ('NOT_APPLICABLE', 'REFUND_REQUIRED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'));

-- 2. Create public.refund_records table
CREATE TABLE IF NOT EXISTS public.refund_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    payment_reference TEXT NOT NULL,
    amount_in_kobo BIGINT NOT NULL CHECK (amount_in_kobo > 0),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'REFUND_PENDING'
        CHECK (status IN ('REFUND_REQUIRED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED')),
    reason TEXT NOT NULL,
    initiated_by UUID NOT NULL REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    gateway TEXT NOT NULL DEFAULT 'paystack',
    gateway_refund_id TEXT,
    gateway_response JSONB,
    idempotency_key TEXT NOT NULL UNIQUE,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_refund_records_order_id ON public.refund_records(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_records_reference ON public.refund_records(payment_reference);
CREATE INDEX IF NOT EXISTS idx_refund_records_status ON public.refund_records(status);

ALTER TABLE public.refund_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff and Admin view refund records" ON public.refund_records;
CREATE POLICY "Staff and Admin view refund records" ON public.refund_records 
    FOR SELECT USING (public.is_staff_or_admin());

-- 3. Initiate Order Refund RPC (Manager/Admin Only)
CREATE OR REPLACE FUNCTION public.initiate_order_refund(
    p_order_id UUID,
    p_reason TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role public.user_role;
    v_order RECORD;
    v_existing_refund RECORD;
    v_total_kobo BIGINT;
    v_refund_id UUID;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_is_service_role BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');

    IF v_caller_id IS NULL AND NOT v_is_service_role THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'UNAUTHENTICATED',
            'message', 'Authentication required to initiate refund.'
        );
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'manager') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'FORBIDDEN',
                'message', 'Only managers or administrators can initiate payment refunds.'
            );
        END IF;
    ELSE
        v_caller_role := 'admin';
    END IF;

    IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'IDEMPOTENCY_KEY_REQUIRED',
            'message', 'Idempotency key is required to initiate refund.'
        );
    END IF;

    -- Check if refund with this idempotency key already exists
    SELECT * INTO v_existing_refund
    FROM public.refund_records
    WHERE idempotency_key = TRIM(p_idempotency_key);

    IF v_existing_refund.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_retry', true,
            'refund_id', v_existing_refund.id,
            'order_id', v_existing_refund.order_id,
            'payment_reference', v_existing_refund.payment_reference,
            'amount_in_kobo', v_existing_refund.amount_in_kobo,
            'status', v_existing_refund.status
        );
    END IF;

    -- Lock order row
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_NOT_FOUND',
            'message', 'Target order not found.'
        );
    END IF;

    -- Order must be cancelled
    IF v_order.status != 'CANCELLED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_NOT_CANCELLED',
            'message', 'Only cancelled orders are eligible for refunds. Current status: ' || v_order.status::TEXT
        );
    END IF;

    -- Prevent duplicate refund execution
    IF v_order.refund_status = 'REFUNDED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ALREADY_REFUNDED',
            'message', 'Order has already been refunded.'
        );
    END IF;

    IF v_order.refund_status = 'REFUND_PENDING' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'REFUND_ALREADY_PENDING',
            'message', 'A refund is already in pending processing for this order.'
        );
    END IF;

    -- Verify payment reference exists
    IF v_order.payment_reference IS NULL OR TRIM(v_order.payment_reference) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'MISSING_PAYMENT_REFERENCE',
            'message', 'Order does not have a verified Paystack payment reference.'
        );
    END IF;

    v_total_kobo := ROUND(v_order.total * 100)::BIGINT;

    -- Insert refund record
    INSERT INTO public.refund_records (
        order_id,
        payment_reference,
        amount_in_kobo,
        amount,
        currency,
        status,
        reason,
        initiated_by,
        approved_by,
        gateway,
        idempotency_key
    ) VALUES (
        p_order_id,
        v_order.payment_reference,
        v_total_kobo,
        v_order.total,
        'NGN',
        'REFUND_PENDING',
        COALESCE(NULLIF(TRIM(p_reason), ''), 'Customer order cancelled'),
        COALESCE(v_caller_id, v_order.customer_id),
        v_caller_id,
        'paystack',
        TRIM(p_idempotency_key)
    )
    RETURNING id INTO v_refund_id;

    -- Update order status
    UPDATE public.orders
    SET refund_status = 'REFUND_PENDING',
        version = v_order.version + 1,
        updated_at = v_now
    WHERE id = p_order_id;

    -- Immutable audit log
    INSERT INTO public.audit_logs (
        action,
        performed_by,
        target_type,
        target_id,
        details
    ) VALUES (
        'REFUND_INITIATED',
        COALESCE(v_caller_id::text, 'admin_system'),
        'orders',
        p_order_id::text,
        jsonb_build_object(
            'order_number', v_order.order_number,
            'refund_id', v_refund_id,
            'payment_reference', v_order.payment_reference,
            'amount_in_kobo', v_total_kobo,
            'amount', v_order.total,
            'reason', p_reason,
            'caller_role', v_caller_role,
            'timestamp', v_now
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'is_retry', false,
        'refund_id', v_refund_id,
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'payment_reference', v_order.payment_reference,
        'amount_in_kobo', v_total_kobo,
        'amount', v_order.total,
        'status', 'REFUND_PENDING'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.initiate_order_refund(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.initiate_order_refund(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 4. Record Refund Outcome RPC (Admin or Service Role Only)
CREATE OR REPLACE FUNCTION public.record_refund_outcome(
    p_refund_record_id UUID,
    p_success BOOLEAN,
    p_gateway_refund_id TEXT DEFAULT NULL,
    p_gateway_response JSONB DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role public.user_role;
    v_refund RECORD;
    v_target_status TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_is_service_role BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');

    IF v_caller_id IS NULL AND NOT v_is_service_role THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'UNAUTHENTICATED',
            'message', 'Authentication required.'
        );
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'FORBIDDEN',
                'message', 'Only administrators or service role can record refund outcomes.'
            );
        END IF;
    END IF;

    -- Concurrently lock refund record
    SELECT * INTO v_refund
    FROM public.refund_records
    WHERE id = p_refund_record_id
    FOR UPDATE;

    IF v_refund.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'REFUND_NOT_FOUND',
            'message', 'Refund record not found.'
        );
    END IF;

    IF p_success THEN
        v_target_status := 'REFUNDED';
    ELSE
        v_target_status := 'REFUND_FAILED';
    END IF;

    UPDATE public.refund_records
    SET status = v_target_status,
        gateway_refund_id = COALESCE(p_gateway_refund_id, gateway_refund_id),
        gateway_response = COALESCE(p_gateway_response, gateway_response),
        error_message = CASE WHEN NOT p_success THEN p_error_message ELSE NULL END,
        updated_at = v_now
    WHERE id = p_refund_record_id;

    -- Update order status
    UPDATE public.orders
    SET refund_status = v_target_status,
        status = CASE WHEN p_success THEN 'REFUNDED'::public.order_status ELSE status END,
        updated_at = v_now
    WHERE id = v_refund.order_id;

    -- Immutable audit log
    INSERT INTO public.audit_logs (
        action,
        performed_by,
        target_type,
        target_id,
        details
    ) VALUES (
        CASE WHEN p_success THEN 'REFUND_COMPLETED_SUCCESS' ELSE 'REFUND_RECORD_FAILED' END,
        COALESCE(v_caller_id::text, 'service_role'),
        'orders',
        v_refund.order_id::text,
        jsonb_build_object(
            'refund_record_id', p_refund_record_id,
            'success', p_success,
            'gateway_refund_id', p_gateway_refund_id,
            'error_message', p_error_message,
            'timestamp', v_now
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'refund_record_id', p_refund_record_id,
        'order_id', v_refund.order_id,
        'status', v_target_status,
        'updated_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_refund_outcome(UUID, BOOLEAN, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_refund_outcome(UUID, BOOLEAN, TEXT, JSONB, TEXT) TO authenticated, service_role;


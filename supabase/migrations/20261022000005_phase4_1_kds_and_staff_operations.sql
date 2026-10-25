-- =============================================================================
-- AY PIZZA PRODUCTION POSTGRESQL SCHEMA MIGRATION
-- Migration: 20261022000005_phase4_1_kds_and_staff_operations.sql
-- Description: Kitchen Display System (KDS) & Staff Order Operations.
--   1. Adds 'ACCEPTED' to order_status enum.
--   2. Adds 'kitchen', 'counter', 'manager' to user_role enum.
--   3. Adds staff operational columns to public.orders (rejection_reason, timestamps, notes, assigned_staff).
--   4. Updates is_staff_or_admin() and introduces role-specific helpers.
--   5. Creates atomic server-side transition_order_status() RPC with concurrency protection.
--   6. Enforces audit logging for all staff order state transitions.
--   7. Configures Supabase Realtime publication for public.orders.
-- =============================================================================

-- 1. EXTEND ENUMS SAFELY
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'ACCEPTED' 
        AND enumtypid = 'public.order_status'::regtype
    ) THEN
        ALTER TYPE public.order_status ADD VALUE 'ACCEPTED' AFTER 'CONFIRMED';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'kitchen' 
        AND enumtypid = 'public.user_role'::regtype
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'kitchen';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'counter' 
        AND enumtypid = 'public.user_role'::regtype
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'counter';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'manager' 
        AND enumtypid = 'public.user_role'::regtype
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'manager';
    END IF;
END $$;

-- 2. OPERATIONAL COLUMNS ON public.orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS staff_notes TEXT,
    ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_kds_status 
    ON public.orders (status, created_at DESC) 
    WHERE status IN ('CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP');

-- 3. UPDATED ROLE HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() 
        AND role IN ('staff', 'admin', 'kitchen', 'counter', 'manager')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_kitchen_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() 
        AND role IN ('kitchen', 'staff', 'manager', 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_counter_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() 
        AND role IN ('counter', 'staff', 'manager', 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() 
        AND role IN ('manager', 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ATOMIC ORDER STATUS TRANSITION RPC
-- Provides serialized concurrency control (FOR UPDATE), state machine validation,
-- role enforcement, and immutable audit logging.
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
BEGIN
    v_caller_id := auth.uid();

    -- Authorize staff caller (or service role)
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role IS NULL OR v_caller_role NOT IN ('staff', 'admin', 'kitchen', 'counter', 'manager') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'FORBIDDEN',
                'message', 'Caller lacks staff permissions for KDS operations.'
            );
        END IF;
    ELSE
        -- Service-role or internal call
        v_caller_role := 'staff';
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
            'current_status', v_order.status
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

    -- Terminal states
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

    -- Validate allowed state machine transitions
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
            -- Allowed: READY_FOR_PICKUP, IN_TRANSIT (if delivery), or CANCELLED
            IF p_target_status NOT IN ('READY_FOR_PICKUP', 'IN_TRANSIT', 'CANCELLED') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INVALID_TRANSITION',
                    'message', 'Preparing orders can only transition to READY_FOR_PICKUP, IN_TRANSIT, or CANCELLED.',
                    'current_status', v_order.status,
                    'target_status', p_target_status
                );
            END IF;

        WHEN 'READY_FOR_PICKUP' THEN
            -- Allowed: DELIVERED (handover completed), IN_TRANSIT (handed to rider)
            IF p_target_status NOT IN ('DELIVERED', 'IN_TRANSIT', 'CANCELLED') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INVALID_TRANSITION',
                    'message', 'Ready orders can only transition to DELIVERED, IN_TRANSIT, or CANCELLED.',
                    'current_status', v_order.status,
                    'target_status', p_target_status
                );
            END IF;

        WHEN 'IN_TRANSIT' THEN
            -- Allowed: DELIVERED
            IF p_target_status NOT IN ('DELIVERED', 'CANCELLED') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INVALID_TRANSITION',
                    'message', 'In-transit orders can only transition to DELIVERED or CANCELLED.',
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

    -- Apply status update with contextual timestamps
    UPDATE public.orders
    SET status = p_target_status,
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
        'KDS_ORDER_STATUS_TRANSITION',
        COALESCE(v_caller_id::text, 'kds_system'),
        'orders',
        p_order_id::text,
        jsonb_build_object(
            'order_number', v_order.order_number,
            'previous_status', v_order.status,
            'new_status', p_target_status,
            'reason', p_reason,
            'notes', p_notes,
            'staff_role', v_caller_role,
            'transition_time', v_now
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'previous_status', v_order.status,
        'new_status', p_target_status,
        'updated_at', v_now
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. KDS ORDERS FETCH RPC
-- Retrieves active and recent orders formatted for KDS cards including items,
-- customization options, secondary flavors, elapsed time, and delivery info.
CREATE OR REPLACE FUNCTION public.get_kds_orders(
    p_statuses public.order_status[] DEFAULT ARRAY['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']::public.order_status[]
)
RETURNS JSONB AS $$
DECLARE
    v_caller_role public.user_role;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        SELECT role INTO v_caller_role
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_caller_role IS NULL OR v_caller_role NOT IN ('staff', 'admin', 'kitchen', 'counter', 'manager') THEN
            RAISE EXCEPTION 'Access denied. Caller is not authorized for KDS.' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT jsonb_agg(
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

-- 6. REALTIME REPLICATION CONFIGURATION
ALTER TABLE public.orders REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN undefined_object THEN null;
END $$;

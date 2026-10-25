-- =============================================================================
-- AY PIZZA SECURITY & DATA INTEGRITY HARDENING MIGRATION
-- Migration: 20261021000003_security_and_integrity_fixes.sql
-- Description:
--   1. Closes profile role self-escalation vulnerability with trigger & strict policies.
--   2. Restricts order insertion so clients cannot dictate status (e.g. setting 'PAID').
--   3. Secures order_items and order_item_customizations against ID-guessing / child-traversal bypass.
--   4. Locks audit_logs table against client forgery and unauthorized modifications.
--   5. Introduces database-authoritative order creation and price validation function.
-- =============================================================================

-- =============================================================================
-- 1. ROLE SECURITY & ANTI-ESCALATION ON PROFILES
-- =============================================================================

-- Prevent users from modifying their own 'role' column via UPDATE
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- If the role is being altered, ensure the caller is an active administrator
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Access Denied: Only administrators can assign or alter user roles.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_profile_role_integrity ON public.profiles;

CREATE TRIGGER enforce_profile_role_integrity
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_role_self_escalation();

-- Drop overly broad update policy on profiles
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Recreate policy with explicit check
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE 
    USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (auth.uid() = id OR public.is_admin());

-- =============================================================================
-- 2. HARDEN ORDER CREATION & STATUS PROTECTION
-- =============================================================================

-- Drop weak order creation policy
DROP POLICY IF EXISTS "Allow order creation" ON public.orders;

-- New order creation policy:
-- 1. Clients can ONLY insert orders with status = 'PENDING_PAYMENT'.
-- 2. Authenticated users can only set customer_id = auth.uid().
-- 3. Guests can set customer_id = NULL.
CREATE POLICY "Secure order creation" ON public.orders
    FOR INSERT WITH CHECK (
        status = 'PENDING_PAYMENT'
        AND (
            (auth.uid() IS NOT NULL AND customer_id = auth.uid())
            OR (auth.uid() IS NULL AND customer_id IS NULL)
        )
    );

-- =============================================================================
-- 3. SECURE CHILD ORDER ITEMS & CUSTOMIZATIONS
-- =============================================================================

-- Drop weak order item and customization policies
DROP POLICY IF EXISTS "Insert order items" ON public.order_items;
DROP POLICY IF EXISTS "View order customizations" ON public.order_item_customizations;
DROP POLICY IF EXISTS "Insert order customizations" ON public.order_item_customizations;

-- Order Items can only be inserted if attached to a valid, pending parent order
-- owned by the caller (or guest order)
CREATE POLICY "Secure insert order items" ON public.order_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
            AND orders.status = 'PENDING_PAYMENT'
            AND (
                (orders.customer_id = auth.uid())
                OR (orders.customer_id IS NULL AND auth.uid() IS NULL)
                OR public.is_staff_or_admin()
            )
        )
    );

-- Order Item Customizations can only be viewed by the order owner or staff
CREATE POLICY "Secure view order customizations" ON public.order_item_customizations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.order_items
            JOIN public.orders ON orders.id = order_items.order_id
            WHERE order_items.id = order_item_customizations.order_item_id
            AND (
                orders.customer_id = auth.uid()
                OR public.is_staff_or_admin()
            )
        )
    );

-- Order Item Customizations can only be inserted into a pending parent order item
CREATE POLICY "Secure insert order customizations" ON public.order_item_customizations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.order_items
            JOIN public.orders ON orders.id = order_items.order_id
            WHERE order_items.id = order_item_customizations.order_item_id
            AND orders.status = 'PENDING_PAYMENT'
            AND (
                (orders.customer_id = auth.uid())
                OR (orders.customer_id IS NULL AND auth.uid() IS NULL)
                OR public.is_staff_or_admin()
            )
        )
    );

-- =============================================================================
-- 4. AUDIT LOG IMMUTABILITY & FORGERY DEFENSE
-- =============================================================================

-- Drop weak insertion policy
DROP POLICY IF EXISTS "System insert audit logs" ON public.audit_logs;

-- Audit logs can only be inserted by staff/admin or through trusted security definer functions
CREATE POLICY "Secure insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (
        public.is_staff_or_admin() OR auth.uid() IS NULL
    );

-- Enforce strict database-level immutability (deny UPDATE and DELETE even to table owners)
CREATE OR REPLACE FUNCTION public.reject_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit Log Integrity Violation: Audit log records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_audit_log_modification ON public.audit_logs;

CREATE TRIGGER prevent_audit_log_modification
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.reject_audit_tampering();

-- =============================================================================
-- 5. DATABASE-AUTHORITATIVE ORDER CREATION FUNCTION
-- =============================================================================

-- This function verifies product existence, calculates line items authoritatively from
-- the database, enforces delivery fees, and returns the calculated order atomically.
CREATE OR REPLACE FUNCTION public.create_order_authoritative(
    p_fulfillment_type fulfillment_type,
    p_landmark_id UUID,
    p_delivery_address TEXT,
    p_delivery_notes TEXT,
    p_guest_email TEXT,
    p_guest_phone TEXT,
    p_guest_name TEXT,
    p_idempotency_key TEXT,
    p_items JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_order_id UUID;
    v_order_number TEXT;
    v_customer_id UUID := auth.uid();
    v_delivery_fee NUMERIC(10, 2) := 0;
    v_landmark_name TEXT := NULL;
    v_subtotal NUMERIC(10, 2) := 0;
    v_total NUMERIC(10, 2) := 0;
    v_item JSONB;
    v_prod RECORD;
    v_size RECORD;
    v_size_price NUMERIC(10, 2) := 0;
    v_size_name TEXT := NULL;
    v_item_customizations_total NUMERIC(10, 2) := 0;
    v_item_unit_total NUMERIC(10, 2) := 0;
    v_line_total NUMERIC(10, 2) := 0;
    v_item_id UUID;
    v_customization JSONB;
    v_opt RECORD;
    v_existing_order RECORD;
BEGIN
    -- Idempotency check: Return existing pending order if key matches
    SELECT id, order_number, total, status INTO v_existing_order
    FROM public.orders
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_retry', true,
            'order_id', v_existing_order.id,
            'order_number', v_existing_order.order_number,
            'total', v_existing_order.total,
            'status', v_existing_order.status
        );
    END IF;

    -- Resolve delivery fee authoritatively from database
    IF p_fulfillment_type = 'delivery' THEN
        IF p_landmark_id IS NULL THEN
            RAISE EXCEPTION 'A delivery landmark must be selected for delivery orders.';
        END IF;

        SELECT name, fee INTO v_landmark_name, v_delivery_fee
        FROM public.delivery_landmarks
        WHERE id = p_landmark_id AND is_active = TRUE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid or suspended delivery landmark.';
        END IF;
    ELSE
        v_delivery_fee := 0;
        v_landmark_name := 'Pickup at King Jaja Hall';
    END IF;

    -- Validate items presence
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item.';
    END IF;

    -- Insert order placeholder
    INSERT INTO public.orders (
        customer_id,
        guest_email,
        guest_phone,
        guest_name,
        fulfillment_type,
        landmark_id,
        landmark_name,
        delivery_address,
        delivery_notes,
        subtotal,
        delivery_fee,
        discount_amount,
        total,
        status,
        idempotency_key
    ) VALUES (
        v_customer_id,
        p_guest_email,
        p_guest_phone,
        p_guest_name,
        p_fulfillment_type,
        p_landmark_id,
        v_landmark_name,
        p_delivery_address,
        p_delivery_notes,
        0, -- updated after item computation
        v_delivery_fee,
        0,
        0,
        'PENDING_PAYMENT',
        p_idempotency_key
    )
    RETURNING id, order_number INTO v_order_id, v_order_number;

    -- Iterate items and calculate authoritatively from database prices
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Fetch product
        SELECT id, name, base_price, is_available INTO v_prod
        FROM public.products
        WHERE id = (v_item->>'product_id')::UUID;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % does not exist.', v_item->>'product_id';
        END IF;

        IF NOT v_prod.is_available THEN
            RAISE EXCEPTION 'Product % is currently out of stock.', v_prod.name;
        END IF;

        -- Resolve size if provided
        v_size_price := 0;
        v_size_name := NULL;
        IF (v_item->>'size_id') IS NOT NULL AND (v_item->>'size_id') != '' THEN
            SELECT name, size_price INTO v_size
            FROM public.product_sizes
            WHERE id = (v_item->>'size_id')::UUID;

            IF FOUND THEN
                v_size_price := v_size.size_price;
                v_size_name := v_size.name;
            END IF;
        END IF;

        -- Customizations total
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
            (v_item->>'quantity')::INT,
            v_prod.base_price,
            0, -- updated below
            0, -- updated below
            v_item->>'half_secondary_flavor',
            v_item->>'special_instructions'
        )
        RETURNING id INTO v_item_id;

        -- Process customizations
        IF v_item ? 'customizations' AND jsonb_array_length(v_item->'customizations') > 0 THEN
            FOR v_customization IN SELECT * FROM jsonb_array_elements(v_item->'customizations')
            LOOP
                SELECT id, name, price INTO v_opt
                FROM public.customization_options
                WHERE id = (v_customization->>'option_id')::UUID;

                IF FOUND THEN
                    -- Check dynamic Half & Half rule: Regular/Standard = 1000, Large/Queen/King = 1500
                    IF LOWER(v_opt.name) LIKE '%half%' THEN
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
                END IF;
            END LOOP;
        END IF;

        -- Finalize item totals
        v_item_unit_total := v_prod.base_price + v_size_price + v_item_customizations_total;
        v_line_total := v_item_unit_total * (v_item->>'quantity')::INT;
        v_subtotal := v_subtotal + v_line_total;

        UPDATE public.order_items
        SET customizations_total = v_item_customizations_total,
            item_total = v_line_total
        WHERE id = v_item_id;
    END LOOP;

    -- Finalize order totals
    v_total := v_subtotal + v_delivery_fee;

    UPDATE public.orders
    SET subtotal = v_subtotal,
        total = v_total
    WHERE id = v_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total,
        'status', 'PENDING_PAYMENT'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

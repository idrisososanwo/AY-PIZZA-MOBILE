-- =============================================================================
-- AY PIZZA PHASE 3: CHECKOUT, ORDER INTEGRITY & PAYSTACK PAYMENT INTEGRATION
-- Migration: 20261021000005_phase3_checkout_and_paystack.sql
-- Description:
--   1. Adds cryptographic unguessable receipt_token to orders for secure guest receipt retrieval.
--   2. Enforces strict zero-direct-client-insert policy on orders, order_items, and customizations.
--      All orders MUST be created through create_order_authoritative().
--   3. Hardens create_order_authoritative() with:
--      - Explicit search_path = public, pg_temp (prevents path hijacking in SECURITY DEFINER).
--      - Deep validation: product stock, quantity bounds (1-99), size existence, option existence.
--      - Dynamic Half & Half surcharge (₦1,000 for Regular/Standard, ₦1,500 for Large/Queen/King).
--      - Delivery fee resolution & strict ₦0 pickup fee.
--      - Concurrency-safe idempotency resolution handling unique_violation exceptions.
--      - Returns receipt_token and integer total_in_kobo.
--   4. Adds get_order_by_receipt() RPC for secure unguessable guest receipt verification.
--   5. Adds settle_order_payment() server function with regression prevention and audit logging.
-- =============================================================================

-- 1. ADD RECEIPT TOKEN FOR SECURE UNGUESSABLE ORDER RECEIPT ACCESS
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS receipt_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_receipt_token ON public.orders(receipt_token);

-- 2. ENFORCE ZERO-DIRECT-CLIENT-INSERT ON ORDERS AND LINE ITEMS
-- Drop old permissive / partial insert policies
DROP POLICY IF EXISTS "Allow order creation" ON public.orders;
DROP POLICY IF EXISTS "Secure order creation" ON public.orders;
DROP POLICY IF EXISTS "Insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Secure insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Insert order customizations" ON public.order_item_customizations;
DROP POLICY IF EXISTS "Secure insert order customizations" ON public.order_item_customizations;

-- Prohibit direct INSERT by normal customers or anon. Direct insertion is restricted
-- exclusively to staff/admin. All regular customer orders MUST use create_order_authoritative().
CREATE POLICY "Staff only direct insert orders" ON public.orders
    FOR INSERT WITH CHECK (public.is_staff_or_admin());

CREATE POLICY "Staff only direct insert order items" ON public.order_items
    FOR INSERT WITH CHECK (public.is_staff_or_admin());

CREATE POLICY "Staff only direct insert order customizations" ON public.order_item_customizations
    FOR INSERT WITH CHECK (public.is_staff_or_admin());

-- Ensure no direct client updates or deletes
DROP POLICY IF EXISTS "Staff update orders" ON public.orders;
CREATE POLICY "Staff update orders" ON public.orders
    FOR UPDATE USING (public.is_staff_or_admin());

-- 3. HARDENED DATABASE-AUTHORITATIVE ORDER CREATION FUNCTION
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
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_id UUID;
    v_order_number TEXT;
    v_receipt_token TEXT;
    v_customer_id UUID := auth.uid();
    v_delivery_fee NUMERIC(10, 2) := 0;
    v_landmark_name TEXT := NULL;
    v_subtotal NUMERIC(10, 2) := 0;
    v_total NUMERIC(10, 2) := 0;
    v_total_in_kobo BIGINT := 0;
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
    v_item_qty INT;
    v_existing_order RECORD;
    v_sec_pizza RECORD;
BEGIN
    -- Input sanitization & validation
    IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'Idempotency key is required to create an order.';
    END IF;

    -- 1. Idempotency check: Return existing order if key matches
    SELECT id, order_number, receipt_token, subtotal, delivery_fee, total, status
    INTO v_existing_order
    FROM public.orders
    WHERE idempotency_key = TRIM(p_idempotency_key);

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_retry', true,
            'order_id', v_existing_order.id,
            'order_number', v_existing_order.order_number,
            'receipt_token', v_existing_order.receipt_token,
            'subtotal', v_existing_order.subtotal,
            'delivery_fee', v_existing_order.delivery_fee,
            'total', v_existing_order.total,
            'total_in_kobo', ROUND(v_existing_order.total * 100)::BIGINT,
            'status', v_existing_order.status
        );
    END IF;

    -- 2. Validate customer contact information
    IF v_customer_id IS NULL THEN
        -- Guest checkout validation
        IF p_guest_name IS NULL OR TRIM(p_guest_name) = '' THEN
            RAISE EXCEPTION 'Guest name is required for guest checkout.';
        END IF;
        IF p_guest_phone IS NULL OR LENGTH(REGEXP_REPLACE(p_guest_phone, '[^0-9]', '', 'g')) < 10 THEN
            RAISE EXCEPTION 'A valid phone number (at least 10 digits) is required for order coordination.';
        END IF;
    END IF;

    -- 3. Resolve delivery fee authoritatively from database
    IF p_fulfillment_type = 'delivery' THEN
        IF p_landmark_id IS NULL THEN
            RAISE EXCEPTION 'A delivery landmark must be selected for delivery orders.';
        END IF;

        IF p_delivery_address IS NULL OR TRIM(p_delivery_address) = '' THEN
            RAISE EXCEPTION 'Delivery address or hostel room number is required.';
        END IF;

        SELECT name, fee INTO v_landmark_name, v_delivery_fee
        FROM public.delivery_landmarks
        WHERE id = p_landmark_id AND is_active = TRUE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid or currently unavailable delivery landmark.';
        END IF;
    ELSE
        -- Pickup is strictly ₦0 and bypasses delivery landmark
        v_delivery_fee := 0;
        v_landmark_name := 'Pickup at King Jaja Hall';
    END IF;

    -- 4. Validate items array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item.';
    END IF;

    -- Generate receipt token
    v_receipt_token := encode(gen_random_bytes(32), 'hex');

    -- 5. Insert order header in PENDING_PAYMENT state
    BEGIN
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
            idempotency_key,
            receipt_token
        ) VALUES (
            v_customer_id,
            NULLIF(TRIM(p_guest_email), ''),
            NULLIF(TRIM(p_guest_phone), ''),
            NULLIF(TRIM(p_guest_name), ''),
            p_fulfillment_type,
            p_landmark_id,
            v_landmark_name,
            NULLIF(TRIM(p_delivery_address), ''),
            NULLIF(TRIM(p_delivery_notes), ''),
            0, -- updated after calculation
            v_delivery_fee,
            0,
            0,
            'PENDING_PAYMENT',
            TRIM(p_idempotency_key),
            v_receipt_token
        )
        RETURNING id, order_number INTO v_order_id, v_order_number;
    EXCEPTION WHEN unique_violation THEN
        -- Handle concurrent duplicate insertion race condition gracefully
        SELECT id, order_number, receipt_token, subtotal, delivery_fee, total, status
        INTO v_existing_order
        FROM public.orders
        WHERE idempotency_key = TRIM(p_idempotency_key);

        RETURN jsonb_build_object(
            'success', true,
            'is_retry', true,
            'order_id', v_existing_order.id,
            'order_number', v_existing_order.order_number,
            'receipt_token', v_existing_order.receipt_token,
            'subtotal', v_existing_order.subtotal,
            'delivery_fee', v_existing_order.delivery_fee,
            'total', v_existing_order.total,
            'total_in_kobo', ROUND(v_existing_order.total * 100)::BIGINT,
            'status', v_existing_order.status
        );
    END;

    -- 6. Process items authoritatively
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_qty := (v_item->>'quantity')::INT;
        IF v_item_qty IS NULL OR v_item_qty < 1 OR v_item_qty > 99 THEN
            RAISE EXCEPTION 'Item quantity must be between 1 and 99.';
        END IF;

        -- Fetch product authoritatively
        SELECT id, name, base_price, is_available INTO v_prod
        FROM public.products
        WHERE id = (v_item->>'product_id')::UUID;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % does not exist.', v_item->>'product_id';
        END IF;

        IF NOT v_prod.is_available THEN
            RAISE EXCEPTION 'Product "%" is currently out of stock.', v_prod.name;
        END IF;

        -- Resolve size
        v_size_price := 0;
        v_size_name := NULL;
        IF (v_item->>'size_id') IS NOT NULL AND (v_item->>'size_id') != '' THEN
            SELECT name, size_price INTO v_size
            FROM public.product_sizes
            WHERE id = (v_item->>'size_id')::UUID;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Selected size % is invalid for product "%".', v_item->>'size_id', v_prod.name;
            END IF;

            v_size_price := v_size.size_price;
            v_size_name := v_size.name;
        END IF;

        -- Validate Half & Half secondary flavor if configured
        IF (v_item->>'half_secondary_flavor') IS NOT NULL AND TRIM(v_item->>'half_secondary_flavor') != '' THEN
            SELECT id, name, is_available INTO v_sec_pizza
            FROM public.products
            WHERE name = TRIM(v_item->>'half_secondary_flavor');

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Secondary pizza "%" does not exist.', v_item->>'half_secondary_flavor';
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

        -- Process customizations
        IF v_item ? 'customizations' AND jsonb_array_length(v_item->'customizations') > 0 THEN
            FOR v_customization IN SELECT * FROM jsonb_array_elements(v_item->'customizations')
            LOOP
                SELECT id, name, price INTO v_opt
                FROM public.customization_options
                WHERE id = (v_customization->>'option_id')::UUID;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Customization option % does not exist.', v_customization->>'option_id';
                END IF;

                -- Dynamic Half & Half price adjustment
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
            END LOOP;
        END IF;

        -- Finalize unit total & line total
        v_item_unit_total := v_prod.base_price + v_size_price + v_item_customizations_total;
        v_line_total := v_item_unit_total * v_item_qty;
        v_subtotal := v_subtotal + v_line_total;

        UPDATE public.order_items
        SET customizations_total = v_item_customizations_total,
            item_total = v_line_total
        WHERE id = v_item_id;
    END LOOP;

    -- Finalize order total
    v_total := v_subtotal + v_delivery_fee;
    v_total_in_kobo := ROUND(v_total * 100)::BIGINT;

    UPDATE public.orders
    SET subtotal = v_subtotal,
        total = v_total
    WHERE id = v_order_id;

    -- Create audit log record
    INSERT INTO public.audit_logs (
        action,
        performed_by,
        target_type,
        target_id,
        details
    ) VALUES (
        'ORDER_CREATED_AUTHORITATIVE',
        COALESCE(v_customer_id::TEXT, 'guest:' || p_guest_phone),
        'order',
        v_order_id::TEXT,
        jsonb_build_object(
            'order_number', v_order_number,
            'subtotal', v_subtotal,
            'delivery_fee', v_delivery_fee,
            'total', v_total,
            'total_in_kobo', v_total_in_kobo,
            'fulfillment_type', p_fulfillment_type,
            'item_count', jsonb_array_length(p_items)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'receipt_token', v_receipt_token,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total,
        'total_in_kobo', v_total_in_kobo,
        'status', 'PENDING_PAYMENT'
    );
END;
$$;

-- Explicitly grant execute on authoritative order function
GRANT EXECUTE ON FUNCTION public.create_order_authoritative TO authenticated, anon;

-- 4. AUTHORITATIVE RECEIPT RETRIEVAL RPC (FOR SECURE GUEST RECEIPT ACCESS)
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
BEGIN
    -- Match by ID and cryptographic receipt token, OR authenticated customer owner, OR staff
    SELECT o.*,
           CASE WHEN p_receipt_token IS NOT NULL AND o.receipt_token = p_receipt_token THEN TRUE
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
            'payment_reference', v_order.payment_reference,
            'receipt_token', v_order.receipt_token,
            'created_at', v_order.created_at,
            'items', v_items
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_by_receipt TO authenticated, anon;

-- 5. SERVER-SIDE PAYMENT SETTLEMENT FUNCTION (PAYSTACK VERIFICATION & WEBHOOKS)
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
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Validate payment amount matches authoritative order total in kobo
    v_expected_kobo := ROUND(v_order.total * 100)::BIGINT;
    IF p_amount_in_kobo != v_expected_kobo THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment amount mismatch: Expected ' || v_expected_kobo || ' kobo, received ' || p_amount_in_kobo || ' kobo.'
        );
    END IF;

    -- Prevent status regression: If order is already confirmed or progressing, do not regress
    IF v_order.status IN ('CONFIRMED', 'PAID', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED') THEN
        -- Record or update payment transaction idempotently
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
            p_reference,
            v_order.total,
            p_amount_in_kobo,
            'NGN',
            'success',
            p_channel,
            timezone('utc'::text, now()),
            p_metadata
        )
        ON CONFLICT (reference) DO UPDATE
        SET status = 'success',
            updated_at = timezone('utc'::text, now());

        RETURN jsonb_build_object(
            'success', true,
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'status', v_order.status,
            'already_settled', true
        );
    END IF;

    -- Transition order status to CONFIRMED
    UPDATE public.orders
    SET status = 'CONFIRMED',
        payment_reference = p_reference,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id;

    -- Record payment transaction
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
        p_reference,
        v_order.total,
        p_amount_in_kobo,
        'NGN',
        'success',
        p_channel,
        timezone('utc'::text, now()),
        p_metadata
    )
    ON CONFLICT (reference) DO UPDATE
    SET status = 'success',
        updated_at = timezone('utc'::text, now());

    -- Audit log entry
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
            'reference', p_reference,
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
        'payment_reference', p_reference
    );
END;
$$;

-- Grant execution to authenticated, anon, and service_role
GRANT EXECUTE ON FUNCTION public.settle_order_payment TO authenticated, anon;

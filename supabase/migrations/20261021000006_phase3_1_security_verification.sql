-- =============================================================================
-- AY PIZZA PHASE 3.1: PAYMENT SECURITY, DATABASE INTEGRITY & RPC HARDENING
-- Migration: 20261021000006_phase3_1_security_verification.sql
-- Description:
--   1. Revokes EXECUTE on settle_order_payment() from public, anon, and authenticated.
--      Grants EXECUTE strictly to service_role (Paystack webhook & Edge Functions).
--   2. Introduces receipt_token_hash (SHA-256) at rest and removes plaintext tokens.
--   3. Hardens create_order_authoritative() with:
--      - Size belonging to product/category validation.
--      - Customization option belonging to product customization groups validation.
--      - Active and available checks on options and groups.
--      - Half & Half restricted exclusively to pizza category.
--      - Cryptographic deterministic receipt token generation via HMAC-SHA256.
--   4. Hardens get_order_by_receipt() to match against receipt_token_hash with no token leaks.
--   5. Hardens settle_order_payment() with:
--      - Duplicate successful transaction detection (multi-charge audit logging).
--      - Cancelled order payment protection (prevents reviving cancelled orders).
--      - Strict amount matching in integer kobo.
-- =============================================================================

-- 1. RECEIPT TOKEN HASHING AT REST
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS receipt_token_hash TEXT;

-- Backfill existing orders with SHA-256 hash
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'orders' 
          AND column_name = 'receipt_token'
    ) THEN
        UPDATE public.orders 
        SET receipt_token_hash = encode(digest(receipt_token, 'sha256'), 'hex')
        WHERE receipt_token_hash IS NULL AND receipt_token IS NOT NULL;
        
        ALTER TABLE public.orders DROP COLUMN receipt_token;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_receipt_token_hash 
ON public.orders(receipt_token_hash);

-- 2. HARDEN AUTHORITATIVE ORDER CREATION FUNCTION
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
    c_receipt_kdf_salt CONSTANT TEXT := 'ay_pizza_receipt_kdf_v1_secret_salt_2026';
BEGIN
    -- 1. Enforce trusted customer identity
    v_customer_id := auth.uid();

    -- 2. Require idempotency key
    IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'Idempotency key is required.';
    END IF;

    -- Derive deterministic receipt token and hash from idempotency key and server salt
    v_receipt_token := encode(hmac(TRIM(p_idempotency_key), c_receipt_kdf_salt, 'sha256'), 'hex');
    v_receipt_token_hash := encode(digest(v_receipt_token, 'sha256'), 'hex');

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
            'receipt_token', v_receipt_token,
            'subtotal', v_existing_order.subtotal,
            'delivery_fee', v_existing_order.delivery_fee,
            'total', v_existing_order.total,
            'total_in_kobo', ROUND(v_existing_order.total * 100)::BIGINT,
            'status', v_existing_order.status
        );
    END IF;

    -- 3. Resolve and validate fulfillment details
    IF p_fulfillment_type = 'delivery' THEN
        IF p_landmark_id IS NULL THEN
            RAISE EXCEPTION 'A delivery landmark is required for delivery orders.';
        END IF;

        IF p_delivery_address IS NULL OR TRIM(p_delivery_address) = '' THEN
            RAISE EXCEPTION 'A specific delivery address or room/office number is required.';
        END IF;

        SELECT name, delivery_fee INTO v_landmark_name, v_delivery_fee
        FROM public.delivery_landmarks
        WHERE id = p_landmark_id AND is_active = TRUE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected delivery landmark is invalid or inactive.';
        END IF;
    ELSIF p_fulfillment_type = 'pickup' THEN
        v_delivery_fee := 0.00;
        v_landmark_name := 'AY Pizza Store (Main Campus)';
    ELSE
        RAISE EXCEPTION 'Invalid fulfillment type: %', p_fulfillment_type;
    END IF;

    -- 4. Validate items payload
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item.';
    END IF;

    -- 5. Insert initial order header in PENDING_PAYMENT state
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
            receipt_token_hash
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
            0,
            v_delivery_fee,
            0,
            0,
            'PENDING_PAYMENT',
            TRIM(p_idempotency_key),
            v_receipt_token_hash
        )
        RETURNING id, order_number INTO v_order_id, v_order_number;
    EXCEPTION WHEN unique_violation THEN
        SELECT id, order_number, subtotal, delivery_fee, total, status
        INTO v_existing_order
        FROM public.orders
        WHERE idempotency_key = TRIM(p_idempotency_key);

        RETURN jsonb_build_object(
            'success', true,
            'is_retry', true,
            'order_id', v_existing_order.id,
            'order_number', v_existing_order.order_number,
            'receipt_token', v_receipt_token,
            'subtotal', v_existing_order.subtotal,
            'delivery_fee', v_existing_order.delivery_fee,
            'total', v_existing_order.total,
            'total_in_kobo', ROUND(v_existing_order.total * 100)::BIGINT,
            'status', v_existing_order.status
        );
    END;

    -- 6. Process and authoritatively validate items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_qty := (v_item->>'quantity')::INT;
        IF v_item_qty IS NULL OR v_item_qty < 1 OR v_item_qty > 99 THEN
            RAISE EXCEPTION 'Item quantity must be between 1 and 99.';
        END IF;

        -- Fetch product and category slug authoritatively
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

        -- Resolve and strictly validate size belonging to product or product category
        v_size_price := 0;
        v_size_name := NULL;
        IF (v_item->>'size_id') IS NOT NULL AND (v_item->>'size_id') != '' THEN
            SELECT ps.name, ps.size_price INTO v_size
            FROM public.product_sizes ps
            WHERE ps.id = (v_item->>'size_id')::UUID
              AND (
                  ps.product_id = v_prod.id
                  OR (ps.category_slug IS NOT NULL AND ps.category_slug = v_prod.category_slug)
              );

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Selected size % is invalid for product "%".', v_item->>'size_id', v_prod.name;
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
                -- Validate that customization option exists, is available, and belongs to a group
                -- assigned to this product or this product category
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

        -- Update order item with calculated totals
        UPDATE public.order_items
        SET customizations_total = v_item_customizations_total,
            item_total = v_line_total
        WHERE id = v_item_id;
    END LOOP;

    -- 7. Update order header with authoritative financial totals
    v_total := v_subtotal + v_delivery_fee;

    UPDATE public.orders
    SET subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        discount_amount = 0,
        total = v_total,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_order_id;

    -- 8. Return authoritative order summary with secret plain token (not stored at rest)
    RETURN jsonb_build_object(
        'success', true,
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

GRANT EXECUTE ON FUNCTION public.create_order_authoritative TO authenticated, anon;

-- 3. HARDEN RECEIPT RETRIEVAL RPC (MATCH BY SHA-256 HASH)
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
            'created_at', v_order.created_at,
            'items', v_items
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_by_receipt TO authenticated, anon;

-- 4. HARDEN SERVER-SIDE PAYMENT SETTLEMENT FUNCTION
-- REVOKE EXECUTE from public, anon, and authenticated!
REVOKE EXECUTE ON FUNCTION public.settle_order_payment(UUID, TEXT, TEXT, BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

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
    v_existing_tx RECORD;
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

    -- Cancelled order check: Do not revive cancelled orders
    IF v_order.status = 'CANCELLED' THEN
        -- Record transaction with warning status
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
            'paid_after_cancellation',
            p_channel,
            timezone('utc'::text, now()),
            p_metadata
        )
        ON CONFLICT (reference) DO UPDATE
        SET status = 'paid_after_cancellation',
            updated_at = timezone('utc'::text, now());

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
                'reference', p_reference,
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

    -- Check for duplicate successful payments on an already settled order
    IF v_order.status IN ('CONFIRMED', 'PAID', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED') THEN
        -- If this is the exact same reference, handle idempotently
        IF v_order.payment_reference = p_reference THEN
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
                p_reference,
                v_order.total,
                p_amount_in_kobo,
                'NGN',
                'duplicate_success_needs_refund',
                p_channel,
                timezone('utc'::text, now()),
                p_metadata
            )
            ON CONFLICT (reference) DO UPDATE
            SET status = 'duplicate_success_needs_refund',
                updated_at = timezone('utc'::text, now());

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
                    'duplicate_reference', p_reference,
                    'amount_in_kobo', p_amount_in_kobo,
                    'alert', 'Duplicate payment received for already settled order. Requires merchant refund.'
                )
            );

            RETURN jsonb_build_object(
                'success', true,
                'order_id', v_order.id,
                'order_number', v_order.order_number,
                'status', v_order.status,
                'duplicate_payment', true,
                'warning', 'Duplicate payment recorded. Manual refund reconciliation required.'
            );
        END IF;
    END IF;

    -- First successful settlement: transition status to CONFIRMED
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

-- Grant EXECUTE exclusively to service_role!
GRANT EXECUTE ON FUNCTION public.settle_order_payment TO service_role;

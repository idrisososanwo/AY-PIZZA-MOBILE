-- =============================================================================
-- AY PIZZA — Phase 3.1.1: Final Payment Security & Cryptographic Hardening
-- =============================================================================
-- Migration: 20261022000001_phase3_1_1_security_hardening.sql
--
-- Security hardening introduced:
-- 1. Adds is_available column to product_sizes with default TRUE.
-- 2. Completely eliminates static HMAC salt and client-derivable receipt tokens.
--    Generates unguessable 256-bit cryptographically secure random tokens server-side:
--      v_receipt_token := encode(gen_random_bytes(32), 'hex');
--    Stores only SHA-256(receipt_token) at rest in orders.receipt_token_hash.
--    Returns the plaintext token only to the legitimate caller on order creation.
-- 3. Hardens product size validation in create_order_authoritative() to strictly
--    require ps.is_available = TRUE.
-- 4. Preserves all relational authorization checks for product customizations,
--    half-and-half pizzas, and delivery landmarks.
-- =============================================================================

-- 1. ADD IS_AVAILABLE TO PRODUCT SIZES
ALTER TABLE public.product_sizes 
ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. HARDEN AUTHORITATIVE ORDER CREATION FUNCTION
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
            'receipt_token', NULL, -- Plaintext token cannot be derived from hash or idempotency key
            'subtotal', v_existing_order.subtotal,
            'delivery_fee', v_existing_order.delivery_fee,
            'total', v_existing_order.total,
            'total_in_kobo', ROUND(v_existing_order.total * 100)::BIGINT,
            'status', v_existing_order.status
        );
    END IF;

    -- 3. Cryptographically random server-side receipt token generation (256-bit entropy)
    -- Generated purely from CSPRNG, independent of any client data or idempotency key.
    v_receipt_token := encode(gen_random_bytes(32), 'hex');
    v_receipt_token_hash := encode(digest(v_receipt_token, 'sha256'), 'hex');

    -- 4. Resolve and validate fulfillment details
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
        v_landmark_name := 'Campus Pick-up (AY Pizza Stand)';
    ELSE
        RAISE EXCEPTION 'Invalid fulfillment type. Must be "delivery" or "pickup".';
    END IF;

    -- 5. Validate customer contact information
    IF p_guest_phone IS NULL OR TRIM(p_guest_phone) = '' THEN
        RAISE EXCEPTION 'Customer phone number is required.';
    END IF;

    IF p_guest_name IS NULL OR TRIM(p_guest_name) = '' THEN
        RAISE EXCEPTION 'Customer name is required.';
    END IF;

    -- 6. Validate items payload
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cart is empty. At least one item is required.';
    END IF;

    -- 7. Generate order number
    v_order_number := 'AYP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 8. Insert provisional order record
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
        p_fulfillment_type,
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

    -- 9. Iterate, validate, and compute order items authoritatively
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

        -- Update order item calculations
        UPDATE public.order_items
        SET customizations_total = v_item_customizations_total,
            item_total = v_line_total
        WHERE id = v_item_id;
    END LOOP;

    -- 10. Update order totals
    v_total := v_subtotal + v_delivery_fee;

    UPDATE public.orders
    SET subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total
    WHERE id = v_order_id;

    -- 11. Return authoritative order payload with receipt token
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

GRANT EXECUTE ON FUNCTION public.create_order_authoritative TO authenticated, anon;

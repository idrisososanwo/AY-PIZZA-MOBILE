-- =============================================================================
-- Migration: 20261022000008_phase4_2_tracking_and_notifications.sql
-- Description: Phase 4.2 Customer Order Tracking, Order Status Events, Device
--              Push Tokens, and Reliable Notification Outbox.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ORDER STATUS EVENTS TABLE (APPEND-ONLY CUSTOMER TIMELINE)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    previous_status public.order_status,
    new_status public.order_status NOT NULL,
    version INT NOT NULL,
    actor_type TEXT NOT NULL DEFAULT 'system',
    actor_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_status_events_order_time 
    ON public.order_status_events(order_id, created_at ASC);

ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

-- Immutability trigger: order_status_events cannot be updated or deleted
CREATE OR REPLACE FUNCTION public.reject_order_event_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Order Event Integrity Violation: Historical order status events are strictly append-only and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_order_event_modification ON public.order_status_events;
CREATE TRIGGER trg_prevent_order_event_modification
    BEFORE UPDATE OR DELETE ON public.order_status_events
    FOR EACH ROW
    EXECUTE FUNCTION public.reject_order_event_tampering();

-- RLS: Authenticated customer can view events for their own orders; staff can view all
DROP POLICY IF EXISTS "Customers view own order events" ON public.order_status_events;
CREATE POLICY "Customers view own order events" ON public.order_status_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_status_events.order_id
              AND (
                  (auth.uid() IS NOT NULL AND o.customer_id = auth.uid())
                  OR public.is_staff_or_admin()
              )
        )
    );

-- Zero direct client insertion into order_status_events
DROP POLICY IF EXISTS "Deny direct insert order events" ON public.order_status_events;
CREATE POLICY "Deny direct insert order events" ON public.order_status_events
    FOR INSERT
    WITH CHECK (false);

-- =============================================================================
-- 2. DEVICE PUSH TOKENS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    guest_device_id TEXT,
    push_token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_used_at TIMESTAMPTZ,
    revocation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user 
    ON public.device_push_tokens(user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_guest 
    ON public.device_push_tokens(guest_device_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_token 
    ON public.device_push_tokens(push_token);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

-- RLS: Authenticated users can view and manage their own device tokens
DROP POLICY IF EXISTS "Users view own push tokens" ON public.device_push_tokens;
CREATE POLICY "Users view own push tokens" ON public.device_push_tokens
    FOR SELECT
    USING (
        (auth.uid() IS NOT NULL AND user_id = auth.uid())
        OR public.is_staff_or_admin()
    );

DROP POLICY IF EXISTS "Users update own push tokens" ON public.device_push_tokens;
CREATE POLICY "Users update own push tokens" ON public.device_push_tokens
    FOR UPDATE
    USING (auth.uid() IS NOT NULL AND user_id = auth.uid())
    WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Zero direct arbitrary insert without RPC validation
DROP POLICY IF EXISTS "Deny direct insert push tokens" ON public.device_push_tokens;
CREATE POLICY "Deny direct insert push tokens" ON public.device_push_tokens
    FOR INSERT
    WITH CHECK (false);

-- =============================================================================
-- 3. NOTIFICATION OUTBOX TABLE (RELIABLE ASYNC PUSH DELIVERY)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    target_token TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
    attempt_count INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_error TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_queue 
    ON public.notification_outbox(status, next_retry_at) 
    WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_notification_outbox_order 
    ON public.notification_outbox(order_id);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

-- RLS: Zero direct client access to notification outbox
DROP POLICY IF EXISTS "Deny all public select outbox" ON public.notification_outbox;
CREATE POLICY "Deny all public select outbox" ON public.notification_outbox
    FOR SELECT USING (false);

DROP POLICY IF EXISTS "Deny all public insert outbox" ON public.notification_outbox;
CREATE POLICY "Deny all public insert outbox" ON public.notification_outbox
    FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all public update outbox" ON public.notification_outbox;
CREATE POLICY "Deny all public update outbox" ON public.notification_outbox
    FOR UPDATE USING (false);

-- =============================================================================
-- 4. RPCs: TOKEN REGISTRATION & DEACTIVATION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.register_device_push_token(
    p_push_token TEXT,
    p_platform TEXT,
    p_guest_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_clean_token TEXT;
    v_clean_platform TEXT;
    v_record_id UUID;
BEGIN
    v_user_id := auth.uid();
    v_clean_token := TRIM(p_push_token);
    v_clean_platform := LOWER(TRIM(p_platform));

    IF v_clean_token IS NULL OR v_clean_token = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Valid push token is required.');
    END IF;

    IF v_clean_platform NOT IN ('android', 'ios', 'web') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid platform specified.');
    END IF;

    -- Upsert push token record
    INSERT INTO public.device_push_tokens (
        user_id,
        guest_device_id,
        push_token,
        platform,
        is_active,
        updated_at,
        revocation_reason
    ) VALUES (
        v_user_id,
        CASE WHEN v_user_id IS NULL THEN TRIM(p_guest_device_id) ELSE NULL END,
        v_clean_token,
        v_clean_platform,
        true,
        timezone('utc'::text, now()),
        NULL
    )
    ON CONFLICT (push_token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        guest_device_id = EXCLUDED.guest_device_id,
        platform = EXCLUDED.platform,
        is_active = true,
        updated_at = timezone('utc'::text, now()),
        revocation_reason = NULL
    RETURNING id INTO v_record_id;

    RETURN jsonb_build_object(
        'success', true,
        'token_id', v_record_id,
        'user_id', v_user_id,
        'platform', v_clean_platform,
        'is_active', true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_push_token(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device_push_token(TEXT, TEXT, TEXT) TO authenticated, anon, service_role;


CREATE OR REPLACE FUNCTION public.deactivate_device_push_token(
    p_push_token TEXT,
    p_reason TEXT DEFAULT 'User Logged Out'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_count INT;
BEGIN
    v_user_id := auth.uid();

    -- Deactivate token: if caller is authenticated, only allow deactivating own token or guest token
    UPDATE public.device_push_tokens
    SET is_active = false,
        updated_at = timezone('utc'::text, now()),
        revocation_reason = COALESCE(p_reason, 'Deactivated')
    WHERE push_token = TRIM(p_push_token)
      AND (
          user_id IS NULL 
          OR (v_user_id IS NOT NULL AND user_id = v_user_id)
          OR public.is_staff_or_admin()
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'deactivated_count', v_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_device_push_token(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_device_push_token(TEXT, TEXT) TO authenticated, anon, service_role;

-- =============================================================================
-- 5. ATOMIC ORDER STATUS TRANSITION TRIGGER & NOTIFICATION ENQUEUER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_title TEXT;
    v_body TEXT;
    v_actor_type TEXT;
    v_actor_id TEXT;
    v_token_rec RECORD;
    v_idempotency_key TEXT;
    v_order_desc TEXT;
BEGIN
    -- Only act when status actually changes
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    -- Determine actor
    IF auth.uid() IS NOT NULL THEN
        v_actor_type := 'staff';
        v_actor_id := auth.uid()::text;
    ELSE
        v_actor_type := 'system';
        v_actor_id := 'database_trigger';
    END IF;

    -- Formulate customer-facing title and body tailored to fulfillment type
    IF NEW.fulfillment_type = 'pickup' THEN
        CASE NEW.status
            WHEN 'CONFIRMED' THEN
                v_title := 'AY Pizza: Order Confirmed';
                v_body := 'Your pickup order #' || NEW.order_number || ' has been confirmed.';
            WHEN 'ACCEPTED' THEN
                v_title := 'AY Pizza: Order Accepted';
                v_body := 'The kitchen at King Jaja Hall has accepted your pickup order.';
            WHEN 'PREPARING' THEN
                v_title := 'AY Pizza: Pizza in Oven';
                v_body := 'Your pizzas are freshly prepared and baking right now!';
            WHEN 'READY_FOR_PICKUP' THEN
                v_title := 'AY Pizza: Ready for Pickup!';
                v_body := 'Your order is hot and ready at the AY Pizza counter.';
            WHEN 'DELIVERED' THEN
                v_title := 'AY Pizza: Order Collected';
                v_body := 'Order #' || NEW.order_number || ' collected. Enjoy your meal!';
            WHEN 'CANCELLED' THEN
                v_title := 'AY Pizza: Order Cancelled';
                v_body := 'Order #' || NEW.order_number || ' was cancelled. Please check your order details.';
            ELSE
                v_title := 'AY Pizza: Order Update';
                v_body := 'Order #' || NEW.order_number || ' status updated to ' || NEW.status::text;
        END CASE;
    ELSE
        -- Delivery order
        CASE NEW.status
            WHEN 'CONFIRMED' THEN
                v_title := 'AY Pizza: Order Confirmed';
                v_body := 'Your delivery order #' || NEW.order_number || ' has been confirmed.';
            WHEN 'ACCEPTED' THEN
                v_title := 'AY Pizza: Order Accepted';
                v_body := 'AY Pizza has accepted your delivery order.';
            WHEN 'PREPARING' THEN
                v_title := 'AY Pizza: Pizza in Oven';
                v_body := 'Your meal is being freshly prepared in the kitchen.';
            WHEN 'READY_FOR_PICKUP' THEN
                v_title := 'AY Pizza: Order Packed';
                v_body := 'Your meal is packed and waiting for courier dispatch.';
            WHEN 'IN_TRANSIT' THEN
                v_title := 'AY Pizza: On the Way!';
                v_body := 'Your order is with the courier heading to ' || COALESCE(NEW.landmark_name, 'your landmark') || '.';
            WHEN 'DELIVERED' THEN
                v_title := 'AY Pizza: Order Delivered';
                v_body := 'Order #' || NEW.order_number || ' delivered. Enjoy your meal!';
            WHEN 'CANCELLED' THEN
                v_title := 'AY Pizza: Order Cancelled';
                v_body := 'Order #' || NEW.order_number || ' was cancelled. Please check order details.';
            ELSE
                v_title := 'AY Pizza: Order Update';
                v_body := 'Order #' || NEW.order_number || ' status updated to ' || NEW.status::text;
        END CASE;
    END IF;

    -- 1. Insert immutable order status event
    INSERT INTO public.order_status_events (
        order_id,
        previous_status,
        new_status,
        version,
        actor_type,
        actor_id,
        title,
        description,
        metadata
    ) VALUES (
        NEW.id,
        OLD.status,
        NEW.status,
        NEW.version,
        v_actor_type,
        v_actor_id,
        v_title,
        v_body,
        jsonb_build_object(
            'fulfillment_type', NEW.fulfillment_type,
            'landmark_name', NEW.landmark_name,
            'refund_status', NEW.refund_status,
            'rejection_reason', NEW.rejection_reason
        )
    );

    -- 2. Enqueue notification outbox jobs for active tokens
    -- Target customer tokens if customer_id exists
    IF NEW.customer_id IS NOT NULL THEN
        FOR v_token_rec IN 
            SELECT push_token 
            FROM public.device_push_tokens
            WHERE user_id = NEW.customer_id
              AND is_active = true
        LOOP
            v_idempotency_key := NEW.id::text || ':' || NEW.status::text || ':' || v_token_rec.push_token;
            INSERT INTO public.notification_outbox (
                order_id,
                user_id,
                event_type,
                target_token,
                title,
                body,
                data,
                idempotency_key
            ) VALUES (
                NEW.id,
                NEW.customer_id,
                'ORDER_STATUS_' || NEW.status::text,
                v_token_rec.push_token,
                v_title,
                v_body,
                jsonb_build_object(
                    'orderId', NEW.id,
                    'orderNumber', NEW.order_number,
                    'status', NEW.status,
                    'version', NEW.version,
                    'screen', 'order-tracking'
                ),
                v_idempotency_key
            )
            ON CONFLICT (idempotency_key) DO NOTHING;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_status_transition ON public.orders;
CREATE TRIGGER trg_order_status_transition
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.handle_order_status_transition();

-- =============================================================================
-- 6. HARDENED GET_ORDER_BY_RECEIPT (ENRICHED WITH VERSION, TIMESTAMPS & EVENTS)
-- =============================================================================

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

-- =============================================================================
-- 7. NOTIFICATION PROCESSOR ATOMIC CLAIM RPC (SKIP LOCKED)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(
    p_batch_size INT DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    order_id UUID,
    user_id UUID,
    event_type TEXT,
    target_token TEXT,
    title TEXT,
    body TEXT,
    data JSONB,
    attempt_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        SELECT n.id
        FROM public.notification_outbox n
        WHERE n.status IN ('pending', 'failed')
          AND n.next_retry_at <= timezone('utc'::text, now())
          AND n.attempt_count < 5
        ORDER BY n.created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.notification_outbox n
    SET status = 'processing',
        attempt_count = n.attempt_count + 1
    FROM claimed
    WHERE n.id = claimed.id
    RETURNING n.id, n.order_id, n.user_id, n.event_type, n.target_token, n.title, n.body, n.data, n.attempt_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_jobs(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(INT) TO service_role;


CREATE OR REPLACE FUNCTION public.finalize_notification_job(
    p_job_id UUID,
    p_success BOOLEAN,
    p_error TEXT DEFAULT NULL,
    p_is_unregistered BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_job RECORD;
    v_backoff_seconds INT;
BEGIN
    SELECT * INTO v_job FROM public.notification_outbox WHERE id = p_job_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Job not found.');
    END IF;

    IF p_success THEN
        UPDATE public.notification_outbox
        SET status = 'sent',
            processed_at = timezone('utc'::text, now()),
            last_error = NULL
        WHERE id = p_job_id;
    ELSE
        -- If device token was unregistered, deactivate it in device_push_tokens
        IF p_is_unregistered THEN
            UPDATE public.device_push_tokens
            SET is_active = false,
                revocation_reason = 'DeviceNotRegistered',
                updated_at = timezone('utc'::text, now())
            WHERE push_token = v_job.target_token;

            UPDATE public.notification_outbox
            SET status = 'dead_letter',
                processed_at = timezone('utc'::text, now()),
                last_error = 'DeviceNotRegistered'
            WHERE id = p_job_id;
        ELSIF v_job.attempt_count >= 5 THEN
            -- Exceeded maximum retries
            UPDATE public.notification_outbox
            SET status = 'dead_letter',
                processed_at = timezone('utc'::text, now()),
                last_error = COALESCE(p_error, 'Max attempts reached')
            WHERE id = p_job_id;
        ELSE
            -- Exponential backoff: 15s * 2^(attempt-1)
            v_backoff_seconds := 15 * (1 << LEAST(v_job.attempt_count, 6));
            UPDATE public.notification_outbox
            SET status = 'failed',
                next_retry_at = timezone('utc'::text, now()) + (v_backoff_seconds * interval '1 second'),
                last_error = p_error
            WHERE id = p_job_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'job_id', p_job_id, 'status', CASE WHEN p_success THEN 'sent' ELSE 'failed' END);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_notification_job(UUID, BOOLEAN, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_notification_job(UUID, BOOLEAN, TEXT, BOOLEAN) TO service_role;

COMMIT;

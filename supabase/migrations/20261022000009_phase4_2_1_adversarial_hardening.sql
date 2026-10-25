-- =============================================================================
-- Migration: 20261022000009_phase4_2_1_adversarial_hardening.sql
-- Description: Phase 4.2.1 Adversarial Corrections:
--              1. Lease-based job recovery for notification outbox (DEF-42-02)
--              2. Ticket tracking and receipt verification support (DEF-42-04)
--              3. Token hijacking defense & authenticated ownership (DEF-42-03)
--              4. Search path hardening on tampering trigger (DEF-42-07)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. NOTIFICATION OUTBOX LEASE & TICKET SCHEMA ENHANCEMENTS
-- =============================================================================

ALTER TABLE public.notification_outbox 
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ticket_id TEXT,
    ADD COLUMN IF NOT EXISTS receipt_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS receipt_status TEXT;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_lease 
    ON public.notification_outbox(status, lease_expires_at) 
    WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_notification_outbox_ticket 
    ON public.notification_outbox(ticket_id) 
    WHERE ticket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_unverified_receipts
    ON public.notification_outbox(created_at)
    WHERE status = 'sent' AND ticket_id IS NOT NULL AND receipt_checked_at IS NULL;

-- =============================================================================
-- 2. HARDENED CLAIM_NOTIFICATION_JOBS WITH BOUNDED LEASE RECOVERY
-- =============================================================================

-- Drop previous overloaded signatures cleanly
DROP FUNCTION IF EXISTS public.claim_notification_jobs(INT);

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(
    p_batch_size INT DEFAULT 20,
    p_lease_seconds INT DEFAULT 300
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
DECLARE
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_lease_expiry TIMESTAMPTZ := v_now + (COALESCE(p_lease_seconds, 300) * interval '1 second');
BEGIN
    RETURN QUERY
    WITH claimable AS (
        SELECT n.id
        FROM public.notification_outbox n
        WHERE (
            -- Case 1: Pending or failed jobs ready for retry
            (n.status IN ('pending', 'failed') AND n.next_retry_at <= v_now)
            OR
            -- Case 2: Crashed worker recovery - job stuck in processing past its lease
            (n.status = 'processing' AND n.lease_expires_at IS NOT NULL AND n.lease_expires_at < v_now)
        )
        AND n.attempt_count < 5
        ORDER BY n.created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.notification_outbox n
    SET status = 'processing',
        attempt_count = n.attempt_count + 1,
        lease_expires_at = v_lease_expiry
    FROM claimable
    WHERE n.id = claimable.id
    RETURNING n.id, n.order_id, n.user_id, n.event_type, n.target_token, n.title, n.body, n.data, n.attempt_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_jobs(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(INT, INT) TO service_role;


-- Overload for single-parameter invocation backward compatibility
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(
    p_batch_size INT
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
    RETURN QUERY SELECT * FROM public.claim_notification_jobs(p_batch_size, 300);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_jobs(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(INT) TO service_role;

-- =============================================================================
-- 3. HARDENED FINALIZE_NOTIFICATION_JOB WITH TICKET TRACKING
-- =============================================================================

DROP FUNCTION IF EXISTS public.finalize_notification_job(UUID, BOOLEAN, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.finalize_notification_job(
    p_job_id UUID,
    p_success BOOLEAN,
    p_error TEXT DEFAULT NULL,
    p_is_unregistered BOOLEAN DEFAULT FALSE,
    p_ticket_id TEXT DEFAULT NULL
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
            ticket_id = COALESCE(p_ticket_id, ticket_id),
            lease_expires_at = NULL,
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
                lease_expires_at = NULL,
                processed_at = timezone('utc'::text, now()),
                last_error = COALESCE(p_error, 'DeviceNotRegistered')
            WHERE id = p_job_id;
        ELSIF v_job.attempt_count >= 5 THEN
            -- Exceeded maximum retries
            UPDATE public.notification_outbox
            SET status = 'dead_letter',
                lease_expires_at = NULL,
                processed_at = timezone('utc'::text, now()),
                last_error = COALESCE(p_error, 'Max attempts reached')
            WHERE id = p_job_id;
        ELSE
            -- Exponential backoff: 15s * 2^(attempt-1)
            v_backoff_seconds := 15 * (1 << LEAST(v_job.attempt_count, 6));
            UPDATE public.notification_outbox
            SET status = 'failed',
                lease_expires_at = NULL,
                next_retry_at = timezone('utc'::text, now()) + (v_backoff_seconds * interval '1 second'),
                last_error = p_error
            WHERE id = p_job_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'job_id', p_job_id, 
        'status', CASE WHEN p_success THEN 'sent' ELSE 'failed' END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_notification_job(UUID, BOOLEAN, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_notification_job(UUID, BOOLEAN, TEXT, BOOLEAN, TEXT) TO service_role;

-- Backward-compatible 4-arg signature
CREATE OR REPLACE FUNCTION public.finalize_notification_job(
    p_job_id UUID,
    p_success BOOLEAN,
    p_error TEXT,
    p_is_unregistered BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.finalize_notification_job(p_job_id, p_success, p_error, p_is_unregistered, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_notification_job(UUID, BOOLEAN, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_notification_job(UUID, BOOLEAN, TEXT, BOOLEAN) TO service_role;

-- =============================================================================
-- 4. HARDENED TOKEN REGISTRATION: PREVENT ANONYMOUS HIJACKING
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
    v_caller_id UUID;
    v_clean_token TEXT;
    v_clean_platform TEXT;
    v_existing RECORD;
    v_record_id UUID;
BEGIN
    v_caller_id := auth.uid();
    v_clean_token := TRIM(p_push_token);
    v_clean_platform := LOWER(TRIM(p_platform));

    IF v_clean_token IS NULL OR v_clean_token = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Valid push token is required.');
    END IF;

    IF v_clean_platform NOT IN ('android', 'ios', 'web') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid platform specified.');
    END IF;

    -- Look up existing registration for this push token
    SELECT * INTO v_existing FROM public.device_push_tokens WHERE push_token = v_clean_token;

    IF FOUND THEN
        -- DEF-42-03 Defense: If token currently belongs to an authenticated user,
        -- an unauthenticated caller CANNOT disassociate it or overwrite ownership!
        IF v_existing.user_id IS NOT NULL AND v_caller_id IS NULL THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Unauthorized: Existing token belongs to an authenticated user.'
            );
        END IF;

        -- If caller is authenticated, update ownership to caller
        UPDATE public.device_push_tokens
        SET user_id = v_caller_id,
            guest_device_id = CASE WHEN v_caller_id IS NULL THEN TRIM(p_guest_device_id) ELSE NULL END,
            platform = v_clean_platform,
            is_active = true,
            updated_at = timezone('utc'::text, now()),
            revocation_reason = NULL
        WHERE id = v_existing.id
        RETURNING id INTO v_record_id;
    ELSE
        -- Insert fresh token registration
        INSERT INTO public.device_push_tokens (
            user_id,
            guest_device_id,
            push_token,
            platform,
            is_active,
            updated_at,
            revocation_reason
        ) VALUES (
            v_caller_id,
            CASE WHEN v_caller_id IS NULL THEN TRIM(p_guest_device_id) ELSE NULL END,
            v_clean_token,
            v_clean_platform,
            true,
            timezone('utc'::text, now()),
            NULL
        )
        RETURNING id INTO v_record_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'token_id', v_record_id,
        'user_id', v_caller_id,
        'platform', v_clean_platform,
        'is_active', true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_push_token(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device_push_token(TEXT, TEXT, TEXT) TO authenticated, anon, service_role;

-- =============================================================================
-- 5. HARDENED SEARCH PATH ON TAMPERING TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reject_order_event_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Order Event Integrity Violation: Historical order status events are strictly append-only and cannot be updated or deleted.';
END;
$$;

-- =============================================================================
-- 6. EXPO PUSH RECEIPT VERIFICATION RPCS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_unverified_notification_tickets(
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    ticket_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT n.id, n.ticket_id
    FROM public.notification_outbox n
    WHERE n.status = 'sent'
      AND n.ticket_id IS NOT NULL
      AND n.receipt_checked_at IS NULL
      AND n.created_at >= timezone('utc'::text, now()) - interval '24 hours'
    ORDER BY n.created_at ASC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_unverified_notification_tickets(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unverified_notification_tickets(INT) TO service_role;

CREATE OR REPLACE FUNCTION public.process_push_receipts(
    p_receipts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_key TEXT;
    v_item JSONB;
    v_status TEXT;
    v_error_msg TEXT;
    v_error_detail TEXT;
    v_job RECORD;
    v_processed INT := 0;
    v_unregistered_count INT := 0;
BEGIN
    IF p_receipts IS NULL OR jsonb_typeof(p_receipts) != 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid receipts payload: must be a JSON object mapping ticket_id to receipt object.');
    END IF;

    FOR v_key, v_item IN SELECT * FROM jsonb_each(p_receipts) LOOP
        SELECT * INTO v_job 
        FROM public.notification_outbox 
        WHERE ticket_id = v_key
        FOR UPDATE;

        IF FOUND THEN
            v_status := v_item->>'status';
            v_processed := v_processed + 1;

            IF v_status = 'ok' THEN
                UPDATE public.notification_outbox
                SET receipt_checked_at = timezone('utc'::text, now()),
                    receipt_status = 'ok'
                WHERE id = v_job.id;
            ELSE
                v_error_msg := COALESCE(v_item->>'message', 'Unknown push receipt error');
                v_error_detail := v_item->'details'->>'error';

                IF v_error_detail = 'DeviceNotRegistered' THEN
                    -- Deactivate device push token immediately
                    UPDATE public.device_push_tokens
                    SET is_active = false,
                        revocation_reason = 'DeviceNotRegistered',
                        updated_at = timezone('utc'::text, now())
                    WHERE push_token = v_job.target_token;

                    v_unregistered_count := v_unregistered_count + 1;

                    UPDATE public.notification_outbox
                    SET receipt_checked_at = timezone('utc'::text, now()),
                        receipt_status = 'error',
                        status = 'dead_letter',
                        last_error = 'DeviceNotRegistered'
                    WHERE id = v_job.id;
                ELSE
                    UPDATE public.notification_outbox
                    SET receipt_checked_at = timezone('utc'::text, now()),
                        receipt_status = 'error',
                        last_error = v_error_msg
                    WHERE id = v_job.id;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'processed', v_processed,
        'unregistered_deactivated', v_unregistered_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.process_push_receipts(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_push_receipts(JSONB) TO service_role;

COMMIT;

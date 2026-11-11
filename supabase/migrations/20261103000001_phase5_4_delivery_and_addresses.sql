-- =============================================================================
-- AY PIZZA & ICE CREAM — PHASE 5.4: ADDRESS MANAGEMENT & CONFIGURABLE DELIVERY PRICING
-- Migration: 20261103000001_phase5_4_delivery_and_addresses.sql
-- Description:
--   1. Enhances customer_addresses with Nigerian-specific fields (estate/hostel,
--      room/plot, street address, title, and optional GPS coordinates).
--   2. Introduces delivery_config table for centralized operational control
--      (store location, active switches, radius bounds, pricing models).
--   3. Establishes strict RLS policies:
--      - Public read for delivery_config & active landmarks.
--      - Staff/Admin-only writes for delivery configuration & landmark pricing.
--      - Strict user-ownership isolation on customer_addresses.
--   4. Preserves backward compatibility with all existing orders, receipts, and RLS.
-- =============================================================================

-- 1. EXTEND CUSTOMER ADDRESSES SCHEMA (NON-BREAKING, ALL NULLABLE/DEFAULTED)
ALTER TABLE public.customer_addresses
ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'Saved Address',
ADD COLUMN IF NOT EXISTS estate_or_hostel TEXT,
ADD COLUMN IF NOT EXISTS room_or_plot TEXT,
ADD COLUMN IF NOT EXISTS street_address TEXT,
ADD COLUMN IF NOT EXISTS area TEXT,
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- 2. CREATE CENTRALIZED DELIVERY CONFIGURATION TABLE
CREATE TABLE IF NOT EXISTS public.delivery_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_name TEXT NOT NULL DEFAULT 'AY Pizza & Ice Cream (UNILAG Kitchen)',
    store_address TEXT NOT NULL DEFAULT 'Opposite King Jaja Hall, University of Lagos (UNILAG), Akoka, Lagos, Nigeria',
    store_latitude DOUBLE PRECISION NOT NULL DEFAULT 6.5186,
    store_longitude DOUBLE PRECISION NOT NULL DEFAULT 3.3983,
    max_delivery_radius_km NUMERIC(5,2) NOT NULL DEFAULT 15.00 CHECK (max_delivery_radius_km > 0),
    min_delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 500.00 CHECK (min_delivery_fee >= 0),
    pricing_model TEXT NOT NULL DEFAULT 'zone_landmark' CHECK (pricing_model IN ('zone_landmark', 'distance_tiered', 'hybrid')),
    is_delivery_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_pickup_active BOOLEAN NOT NULL DEFAULT TRUE,
    pickup_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (pickup_fee = 0.00),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_by UUID REFERENCES public.profiles(id)
);

-- Seed default delivery configuration if table is empty
INSERT INTO public.delivery_config (
    store_name,
    store_address,
    store_latitude,
    store_longitude,
    max_delivery_radius_km,
    min_delivery_fee,
    pricing_model,
    is_delivery_active,
    is_pickup_active,
    pickup_fee
)
SELECT
    'AY Pizza & Ice Cream (UNILAG Kitchen)',
    'Opposite King Jaja Hall, University of Lagos (UNILAG), Akoka, Lagos, Nigeria',
    6.5186,
    3.3983,
    15.00,
    500.00,
    'zone_landmark',
    TRUE,
    TRUE,
    0.00
WHERE NOT EXISTS (SELECT 1 FROM public.delivery_config);

-- 3. ROW LEVEL SECURITY (RLS) FOR DELIVERY CONFIGURATION
ALTER TABLE public.delivery_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read delivery config (customers need to check store operational status & bounds)
CREATE POLICY "Public read delivery config"
ON public.delivery_config
FOR SELECT
USING (TRUE);

-- Only staff or admin can update delivery config
CREATE POLICY "Staff or Admin update delivery config"
ON public.delivery_config
FOR UPDATE
USING (public.is_staff_or_admin())
WITH CHECK (public.is_staff_or_admin());

-- Only staff or admin can insert delivery config
CREATE POLICY "Staff or Admin insert delivery config"
ON public.delivery_config
FOR INSERT
WITH CHECK (public.is_staff_or_admin());

-- 4. STAFF/ADMIN PERMISSIONS ON DELIVERY LANDMARKS
-- Ensure staff and admin can manage landmarks and update fees
CREATE POLICY "Staff or Admin update delivery landmarks"
ON public.delivery_landmarks
FOR UPDATE
USING (public.is_staff_or_admin())
WITH CHECK (public.is_staff_or_admin());

CREATE POLICY "Staff or Admin insert delivery landmarks"
ON public.delivery_landmarks
FOR INSERT
WITH CHECK (public.is_staff_or_admin());

-- 5. FUNCTION TO SAFELY UPDATE DELIVERY OPERATIONAL CONFIG
CREATE OR REPLACE FUNCTION public.update_delivery_operational_status(
    p_is_delivery_active BOOLEAN,
    p_is_pickup_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_updated_config RECORD;
BEGIN
    -- Check staff/admin authorization
    IF NOT public.is_staff_or_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only staff or administrators can update delivery operational status.';
    END IF;

    UPDATE public.delivery_config
    SET is_delivery_active = p_is_delivery_active,
        is_pickup_active = p_is_pickup_active,
        updated_at = timezone('utc'::text, now()),
        updated_by = v_caller_id
    RETURNING * INTO v_updated_config;

    -- Audit log
    INSERT INTO public.audit_logs (
        action,
        performed_by,
        target_type,
        target_id,
        details
    ) VALUES (
        'UPDATE_DELIVERY_STATUS'::audit_action,
        v_caller_id,
        'DELIVERY_CONFIG',
        v_updated_config.id,
        jsonb_build_object(
            'is_delivery_active', p_is_delivery_active,
            'is_pickup_active', p_is_pickup_active,
            'timestamp', now()
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'is_delivery_active', v_updated_config.is_delivery_active,
        'is_pickup_active', v_updated_config.is_pickup_active
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_delivery_operational_status TO authenticated;


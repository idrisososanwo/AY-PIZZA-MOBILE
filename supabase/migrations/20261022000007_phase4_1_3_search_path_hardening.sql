-- =============================================================================
-- AY PIZZA POSTGRESQL SCHEMA MIGRATION
-- Migration: 20261022000007_phase4_1_3_search_path_hardening.sql
-- Description: Phase 4.1.3 DEF-01 Security Hardening:
--   1. Explicitly sets search_path = public, pg_temp on SECURITY DEFINER RPCs:
--      - public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status)
--      - public.get_kds_orders(public.order_status[])
--   2. Ensures public schema creation privileges are revoked from PUBLIC (CWE-426 defense-in-depth).
--   3. Preserves existing function OIDs, grants, and execution permissions.
-- =============================================================================

-- 1. HARDEN SECURITY DEFINER SEARCH PATH
ALTER FUNCTION public.transition_order_status(
    UUID, 
    public.order_status, 
    TEXT, 
    TEXT, 
    public.order_status
) SET search_path = public, pg_temp;

ALTER FUNCTION public.get_kds_orders(
    public.order_status[]
) SET search_path = public, pg_temp;

-- 2. ENSURE UNTRUSTED USERS CANNOT CREATE OBJECTS IN PUBLIC SCHEMA
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 3. RE-VERIFY AND AFFIRM RESTRICTED EXECUTE GRANTS
REVOKE ALL ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, public.order_status, TEXT, TEXT, public.order_status) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_kds_orders(public.order_status[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kds_orders(public.order_status[]) TO authenticated, service_role;

-- =============================================================================
-- AY PIZZA STAGING DATABASE SECURITY & RBAC VERIFICATION SUITE
-- Script: scripts/verify-staging-database.sql
-- Purpose: Real PostgreSQL/Supabase verification across all user roles:
--          ANONYMOUS, CUSTOMER, RIDER, KITCHEN, COUNTER, MANAGER, ADMIN
-- Instructions: Run in Supabase SQL Editor or via psql on staging database.
-- =============================================================================

DO $$
DECLARE
    v_test_count INT := 0;
    v_pass_count INT := 0;
    v_fail_count INT := 0;

    v_customer_id UUID := gen_random_uuid();
    v_other_customer_id UUID := gen_random_uuid();
    v_rider_id UUID := gen_random_uuid();
    v_kitchen_id UUID := gen_random_uuid();
    v_counter_id UUID := gen_random_uuid();
    v_manager_id UUID := gen_random_uuid();
    v_admin_id UUID := gen_random_uuid();

    v_order_pickup_id UUID := gen_random_uuid();
    v_order_delivery_id UUID := gen_random_uuid();
    v_res JSONB;
    v_order_rec RECORD;
    v_func_rec RECORD;
BEGIN
    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'AY PIZZA: RUNNING REAL DATABASE ADVERSARIAL VERIFICATION';
    RAISE NOTICE '=======================================================';

    -- 1. SETUP TEST PROFILES
    INSERT INTO public.profiles (id, phone, full_name, role) VALUES
        (v_customer_id, '+2348000000001', 'Test Customer', 'customer'),
        (v_other_customer_id, '+2348000000002', 'Other Customer', 'customer'),
        (v_rider_id, '+2348000000003', 'Dispatch Rider', 'rider'),
        (v_kitchen_id, '+2348000000004', 'Chef Kitchen', 'kitchen'),
        (v_counter_id, '+2348000000005', 'Cashier Counter', 'counter'),
        (v_manager_id, '+2348000000006', 'Store Manager', 'manager'),
        (v_admin_id, '+2348000000007', 'Super Admin', 'admin')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

    -- 2. SETUP TEST ORDERS (CONFIRMED & PAID)
    INSERT INTO public.orders (
        id, order_number, customer_id, fulfillment_type, status,
        subtotal, delivery_fee, total, total_in_kobo, refund_status, version
    ) VALUES
        (v_order_pickup_id, 'AYP-STG-PICKUP', v_customer_id, 'pickup', 'CONFIRMED', 12000, 0, 12000, 1200000, 'NOT_APPLICABLE', 1),
        (v_order_delivery_id, 'AYP-STG-DELIV', v_customer_id, 'delivery', 'CONFIRMED', 12000, 1000, 13000, 1300000, 'NOT_APPLICABLE', 1)
    ON CONFLICT (id) DO UPDATE SET status = 'CONFIRMED', refund_status = 'NOT_APPLICABLE', version = 1;

    -- =========================================================================
    -- TEST 1: SECURITY DEFINER search_path Inspection
    -- =========================================================================
    v_test_count := v_test_count + 1;
    SELECT proconfig INTO v_func_rec
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'transition_order_status';

    IF v_func_rec.proconfig::text LIKE '%search_path=public, pg_temp%' THEN
        RAISE NOTICE 'TEST 1 PASSED: transition_order_status() enforces safe search_path (public, pg_temp)';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TEST 1 FAILED: transition_order_status() missing search_path setting: %', v_func_rec.proconfig;
        v_fail_count := v_fail_count + 1;
    END IF;

    -- =========================================================================
    -- TEST 2: Anonymous Caller Rejection
    -- =========================================================================
    v_test_count := v_test_count + 1;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', 'anon', true);

    v_res := public.transition_order_status(v_order_pickup_id, 'ACCEPTED');
    IF (v_res->>'code') = 'UNAUTHENTICATED' THEN
        RAISE NOTICE 'TEST 2 PASSED: Anonymous caller rejected with UNAUTHENTICATED';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TEST 2 FAILED: Anonymous caller was not rejected correctly: %', v_res;
        v_fail_count := v_fail_count + 1;
    END IF;

    -- =========================================================================
    -- TEST 3: Customer Operational Calling Rejection
    -- =========================================================================
    v_test_count := v_test_count + 1;
    PERFORM set_config('request.jwt.claim.sub', v_customer_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_res := public.transition_order_status(v_order_pickup_id, 'ACCEPTED');
    IF (v_res->>'code') = 'FORBIDDEN' THEN
        RAISE NOTICE 'TEST 3 PASSED: Customer caller rejected with FORBIDDEN';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TEST 3 FAILED: Customer caller was not rejected: %', v_res;
        v_fail_count := v_fail_count + 1;
    END IF;

    -- =========================================================================
    -- TEST 4: Rider Operational Calling Rejection
    -- =========================================================================
    v_test_count := v_test_count + 1;
    PERFORM set_config('request.jwt.claim.sub', v_rider_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_res := public.transition_order_status(v_order_pickup_id, 'ACCEPTED');
    IF (v_res->>'code') = 'FORBIDDEN' THEN
        RAISE NOTICE 'TEST 4 PASSED: Rider caller rejected with FORBIDDEN';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TEST 4 FAILED: Rider caller was not rejected: %', v_res;
        v_fail_count := v_fail_count + 1;
    END IF;

    -- =========================================================================
    -- TEST 5: Kitchen Staff Cannot Cancel Orders
    -- =========================================================================
    v_test_count := v_test_count + 1;
    PERFORM set_config('request.jwt.claim.sub', v_kitchen_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_res := public.transition_order_status(v_order_pickup_id, 'CANCELLED', 'Out of dough');
    IF (v_res->>'code') = 'ROLE_UNAUTHORIZED' THEN
        RAISE NOTICE 'TEST 5 PASSED: Kitchen staff prohibited from cancelling orders';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TEST 5 FAILED: Kitchen cancellation was not blocked: %', v_res;
        v_fail_count := v_fail_count + 1;
    END IF;

    -- =========================================================================
    -- TEST 6: Kitchen Staff Accepts Order and Starts Preparation
    -- =========================================================================
    v_test_count := v_test_count + 1;
    v_res := public.transition_order_status(v_order_pickup_id, 'ACCEPTED');
    IF (v_res->>'success')::boolean = true AND (v_res->>'new_status') = 'ACCEPTED' THEN
        v_res := public.transition_order_status(v_order_pickup_id, 'PREPARING');
        IF (v_res->>'success')::boolean = true AND (v_res->>'new_status') = 'PREPARING' THEN
            RAISE NOTICE 'TEST 6 PASSED: Kitchen staff successfully accepted and started preparation';
            v_pass_count := v_pass_count + 1;
        ELSE
            RAISE WARNING 'TEST 6 FAILED on PREPARING: %', v_res;
            v_fail_count := v_fail_count + 1;
        END IF;
    ELSE
        RAISE WARNING 'TEST 6 FAILED on ACCEPTED: %', v_res;
        v_fail_count := v_fail_count + 1;
    END IF;

    -- =========================================================================
    -- TEST 7: Counter Staff Cannot Start Preparation (Baking)
    -- =========================================================================
    v_test_count := v_test_count + 1;
    PERFORM set_config('request.jwt.claim.sub', v_counter_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    -- Accept delivery order with counter staff
    PERFORM public.transition_order_status(v_order_delivery_id, 'ACCEPTED');

    -- Attempt to start preparation with counter staff -> MUST FAIL
    v_res := public.transition_order_status(v_order_delivery_id, 'PREPARING');
    IF (v_res->>'code') = 'ROLE_UNAUTHORIZED' THEN
        RAISE NOTICE 'TEST 7 PASSED: Counter staff prohibited from starting kitchen preparation';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TEST 7 FAILED: Counter staff preparation was not blocked: %', v_res;
        v_fail_count := v_fail_count + 1;
    END IF;

    -- =========================================================================
    -- TEST 8: Pickup Order Cannot Transition to IN_TRANSIT
    -- =========================================================================
    v_test_count := v_test_count + 1;
    -- Move pickup order to READY_FOR_PICKUP via kitchen
    PERFORM set_config('request.jwt.claim.sub', v_kitchen_id::text, true);
    PERFORM public.transition_order_status(v_order_pickup_id, 'READY_FOR_PICKUP');

    -- Attempt to transition pickup order to IN_TRANSIT via counter staff -> MUST FAIL
    PERFORM set_config('request.jwt.claim.sub', v_counter_id::text, true);
    v_res := public.transition_order_status(v_order_pickup_id, 'IN_TRANSIT');
    IF (v_res->>'code') = 'INVALID_TRANSITION' THEN
        RAISE NOTICE 'TEST 8 PASSED: Pickup order strictly prevented from entering IN_TRANSIT';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TEST 8 FAILED: Pickup order entered IN_TRANSIT: %', v_res;
        v_fail_count := v_fail_count + 1;
    END IF;

    -- =========================================================================
    -- TEST 9: Delivery Order Cannot Skip IN_TRANSIT to DELIVERED
    -- =========================================================================
    v_test_count := v_test_count + 1;
    -- Kitchen prepares and boxes delivery order
    PERFORM set_config('request.jwt.claim.sub', v_kitchen_id::text, true);
    PERFORM public.transition_order_status(v_order_delivery_id, 'PREPARING');
    PERFORM public.transition_order_status(v_order_delivery_id, 'READY_FOR_PICKUP');

    -- Attempt to jump straight from READY_FOR_PICKUP to DELIVERED -> MUST FAIL
    PERFORM set_config('request.jwt.claim.sub', v_counter_id::text, true);
    v_res := public.transition_order_status(v_order_delivery_id, 'DELIVERED');
    IF (v_res->>'code') = 'INVALID_TRANSITION' THEN
        RAISE NOTICE 'TEST 9 PASSED: Delivery order prevented from skipping IN_TRANSIT';
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TEST 9 FAILED: Delivery order skipped IN_TRANSIT: %', v_res;
        v_fail_count := v_fail_count + 1;
    END IF;

    -- =========================================================================
    -- TEST 10: Paid Order Cancellation Marks REFUND_REQUIRED
    -- =========================================================================
    v_test_count := v_test_count + 1;
    PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, true);
    v_res := public.transition_order_status(v_order_delivery_id, 'CANCELLED', 'Customer requested cancellation due to hostel delay');

    SELECT status, refund_status, version INTO v_order_rec
    FROM public.orders WHERE id = v_order_delivery_id;

    IF v_order_rec.status = 'CANCELLED' AND v_order_rec.refund_status = 'REFUND_REQUIRED' THEN
        RAISE NOTICE 'TEST 10 PASSED: Paid cancellation marked REFUND_REQUIRED (Version: %)', v_order_rec.version;
        v_pass_count := v_pass_count + 1;
    ELSE
        RAISE WARNING 'TEST 10 FAILED: Refund status not marked REFUND_REQUIRED: %', v_order_rec;
        v_fail_count := v_fail_count + 1;
    END IF;

    -- CLEANUP
    DELETE FROM public.orders WHERE id IN (v_order_pickup_id, v_order_delivery_id);
    DELETE FROM public.profiles WHERE id IN (
        v_customer_id, v_other_customer_id, v_rider_id, v_kitchen_id,
        v_counter_id, v_manager_id, v_admin_id
    );

    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'VERIFICATION COMPLETE: % Tests, % Passed, % Failed', v_test_count, v_pass_count, v_fail_count;
    RAISE NOTICE '=======================================================';

    IF v_fail_count > 0 THEN
        RAISE EXCEPTION 'Staging verification failed with % failures', v_fail_count;
    END IF;
END $$;

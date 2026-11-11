-- =============================================================================
-- AY PIZZA — STAGING SETTLEMENT COMPREHENSIVE VERIFICATION
-- Target: Staging (gmtlwewpblnnkzuwfcib)
-- Phase: 6.0.6.8
-- Description: Creates unique dynamic test fixtures and executes all 6 required
-- payment settlement scenarios, returning a structured JSON result set.
-- =============================================================================

DO $$
DECLARE
    v_run_suffix TEXT := to_char(now(), 'YYYYMMDD_HH24MISS') || '_' || substr(md5(random()::text), 1, 6);
    v_cust_id UUID;
    v_order1_id UUID := gen_random_uuid();
    v_order2_id UUID := gen_random_uuid();
    v_order_cancelled_id UUID := gen_random_uuid();
    
    v_ref1 TEXT;
    v_ref2 TEXT;
    v_ref_dup TEXT;
    v_ref_canc TEXT;

    v_res1 JSONB;
    v_res2 JSONB;
    v_res3 JSONB;
    v_res4 JSONB;
    v_res5 JSONB;
    v_res6 JSONB;

    v_order1_after RECORD;
    v_order2_after RECORD;
    v_order_canc_after RECORD;
    v_tx1 RECORD;
    v_tx_dup RECORD;
    v_tx_canc RECORD;
BEGIN
    v_ref1 := 'ref_stg_' || v_run_suffix || '_01';
    v_ref2 := 'ref_stg_' || v_run_suffix || '_02';
    v_ref_dup := 'ref_stg_' || v_run_suffix || '_01_dup';
    v_ref_canc := 'ref_stg_' || v_run_suffix || '_canc';

    RAISE NOTICE 'Starting Phase 6.0.6.8 Staging Verification with Run Suffix: %', v_run_suffix;

    -- 1. Use existing customer profile
    SELECT id INTO v_cust_id FROM public.profiles WHERE role = 'customer' LIMIT 1;
    IF v_cust_id IS NULL THEN
        RAISE EXCEPTION 'No customer profile found in public.profiles';
    END IF;

    -- 2. Create test orders with unique order numbers, idempotency keys, and UUIDs
    -- Order 1: 5,500 NGN = 550,000 kobo (PENDING_PAYMENT)
    INSERT INTO public.orders (id, order_number, customer_id, fulfillment_type, subtotal, delivery_fee, total, status, idempotency_key)
    VALUES (v_order1_id, 'ORD-STG-' || v_run_suffix || '-1', v_cust_id, 'pickup', 5500.00, 0, 5500.00, 'PENDING_PAYMENT', 'idemp_' || v_run_suffix || '_1');

    -- Order 2: 7,200 NGN = 720,000 kobo (PENDING_PAYMENT)
    INSERT INTO public.orders (id, order_number, customer_id, fulfillment_type, subtotal, delivery_fee, total, status, idempotency_key)
    VALUES (v_order2_id, 'ORD-STG-' || v_run_suffix || '-2', v_cust_id, 'pickup', 7200.00, 0, 7200.00, 'PENDING_PAYMENT', 'idemp_' || v_run_suffix || '_2');

    -- Order 3 (Cancelled): 4,000 NGN = 400,000 kobo (CANCELLED)
    INSERT INTO public.orders (id, order_number, customer_id, fulfillment_type, subtotal, delivery_fee, total, status, idempotency_key)
    VALUES (v_order_cancelled_id, 'ORD-STG-' || v_run_suffix || '-3', v_cust_id, 'pickup', 4000.00, 0, 4000.00, 'CANCELLED', 'idemp_' || v_run_suffix || '_3');

    -- -------------------------------------------------------------------------
    -- TEST 1: Initial Settlement (PENDING_PAYMENT -> CONFIRMED)
    -- -------------------------------------------------------------------------
    v_res1 := public.settle_order_payment(
        p_order_id := v_order1_id,
        p_reference := v_ref1,
        p_gateway := 'paystack',
        p_amount_in_kobo := 550000,
        p_channel := 'card',
        p_metadata := jsonb_build_object('run_suffix', v_run_suffix, 'test', 'initial_settlement')
    );

    SELECT * INTO v_order1_after FROM public.orders WHERE id = v_order1_id;
    SELECT * INTO v_tx1 FROM public.payment_transactions WHERE reference = v_ref1;

    IF (v_res1->>'success')::boolean != true OR v_order1_after.status != 'CONFIRMED' OR v_tx1.status != 'success' THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Expected success=true, status=CONFIRMED. Got: %', v_res1;
    END IF;
    RAISE NOTICE 'TEST 1 PASSED: Initial Settlement confirmed. Order status: %, Tx status: %', v_order1_after.status, v_tx1.status;

    -- -------------------------------------------------------------------------
    -- TEST 2: Idempotent Retry (Same order, same reference repeated)
    -- -------------------------------------------------------------------------
    v_res2 := public.settle_order_payment(
        p_order_id := v_order1_id,
        p_reference := v_ref1,
        p_gateway := 'paystack',
        p_amount_in_kobo := 550000,
        p_channel := 'card',
        p_metadata := jsonb_build_object('run_suffix', v_run_suffix, 'test', 'idempotent_retry')
    );

    IF (v_res2->>'success')::boolean != true OR (v_res2->>'already_settled')::boolean != true THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Expected success=true, already_settled=true. Got: %', v_res2;
    END IF;
    RAISE NOTICE 'TEST 2 PASSED: Idempotent repeat accepted. Response: %', v_res2;

    -- -------------------------------------------------------------------------
    -- TEST 3: Cross-Order Reference Collision (Order 2 trying to use v_ref1)
    -- -------------------------------------------------------------------------
    v_res3 := public.settle_order_payment(
        p_order_id := v_order2_id,
        p_reference := v_ref1,
        p_gateway := 'paystack',
        p_amount_in_kobo := 720000,
        p_channel := 'card',
        p_metadata := jsonb_build_object('run_suffix', v_run_suffix, 'test', 'cross_order_collision')
    );

    SELECT * INTO v_order2_after FROM public.orders WHERE id = v_order2_id;

    IF (v_res3->>'success')::boolean != false OR v_order2_after.status != 'PENDING_PAYMENT' THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Expected cross-order collision rejection. Got: %', v_res3;
    END IF;
    RAISE NOTICE 'TEST 3 PASSED: Cross-order collision rejected. Error: %', v_res3->>'error';

    -- -------------------------------------------------------------------------
    -- TEST 4: Duplicate Payment on Already Settled Order (Order 1 with v_ref_dup)
    -- -------------------------------------------------------------------------
    v_res4 := public.settle_order_payment(
        p_order_id := v_order1_id,
        p_reference := v_ref_dup,
        p_gateway := 'paystack',
        p_amount_in_kobo := 550000,
        p_channel := 'ussd',
        p_metadata := jsonb_build_object('run_suffix', v_run_suffix, 'test', 'duplicate_payment')
    );

    SELECT * INTO v_tx_dup FROM public.payment_transactions WHERE reference = v_ref_dup;

    IF (v_res4->>'success')::boolean != true OR (v_res4->>'duplicate_payment')::boolean != true OR v_tx_dup.status != 'duplicate_success_needs_refund' THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Expected duplicate_payment=true, tx status=duplicate_success_needs_refund. Got: %, Tx: %', v_res4, v_tx_dup.status;
    END IF;
    RAISE NOTICE 'TEST 4 PASSED: Duplicate payment detected and recorded for refund reconciliation. Response: %', v_res4;

    -- -------------------------------------------------------------------------
    -- TEST 5: Payment Attempt on Cancelled Order (Order 3)
    -- -------------------------------------------------------------------------
    v_res5 := public.settle_order_payment(
        p_order_id := v_order_cancelled_id,
        p_reference := v_ref_canc,
        p_gateway := 'paystack',
        p_amount_in_kobo := 400000,
        p_channel := 'card',
        p_metadata := jsonb_build_object('run_suffix', v_run_suffix, 'test', 'cancelled_order')
    );

    SELECT * INTO v_order_canc_after FROM public.orders WHERE id = v_order_cancelled_id;
    SELECT * INTO v_tx_canc FROM public.payment_transactions WHERE reference = v_ref_canc;

    IF (v_res5->>'success')::boolean != false OR v_order_canc_after.status != 'CANCELLED' OR v_tx_canc.status != 'paid_after_cancellation' THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Expected success=false, order CANCELLED, tx paid_after_cancellation. Got: %, Tx: %', v_res5, v_tx_canc.status;
    END IF;
    RAISE NOTICE 'TEST 5 PASSED: Payment on cancelled order flagged for refund. Error: %, Tx status: %', v_res5->>'error', v_tx_canc.status;

    -- -------------------------------------------------------------------------
    -- TEST 6: Amount Mismatch Rejection on Order 2
    -- -------------------------------------------------------------------------
    v_res6 := public.settle_order_payment(
        p_order_id := v_order2_id,
        p_reference := v_ref2,
        p_gateway := 'paystack',
        p_amount_in_kobo := 999999, -- Expected 720000
        p_channel := 'card',
        p_metadata := jsonb_build_object('run_suffix', v_run_suffix, 'test', 'amount_mismatch')
    );

    IF (v_res6->>'success')::boolean != false OR (v_res6->>'error') NOT LIKE 'Payment amount mismatch%' THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Expected amount mismatch rejection. Got: %', v_res6;
    END IF;
    RAISE NOTICE 'TEST 6 PASSED: Amount mismatch rejected. Error: %', v_res6->>'error';

    RAISE NOTICE '=============================================================';
    RAISE NOTICE 'ALL 6 CORE SETTLEMENT SCENARIOS PASSED WITH FULL INTEGRITY!';
    RAISE NOTICE 'Run Suffix: % | Order 1: % | Order 2: % | Cancelled Order: %', v_run_suffix, v_order1_id, v_order2_id, v_order_cancelled_id;
    RAISE NOTICE '=============================================================';
END $$;

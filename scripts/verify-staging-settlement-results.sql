-- =============================================================================
-- AY PIZZA — DETAILED RESULTS EXTRACTION FOR 6 CORE SETTLEMENT SCENARIOS
-- =============================================================================

CREATE TEMP TABLE IF NOT EXISTS test_results (
    scenario_num INT,
    scenario_name TEXT,
    success BOOLEAN,
    order_status TEXT,
    tx_status TEXT,
    error_message TEXT,
    full_response JSONB
);

TRUNCATE TABLE test_results;

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

    -- Fetch customer
    SELECT id INTO v_cust_id FROM public.profiles WHERE role = 'customer' LIMIT 1;

    -- Create test orders
    INSERT INTO public.orders (id, order_number, customer_id, fulfillment_type, subtotal, delivery_fee, total, status, idempotency_key)
    VALUES (v_order1_id, 'ORD-STG-' || v_run_suffix || '-1', v_cust_id, 'pickup', 5500.00, 0, 5500.00, 'PENDING_PAYMENT', 'idemp_' || v_run_suffix || '_1');

    INSERT INTO public.orders (id, order_number, customer_id, fulfillment_type, subtotal, delivery_fee, total, status, idempotency_key)
    VALUES (v_order2_id, 'ORD-STG-' || v_run_suffix || '-2', v_cust_id, 'pickup', 7200.00, 0, 7200.00, 'PENDING_PAYMENT', 'idemp_' || v_run_suffix || '_2');

    INSERT INTO public.orders (id, order_number, customer_id, fulfillment_type, subtotal, delivery_fee, total, status, idempotency_key)
    VALUES (v_order_cancelled_id, 'ORD-STG-' || v_run_suffix || '-3', v_cust_id, 'pickup', 4000.00, 0, 4000.00, 'CANCELLED', 'idemp_' || v_run_suffix || '_3');

    -- TEST 1: Initial Settlement
    v_res1 := public.settle_order_payment(v_order1_id, v_ref1, 'paystack', 550000, 'card', jsonb_build_object('run', v_run_suffix));
    SELECT * INTO v_order1_after FROM public.orders WHERE id = v_order1_id;
    SELECT * INTO v_tx1 FROM public.payment_transactions WHERE reference = v_ref1;
    INSERT INTO test_results VALUES (1, 'Initial Settlement', (v_res1->>'success')::boolean, v_order1_after.status::text, v_tx1.status::text, v_res1->>'error', v_res1);

    -- TEST 2: Idempotent Retry
    v_res2 := public.settle_order_payment(v_order1_id, v_ref1, 'paystack', 550000, 'card', jsonb_build_object('run', v_run_suffix));
    INSERT INTO test_results VALUES (2, 'Idempotent Retry', (v_res2->>'success')::boolean, (v_res2->>'status')::text, NULL, v_res2->>'error', v_res2);

    -- TEST 3: Cross-Order Collision
    v_res3 := public.settle_order_payment(v_order2_id, v_ref1, 'paystack', 720000, 'card', jsonb_build_object('run', v_run_suffix));
    SELECT * INTO v_order2_after FROM public.orders WHERE id = v_order2_id;
    INSERT INTO test_results VALUES (3, 'Cross-Order Collision', (v_res3->>'success')::boolean, v_order2_after.status::text, NULL, v_res3->>'error', v_res3);

    -- TEST 4: Duplicate Payment
    v_res4 := public.settle_order_payment(v_order1_id, v_ref_dup, 'paystack', 550000, 'ussd', jsonb_build_object('run', v_run_suffix));
    SELECT * INTO v_tx_dup FROM public.payment_transactions WHERE reference = v_ref_dup;
    INSERT INTO test_results VALUES (4, 'Duplicate Payment', (v_res4->>'success')::boolean, (v_res4->>'status')::text, v_tx_dup.status::text, v_res4->>'error', v_res4);

    -- TEST 5: Cancelled Order Payment
    v_res5 := public.settle_order_payment(v_order_cancelled_id, v_ref_canc, 'paystack', 400000, 'card', jsonb_build_object('run', v_run_suffix));
    SELECT * INTO v_order_canc_after FROM public.orders WHERE id = v_order_cancelled_id;
    SELECT * INTO v_tx_canc FROM public.payment_transactions WHERE reference = v_ref_canc;
    INSERT INTO test_results VALUES (5, 'Cancelled Order', (v_res5->>'success')::boolean, v_order_canc_after.status::text, v_tx_canc.status::text, v_res5->>'error', v_res5);

    -- TEST 6: Amount Mismatch
    v_res6 := public.settle_order_payment(v_order2_id, v_ref2, 'paystack', 999999, 'card', jsonb_build_object('run', v_run_suffix));
    INSERT INTO test_results VALUES (6, 'Amount Mismatch', (v_res6->>'success')::boolean, NULL, NULL, v_res6->>'error', v_res6);
END $$;

SELECT scenario_num, scenario_name, success, order_status, tx_status, error_message, full_response 
FROM test_results 
ORDER BY scenario_num;


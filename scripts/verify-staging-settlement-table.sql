-- =============================================================================
-- AY PIZZA — DETAILED TABLE OUTPUT FOR 6 CORE SETTLEMENT SCENARIOS
-- =============================================================================

WITH test_run AS (
    SELECT 
        to_char(now(), 'YYYYMMDD_HH24MISS') || '_' || substr(md5(random()::text), 1, 6) AS run_suffix,
        gen_random_uuid() AS order1_id,
        gen_random_uuid() AS order2_id,
        gen_random_uuid() AS order_canc_id,
        (SELECT id FROM public.profiles WHERE role = 'customer' LIMIT 1) AS cust_id
),
inserted_orders AS (
    INSERT INTO public.orders (id, order_number, customer_id, fulfillment_type, subtotal, delivery_fee, total, status, idempotency_key)
    SELECT 
        t.order1_id, 'ORD-STG-' || t.run_suffix || '-1', t.cust_id, 'pickup'::fulfillment_type, 5500.00, 0, 5500.00, 'PENDING_PAYMENT'::order_status, 'idemp_' || t.run_suffix || '_1'
    FROM test_run t
    UNION ALL
    SELECT 
        t.order2_id, 'ORD-STG-' || t.run_suffix || '-2', t.cust_id, 'pickup'::fulfillment_type, 7200.00, 0, 7200.00, 'PENDING_PAYMENT'::order_status, 'idemp_' || t.run_suffix || '_2'
    FROM test_run t
    UNION ALL
    SELECT 
        t.order_canc_id, 'ORD-STG-' || t.run_suffix || '-3', t.cust_id, 'pickup'::fulfillment_type, 4000.00, 0, 4000.00, 'CANCELLED'::order_status, 'idemp_' || t.run_suffix || '_3'
    FROM test_run t
    RETURNING id, order_number, status, total
)
SELECT 
    '1. Initial Settlement' AS scenario,
    public.settle_order_payment(t.order1_id, 'ref_' || t.run_suffix || '_01', 'paystack', 550000, 'card', '{"test":1}'::jsonb) AS result
FROM test_run t
UNION ALL
SELECT 
    '2. Idempotent Retry',
    public.settle_order_payment(t.order1_id, 'ref_' || t.run_suffix || '_01', 'paystack', 550000, 'card', '{"test":2}'::jsonb)
FROM test_run t
UNION ALL
SELECT 
    '3. Cross-Order Collision',
    public.settle_order_payment(t.order2_id, 'ref_' || t.run_suffix || '_01', 'paystack', 720000, 'card', '{"test":3}'::jsonb)
FROM test_run t
UNION ALL
SELECT 
    '4. Duplicate Payment',
    public.settle_order_payment(t.order1_id, 'ref_' || t.run_suffix || '_dup', 'paystack', 550000, 'card', '{"test":4}'::jsonb)
FROM test_run t
UNION ALL
SELECT 
    '5. Cancelled Order',
    public.settle_order_payment(t.order_canc_id, 'ref_' || t.run_suffix || '_canc', 'paystack', 400000, 'card', '{"test":5}'::jsonb)
FROM test_run t
UNION ALL
SELECT 
    '6. Amount Mismatch',
    public.settle_order_payment(t.order2_id, 'ref_' || t.run_suffix || '_02', 'paystack', 111111, 'card', '{"test":6}'::jsonb)
FROM test_run t;

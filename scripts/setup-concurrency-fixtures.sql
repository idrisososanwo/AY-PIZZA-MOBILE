-- =============================================================================
-- AY PIZZA — SETUP FIXTURES FOR DUAL-CONNECTION CONCURRENCY TEST
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.temp_concurrency_run (
    run_id TEXT PRIMARY KEY,
    order_a_id UUID NOT NULL,
    order_b_id UUID NOT NULL,
    ref TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Clean up any runs older than 1 hour
DELETE FROM public.temp_concurrency_run WHERE created_at < now() - INTERVAL '1 hour';

DO $$
DECLARE
    v_run_id TEXT := 'concur_' || to_char(now(), 'YYYYMMDD_HH24MISS') || '_' || substr(md5(random()::text), 1, 6);
    v_cust_id UUID;
    v_order_a_id UUID := gen_random_uuid();
    v_order_b_id UUID := gen_random_uuid();
    v_ref TEXT;
BEGIN
    v_ref := 'ref_' || v_run_id;

    SELECT id INTO v_cust_id FROM public.profiles WHERE role = 'customer' LIMIT 1;

    INSERT INTO public.orders (id, order_number, customer_id, fulfillment_type, subtotal, delivery_fee, total, status, idempotency_key)
    VALUES 
        (v_order_a_id, 'ORD-CONCUR-A-' || v_run_id, v_cust_id, 'pickup', 5000.00, 0, 5000.00, 'PENDING_PAYMENT', 'idemp_a_' || v_run_id),
        (v_order_b_id, 'ORD-CONCUR-B-' || v_run_id, v_cust_id, 'pickup', 5000.00, 0, 5000.00, 'PENDING_PAYMENT', 'idemp_b_' || v_run_id);

    INSERT INTO public.temp_concurrency_run (run_id, order_a_id, order_b_id, ref)
    VALUES (v_run_id, v_order_a_id, v_order_b_id, v_ref);
END $$;

SELECT run_id, order_a_id, order_b_id, ref 
FROM public.temp_concurrency_run 
ORDER BY created_at DESC 
LIMIT 1;


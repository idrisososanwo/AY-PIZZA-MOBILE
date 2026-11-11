-- Insert order for edge function simulation test
DO $$
DECLARE
    v_cust_id UUID;
BEGIN
    SELECT id INTO v_cust_id FROM public.profiles WHERE role = 'customer' LIMIT 1;
    INSERT INTO public.orders (
        id, order_number, customer_id, fulfillment_type, subtotal, delivery_fee, total, status, idempotency_key, receipt_token_hash
    ) VALUES (
        'c0000000-1111-4000-8000-123456789abc'::uuid, 
        'ORD-SIM-TEST-001', 
        v_cust_id, 
        'pickup', 
        3500.00, 
        0, 
        3500.00, 
        'PENDING_PAYMENT', 
        'idemp_sim_test_001', 
        'e1427edf18253a4e9d51de54b5ff8e3257912fc1d2009b1ba45a88601f14ab63'
    )
    ON CONFLICT (id) DO UPDATE
    SET status = 'PENDING_PAYMENT',
        payment_reference = NULL,
        receipt_token_hash = EXCLUDED.receipt_token_hash;
END $$;

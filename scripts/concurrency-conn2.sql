-- Connection 2: Attempts settlement for Order B with the SAME reference while Connection 1 holds the advisory lock
SELECT 
    clock_timestamp() AS conn2_start_time,
    public.settle_order_payment(
        p_order_id := '889bd8a7-c011-4627-8ea9-7b055dedacf0',
        p_reference := 'ref_concur_20261110_180047_b01c3a',
        p_gateway := 'paystack',
        p_amount_in_kobo := 500000,
        p_channel := 'card',
        p_metadata := '{"client": 2}'::jsonb
    ) AS conn2_result,
    clock_timestamp() AS conn2_end_time;


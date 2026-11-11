-- Connection 1: Starts settlement for Order A, holds advisory lock during pg_sleep(5), then commits
BEGIN;

SELECT public.settle_order_payment(
    p_order_id := '1164ff66-7b2b-4ac1-9a6d-fb41533204cf',
    p_reference := 'ref_concur_20261110_180047_b01c3a',
    p_gateway := 'paystack',
    p_amount_in_kobo := 500000,
    p_channel := 'card',
    p_metadata := '{"client": 1}'::jsonb
) AS conn1_result;

SELECT pg_sleep(5);

COMMIT;

SELECT 'CONNECTION_1_COMMITTED' AS status, clock_timestamp() as conn1_committed_at;


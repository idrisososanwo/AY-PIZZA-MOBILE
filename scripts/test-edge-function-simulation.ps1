# =============================================================================
# AY PIZZA — END-TO-END STAGING EDGE FUNCTION SIMULATION TEST
# =============================================================================
$runId = "sim_" + (Get-Date -Format "yyyyMMdd_HHmmss")
$orderId = [guid]::NewGuid().ToString()
$receiptToken = "simtoken_" + (Get-Date -Format "yyyyMMddHHmmss") + "_1234567890abcdef"

# Compute SHA-256 hash in PowerShell
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($receiptToken.Trim())
$hashBytes = $sha256.ComputeHash($bytes)
$tokenHash = [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()

Write-Host "Creating Staging Order Fixture..."
Write-Host "Order ID: $orderId"
Write-Host "Receipt Token: $receiptToken"
Write-Host "Token Hash: $tokenHash"

# Insert order via SQL
$sql = @"
DO `$\$
DECLARE
    v_cust_id UUID;
BEGIN
    SELECT id INTO v_cust_id FROM public.profiles WHERE role = 'customer' LIMIT 1;
    INSERT INTO public.orders (
        id, order_number, customer_id, fulfillment_type, subtotal, delivery_fee, total, status, idempotency_key, receipt_token_hash
    ) VALUES (
        '$orderId'::uuid, 'ORD-$runId', v_cust_id, 'pickup', 3500.00, 0, 3500.00, 'PENDING_PAYMENT', 'idemp_$runId', '$tokenHash'
    );
END `$\$;
"@

$sqlFile = "scripts/temp-sim-order.sql"
Set-Content -Path $sqlFile -Value $sql
npx supabase db query --linked --file $sqlFile
Remove-Item $sqlFile -Force

Write-Host "`nInvoking Deployed Edge Function: paystack-simulate..."
$bodyJson = @{
    orderId = $orderId
    receiptToken = $receiptToken
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
}

$simResponse = Invoke-RestMethod -Uri "https://gmtlwewpblnnkzuwfcib.supabase.co/functions/v1/paystack-simulate" -Method Post -Headers $headers -Body $bodyJson
Write-Host "First Simulation Response:"
$simResponse | ConvertTo-Json -Depth 5 | Write-Host

Write-Host "`nTesting Idempotent Re-simulation Call..."
$retryResponse = Invoke-RestMethod -Uri "https://gmtlwewpblnnkzuwfcib.supabase.co/functions/v1/paystack-simulate" -Method Post -Headers $headers -Body $bodyJson
Write-Host "Idempotent Retry Response:"
$retryResponse | ConvertTo-Json -Depth 5 | Write-Host

Write-Host "`nQuerying Final Database State..."
npx supabase db query --linked "SELECT order_number, status, payment_reference FROM public.orders WHERE id = '$orderId';"
npx supabase db query --linked "SELECT gateway, status, amount, amount_in_kobo, channel, metadata FROM public.payment_transactions WHERE order_id = '$orderId';"


# =============================================================================
# AY PIZZA — DUAL-CONNECTION CONCURRENCY RUNNER
# =============================================================================
$workspace = "c:\Users\Ososanwo Idris\Documents\AY PIZZA MOBILE"
Set-Location $workspace

Write-Host "Launching Connection 1..."
$startTime1 = Get-Date
$job1 = Start-Job -ScriptBlock {
    param($ws)
    Set-Location $ws
    npx supabase db query --linked --file "scripts/concurrency-conn1.sql"
} -ArgumentList $workspace

Start-Sleep -Milliseconds 1200

Write-Host "Launching Connection 2 (concurrent attempt with same reference)..."
$startTime2 = Get-Date
$job2 = Start-Job -ScriptBlock {
    param($ws)
    Set-Location $ws
    npx supabase db query --linked --file "scripts/concurrency-conn2.sql"
} -ArgumentList $workspace

Write-Host "Waiting for both connections to complete..."
Wait-Job $job1, $job2

$endTime = Get-Date
$out1 = Receive-Job $job1
$out2 = Receive-Job $job2
Remove-Job $job1, $job2

Write-Host "`n================== CONNECTION 1 OUTPUT =================="
$out1 | Out-String | Write-Host

Write-Host "================== CONNECTION 2 OUTPUT =================="
$out2 | Out-String | Write-Host
Write-Host "Total Wall-Clock Duration: $(($endTime - $startTime1).TotalSeconds) seconds"


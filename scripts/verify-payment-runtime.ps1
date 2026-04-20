$ErrorActionPreference = "Stop"

function Import-DotEnvFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }

        $parts = $line.Split("=", 2)
        $name = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")

        if ($name -and -not [Environment]::GetEnvironmentVariable($name)) {
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

function Get-EnvAny {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }
    return $null
}

function Add-Result {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Evidence
    )

    $script:results.Add([pscustomobject]@{
        Name = $Name
        Status = $Status
        Evidence = $Evidence
    }) | Out-Null

    if ($Status -eq "FAIL") {
        $script:failed = $true
    }
}

function Invoke-JsonPost {
    param(
        [string]$BaseUrl,
        [string]$Path,
        [hashtable]$Body,
        [hashtable]$Headers = @{}
    )

    $uri = "$BaseUrl$Path"
    $jsonBody = $Body | ConvertTo-Json -Compress -Depth 10
    $requestHeaders = @{
        "Content-Type" = "application/json"
        "Accept" = "application/json"
    }

    foreach ($key in $Headers.Keys) {
        $requestHeaders[$key] = $Headers[$key]
    }

    try {
        $bodyObject = Invoke-RestMethod -Method Post -Uri $uri -Headers $requestHeaders -Body $jsonBody -TimeoutSec 60
        return @{
            StatusCode = 200
            Body = $bodyObject
            Error = $null
        }
    }
    catch {
        $statusCode = 0
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }

        $errorBody = $_.ErrorDetails.Message
        return @{
            StatusCode = $statusCode
            Body = $errorBody
            Error = $_.Exception.Message
        }
    }
}

Import-DotEnvFile -Path ".env.local"

$baseUrl = Get-EnvAny -Names @("APP_BASE_URL", "VITE_APP_URL")
if ([string]::IsNullOrWhiteSpace($baseUrl)) {
    throw "Missing APP_BASE_URL or VITE_APP_URL. Use a staging/deployed URL, not the Supabase URL."
}
$baseUrl = $baseUrl.TrimEnd("/")

$sharedSecretCandidates = @()
foreach ($secretName in @("PAYMENT_WEBHOOK_SECRET", "TAP_WEBHOOK_SECRET", "CRON_SECRET")) {
    $secretValue = Get-EnvAny -Names @($secretName)
    if (-not [string]::IsNullOrWhiteSpace($secretValue) -and $sharedSecretCandidates -notcontains $secretValue) {
        $sharedSecretCandidates += $secretValue
    }
}
$testUserJwt = Get-EnvAny -Names @("PAYMENT_TEST_USER_JWT")
$capturedTapId = Get-EnvAny -Names @("PAYMENT_CAPTURED_TAP_ID")
$failedTapId = Get-EnvAny -Names @("PAYMENT_FAILED_TAP_ID")
$mismatchedAmountTapId = Get-EnvAny -Names @("PAYMENT_MISMATCHED_AMOUNT_TAP_ID")
$requireFullRuntime = (Get-EnvAny -Names @("PAYMENT_REQUIRE_FULL_RUNTIME")) -eq "1"

$script:results = New-Object System.Collections.Generic.List[object]
$script:failed = $false

Write-Host "Payment runtime verification"
Write-Host "Base URL: $baseUrl"
Write-Host ""

$unauthorized = Invoke-JsonPost -BaseUrl $baseUrl -Path "/api/verify-payment" -Body @{ tap_id = "chg_phase3_unauthorized" }
if ($unauthorized.StatusCode -eq 401) {
    Add-Result "unauthorized callback attempt" "PASS" "verify-payment returned 401 without Authorization"
}
else {
    Add-Result "unauthorized callback attempt" "FAIL" "Expected 401, got $($unauthorized.StatusCode): $($unauthorized.Body)"
}

function Invoke-WebhookPost {
    param(
        [string]$BaseUrl,
        [hashtable]$Body
    )

    if ($sharedSecretCandidates.Count -eq 0) {
        return Invoke-JsonPost -BaseUrl $BaseUrl -Path "/api/payment-webhook" -Body $Body
    }

    $last = $null
    foreach ($secret in $sharedSecretCandidates) {
        $headers = @{ "x-mutqan-webhook-secret" = $secret }
        $result = Invoke-JsonPost -BaseUrl $BaseUrl -Path "/api/payment-webhook" -Body $Body -Headers $headers
        if ($result.StatusCode -ne 401) {
            return $result
        }
        $last = $result
    }

    return $last
}

$invalidWebhook = Invoke-WebhookPost -BaseUrl $baseUrl -Body @{ id = "invalid id with spaces" }
if ($invalidWebhook.StatusCode -eq 400) {
    Add-Result "invalid webhook payload" "PASS" "payment-webhook rejected malformed charge id"
}
else {
    Add-Result "invalid webhook payload" "FAIL" "Expected 400, got $($invalidWebhook.StatusCode): $($invalidWebhook.Body)"
}

if ($capturedTapId -and $testUserJwt) {
    $authHeaders = @{ Authorization = "Bearer $testUserJwt" }

    $success = Invoke-JsonPost -BaseUrl $baseUrl -Path "/api/verify-payment" -Body @{ tap_id = $capturedTapId } -Headers $authHeaders
    if ($success.StatusCode -eq 200 -and $success.Body.success -eq $true) {
        Add-Result "captured payment activation" "PASS" "verify-payment returned success=true invoice=$($success.Body.invoice_number)"
    }
    else {
        Add-Result "captured payment activation" "FAIL" "Expected 200 success=true, got $($success.StatusCode): $($success.Body | ConvertTo-Json -Compress -Depth 5)"
    }

    $duplicate = Invoke-JsonPost -BaseUrl $baseUrl -Path "/api/verify-payment" -Body @{ tap_id = $capturedTapId } -Headers $authHeaders
    if ($duplicate.StatusCode -eq 200 -and $duplicate.Body.success -eq $true) {
        Add-Result "duplicate callback idempotency" "PASS" "second verify-payment call returned success=true invoice_id=$($duplicate.Body.invoice_id)"
    }
    else {
        Add-Result "duplicate callback idempotency" "FAIL" "Expected duplicate callback success, got $($duplicate.StatusCode): $($duplicate.Body | ConvertTo-Json -Compress -Depth 5)"
    }

    $duplicateWebhook = Invoke-WebhookPost -BaseUrl $baseUrl -Body @{ id = $capturedTapId }
    if ($duplicateWebhook.StatusCode -eq 200 -and ($duplicateWebhook.Body.reason -eq "already_processed" -or $duplicateWebhook.Body.processed -eq $true)) {
        Add-Result "duplicate webhook idempotency" "PASS" "payment-webhook handled duplicate captured charge"
    }
    else {
        Add-Result "duplicate webhook idempotency" "FAIL" "Expected already_processed or processed=true, got $($duplicateWebhook.StatusCode): $($duplicateWebhook.Body | ConvertTo-Json -Compress -Depth 5)"
    }
}
else {
    $message = "Skipped: set PAYMENT_CAPTURED_TAP_ID and PAYMENT_TEST_USER_JWT to validate Tap sandbox success/idempotency."
    Add-Result "captured payment activation" ($(if ($requireFullRuntime) { "FAIL" } else { "SKIP" })) $message
    Add-Result "duplicate callback/webhook idempotency" ($(if ($requireFullRuntime) { "FAIL" } else { "SKIP" })) $message
}

if ($failedTapId -and $testUserJwt) {
    $failedPayment = Invoke-JsonPost -BaseUrl $baseUrl -Path "/api/verify-payment" -Body @{ tap_id = $failedTapId } -Headers @{ Authorization = "Bearer $testUserJwt" }
    if ($failedPayment.StatusCode -eq 200 -and $failedPayment.Body.success -eq $false) {
        Add-Result "failed payment state" "PASS" "verify-payment returned success=false status=$($failedPayment.Body.status)"
    }
    else {
        Add-Result "failed payment state" "FAIL" "Expected 200 success=false, got $($failedPayment.StatusCode): $($failedPayment.Body | ConvertTo-Json -Compress -Depth 5)"
    }
}
else {
    Add-Result "failed payment state" ($(if ($requireFullRuntime) { "FAIL" } else { "SKIP" })) "Skipped: set PAYMENT_FAILED_TAP_ID and PAYMENT_TEST_USER_JWT."
}

if ($mismatchedAmountTapId -and $testUserJwt) {
    $mismatch = Invoke-JsonPost -BaseUrl $baseUrl -Path "/api/verify-payment" -Body @{ tap_id = $mismatchedAmountTapId } -Headers @{ Authorization = "Bearer $testUserJwt" }
    if ($mismatch.StatusCode -eq 400) {
        Add-Result "mismatched amount rejection" "PASS" "verify-payment rejected mismatched amount"
    }
    else {
        Add-Result "mismatched amount rejection" "FAIL" "Expected 400, got $($mismatch.StatusCode): $($mismatch.Body | ConvertTo-Json -Compress -Depth 5)"
    }
}
else {
    Add-Result "mismatched amount rejection" ($(if ($requireFullRuntime) { "FAIL" } else { "SKIP" })) "Skipped: set PAYMENT_MISMATCHED_AMOUNT_TAP_ID and PAYMENT_TEST_USER_JWT."
}

$results | Format-Table -AutoSize

if ($script:failed) {
    Write-Error "Payment runtime verification did not fully pass."
    exit 1
}

Write-Host "Payment runtime verification completed."

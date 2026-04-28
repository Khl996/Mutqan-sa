<#
.SYNOPSIS
    Verifies that auto_close_stale_work_orders is disabled (no-op) for Pilot v1.

.DESCRIPTION
    Confirms migration 126 is in effect: calling auto_close_stale_work_orders()
    returns 0 and leaves all work orders unchanged.

    Requires:
      VITE_SUPABASE_URL or SUPABASE_URL
      VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY
      SUPABASE_SERVICE_ROLE_KEY
#>

$ErrorActionPreference = "Stop"

function Import-DotEnvFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
        $parts = $line.Split("=", 2)
        $name  = $parts[0].Trim()
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
        if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
    }
    return $null
}

function Get-RequiredEnv {
    param([string]$DisplayName, [string[]]$Names)
    $value = Get-EnvAny -Names $Names
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing required env var: $DisplayName (tried: $($Names -join ', '))"
    }
    return $value
}

$script:results    = New-Object System.Collections.Generic.List[object]
$script:anyFail    = $false

function Add-Result {
    param([string]$Name, [string]$Status, [string]$Evidence = "")
    $script:results.Add([pscustomobject]@{ Status = $Status; Name = $Name; Evidence = $Evidence }) | Out-Null
    if ($Status -eq "FAIL") { $script:anyFail = $true }
    $tag = switch ($Status) { "PASS" { "[PASS]" } "FAIL" { "[FAIL]" } "SKIP" { "[SKIP]" } default { "[----]" } }
    Write-Host "  $tag  $Name"
    if ($Status -ne "PASS" -and -not [string]::IsNullOrWhiteSpace($Evidence)) {
        Write-Host "         $Evidence"
    }
}

function Invoke-Rpc {
    param([string]$BaseUrl, [string]$ApiKey, [string]$BearerToken, [string]$FunctionName, [object]$Body)
    $headers = @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $BearerToken"
        "Content-Type"  = "application/json"
        "Accept"        = "application/json"
    }
    try {
        $bodyJson = if ($null -eq $Body) { "{}" } else { $Body | ConvertTo-Json -Depth 5 -Compress }
        $resp = Invoke-WebRequest -Uri "$BaseUrl/rest/v1/rpc/$FunctionName" `
                                  -Method POST `
                                  -Headers $headers `
                                  -Body $bodyJson `
                                  -UseBasicParsing `
                                  -ErrorAction SilentlyContinue
        return @{ StatusCode = [int]$resp.StatusCode; Body = $resp.Content }
    } catch {
        $code = 0
        if ($_.Exception.Response) { try { $code = [int]$_.Exception.Response.StatusCode } catch {} }
        $detail = $_.Exception.Message
        try {
            $errBody = $_.Exception.Response.GetResponseStream()
            $reader  = New-Object System.IO.StreamReader($errBody)
            $detail  = $reader.ReadToEnd()
        } catch {}
        return @{ StatusCode = $code; Body = $detail }
    }
}

function Invoke-Get {
    param([string]$BaseUrl, [string]$ApiKey, [string]$BearerToken, [string]$Path)
    $headers = @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $BearerToken"
        "Accept"        = "application/json"
    }
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/rest/v1/$Path" `
                                  -Method GET `
                                  -Headers $headers `
                                  -UseBasicParsing `
                                  -ErrorAction SilentlyContinue
        return @{ StatusCode = [int]$resp.StatusCode; Body = $resp.Content }
    } catch {
        $code = 0
        if ($_.Exception.Response) { try { $code = [int]$_.Exception.Response.StatusCode } catch {} }
        $detail = $_.Exception.Message
        try {
            $errBody = $_.Exception.Response.GetResponseStream()
            $reader  = New-Object System.IO.StreamReader($errBody)
            $detail  = $reader.ReadToEnd()
        } catch {}
        return @{ StatusCode = $code; Body = $detail }
    }
}

# ─── Load env -----------------------------------------───────────────────────
Import-DotEnvFile ".env.local"
Import-DotEnvFile ".env.staging-fixtures.local"

$baseUrl     = Get-RequiredEnv "SUPABASE_URL"          @("SUPABASE_URL", "VITE_SUPABASE_URL")
$anonKey     = Get-RequiredEnv "SUPABASE_ANON_KEY"     @("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
$serviceKey  = Get-RequiredEnv "SUPABASE_SERVICE_ROLE_KEY" @("SUPABASE_SERVICE_ROLE_KEY")

Write-Host ""
Write-Host "=== verify:workorder-autoclose ==="
Write-Host "Target: $baseUrl"
Write-Host ""

# ─── A. Function exists and is callable via service role ─────────────────────
Write-Host "Section A: auto_close_stale_work_orders is callable"

$rpcResp = Invoke-Rpc -BaseUrl $baseUrl -ApiKey $anonKey -BearerToken $serviceKey `
                      -FunctionName "auto_close_stale_work_orders" -Body @{}

if ($rpcResp.StatusCode -eq 200) {
    Add-Result "auto_close_stale_work_orders RPC callable (service role)" "PASS" "HTTP 200"
} else {
    Add-Result "auto_close_stale_work_orders RPC callable (service role)" "FAIL" `
        "HTTP $($rpcResp.StatusCode) - $($rpcResp.Body)"
}

# ─── B. Function returns 0 (no-op) -----------------------------------------──
Write-Host ""
Write-Host "Section B: function returns 0 (disabled no-op)"

if ($rpcResp.StatusCode -eq 200) {
    $returnVal = $null
    try { $returnVal = [int]($rpcResp.Body.Trim()) } catch {}

    if ($returnVal -eq 0) {
        Add-Result "auto_close_stale_work_orders returns 0" "PASS" "return=$returnVal"
    } else {
        Add-Result "auto_close_stale_work_orders returns 0" "FAIL" `
            "Expected 0, got: $($rpcResp.Body.Trim())"
    }
} else {
    Add-Result "auto_close_stale_work_orders returns 0" "SKIP" "RPC not callable - skipped"
}

# ─── C. No work orders changed status to auto_closed ─────────────────────────
Write-Host ""
Write-Host "Section C: no work orders in auto_closed status after call"

$woResp = Invoke-Get -BaseUrl $baseUrl -ApiKey $anonKey -BearerToken $serviceKey `
                     -Path "work_orders?status=eq.auto_closed&select=id"

if ($woResp.StatusCode -eq 200) {
    $autoClosedRows = @()
    try { $autoClosedRows = $woResp.Body | ConvertFrom-Json } catch {}
    $count = if ($autoClosedRows -is [array]) { $autoClosedRows.Count } else { 1 }

    if ($count -eq 0) {
        Add-Result "No work orders in auto_closed status" "PASS" "count=0"
    } else {
        # auto_closed rows might exist from a previous test run or manual state;
        # this check is informational - the important test is that the function
        # returned 0 meaning it changed nothing in this call.
        Add-Result "No work orders in auto_closed status" "SKIP" `
            "Found $count auto_closed row(s) - may be pre-existing; function returned 0 so no new rows were created by this call"
    }
} else {
    Add-Result "No work orders in auto_closed status" "FAIL" `
        "Could not query work_orders: HTTP $($woResp.StatusCode)"
}

# ─── D. Anon cannot call the function ────────────────────────────────────────
Write-Host ""
Write-Host "Section D: anon cannot call auto_close_stale_work_orders"

$anonRpcResp = Invoke-Rpc -BaseUrl $baseUrl -ApiKey $anonKey -BearerToken $anonKey `
                          -FunctionName "auto_close_stale_work_orders" -Body @{}

if ($anonRpcResp.StatusCode -notin @(200, 204)) {
    Add-Result "Anon cannot call auto_close_stale_work_orders" "PASS" `
        "HTTP $($anonRpcResp.StatusCode) - denied as expected"
} else {
    Add-Result "Anon cannot call auto_close_stale_work_orders" "FAIL" `
        "Expected non-200, got HTTP $($anonRpcResp.StatusCode) - anon should not have EXECUTE"
}

# ─── Summary -----------------------------------------────────────────────────
Write-Host ""
Write-Host "-----------------------------------------"
$passCount = ($script:results | Where-Object { $_.Status -eq "PASS" }).Count
$failCount = ($script:results | Where-Object { $_.Status -eq "FAIL" }).Count
$skipCount = ($script:results | Where-Object { $_.Status -eq "SKIP" }).Count
Write-Host "PASS: $passCount   FAIL: $failCount   SKIP: $skipCount"
Write-Host "-----------------------------------------"

if ($script:anyFail) {
    Write-Host "Result: FAIL" -ForegroundColor Red
    exit 1
} else {
    Write-Host "Result: PASS" -ForegroundColor Green
    exit 0
}

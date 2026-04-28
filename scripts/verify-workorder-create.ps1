<#
.SYNOPSIS
    Verifies audited authenticated work-order creation through create_work_order.

.DESCRIPTION
    Requires prepared staging fixtures and these env vars:
      VITE_SUPABASE_URL or SUPABASE_URL
      VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY
      SUPABASE_SERVICE_ROLE_KEY
      RLS_TENANT_A_REPORTER_JWT
      RLS_TENANT_A_TECHNICIAN_JWT
      RLS_TENANT_B_USER_JWT

    Run:
      npm run prepare:staging-fixtures
      npm run verify:workorder-create
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

$script:results = New-Object System.Collections.Generic.List[object]
$script:anyFail = $false
$script:createdWorkOrderIds = New-Object System.Collections.Generic.List[string]

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
        $json = $Body | ConvertTo-Json -Depth 20
        $response = Invoke-RestMethod -Method Post -Uri "$BaseUrl/rest/v1/rpc/$FunctionName" -Headers $headers -Body $json -TimeoutSec 30
        return @{ Ok = $true; StatusCode = 200; Body = $response; Error = $null }
    } catch {
        $statusCode = 0
        $errorBody = $_.Exception.Message
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $bodyText = $reader.ReadToEnd()
                    if (-not [string]::IsNullOrWhiteSpace($bodyText)) { $errorBody = $bodyText }
                }
            } catch {
                $errorBody = $_.Exception.Message
            }
        }
        return @{ Ok = $false; StatusCode = $statusCode; Body = $null; Error = $errorBody }
    }
}

function Invoke-TableGet {
    param([string]$Uri, [string]$ApiKey, [string]$BearerToken)
    $headers = @{ "apikey" = $ApiKey; "Authorization" = "Bearer $BearerToken"; "Accept" = "application/json" }
    try {
        $body = Invoke-RestMethod -Method Get -Uri $Uri -Headers $headers -TimeoutSec 30
        return @{ Ok = $true; StatusCode = 200; Body = $body; Error = $null }
    } catch {
        $statusCode = 0
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $statusCode = [int]$_.Exception.Response.StatusCode }
        return @{ Ok = $false; StatusCode = $statusCode; Body = $null; Error = $_.Exception.Message }
    }
}

function Invoke-TablePost {
    param([string]$Uri, [string]$ApiKey, [string]$BearerToken, [object]$Body)
    $headers = @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $BearerToken"
        "Content-Type"  = "application/json"
        "Accept"        = "application/json"
        "Prefer"        = "return=representation"
    }
    try {
        $json = $Body | ConvertTo-Json -Depth 20
        $response = Invoke-RestMethod -Method Post -Uri $Uri -Headers $headers -Body $json -TimeoutSec 30
        return @{ Ok = $true; StatusCode = 201; Body = $response; Error = $null }
    } catch {
        $statusCode = 0
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $statusCode = [int]$_.Exception.Response.StatusCode }
        return @{ Ok = $false; StatusCode = $statusCode; Body = $null; Error = $_.Exception.Message }
    }
}

function Invoke-TableDelete {
    param([string]$Uri, [string]$ApiKey)
    $headers = @{ "apikey" = $ApiKey; "Authorization" = "Bearer $ApiKey"; "Accept" = "application/json" }
    try {
        Invoke-RestMethod -Method Delete -Uri $Uri -Headers $headers -TimeoutSec 30 | Out-Null
    } catch {
        Write-Host "Cleanup warning: $($_.Exception.Message)"
    }
}

Import-DotEnvFile ".env.staging-fixtures.local"
Import-DotEnvFile ".env.local"

$supaUrl     = (Get-RequiredEnv "Supabase URL" @("VITE_SUPABASE_URL", "SUPABASE_URL")).TrimEnd("/")
$anonKey     = Get-RequiredEnv "Supabase anon key" @("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY")
$svcKey      = Get-RequiredEnv "Supabase service key" @("SUPABASE_SERVICE_ROLE_KEY")
$reporterJwt = Get-RequiredEnv "Tenant A reporter JWT" @("RLS_TENANT_A_REPORTER_JWT")
$techJwt     = Get-RequiredEnv "Tenant A technician JWT" @("RLS_TENANT_A_TECHNICIAN_JWT")

Write-Host "--- create_work_order audited creation ---------------------"

$assetA = Invoke-TableGet -Uri "$supaUrl/rest/v1/assets?code=eq.FX-A-AHU-01&select=id,tenant_id,building_id&limit=1" -ApiKey $svcKey -BearerToken $svcKey
$assetB = Invoke-TableGet -Uri "$supaUrl/rest/v1/assets?code=eq.FX-B-PUMP-01&select=id,tenant_id,building_id&limit=1" -ApiKey $svcKey -BearerToken $svcKey
if (-not $assetA.Ok -or -not $assetB.Ok -or $assetA.Body.Count -eq 0 -or $assetB.Body.Count -eq 0) {
    throw "Fixture assets not found. Run npm run prepare:staging-fixtures first."
}

$code = "FX-CREATE-" + (Get-Date -Format "yyMMddHHmmss")
$createBody = @{
    p_work_order = @{
        code        = $code
        title       = "Audited create RPC smoke test"
        description = "Created by verify-workorder-create.ps1"
        priority    = "medium"
        building_id = $assetA.Body[0].building_id
        asset_id    = $assetA.Body[0].id
        due_date    = (Get-Date).AddDays(2).ToString("o")
    }
}

$r1 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "create_work_order" -Body $createBody
if ($r1.Ok -and $r1.Body.id -and $r1.Body.status -eq "pending") {
    $script:createdWorkOrderIds.Add($r1.Body.id) | Out-Null
    Add-Result "allowed reporter can create pending work order" "PASS" "id=$($r1.Body.id), code=$($r1.Body.code)"
} else {
    Add-Result "allowed reporter can create pending work order" "FAIL" "HTTP $($r1.StatusCode): $($r1.Error)"
}

if ($r1.Ok -and $r1.Body.id) {
    $log = Invoke-TableGet -Uri "$supaUrl/rest/v1/operation_logs?work_order_id=eq.$($r1.Body.id)&type=eq.create&select=id,description,performed_by" -ApiKey $svcKey -BearerToken $svcKey
    if ($log.Ok -and $log.Body.Count -ge 1) {
        Add-Result "creation writes operation log" "PASS" "log_id=$($log.Body[0].id)"
    } else {
        Add-Result "creation writes operation log" "FAIL" "No create log found"
    }
}

$cross = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "create_work_order" -Body @{
    p_work_order = @{
        code     = "FX-CROSS-" + (Get-Date -Format "HHmmss")
        title    = "Cross tenant asset attempt"
        priority = "medium"
        asset_id = $assetB.Body[0].id
    }
}
if (-not $cross.Ok) {
    Add-Result "cross-tenant asset is denied" "PASS" "HTTP $($cross.StatusCode)"
} else {
    $script:createdWorkOrderIds.Add($cross.Body.id) | Out-Null
    Add-Result "cross-tenant asset is denied" "FAIL" "Unexpectedly created id=$($cross.Body.id)"
}

$danger = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "create_work_order" -Body @{
    p_work_order = @{
        code         = "FX-DANGER-" + (Get-Date -Format "HHmmss")
        title        = "Dangerous field attempt"
        status       = "completed"
        completed_at = (Get-Date).ToString("o")
    }
}
if (-not $danger.Ok) {
    Add-Result "dangerous creation fields are rejected" "PASS" "HTTP $($danger.StatusCode)"
} else {
    $script:createdWorkOrderIds.Add($danger.Body.id) | Out-Null
    Add-Result "dangerous creation fields are rejected" "FAIL" "Unexpectedly created id=$($danger.Body.id)"
}

$unauth = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "create_work_order" -Body @{
    p_work_order = @{
        code     = "FX-TECH-" + (Get-Date -Format "HHmmss")
        title    = "Technician create attempt"
        priority = "medium"
    }
}
if (-not $unauth.Ok) {
    Add-Result "unauthorized technician create is denied" "PASS" "HTTP $($unauth.StatusCode)"
} else {
    $script:createdWorkOrderIds.Add($unauth.Body.id) | Out-Null
    Add-Result "unauthorized technician create is denied" "FAIL" "Unexpectedly created id=$($unauth.Body.id)"
}

$directCode = "FX-DIRECT-" + (Get-Date -Format "HHmmss")
$direct = Invoke-TablePost -Uri "$supaUrl/rest/v1/work_orders" -ApiKey $anonKey -BearerToken $reporterJwt -Body @{
    tenant_id = $assetA.Body[0].tenant_id
    code      = $directCode
    title     = "Direct insert attempt"
    status    = "pending"
}

$directProbe = Invoke-TableGet `
    -Uri "$supaUrl/rest/v1/work_orders?tenant_id=eq.$($assetA.Body[0].tenant_id)&code=eq.$directCode&select=id,code" `
    -ApiKey $svcKey `
    -BearerToken $svcKey

if ($directProbe.Ok -and $directProbe.Body.Count -eq 0) {
    Add-Result "direct authenticated insert creates no row" "PASS" "HTTP $($direct.StatusCode), trusted read found no row"
} elseif ($directProbe.Ok -and $directProbe.Body.Count -gt 0) {
    foreach ($row in $directProbe.Body) {
        if ($row.id) { $script:createdWorkOrderIds.Add($row.id) | Out-Null }
    }
    Add-Result "direct authenticated insert creates no row" "FAIL" "Trusted read found inserted code=$directCode"
} else {
    if ($direct.Ok -and $direct.Body[0].id) {
        $script:createdWorkOrderIds.Add($direct.Body[0].id) | Out-Null
    }
    Add-Result "direct authenticated insert creates no row" "FAIL" "Could not verify trusted read after HTTP $($direct.StatusCode): $($directProbe.Error)"
}

if ($script:createdWorkOrderIds.Count -gt 0) {
    $ids = ($script:createdWorkOrderIds | ForEach-Object { '"' + $_ + '"' }) -join ","
    Invoke-TableDelete -Uri "$supaUrl/rest/v1/operation_logs?work_order_id=in.($ids)" -ApiKey $svcKey
    Invoke-TableDelete -Uri "$supaUrl/rest/v1/work_orders?id=in.($ids)" -ApiKey $svcKey
}

Write-Host ""
Write-Host "--- Summary ------------------------------------------------"
$script:results | Format-Table -AutoSize

if ($script:anyFail) {
    exit 1
}

exit 0

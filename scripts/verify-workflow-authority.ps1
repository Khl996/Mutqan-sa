<#
.SYNOPSIS
    Workflow authority smoke test -- verifies the work-order security model
    introduced by migrations 119, 120, and 121.

.DESCRIPTION
    Section A: Migration 120 BEFORE UPDATE trigger blocks direct sensitive-field changes.
    Section B: Direct metadata-only updates are not blocked.
    Section C: Unauthorized roles and cross-tenant actors are denied by all workflow RPCs.
    Section D: PM RPCs (wo_start / wo_complete) succeed for authorized actors and reject
               wrong-status calls. Operation log creation is verified after each RPC.
    Section E: create_operation_log (migration 119) is not directly callable by
               anon or authenticated roles.

    Required env vars (from .env.local and/or .env.staging-fixtures.local):
        VITE_SUPABASE_URL          (or SUPABASE_URL)
        VITE_SUPABASE_ANON_KEY     (or SUPABASE_ANON_KEY)
        SUPABASE_SERVICE_ROLE_KEY
        RLS_TECHNICIAN_ASSIGNED_WO_ID
        RLS_TECHNICIAN_UNASSIGNED_WO_ID
        RLS_TENANT_A_TECHNICIAN_JWT
        RLS_TENANT_A_REPORTER_JWT
        RLS_TENANT_B_USER_JWT

    The script CONSUMES the fixture work order (moves it to completed via wo_start +
    wo_complete). Re-run prepare:staging-fixtures before the next run:
        npm run prepare:staging-fixtures
#>

$ErrorActionPreference = "Stop"

# =============================================================================
# Helpers -- env
# =============================================================================

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

# =============================================================================
# Helpers -- result tracking
# =============================================================================

$script:results = New-Object System.Collections.Generic.List[object]
$script:anyFail = $false

function Add-Result {
    param([string]$Name, [string]$Status, [string]$Evidence = "")
    $script:results.Add([pscustomobject]@{
        Status   = $Status
        Name     = $Name
        Evidence = $Evidence
    }) | Out-Null
    if ($Status -eq "FAIL") { $script:anyFail = $true }
    $tag = switch ($Status) { "PASS" { "[PASS]" } "FAIL" { "[FAIL]" } "SKIP" { "[SKIP]" } default { "[----]" } }
    Write-Host "  $tag  $Name"
    if ($Status -ne "PASS" -and -not [string]::IsNullOrWhiteSpace($Evidence)) {
        Write-Host "         $Evidence"
    }
}

# =============================================================================
# Helpers -- JWT
# =============================================================================

function Test-JwtExpired {
    param([string]$Token)
    try {
        $raw = $Token.Split(".")[1]
        $rem = $raw.Length % 4
        if ($rem -ne 0) { $raw += "=" * (4 - $rem) }
        $raw  = $raw.Replace("-", "+").Replace("_", "/")
        $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($raw))
        $obj  = $json | ConvertFrom-Json
        return ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -ge $obj.exp)
    } catch {
        return $true
    }
}

# =============================================================================
# Helpers -- HTTP
# =============================================================================

function Invoke-TableGet {
    param([string]$Uri, [string]$ApiKey, [string]$BearerToken)
    $h = @{ "apikey" = $ApiKey; "Authorization" = "Bearer $BearerToken"; "Accept" = "application/json" }
    try {
        $body = Invoke-RestMethod -Method Get -Uri $Uri -Headers $h -TimeoutSec 30
        return @{ Ok = $true; StatusCode = 200; Body = $body; Error = $null }
    } catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $msg  = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        return @{ Ok = $false; StatusCode = $code; Body = $null; Error = $msg }
    }
}

function Invoke-TablePatch {
    param([string]$Uri, [string]$ApiKey, [string]$BearerToken, [hashtable]$Body)
    $h = @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $BearerToken"
        "Content-Type"  = "application/json"
        "Accept"        = "application/json"
    }
    try {
        Invoke-RestMethod -Method Patch -Uri $Uri -Headers $h -Body ($Body | ConvertTo-Json -Compress) -TimeoutSec 30 | Out-Null
        return @{ Ok = $true; StatusCode = 204; Body = $null; Error = $null }
    } catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $msg  = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        return @{ Ok = $false; StatusCode = $code; Body = $null; Error = $msg }
    }
}

function Invoke-Rpc {
    param([string]$BaseUrl, [string]$ApiKey, [string]$BearerToken, [string]$FunctionName, [hashtable]$Body)
    $uri = "$BaseUrl/rest/v1/rpc/$FunctionName"
    $h = @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $BearerToken"
        "Content-Type"  = "application/json"
        "Accept"        = "application/json"
    }
    try {
        $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $h -Body ($Body | ConvertTo-Json -Compress -Depth 5) -TimeoutSec 30
        return @{ Ok = $true; StatusCode = 200; Body = $resp; Error = $null }
    } catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $msg  = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        return @{ Ok = $false; StatusCode = $code; Body = $null; Error = $msg }
    }
}

function Get-OpLogCount {
    param([string]$WorkOrderId, [string]$BaseUrl, [string]$ApiKey, [string]$BearerToken)
    $uri = "$BaseUrl/rest/v1/operation_logs?work_order_id=eq.$WorkOrderId&select=id"
    $r   = Invoke-TableGet -Uri $uri -ApiKey $ApiKey -BearerToken $BearerToken
    if (-not $r.Ok) { return -1 }
    if ($null -eq $r.Body)           { return 0 }
    if ($r.Body -is [System.Array])  { return $r.Body.Count }
    return 1
}

function Cap {
    param([string]$Str, [int]$Max = 120)
    if ($null -eq $Str -or $Str.Length -eq 0) { return "" }
    if ($Str.Length -le $Max) { return $Str }
    return $Str.Substring(0, $Max) + "..."
}

# =============================================================================
# Load env
# =============================================================================

# Load fixture file first so its fresh JWTs take priority over any stale
# copies that may have been merged into .env.local via fixtures:merge-env.
Import-DotEnvFile -Path ".env.staging-fixtures.local"
Import-DotEnvFile -Path ".env.local"

$supaUrl       = (Get-RequiredEnv "Supabase URL"       @("SUPABASE_URL", "VITE_SUPABASE_URL")).TrimEnd("/")
$anonKey       = Get-RequiredEnv  "Supabase anon key"  @("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
$svcKey        = Get-RequiredEnv  "Service role key"   @("SUPABASE_SERVICE_ROLE_KEY")
$assignedWoId  = Get-RequiredEnv  "Assigned WO id"     @("RLS_TECHNICIAN_ASSIGNED_WO_ID")
$unassignedWoId = Get-RequiredEnv "Unassigned WO id"   @("RLS_TECHNICIAN_UNASSIGNED_WO_ID")
$techJwt       = Get-RequiredEnv  "Technician JWT"     @("RLS_TENANT_A_TECHNICIAN_JWT")
$reporterJwt   = Get-RequiredEnv  "Reporter JWT"       @("RLS_TENANT_A_REPORTER_JWT")
$tenantBJwt    = Get-RequiredEnv  "Tenant B JWT"       @("RLS_TENANT_B_USER_JWT")

Write-Host ""
Write-Host "=============================================================="
Write-Host "  Mutqan Workflow Authority Smoke Test"
Write-Host "  Validates migrations 119 (privilege revoke), 120 (trigger),"
Write-Host "  and 121 (hardened PM RPCs)"
Write-Host "=============================================================="
Write-Host "  Supabase : $supaUrl"
Write-Host "  Fixture WO (assigned)   : $assignedWoId"
Write-Host "  Fixture WO (unassigned) : $unassignedWoId"
Write-Host ""

# =============================================================================
# JWT freshness guard
# =============================================================================

Write-Host "--- JWT freshness -------------------------------------------"
$jwtChecks = @(
    @{ Name = "technician"; Token = $techJwt }
    @{ Name = "reporter";   Token = $reporterJwt }
    @{ Name = "tenant_b";   Token = $tenantBJwt }
)
$expiredAny = $false
foreach ($j in $jwtChecks) {
    if (Test-JwtExpired -Token $j.Token) {
        Write-Host "  [STALE]  $($j.Name) JWT is expired"
        $expiredAny = $true
    } else {
        Write-Host "  [fresh]  $($j.Name) JWT"
    }
}
if ($expiredAny) {
    Write-Host ""
    Write-Host "  One or more JWTs are expired. Re-run:"
    Write-Host "    npm run prepare:staging-fixtures"
    Write-Host "  then (optional merge into .env.local):"
    Write-Host "    npm run fixtures:merge-env"
    exit 1
}
Write-Host ""

# =============================================================================
# Read fixture WO state
# =============================================================================

$woUri    = "$supaUrl/rest/v1/work_orders?id=eq.$assignedWoId&select=id,status,title"
$woResult = Invoke-TableGet -Uri $woUri -ApiKey $svcKey -BearerToken $svcKey
if (-not $woResult.Ok) {
    Write-Error "Cannot read fixture work order $assignedWoId : $($woResult.Error)"
    exit 1
}
$wo       = if ($woResult.Body -is [System.Array]) { $woResult.Body[0] } else { $woResult.Body }
$woStatus = $wo.status
$woTitle  = $wo.title

Write-Host "  Fixture WO status : $woStatus"
Write-Host "  Fixture WO title  : $woTitle"
Write-Host ""

# =============================================================================
# A -- Direct sensitive-field update denial (migration 120 trigger)
# =============================================================================

Write-Host "--- A: Sensitive-field update denial (migration 120) ---------"

$woBase = "$supaUrl/rest/v1/work_orders?id=eq.$assignedWoId"

$sR = Invoke-TablePatch -Uri $woBase -ApiKey $svcKey -BearerToken $svcKey -Body @{ status = "completed" }
if (-not $sR.Ok -and $sR.StatusCode -in @(403, 500)) {
    $confirmMsg = if ($sR.Error -match "42501|workflow-sensitive|migration 120|Direct update") {
        "HTTP $($sR.StatusCode), migration-120 error message confirmed"
    } else {
        "HTTP $($sR.StatusCode) -- $(Cap $sR.Error)"
    }
    Add-Result "direct 'status' update blocked by trigger" "PASS" $confirmMsg
} elseif ($sR.Ok) {
    Add-Result "direct 'status' update blocked by trigger" "FAIL" "UPDATE succeeded -- trigger not firing"
} else {
    Add-Result "direct 'status' update blocked by trigger" "FAIL" "HTTP $($sR.StatusCode): $(Cap $sR.Error)"
}

$aR = Invoke-TablePatch -Uri $woBase -ApiKey $svcKey -BearerToken $svcKey -Body @{ assigned_to = "00000000-0000-0000-0000-000000000000" }
if (-not $aR.Ok -and $aR.StatusCode -in @(403, 500)) {
    Add-Result "direct 'assigned_to' update blocked by trigger" "PASS" "HTTP $($aR.StatusCode)"
} elseif ($aR.Ok) {
    Add-Result "direct 'assigned_to' update blocked by trigger" "FAIL" "UPDATE succeeded -- trigger not protecting assigned_to"
} else {
    Add-Result "direct 'assigned_to' update blocked by trigger" "FAIL" "HTTP $($aR.StatusCode): $(Cap $aR.Error)"
}

$wR = Invoke-TablePatch -Uri $woBase -ApiKey $svcKey -BearerToken $svcKey -Body @{ work_type = "corrective" }
if (-not $wR.Ok -and $wR.StatusCode -in @(403, 500)) {
    Add-Result "direct 'work_type' update blocked by trigger" "PASS" "HTTP $($wR.StatusCode)"
} elseif ($wR.Ok) {
    Add-Result "direct 'work_type' update blocked by trigger" "FAIL" "UPDATE succeeded -- trigger not protecting work_type"
} else {
    Add-Result "direct 'work_type' update blocked by trigger" "FAIL" "HTTP $($wR.StatusCode): $(Cap $wR.Error)"
}

# =============================================================================
# B -- Metadata-only update allowed (title is not in the sensitive-field list)
# =============================================================================

Write-Host ""
Write-Host "--- B: Metadata update allowed (not in sensitive list) -------"

$newTitle = "$woTitle [smoke]"
$mR = Invoke-TablePatch -Uri $woBase -ApiKey $svcKey -BearerToken $svcKey -Body @{ title = $newTitle }
if ($mR.Ok) {
    Add-Result "direct 'title' update succeeds (safe metadata field)" "PASS" ""
    $rR = Invoke-TablePatch -Uri $woBase -ApiKey $svcKey -BearerToken $svcKey -Body @{ title = $woTitle }
    if ($rR.Ok) {
        Add-Result "title restored to original value after smoke update" "PASS" ""
    } else {
        Add-Result "title restored to original value after smoke update" "FAIL" "HTTP $($rR.StatusCode): $(Cap $rR.Error)"
    }
} else {
    Add-Result "direct 'title' update succeeds (safe metadata field)" "FAIL" "HTTP $($mR.StatusCode): $(Cap $mR.Error)"
}

# =============================================================================
# C -- Unauthorized role and cross-tenant denial
# =============================================================================

Write-Host ""
Write-Host "--- C: Role and tenant denial (negative cases) --------------"

# Reporter blocked by start_work_order
$c1 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "start_work_order" -Body @{ p_work_order_id = $assignedWoId }
if (-not $c1.Ok) {
    Add-Result "reporter denied by start_work_order (role check)" "PASS" "HTTP $($c1.StatusCode)"
} else {
    Add-Result "reporter denied by start_work_order (role check)" "FAIL" "start_work_order succeeded for reporter"
}

# Tenant B actor blocked by start_work_order on Tenant A WO
$c2 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $tenantBJwt -FunctionName "start_work_order" -Body @{ p_work_order_id = $assignedWoId }
if (-not $c2.Ok) {
    Add-Result "tenant B actor denied by start_work_order (tenant isolation)" "PASS" "HTTP $($c2.StatusCode)"
} else {
    Add-Result "tenant B actor denied by start_work_order (tenant isolation)" "FAIL" "cross-tenant start_work_order succeeded"
}

# Reporter blocked by wo_start
$c3 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "wo_start" -Body @{ p_wo_id = $assignedWoId }
if (-not $c3.Ok) {
    Add-Result "reporter denied by wo_start (role check)" "PASS" "HTTP $($c3.StatusCode)"
} else {
    Add-Result "reporter denied by wo_start (role check)" "FAIL" "wo_start succeeded for reporter"
}

# Tenant B actor blocked by wo_start on Tenant A WO
$c4 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $tenantBJwt -FunctionName "wo_start" -Body @{ p_wo_id = $assignedWoId }
if (-not $c4.Ok) {
    Add-Result "tenant B actor denied by wo_start (tenant isolation)" "PASS" "HTTP $($c4.StatusCode)"
} else {
    Add-Result "tenant B actor denied by wo_start (tenant isolation)" "FAIL" "cross-tenant wo_start succeeded"
}

# Technician blocked by wo_start on WO assigned to a different actor
$c5 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "wo_start" -Body @{ p_wo_id = $unassignedWoId }
if (-not $c5.Ok) {
    Add-Result "technician denied by wo_start on WO assigned to another actor" "PASS" "HTTP $($c5.StatusCode)"
} else {
    Add-Result "technician denied by wo_start on WO assigned to another actor" "FAIL" "wo_start accepted unassigned WO for technician"
}

# Reporter blocked by wo_complete
$c6 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "wo_complete" -Body @{ p_wo_id = $assignedWoId; p_completion_notes = "unauthorized attempt" }
if (-not $c6.Ok) {
    Add-Result "reporter denied by wo_complete (role check)" "PASS" "HTTP $($c6.StatusCode)"
} else {
    Add-Result "reporter denied by wo_complete (role check)" "FAIL" "wo_complete succeeded for reporter"
}

# =============================================================================
# D -- PM workflow RPCs: wo_start / wo_complete (state-dependent)
# =============================================================================

Write-Host ""
Write-Host "--- D: PM workflow RPCs (wo_start / wo_complete) ------------"

if ($woStatus -in @("pending", "assigned")) {

    # -- wo_start positive --------------------------------------------------------------------------------------------------------
    $logsBefore = Get-OpLogCount -WorkOrderId $assignedWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey

    $d1 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "wo_start" -Body @{ p_wo_id = $assignedWoId }
    if ($d1.Ok -and $d1.Body.success -eq $true) {
        Add-Result "technician wo_start succeeds on $woStatus WO" "PASS" "work_order_id=$($d1.Body.work_order_id)"
    } else {
        Add-Result "technician wo_start succeeds on $woStatus WO" "FAIL" "HTTP $($d1.StatusCode): $(Cap $d1.Error)"
    }

    # -- operation log after wo_start ----------------------------------------------------------------------------------
    $logsAfterStart = Get-OpLogCount -WorkOrderId $assignedWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
    if ($logsAfterStart -gt $logsBefore) {
        Add-Result "wo_start wrote operation log" "PASS" "log count $logsBefore => $logsAfterStart"
    } else {
        Add-Result "wo_start wrote operation log" "FAIL" "log count unchanged at $logsAfterStart"
    }

    # -- wo_start wrong-status negative (WO now in_progress) ------------------------------------
    $d2 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "wo_start" -Body @{ p_wo_id = $assignedWoId }
    if (-not $d2.Ok) {
        Add-Result "wo_start rejected on in_progress WO (wrong status)" "PASS" "HTTP $($d2.StatusCode)"
    } else {
        Add-Result "wo_start rejected on in_progress WO (wrong status)" "FAIL" "wo_start accepted in_progress WO"
    }

    # -- wo_complete positive ----------------------------------------------------------------------------------------------------
    $logsBeforeComplete = Get-OpLogCount -WorkOrderId $assignedWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey

    $d3 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "wo_complete" -Body @{ p_wo_id = $assignedWoId; p_completion_notes = "Workflow authority smoke test" }
    if ($d3.Ok -and $d3.Body.success -eq $true) {
        Add-Result "technician wo_complete succeeds on in_progress WO" "PASS" "work_order_id=$($d3.Body.work_order_id)"
    } else {
        Add-Result "technician wo_complete succeeds on in_progress WO" "FAIL" "HTTP $($d3.StatusCode): $(Cap $d3.Error)"
    }

    # -- operation log after wo_complete ----------------------------------------------------------------------------
    $logsAfterComplete = Get-OpLogCount -WorkOrderId $assignedWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
    if ($logsAfterComplete -gt $logsBeforeComplete) {
        Add-Result "wo_complete wrote operation log" "PASS" "log count $logsBeforeComplete => $logsAfterComplete"
    } else {
        Add-Result "wo_complete wrote operation log" "FAIL" "log count unchanged at $logsAfterComplete"
    }

    # -- wo_complete wrong-status negative (WO now completed) ------------------------------------
    $d4 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "wo_complete" -Body @{ p_wo_id = $assignedWoId; p_completion_notes = "Should be rejected" }
    if (-not $d4.Ok) {
        Add-Result "wo_complete rejected on completed WO (wrong status)" "PASS" "HTTP $($d4.StatusCode)"
    } else {
        Add-Result "wo_complete rejected on completed WO (wrong status)" "FAIL" "wo_complete accepted already-completed WO"
    }

} elseif ($woStatus -eq "in_progress") {

    Add-Result "wo_start positive case (fixture already in_progress -- skipped)" "SKIP" "Re-run prepare:staging-fixtures to reset WO to assigned."

    # wo_complete is still runnable
    $logsBefore = Get-OpLogCount -WorkOrderId $assignedWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey

    $d3 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "wo_complete" -Body @{ p_wo_id = $assignedWoId; p_completion_notes = "Workflow authority smoke test" }
    if ($d3.Ok -and $d3.Body.success -eq $true) {
        Add-Result "technician wo_complete succeeds on in_progress WO" "PASS" "work_order_id=$($d3.Body.work_order_id)"
    } else {
        Add-Result "technician wo_complete succeeds on in_progress WO" "FAIL" "HTTP $($d3.StatusCode): $(Cap $d3.Error)"
    }

    $logsAfter = Get-OpLogCount -WorkOrderId $assignedWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
    if ($logsAfter -gt $logsBefore) {
        Add-Result "wo_complete wrote operation log" "PASS" "log count $logsBefore => $logsAfter"
    } else {
        Add-Result "wo_complete wrote operation log" "FAIL" "log count unchanged at $logsAfter"
    }

    $d4 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "wo_complete" -Body @{ p_wo_id = $assignedWoId; p_completion_notes = "Should be rejected" }
    if (-not $d4.Ok) {
        Add-Result "wo_complete rejected on completed WO (wrong status)" "PASS" "HTTP $($d4.StatusCode)"
    } else {
        Add-Result "wo_complete rejected on completed WO (wrong status)" "FAIL" "wo_complete accepted already-completed WO"
    }

} else {
    Add-Result "PM workflow RPCs (wo_start + wo_complete)" "SKIP" "Fixture WO is '$woStatus'. Re-run prepare:staging-fixtures to reset to assigned."
}

Write-Host ""
Write-Host "  NOTE: Fixture WO is likely now completed. Re-run prepare:staging-fixtures"
Write-Host "        before the next verify run or RLS isolation test."
Write-Host ""

# =============================================================================
# E -- create_operation_log direct-execute privilege (migration 119)
# =============================================================================

Write-Host "--- E: create_operation_log direct-execute privilege ---------"
# Migration 119 revokes EXECUTE from PUBLIC, anon, and authenticated.
# Calling via REST should return a non-200 (PostgREST returns 404 when the
# role cannot see the function).

$logBody = @{
    p_tenant_id     = "11111111-1111-4111-8111-111111111111"
    p_work_order_id = $assignedWoId
    p_type          = "maintenance"
    p_description   = "Smoke test -- should be denied"
    p_performed_by  = "00000000-0000-0000-0000-000000000000"
    p_status        = "completed"
}

# Anon role (pass anonKey as both apikey and bearer => anon Postgres role)
$e1 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $anonKey -FunctionName "create_operation_log" -Body $logBody
if (-not $e1.Ok) {
    Add-Result "anon cannot directly call create_operation_log" "PASS" "HTTP $($e1.StatusCode) -- access denied as expected"
} else {
    Add-Result "anon cannot directly call create_operation_log" "FAIL" "Call succeeded -- migration 119 REVOKE may not be applied"
}

# Authenticated role (technician JWT)
$e2 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "create_operation_log" -Body $logBody
if (-not $e2.Ok) {
    Add-Result "authenticated user cannot directly call create_operation_log" "PASS" "HTTP $($e2.StatusCode) -- access denied as expected"
} else {
    Add-Result "authenticated user cannot directly call create_operation_log" "FAIL" "Call succeeded -- migration 119 REVOKE may not be applied"
}

# =============================================================================
# Summary
# =============================================================================

Write-Host ""
Write-Host "=============================================================="
Write-Host "  Results"
Write-Host "=============================================================="
$script:results | Format-Table -Property Status, Name, Evidence -AutoSize -Wrap

$nPass = ($script:results | Where-Object { $_.Status -eq "PASS" }).Count
$nFail = ($script:results | Where-Object { $_.Status -eq "FAIL" }).Count
$nSkip = ($script:results | Where-Object { $_.Status -eq "SKIP" }).Count

Write-Host "  PASS: $nPass   FAIL: $nFail   SKIP: $nSkip"
Write-Host ""

if ($nFail -gt 0) {
    Write-Host "  Failures detected. Possible causes:"
    Write-Host "    - Migrations 119/120/121 not yet applied to the staging database."
    Write-Host "    - Fixture WO is in an unexpected state -- re-run prepare:staging-fixtures."
    Write-Host "    - JWT expired mid-run -- re-run prepare:staging-fixtures."
    Write-Error "Workflow authority smoke test FAILED ($nFail failure(s))"
    exit 1
}

if ($nSkip -gt 0) {
    Write-Host "  Some tests were skipped due to stale fixture state."
    Write-Host "  Re-run 'npm run prepare:staging-fixtures' for a full run."
    Write-Host ""
}

Write-Host "  Workflow authority smoke test PASSED"

<#
.SYNOPSIS
    Full reactive work-order lifecycle verification.

.DESCRIPTION
    Verifies the complete reactive work-order workflow against the staging database.

    Section F — Full reactive lifecycle with interleaved negative tests:
        F1-F2:   start_work_order (positive + wrong-status rejection)
        F3-F4:   complete_work_order_technician denied for reporter and cross-tenant actor
        F5:      Parts: cross-tenant part denied (inventoryB in Tenant A WO)
        F6:      Parts: insufficient stock denied
        F7-F9:   complete_work_order_technician with valid part, operation log, inventory decrement
        F10-F13: approve_work_order_supervisor denied + approved (settings-dependent; SKIPped if
                 tenant skips supervisor stage)
        F14-F17: approve_work_order_engineer denied + approved by dedicated engineer (settings-dependent; SKIPped if
                 tenant skips engineer stage)
        F18-F20: close_work_order denied for technician + reporter closes + operation log

    Section G — reject_work_order:
        G1: Empty reason rejected
        G2: Cross-tenant actor denied
        G3: Assigned technician rejects own WO, operation log written

    Required env vars (loaded from .env.staging-fixtures.local then .env.local):
        VITE_SUPABASE_URL          (or SUPABASE_URL)
        VITE_SUPABASE_ANON_KEY     (or SUPABASE_ANON_KEY)
        SUPABASE_SERVICE_ROLE_KEY
        RLS_REACTIVE_WO_ID
        RLS_REJECTABLE_WO_ID
        RLS_TENANT_A_TECHNICIAN_JWT
        RLS_TENANT_A_REPORTER_JWT
        RLS_TENANT_A_SUPERVISOR_JWT
        RLS_TENANT_A_ENGINEER_JWT
        RLS_TENANT_A_MANAGER_JWT
        RLS_TENANT_B_USER_JWT

    Fixture inventory IDs are deterministic constants defined in prepare-staging-fixtures.ts:
        inventoryA (Tenant A)  : 66666666-6666-4666-8666-666666666661  (qty 3, unit_cost 75)
        inventoryB (Tenant B)  : 66666666-6666-4666-8666-666666666662

    This script CONSUMES both fixture work orders (reactiveWo and rejectableWo).
    Re-run before the next execution:
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

function Get-WoStatus {
    param([string]$WoId, [string]$BaseUrl, [string]$ApiKey)
    $uri = "$BaseUrl/rest/v1/work_orders?id=eq.$WoId&select=status"
    $r   = Invoke-TableGet -Uri $uri -ApiKey $ApiKey -BearerToken $ApiKey
    if (-not $r.Ok -or $null -eq $r.Body) { return $null }
    $row = if ($r.Body -is [System.Array]) { $r.Body[0] } else { $r.Body }
    return $row.status
}

function Get-InventoryQty {
    param([string]$ItemId, [string]$BaseUrl, [string]$ApiKey)
    $uri = "$BaseUrl/rest/v1/inventory_items?id=eq.$ItemId&select=quantity"
    $r   = Invoke-TableGet -Uri $uri -ApiKey $ApiKey -BearerToken $ApiKey
    if (-not $r.Ok -or $null -eq $r.Body) { return -1 }
    $row = if ($r.Body -is [System.Array]) { $r.Body[0] } else { $r.Body }
    if ($null -eq $row) { return -1 }
    return [decimal]$row.quantity
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

Import-DotEnvFile -Path ".env.staging-fixtures.local"
Import-DotEnvFile -Path ".env.local"

$supaUrl      = (Get-RequiredEnv "Supabase URL"      @("SUPABASE_URL", "VITE_SUPABASE_URL")).TrimEnd("/")
$anonKey      = Get-RequiredEnv  "Supabase anon key" @("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
$svcKey       = Get-RequiredEnv  "Service role key"  @("SUPABASE_SERVICE_ROLE_KEY")
$reactiveWoId  = Get-RequiredEnv "Reactive WO id"    @("RLS_REACTIVE_WO_ID")
$rejectableWoId = Get-RequiredEnv "Rejectable WO id" @("RLS_REJECTABLE_WO_ID")
$techJwt      = Get-RequiredEnv  "Technician JWT"    @("RLS_TENANT_A_TECHNICIAN_JWT")
$reporterJwt  = Get-RequiredEnv  "Reporter JWT"      @("RLS_TENANT_A_REPORTER_JWT")
$supervisorJwt = Get-RequiredEnv "Supervisor JWT"    @("RLS_TENANT_A_SUPERVISOR_JWT")
$engineerJwt  = Get-RequiredEnv  "Engineer JWT"      @("RLS_TENANT_A_ENGINEER_JWT")
$managerJwt   = Get-RequiredEnv  "Manager JWT"       @("RLS_TENANT_A_MANAGER_JWT")
$tenantBJwt   = Get-RequiredEnv  "Tenant B JWT"      @("RLS_TENANT_B_USER_JWT")

# Deterministic fixture inventory IDs (defined in prepare-staging-fixtures.ts ids object)
$inventoryAId = "66666666-6666-4666-8666-666666666661"   # Tenant A air filter, qty 3
$inventoryBId = "66666666-6666-4666-8666-666666666662"   # Tenant B pump seal

Write-Host ""
Write-Host "=============================================================="
Write-Host "  Mutqan Full Workflow Verification"
Write-Host "  Validates complete reactive work-order lifecycle"
Write-Host "  against migrations 119, 120, 093 / 048 RPCs"
Write-Host "=============================================================="
Write-Host "  Supabase    : $supaUrl"
Write-Host "  Reactive WO : $reactiveWoId"
Write-Host "  Rejectable  : $rejectableWoId"
Write-Host "  Inventory A : $inventoryAId"
Write-Host ""

# =============================================================================
# JWT freshness
# =============================================================================

Write-Host "--- JWT freshness -------------------------------------------"
$jwtChecks = @(
    @{ Name = "technician";  Token = $techJwt }
    @{ Name = "reporter";    Token = $reporterJwt }
    @{ Name = "supervisor";  Token = $supervisorJwt }
    @{ Name = "engineer";    Token = $engineerJwt }
    @{ Name = "manager";     Token = $managerJwt }
    @{ Name = "tenant_b";    Token = $tenantBJwt }
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
    exit 1
}
Write-Host ""

# =============================================================================
# Read initial fixture WO states
# =============================================================================

$reactiveStatus   = Get-WoStatus -WoId $reactiveWoId   -BaseUrl $supaUrl -ApiKey $svcKey
$rejectableStatus = Get-WoStatus -WoId $rejectableWoId -BaseUrl $supaUrl -ApiKey $svcKey

if ($null -eq $reactiveStatus) {
    Write-Host "  ERROR: Cannot read reactive WO $reactiveWoId."
    Write-Host "  Run 'npm run prepare:staging-fixtures' first."
    exit 1
}
if ($null -eq $rejectableStatus) {
    Write-Host "  ERROR: Cannot read rejectable WO $rejectableWoId."
    Write-Host "  Run 'npm run prepare:staging-fixtures' first."
    exit 1
}

Write-Host "  Reactive WO status   : $reactiveStatus"
Write-Host "  Rejectable WO status : $rejectableStatus"
Write-Host ""

$legalStartStates  = @('assigned', 'in_progress', 'pending_supervisor_approval', 'pending_engineer_review', 'pending_reporter_closure')
$legalRejectStates = @('assigned')

# =============================================================================
# F -- Full reactive lifecycle
# =============================================================================

Write-Host "--- F: Full reactive lifecycle ------------------------------"

if ($reactiveStatus -notin $legalStartStates) {
    Add-Result "Reactive WO fixture state" "SKIP" "Status '$reactiveStatus' cannot be used. Re-run prepare:staging-fixtures."
} else {

    # ── F1-F2: start_work_order ────────────────────────────────────────────────

    if ($reactiveStatus -eq 'assigned') {
        $logsBefore = Get-OpLogCount -WorkOrderId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey

        $f1 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt `
            -FunctionName "start_work_order" -Body @{ p_work_order_id = $reactiveWoId }
        if ($f1.Ok) {
            Add-Result "F1: technician start_work_order succeeds on assigned WO" "PASS" ""
        } else {
            Add-Result "F1: technician start_work_order succeeds on assigned WO" "FAIL" "HTTP $($f1.StatusCode): $(Cap $f1.Error)"
        }

        $logsAfterStart = Get-OpLogCount -WorkOrderId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
        if ($logsAfterStart -gt $logsBefore) {
            Add-Result "F2: start_work_order wrote operation log" "PASS" "count $logsBefore => $logsAfterStart"
        } else {
            Add-Result "F2: start_work_order wrote operation log" "FAIL" "count unchanged at $logsAfterStart"
        }

        # Refresh status
        $reactiveStatus = Get-WoStatus -WoId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey
    } else {
        Add-Result "F1: start_work_order positive case" "SKIP" "WO already '$reactiveStatus' -- skipped. Re-run prepare:staging-fixtures."
        Add-Result "F2: start_work_order operation log"  "SKIP" "Skipped with F1."
    }

    # Wrong-status rejection — only valid when WO is now in_progress (start succeeded or was already in_progress)
    if ($reactiveStatus -eq 'in_progress') {
        $f3 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt `
            -FunctionName "start_work_order" -Body @{ p_work_order_id = $reactiveWoId }
        if (-not $f3.Ok) {
            Add-Result "F3: start_work_order rejected on in_progress WO (wrong status)" "PASS" "HTTP $($f3.StatusCode)"
        } else {
            Add-Result "F3: start_work_order rejected on in_progress WO (wrong status)" "FAIL" "start succeeded -- status guard not enforced"
        }
    } else {
        Add-Result "F3: start_work_order wrong-status check" "SKIP" "WO not in_progress ($reactiveStatus)"
    }

    # ── F4-F9: complete_work_order_technician ──────────────────────────────────

    if ($reactiveStatus -eq 'in_progress') {

        # F4: reporter denied
        $f4 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt `
            -FunctionName "complete_work_order_technician" `
            -Body @{ p_work_order_id = $reactiveWoId; p_technician_notes = "unauthorized attempt" }
        if (-not $f4.Ok) {
            Add-Result "F4: reporter denied by complete_work_order_technician (role check)" "PASS" "HTTP $($f4.StatusCode)"
        } else {
            Add-Result "F4: reporter denied by complete_work_order_technician (role check)" "FAIL" "RPC succeeded for reporter"
        }

        # F5: cross-tenant actor denied
        $f5 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $tenantBJwt `
            -FunctionName "complete_work_order_technician" `
            -Body @{ p_work_order_id = $reactiveWoId; p_technician_notes = "cross-tenant attempt" }
        if (-not $f5.Ok) {
            Add-Result "F5: tenant B actor denied by complete_work_order_technician (tenant isolation)" "PASS" "HTTP $($f5.StatusCode)"
        } else {
            Add-Result "F5: tenant B actor denied by complete_work_order_technician (tenant isolation)" "FAIL" "RPC succeeded for tenant B actor"
        }

        # F6: cross-tenant part blocked (inventoryB belongs to Tenant B)
        $f6 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt `
            -FunctionName "complete_work_order_technician" `
            -Body @{
                p_work_order_id   = $reactiveWoId
                p_technician_notes = "cross-tenant part attempt"
                p_parts            = @(@{ part_id = $inventoryBId; quantity = 1 })
            }
        if (-not $f6.Ok) {
            Add-Result "F6: cross-tenant part (inventoryB) blocked in Tenant A WO" "PASS" "HTTP $($f6.StatusCode)"
        } else {
            Add-Result "F6: cross-tenant part (inventoryB) blocked in Tenant A WO" "FAIL" "RPC accepted cross-tenant part"
        }

        # F7: insufficient stock blocked (inventoryA qty=3, request 99)
        $f7 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt `
            -FunctionName "complete_work_order_technician" `
            -Body @{
                p_work_order_id   = $reactiveWoId
                p_technician_notes = "insufficient stock attempt"
                p_parts            = @(@{ part_id = $inventoryAId; quantity = 99 })
            }
        if (-not $f7.Ok) {
            Add-Result "F7: insufficient stock (qty 99 > available) blocked" "PASS" "HTTP $($f7.StatusCode)"
        } else {
            Add-Result "F7: insufficient stock (qty 99 > available) blocked" "FAIL" "RPC accepted qty 99 -- stock check not enforced"
        }

        # F8: successful complete with valid part (qty=1 from inventoryA)
        $qtyBefore    = Get-InventoryQty -ItemId $inventoryAId -BaseUrl $supaUrl -ApiKey $svcKey
        $logsBefore   = Get-OpLogCount -WorkOrderId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey

        $f8 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt `
            -FunctionName "complete_work_order_technician" `
            -Body @{
                p_work_order_id   = $reactiveWoId
                p_technician_notes = "Full workflow smoke test -- technician completion"
                p_parts            = @(@{ part_id = $inventoryAId; quantity = 1 })
            }
        if ($f8.Ok) {
            Add-Result "F8: technician complete_work_order_technician with valid part succeeds" "PASS" ""
        } else {
            Add-Result "F8: technician complete_work_order_technician with valid part succeeds" "FAIL" "HTTP $($f8.StatusCode): $(Cap $f8.Error)"
        }

        # F9: operation log written
        $logsAfterComplete = Get-OpLogCount -WorkOrderId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
        if ($logsAfterComplete -gt $logsBefore) {
            Add-Result "F9: complete_work_order_technician wrote operation log" "PASS" "count $logsBefore => $logsAfterComplete"
        } else {
            Add-Result "F9: complete_work_order_technician wrote operation log" "FAIL" "count unchanged at $logsAfterComplete"
        }

        # F10: inventory quantity decremented
        if ($qtyBefore -ge 0) {
            $qtyAfter = Get-InventoryQty -ItemId $inventoryAId -BaseUrl $supaUrl -ApiKey $svcKey
            if ($qtyAfter -eq $qtyBefore - 1) {
                Add-Result "F10: inventoryA quantity decremented by 1" "PASS" "qty $qtyBefore => $qtyAfter"
            } else {
                Add-Result "F10: inventoryA quantity decremented by 1" "FAIL" "expected $($qtyBefore - 1), got $qtyAfter"
            }
        } else {
            Add-Result "F10: inventoryA quantity decremented" "SKIP" "Could not read inventory qty before complete"
        }

        # Refresh status for next stages
        $reactiveStatus = Get-WoStatus -WoId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey

    } elseif ($reactiveStatus -in @('pending_supervisor_approval', 'pending_engineer_review', 'pending_reporter_closure')) {
        foreach ($n in @("F4","F5","F6","F7","F8","F9","F10")) {
            Add-Result "${n}: complete_work_order_technician test" "SKIP" "WO already past in_progress ($reactiveStatus). Re-run prepare:staging-fixtures."
        }
    } else {
        foreach ($n in @("F4","F5","F6","F7","F8","F9","F10")) {
            Add-Result "${n}: complete_work_order_technician test" "SKIP" "WO not in_progress ($reactiveStatus)"
        }
    }

    # ── F11-F14: approve_work_order_supervisor (settings-dependent) ───────────

    Write-Host ""
    if ($reactiveStatus -eq 'pending_supervisor_approval') {

        # F11: technician denied
        $f11 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt `
            -FunctionName "approve_work_order_supervisor" `
            -Body @{ p_work_order_id = $reactiveWoId; p_notes = "unauthorized attempt" }
        if (-not $f11.Ok) {
            Add-Result "F11: technician denied by approve_work_order_supervisor (role check)" "PASS" "HTTP $($f11.StatusCode)"
        } else {
            Add-Result "F11: technician denied by approve_work_order_supervisor (role check)" "FAIL" "RPC succeeded for technician"
        }

        # F12: reporter denied
        $f12 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt `
            -FunctionName "approve_work_order_supervisor" `
            -Body @{ p_work_order_id = $reactiveWoId; p_notes = "unauthorized attempt" }
        if (-not $f12.Ok) {
            Add-Result "F12: reporter denied by approve_work_order_supervisor (role check)" "PASS" "HTTP $($f12.StatusCode)"
        } else {
            Add-Result "F12: reporter denied by approve_work_order_supervisor (role check)" "FAIL" "RPC succeeded for reporter"
        }

        # F13: supervisor approved
        $logsBefore = Get-OpLogCount -WorkOrderId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
        $f13 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $supervisorJwt `
            -FunctionName "approve_work_order_supervisor" `
            -Body @{ p_work_order_id = $reactiveWoId; p_notes = "Full workflow smoke test -- supervisor approval" }
        if ($f13.Ok) {
            Add-Result "F13: supervisor approve_work_order_supervisor succeeds" "PASS" ""
        } else {
            Add-Result "F13: supervisor approve_work_order_supervisor succeeds" "FAIL" "HTTP $($f13.StatusCode): $(Cap $f13.Error)"
        }

        # F14: operation log written
        $logsAfter = Get-OpLogCount -WorkOrderId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
        if ($logsAfter -gt $logsBefore) {
            Add-Result "F14: approve_work_order_supervisor wrote operation log" "PASS" "count $logsBefore => $logsAfter"
        } else {
            Add-Result "F14: approve_work_order_supervisor wrote operation log" "FAIL" "count unchanged at $logsAfter"
        }

        $reactiveStatus = Get-WoStatus -WoId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey

    } elseif ($reactiveStatus -in @('pending_engineer_review', 'pending_reporter_closure')) {
        foreach ($n in @("F11","F12","F13","F14")) {
            Add-Result "${n}: supervisor approval stage" "SKIP" "Tenant settings skipped supervisor stage (WO in '$reactiveStatus')"
        }
    } else {
        foreach ($n in @("F11","F12","F13","F14")) {
            Add-Result "${n}: supervisor approval stage" "SKIP" "WO not in pending_supervisor_approval ($reactiveStatus)"
        }
    }

    # ── F15-F18: approve_work_order_engineer (settings-dependent) ─────────────

    Write-Host ""
    if ($reactiveStatus -eq 'pending_engineer_review') {

        # F15: technician denied
        $f15 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt `
            -FunctionName "approve_work_order_engineer" `
            -Body @{ p_work_order_id = $reactiveWoId; p_notes = "unauthorized attempt" }
        if (-not $f15.Ok) {
            Add-Result "F15: technician denied by approve_work_order_engineer (role check)" "PASS" "HTTP $($f15.StatusCode)"
        } else {
            Add-Result "F15: technician denied by approve_work_order_engineer (role check)" "FAIL" "RPC succeeded for technician"
        }

        # F16: reporter denied
        $f16 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt `
            -FunctionName "approve_work_order_engineer" `
            -Body @{ p_work_order_id = $reactiveWoId; p_notes = "unauthorized attempt" }
        if (-not $f16.Ok) {
            Add-Result "F16: reporter denied by approve_work_order_engineer (role check)" "PASS" "HTTP $($f16.StatusCode)"
        } else {
            Add-Result "F16: reporter denied by approve_work_order_engineer (role check)" "FAIL" "RPC succeeded for reporter"
        }

        # F17: manager (maintenance_manager role — allowed as engineer override) approves
        $logsBefore = Get-OpLogCount -WorkOrderId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
        $f17 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $engineerJwt `
            -FunctionName "approve_work_order_engineer" `
            -Body @{ p_work_order_id = $reactiveWoId; p_notes = "Full workflow smoke test -- engineer review (dedicated engineer)" }
        if ($f17.Ok) {
            Add-Result "F17: dedicated engineer approve_work_order_engineer succeeds" "PASS" ""
        } else {
            Add-Result "F17: dedicated engineer approve_work_order_engineer succeeds" "FAIL" "HTTP $($f17.StatusCode): $(Cap $f17.Error)"
        }

        # F18: operation log written
        $logsAfter = Get-OpLogCount -WorkOrderId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
        if ($logsAfter -gt $logsBefore) {
            Add-Result "F18: approve_work_order_engineer wrote operation log" "PASS" "count $logsBefore => $logsAfter"
        } else {
            Add-Result "F18: approve_work_order_engineer wrote operation log" "FAIL" "count unchanged at $logsAfter"
        }

        $reactiveStatus = Get-WoStatus -WoId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey

    } elseif ($reactiveStatus -eq 'pending_reporter_closure') {
        foreach ($n in @("F15","F16","F17","F18")) {
            Add-Result "${n}: engineer review stage" "SKIP" "Tenant settings skipped engineer stage (WO in '$reactiveStatus')"
        }
    } else {
        foreach ($n in @("F15","F16","F17","F18")) {
            Add-Result "${n}: engineer review stage" "SKIP" "WO not in pending_engineer_review ($reactiveStatus)"
        }
    }

    # ── F19-F21: close_work_order ──────────────────────────────────────────────

    Write-Host ""
    if ($reactiveStatus -eq 'pending_reporter_closure') {

        # F19: technician denied (not reporter, not management)
        $f19 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt `
            -FunctionName "close_work_order" `
            -Body @{ p_work_order_id = $reactiveWoId; p_notes = "unauthorized close attempt" }
        if (-not $f19.Ok) {
            Add-Result "F19: technician denied by close_work_order (not reporter, not management)" "PASS" "HTTP $($f19.StatusCode)"
        } else {
            Add-Result "F19: technician denied by close_work_order (not reporter, not management)" "FAIL" "RPC succeeded for technician"
        }

        # F20: reporter closes (reported_by = reporter in fixture)
        $logsBefore = Get-OpLogCount -WorkOrderId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
        $f20 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt `
            -FunctionName "close_work_order" `
            -Body @{ p_work_order_id = $reactiveWoId; p_notes = "Full workflow smoke test -- reporter closure" }
        if ($f20.Ok) {
            Add-Result "F20: reporter close_work_order succeeds on pending_reporter_closure WO" "PASS" ""
        } else {
            Add-Result "F20: reporter close_work_order succeeds on pending_reporter_closure WO" "FAIL" "HTTP $($f20.StatusCode): $(Cap $f20.Error)"
        }

        # F21: operation log written
        $logsAfter = Get-OpLogCount -WorkOrderId $reactiveWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
        if ($logsAfter -gt $logsBefore) {
            Add-Result "F21: close_work_order wrote operation log" "PASS" "count $logsBefore => $logsAfter"
        } else {
            Add-Result "F21: close_work_order wrote operation log" "FAIL" "count unchanged at $logsAfter"
        }

    } else {
        foreach ($n in @("F19","F20","F21")) {
            Add-Result "${n}: close_work_order stage" "SKIP" "WO not in pending_reporter_closure ($reactiveStatus)"
        }
    }

}  # end $reactiveStatus in $legalStartStates

Write-Host ""
Write-Host "  NOTE: reactiveWo is now completed. Re-run prepare:staging-fixtures before next run."
Write-Host ""

# =============================================================================
# G -- reject_work_order
# =============================================================================

Write-Host "--- G: reject_work_order -----------------------------------"

if ($rejectableStatus -notin $legalRejectStates) {
    foreach ($n in @("G1","G2","G3","G4")) {
        Add-Result "${n}: reject_work_order test" "SKIP" "rejectableWo in '$rejectableStatus' -- expected 'assigned'. Re-run prepare:staging-fixtures."
    }
} else {

    # G1: empty reason rejected
    $g1 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt `
        -FunctionName "reject_work_order" `
        -Body @{ p_work_order_id = $rejectableWoId; p_reason = "" }
    if (-not $g1.Ok) {
        Add-Result "G1: reject_work_order with empty reason denied" "PASS" "HTTP $($g1.StatusCode)"
    } else {
        Add-Result "G1: reject_work_order with empty reason denied" "FAIL" "RPC accepted empty reason -- validation not enforced"
    }

    # G2: cross-tenant actor denied
    $g2 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $tenantBJwt `
        -FunctionName "reject_work_order" `
        -Body @{ p_work_order_id = $rejectableWoId; p_reason = "cross-tenant rejection attempt" }
    if (-not $g2.Ok) {
        Add-Result "G2: tenant B actor denied by reject_work_order (tenant isolation)" "PASS" "HTTP $($g2.StatusCode)"
    } else {
        Add-Result "G2: tenant B actor denied by reject_work_order (tenant isolation)" "FAIL" "RPC succeeded for cross-tenant actor"
    }

    # G3: assigned technician rejects own WO (assigned → pending, assigned_to cleared)
    $logsBefore = Get-OpLogCount -WorkOrderId $rejectableWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
    $g3 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt `
        -FunctionName "reject_work_order" `
        -Body @{ p_work_order_id = $rejectableWoId; p_reason = "Full workflow smoke test -- rejection verification" }
    if ($g3.Ok) {
        Add-Result "G3: assigned technician reject_work_order succeeds (assigned WO)" "PASS" ""
    } else {
        Add-Result "G3: assigned technician reject_work_order succeeds (assigned WO)" "FAIL" "HTTP $($g3.StatusCode): $(Cap $g3.Error)"
    }

    # G4: operation log written after reject
    $logsAfter = Get-OpLogCount -WorkOrderId $rejectableWoId -BaseUrl $supaUrl -ApiKey $svcKey -BearerToken $svcKey
    if ($logsAfter -gt $logsBefore) {
        Add-Result "G4: reject_work_order wrote operation log" "PASS" "count $logsBefore => $logsAfter"
    } else {
        Add-Result "G4: reject_work_order wrote operation log" "FAIL" "count unchanged at $logsAfter"
    }
}

Write-Host ""
Write-Host "  NOTE: rejectableWo is now in 'pending' state. Re-run prepare:staging-fixtures before next run."
Write-Host ""

# =============================================================================
# Summary
# =============================================================================

Write-Host "=============================================================="
Write-Host "  Results"
Write-Host "=============================================================="
$script:results | Format-Table -Property Status, Name, Evidence -AutoSize -Wrap

$nPass = ($script:results | Where-Object { $_.Status -eq "PASS" }).Count
$nFail = ($script:results | Where-Object { $_.Status -eq "FAIL" }).Count
$nSkip = ($script:results | Where-Object { $_.Status -eq "SKIP" }).Count

Write-Host "  PASS: $nPass   FAIL: $nFail   SKIP: $nSkip"
Write-Host ""

if ($nSkip -gt 0) {
    Write-Host "  SKIPped tests indicate the fixture WO was already past that stage,"
    Write-Host "  or tenant settings bypassed an approval stage. To get full PASS coverage:"
    Write-Host "    npm run prepare:staging-fixtures"
    Write-Host ""
}

if ($nFail -gt 0) {
    Write-Host "  Failures detected. Possible causes:"
    Write-Host "    - RPC migrations (093/120/121) not applied to the staging database."
    Write-Host "    - Fixture WO in unexpected state -- re-run prepare:staging-fixtures."
    Write-Host "    - JWT expired mid-run -- re-run prepare:staging-fixtures."
    Write-Host "    - Tenant settings differ from defaults (both approvals assumed TRUE)."
    Write-Error "Full workflow verification FAILED ($nFail failure(s))"
    exit 1
}

Write-Host "  Full workflow verification PASSED"

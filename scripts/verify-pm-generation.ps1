<#
.SYNOPSIS
    Verifies PM generation auditability: run_id, operation logs, pm_generation_runs, and tenant isolation.

.DESCRIPTION
    Requires prepared staging fixtures and these env vars:
      VITE_SUPABASE_URL or SUPABASE_URL
      VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY
      SUPABASE_SERVICE_ROLE_KEY
      RLS_TENANT_A_ID
      RLS_TENANT_B_ID
      RLS_TENANT_A_MANAGER_JWT
      RLS_TENANT_A_REPORTER_JWT
      RLS_TENANT_A_TECHNICIAN_JWT
      RLS_TENANT_B_USER_JWT
      RLS_TENANT_A_TECHNICIAN_USER_ID
      RLS_TENANT_A_INACTIVE_TECHNICIAN_USER_ID
      RLS_TENANT_A_TEAM_ID
      RLS_PM_GEN_SCHEDULE_ID
      RLS_PM_GEN_JOB_PLAN_ID
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
        $json = if ($Body) { $Body | ConvertTo-Json -Depth 20 } else { '{}' }
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
            } catch { $errorBody = $_.Exception.Message }
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
            } catch { $errorBody = $_.Exception.Message }
        }
        return @{ Ok = $false; StatusCode = $statusCode; Body = $null; Error = $errorBody }
    }
}

function Invoke-TablePatch {
    param([string]$Uri, [string]$ApiKey, [string]$BearerToken, [object]$Body)
    $headers = @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $BearerToken"
        "Content-Type"  = "application/json"
        "Accept"        = "application/json"
    }
    try {
        $json = $Body | ConvertTo-Json -Depth 20
        Invoke-RestMethod -Method Patch -Uri $Uri -Headers $headers -Body $json -TimeoutSec 30 | Out-Null
        return @{ Ok = $true; StatusCode = 204; Error = $null }
    } catch {
        $statusCode = 0
        $errorBody = $_.Exception.Message
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $statusCode = [int]$_.Exception.Response.StatusCode }
        return @{ Ok = $false; StatusCode = $statusCode; Error = $errorBody }
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

function Get-BodyCount {
    param($Body)
    if ($null -eq $Body) { return 0 }
    if ($Body -is [array]) { return $Body.Count }
    return 1
}

# PostgREST scalar JSONB functions may be returned wrapped in array; normalize.
function Get-RpcBody {
    param($Response)
    if ($Response.Body -is [array]) { return $Response.Body[0] }
    return $Response.Body
}

function Reset-GenSchedule {
    $today = Get-Date -Format "yyyy-MM-dd"
    $r = Invoke-TablePatch -Uri "$supaUrl/rest/v1/pm_schedules?id=eq.$scheduleGenId" -ApiKey $svcKey -BearerToken $svcKey -Body @{ next_due_date = $today; total_generated = 0 }
    if (-not $r.Ok) { throw "Failed to reset scheduleGen: $($r.Error)" }
}

function Get-GenWoCount {
    $uri = "$supaUrl/rest/v1/work_orders?source_schedule_id=eq.$scheduleGenId" + "&status=neq.cancelled&select=id"
    $r = Invoke-TableGet -Uri $uri -ApiKey $svcKey -BearerToken $svcKey
    if ($r.Ok) { return $r.Body.Count } else { return 0 }
}

function Remove-GenWorkOrders {
    $uri = "$supaUrl/rest/v1/work_orders?source_schedule_id=eq.$scheduleGenId" + "&select=id"
    $wos = Invoke-TableGet -Uri $uri -ApiKey $svcKey -BearerToken $svcKey
    if ($wos.Ok -and $wos.Body.Count -gt 0) {
        $woIdList = ($wos.Body | ForEach-Object { '"' + $_.id + '"' }) -join ","
        Invoke-TableDelete -Uri "$supaUrl/rest/v1/operation_logs?work_order_id=in.($woIdList)" -ApiKey $svcKey
        Invoke-TableDelete -Uri "$supaUrl/rest/v1/work_orders?id=in.($woIdList)" -ApiKey $svcKey
    }
}

function Remove-CreatedWorkOrders {
    if ($script:createdWorkOrderIds.Count -eq 0) { return }
    $woIdList = ($script:createdWorkOrderIds | ForEach-Object { '"' + $_ + '"' }) -join ","
    foreach ($woId in $script:createdWorkOrderIds) {
        Invoke-TableDelete -Uri "$supaUrl/rest/v1/notifications?link=eq.%2Fwork-orders%2F$woId" -ApiKey $svcKey
    }
    Invoke-TableDelete -Uri "$supaUrl/rest/v1/operation_logs?work_order_id=in.($woIdList)" -ApiKey $svcKey
    Invoke-TableDelete -Uri "$supaUrl/rest/v1/work_orders?id=in.($woIdList)" -ApiKey $svcKey
}

function Get-NotificationsForWorkOrder {
    param([string]$WorkOrderId)
    return Invoke-TableGet -Uri "$supaUrl/rest/v1/notifications?link=eq.%2Fwork-orders%2F$WorkOrderId&select=id,tenant_id,user_id,type,metadata" -ApiKey $svcKey -BearerToken $svcKey
}

# --- Load environment --------------------------------------------------------

Import-DotEnvFile ".env.staging-fixtures.local"
Import-DotEnvFile ".env.local"

$supaUrl       = (Get-RequiredEnv "Supabase URL" @("VITE_SUPABASE_URL", "SUPABASE_URL")).TrimEnd("/")
$anonKey       = Get-RequiredEnv "Supabase anon key" @("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY")
$svcKey        = Get-RequiredEnv "Supabase service key" @("SUPABASE_SERVICE_ROLE_KEY")
$tenantAId     = Get-RequiredEnv "Tenant A id" @("RLS_TENANT_A_ID")
$tenantBId     = Get-RequiredEnv "Tenant B id" @("RLS_TENANT_B_ID")
$managerJwt    = Get-RequiredEnv "Tenant A manager JWT" @("RLS_TENANT_A_MANAGER_JWT")
$reporterJwt   = Get-RequiredEnv "Tenant A reporter JWT" @("RLS_TENANT_A_REPORTER_JWT")
$techJwt       = Get-RequiredEnv "Tenant A technician JWT" @("RLS_TENANT_A_TECHNICIAN_JWT")
$tenantBJwt    = Get-RequiredEnv "Tenant B user JWT" @("RLS_TENANT_B_USER_JWT")
$technicianId  = Get-RequiredEnv "Tenant A technician user id" @("RLS_TENANT_A_TECHNICIAN_USER_ID")
$inactiveTechnicianId = Get-RequiredEnv "Tenant A inactive technician user id" @("RLS_TENANT_A_INACTIVE_TECHNICIAN_USER_ID")
$teamAId       = Get-RequiredEnv "Tenant A team id" @("RLS_TENANT_A_TEAM_ID")
$scheduleGenId = Get-RequiredEnv "PM gen schedule id" @("RLS_PM_GEN_SCHEDULE_ID")
$jobPlanGenId  = Get-RequiredEnv "PM gen job plan id" @("RLS_PM_GEN_JOB_PLAN_ID")

# --- Setup: verify fixtures and reset schedule -------------------------------

Write-Host "--- pm_generate_due_work_orders auditability -------------------"
Write-Host ""
Write-Host "  Setup: verifying fixture data..."

$scheduleRow = Invoke-TableGet -Uri "$supaUrl/rest/v1/pm_schedules?id=eq.$scheduleGenId&select=id,code,tenant_id,default_team_id&limit=1" -ApiKey $svcKey -BearerToken $svcKey
if (-not $scheduleRow.Ok -or $scheduleRow.Body.Count -eq 0) {
    throw "Fixture schedule not found (id=$scheduleGenId). Run npm run prepare:staging-fixtures first."
}

if ($null -eq $scheduleRow.Body[0].default_team_id) {
    Add-Result "fixture PM generation schedule has null default_team_id" "PASS" "schedule=$scheduleGenId"
} else {
    Add-Result "fixture PM generation schedule has null default_team_id" "FAIL" "default_team_id=$($scheduleRow.Body[0].default_team_id)"
}

$jobPlanRow = Invoke-TableGet -Uri "$supaUrl/rest/v1/job_plan_items?job_plan_id=eq.$jobPlanGenId&select=id,item_type&order=sort_order" -ApiKey $svcKey -BearerToken $svcKey
if (-not $jobPlanRow.Ok -or $jobPlanRow.Body.Count -eq 0) {
    throw "Fixture job plan items not found (job_plan_id=$jobPlanGenId). Run npm run prepare:staging-fixtures first."
}

Remove-GenWorkOrders
Reset-GenSchedule

$today = Get-Date -Format "yyyy-MM-dd"

# --- Section A: Tenant-scoped generation -------------------------------------

Write-Host ""
Write-Host "  Section A: Tenant-scoped generation"

$genResult = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "pm_generate_due_work_orders" -Body $null
$rpc = Get-RpcBody -Response $genResult

if ($genResult.Ok -and $rpc.success -eq $true) {
    Add-Result "maintenance_manager can call pm_generate_due_work_orders" "PASS" "generated=$($rpc.generated)"
} else {
    Add-Result "maintenance_manager can call pm_generate_due_work_orders" "FAIL" "HTTP $($genResult.StatusCode): $($genResult.Error) | success=$($rpc.success) err=$($rpc.error)"
}

if ($genResult.Ok -and -not [string]::IsNullOrWhiteSpace($rpc.run_id)) {
    Add-Result "response includes run_id (migration 127 additive return)" "PASS" "run_id=$($rpc.run_id)"
} else {
    Add-Result "response includes run_id (migration 127 additive return)" "FAIL" "run_id missing in response"
}

$dbRunId = $rpc.run_id

$genWoUri = "$supaUrl/rest/v1/work_orders?source_schedule_id=eq.$scheduleGenId" + "&status=neq.cancelled&select=id,tenant_id,job_plan_id,scheduled_date,assigned_to,assigned_team&limit=10"
$genWos = Invoke-TableGet -Uri $genWoUri -ApiKey $svcKey -BearerToken $svcKey
if ($genWos.Ok -and $genWos.Body.Count -ge 1) {
    Add-Result "pm_generate_due_work_orders creates WO for due schedule" "PASS" "count=$($genWos.Body.Count)"
} else {
    Add-Result "pm_generate_due_work_orders creates WO for due schedule" "FAIL" "No WO found for scheduleGen after generate"
}

$genWo = if ($genWos.Ok -and $genWos.Body.Count -ge 1) { $genWos.Body[0] } else { $null }
$genWoId = if ($genWo) { $genWo.id } else { $null }

if ($genWo -and $genWo.tenant_id -eq $tenantAId -and $genWo.job_plan_id -eq $jobPlanGenId -and $genWo.scheduled_date -eq $today) {
    Add-Result "generated WO has correct tenant, job_plan, and scheduled_date" "PASS" "scheduled_date=$($genWo.scheduled_date)"
} else {
    Add-Result "generated WO has correct tenant, job_plan, and scheduled_date" "FAIL" "tenant=$($genWo.tenant_id) plan=$($genWo.job_plan_id) date=$($genWo.scheduled_date)"
}

if ($genWo -and $genWo.assigned_to -eq $technicianId) {
    Add-Result "generated WO assigned to validated default assignee" "PASS" "assigned_to=$($genWo.assigned_to)"
} else {
    Add-Result "generated WO assigned to validated default assignee" "FAIL" "assigned_to=$($genWo.assigned_to) expected=$technicianId"
}

if ($genWo -and $null -eq $genWo.assigned_team) {
    Add-Result "generated WO keeps assigned_team null" "PASS"
} else {
    Add-Result "generated WO keeps assigned_team null" "FAIL" "assigned_team=$($genWo.assigned_team)"
}

if ($genWoId) {
    $pmNotifications = Get-NotificationsForWorkOrder -WorkOrderId $genWoId
    if ($pmNotifications.Ok -and (Get-BodyCount $pmNotifications.Body) -eq 0) {
        Add-Result "PM generation with null assigned_team creates no team notifications" "PASS"
    } else {
        Add-Result "PM generation with null assigned_team creates no team notifications" "FAIL" "notification_count=$(Get-BodyCount $pmNotifications.Body)"
    }
}

if ($genWoId) {
    $checks = Invoke-TableGet -Uri "$supaUrl/rest/v1/work_order_checks?work_order_id=eq.$genWoId&select=id,item_snapshot" -ApiKey $svcKey -BearerToken $svcKey
    $headerItems = @($jobPlanRow.Body | Where-Object { $_.item_type -eq 'header' }).Count
    $checkItems  = @($jobPlanRow.Body | Where-Object { $_.item_type -ne 'header' }).Count
    if ($checks.Ok -and $checks.Body.Count -eq $checkItems) {
        Add-Result "work_order_checks created for non-header items only" "PASS" "checks=$($checks.Body.Count) headers_skipped=$headerItems"
    } else {
        Add-Result "work_order_checks created for non-header items only" "FAIL" "checks=$($checks.Body.Count) expected=$checkItems"
    }

    $opLog = Invoke-TableGet -Uri "$supaUrl/rest/v1/operation_logs?work_order_id=eq.$genWoId&type=eq.pm_generate&select=id,description" -ApiKey $svcKey -BearerToken $svcKey
    if ($opLog.Ok -and $opLog.Body.Count -ge 1) {
        Add-Result "operation_log written per generated WO (type=pm_generate)" "PASS" "log_id=$($opLog.Body[0].id)"
    } else {
        Add-Result "operation_log written per generated WO (type=pm_generate)" "FAIL" "No pm_generate log found for wo=$genWoId"
    }
}

if (-not [string]::IsNullOrWhiteSpace($dbRunId)) {
    $pgrUri = "$supaUrl/rest/v1/pm_generation_runs?run_id=eq.$dbRunId" + "&select=id,run_id,tenant_id,generated_count,status,run_scope"
    $pgr = Invoke-TableGet -Uri $pgrUri -ApiKey $anonKey -BearerToken $managerJwt
    if ($pgr.Ok -and $pgr.Body.Count -ge 1) {
        $pgrRow = $pgr.Body[0]
        Add-Result "pm_generation_runs row created for this run" "PASS" "id=$($pgrRow.id)"
        if ($pgrRow.tenant_id -eq $tenantAId) {
            Add-Result "pm_generation_runs.tenant_id is Tenant A (tenant-scoped run)" "PASS"
        } else {
            Add-Result "pm_generation_runs.tenant_id is Tenant A (tenant-scoped run)" "FAIL" "tenant_id=$($pgrRow.tenant_id)"
        }
        if ($pgrRow.generated_count -ge 1) {
            Add-Result "pm_generation_runs.generated_count >= 1" "PASS" "count=$($pgrRow.generated_count)"
        } else {
            Add-Result "pm_generation_runs.generated_count >= 1" "FAIL" "count=$($pgrRow.generated_count)"
        }
        if ($pgrRow.status -eq "completed") {
            Add-Result "pm_generation_runs.status = completed" "PASS"
        } else {
            Add-Result "pm_generation_runs.status = completed" "FAIL" "status=$($pgrRow.status)"
        }
        if ($pgrRow.run_scope -eq "tenant") {
            Add-Result "pm_generation_runs.run_scope = tenant for authenticated caller" "PASS"
        } else {
            Add-Result "pm_generation_runs.run_scope = tenant for authenticated caller" "FAIL" "run_scope=$($pgrRow.run_scope)"
        }
    } else {
        Add-Result "pm_generation_runs row created for this run" "FAIL" "run_id=$dbRunId HTTP=$($pgr.StatusCode) $($pgr.Error)"
    }
} else {
    Add-Result "pm_generation_runs check" "SKIP" "run_id not returned in response - skipping runs table checks"
}

# --- Section B: Idempotency --------------------------------------------------

Write-Host ""
Write-Host "  Section B: Idempotency"

Reset-GenSchedule

$countBefore = Get-GenWoCount

$gen2 = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $managerJwt -FunctionName "pm_generate_due_work_orders" -Body $null
$rpc2 = Get-RpcBody -Response $gen2

$countAfter = Get-GenWoCount

if ($gen2.Ok -and $rpc2.success -eq $true -and $countAfter -eq $countBefore) {
    Add-Result "second generate call does not duplicate WO (idempotency)" "PASS" "WO count before=$countBefore after=$countAfter"
} else {
    Add-Result "second generate call does not duplicate WO (idempotency)" "FAIL" "WO count before=$countBefore after=$countAfter success=$($rpc2.success)"
}

# --- Section C: Cross-tenant isolation ---------------------------------------

Write-Host ""
Write-Host "  Section C: Cross-tenant isolation"

Remove-GenWorkOrders
Reset-GenSchedule

$countBeforeTenantB = Get-GenWoCount

$genTenantB = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $tenantBJwt -FunctionName "pm_generate_due_work_orders" -Body $null
$rpcB = Get-RpcBody -Response $genTenantB

$countAfterTenantB = Get-GenWoCount

if ($genTenantB.Ok -and $rpcB.success -eq $true -and $countAfterTenantB -eq $countBeforeTenantB) {
    Add-Result "Tenant B user cannot generate Tenant A work orders" "PASS" "Tenant A WO count unchanged ($countBeforeTenantB)"
} else {
    Add-Result "Tenant B user cannot generate Tenant A work orders" "FAIL" "WO count before=$countBeforeTenantB after=$countAfterTenantB ok=$($genTenantB.Ok)"
}

if ($genTenantB.Ok -and $rpcB.success -eq $true) {
    $pgrBUri = "$supaUrl/rest/v1/pm_generation_runs?tenant_id=eq.$tenantAId" + "&select=id&limit=50"
    $pgrTenantBForA = Invoke-TableGet -Uri $pgrBUri -ApiKey $anonKey -BearerToken $tenantBJwt
    $tenantBSeesA = $pgrTenantBForA.Ok -and $pgrTenantBForA.Body.Count -gt 0
    if (-not $tenantBSeesA) {
        Add-Result "Tenant B user cannot read Tenant A pm_generation_runs (RLS)" "PASS" "0 rows returned"
    } else {
        Add-Result "Tenant B user cannot read Tenant A pm_generation_runs (RLS)" "FAIL" "Tenant B can see $($pgrTenantBForA.Body.Count) Tenant A run(s)"
    }
}

# --- Section D: Role denial --------------------------------------------------

Write-Host ""
Write-Host "  Section D: Role denial"

$genReporter = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "pm_generate_due_work_orders" -Body $null
$rpcReporter = Get-RpcBody -Response $genReporter
if ($genReporter.Ok -and $rpcReporter.success -eq $false) {
    Add-Result "reporter denied pm_generate_due_work_orders" "PASS" "error=$($rpcReporter.error)"
} elseif (-not $genReporter.Ok) {
    Add-Result "reporter denied pm_generate_due_work_orders" "PASS" "HTTP $($genReporter.StatusCode)"
} else {
    Add-Result "reporter denied pm_generate_due_work_orders" "FAIL" "success=$($rpcReporter.success) expected false"
}

$genTech = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $techJwt -FunctionName "pm_generate_due_work_orders" -Body $null
$rpcTech = Get-RpcBody -Response $genTech
if ($genTech.Ok -and $rpcTech.success -eq $false) {
    Add-Result "technician denied pm_generate_due_work_orders" "PASS" "error=$($rpcTech.error)"
} elseif (-not $genTech.Ok) {
    Add-Result "technician denied pm_generate_due_work_orders" "PASS" "HTTP $($genTech.StatusCode)"
} else {
    Add-Result "technician denied pm_generate_due_work_orders" "FAIL" "success=$($rpcTech.success) expected false"
}

# --- Section E: Work-order insert notification trigger safety ----------------

Write-Host ""
Write-Host "  Section E: Work-order notification trigger safety"

$assetA = Invoke-TableGet -Uri "$supaUrl/rest/v1/assets?code=eq.FX-A-AHU-01&select=id,tenant_id,building_id&limit=1" -ApiKey $svcKey -BearerToken $svcKey
if (-not $assetA.Ok -or $assetA.Body.Count -eq 0) {
    Add-Result "fixture asset available for create_work_order notification probe" "FAIL" "FX-A-AHU-01 not found"
} else {
    Add-Result "fixture asset available for create_work_order notification probe" "PASS"

    $suffix = Get-Date -Format "yyMMddHHmmss"
    $createNoTeam = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "create_work_order" -Body @{
        p_work_order = @{
            code        = "FX-NOTE-NOTEAM-$suffix"
            title       = "Notification trigger no-team smoke test"
            description = "Verifies notify_team_on_new_work_order no-op when assigned_team is null"
            priority    = "medium"
            building_id = $assetA.Body[0].building_id
            asset_id    = $assetA.Body[0].id
            due_date    = (Get-Date).AddDays(2).ToString("o")
        }
    }

    if ($createNoTeam.Ok -and $createNoTeam.Body.id) {
        $script:createdWorkOrderIds.Add($createNoTeam.Body.id) | Out-Null
        Add-Result "create_work_order succeeds with assigned_team null and inactive technician present" "PASS" "id=$($createNoTeam.Body.id)"

        $noTeamNotifications = Get-NotificationsForWorkOrder -WorkOrderId $createNoTeam.Body.id
        if ($noTeamNotifications.Ok -and (Get-BodyCount $noTeamNotifications.Body) -eq 0) {
            Add-Result "assigned_team null create creates no broad team notifications" "PASS"
        } else {
            Add-Result "assigned_team null create creates no broad team notifications" "FAIL" "notification_count=$(Get-BodyCount $noTeamNotifications.Body)"
        }
    } else {
        Add-Result "create_work_order succeeds with assigned_team null and inactive technician present" "FAIL" "HTTP $($createNoTeam.StatusCode): $($createNoTeam.Error)"
    }

    $createTeam = Invoke-Rpc -BaseUrl $supaUrl -ApiKey $anonKey -BearerToken $reporterJwt -FunctionName "create_work_order" -Body @{
        p_work_order = @{
            code          = "FX-NOTE-TEAM-$suffix"
            title         = "Notification trigger team smoke test"
            description   = "Verifies notify_team_on_new_work_order only notifies active same-tenant team members"
            priority      = "medium"
            building_id   = $assetA.Body[0].building_id
            asset_id      = $assetA.Body[0].id
            assigned_team = $teamAId
            due_date      = (Get-Date).AddDays(2).ToString("o")
        }
    }

    if ($createTeam.Ok -and $createTeam.Body.id) {
        $script:createdWorkOrderIds.Add($createTeam.Body.id) | Out-Null
        Add-Result "create_work_order with assigned_team still succeeds" "PASS" "id=$($createTeam.Body.id)"

        $teamNotifications = Get-NotificationsForWorkOrder -WorkOrderId $createTeam.Body.id
        $teamNotificationCount = Get-BodyCount $teamNotifications.Body
        if ($teamNotifications.Ok -and $teamNotificationCount -ge 1) {
            Add-Result "assigned_team create notifies active team members" "PASS" "notification_count=$teamNotificationCount"
        } else {
            Add-Result "assigned_team create notifies active team members" "FAIL" "notification_count=$teamNotificationCount"
        }

        $teamNotificationRows = if ($teamNotifications.Body -is [array]) { $teamNotifications.Body } elseif ($null -ne $teamNotifications.Body) { @($teamNotifications.Body) } else { @() }
        $inactiveNotified = @($teamNotificationRows | Where-Object { $_.user_id -eq $inactiveTechnicianId }).Count -gt 0
        $crossTenantNotified = @($teamNotificationRows | Where-Object { $_.tenant_id -ne $tenantAId }).Count -gt 0

        if (-not $inactiveNotified) {
            Add-Result "inactive team member is not notified" "PASS"
        } else {
            Add-Result "inactive team member is not notified" "FAIL" "inactive_user=$inactiveTechnicianId"
        }

        if (-not $crossTenantNotified) {
            Add-Result "no cross-tenant notifications are created" "PASS"
        } else {
            Add-Result "no cross-tenant notifications are created" "FAIL"
        }
    } else {
        Add-Result "create_work_order with assigned_team still succeeds" "FAIL" "HTTP $($createTeam.StatusCode): $($createTeam.Error)"
    }
}

# --- Cleanup -----------------------------------------------------------------

Remove-GenWorkOrders
Remove-CreatedWorkOrders
Invoke-TableDelete -Uri "$supaUrl/rest/v1/pm_generation_runs?tenant_id=eq.$tenantAId" -ApiKey $svcKey
Reset-GenSchedule

# --- Summary -----------------------------------------------------------------

Write-Host ""
Write-Host "--- Summary ------------------------------------------------"
$script:results | Format-Table -AutoSize

if ($script:anyFail) { exit 1 }
exit 0
